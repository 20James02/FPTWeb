BEGIN;
ALTER TABLE private.measurement_connections ADD COLUMN refresh_lease uuid, ADD COLUMN refresh_lease_until timestamptz;
CREATE TABLE private.measurement_traffic_facts(connection_id uuid NOT NULL REFERENCES private.measurement_connections(id),day date NOT NULL,source text NOT NULL,campaign text NOT NULL,sessions bigint NOT NULL,engaged_sessions bigint NOT NULL,average_session_seconds numeric NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(connection_id,day,source,campaign));
CREATE TABLE private.measurement_oauth_states(nonce_hash text PRIMARY KEY,actor_id uuid NOT NULL,connection_id uuid NOT NULL REFERENCES private.measurement_connections(id),verifier_ciphertext text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz);
CREATE TABLE private.measurement_sync_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES private.measurement_connections(id),actor_id uuid NOT NULL,payload jsonb NOT NULL,state text NOT NULL DEFAULT 'pending',result jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),lease_token uuid,lease_until timestamptz,page_count int NOT NULL DEFAULT 0);
ALTER TABLE private.measurement_sync_jobs ADD COLUMN pending_cursor text;
CREATE TABLE private.measurement_sync_chunks(job_id uuid NOT NULL REFERENCES private.measurement_sync_jobs(id) ON DELETE CASCADE,chunk_number int NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(job_id,chunk_number));
CREATE FUNCTION private.measurement_source_identity(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('provider',p->>'provider','environment',p->>'environment','customer_id',nullif(p->'settings'->>'customer_id',''),'ad_account_id',nullif(p->'settings'->>'ad_account_id',''),'property_id',nullif(p->'settings'->>'property_id',''),'stream_id',nullif(p->'settings'->>'stream_id',''),'currency',coalesce(p->'settings'->>'currency','VND'))
$$;
ALTER TABLE private.measurement_sync_jobs ADD COLUMN source_identity jsonb NOT NULL DEFAULT '{}';
CREATE FUNCTION private.measurement_sync_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF private.measurement_source_identity(OLD.payload) IS DISTINCT FROM private.measurement_source_identity(NEW.payload) AND
 (EXISTS(SELECT 1 FROM private.measurement_sync_jobs WHERE connection_id=OLD.id AND state IN ('pending','running','retry')) OR EXISTS(SELECT 1 FROM private.measurement_traffic_facts WHERE connection_id=OLD.id)) THEN RAISE EXCEPTION 'Sync source identity is immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER measurement_sync_identity BEFORE UPDATE ON private.measurement_connections FOR EACH ROW EXECUTE FUNCTION private.measurement_sync_identity_guard();
REVOKE ALL ON FUNCTION private.measurement_source_identity(jsonb),private.measurement_sync_identity_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_source_identity(jsonb),private.measurement_sync_identity_guard() TO service_role;
CREATE FUNCTION private.measurement_account_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op';actor uuid:=(c->>'actor')::uuid;row private.measurement_connections;s private.measurement_secrets;state private.measurement_oauth_states;sid uuid;perm text;j private.measurement_sync_jobs;token uuid;chunk private.measurement_sync_chunks;has_chunks boolean;next_cursor text;
BEGIN
 IF op IN ('measurement_token_prepare','measurement_token_finish') THEN
  SELECT * INTO row FROM private.measurement_connections WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF row.id IS NULL THEN RETURN '{"error":"NOT_FOUND","status":404}';END IF;
  SELECT * INTO s FROM private.measurement_secrets WHERE connection_id=row.id;
  IF op='measurement_token_finish' THEN
   IF row.refresh_lease IS DISTINCT FROM (c->>'lease_token')::uuid OR row.version<>(c->>'expected_version')::int THEN RETURN '{"saved":false}';END IF;
   UPDATE private.measurement_secrets SET ciphertext=c->>'ciphertext',expires_at=(c->>'expires_at')::timestamptz,rotated_at=now() WHERE connection_id=row.id;
   UPDATE private.measurement_connections SET version=version+1,refresh_lease=NULL,refresh_lease_until=NULL,updated_at=now() WHERE id=row.id;
   RETURN '{"saved":true}';
  END IF;
  IF s.connection_id IS NULL THEN RETURN '{"status":"ready"}';END IF;
  IF s.expires_at IS NULL OR s.expires_at>now()+interval '30 seconds' THEN RETURN jsonb_build_object('status','ready','ciphertext',s.ciphertext);END IF;
  IF row.refresh_lease_until>now() THEN RETURN '{"error":"TOKEN_REFRESH_BUSY","status":503}';END IF;
  token:=gen_random_uuid();UPDATE private.measurement_connections SET refresh_lease=token,refresh_lease_until=now()+interval '15 seconds' WHERE id=row.id;
  RETURN jsonb_build_object('status','refresh','ciphertext',s.ciphertext,'provider',row.payload->>'provider','version',row.version,'lease_token',token);
 END IF;
 IF op IN ('measurement_sync_read','measurement_sync_finish','measurement_sync_stage') THEN SELECT * INTO j FROM private.measurement_sync_jobs WHERE id=(c->>'id')::uuid FOR UPDATE;IF j.id IS NULL THEN RETURN '{"status":"not_found"}';END IF;actor:=j.actor_id;END IF;
 perm:=CASE WHEN op='measurement_external_audit' THEN 'measurement.external_write' WHEN op IN ('measurement_oauth_start','measurement_oauth_consume') THEN 'measurement.credentials' WHEN op IN ('measurement_sync_list','measurement_traffic_report') THEN 'measurement.read' ELSE 'measurement.configure' END;
 IF actor IS NULL OR NOT (private.permitted(actor,perm,'00000000-0000-0000-0000-000000000000') OR op='measurement_connection_private' AND private.permitted(actor,'measurement.credentials','00000000-0000-0000-0000-000000000000')) THEN IF op='measurement_sync_read' THEN UPDATE private.measurement_sync_jobs SET state='cancelled',result='{"code":"PERMISSION_DENIED"}',updated_at=now() WHERE id=j.id;RETURN '{"status":"cancelled"}';END IF;RETURN '{"error":"PERMISSION_DENIED","status":403}'; END IF;
 IF op='measurement_traffic_report' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(x) FROM(SELECT t.connection_id,sum(t.sessions) sessions,sum(t.engaged_sessions) engaged_sessions,sum(t.average_session_seconds*t.sessions)/nullif(sum(t.sessions),0) average_session_seconds,max(t.updated_at) synced_at FROM private.measurement_traffic_facts t JOIN private.measurement_connections cn ON cn.id=t.connection_id WHERE t.day BETWEEN (c->>'start')::date AND (c->>'end')::date AND cn.payload->>'environment'=c->>'environment' GROUP BY t.connection_id)x),'[]'));END IF;
 IF op='measurement_sync_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(x) FROM(SELECT id,connection_id,state,result,created_at,updated_at FROM private.measurement_sync_jobs ORDER BY created_at DESC LIMIT 100)x),'[]'));END IF;
 SELECT * INTO row FROM private.measurement_connections WHERE id=CASE WHEN j.id IS NOT NULL THEN j.connection_id ELSE (c->>'id')::uuid END FOR UPDATE;
 IF row.id IS NULL THEN RETURN '{"error":"NOT_FOUND","status":404}';END IF;
 IF j.id IS NOT NULL AND j.source_identity IS DISTINCT FROM private.measurement_source_identity(row.payload) THEN UPDATE private.measurement_sync_jobs SET state='failed',result='{"code":"SYNC_SOURCE_CHANGED"}',updated_at=now() WHERE id=j.id;RETURN '{"error":"SYNC_SOURCE_CHANGED","status":409}';END IF;
 IF op='measurement_sync_stage' THEN
  IF j.state<>'running' OR j.lease_token IS DISTINCT FROM (c->>'lease_token')::uuid THEN RETURN '{"error":"SYNC_LEASE_LOST","status":503}';END IF;
  IF jsonb_array_length(c->'rows')>10000 THEN RETURN '{"error":"PROVIDER_PAGE_TOO_LARGE","status":422}';END IF;
  IF NOT EXISTS(SELECT 1 FROM private.measurement_sync_chunks WHERE job_id=j.id) THEN
   INSERT INTO private.measurement_sync_chunks(job_id,chunk_number,payload) SELECT j.id,((ord-1)/50)::int,jsonb_agg(elem ORDER BY ord) FROM jsonb_array_elements(c->'rows') WITH ORDINALITY v(elem,ord) GROUP BY ((ord-1)/50)::int;
   UPDATE private.measurement_sync_jobs SET pending_cursor=c->>'cursor' WHERE id=j.id;
  END IF;
  SELECT * INTO chunk FROM private.measurement_sync_chunks WHERE job_id=j.id ORDER BY chunk_number LIMIT 1;
  RETURN jsonb_build_object('chunk',CASE WHEN chunk.job_id IS NOT NULL THEN jsonb_build_object('number',chunk.chunk_number,'rows',chunk.payload) END);
 ELSIF op='measurement_traffic_apply' THEN
  IF NOT EXISTS(SELECT 1 FROM private.measurement_sync_jobs sj WHERE sj.id=(c->>'sync_job_id')::uuid AND sj.connection_id=row.id AND sj.state='running' AND sj.lease_token=(c->>'sync_lease_token')::uuid AND sj.source_identity=private.measurement_source_identity(row.payload)) THEN RETURN '{"error":"SYNC_SOURCE_CHANGED","status":409}';END IF;
  INSERT INTO private.measurement_traffic_facts(connection_id,day,source,campaign,sessions,engaged_sessions,average_session_seconds) SELECT row.id,(v->>'day')::date,v->>'source',v->>'campaign',(v->>'sessions')::bigint,(v->>'engaged_sessions')::bigint,(v->>'average_session_seconds')::numeric FROM jsonb_array_elements(c->'rows')v ON CONFLICT(connection_id,day,source,campaign) DO UPDATE SET sessions=excluded.sessions,engaged_sessions=excluded.engaged_sessions,average_session_seconds=excluded.average_session_seconds,updated_at=now();RETURN '{"saved":true}';
 ELSIF op='measurement_external_audit' THEN INSERT INTO private.audit(actor_id,entity_id,action,payload) VALUES(actor,(c->>'campaign_id')::uuid,op,jsonb_build_object('connection_id',row.id,'before_hash',c->>'before_hash','after_hash',c->>'after_hash'));RETURN '{"saved":true}';
 ELSIF op='measurement_sync_read' THEN
  IF j.state='running' AND j.lease_until<=now() THEN UPDATE private.measurement_sync_jobs SET state='retry',updated_at=now() WHERE id=j.id;j.state:='retry';END IF;
  IF NOT coalesce((row.payload->>'enabled')::bool,false) THEN UPDATE private.measurement_sync_jobs SET state='cancelled',result='{}',updated_at=now() WHERE id=j.id;RETURN '{"status":"disabled"}';END IF;
  IF j.state NOT IN ('pending','retry') THEN RETURN jsonb_build_object('status',j.state);END IF;
  token:=gen_random_uuid();UPDATE private.measurement_sync_jobs SET state='running',lease_token=token,lease_until=now()+interval '30 seconds',updated_at=now() WHERE id=j.id;
  SELECT * INTO s FROM private.measurement_secrets WHERE connection_id=row.id;
  SELECT * INTO chunk FROM private.measurement_sync_chunks WHERE job_id=j.id ORDER BY chunk_number LIMIT 1;
  RETURN jsonb_build_object('chunk',CASE WHEN chunk.job_id IS NOT NULL THEN jsonb_build_object('number',chunk.chunk_number,'rows',chunk.payload) END,'cursor',j.pending_cursor,'status','ready','lease_token',token,'actor_id',actor,'payload',j.payload,'connection',jsonb_build_object('id',row.id,'payload',row.payload,'version',row.version,'ciphertext',s.ciphertext,'expires_at',s.expires_at));
 ELSIF op='measurement_sync_finish' THEN
  IF j.state<>'running' OR j.lease_token IS DISTINCT FROM (c->>'lease_token')::uuid THEN RETURN '{"saved":false}';END IF;
  IF c->>'error_code' IS NOT NULL THEN UPDATE private.measurement_sync_jobs SET state=CASE WHEN coalesce((c->>'retry')::bool,false) THEN 'retry' ELSE 'failed' END,result=jsonb_build_object('code',left(c->>'error_code',80)),updated_at=now() WHERE id=j.id;RETURN '{"saved":true}';END IF;
  IF c->>'chunk_number' IS NOT NULL THEN
   DELETE FROM private.measurement_sync_chunks WHERE job_id=j.id AND chunk_number=(c->>'chunk_number')::int;
   IF NOT FOUND THEN RETURN '{"saved":false}';END IF;
  END IF;
  has_chunks:=EXISTS(SELECT 1 FROM private.measurement_sync_chunks WHERE job_id=j.id);
  next_cursor:=coalesce(c->>'cursor',j.pending_cursor);
  UPDATE private.measurement_sync_jobs SET state=CASE WHEN (has_chunks OR next_cursor IS NOT NULL) AND page_count<999 THEN 'pending' WHEN has_chunks OR next_cursor IS NOT NULL THEN 'failed' ELSE 'completed' END,
   payload=CASE WHEN has_chunks THEN payload WHEN next_cursor IS NOT NULL THEN payload||jsonb_build_object('cursor',next_cursor) ELSE payload-'cursor' END,
   pending_cursor=CASE WHEN has_chunks THEN j.pending_cursor ELSE NULL END,
   result=(c->'result')||jsonb_build_object('rows',coalesce((j.result->>'rows')::int,0)+coalesce((c->'result'->>'rows')::int,0)),page_count=page_count+1,updated_at=now() WHERE id=j.id;
  IF (has_chunks OR next_cursor IS NOT NULL) AND j.page_count<999 THEN PERFORM private.enqueue('maintenance','measurement_sync',j.id,'measurement-sync:'||j.id::text||':'||(j.page_count+1)::text);END IF;
  RETURN '{"saved":true}';
 ELSIF op='measurement_connection_private' THEN
  SELECT * INTO s FROM private.measurement_secrets WHERE connection_id=row.id;
  RETURN jsonb_build_object('id',row.id,'payload',row.payload,'version',row.version,'ciphertext',s.ciphertext,'expires_at',s.expires_at);
 ELSIF op='measurement_check_save' THEN
  IF row.version<>(c->>'expected_version')::int THEN RETURN '{"error":"VERSION_CONFLICT","status":409}';END IF;
  UPDATE private.measurement_connections SET checked_at=now(),check_result=c->'result' WHERE id=row.id;RETURN c->'result';
 ELSIF op='measurement_oauth_start' THEN
  INSERT INTO private.measurement_oauth_states(nonce_hash,actor_id,connection_id,verifier_ciphertext,expires_at) VALUES(c->>'nonce_hash',actor,row.id,c->>'verifier_ciphertext',now()+interval '10 minutes');
  DELETE FROM private.measurement_oauth_states WHERE expires_at<now()-interval '1 day';RETURN '{"saved":true}';
 ELSIF op='measurement_oauth_consume' THEN
  UPDATE private.measurement_oauth_states SET consumed_at=now() WHERE nonce_hash=c->>'nonce_hash' AND actor_id=actor AND connection_id=row.id AND expires_at>now() AND consumed_at IS NULL RETURNING * INTO state;
  IF state.nonce_hash IS NULL THEN RETURN '{"error":"INVALID_OAUTH_STATE","status":403}';END IF;
  RETURN jsonb_build_object('verifier_ciphertext',state.verifier_ciphertext);
 ELSIF op='measurement_sync_create' THEN
  INSERT INTO private.measurement_sync_jobs(connection_id,actor_id,payload,source_identity) VALUES(row.id,actor,c->'payload',private.measurement_source_identity(row.payload)) RETURNING id INTO sid;
  PERFORM private.enqueue('maintenance','measurement_sync',sid,'measurement-sync:'||sid::text);
  RETURN jsonb_build_object('id',sid,'state','pending');
 END IF;
 RETURN '{"error":"UNKNOWN_OPERATION","status":400}';
END $$;
CREATE FUNCTION private.measurement_session_source(c jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_build_object('campaign',t.payload->>'campaign_id','platform',coalesce(nullif(t.payload->>'platform',''),t.payload->>'utm_source')) FROM private.touches t JOIN private.sessions s ON s.id=t.session_id WHERE s.id=(c->>'id')::uuid AND s.analytics AND t.created_at>now()-make_interval(days=>least(90,greatest(1,(c->>'window_days')::int))) ORDER BY t.created_at DESC,t.id DESC LIMIT 1),'{}')
$$;
REVOKE ALL ON FUNCTION private.measurement_session_source(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_session_source(jsonb) TO service_role;
CREATE FUNCTION private.measurement_campaign_key(c jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('key',CASE WHEN count(*)=1 THEN min(r.id::text) ELSE '' END)
 FROM private.resources r JOIN private.measurement_connections cn ON cn.id::text=r.payload->>'connection_id'
 WHERE r.kind='campaign' AND r.status<>'deleted' AND r.payload->>'external_campaign_id'=c->>'campaign'
 AND cn.payload->>'environment'=c->>'environment' AND coalesce((cn.payload->>'enabled')::bool,false)
 AND r.payload->>'platform'=CASE WHEN c->>'platform' IN ('facebook','instagram') THEN 'meta' ELSE c->>'platform' END
 AND cn.payload->>'provider'=CASE WHEN r.payload->>'platform'='google' THEN 'google_ads' ELSE 'meta' END
$$;
REVOKE ALL ON FUNCTION private.measurement_campaign_key(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_campaign_key(jsonb) TO service_role;
CREATE INDEX measurement_sync_connection_time ON private.measurement_sync_jobs(connection_id,created_at DESC);
CREATE FUNCTION private.measurement_retention_days(env text) RETURNS int LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT greatest(1,least(90,coalesce((SELECT (r.payload->'policy'->>'retention_days')::int FROM private.measurement_active a JOIN private.measurement_releases r ON r.id=a.release_id WHERE a.scope='global' AND a.environment=env),90)))
$$;
REVOKE ALL ON FUNCTION private.measurement_retention_days(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_retention_days(text) TO service_role;
CREATE FUNCTION private.measurement_maintenance_tick() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row private.measurement_connections;owner uuid;period int;days int;retention int;today date:=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
 IF NOT pg_try_advisory_xact_lock(2879,1) THEN RETURN;END IF;
 FOR row IN SELECT * FROM private.measurement_connections WHERE coalesce((payload->>'enabled')::bool,false) AND coalesce((payload->'settings'->>'sync_interval_minutes')::int,0)>=15
 AND NOT EXISTS(SELECT 1 FROM private.measurement_sync_jobs j WHERE j.connection_id=measurement_connections.id AND (j.state IN ('pending','running','retry') OR j.created_at>now()-make_interval(mins=>least(1440,(measurement_connections.payload->'settings'->>'sync_interval_minutes')::int))))
 AND coalesce((SELECT private.permitted(a.actor_id,'measurement.configure','00000000-0000-0000-0000-000000000000') FROM private.audit a WHERE a.entity_id=measurement_connections.id AND a.action='measurement_connection_save' ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false)
 ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED LOOP
  period:=least(1440,(row.payload->'settings'->>'sync_interval_minutes')::int);
  days:=least(31,greatest(1,coalesce((row.payload->'settings'->>'sync_lookback_days')::int,3)));
  IF EXISTS(SELECT 1 FROM private.measurement_sync_jobs WHERE connection_id=row.id AND (state IN ('pending','running','retry') OR created_at>now()-make_interval(mins=>period))) THEN CONTINUE;END IF;
  SELECT actor_id INTO owner FROM private.audit WHERE entity_id=row.id AND action='measurement_connection_save' ORDER BY created_at DESC,id DESC LIMIT 1;
  IF owner IS NULL OR NOT private.permitted(owner,'measurement.configure','00000000-0000-0000-0000-000000000000') THEN CONTINUE;END IF;
  PERFORM private.measurement_account_dispatch(jsonb_build_object('op','measurement_sync_create','id',row.id,'actor',owner,'payload',jsonb_build_object('start',today-days+1,'end',today)));
 END LOOP;
 -- Conservative shared raw-data retention; business CRM and aggregate costs are separate.
 DELETE FROM private.touches WHERE id IN(SELECT id FROM private.touches WHERE created_at<now()-make_interval(days=>private.measurement_retention_days(coalesce(payload->>'environment','production'))) ORDER BY created_at,id LIMIT 200);
 DELETE FROM private.events WHERE (session_id,id) IN(SELECT session_id,id FROM private.events WHERE created_at<now()-make_interval(days=>private.measurement_retention_days(coalesce(payload->>'environment','production'))) ORDER BY created_at LIMIT 200);
 UPDATE private.measurement_occurrences SET snapshot=snapshot-'provider_ids_ciphertext'-'client_context_ciphertext' WHERE id IN(SELECT o.id FROM private.measurement_occurrences o JOIN private.leads l ON l.id=o.lead_id LEFT JOIN private.sessions s ON s.id=(l.payload->>'session_id')::uuid WHERE (o.snapshot->>'provider_ids_ciphertext' IS NOT NULL OR o.snapshot->>'client_context_ciphertext' IS NOT NULL) AND (l.created_at<now()-make_interval(days=>private.measurement_retention_days(l.payload->>'measurement_environment')) OR NOT coalesce(s.advertising,false)) ORDER BY o.created_at,o.id LIMIT 200);
 UPDATE private.leads SET click_id_ciphertext=NULL,click_id_expires_at=NULL WHERE id IN(SELECT id FROM private.leads WHERE click_id_ciphertext IS NOT NULL AND created_at<now()-make_interval(days=>private.measurement_retention_days(payload->>'measurement_environment')) ORDER BY created_at,id LIMIT 200);
 DELETE FROM private.measurement_oauth_states WHERE expires_at<now()-interval '1 day';
END $$;
REVOKE ALL ON FUNCTION private.measurement_maintenance_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_maintenance_tick() TO service_role;
-- Preserve the prior operations dispatcher verbatim except its fixed 30-day touch cap.
DO $$ DECLARE definition text;BEGIN
 definition:=pg_get_functiondef('private.operations_dispatch(jsonb)'::regprocedure);
 IF position('WHERE created_at<now()-interval ''30 days'' LIMIT 200' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected operations retention contract';END IF;
 definition:=replace(definition,'WHERE created_at<now()-interval ''30 days'' LIMIT 200','WHERE created_at<now()-interval ''90 days'' LIMIT 200');
 EXECUTE definition;
END $$;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_measurement_accounts;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='schedule_tick' THEN PERFORM private.measurement_maintenance_tick();END IF;
 IF command->>'op'='measurement_session_source' THEN RETURN private.measurement_session_source(command);END IF;
 IF command->>'op'='measurement_campaign_key' THEN RETURN private.measurement_campaign_key(command);END IF;
 IF command->>'op' IN ('measurement_connection_private','measurement_check_save','measurement_oauth_start','measurement_oauth_consume','measurement_sync_create','measurement_sync_list','measurement_sync_read','measurement_sync_finish','measurement_sync_stage','measurement_external_audit','measurement_traffic_report','measurement_traffic_apply','measurement_token_prepare','measurement_token_finish') THEN RETURN private.measurement_account_dispatch(command);END IF;
 RETURN api.dispatch_before_measurement_accounts(command);
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['measurement_oauth_states','measurement_sync_jobs','measurement_sync_chunks','measurement_traffic_facts'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON private.%I TO service_role',t);END LOOP;END $$;
REVOKE ALL ON FUNCTION private.measurement_account_dispatch(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_accounts(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_account_dispatch(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_accounts(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
