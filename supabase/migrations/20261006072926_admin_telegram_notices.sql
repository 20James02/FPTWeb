BEGIN;
-- Reuse the durable queue and delivery ledger. Server settings opt in without
-- enabling advertising connectors or exposing customer contact data.
ALTER FUNCTION api.submit_lead(jsonb) RENAME TO submit_lead_before_admin_telegram;
CREATE FUNCTION api.submit_lead(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb; lead_id uuid;
BEGIN
 result:=api.submit_lead_before_admin_telegram(command);
 IF coalesce((command->>'notify_admin')::boolean,false) AND NOT result ? 'error' AND result->>'event_id' IS NOT NULL THEN
  SELECT id INTO lead_id FROM private.leads WHERE event_id=(result->>'event_id')::uuid;
  IF lead_id IS NOT NULL THEN
   PERFORM private.enqueue('notifications','admin_notice',lead_id,'admin-telegram:lead:'||lead_id);
  END IF;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION private.admin_notice_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE job private.jobs; delivery private.deliveries; l private.leads; notice jsonb; jid uuid;
BEGIN
 IF c->>'op'='admin_notice_enqueue_recovery' THEN
  jid:=private.enqueue('notifications','admin_notice',(c->>'event_id')::uuid,'admin-telegram:recovery:'||(c->>'event_id'));
  UPDATE private.jobs SET job_command='{"kind":"recovery_requested"}' WHERE id=jid;
  RETURN jsonb_build_object('queued',jid IS NOT NULL);
 END IF;
 SELECT * INTO job FROM private.jobs WHERE id=(c->>'id')::uuid AND kind='admin_notice' FOR UPDATE;
 IF job.id IS NULL OR job.state<>'running' OR job.fence<>(c->>'fence')::bigint OR job.lease_until<=now() THEN
  RETURN jsonb_build_object('status','stale');
 END IF;
 IF c->>'op'='admin_notice_finish' THEN
  IF c->>'state' NOT IN ('accepted','unknown','retry','failed','disabled') THEN
   RETURN jsonb_build_object('error','INVALID_DELIVERY_STATE','status',422);
  END IF;
  UPDATE private.deliveries SET state=c->>'state',result=c->'result' WHERE platform='admin_telegram' AND event_id=job.id AND state='sending';
  RETURN jsonb_build_object('saved',FOUND);
 END IF;
 IF job.job_command->>'kind'='recovery_requested' THEN
  notice:=jsonb_build_object('kind','recovery_requested','created_at',job.created_at);
 ELSE
  SELECT * INTO l FROM private.leads WHERE id=job.entity_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('status','cancelled'); END IF;
  notice:=jsonb_build_object('kind','lead_created','lead_id',l.id,'receipt',l.receipt,'created_at',l.created_at,
   'plan',(SELECT coalesce(r.published_payload->>'name',r.payload->>'name') FROM private.resources r WHERE kind='plan' AND r.id=nullif(l.payload->>'plan_id','')::uuid));
 END IF;
 INSERT INTO private.deliveries(platform,event_id,account_id) VALUES('admin_telegram',job.id,'telegram') ON CONFLICT DO NOTHING;
 SELECT * INTO delivery FROM private.deliveries WHERE platform='admin_telegram' AND event_id=job.id AND account_id='telegram' FOR UPDATE;
 IF delivery.state='sending' THEN
  UPDATE private.deliveries SET state='unknown',result='{"code":"ABANDONED_ATTEMPT"}' WHERE id=delivery.id;
  RETURN jsonb_build_object('status','unknown');
 END IF;
 IF delivery.state NOT IN ('pending','retry','disabled') THEN RETURN jsonb_build_object('status',delivery.state); END IF;
 UPDATE private.deliveries SET state='sending',attempt=attempt+1 WHERE id=delivery.id;
 RETURN jsonb_build_object('status','ready','notice',notice);
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_admin_telegram;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op' IN ('admin_notice_enqueue_recovery','admin_notice_prepare','admin_notice_finish') THEN
  RETURN private.admin_notice_dispatch(command);
 END IF;
 RETURN api.dispatch_before_admin_telegram(command);
END $$;
REVOKE EXECUTE ON FUNCTION api.submit_lead(jsonb),api.dispatch(jsonb),private.admin_notice_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.submit_lead(jsonb),api.dispatch(jsonb),private.admin_notice_dispatch(jsonb) TO service_role;
COMMIT;
