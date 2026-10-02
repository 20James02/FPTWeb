BEGIN;
ALTER TABLE private.memberships ADD COLUMN display_name text NOT NULL DEFAULT '' CHECK(length(display_name)<=100);
CREATE TABLE private.saved_lead_views(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,version integer NOT NULL DEFAULT 1,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.saved_lead_views ENABLE ROW LEVEL SECURITY;
CREATE INDEX saved_lead_views_owner_idx ON private.saved_lead_views(owner_id);
GRANT ALL ON private.saved_lead_views TO service_role;
CREATE TABLE private.operational_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), version integer NOT NULL DEFAULT 0,
 payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.operational_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.operational_settings TO service_role;
CREATE FUNCTION private.operational_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"sla_minutes":10,"sound_alert":true,"shift":{"weekdays":[0,1,2,3,4,5],"start":"08:00:00","end":"18:00:00"}}'::jsonb
$$;
CREATE FUNCTION private.business_sla(start_at timestamptz, config jsonb) RETURNS timestamptz LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cursor_at timestamp:=start_at AT TIME ZONE 'Asia/Ho_Chi_Minh'; opening timestamp; closing timestamp;
 remaining interval:=make_interval(mins=>coalesce((config->>'sla_minutes')::int,10)); days jsonb:=config->'shift'->'weekdays';
BEGIN
 FOR i IN 1..370 LOOP
  opening:=cursor_at::date+(config->'shift'->>'start')::time;
  closing:=cursor_at::date+(config->'shift'->>'end')::time;
  IF days @> jsonb_build_array((extract(isodow FROM cursor_at)::int+6)%7) AND cursor_at<closing THEN
   cursor_at:=greatest(cursor_at,opening);
   IF closing-cursor_at>=remaining THEN RETURN (cursor_at+remaining) AT TIME ZONE 'Asia/Ho_Chi_Minh'; END IF;
   remaining:=remaining-(closing-cursor_at);
  END IF;
  cursor_at:=(cursor_at::date+1)::timestamp;
 END LOOP;
 RAISE EXCEPTION 'Invalid working calendar';
END $$;
ALTER FUNCTION api.submit_lead(jsonb) RENAME TO submit_lead_before_admin_quality;
CREATE FUNCTION api.submit_lead(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE config jsonb;
BEGIN
 SELECT payload INTO config FROM private.operational_settings WHERE id;
 config:=coalesce(config,private.operational_defaults());
 RETURN api.submit_lead_before_admin_quality(command||jsonb_build_object('sla_due_at',private.business_sla(now(),config)));
END $$;
CREATE OR REPLACE FUNCTION private.lead_safe(l private.leads) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(l)-'pii_ciphertext'-'contact_id'-'receipt'-'click_id_ciphertext'-'click_id_expires_at'||jsonb_build_object('payload',l.payload-'ip_ciphertext',
 'labels',jsonb_build_object('plan',(SELECT coalesce(r.published_payload->>'name',r.payload->>'name') FROM private.resources r WHERE r.id=nullif(l.payload->>'plan_id','')::uuid AND kind='plan'),
 'region',(SELECT coalesce(r.published_payload->>'name',r.payload->>'name') FROM private.resources r WHERE r.id=nullif(l.payload->>'region_id','')::uuid AND kind='region'),
 'assignee',(SELECT nullif(display_name,'') FROM private.memberships WHERE user_id=l.assignee_id AND branch_id=l.assignment_branch_id)))
$$;
CREATE INDEX leads_branch_created_admin_idx ON private.leads(branch_id,created_at DESC,id DESC);
CREATE INDEX leads_assignee_created_admin_idx ON private.leads(assignee_id,created_at DESC,id DESC);
CREATE FUNCTION private.manual_assignment(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=(c->>'actor')::uuid; l private.leads; m private.memberships;
BEGIN
 PERFORM private.lock_contact_command(c);
 SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF NOT private.can_read_lead(actor,l,'lead.write') OR NOT private.permitted(actor,'lead.assign',coalesce(l.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF l.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 IF l.status NOT IN ('new','assigned') THEN RETURN jsonb_build_object('error','INVALID_TRANSITION','status',409); END IF;
 PERFORM pg_advisory_xact_lock(6371932);
 SELECT * INTO m FROM private.memberships mm WHERE user_id=(c->>'assignee_id')::uuid AND active AND ('lead.write'=ANY(permissions) OR '*'=ANY(permissions))
  AND (branch_id=l.branch_id OR branch_id='00000000-0000-0000-0000-000000000000') AND private.on_shift(mm.shift,now())
  AND (active_leads<capacity OR (l.assignee_id=mm.user_id AND l.assignment_branch_id=mm.branch_id)) ORDER BY (branch_id=l.branch_id) DESC,branch_id LIMIT 1 FOR UPDATE;
 IF m.user_id IS NULL THEN RETURN jsonb_build_object('error','ASSIGNEE_UNAVAILABLE','status',409); END IF;
 IF l.assignee_id IS NOT NULL THEN UPDATE private.memberships SET active_leads=greatest(0,active_leads-1) WHERE user_id=l.assignee_id AND branch_id=l.assignment_branch_id; END IF;
 UPDATE private.memberships SET active_leads=active_leads+1,last_assigned_at=now() WHERE user_id=m.user_id AND branch_id=m.branch_id;
 UPDATE private.leads SET assignee_id=m.user_id,assignment_branch_id=m.branch_id,status='assigned',version=version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
 INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'lead.assign');
 RETURN private.lead_safe(l);
END $$;
CREATE FUNCTION private.bulk_assignment(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; r jsonb; rows jsonb:='[]'; failure jsonb; contact_key text;
BEGIN
 IF jsonb_array_length(c->'items') NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('error','INVALID_BATCH','status',422); END IF;
 -- Acquire all contact gates in one global order before locking any lead.
 FOR contact_key IN SELECT DISTINCT contacts.phone_hmac FROM private.contacts contacts JOIN private.leads l ON l.contact_id=contacts.id
  WHERE l.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(c->'items')) ORDER BY contacts.phone_hmac LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(contact_key,6371934));
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(c->'items') ORDER BY value->>'id' LOOP
  r:=private.manual_assignment(c||item);
  IF r ? 'error' THEN failure:=r;RAISE EXCEPTION 'Rollback assignments' USING ERRCODE='P0001'; END IF;
  rows:=rows||jsonb_build_array(r);
 END LOOP;
 RETURN jsonb_build_object('items',rows,'assigned',jsonb_array_length(rows));
EXCEPTION WHEN SQLSTATE 'P0001' THEN RETURN failure;
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_admin_quality;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c jsonb:=command; op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; r jsonb; settings private.operational_settings;
 permission text; kind text:=c->>'kind'; d date; global_id uuid:='00000000-0000-0000-0000-000000000000'; data jsonb:=c->'payload';
BEGIN
 IF op IN ('lead_view_list','lead_view_save','lead_view_delete') THEN
  IF NOT private.permitted(actor,'lead.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='lead_view_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(v)-'owner_id' ORDER BY v.updated_at DESC) FROM private.saved_lead_views v WHERE owner_id=actor),'[]')); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,6371941));
  IF c->>'id' IS NULL THEN
   IF (c->>'expected_version')::int<>0 THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
   IF (SELECT count(*) FROM private.saved_lead_views WHERE owner_id=actor)>=50 THEN RETURN jsonb_build_object('error','VIEW_LIMIT_REACHED','status',409); END IF;
   INSERT INTO private.saved_lead_views(owner_id,payload) VALUES(actor,data) RETURNING to_jsonb(saved_lead_views)-'owner_id' INTO r;
  ELSE
   SELECT to_jsonb(v)-'owner_id' INTO r FROM private.saved_lead_views v WHERE id=(c->>'id')::uuid AND owner_id=actor FOR UPDATE;
   IF r IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
   IF (r->>'version')::int<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
   IF op='lead_view_delete' THEN DELETE FROM private.saved_lead_views WHERE id=(c->>'id')::uuid AND owner_id=actor;RETURN '{"deleted":true}'; END IF;
   UPDATE private.saved_lead_views SET payload=data,version=version+1,updated_at=now() WHERE id=(c->>'id')::uuid AND owner_id=actor RETURNING to_jsonb(saved_lead_views)-'owner_id' INTO r;
  END IF;
  RETURN r;
 END IF;
 IF kind='cost' AND op IN ('resource_save','resource_update') THEN
  SELECT to_jsonb(rr) INTO r FROM private.resources rr WHERE id=(data->>'campaign_id')::uuid AND rr.kind='campaign' AND status<>'retired';
  IF r IS NULL THEN RETURN jsonb_build_object('error','INVALID_CAMPAIGN','status',422); END IF;
  IF NOT private.permitted(actor,'marketing.write',coalesce((r->>'branch_id')::uuid,global_id)) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='resource_update' AND EXISTS(SELECT 1 FROM private.resources rr WHERE id=(c->>'id')::uuid AND rr.kind='cost' AND coalesce(rr.branch_id,global_id) IS DISTINCT FROM coalesce((r->>'branch_id')::uuid,global_id)) THEN RETURN jsonb_build_object('error','IMMUTABLE_SCOPE','status',409); END IF;
  c:=c||jsonb_build_object('branch_id',r->'branch_id');
 END IF;

 IF op='lead_counts' THEN
  IF NOT private.permitted(actor,'lead.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT jsonb_build_object('new',count(*) FILTER(WHERE status='new'),'total',count(*),'checked_at',now()) INTO r FROM private.leads l WHERE private.can_read_lead(actor,l);
  RETURN r;
 END IF;
 IF op='manual_assign' THEN RETURN private.manual_assignment(c); END IF;
 IF op='bulk_assign' THEN RETURN private.bulk_assignment(c); END IF;
 IF op='assignees' THEN
  IF NOT private.permitted(actor,'lead.assign') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(m)-'permissions') FROM private.memberships m WHERE active AND ('lead.write'=ANY(permissions) OR '*'=ANY(permissions)) AND private.permitted(actor,'lead.assign',m.branch_id)), '[]'));
 END IF;
 IF op IN ('operational_settings_read','operational_settings_save') THEN
  IF NOT private.permitted(actor,CASE WHEN op='operational_settings_save' THEN 'workflow.manage' ELSE 'lead.read' END,global_id)
    AND NOT (op='operational_settings_read' AND (private.permitted(actor,'lead.read') OR private.permitted(actor,'workflow.manage'))) THEN
   RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403);
  END IF;
  IF op='operational_settings_read' THEN
   SELECT * INTO settings FROM private.operational_settings WHERE id;
   RETURN jsonb_build_object('version',coalesce(settings.version,0),'payload',coalesce(settings.payload,private.operational_defaults()));
  END IF;
  PERFORM pg_advisory_xact_lock(6371940);
  INSERT INTO private.operational_settings(payload) VALUES(private.operational_defaults()) ON CONFLICT DO NOTHING;
  SELECT * INTO settings FROM private.operational_settings WHERE id FOR UPDATE;
  IF settings.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF (data->>'sla_minutes')::int NOT BETWEEN 1 AND 240 OR jsonb_array_length(data->'shift'->'weekdays')=0 OR (data->'shift'->>'start')::time >= (data->'shift'->>'end')::time THEN RETURN jsonb_build_object('error','INVALID_SETTINGS','status',422); END IF;
  UPDATE private.operational_settings SET payload=data,version=version+1,updated_at=now() WHERE id RETURNING * INTO settings;
  INSERT INTO private.audit(actor_id,action,payload) VALUES(actor,'operations.settings_saved',jsonb_build_object('version',settings.version));
  RETURN to_jsonb(settings)-'id';
 ELSIF op='lead_list' THEN
  IF NOT private.permitted(actor,'lead.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.lead_safe(x) ORDER BY x.created_at DESC,x.id DESC) FROM (
   SELECT ll.* FROM private.leads ll
   LEFT JOIN private.resources p ON p.id=nullif(ll.payload->>'plan_id','')::uuid AND p.kind='plan'
   LEFT JOIN private.resources area ON area.id=nullif(ll.payload->>'region_id','')::uuid AND area.kind='region'
   WHERE private.can_read_lead(actor,ll) AND (c->>'status' IS NULL OR ll.status=c->>'status')
    AND (c->>'branch_id' IS NULL OR ll.branch_id=(c->>'branch_id')::uuid)
    AND (c->>'assignee_id' IS NULL OR ll.assignee_id=(c->>'assignee_id')::uuid)
    AND (c->>'region_id' IS NULL OR ll.payload->>'region_id'=c->>'region_id' OR area.payload->>'parent_id'=c->>'region_id')
    AND (c->>'start' IS NULL OR ll.created_at >= (c->>'start')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    AND (c->>'end' IS NULL OR ll.created_at < ((c->>'end')::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    AND (NOT coalesce((c->>'overdue')::bool,false) OR (ll.sla_due_at<now() AND ll.status IN ('new','assigned','contacting')))
    AND (nullif(c->>'q','') IS NULL OR strpos(lower(concat_ws(' ',ll.id::text,ll.payload->>'phone_masked',p.payload->>'name',area.payload->>'name')),lower(c->>'q'))>0)
    AND (c->>'before_id' IS NULL OR (ll.created_at,ll.id)<((c->>'before_at')::timestamptz,(c->>'before_id')::uuid))
   ORDER BY ll.created_at DESC,ll.id DESC LIMIT least(101,coalesce((c->>'limit')::int,31))) x),'[]'));
 ELSIF op='metrics_rebuild' THEN
  IF NOT private.permitted(actor,'report.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  d:=(c->>'day')::date;
  UPDATE private.daily_metrics SET payload=jsonb_build_object('definition_version','v2','leads',0,'contacted',0,'qualified',0,'installed',0),updated_at=now()
  WHERE day=d AND private.permitted(actor,'report.read',branch_id);
  INSERT INTO private.daily_metrics(day,branch_id,payload)
  SELECT d,coalesce(branch_id,global_id),jsonb_build_object('definition_version','v2','leads',count(*),
   'contacted',count(*) FILTER(WHERE status IN ('contacted','qualified','survey','quoted','closed','installed') OR EXISTS(SELECT 1 FROM private.activities a WHERE a.lead_id=ll.id AND a.kind='transition' AND a.payload->>'to'='contacted')),
   'qualified',count(*) FILTER(WHERE status IN ('qualified','survey','quoted','closed','installed')),'installed',count(*) FILTER(WHERE status='installed'))
  FROM private.leads ll WHERE created_at>=d::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND created_at<(d+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
   AND private.permitted(actor,'report.read',coalesce(branch_id,global_id)) GROUP BY branch_id
  ON CONFLICT(day,branch_id) DO UPDATE SET payload=excluded.payload,updated_at=now();
  RETURN jsonb_build_object('rebuilt',true,'day',d,'definition_version','v2');
 ELSIF op='membership_save' THEN
  r:=api.dispatch_before_admin_quality(c);
  IF NOT r ? 'error' THEN UPDATE private.memberships SET display_name=coalesce(data->>'display_name','') WHERE user_id=(data->>'user_id')::uuid AND branch_id=(data->>'branch_id')::uuid; END IF;
  RETURN r;
 ELSIF op='admin_resource_list' THEN
  permission:=CASE kind WHEN 'campaign' THEN 'marketing.write' WHEN 'experiment' THEN 'marketing.write' WHEN 'integration' THEN 'marketing.write' WHEN 'cost' THEN 'marketing.write' WHEN 'page' THEN 'content.write' WHEN 'media' THEN 'content.write' WHEN 'promotion' THEN 'catalog.write' WHEN 'export' THEN 'governance.export' WHEN 'privacy' THEN 'governance.write' END;
  IF permission IS NULL OR NOT private.permitted(actor,permission) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x)-'published_payload'||jsonb_build_object('payload',CASE WHEN kind IN ('export','privacy') THEN jsonb_build_object('status',x.payload->'status','created_at',x.created_at) ELSE x.payload END) ORDER BY x.id DESC),'[]') INTO r FROM (
   SELECT rr.* FROM private.resources rr WHERE rr.kind=kind AND private.permitted(actor,permission,coalesce(rr.branch_id,global_id))
   AND (c->>'before' IS NULL OR rr.id<(c->>'before')::uuid) ORDER BY rr.id DESC LIMIT least(101,coalesce((c->>'limit')::int,30)+1))x;
  RETURN jsonb_build_object('items',r);
 ELSIF op='report_summary' THEN
  IF NOT private.permitted(actor,'report.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  WITH cohort AS (
   SELECT ll.*,coalesce(ll.payload#>>'{attribution,last_touch,payload,utm_campaign}',ll.payload#>>'{attribution,last_touch,utm_campaign}','unattributed') AS campaign_key FROM private.leads ll
   WHERE private.permitted(actor,'report.read',coalesce(ll.branch_id,global_id))
    AND (c->>'branch_id' IS NULL OR ll.branch_id=(c->>'branch_id')::uuid)
    AND (c->>'start' IS NULL OR ll.created_at>=(c->>'start')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    AND (c->>'end' IS NULL OR ll.created_at<((c->>'end')::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
  ), totals AS (
   SELECT campaign_key,count(*) AS leads,count(*) FILTER(WHERE status IN ('contacted','qualified','survey','quoted','closed','installed') OR EXISTS(SELECT 1 FROM private.activities a WHERE a.lead_id=cohort.id AND a.kind='transition' AND a.payload->>'to'='contacted')) AS contacted,
   count(*) FILTER(WHERE status IN ('qualified','survey','quoted','closed','installed')) AS qualified,count(*) FILTER(WHERE status='installed') AS installed FROM cohort
   WHERE c->>'campaign' IS NULL OR campaign_key=c->>'campaign' GROUP BY campaign_key
  ), costs AS (
   SELECT campaigns.payload->>'utm_campaign' AS campaign_key,sum((rr.payload->>'cost_vnd')::numeric) AS cost_vnd FROM private.resources rr
   JOIN private.resources campaigns ON campaigns.id=(rr.payload->>'campaign_id')::uuid AND campaigns.kind='campaign'
   WHERE rr.kind='cost' AND rr.status<>'retired' AND private.permitted(actor,'report.read',coalesce(campaigns.branch_id,global_id))
   AND (c->>'branch_id' IS NULL OR campaigns.branch_id=(c->>'branch_id')::uuid)
   AND (c->>'start' IS NULL OR (rr.payload->>'day')::date>=(c->>'start')::date)
   AND (c->>'end' IS NULL OR (rr.payload->>'day')::date<=(c->>'end')::date)
   AND (c->>'campaign' IS NULL OR campaigns.payload->>'utm_campaign'=c->>'campaign') GROUP BY campaigns.payload->>'utm_campaign'
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('campaign',coalesce(t.campaign_key,k.campaign_key),'leads',coalesce(t.leads,0),'contacted',coalesce(t.contacted,0),'qualified',coalesce(t.qualified,0),'installed',coalesce(t.installed,0),'cost_vnd',k.cost_vnd,'cpl_vnd',k.cost_vnd/nullif(t.leads,0),'cost_per_qualified_vnd',k.cost_vnd/nullif(t.qualified,0),'cost_per_installed_vnd',k.cost_vnd/nullif(t.installed,0)) ORDER BY coalesce(t.leads,0) DESC),'[]') INTO r FROM totals t FULL JOIN costs k USING(campaign_key);
  RETURN jsonb_build_object('items',r,'definition_version','cohort-v2','as_of',now(),'timezone','Asia/Ho_Chi_Minh');
 END IF;
 RETURN api.dispatch_before_admin_quality(c);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private TO service_role;
GRANT EXECUTE ON FUNCTION private.allowed_topic(text) TO authenticated;
COMMIT;
