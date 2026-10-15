BEGIN;
CREATE TABLE private.measurement_occurrences(
 id uuid PRIMARY KEY,lead_id uuid NOT NULL REFERENCES private.leads(id) ON DELETE CASCADE,
 stage text NOT NULL CHECK(stage IN ('lead','qualified','closed','installed')),event_time timestamptz NOT NULL,
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(lead_id,stage)
);
CREATE INDEX measurement_occurrence_time ON private.measurement_occurrences(event_time DESC,id);
CREATE TABLE private.measurement_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),occurrence_id uuid NOT NULL REFERENCES private.measurement_occurrences(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES private.measurement_connections(id),rule jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','received','unknown','retry','failed','disabled','consent_denied')),
 attempt int NOT NULL DEFAULT 0,lease_token uuid,lease_until timestamptz,result jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(occurrence_id,connection_id)
);
CREATE INDEX measurement_delivery_work ON private.measurement_deliveries(state,updated_at,id);
CREATE FUNCTION private.measurement_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE env text:=NEW.payload->>'measurement_environment';host text:=NEW.payload->>'measurement_host';path text:=coalesce(NEW.payload->>'measurement_path','/');
 p jsonb:='{}';rules jsonb:='[]';versions jsonb:='[]';r record;window_days int;sid uuid:=(NEW.payload->>'session_id')::uuid;first_source jsonb;last_source jsonb;
BEGIN
 FOR r IN SELECT a.scope,rel.id,rel.payload FROM private.measurement_active a JOIN private.measurement_releases rel ON rel.id=a.release_id
 WHERE a.environment=env AND (a.scope='global' OR a.scope='domain' AND a.scope_key=host OR a.scope='landing' AND a.scope_key=path)
 ORDER BY CASE a.scope WHEN 'global' THEN 0 WHEN 'domain' THEN 1 ELSE 2 END LOOP
  p:=p||coalesce(r.payload->'policy','{}');
  IF r.payload ? 'rules' THEN rules:=r.payload->'rules';END IF;
  versions:=versions||jsonb_build_array(r.id);
 END LOOP;
 window_days:=least(90,greatest(1,coalesce((p->>'attribution_window_days')::int,30)));
 IF EXISTS(SELECT 1 FROM private.sessions WHERE id=sid AND analytics) THEN
  SELECT payload-'click_id_ciphertext'-'provider_ids_ciphertext' INTO first_source FROM private.touches WHERE session_id=sid AND created_at>now()-make_interval(days=>window_days) ORDER BY created_at,id LIMIT 1;
  SELECT payload-'click_id_ciphertext'-'provider_ids_ciphertext' INTO last_source FROM private.touches WHERE session_id=sid AND created_at>now()-make_interval(days=>window_days) ORDER BY created_at DESC,id DESC LIMIT 1;
  NEW.payload:=jsonb_set(NEW.payload,'{attribution}',jsonb_build_object('first_touch',first_source,'last_touch',last_source));
 END IF;
 NEW.payload:=NEW.payload||jsonb_build_object('measurement',jsonb_build_object('versions',versions,'policy',p,'rules',rules,'environment',env,'path',path));
 RETURN NEW;
END $$;
CREATE TRIGGER measurement_snapshot BEFORE INSERT ON private.leads FOR EACH ROW EXECUTE FUNCTION private.measurement_snapshot();
CREATE FUNCTION private.measurement_occurrence(p_lead uuid,p_stage text,p_time timestamptz) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l private.leads;event uuid;rule jsonb;conn private.measurement_connections;delivery uuid;
BEGIN
 SELECT * INTO l FROM private.leads WHERE id=p_lead;
 IF l.id IS NULL THEN RETURN;END IF;
 event:=CASE WHEN p_stage='lead' THEN l.event_id ELSE md5(l.event_id::text||':'||p_stage)::uuid END;
 INSERT INTO private.measurement_occurrences(id,lead_id,stage,event_time,snapshot)
 VALUES(event,l.id,p_stage,p_time,jsonb_build_object('source',l.payload->'attribution'->'last_touch','measurement',l.payload->'measurement')) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN; END IF;
 FOR rule IN SELECT value FROM jsonb_array_elements(coalesce(l.payload->'measurement'->'rules','[]')) WHERE value->>'event'=p_stage AND value->>'route'='server' LOOP
  SELECT * INTO conn FROM private.measurement_connections WHERE id=(rule->>'connection_id')::uuid;
  IF conn.id IS NULL THEN CONTINUE; END IF;
  INSERT INTO private.measurement_deliveries(occurrence_id,connection_id,rule) VALUES(event,conn.id,rule) ON CONFLICT DO NOTHING RETURNING id INTO delivery;
  IF FOUND THEN PERFORM private.enqueue('conversions','measurement_conversion',delivery,'measurement:'||delivery::text); END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.measurement_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='leads' THEN PERFORM private.measurement_occurrence(NEW.id,'lead',NEW.created_at);
 ELSIF NEW.kind='transition' AND NEW.payload->>'to' IN ('qualified','closed','installed') THEN PERFORM private.measurement_occurrence(NEW.lead_id,NEW.payload->>'to',NEW.created_at); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER measurement_intake AFTER INSERT ON private.leads FOR EACH ROW EXECUTE FUNCTION private.measurement_record();
CREATE TRIGGER measurement_crm AFTER INSERT ON private.activities FOR EACH ROW EXECUTE FUNCTION private.measurement_record();
CREATE FUNCTION private.measurement_delivery_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op';d private.measurement_deliveries;o private.measurement_occurrences;l private.leads;conn private.measurement_connections;s private.measurement_secrets;token uuid;actor uuid:=(c->>'actor')::uuid;sid uuid;
BEGIN
 IF op IN ('measurement_delivery_list','measurement_delivery_retry') THEN
  IF actor IS NULL OR NOT private.permitted(actor,CASE WHEN op='measurement_delivery_retry' THEN 'measurement.replay' ELSE 'measurement.read' END,'00000000-0000-0000-0000-000000000000') THEN RETURN '{"error":"PERMISSION_DENIED","status":403}'; END IF;
 END IF;
 IF op='measurement_delivery_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(x) FROM(SELECT d.id,d.occurrence_id,d.connection_id,d.state,d.attempt,d.result,d.created_at,d.updated_at,o.stage,o.event_time FROM private.measurement_deliveries d JOIN private.measurement_occurrences o ON o.id=d.occurrence_id ORDER BY d.updated_at DESC,d.id DESC LIMIT 100)x),'[]')); END IF;
 SELECT * INTO d FROM private.measurement_deliveries WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF d.id IS NULL THEN RETURN '{"status":"not_found"}'; END IF;
 SELECT * INTO o FROM private.measurement_occurrences WHERE id=d.occurrence_id;
 SELECT * INTO l FROM private.leads WHERE id=o.lead_id;
 sid:=(l.payload->>'session_id')::uuid;
 IF op='measurement_delivery_finish' THEN
  IF d.state<>'sending' OR d.lease_token IS DISTINCT FROM (c->>'lease_token')::uuid THEN RETURN '{"saved":false}'; END IF;
  IF c->>'state' NOT IN ('accepted','received','unknown','retry','failed','disabled') THEN RETURN '{"error":"INVALID_DELIVERY_STATE","status":422}'; END IF;
  UPDATE private.measurement_deliveries SET state=c->>'state',result=jsonb_build_object('code',left(c->>'code',80),'provider_id',left(c->>'provider_id',200)),updated_at=now(),lease_until=NULL WHERE id=d.id;
  RETURN '{"saved":true}';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.sessions WHERE id=sid AND analytics AND marketing AND advertising) OR NOT coalesce((l.payload->>'marketing_opt_in')::bool,false) THEN
  UPDATE private.measurement_deliveries SET state='consent_denied',updated_at=now() WHERE id=d.id AND state NOT IN ('accepted','received');RETURN '{"status":"consent_denied"}'; END IF;
 SELECT * INTO conn FROM private.measurement_connections WHERE id=d.connection_id FOR SHARE;
 IF NOT coalesce((conn.payload->>'enabled')::bool,false) OR NOT coalesce((conn.payload->'settings'->>'server_enabled')::bool,false) THEN
  UPDATE private.measurement_deliveries SET state='disabled',updated_at=now() WHERE id=d.id AND state NOT IN ('accepted','received');RETURN '{"status":"disabled"}'; END IF;
 IF op='measurement_delivery_retry' THEN
  IF d.state NOT IN ('retry','failed','disabled') OR d.attempt>=10 THEN RETURN '{"error":"DELIVERY_NOT_RETRYABLE","status":409}'; END IF;
  UPDATE private.measurement_deliveries SET state='retry',updated_at=now() WHERE id=d.id;
  UPDATE private.jobs SET state='pending',next_attempt_at=now() WHERE entity_id=d.id AND kind='measurement_conversion' AND state NOT IN ('running','pending');
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,d.id,op);
  RETURN '{"queued":true}';
 END IF;
 IF d.state='sending' AND d.lease_until<=now() THEN UPDATE private.measurement_deliveries SET state='unknown',updated_at=now() WHERE id=d.id;RETURN '{"status":"unknown"}';END IF;
 IF d.state NOT IN ('pending','retry') THEN RETURN jsonb_build_object('status',d.state);END IF;
 SELECT * INTO s FROM private.measurement_secrets WHERE connection_id=conn.id;
 token:=gen_random_uuid();
 UPDATE private.measurement_deliveries SET state='sending',attempt=attempt+1,lease_token=token,lease_until=now()+interval '30 seconds',updated_at=now() WHERE id=d.id;
 RETURN jsonb_build_object('status','ready','lease_token',token,'connection',conn.payload,'secret_ciphertext',CASE WHEN s.expires_at IS NULL OR s.expires_at>now() THEN s.ciphertext END,
  'rule',d.rule,'event',jsonb_build_object('event_id',o.id,'event_time',o.event_time,'stage',o.stage,'source',o.snapshot->'source'),
  'provider_ids_ciphertext',(SELECT payload->>'provider_ids_ciphertext' FROM private.touches WHERE session_id=sid ORDER BY created_at DESC,id DESC LIMIT 1),
  'click_id_ciphertext',CASE WHEN l.click_id_expires_at>now() THEN l.click_id_ciphertext END);
END $$;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_measurement_ledger;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op' LIKE 'measurement_delivery_%' THEN RETURN private.measurement_delivery_dispatch(command); END IF;
 IF command->>'op'='conversion_prepare' AND EXISTS(SELECT 1 FROM private.leads l,jsonb_array_elements(coalesce(l.payload->'measurement'->'rules','[]')) r WHERE l.id=(command->>'id')::uuid AND r->>'event'=coalesce(command->>'stage','lead')) THEN RETURN '{"status":"managed_destination"}'; END IF;
 RETURN api.dispatch_before_measurement_ledger(command);
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['measurement_occurrences','measurement_deliveries'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON private.%I TO service_role',t);END LOOP; END $$;
REVOKE ALL ON FUNCTION private.measurement_snapshot(),private.measurement_occurrence(uuid,text,timestamptz),private.measurement_record(),private.measurement_delivery_dispatch(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_ledger(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_snapshot(),private.measurement_occurrence(uuid,text,timestamptz),private.measurement_record(),private.measurement_delivery_dispatch(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_ledger(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
