BEGIN;
CREATE OR REPLACE FUNCTION private.on_shift(calendar jsonb,at_time timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((extract(isodow FROM at_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::int-1) IN (SELECT jsonb_array_elements_text(calendar->'weekdays')::int) AND (at_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= (calendar->>'start')::time AND (at_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < (calendar->>'end')::time,false)
$$;
ALTER TABLE private.prices ADD CONSTRAINT default_scope_canonical CHECK(scope_kind<>'default' OR scope_id='00000000-0000-0000-0000-000000000000');
CREATE UNIQUE INDEX page_published_slug ON private.resources((published_payload->>'slug')) WHERE kind='page' AND status='published';
CREATE INDEX event_session_time ON private.events(session_id,created_at DESC);
CREATE INDEX observation_lead_time ON private.observations(lead_id,observed_at DESC,id);
CREATE INDEX activity_lead_time ON private.activities(lead_id,created_at DESC);
CREATE OR REPLACE FUNCTION private.followup_allowed(l private.leads,pref jsonb,purpose text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((pref->>'service_contact_allowed')::boolean,true) AND (purpose='service' OR (coalesce((pref->>'marketing_allowed')::boolean,(l.payload->>'marketing_opt_in')::boolean,false) AND NOT coalesce((pref->>'complaint_open')::boolean,false)))
$$;
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
  RETURN jsonb_build_object('status','ready','delivery_id',delivery.id,'event',jsonb_build_object('event_id',b,'event_name',CASE WHEN c->>'stage'='installed' THEN 'Installation' ELSE 'Lead' END,'event_time',CASE WHEN c->>'stage'='installed' THEN (SELECT max(created_at) FROM private.activities WHERE lead_id=l.id AND kind='transition' AND payload->>'to'='installed') ELSE l.created_at END,'attribution',l.payload->'attribution'));
 ELSIF op='conversion_finish' THEN
  UPDATE private.deliveries SET state=c->>'state',result=c->'result' WHERE id=(c->>'delivery_id')::uuid AND platform='conversion' AND state='sending';RETURN '{"saved":true}';
 ELSIF op='delivery_prepare' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='followup' FOR UPDATE;
  IF r.id IS NULL OR r.status IN ('cancelled','sent','unknown','failed') THEN RETURN jsonb_build_object('status',coalesce(r.status,'cancelled')); END IF;
  SELECT * INTO l FROM private.leads WHERE id=(r.payload->>'lead_id')::uuid FOR UPDATE;
  PERFORM 1 FROM private.contacts WHERE id=l.contact_id FOR UPDATE;
  SELECT payload INTO pref FROM private.resources WHERE kind='preference' AND payload->>'contact_id'=l.contact_id::text;
  IF l.id IS NULL OR NOT private.followup_allowed(l,pref,r.payload->>'purpose') THEN UPDATE private.resources SET status='cancelled' WHERE id=r.id;RETURN '{"status":"cancelled"}'; END IF;
  IF (r.payload->>'scheduled_at')::timestamptz>now() THEN RETURN jsonb_build_object('status','deferred','retry_at',r.payload->>'scheduled_at'); END IF;
  IF (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time NOT BETWEEN '08:00'::time AND '20:00'::time THEN RETURN jsonb_build_object('status','deferred','retry_at',((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + CASE WHEN (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time > '20:00' THEN 1 ELSE 0 END + time '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'); END IF;
  IF (SELECT count(*) FROM private.resources WHERE kind='followup' AND payload->>'contact_id'=l.contact_id::text AND status IN ('sending','sent','accepted','unknown') AND updated_at>now()-interval '1 day')>=3 THEN RETURN jsonb_build_object('status','deferred','retry_at',now()+interval '1 day'); END IF;
  INSERT INTO private.deliveries(platform,event_id,account_id) VALUES('notification',r.id,r.payload->>'channel') ON CONFLICT DO NOTHING;
  SELECT * INTO delivery FROM private.deliveries WHERE platform='notification' AND event_id=r.id AND account_id=r.payload->>'channel' FOR UPDATE;
  IF delivery.state='sending' THEN
   UPDATE private.deliveries SET state='unknown',result='{"code":"ABANDONED_ATTEMPT"}' WHERE id=delivery.id;
   UPDATE private.resources SET status='unknown',version=version+1,updated_at=now() WHERE id=r.id;
   RETURN '{"status":"unknown"}';
  END IF;
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
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_modules;
CREATE OR REPLACE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op' IN ('conversion_prepare','conversion_finish','delivery_reconcile','export_read','price_import','page_schedule','membership_list','membership_save','delivery_prepare','delivery_finish','schedule_tick','metrics_rebuild','metrics_daily','audit_list','job_list','job_replay') THEN RETURN private.operations_dispatch(command); END IF;
 RETURN api.dispatch_modules(command);
END $$;
GRANT USAGE ON SCHEMA pgmq TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgmq TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA pgmq TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private TO service_role;
GRANT EXECUTE ON FUNCTION private.allowed_topic(text) TO authenticated;
COMMIT;
