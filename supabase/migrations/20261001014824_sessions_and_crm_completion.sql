BEGIN;
-- Opaque BFF sessions: only HMAC IDs and encrypted provider token pairs are persisted.
CREATE TABLE private.admin_sessions (
 key text PRIMARY KEY, subject uuid NOT NULL, csrf_hash text NOT NULL,
 tokens_ciphertext text NOT NULL, access_expires_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL, version integer NOT NULL DEFAULT 1,
 refresh_lease uuid, refresh_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_sessions_expiry ON private.admin_sessions(expires_at);
ALTER TABLE private.admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.admin_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.admin_sessions TO service_role;
CREATE OR REPLACE FUNCTION private.session_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; r private.admin_sessions; gate jsonb;
BEGIN
 IF op='auth_throttle' THEN
  gate:=private.consume_bucket(jsonb_build_object('key','login:'||(c->>'key'),'capacity',10,'rate',1.0/60));
  IF NOT (gate->>'allowed')::bool THEN RETURN jsonb_build_object('error','RATE_LIMITED','status',429); END IF;
  RETURN '{"allowed":true}';
 ELSIF op='admin_session_create' THEN
  INSERT INTO private.admin_sessions(key,subject,csrf_hash,tokens_ciphertext,access_expires_at,expires_at)
  VALUES(c->>'key',(c->>'subject')::uuid,c->>'csrf_hash',c->>'tokens_ciphertext',(c->>'access_expires_at')::timestamptz,(c->>'expires_at')::timestamptz);
  INSERT INTO private.audit(actor_id,action) VALUES((c->>'subject')::uuid,'auth.signed_in');
  RETURN '{"created":true}';
 ELSIF op='admin_session_read' THEN
  SELECT * INTO r FROM private.admin_sessions WHERE key=c->>'key' AND expires_at>now();
  IF r.key IS NULL OR (r.refresh_until IS NOT NULL AND r.refresh_until<=now()) THEN
   DELETE FROM private.admin_sessions WHERE key=c->>'key';
   RETURN jsonb_build_object('error','UNAUTHENTICATED','status',401);
  END IF;
  RETURN to_jsonb(r);
 ELSIF op='admin_session_refresh_claim' THEN
  UPDATE private.admin_sessions SET refresh_lease=(c->>'lease')::uuid,refresh_until=now()+interval '15 seconds'
  WHERE key=c->>'key' AND version=(c->>'version')::int AND expires_at>now() AND refresh_lease IS NULL RETURNING * INTO r;
  RETURN jsonb_build_object('claimed',r.key IS NOT NULL);
 ELSIF op='admin_session_refresh_complete' THEN
  UPDATE private.admin_sessions SET tokens_ciphertext=c->>'tokens_ciphertext',access_expires_at=(c->>'access_expires_at')::timestamptz,
   refresh_lease=NULL,refresh_until=NULL,version=version+1
  WHERE key=c->>'key' AND refresh_lease=(c->>'lease')::uuid AND refresh_until>now() AND expires_at>now() RETURNING * INTO r;
  RETURN jsonb_build_object('saved',r.key IS NOT NULL);
 ELSIF op='admin_session_revoke' THEN
  DELETE FROM private.admin_sessions WHERE key=c->>'key' RETURNING * INTO r;
  IF r.key IS NOT NULL THEN INSERT INTO private.audit(actor_id,action) VALUES(r.subject,'auth.signed_out'); END IF;
  RETURN '{"revoked":true}';
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
END $$;
CREATE TABLE private.export_epoch(id boolean PRIMARY KEY DEFAULT true CHECK(id),version integer NOT NULL DEFAULT 1);
INSERT INTO private.export_epoch DEFAULT VALUES;
ALTER TABLE private.export_epoch ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.export_epoch TO service_role;
CREATE TABLE private.visit_assessments(session_id uuid PRIMARY KEY REFERENCES private.sessions(id) ON DELETE CASCADE,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.visit_assessments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.visit_assessments TO service_role;
CREATE TABLE private.appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES private.leads(id) ON DELETE CASCADE,
 due_at timestamptz NOT NULL, kind text NOT NULL CHECK(kind IN ('callback','survey','installation')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 notes_ciphertext text NOT NULL, actor_id uuid NOT NULL, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointments_lead ON private.appointments(lead_id,due_at,id);
CREATE INDEX appointments_due ON private.appointments(due_at,id) WHERE status='pending';
CREATE TABLE private.quote_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,lead_id uuid NOT NULL REFERENCES private.leads(id) ON DELETE CASCADE,
 snapshot jsonb,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.redirects(path text PRIMARY KEY,target text NOT NULL,status_code integer NOT NULL CHECK(status_code IN (301,302,307,308)),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.metric_dirty_days(day date PRIMARY KEY,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quote_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.metric_dirty_days ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.appointments,private.quote_history,private.redirects,private.metric_dirty_days TO service_role;
GRANT USAGE,SELECT ON SEQUENCE private.quote_history_id_seq TO service_role;
CREATE OR REPLACE FUNCTION private.mark_metric_dirty() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN INSERT INTO private.metric_dirty_days(day) VALUES((OLD.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) ON CONFLICT(day) DO UPDATE SET updated_at=now(); END IF;
 IF TG_OP<>'DELETE' THEN INSERT INTO private.metric_dirty_days(day) VALUES((NEW.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) ON CONFLICT(day) DO UPDATE SET updated_at=now(); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER metric_dirty AFTER INSERT OR UPDATE OF status OR DELETE ON private.leads FOR EACH ROW EXECUTE FUNCTION private.mark_metric_dirty();
CREATE OR REPLACE FUNCTION private.price_branch(p private.prices) RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p.scope_kind='region' THEN (SELECT branch_id FROM private.resources WHERE id=p.scope_id AND kind='region') ELSE '00000000-0000-0000-0000-000000000000'::uuid END
$$;
CREATE OR REPLACE FUNCTION private.completion_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op';actor uuid:=(c->>'actor')::uuid; l private.leads;p private.prices;q private.quotes;
 a private.appointments;data jsonb:=c->'payload';b uuid;old_branch uuid;out_value jsonb;d date;jid uuid;hop text;seen text[];i int;
BEGIN
 IF op='export_cleanup_batch' THEN
  FOR out_value IN SELECT to_jsonb(rr) FROM private.resources rr WHERE kind='export' AND status<>'erased' AND coalesce((payload->>'epoch')::int,1)<(SELECT version FROM private.export_epoch WHERE id) ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
   UPDATE private.resources SET status='erased' WHERE id=(out_value->>'id')::uuid;
   jid:=private.enqueue('maintenance','erase_export',(out_value->>'id')::uuid,'erase-export:'||(out_value->>'id'));
   UPDATE private.jobs SET next_attempt_at=greatest(now()+interval '120 seconds',coalesce((SELECT max(lease_until)+interval '60 seconds' FROM private.jobs WHERE entity_id=(out_value->>'id')::uuid AND kind='export'),now())) WHERE id=jid;
  END LOOP;
  RETURN '{"cleanup_scheduled":true}';
 END IF;
 IF op='visit_events' THEN
  PERFORM 1 FROM private.sessions WHERE id=(c->>'session_id')::uuid AND analytics FOR SHARE;
  IF NOT FOUND THEN RETURN '{"analytics":false}'; END IF;
  RETURN jsonb_build_object('analytics',true,'events',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'at',at)) FROM (SELECT name,max(created_at) at FROM private.events WHERE session_id=(c->>'session_id')::uuid AND created_at>now()-interval '7 days' GROUP BY name) e),'[]'));
 ELSIF op='visit_save' THEN
  PERFORM 1 FROM private.sessions WHERE id=(c->>'session_id')::uuid AND analytics FOR SHARE;
  IF FOUND THEN INSERT INTO private.visit_assessments(session_id,payload) VALUES((c->>'session_id')::uuid,data) ON CONFLICT(session_id) DO UPDATE SET payload=excluded.payload,updated_at=now(); END IF;
  RETURN '{"saved":true}';
 END IF;
 IF op IN ('price_list' ,'price_get','price_update','price_retire') THEN
  IF op='price_list' THEN
   RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'effective'||jsonb_build_object('start',lower(x.effective),'end',upper(x.effective))) FROM (SELECT * FROM private.prices pp WHERE private.permitted(actor,'pricing.write',coalesce(private.price_branch(pp),'00000000-0000-0000-0000-000000000000')) AND ((c->>'before') IS NULL OR pp.id<(c->>'before')::uuid) ORDER BY pp.id DESC LIMIT least(100,(c->>'limit')::int)) x),'[]'::jsonb));
  END IF;
  SELECT * INTO p FROM private.prices WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF p.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  old_branch:=coalesce(private.price_branch(p),'00000000-0000-0000-0000-000000000000');
  IF NOT private.permitted(actor,CASE WHEN op='price_retire' THEN 'pricing.publish' ELSE 'pricing.write' END,old_branch) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='price_get' THEN RETURN to_jsonb(p)-'effective'||jsonb_build_object('start',lower(p.effective),'end',upper(p.effective)); END IF;
  IF p.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF op='price_update' THEN
   IF p.status<>'draft' THEN RETURN jsonb_build_object('error','PUBLISHED_PRICE_IMMUTABLE','status',409); END IF;
   IF data->>'scope_kind'='region' THEN
    SELECT branch_id INTO b FROM private.resources WHERE id=(data->>'scope_id')::uuid AND kind='region';
    IF b IS NULL THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
   ELSE b:='00000000-0000-0000-0000-000000000000'; END IF;
   IF NOT private.permitted(actor,'pricing.write',b) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
   IF NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(data->>'plan_id')::uuid AND kind='plan') THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
   UPDATE private.prices SET plan_id=(data->>'plan_id')::uuid,scope_id=(data->>'scope_id')::uuid,scope_kind=data->>'scope_kind',billing_months=(data->>'billing_months')::int,
    monthly_vnd=(data->>'monthly_vnd')::bigint,setup_vnd=(data->>'setup_vnd')::bigint,equipment_vnd=(data->>'equipment_vnd')::bigint,vat_included=(data->>'vat_included')::bool,
    vat_bps=(data->>'vat_bps')::int,gift_months=(data->>'gift_months')::int,effective=tstzrange((data->>'start')::timestamptz,(data->>'end')::timestamptz,'[)'),source=data->>'source',version=version+1
   WHERE id=p.id RETURNING * INTO p;
  ELSE UPDATE private.prices SET status='retired',version=version+1 WHERE id=p.id RETURNING * INTO p; END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,old_branch,p.id,op);
  RETURN to_jsonb(p)-'effective'||jsonb_build_object('start',lower(p.effective),'end',upper(p.effective));
 ELSIF op IN ('redirect_save','redirect_list','redirect_read') THEN
  IF op='redirect_read' THEN
   SELECT to_jsonb(r)-'updated_at' INTO out_value FROM private.redirects r WHERE path=c->>'path';
   RETURN coalesce(out_value,jsonb_build_object('error','NOT_FOUND','status',404));
  END IF;
  IF NOT private.permitted(actor,CASE WHEN op='redirect_save' THEN 'content.publish' ELSE 'content.write' END,'00000000-0000-0000-0000-000000000000') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='redirect_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM private.redirects ORDER BY path LIMIT 100)r),'[]')); END IF;
  PERFORM pg_advisory_xact_lock(6371933);
  hop:=c->>'target';seen:=ARRAY[c->>'path'];
  FOR i IN 1..10 LOOP
   IF hop=ANY(seen) THEN RETURN jsonb_build_object('error','REDIRECT_LOOP','status',409); END IF;
   seen:=array_append(seen,hop);
   SELECT target INTO hop FROM private.redirects WHERE path=hop;
   IF hop IS NULL THEN EXIT; END IF;
  END LOOP;
  IF hop IS NOT NULL THEN RETURN jsonb_build_object('error','REDIRECT_CHAIN_TOO_LONG','status',409); END IF;
  INSERT INTO private.redirects(path,target,status_code) VALUES(c->>'path',c->>'target',(c->>'status_code')::int) ON CONFLICT(path) DO UPDATE SET target=excluded.target,status_code=excluded.status_code,updated_at=now();
  INSERT INTO private.audit(actor_id,action,payload) VALUES(actor,'redirect.saved',jsonb_build_object('path',c->>'path'));
  RETURN '{"saved":true}';
 ELSIF op='metrics_refresh_dirty' THEN
  PERFORM private.completion_dispatch('{"op":"export_cleanup_batch"}');
  FOR d IN SELECT day FROM private.metric_dirty_days ORDER BY day LIMIT 10 FOR UPDATE SKIP LOCKED LOOP
   UPDATE private.daily_metrics SET payload=jsonb_build_object('definition_version','v2','leads',0,'contacted',0,'qualified',0,'installed',0),updated_at=now() WHERE day=d;
   INSERT INTO private.daily_metrics(day,branch_id,payload)
   SELECT d,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'),jsonb_build_object('definition_version','v2','leads',count(*),
    'contacted',count(*) FILTER(WHERE status IN ('contacted','qualified','survey','quoted','closed','installed') OR EXISTS(SELECT 1 FROM private.activities aa WHERE aa.lead_id=ll.id AND aa.kind='transition' AND aa.payload->>'to'='contacted')),
    'qualified',count(*) FILTER(WHERE status IN ('qualified','survey','quoted','closed','installed')),'installed',count(*) FILTER(WHERE status='installed'))
   FROM private.leads ll WHERE created_at>=d::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AND created_at<(d+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' GROUP BY branch_id
   ON CONFLICT(day,branch_id) DO UPDATE SET payload=excluded.payload,updated_at=now();
   DELETE FROM private.metric_dirty_days WHERE day=d;
  END LOOP;
  DELETE FROM private.visit_assessments WHERE session_id IN (SELECT session_id FROM private.visit_assessments WHERE updated_at<now()-interval '30 days' LIMIT 200);
  UPDATE private.leads SET click_id_ciphertext=NULL,click_id_expires_at=NULL WHERE id IN (SELECT id FROM private.leads WHERE click_id_expires_at<=now() LIMIT 200);
  DELETE FROM private.admin_sessions WHERE key IN (SELECT key FROM private.admin_sessions WHERE expires_at<=now() LIMIT 200);
  RETURN '{"refreshed":true}';
 END IF;
 IF op='appointment_update' THEN
  SELECT * INTO a FROM private.appointments WHERE id=(c->>'id')::uuid;
  IF a.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  SELECT * INTO l FROM private.leads WHERE id=a.lead_id FOR UPDATE;
 ELSE SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE; END IF;
 IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF NOT private.can_read_lead(actor,l,CASE WHEN op IN ('appointment_list','intelligence_read') THEN 'lead.read' WHEN op='intelligence_recompute' THEN 'intelligence.write' ELSE 'lead.write' END) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF op='appointment_list' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'notes_ciphertext') FROM (SELECT * FROM private.appointments WHERE lead_id=l.id ORDER BY due_at DESC,id LIMIT 100)x),'[]'));
 ELSIF op='appointment_create' THEN
  IF l.version<>(data->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  INSERT INTO private.appointments(lead_id,due_at,kind,notes_ciphertext,actor_id) VALUES(l.id,(data->>'due_at')::timestamptz,data->>'kind',data->>'notes_ciphertext',actor) RETURNING * INTO a;
  UPDATE private.leads SET version=version+1,updated_at=now() WHERE id=l.id;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'appointment.created');
  RETURN to_jsonb(a)-'notes_ciphertext';
 ELSIF op='appointment_update' THEN
  SELECT * INTO a FROM private.appointments WHERE id=a.id FOR UPDATE;
  IF a.version<>(data->>'expected_version')::int OR a.status<>'pending' THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  UPDATE private.appointments SET status=data->>'status',due_at=coalesce((data->>'due_at')::timestamptz,due_at),version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'appointment.updated');
  RETURN to_jsonb(a)-'notes_ciphertext';
 ELSIF op='intelligence_read' THEN
  RETURN jsonb_build_object('scores',l.scores,'evidence_version',l.evidence_version,'observations',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM private.observations WHERE lead_id=l.id ORDER BY observed_at DESC,id LIMIT 100)x),'[]'));
 ELSIF op='intelligence_recompute' THEN
  UPDATE private.leads SET evidence_version=evidence_version+1,version=version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
  jid:=private.enqueue('lead_local','enrich_local',l.id,'enrich:'||l.id||':'||l.evidence_version,l.evidence_version);
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'intelligence.recompute');
  RETURN jsonb_build_object('queued',true,'job_id',jid,'evidence_version',l.evidence_version);
 ELSIF op='quote_confirm' THEN
  IF l.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  PERFORM 1 FROM private.catalog_revision WHERE id FOR SHARE;
  SELECT * INTO q FROM private.quotes WHERE id=(c->>'quote_id')::uuid AND expires_at>now();
  IF q.id IS NULL OR q.payload->>'status'<>'confirmed' OR (q.payload->>'revision')::int<>(SELECT version FROM private.catalog_revision WHERE id) THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
  IF q.payload->>'plan_id' IS DISTINCT FROM l.payload->>'plan_id' OR q.payload->>'region_id' IS DISTINCT FROM l.payload->>'region_id' THEN RETURN jsonb_build_object('error','QUOTE_SCOPE_MISMATCH','status',422); END IF;
  INSERT INTO private.quote_history(lead_id,snapshot,actor_id) VALUES(l.id,l.quote,actor);
  UPDATE private.leads SET quote=q.payload,quote_status='confirmed',version=version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action,payload) VALUES(actor,l.branch_id,l.id,'quote.confirmed',jsonb_build_object('quote_id',q.id,'version',l.version));
  RETURN private.lead_safe(l);
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
END $$;

CREATE OR REPLACE FUNCTION api.complete_job(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
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
    INSERT INTO private.observations(lead_id,field,value,source,status,evidence_ref) VALUES(l.id,observation->>'field',observation->'value','notes_rule','inferred',(observation->'evidence_span')::text);
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

ALTER TABLE private.leads ADD COLUMN click_id_ciphertext text;
ALTER TABLE private.leads ADD COLUMN click_id_expires_at timestamptz;
ALTER TABLE private.leads ADD COLUMN assignment_branch_id uuid;
UPDATE private.leads ll SET assignment_branch_id=(SELECT branch_id FROM private.memberships WHERE user_id=ll.assignee_id AND (branch_id=ll.branch_id OR branch_id='00000000-0000-0000-0000-000000000000') ORDER BY active_leads DESC,branch_id LIMIT 1) WHERE assignee_id IS NOT NULL;
UPDATE private.memberships mm SET active_leads=(SELECT count(*) FROM private.leads WHERE assignee_id=mm.user_id AND assignment_branch_id=mm.branch_id AND status NOT IN ('installed','invalid','rejected','duplicate'));
CREATE OR REPLACE FUNCTION private.lock_contact_command(c jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE match_key text;entity uuid;
BEGIN
 entity:=nullif(c->>'id','')::uuid;
 -- Sorted contact gates also cover consent withdrawal across several leads.
 FOR match_key IN SELECT DISTINCT ct.phone_hmac FROM private.contacts ct JOIN private.leads ll ON ll.contact_id=ct.id WHERE
   ll.id=entity OR ll.id=(c->'payload'->>'lead_id')::uuid OR
   ll.id IN (SELECT (payload->>'lead_id')::uuid FROM private.resources WHERE id=entity AND kind IN ('privacy','followup')) OR
   ll.id IN (SELECT lead_id FROM private.appointments WHERE id=entity) OR
   (c->>'op'='consent' AND ll.payload->>'session_id'=c->>'id')
   ORDER BY ct.phone_hmac LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(match_key,6371934));
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION private.crm_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; l private.leads; m private.memberships; out_data jsonb; item jsonb; new_status text; allowed text[]; change_id bigint; branches uuid[]; global_scope boolean;
BEGIN
 IF op='internal_lead' THEN
  SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN to_jsonb(l)||jsonb_build_object('events',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'at',last_at)) FROM (SELECT e.name,max(e.created_at) last_at FROM private.events e JOIN private.sessions ss ON ss.id=e.session_id AND ss.analytics WHERE e.session_id=(l.payload->>'session_id')::uuid AND e.created_at>now()-interval '7 days' GROUP BY e.name) tracked),'[]'::jsonb),'observations',coalesce((SELECT jsonb_agg(to_jsonb(observations) ORDER BY observed_at,id) FROM private.observations WHERE lead_id=l.id),'[]'::jsonb));
 ELSIF op='lead_list' THEN
  SELECT coalesce(array_agg(branch_id),'{}') INTO branches FROM private.memberships WHERE user_id=actor AND active AND ('*'=ANY(permissions) OR ('lead.read'=ANY(permissions) AND 'lead.all'=ANY(permissions)));
  global_scope:='00000000-0000-0000-0000-000000000000'::uuid=ANY(branches);
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.lead_safe(x)) FROM (SELECT * FROM private.leads ll WHERE (global_scope OR ll.branch_id=ANY(branches) OR ll.assignee_id=actor) AND private.can_read_lead(actor,ll) AND ((c->>'status') IS NULL OR status=c->>'status') AND ((c->>'before_id') IS NULL OR (created_at,id)<((c->>'before_at')::timestamptz,(c->>'before_id')::uuid)) ORDER BY created_at DESC,id DESC LIMIT least(101,coalesce((c->>'limit')::int,31))) x),'[]'));
 ELSIF op='changes' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('cursor',id,'entity_id',entity_id,'type',action)) FROM (SELECT * FROM private.audit a WHERE id>coalesce((c->>'after')::bigint,0) AND (private.permitted(actor,'lead.all',branch_id) OR EXISTS(SELECT 1 FROM private.leads ll WHERE ll.id=a.entity_id AND private.can_read_lead(actor,ll))) ORDER BY id LIMIT 100) z),'[]'));
 END IF;
 SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF op NOT IN ('internal_assign') AND NOT private.can_read_lead(actor,l,CASE WHEN op IN ('lead_detail','lead_reveal') THEN 'lead.read' ELSE 'lead.write' END) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF op='lead_detail' THEN
  RETURN private.lead_safe(l)||jsonb_build_object('observations',coalesce((SELECT jsonb_agg(to_jsonb(observations) ORDER BY observed_at,id) FROM private.observations WHERE lead_id=l.id),'[]'),'activities',coalesce((SELECT jsonb_agg(to_jsonb(activities)||jsonb_build_object('payload',payload-'notes_ciphertext')) FROM private.activities WHERE lead_id=l.id),'[]'));
 ELSIF op='lead_reveal' THEN
  IF NOT private.permitted(actor,'lead.pii',l.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'lead.pii_revealed');
  RETURN jsonb_build_object('pii_ciphertext',l.pii_ciphertext);
 END IF;
 IF op NOT IN ('internal_assign','observation','activity') AND l.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 IF op IN ('assign','internal_assign') THEN
  IF op='assign' AND NOT private.permitted(actor,'lead.assign',l.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='internal_assign' AND l.status<>'new' THEN RETURN private.lead_safe(l); END IF;
  IF l.status NOT IN ('new','assigned') THEN RETURN jsonb_build_object('error','INVALID_TRANSITION','status',409); END IF;
  -- Serialize capacity changes without holding a connection across provider I/O.
  PERFORM pg_advisory_xact_lock(6371932);
  SELECT * INTO m FROM private.memberships mm WHERE active AND ('lead.write'=ANY(permissions) OR '*'=ANY(permissions)) AND (branch_id=l.branch_id OR branch_id='00000000-0000-0000-0000-000000000000') AND private.on_shift(mm.shift,now()) AND active_leads<capacity ORDER BY active_leads::numeric/capacity,last_assigned_at NULLS FIRST,user_id LIMIT 1 FOR UPDATE;
  IF m.user_id IS NULL THEN RETURN jsonb_build_object('status','unassigned','id',l.id); END IF;
  IF l.assignee_id IS NOT NULL THEN UPDATE private.memberships SET active_leads=greatest(0,active_leads-1) WHERE user_id=l.assignee_id AND branch_id=l.assignment_branch_id; END IF;
  UPDATE private.memberships SET active_leads=active_leads+1,last_assigned_at=now() WHERE user_id=m.user_id AND branch_id=m.branch_id;
  UPDATE private.leads SET assignee_id=m.user_id,assignment_branch_id=m.branch_id,status='assigned',version=version+1,updated_at=now(),sla_due_at=coalesce(sla_due_at,(c->>'sla_due_at')::timestamptz) WHERE id=l.id RETURNING * INTO l;
 ELSIF op='transition' THEN
  new_status:=c->>'status';
  allowed:=CASE l.status WHEN 'new' THEN ARRAY['assigned','invalid','rejected','duplicate'] WHEN 'assigned' THEN ARRAY['contacting','unreachable','rejected'] WHEN 'contacting' THEN ARRAY['contacted','unreachable','invalid','rejected'] WHEN 'contacted' THEN ARRAY['qualified','no_infrastructure','rejected'] WHEN 'qualified' THEN ARRAY['survey','quoted','closed','rejected'] WHEN 'survey' THEN ARRAY['quoted','no_infrastructure','rejected'] WHEN 'quoted' THEN ARRAY['closed','rejected'] WHEN 'closed' THEN ARRAY['installed','rejected'] WHEN 'unreachable' THEN ARRAY['contacting','rejected'] WHEN 'no_infrastructure' THEN ARRAY['survey','rejected'] ELSE ARRAY[]::text[] END;
  IF NOT new_status=ANY(allowed) OR (new_status='installed' AND coalesce(c->'installation'->>'reference','')='') OR (new_status IN ('invalid','rejected','duplicate') AND coalesce(c->>'reason','')='') THEN RETURN jsonb_build_object('error','INVALID_TRANSITION','status',409); END IF;
  IF new_status IN ('installed','invalid','rejected','duplicate') AND l.assignee_id IS NOT NULL THEN UPDATE private.memberships SET active_leads=greatest(0,active_leads-1) WHERE user_id=l.assignee_id AND branch_id=l.assignment_branch_id; END IF;
  UPDATE private.leads SET status=new_status,version=version+1,evidence_version=evidence_version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
  INSERT INTO private.activities(lead_id,kind,payload,actor_id) VALUES(l.id,'transition',jsonb_build_object('to',new_status,'reason',c->>'reason','installation',c->'installation'),actor);
  IF new_status='contacted' THEN INSERT INTO private.observations(lead_id,field,value,source,status) VALUES(l.id,'contacted','true','staff','confirmed'); END IF;
  IF new_status='installed' THEN
   PERFORM private.enqueue('conversions','conversion',l.id,'conversion:'||l.event_id||':installed');
   UPDATE private.jobs SET job_command='{"stage":"installed"}' WHERE entity_id=l.id AND dedup_key='conversion:'||l.event_id||':installed';
  END IF;
  PERFORM private.enqueue('lead_local','enrich_local',l.id,'enrich:'||l.id||':'||l.evidence_version,l.evidence_version);
 ELSIF op='observation' THEN
  IF NOT private.permitted(actor,'intelligence.write',l.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  item:=c->'payload';
  INSERT INTO private.observations(lead_id,field,value,source,status,evidence_ref,expires_at) VALUES(l.id,item->>'field',item->'value','staff',item->>'status',item->>'evidence_ref',(item->>'expires_at')::timestamptz);
  UPDATE private.leads SET evidence_version=evidence_version+1,version=version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
  PERFORM private.enqueue('lead_local','enrich_local',l.id,'enrich:'||l.id||':'||l.evidence_version,l.evidence_version);
 ELSIF op='activity' THEN
  INSERT INTO private.activities(lead_id,kind,payload,actor_id) VALUES(l.id,c->'payload'->>'kind',c->'payload',actor);
 ELSE RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
 END IF;
 INSERT INTO private.audit(actor_id,branch_id,entity_id,action,payload) VALUES(actor,l.branch_id,l.id,'lead.'||op,jsonb_build_object('version',l.version));
 RETURN private.lead_safe(l);
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
  FOR l IN SELECT * FROM private.leads WHERE sla_due_at<=now() AND status IN ('new','assigned','contacting','unreachable') ORDER BY sla_due_at LIMIT 50 LOOP
   IF NOT EXISTS(SELECT 1 FROM private.audit WHERE entity_id=l.id AND action='sla.overdue') THEN INSERT INTO private.audit(branch_id,entity_id,action) VALUES(l.branch_id,l.id,'sla.overdue'); END IF;
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
CREATE OR REPLACE FUNCTION api.submit_lead(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c jsonb:=command; idem private.idempotency; contact uuid; lead private.leads; q private.quotes; b uuid; bucket jsonb; d jsonb; result jsonb; qs text:='needs_confirmation';
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(c->>'phone_hmac',6371934));
 INSERT INTO private.idempotency(key,digest,expires_at) VALUES(c->>'key',c->>'digest',CASE WHEN coalesce((c->>'durable')::bool,false) THEN 'infinity'::timestamptz ELSE now()+interval '24 hours' END) ON CONFLICT DO NOTHING;
 SELECT * INTO idem FROM private.idempotency WHERE key=c->>'key' FOR UPDATE;
 IF idem.expires_at<=now() THEN
  UPDATE private.idempotency SET digest=c->>'digest',result=NULL,expires_at=now()+interval '24 hours' WHERE key=idem.key;
  idem.result:=NULL;idem.digest:=c->>'digest';
 END IF;
 IF idem.digest<>c->>'digest' THEN RETURN jsonb_build_object('error','IDEMPOTENCY_CONFLICT','status',409); END IF;
 IF idem.result IS NOT NULL THEN RETURN idem.result||'{"replayed":true}'::jsonb; END IF;
 FOR bucket IN SELECT value FROM jsonb_array_elements(c->'buckets') ORDER BY value->>'key' LOOP
  d:=private.consume_bucket(bucket);
  IF NOT (d->>'allowed')::bool THEN
   IF bucket->>'mode'='challenge' AND c->>'challenge_id' IS NULL THEN RETURN jsonb_build_object('error','CHALLENGE_REQUIRED','status',403); END IF;
   IF bucket->>'mode'<>'challenge' THEN RETURN jsonb_build_object('error','RATE_LIMITED','status',429,'retry_after',d->'retry_after'); END IF;
  END IF;
 END LOOP;
 IF (c->>'honeypot')::bool AND c->>'challenge_id' IS NULL THEN RETURN jsonb_build_object('error','CHALLENGE_REQUIRED','status',403); END IF;
 IF c->'payload'->>'plan_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(c->'payload'->>'plan_id')::uuid AND kind='plan' AND status='published') THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
 IF c->'payload'->>'region_id' IS NOT NULL THEN
  SELECT branch_id INTO b FROM private.resources WHERE id=(c->'payload'->>'region_id')::uuid AND kind='region' AND status='published';
  IF b IS NULL THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
 END IF;
 PERFORM 1 FROM private.catalog_revision WHERE id FOR SHARE;
 SELECT * INTO q FROM private.quotes WHERE id=(c->>'quote_id')::uuid;
 IF q.id IS NOT NULL AND q.expires_at>now() AND (q.payload->>'revision')::int=coalesce((SELECT version FROM private.catalog_revision WHERE id),1) AND q.payload->>'plan_id'=c->'payload'->>'plan_id' AND q.payload->>'region_id'=c->'payload'->>'region_id' THEN qs:='confirmed'; ELSE q.payload:=NULL; END IF;
 IF c->>'challenge_id' IS NOT NULL THEN
  INSERT INTO private.used_challenges(id) VALUES((c->>'challenge_id')::uuid) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','CHALLENGE_REPLAYED','status',403); END IF;
 END IF;
 IF c->>'session_id' IS NOT NULL THEN
  PERFORM 1 FROM private.sessions WHERE id=(c->>'session_id')::uuid AND analytics FOR SHARE;
  IF FOUND THEN
   c:=jsonb_set(c,'{payload,attribution}',jsonb_build_object('first_touch',(SELECT payload-'click_id_ciphertext' FROM private.touches WHERE session_id=(c->>'session_id')::uuid AND created_at>now()-interval '30 days' ORDER BY created_at,id LIMIT 1),'last_touch',(SELECT payload-'click_id_ciphertext' FROM private.touches WHERE session_id=(c->>'session_id')::uuid AND created_at>now()-interval '30 days' ORDER BY created_at DESC,id DESC LIMIT 1)));
  ELSE c:=jsonb_set(c,'{payload}',(c->'payload')-'session_id'); END IF;
 END IF;
 INSERT INTO private.contacts(phone_hmac,phone_ciphertext,key_version) VALUES(c->>'phone_hmac',c->>'phone_ciphertext',coalesce(c->>'key_version','v1')) ON CONFLICT(phone_hmac) DO UPDATE SET phone_hmac=excluded.phone_hmac RETURNING id INTO contact;
 INSERT INTO private.leads(contact_id,branch_id,payload,pii_ciphertext,quote,quote_status,sla_due_at) VALUES(contact,b,c->'payload',c->>'pii_ciphertext',q.payload,qs,(c->>'sla_due_at')::timestamptz) RETURNING * INTO lead;
 IF coalesce((c->'payload'->>'marketing_opt_in')::bool,false) AND EXISTS(SELECT 1 FROM private.sessions WHERE id=(c->>'session_id')::uuid AND analytics AND marketing) THEN
  UPDATE private.leads SET click_id_ciphertext=(SELECT payload->>'click_id_ciphertext' FROM private.touches WHERE session_id=(c->>'session_id')::uuid AND created_at>now()-interval '30 days' ORDER BY created_at DESC,id DESC LIMIT 1),
   click_id_expires_at=(SELECT created_at+interval '30 days' FROM private.touches WHERE session_id=(c->>'session_id')::uuid AND created_at>now()-interval '30 days' ORDER BY created_at DESC,id DESC LIMIT 1) WHERE id=lead.id;
 END IF;
 INSERT INTO private.audit(branch_id,entity_id,action) VALUES(b,lead.id,'lead.created');
 PERFORM private.enqueue('lead_local','enrich_local',lead.id,'enrich:'||lead.id||':1');
 result:=jsonb_build_object('receipt',lead.receipt,'event_id',lead.event_id,'quote_status',qs,'next_action','await_contact');
 UPDATE private.idempotency SET result=result WHERE key=idem.key;
 RETURN result||'{"replayed":false}'::jsonb;
END $$;
-- A short SQL-only queue gate prevents queue-row/job-row lock inversion.
-- It does not cover external network I/O or ordinary lead intake.
ALTER FUNCTION api.claim_jobs(jsonb) RENAME TO claim_jobs_impl;
ALTER FUNCTION api.complete_job(jsonb) RENAME TO complete_job_impl;
ALTER FUNCTION api.fail_job(jsonb) RENAME TO fail_job_impl;
CREATE OR REPLACE FUNCTION api.claim_jobs(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(6371935);RETURN api.claim_jobs_impl(command);END $$;
CREATE OR REPLACE FUNCTION api.complete_job(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE entity uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(6371935);
 SELECT entity_id INTO entity FROM private.jobs WHERE id=(command->>'id')::uuid;
 PERFORM private.lock_contact_command(jsonb_build_object('id',entity));
 RETURN api.complete_job_impl(command);
END $$;
CREATE OR REPLACE FUNCTION api.fail_job(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(6371935);RETURN api.fail_job_impl(command);END $$;

CREATE OR REPLACE FUNCTION private.pricing_read(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.resources;gid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(c->>'plan_id')::uuid AND kind='plan' AND status='published') THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
 IF c->>'region_id' IS NOT NULL THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'region_id')::uuid AND kind='region' AND status='published';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
  gid:=(r.published_payload->>'price_group_id')::uuid;
 END IF;
 RETURN jsonb_build_object('prices',coalesce((SELECT jsonb_agg(to_jsonb(p)-'effective'||jsonb_build_object('start',lower(p.effective),'end',upper(p.effective))) FROM private.prices p WHERE p.plan_id=(c->>'plan_id')::uuid AND status='published' AND billing_months=coalesce((c->>'billing_months')::int,6) AND ((scope_kind='region' AND scope_id=r.id) OR (scope_kind='group' AND scope_id=gid) OR scope_kind='default')),'[]'),
  'promotions',coalesce((SELECT jsonb_agg(published_payload||jsonb_build_object('id',id)) FROM private.resources WHERE kind='promotion' AND status='published' AND (coalesce(jsonb_array_length(published_payload->'plan_ids'),0)=0 OR published_payload->'plan_ids' ? (c->>'plan_id'))),'[]'),
  'group_id',gid,'revision',coalesce((SELECT version FROM private.catalog_revision WHERE id),1));
END $$;

CREATE OR REPLACE FUNCTION private.governance_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; l private.leads; r private.resources; contact private.contacts; x record; result jsonb; data jsonb:=c->'payload'; jid uuid;
BEGIN
 IF op='report' THEN
  IF NOT private.permitted(actor,'report.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT jsonb_build_object('leads',count(*),'contacted',count(*) FILTER(WHERE status IN ('contacted','qualified','survey','quoted','closed','installed') OR EXISTS(SELECT 1 FROM private.activities a WHERE a.lead_id=leads.id AND a.kind='transition' AND a.payload->>'to'='contacted')),'qualified',count(*) FILTER(WHERE status IN ('qualified','survey','quoted','closed','installed')),'installed',count(*) FILTER(WHERE status='installed'),'overdue',count(*) FILTER(WHERE sla_due_at<now() AND status IN ('new','assigned','contacting'))) INTO result FROM private.leads WHERE private.permitted(actor,'report.read',branch_id);
  RETURN jsonb_build_object('funnel',result,'definition_version','funnel-v1','as_of',now());
 ELSIF op='privacy_request' THEN
  SELECT * INTO l FROM private.leads WHERE id=(data->>'lead_id')::uuid;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'governance.write',coalesce(l.branch_id,'00000000-0000-0000-0000-000000000000')) OR NOT private.can_read_lead(actor,l) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.resources(kind,branch_id,payload) VALUES('privacy',l.branch_id,data) RETURNING * INTO r;
  RETURN to_jsonb(r);
 ELSIF op='privacy_execute' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='privacy' FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'governance.delete',coalesce(r.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF r.status='complete' THEN RETURN jsonb_build_object('id',r.id,'state','complete'); END IF;
  SELECT * INTO l FROM private.leads WHERE id=(r.payload->>'lead_id')::uuid FOR UPDATE;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF r.payload->>'action'='stop_marketing' THEN
   RETURN private.modules_dispatch(jsonb_build_object('op','preferences','id',l.id,'actor',actor,'payload',jsonb_build_object('marketing_allowed',false,'service_contact_allowed',true,'complaint_open',false)));
  END IF;
  SELECT * INTO contact FROM private.contacts WHERE id=l.contact_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM private.leads ll WHERE ll.contact_id=contact.id AND NOT private.permitted(actor,'governance.delete',coalesce(ll.branch_id,'00000000-0000-0000-0000-000000000000'))) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  FOR x IN SELECT * FROM private.jobs WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id) LOOP PERFORM pgmq.archive(x.queue,x.msg_id); END LOOP;
  DELETE FROM private.permits WHERE id IN (SELECT id FROM private.jobs WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id));
  DELETE FROM private.jobs WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id);
  UPDATE private.idempotency SET result=idempotency.result||'{"quote_status":"deleted","next_action":"request_removed"}' WHERE expires_at='infinity'::timestamptz AND idempotency.result->>'receipt' IN (SELECT receipt::text FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.idempotency WHERE expires_at<>'infinity'::timestamptz AND idempotency.result->>'receipt' IN (SELECT receipt::text FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.audit WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.deliveries WHERE platform='conversion' AND event_id IN (SELECT event_id FROM private.leads WHERE contact_id=contact.id UNION ALL SELECT md5(event_id::text||':installed')::uuid FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.deliveries WHERE event_id IN (SELECT id FROM private.resources WHERE kind='followup' AND payload->>'contact_id'=contact.id::text);
  DELETE FROM private.resources WHERE id<>r.id AND (payload->>'contact_id'=contact.id::text OR payload->>'lead_id' IN (SELECT id::text FROM private.leads WHERE contact_id=contact.id) OR payload->>'referred_lead_id' IN (SELECT id::text FROM private.leads WHERE contact_id=contact.id) OR payload->>'referrer_lead_id' IN (SELECT id::text FROM private.leads WHERE contact_id=contact.id));
  INSERT INTO private.tombstones(contact_hmac) VALUES(contact.phone_hmac) ON CONFLICT DO NOTHING;
  DELETE FROM private.sessions WHERE id IN (SELECT (payload->>'session_id')::uuid FROM private.leads WHERE contact_id=contact.id AND payload->>'session_id' IS NOT NULL);
  UPDATE private.memberships SET active_leads=greatest(0,active_leads-(SELECT count(*) FROM private.leads WHERE contact_id=contact.id AND assignee_id=memberships.user_id AND assignment_branch_id=memberships.branch_id AND status NOT IN ('installed','invalid','rejected','duplicate'))) WHERE user_id IN (SELECT assignee_id FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.leads WHERE contact_id=contact.id;
  DELETE FROM private.contacts WHERE id=contact.id;
  -- Export CSVs contain stable lead IDs: invalidate all existing exports conservatively.
  UPDATE private.export_epoch SET version=version+1 WHERE id;
  PERFORM private.completion_dispatch('{"op":"export_cleanup_batch"}');
  UPDATE private.resources SET status='complete',payload='{"action":"delete","state":"database_erased"}',version=version+1 WHERE id=r.id;
  DELETE FROM private.resource_revisions WHERE resource_id=r.id;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,r.id,'privacy.database_erased');
  RETURN jsonb_build_object('id',r.id,'state','database_erased','external_cleanup','queued_if_required');
 ELSIF op='media_finish' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='media' FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'content.write',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF r.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  UPDATE private.resources SET payload=data,status='ready',version=version+1 WHERE id=r.id RETURNING * INTO r;
  RETURN to_jsonb(r);
 ELSIF op='export_create' THEN
  IF NOT private.permitted(actor,'governance.export',(c->>'branch_id')::uuid) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.resources(kind,branch_id,payload) VALUES('export',(c->>'branch_id')::uuid,jsonb_build_object('epoch',(SELECT version FROM private.export_epoch WHERE id),'actor',actor,'parts','[]'::jsonb,'part',0)) RETURNING * INTO r;
  PERFORM private.enqueue('maintenance','export',r.id,'export:'||r.id||':0');
  RETURN jsonb_build_object('id',r.id,'state','queued');
 ELSIF op IN ('internal_export','internal_erase_export') THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='export';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF op='internal_erase_export' THEN RETURN to_jsonb(r); END IF;
  actor:=(r.payload->>'actor')::uuid;
  IF r.status='erased' OR NOT private.permitted(actor,'governance.export',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at,'quote_status',quote_status)),'[]') INTO result FROM (SELECT * FROM private.leads ll WHERE private.can_read_lead(actor,ll) AND (r.branch_id IS NULL OR branch_id=r.branch_id) AND (r.payload->>'before_id' IS NULL OR (created_at,id)<((r.payload->>'before_at')::timestamptz,(r.payload->>'before_id')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 101) z;
  RETURN to_jsonb(r)||jsonb_build_object('rows',result);
 ELSIF op='audit_download' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='export';
  IF NOT private.permitted(actor,'governance.export',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,r.id,'export.download'); RETURN '{"logged":true}';
 ELSIF op='retention' THEN
  RETURN private.operations_dispatch(jsonb_build_object('op','schedule_tick'));
  -- Legacy statements unreachable; retention is bounded by the operations dispatcher.

  DELETE FROM private.idempotency WHERE expires_at<now();
  DELETE FROM private.rate_buckets WHERE expires_at<now();
  DELETE FROM private.quotes WHERE expires_at<now()-interval '1 day';
  UPDATE private.leads SET payload=payload-'ip_ciphertext' WHERE payload ? 'ip_ciphertext' AND created_at<now()-interval '7 days';
  DELETE FROM private.events WHERE created_at<now()-interval '90 days';
  DELETE FROM private.touches WHERE created_at<now()-interval '30 days';
  DELETE FROM private.sessions WHERE updated_at<now()-interval '90 days';
  RETURN '{"retained":true}';
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
END $$;

CREATE OR REPLACE FUNCTION private.scheduled_publish(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.resources;expected integer:=(c->>'expected_version')::int;
BEGIN
 SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='page' FOR UPDATE;
 IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF r.status='published' AND r.version=expected+1 AND r.published_version=r.version AND r.published_payload=r.payload THEN RETURN '{"already_published":true}'; END IF;
 RETURN private.resource_dispatch(c||jsonb_build_object('op','resource_publish','kind','page'));
END $$;

CREATE OR REPLACE FUNCTION private.integration_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=(c->>'actor')::uuid; op text:=c->>'op';delivery private.deliveries;l private.leads;stage text;jid uuid;
BEGIN
 IF op='integration_allowed' THEN
  RETURN jsonb_build_object('allowed',NOT EXISTS(SELECT 1 FROM private.resources WHERE kind='integration' AND payload->>'platform'=c->>'platform' AND NOT coalesce((payload->>'enabled')::bool,false) AND status<>'retired'));
 END IF;
 IF NOT private.permitted(actor,'marketing.write','00000000-0000-0000-0000-000000000000') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF op='conversion_deliveries' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'result') FROM (SELECT * FROM private.deliveries WHERE platform='conversion' ORDER BY id LIMIT 100)x),'[]'));
 ELSIF op='conversion_reconcile' THEN
  SELECT * INTO delivery FROM private.deliveries WHERE id=(c->>'id')::uuid AND platform='conversion' FOR UPDATE;
  IF delivery.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF delivery.state<>'unknown' THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  SELECT * INTO l FROM private.leads WHERE event_id=delivery.event_id OR md5(event_id::text||':installed')::uuid=delivery.event_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  UPDATE private.deliveries SET state=c->>'state',result=jsonb_build_object('evidence_ref',c->>'evidence_ref','reconciled_by',actor) WHERE id=delivery.id;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'conversion.reconciled');
  IF c->>'state'='retry' THEN
   stage:=CASE WHEN l.event_id=delivery.event_id THEN 'lead' ELSE 'installed' END;
   jid:=private.enqueue('conversions','conversion',l.id,'reconcile:'||delivery.id||':'||delivery.attempt);
   UPDATE private.jobs SET job_command=jsonb_build_object('stage',stage) WHERE id=jid;
  END IF;
  RETURN '{"saved":true}';
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
END $$;

CREATE TABLE private.site_display_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),payload jsonb NOT NULL,version integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.site_display_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.site_display_settings TO service_role;
CREATE OR REPLACE FUNCTION private.display_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.site_display_settings;data jsonb;
BEGIN
 IF c->>'op'='display_settings_read' THEN
  SELECT * INTO r FROM private.site_display_settings WHERE id;
  RETURN jsonb_build_object('payload',coalesce(r.payload,c->'defaults'),'version',coalesce(r.version,0));
 END IF;
 IF NOT private.permitted((c->>'actor')::uuid,'content.publish','00000000-0000-0000-0000-000000000000') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 INSERT INTO private.site_display_settings(payload) VALUES(c->'defaults') ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM private.site_display_settings WHERE id FOR UPDATE;
 IF r.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 data:=r.payload||(c->'payload');
 IF c->'payload' ? 'banner_zones' THEN data:=jsonb_set(data,'{banner_zones}',(r.payload->'banner_zones')||(c->'payload'->'banner_zones')); END IF;
 UPDATE private.site_display_settings SET payload=data,version=version+1,updated_at=now() WHERE id RETURNING * INTO r;
 INSERT INTO private.audit(actor_id,action,payload) VALUES((c->>'actor')::uuid,'display_settings.saved',jsonb_build_object('version',r.version));
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION private.modules_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; kind text:=c->>'kind'; r private.resources; l private.leads; l2 private.leads; sid uuid; item jsonb; n int:=0; pref jsonb; data jsonb:=c->'payload';
BEGIN
 IF op='consent' THEN
  INSERT INTO private.sessions(id,analytics,marketing,consent_version) VALUES((c->>'id')::uuid,(c->>'analytics')::bool,(c->>'marketing')::bool,c->>'consent_version') ON CONFLICT(id) DO UPDATE SET analytics=excluded.analytics,marketing=excluded.marketing,consent_version=excluded.consent_version,updated_at=now();
  IF NOT (c->>'marketing')::bool OR NOT (c->>'analytics')::bool THEN
   UPDATE private.leads SET click_id_ciphertext=NULL,click_id_expires_at=NULL WHERE payload->>'session_id'=c->>'id';
   UPDATE private.touches SET payload=payload-'click_id_ciphertext' WHERE session_id=(c->>'id')::uuid;
  END IF;
  IF NOT (c->>'analytics')::bool THEN UPDATE private.leads SET payload=payload-'session_id'-'attribution' WHERE payload->>'session_id'=c->>'id';DELETE FROM private.events WHERE session_id=(c->>'id')::uuid;DELETE FROM private.touches WHERE session_id=(c->>'id')::uuid; END IF;
  RETURN '{"saved":true}';
 ELSIF op='session_read' THEN
  RETURN coalesce((SELECT to_jsonb(sessions) FROM private.sessions WHERE id=(c->>'id')::uuid),'{}');
 ELSIF op='events' THEN
  sid:=(c->>'session_id')::uuid;
  PERFORM 1 FROM private.sessions WHERE id=sid AND analytics FOR SHARE;
  IF NOT FOUND THEN RETURN '{"accepted":0}'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(c->'events') LOOP
   INSERT INTO private.events(id,session_id,name,payload) VALUES((item->>'id')::uuid,sid,item->>'name',item-'id'-'name') ON CONFLICT DO NOTHING;
   IF FOUND THEN n:=n+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('accepted',n);
 ELSIF op='touch' THEN
  sid:=(c->>'session_id')::uuid;
  PERFORM 1 FROM private.sessions WHERE id=sid AND analytics FOR SHARE;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  INSERT INTO private.touches(session_id,payload) VALUES(sid,data) RETURNING id INTO sid;
  RETURN jsonb_build_object('id',sid);
 ELSIF op='public_resource' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND resources.kind=kind AND published_payload IS NOT NULL AND status='published';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN jsonb_build_object('id',r.id,'version',r.published_version,'payload',r.published_payload);
 ELSIF op='public_page' THEN
  SELECT * INTO r FROM private.resources WHERE resources.kind='page' AND status='published' AND published_payload->>'slug'=c->>'slug';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN jsonb_build_object('id',r.id,'version',r.published_version,'payload',r.published_payload);
 ELSIF op='sitemap' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('payload',published_payload)) FROM private.resources WHERE resources.kind='page' AND status='published' AND published_payload IS NOT NULL),'[]'));
 ELSIF op='resource_list' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)||jsonb_build_object('payload',x.payload-'comment_ciphertext')) FROM (SELECT * FROM private.resources rr WHERE rr.kind=kind AND private.permitted(actor,private.resource_permission(kind),coalesce(branch_id,'00000000-0000-0000-0000-000000000000')) ORDER BY updated_at DESC,id DESC LIMIT least(100,coalesce((c->>'limit')::int,30))) x),'[]'));
 ELSIF op IN ('resource_get','resource_update','resource_retire','referral_approve') THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND (resources.kind=kind OR op='referral_approve') FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,private.resource_permission(r.kind),coalesce(r.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='resource_get' THEN RETURN to_jsonb(r); END IF;
  IF r.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF op='resource_update' THEN
   IF data->>'branch_id' IS DISTINCT FROM r.payload->>'branch_id' THEN RETURN jsonb_build_object('error','IMMUTABLE_SCOPE','status',409); END IF;
   UPDATE private.resources SET payload=data,version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  ELSIF op='resource_retire' THEN UPDATE private.resources SET status='retired',version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  ELSE
   IF r.kind<>'referral' OR NOT private.permitted(actor,'care.approve',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
   IF NOT EXISTS(SELECT 1 FROM private.leads WHERE id=(r.payload->>'referred_lead_id')::uuid AND status='installed' AND EXISTS(SELECT 1 FROM private.activities a WHERE a.lead_id=leads.id AND a.kind='transition' AND a.payload->'installation'->>'reference'=r.payload->>'installation_reference')) THEN RETURN jsonb_build_object('error','INSTALLATION_REQUIRED','status',409); END IF;
   UPDATE private.resources SET status='approved',version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  END IF;
  IF op IN ('resource_retire','resource_update') AND r.kind IN ('plan','region','promotion') THEN INSERT INTO private.catalog_revision(id,version) VALUES(true,1) ON CONFLICT(id) DO UPDATE SET version=private.catalog_revision.version+1; END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,r.branch_id,r.id,op);
  RETURN to_jsonb(r);
 ELSIF op='referral' THEN
  SELECT * INTO l FROM private.leads WHERE id=(data->>'referrer_lead_id')::uuid;
  SELECT * INTO l2 FROM private.leads WHERE id=(data->>'referred_lead_id')::uuid;
  IF l.id IS NULL OR l2.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.can_read_lead(actor,l) OR NOT private.can_read_lead(actor,l2) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF l.contact_id=l2.contact_id THEN RETURN jsonb_build_object('error','SELF_REFERRAL','status',409); END IF;
  INSERT INTO private.resources(kind,branch_id,payload) VALUES('referral',l2.branch_id,data) RETURNING * INTO r;
  RETURN to_jsonb(r);
 ELSIF op IN ('preferences','followup','feedback','internal_followup') THEN
  SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF op NOT IN ('feedback','internal_followup') AND (NOT private.can_read_lead(actor,l) OR NOT private.permitted(actor,'care.write',l.branch_id)) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT payload INTO pref FROM private.resources WHERE resources.kind='preference' AND payload->>'contact_id'=l.contact_id::text;
  IF op='preferences' THEN
   data:=data||jsonb_build_object('contact_id',l.contact_id);
   INSERT INTO private.resources(kind,branch_id,payload) VALUES('preference',l.branch_id,data) ON CONFLICT((payload->>'contact_id')) WHERE resources.kind='preference' DO UPDATE SET payload=excluded.payload,version=resources.version+1 RETURNING * INTO r;
   IF NOT (data->>'service_contact_allowed')::bool OR NOT (data->>'marketing_allowed')::bool THEN
    UPDATE private.resources SET status='cancelled',version=version+1 WHERE resources.kind='followup' AND payload->>'contact_id'=l.contact_id::text AND status='draft' AND (NOT (data->>'service_contact_allowed')::bool OR payload->>'purpose' IN ('marketing','upsell'));
   END IF;
  ELSIF op IN ('followup','internal_followup') THEN
   IF (pref->>'service_contact_allowed')::bool=false OR (data->>'purpose' IN ('marketing','upsell') AND (coalesce((pref->>'marketing_allowed')::bool,(l.payload->>'marketing_opt_in')::bool,false)=false OR (pref->>'complaint_open')::bool=true)) THEN RETURN jsonb_build_object('error','CONTACT_NOT_PERMITTED','status',409); END IF;
   INSERT INTO private.resources(kind,branch_id,payload) VALUES('followup',l.branch_id,data||jsonb_build_object('contact_id',l.contact_id)) RETURNING * INTO r;
   PERFORM private.enqueue('notifications','notify',r.id,'notify:'||r.id);
   UPDATE private.jobs SET next_attempt_at=greatest(now(),(data->>'scheduled_at')::timestamptz) WHERE entity_id=r.id AND private.jobs.kind='notify';
  ELSE
   IF EXISTS(SELECT 1 FROM private.resources WHERE resources.kind='feedback' AND payload->>'lead_id'=l.id::text) THEN RETURN jsonb_build_object('error','FEEDBACK_ALREADY_RECORDED','status',409); END IF;
   INSERT INTO private.resources(kind,branch_id,payload,status) VALUES('feedback',l.branch_id,data||jsonb_build_object('lead_id',l.id),'recorded') RETURNING * INTO r;
  END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,op);
  RETURN to_jsonb(r)-'payload'||jsonb_build_object('payload',r.payload-'contact_id');
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error','DUPLICATE_RESOURCE','status',409);
END $$;

CREATE OR REPLACE FUNCTION private.lead_safe(l private.leads) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT to_jsonb(l)-'pii_ciphertext'-'contact_id'-'receipt'-'click_id_ciphertext'-'click_id_expires_at'||jsonb_build_object('payload',l.payload-'ip_ciphertext') $$;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_operations;
CREATE OR REPLACE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF command->>'op'='privacy_execute' THEN PERFORM pg_advisory_xact_lock(6371935); END IF;
 IF command->>'op' NOT IN ('health','identity','public_catalog','pricing_data','quote_save','session_read','events','touch','visit_events','visit_save') THEN PERFORM private.lock_contact_command(command); END IF;
 IF command->>'op' IN ('export_read','export_download','internal_export') AND EXISTS(SELECT 1 FROM private.resources WHERE id=(command->>'id')::uuid AND kind='export' AND coalesce((payload->>'epoch')::int,1)<(SELECT version FROM private.export_epoch WHERE id)) THEN RETURN jsonb_build_object('error','EXPORT_INVALIDATED','status',410); END IF;
 IF command->>'op' IN ('integration_allowed','conversion_deliveries','conversion_reconcile') THEN RETURN private.integration_dispatch(command); END IF;
 IF command->>'op' IN ('display_settings_read','display_settings_save') THEN RETURN private.display_dispatch(command); END IF;
 IF command->>'op'='scheduled_publish' THEN RETURN private.scheduled_publish(command); END IF;
 IF command->>'op'='pricing_data' THEN RETURN private.pricing_read(command); END IF;
 IF command->>'op' IN ('auth_throttle','admin_session_create','admin_session_read','admin_session_refresh_claim','admin_session_refresh_complete','admin_session_revoke') THEN RETURN private.session_dispatch(command); END IF;
 IF command->>'op' IN ('price_list','price_get','price_update','price_retire','appointment_list','appointment_create','appointment_update','intelligence_read','intelligence_recompute','quote_confirm','redirect_save','redirect_list','redirect_read','metrics_refresh_dirty','visit_events','visit_save') THEN RETURN private.completion_dispatch(command); END IF;
 IF command->>'op'='schedule_tick' THEN PERFORM private.completion_dispatch('{"op":"metrics_refresh_dirty"}'::jsonb); END IF;
 result:=api.dispatch_operations(command);
 IF command->>'op'='consent' AND NOT coalesce((command->>'analytics')::bool,false) AND NOT result ? 'error' THEN DELETE FROM private.visit_assessments WHERE session_id=(command->>'id')::uuid; END IF;
 RETURN result;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private TO service_role;
GRANT EXECUTE ON FUNCTION private.allowed_topic(text) TO authenticated;
COMMIT;
