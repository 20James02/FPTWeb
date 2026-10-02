BEGIN;
CREATE TABLE private.quotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payload jsonb NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE private.quotes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.quotes TO service_role;
CREATE OR REPLACE FUNCTION private.permitted(p_actor uuid,p_permission text,p_branch uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
SELECT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=p_actor AND active AND (p_permission=ANY(permissions) OR '*'=ANY(permissions)) AND (p_branch IS NULL OR branch_id=p_branch OR branch_id='00000000-0000-0000-0000-000000000000')) $$;
CREATE OR REPLACE FUNCTION private.resource_permission(kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN kind IN ('plan','region','product','promotion') THEN 'catalog.write'
 WHEN kind IN ('page','media') THEN 'content.write'
 WHEN kind IN ('campaign','experiment','integration','cost') THEN 'marketing.write'
 WHEN kind IN ('export','privacy') THEN 'governance.write' ELSE 'care.write' END $$;
CREATE OR REPLACE FUNCTION private.resource_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE op text:=c->>'op'; kind text:=c->>'kind'; actor uuid:=(c->>'actor')::uuid; b uuid:=(c->>'branch_id')::uuid;
 r private.resources; p private.prices; data jsonb:=c->'payload'; pid uuid;
BEGIN
 IF op='public_catalog' THEN
  IF kind NOT IN ('plan','region','product') THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'version',published_version)||published_payload) FROM private.resources WHERE resources.kind=kind AND status='published'),'[]'::jsonb));
 ELSIF op='resource_save' THEN
  IF NOT private.permitted(actor,private.resource_permission(kind),coalesce(b,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.resources(kind,branch_id,payload) VALUES(kind,b,data) RETURNING * INTO r;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,b,r.id,kind||'.created');
  RETURN to_jsonb(r);
 ELSIF op='resource_publish' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND resources.kind=kind FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,CASE WHEN kind='page' THEN 'content.publish' ELSE private.resource_permission(kind) END,coalesce(r.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF r.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  UPDATE private.resources SET status='published',published_payload=payload,published_version=version+1,version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  INSERT INTO private.catalog_revision(id,version) VALUES(true,1) ON CONFLICT(id) DO UPDATE SET version=private.catalog_revision.version+1;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,r.branch_id,r.id,kind||'.published');
  RETURN to_jsonb(r);
 ELSIF op='price_create' THEN
  IF data->>'scope_kind'='region' THEN
   SELECT branch_id INTO b FROM private.resources WHERE id=(data->>'scope_id')::uuid AND resources.kind='region';
   IF b IS NULL THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
  ELSE b:='00000000-0000-0000-0000-000000000000'; END IF;
  IF NOT private.permitted(actor,'pricing.write',b) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(data->>'plan_id')::uuid AND resources.kind='plan') THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
  INSERT INTO private.prices(plan_id,scope_id,scope_kind,billing_months,monthly_vnd,setup_vnd,equipment_vnd,vat_included,vat_bps,gift_months,effective,source)
  VALUES((data->>'plan_id')::uuid,(data->>'scope_id')::uuid,data->>'scope_kind',(data->>'billing_months')::int,(data->>'monthly_vnd')::bigint,(data->>'setup_vnd')::bigint,(data->>'equipment_vnd')::bigint,(data->>'vat_included')::bool,(data->>'vat_bps')::int,(data->>'gift_months')::int,tstzrange((data->>'start')::timestamptz,(data->>'end')::timestamptz,'[)'),data->>'source') RETURNING * INTO p;
  RETURN to_jsonb(p);
 ELSIF op='price_publish' THEN
  SELECT * INTO p FROM private.prices WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF p.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  b:=CASE WHEN p.scope_kind='region' THEN (SELECT branch_id FROM private.resources WHERE id=p.scope_id AND resources.kind='region') ELSE '00000000-0000-0000-0000-000000000000'::uuid END;
  IF NOT private.permitted(actor,'pricing.publish',b) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF p.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  UPDATE private.prices SET status='published',approved_by=actor,version=version+1 WHERE id=p.id RETURNING * INTO p;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,p.id,'price.published');
  RETURN to_jsonb(p);
 ELSIF op='pricing_data' THEN
  IF NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(c->>'plan_id')::uuid AND resources.kind='plan' AND status='published') THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
  SELECT * INTO r FROM private.resources WHERE id=(c->>'region_id')::uuid AND resources.kind='region' AND status='published';
  RETURN jsonb_build_object('prices',coalesce((SELECT jsonb_agg(to_jsonb(prices)-'effective'||jsonb_build_object('start',lower(effective),'end',upper(effective))) FROM private.prices WHERE plan_id=(c->>'plan_id')::uuid AND status='published'),'[]'::jsonb),'promotions',coalesce((SELECT jsonb_agg(published_payload||jsonb_build_object('id',id)) FROM private.resources WHERE resources.kind='promotion' AND status='published'),'[]'::jsonb),'group_id',r.published_payload->>'price_group_id','revision',coalesce((SELECT version FROM private.catalog_revision WHERE id),1));
 ELSIF op='quote_save' THEN
  INSERT INTO private.quotes(payload,expires_at) VALUES(data,(data->>'expires_at')::timestamptz) RETURNING id INTO pid;
  RETURN jsonb_build_object('id',pid);
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
EXCEPTION WHEN exclusion_violation THEN RETURN jsonb_build_object('error','PRICE_OVERLAP','status',409);
END $$;
CREATE OR REPLACE FUNCTION private.consume_bucket(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE r private.rate_buckets; capacity numeric:=(c->>'capacity')::numeric; rate numeric:=(c->>'rate')::numeric; available numeric;
BEGIN
 INSERT INTO private.rate_buckets(key,tokens,updated_at,expires_at) VALUES(c->>'key',capacity,clock_timestamp(),now()+interval '1 day') ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM private.rate_buckets WHERE key=c->>'key' FOR UPDATE;
 available:=least(capacity,r.tokens+greatest(0,extract(epoch FROM clock_timestamp()-r.updated_at))*rate);
 UPDATE private.rate_buckets SET tokens=greatest(0,available-1),updated_at=clock_timestamp(),expires_at=now()+interval '1 day' WHERE key=r.key;
 RETURN jsonb_build_object('allowed',available>=1,'retry_after',ceil(greatest(0,1-available)/rate));
END $$;
DO $$ DECLARE q text; BEGIN FOREACH q IN ARRAY ARRAY['lead_local','lead_external','conversions','notifications','maintenance'] LOOP PERFORM pgmq.create(q); END LOOP; END $$;
CREATE OR REPLACE FUNCTION private.enqueue(q text,k text,entity uuid,dedup text,v int DEFAULT 1) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE jid uuid; mid bigint;
BEGIN
 INSERT INTO private.jobs(queue,kind,entity_id,dedup_key,version) VALUES(q,k,entity,dedup,v) ON CONFLICT(dedup_key) DO NOTHING RETURNING id INTO jid;
 IF jid IS NOT NULL THEN
  SELECT pgmq.send(q,jsonb_build_object('job_id',jid)) INTO mid;
  UPDATE private.jobs SET msg_id=mid WHERE id=jid;
  INSERT INTO private.wake_signals(job_id) VALUES(jid);
 END IF;
 RETURN jid;
END $$;
CREATE OR REPLACE FUNCTION api.submit_lead(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c jsonb:=command; idem private.idempotency; contact uuid; lead private.leads; q private.quotes; b uuid; bucket jsonb; d jsonb; result jsonb; qs text:='needs_confirmation';
BEGIN
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
   c:=jsonb_set(c,'{payload,attribution}',jsonb_build_object('first_touch',(SELECT payload-'click_id_ciphertext' FROM private.touches WHERE session_id=(c->>'session_id')::uuid ORDER BY created_at,id LIMIT 1),'last_touch',(SELECT payload-'click_id_ciphertext' FROM private.touches WHERE session_id=(c->>'session_id')::uuid ORDER BY created_at DESC,id DESC LIMIT 1)));
  ELSE c:=jsonb_set(c,'{payload}',(c->'payload')-'session_id'); END IF;
 END IF;
 INSERT INTO private.contacts(phone_hmac,phone_ciphertext,key_version) VALUES(c->>'phone_hmac',c->>'phone_ciphertext',coalesce(c->>'key_version','v1')) ON CONFLICT(phone_hmac) DO UPDATE SET phone_hmac=excluded.phone_hmac RETURNING id INTO contact;
 INSERT INTO private.leads(contact_id,branch_id,payload,pii_ciphertext,quote,quote_status,sla_due_at) VALUES(contact,b,c->'payload',c->>'pii_ciphertext',q.payload,qs,(c->>'sla_due_at')::timestamptz) RETURNING * INTO lead;
 INSERT INTO private.audit(branch_id,entity_id,action) VALUES(b,lead.id,'lead.created');
 PERFORM private.enqueue('lead_local','enrich_local',lead.id,'enrich:'||lead.id||':1');
 result:=jsonb_build_object('receipt',lead.receipt,'event_id',lead.event_id,'quote_status',qs,'next_action','await_contact');
 UPDATE private.idempotency SET result=result WHERE key=idem.key;
 RETURN result||'{"replayed":false}'::jsonb;
END $$;
CREATE OR REPLACE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='identity' THEN RETURN jsonb_build_object('memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('branch_id',branch_id,'permissions',permissions)) FROM private.memberships WHERE user_id=(command->>'subject')::uuid AND active),'[]'::jsonb)); END IF;
 RETURN private.resource_dispatch(command);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
COMMIT;
