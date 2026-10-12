BEGIN;
-- Checkpoint is internal scheduling state, not a business version mutation.
ALTER TABLE private.leads ADD COLUMN sla_alerted_due_at timestamptz;
-- Only an explicit matching deadline proves that an alert covers this cycle.
-- Legacy alerts without due_at are retained; the current cycle is evaluated once.
UPDATE private.leads l SET sla_alerted_due_at=l.sla_due_at
 WHERE EXISTS(SELECT 1 FROM private.audit a WHERE a.entity_id=l.id AND a.action='sla.overdue'
 AND (a.payload->>'due_at')::timestamptz=l.sla_due_at);
CREATE INDEX lead_sla_unalerted ON private.leads(sla_due_at,id)
 WHERE status IN ('new','assigned','contacting','unreachable')
 AND sla_alerted_due_at IS DISTINCT FROM sla_due_at;

CREATE INDEX lead_branch_sla ON private.leads(branch_id,sla_due_at,id);
CREATE INDEX lead_assignee_sla ON private.leads(assignee_id,sla_due_at,id);
CREATE INDEX lead_sla ON private.leads(sla_due_at,id);

-- Explicit static predicates are planned per scope. User values stay bind parameters.
CREATE FUNCTION private.lead_scope_page(actor uuid,c jsonb,scope text,b uuid DEFAULT NULL)
RETURNS SETOF private.leads LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE predicate text; ordering text;
BEGIN
 predicate:=CASE scope WHEN 'global' THEN 'true' WHEN 'branch' THEN 'll.branch_id=$3'
  WHEN 'assigned' THEN 'll.assignee_id=$1' ELSE 'false' END;
 ordering:=CASE WHEN c->>'order'='sla' THEN 'll.sla_due_at,ll.id' ELSE 'll.created_at DESC,ll.id DESC' END;
 RETURN QUERY EXECUTE 'SELECT ll.* FROM private.leads ll
 LEFT JOIN private.resources p ON p.id=nullif(ll.payload->>''plan_id'','''')::uuid AND p.kind=''plan''
 LEFT JOIN private.resources area ON area.id=nullif(ll.payload->>''region_id'','''')::uuid AND area.kind=''region''
 WHERE '||predicate||' AND private.can_read_lead($1,ll)
 AND ($2->>''status'' IS NULL OR ll.status=$2->>''status'')
 AND ($2->>''branch_id'' IS NULL OR ll.branch_id=($2->>''branch_id'')::uuid)
 AND ($2->>''assignee_id'' IS NULL OR ll.assignee_id=($2->>''assignee_id'')::uuid)
 AND ($2->>''region_id'' IS NULL OR ll.payload->>''region_id''=$2->>''region_id'' OR area.payload->>''parent_id''=$2->>''region_id'')
 AND ($2->>''start'' IS NULL OR ll.created_at>=($2->>''start'')::date::timestamp AT TIME ZONE ''Asia/Ho_Chi_Minh'')
 AND ($2->>''end'' IS NULL OR ll.created_at<(($2->>''end'')::date+1)::timestamp AT TIME ZONE ''Asia/Ho_Chi_Minh'')
 AND (NOT coalesce(($2->>''pending_only'')::bool,false) OR ll.sla_due_at IS NULL OR ll.sla_due_at>=now())
 AND (NOT coalesce(($2->>''overdue'')::bool,false) OR (ll.sla_due_at<now() AND ll.status IN (''new'',''assigned'',''contacting'',''unreachable'')))
 AND (nullif($2->>''q'','''') IS NULL OR strpos(lower(concat_ws('' '',ll.id::text,ll.payload->>''phone_masked'',p.payload->>''name'',area.payload->>''name'')),lower($2->>''q''))>0)
 AND ($2->>''before_id'' IS NULL OR (ll.created_at,ll.id)<(($2->>''before_at'')::timestamptz,($2->>''before_id'')::uuid))
 ORDER BY '||ordering||' LIMIT greatest(1,least(101,coalesce(($2->>''limit'')::int,31)))'
 USING actor,c,b;
END $$;

CREATE FUNCTION private.scoped_lead_candidates(actor uuid,c jsonb)
RETURNS SETOF private.leads LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE read_global boolean; all_global boolean; b uuid; global_id constant uuid:='00000000-0000-0000-0000-000000000000';
BEGIN
 SELECT coalesce(bool_or(branch_id=global_id AND ('*'=ANY(permissions) OR 'lead.read'=ANY(permissions))),false),
  coalesce(bool_or(branch_id=global_id AND ('*'=ANY(permissions) OR 'lead.all'=ANY(permissions))),false)
 INTO read_global,all_global FROM private.memberships WHERE user_id=actor AND active;
 IF read_global AND all_global THEN RETURN QUERY SELECT * FROM private.lead_scope_page(actor,c,'global'); RETURN; END IF;
 -- Permissions can be combined across memberships; compute the intersection once.
 FOR b IN SELECT DISTINCT m.branch_id FROM private.memberships m
 WHERE m.user_id=actor AND m.active AND m.branch_id<>global_id
 AND (all_global OR '*'=ANY(m.permissions) OR 'lead.all'=ANY(m.permissions))
 AND (read_global OR EXISTS(SELECT 1 FROM private.memberships r WHERE r.user_id=actor AND r.active
  AND r.branch_id=m.branch_id AND ('*'=ANY(r.permissions) OR 'lead.read'=ANY(r.permissions)))) LOOP
  RETURN QUERY SELECT * FROM private.lead_scope_page(actor,c,'branch',b);
 END LOOP;
 RETURN QUERY SELECT * FROM private.lead_scope_page(actor,c,'assigned');
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_audit_scaling;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=(command->>'actor')::uuid; groups jsonb:='[]'; g text; items jsonb; max_items int:=greatest(1,least(20,coalesce((command->>'limit')::int,6))); criteria jsonb;
BEGIN
 IF command->>'op'='lead_workbench' THEN
  IF NOT private.permitted(actor,'lead.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  FOREACH g IN ARRAY ARRAY['overdue','new','assigned','contacting'] LOOP
   criteria:=jsonb_build_object('limit',max_items+1,'order','sla');
   IF g='overdue' THEN criteria:=criteria||'{"overdue":true}';
   ELSE criteria:=criteria||jsonb_build_object('status',g,'pending_only',true); END IF;
   SELECT coalesce(jsonb_agg(private.lead_safe(x) ORDER BY x.sla_due_at,x.id),'[]') INTO items
    FROM (SELECT * FROM (SELECT DISTINCT ON(id) * FROM private.scoped_lead_candidates(actor,criteria) ORDER BY id) candidate
     ORDER BY sla_due_at,id LIMIT max_items+1) x;
   groups:=groups||jsonb_build_array(jsonb_build_object('key',g,'has_more',jsonb_array_length(items)>max_items,
    'items',(SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]') FROM jsonb_array_elements(items) WITH ORDINALITY t(value,ordinal) WHERE ordinal<=max_items)));
  END LOOP;
  RETURN jsonb_build_object('groups',groups,'checked_at',now(),'scope','authorized','count_mode','displayed');
 END IF;
 IF command->>'op'='lead_list' THEN
  IF NOT private.permitted(actor,'lead.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.lead_safe(x) ORDER BY x.created_at DESC,x.id DESC)
   FROM (SELECT * FROM (SELECT DISTINCT ON(id) * FROM private.scoped_lead_candidates(actor,command) ORDER BY id) candidates
    ORDER BY created_at DESC,id DESC LIMIT greatest(1,least(101,coalesce((command->>'limit')::int,31)))) x),'[]'));
 END IF;
 RETURN api.dispatch_before_audit_scaling(command);
END $$;
CREATE OR REPLACE FUNCTION private.operations_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; b uuid:=(c->>'branch_id')::uuid; r private.resources; l private.leads; pref jsonb; data jsonb:=c->'payload'; delivery private.deliveries; d date; count_rows int:=0; jid uuid;
BEGIN
 IF op IN ('membership_list','membership_save') THEN
  IF op='membership_save' THEN b:=(data->>'branch_id')::uuid; END IF;
  IF NOT private.permitted(actor,'identity.manage',coalesce(b,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='membership_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM private.memberships WHERE private.permitted(actor,'identity.manage',branch_id) ORDER BY user_id,branch_id LIMIT 100) x),'[]')); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(data->'permissions') p WHERE NOT private.permitted(actor,p.value,b)) THEN RETURN jsonb_build_object('error','PRIVILEGE_ESCALATION','status',403); END IF;
  IF (data->>'user_id')::uuid=actor AND b='00000000-0000-0000-0000-000000000000' AND ((data->>'active')::bool=false OR NOT data->'permissions' ? '*') AND NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id<>actor AND active AND branch_id=b AND '*'=ANY(permissions)) THEN RETURN jsonb_build_object('error','LAST_OWNER_REQUIRED','status',409); END IF;
  INSERT INTO private.memberships(user_id,branch_id,permissions,active,capacity,shift) VALUES((data->>'user_id')::uuid,b,ARRAY(SELECT jsonb_array_elements_text(data->'permissions')),(data->>'active')::bool,(data->>'capacity')::int,data->'shift') ON CONFLICT(user_id,branch_id) DO UPDATE SET permissions=excluded.permissions,active=excluded.active,capacity=excluded.capacity,shift=excluded.shift;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,b,(data->>'user_id')::uuid,'membership.changed');
  RETURN '{"saved":true}';
 ELSIF op='price_import' THEN
  FOR data IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
   pref:=private.resource_dispatch(jsonb_build_object('op','price_create','actor',actor,'payload',data));
   IF pref ? 'error' THEN RAISE EXCEPTION USING MESSAGE=pref::text,ERRCODE='P0001'; END IF;
   count_rows:=count_rows+1;
  END LOOP;
  INSERT INTO private.audit(actor_id,action,payload) VALUES(actor,'price.imported',jsonb_build_object('rows',count_rows));
  RETURN jsonb_build_object('imported',count_rows,'status','draft');
 ELSIF op='page_schedule' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='page' FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'content.publish',coalesce(r.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF r.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  PERFORM private.enqueue('maintenance','publish_page',r.id,'publish:'||r.id||':'||r.version);
  UPDATE private.jobs SET job_command=jsonb_build_object('actor',actor,'expected_version',r.version),next_attempt_at=(c->>'publish_at')::timestamptz WHERE entity_id=r.id AND kind='publish_page' AND version=1 AND state='pending';
  RETURN '{"scheduled":true}';
 ELSIF op='conversion_prepare' THEN
  SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF l.id IS NULL THEN RETURN '{"status":"cancelled"}'; END IF;
  PERFORM 1 FROM private.sessions WHERE id=(l.payload->>'session_id')::uuid AND marketing FOR SHARE;
  IF NOT FOUND OR NOT coalesce((l.payload->>'marketing_opt_in')::bool,false) THEN RETURN '{"status":"consent_denied"}'; END IF;
  IF c->>'stage'='installed' AND l.status<>'installed' THEN RETURN '{"status":"not_installed"}'; END IF;
  b:=CASE WHEN c->>'stage'='installed' THEN md5(l.event_id::text||':installed')::uuid ELSE l.event_id END;
  INSERT INTO private.deliveries(platform,event_id,account_id) VALUES('conversion',b,'gateway') ON CONFLICT DO NOTHING;
  SELECT * INTO delivery FROM private.deliveries WHERE platform='conversion' AND event_id=b AND account_id='gateway' FOR UPDATE;
  IF delivery.state='sending' THEN UPDATE private.deliveries SET state='unknown' WHERE id=delivery.id;RETURN '{"status":"unknown"}'; END IF;
  IF delivery.state NOT IN ('pending','retry','disabled') THEN RETURN jsonb_build_object('status',delivery.state); END IF;
  UPDATE private.deliveries SET state='sending',attempt=attempt+1 WHERE id=delivery.id;
  RETURN jsonb_build_object('status','ready','delivery_id',delivery.id,'click_id_ciphertext',CASE WHEN l.click_id_expires_at>now() THEN l.click_id_ciphertext END,'event',jsonb_build_object('event_id',b,'event_name',CASE WHEN c->>'stage'='installed' THEN 'Installation' ELSE 'Lead' END,'event_time',CASE WHEN c->>'stage'='installed' THEN (SELECT max(created_at) FROM private.activities WHERE lead_id=l.id AND kind='transition' AND payload->>'to'='installed') ELSE l.created_at END,'attribution',l.payload->'attribution'));
 ELSIF op='conversion_finish' THEN
  UPDATE private.deliveries SET state=c->>'state',result=c->'result' WHERE id=(c->>'delivery_id')::uuid AND platform='conversion' AND state='sending';RETURN '{"saved":true}';
 ELSIF op='delivery_prepare' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='followup' FOR UPDATE;
  IF r.id IS NULL OR r.status IN ('cancelled','sent','unknown','failed') THEN RETURN jsonb_build_object('status',coalesce(r.status,'cancelled')); END IF;
  SELECT * INTO l FROM private.leads WHERE id=(r.payload->>'lead_id')::uuid FOR UPDATE;
  PERFORM 1 FROM private.contacts WHERE id=l.contact_id FOR UPDATE;
  SELECT payload INTO pref FROM private.resources WHERE kind='preference' AND payload->>'contact_id'=l.contact_id::text;
  IF l.id IS NULL OR NOT private.followup_allowed(l,pref,r.payload->>'purpose') THEN UPDATE private.resources SET status='cancelled' WHERE id=r.id;RETURN '{"status":"cancelled"}'; END IF;
  SELECT * INTO delivery FROM private.deliveries WHERE platform='notification' AND event_id=r.id AND account_id=r.payload->>'channel' FOR UPDATE;
  IF delivery.state='sending' THEN
   UPDATE private.deliveries SET state='unknown',result='{"code":"ABANDONED_ATTEMPT"}' WHERE id=delivery.id;
   UPDATE private.resources SET status='unknown',version=version+1,updated_at=now() WHERE id=r.id;
   RETURN '{"status":"unknown"}';
  END IF;
  IF (r.payload->>'scheduled_at')::timestamptz>now() THEN RETURN jsonb_build_object('status','deferred','retry_at',r.payload->>'scheduled_at'); END IF;
  IF (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time NOT BETWEEN '08:00'::time AND '20:00'::time THEN RETURN jsonb_build_object('status','deferred','retry_at',((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + CASE WHEN (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time > '20:00' THEN 1 ELSE 0 END + time '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'); END IF;
  IF (SELECT count(*) FROM private.resources WHERE kind='followup' AND payload->>'contact_id'=l.contact_id::text AND status IN ('sending','sent','accepted','unknown') AND updated_at>now()-interval '1 day')>=3 THEN RETURN jsonb_build_object('status','deferred','retry_at',now()+interval '1 day'); END IF;
  INSERT INTO private.deliveries(platform,event_id,account_id) VALUES('notification',r.id,r.payload->>'channel') ON CONFLICT DO NOTHING;
  SELECT * INTO delivery FROM private.deliveries WHERE platform='notification' AND event_id=r.id AND account_id=r.payload->>'channel' FOR UPDATE;
  IF delivery.state NOT IN ('pending','retry','disabled') THEN RETURN jsonb_build_object('status',delivery.state); END IF;
  UPDATE private.deliveries SET state='sending',attempt=attempt+1 WHERE id=delivery.id;
  UPDATE private.resources SET status='sending',updated_at=now() WHERE id=r.id;
  RETURN jsonb_build_object('status','ready','delivery_id',delivery.id,'event_id',r.id,'channel',r.payload->>'channel','purpose',r.payload->>'purpose','phone_ciphertext',(SELECT phone_ciphertext FROM private.contacts WHERE id=l.contact_id));
 ELSIF op='delivery_reconcile' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='followup' FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'care.approve',coalesce(r.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  UPDATE private.deliveries SET state=c->>'state',result=jsonb_build_object('code','MANUALLY_RECONCILED','evidence_ref',c->>'evidence_ref') WHERE event_id=r.id AND platform='notification' AND state IN ('unknown','sending','disabled','retry');
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_RECONCILABLE','status',409); END IF;
  UPDATE private.resources SET status=CASE WHEN c->>'state'='retry' THEN 'draft' ELSE c->>'state' END,version=version+1,updated_at=now() WHERE id=r.id;
  IF c->>'state'='retry' THEN PERFORM private.enqueue('notifications','notify',r.id,'reconcile:'||r.id||':'||(c->>'request_id')); END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action,payload) VALUES(actor,r.branch_id,r.id,'delivery.reconciled',jsonb_build_object('state',c->>'state'));
  RETURN '{"saved":true}';
 ELSIF op='export_read' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='export';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'governance.export',r.branch_id) OR r.payload->>'actor'<>actor::text THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  RETURN to_jsonb(r);
 ELSIF op='delivery_finish' THEN
  UPDATE private.deliveries SET state=c->>'state',result=coalesce(c->'result','{}') WHERE id=(c->>'delivery_id')::uuid AND state='sending';
  UPDATE private.resources SET status=c->>'state',version=version+1,updated_at=now() WHERE id=(c->>'id')::uuid AND kind='followup' AND status<>'cancelled';
  RETURN '{"saved":true}';
 ELSIF op='schedule_tick' THEN
  -- Bounded recovery, never scan/delete an unlimited table in a Function invocation.
  FOR l IN SELECT * FROM private.leads WHERE status='new' ORDER BY created_at LIMIT 50 LOOP
   PERFORM private.enqueue('lead_local','auto_assign',l.id,'assign:'||l.id||':'||floor(extract(epoch FROM now())/300)::bigint);count_rows:=count_rows+1;
  END LOOP;
  FOR l IN SELECT * FROM private.leads
   WHERE sla_due_at<=now() AND status IN ('new','assigned','contacting','unreachable')
    AND sla_alerted_due_at IS DISTINCT FROM sla_due_at
   ORDER BY sla_due_at,id LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
   UPDATE private.leads SET sla_alerted_due_at=l.sla_due_at WHERE id=l.id;
   INSERT INTO private.audit(branch_id,entity_id,action,payload)
    VALUES(l.branch_id,l.id,'sla.overdue',jsonb_build_object('due_at',l.sla_due_at));
  END LOOP;
  DELETE FROM private.idempotency WHERE key IN (SELECT key FROM private.idempotency WHERE expires_at<=now() LIMIT 200);
  DELETE FROM private.rate_buckets WHERE key IN (SELECT key FROM private.rate_buckets WHERE expires_at<=now() LIMIT 200);
  DELETE FROM private.quotes WHERE id IN (SELECT id FROM private.quotes WHERE expires_at<=now() LIMIT 200);
  UPDATE private.leads SET payload=payload-'ip_ciphertext' WHERE id IN (SELECT id FROM private.leads WHERE created_at<now()-interval '7 days' AND payload ? 'ip_ciphertext' LIMIT 200);
  DELETE FROM private.events WHERE (session_id,id) IN (SELECT session_id,id FROM private.events WHERE created_at<now()-interval '90 days' LIMIT 200);
  DELETE FROM private.touches WHERE id IN (SELECT id FROM private.touches WHERE created_at<now()-interval '30 days' LIMIT 200);
  RETURN jsonb_build_object('scheduled',count_rows);
 ELSIF op IN ('metrics_rebuild','metrics_daily','audit_list','job_list','job_replay') THEN
  IF NOT private.permitted(actor,CASE WHEN op LIKE 'metrics_%' THEN 'report.read' WHEN op='audit_list' THEN 'governance.audit' ELSE 'workflow.manage' END,b) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='metrics_rebuild' THEN
   d:=(c->>'day')::date;
   UPDATE private.daily_metrics SET payload=jsonb_build_object('definition_version','v1','leads',0,'installed',0,'qualified',0),updated_at=now() WHERE day=d AND private.permitted(actor,'report.read',branch_id);
   INSERT INTO private.daily_metrics(day,branch_id,payload)
   SELECT d,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'),jsonb_build_object('definition_version','v1','leads',count(*),'installed',count(*) FILTER(WHERE status='installed'),'qualified',count(*) FILTER(WHERE status IN ('qualified','survey','quoted','closed','installed')))
   FROM private.leads WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=d AND private.permitted(actor,'report.read',branch_id) GROUP BY branch_id
   ON CONFLICT(day,branch_id) DO UPDATE SET payload=excluded.payload,updated_at=now();
   RETURN '{"rebuilt":true}';
  ELSIF op='metrics_daily' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM private.daily_metrics WHERE private.permitted(actor,'report.read',branch_id) ORDER BY day DESC,branch_id LIMIT 100) x),'[]'));
  ELSIF op='audit_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM private.audit WHERE private.permitted(actor,'governance.audit',branch_id) AND id>coalesce((c->>'after')::bigint,0) ORDER BY id LIMIT 100) x),'[]'));
  ELSIF op='job_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'result') FROM (SELECT * FROM private.jobs WHERE private.permitted(actor,'workflow.manage','00000000-0000-0000-0000-000000000000') ORDER BY created_at DESC LIMIT 100) x),'[]'));
  ELSE
   IF NOT private.permitted(actor,'workflow.manage','00000000-0000-0000-0000-000000000000') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
   SELECT private.enqueue(j.queue,j.kind,j.entity_id,'manual:'||j.id||':'||(c->>'request_id'),j.version) INTO jid FROM private.jobs j WHERE id=(c->>'id')::uuid AND state='failed';
   UPDATE private.jobs SET job_command=(SELECT job_command FROM private.jobs WHERE id=(c->>'id')::uuid) WHERE id=jid;
   RETURN '{"queued":true}';
  END IF;
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
EXCEPTION WHEN raise_exception THEN RETURN SQLERRM::jsonb;
END $$;

REVOKE ALL ON FUNCTION private.lead_scope_page(uuid,jsonb,text,uuid),private.scoped_lead_candidates(uuid,jsonb),api.dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.lead_scope_page(uuid,jsonb,text,uuid),private.scoped_lead_candidates(uuid,jsonb),api.dispatch(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION api.complete_job_impl(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE job private.jobs; data jsonb:=command->'result'; l private.leads; observation jsonb;
BEGIN
 SELECT * INTO job FROM private.jobs WHERE id=(command->>'id')::uuid FOR UPDATE;
 IF job.id IS NULL OR job.state<>'running' OR job.fence<>(command->>'fence')::bigint OR job.lease_until<=now() THEN RETURN '{"completed":false}'::jsonb; END IF;
 IF job.kind='enrich_local' THEN
  SELECT * INTO l FROM private.leads WHERE id=job.entity_id FOR UPDATE;
  IF l.evidence_version=(data->>'evidence_version')::int THEN
   UPDATE private.leads SET scores=data->'scores',version=version+1,updated_at=now() WHERE id=l.id;
   INSERT INTO private.observations(lead_id,field,value,source,status) VALUES(l.id,'geoip',data->'geoip','geoip',coalesce(data->'geoip'->>'status','unknown'));
   INSERT INTO private.observations(lead_id,field,value,source,status) VALUES(l.id,'phone_signals',data->'phone_signals','libphonenumber','inferred');
   FOR observation IN SELECT value FROM jsonb_array_elements(coalesce(data->'needs','[]')) LOOP
    INSERT INTO private.observations(lead_id,field,value,source,status,evidence_ref) VALUES(l.id,observation->>'field',observation->'value','notes_rule',CASE WHEN observation->>'status'='needs_review' THEN 'needs_review' ELSE 'inferred' END,jsonb_build_object('span',observation->'evidence_span','polarity',observation->>'polarity','source_version',observation->>'source_version')::text);
   END LOOP;
   INSERT INTO private.audit(branch_id,entity_id,action) VALUES(l.branch_id,l.id,'lead.scored');
   PERFORM private.enqueue('conversions','conversion',l.id,'conversion:'||l.event_id||':lead');
   IF l.status='new' THEN PERFORM private.enqueue('lead_local','auto_assign',l.id,'assign:'||l.id); END IF;
  ELSE
   PERFORM private.enqueue('lead_local','enrich_local',l.id,'enrich:'||l.id||':'||l.evidence_version,l.evidence_version);
  END IF;
 END IF;
 IF job.kind='export' THEN
  UPDATE private.resources SET payload=payload||jsonb_build_object('parts',(payload->'parts')||jsonb_build_array(data->>'part_key'),'part',(data->>'part')::int+1,'before_at',data->>'before_at','before_id',data->>'before_id'),status=CASE WHEN (data->>'has_more')::bool THEN 'draft' ELSE 'complete' END,version=version+1 WHERE id=job.entity_id AND status<>'erased' AND coalesce((payload->>'epoch')::int,1)=(SELECT version FROM private.export_epoch WHERE id);
  IF NOT FOUND THEN RETURN '{"completed":false}'::jsonb; END IF;
  IF (data->>'has_more')::bool THEN PERFORM private.enqueue('maintenance','export',job.entity_id,'export:'||job.entity_id||':'||((data->>'part')::int+1)); END IF;
 END IF;
 IF job.kind='erase_export' AND (data->>'has_more')::bool THEN PERFORM private.enqueue('maintenance','erase_export',job.entity_id,'erase-more:'||job.id); END IF;
 UPDATE private.jobs SET state='done',result=data,lease_until=NULL WHERE id=job.id;
 DELETE FROM private.permits WHERE id=job.id;
 PERFORM pgmq.archive(job.queue,job.msg_id);
 RETURN '{"completed":true}'::jsonb;
END $$;


COMMIT;
