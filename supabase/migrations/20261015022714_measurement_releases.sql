BEGIN;
CREATE TABLE private.measurement_configs(id uuid PRIMARY KEY,payload jsonb NOT NULL,version int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX measurement_config_scope ON private.measurement_configs((payload->>'environment'),(payload->>'scope'),(payload->>'scope_key'));
CREATE TABLE private.measurement_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),config_id uuid NOT NULL REFERENCES private.measurement_configs(id),
 payload jsonb NOT NULL,actor_id uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.measurement_active(environment text NOT NULL,scope text NOT NULL,scope_key text NOT NULL,
 release_id uuid NOT NULL REFERENCES private.measurement_releases(id),PRIMARY KEY(environment,scope,scope_key));
CREATE FUNCTION private.measurement_refs(p jsonb) RETURNS SETOF uuid LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (p->'policy'->>'ga4_connection_id')::uuid WHERE p->'policy'->>'ga4_connection_id' IS NOT NULL
 UNION SELECT (r->>'connection_id')::uuid FROM jsonb_array_elements(coalesce(p->'rules','[]')) r
$$;
CREATE FUNCTION private.measurement_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (OLD.payload->>'provider',OLD.payload->>'environment',OLD.payload->'settings'->>'measurement_id',OLD.payload->'settings'->>'tag_id',OLD.payload->'settings'->>'pixel_id',OLD.payload->'settings'->>'customer_id',OLD.payload->'settings'->>'ad_account_id') IS DISTINCT FROM
 (NEW.payload->>'provider',NEW.payload->>'environment',NEW.payload->'settings'->>'measurement_id',NEW.payload->'settings'->>'tag_id',NEW.payload->'settings'->>'pixel_id',NEW.payload->'settings'->>'customer_id',NEW.payload->'settings'->>'ad_account_id')
 AND EXISTS(SELECT 1 FROM private.measurement_releases r WHERE OLD.id IN(SELECT private.measurement_refs(r.payload))) THEN
  RAISE EXCEPTION 'Published destination identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER measurement_identity BEFORE UPDATE ON private.measurement_connections FOR EACH ROW EXECUTE FUNCTION private.measurement_identity_guard();
ALTER FUNCTION private.measurement_dispatch(jsonb) RENAME TO measurement_registry_dispatch;
CREATE FUNCTION private.measurement_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; actor uuid; perm text; row private.measurement_configs; p jsonb; rid uuid; ref uuid; valid boolean; conn private.measurement_connections;
BEGIN
 IF op='measurement_connection_save' THEN
  -- Lock the same destination as publication before evaluating the live-change permission.
  PERFORM 1 FROM private.measurement_connections WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM private.measurement_active a JOIN private.measurement_releases rel ON rel.id=a.release_id WHERE (c->>'id')::uuid IN(SELECT private.measurement_refs(rel.payload)))
   AND NOT private.permitted((c->>'actor')::uuid,'measurement.publish','00000000-0000-0000-0000-000000000000') THEN RETURN '{"error":"PERMISSION_DENIED","status":403}';END IF;
 END IF;
 IF op='measurement_bundle' THEN
  RETURN jsonb_build_object('connections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'payload',payload,'version',version)) FROM private.measurement_connections WHERE payload->>'environment'=c->>'environment'),'[]'),
   'releases',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'config_id',r.config_id,'payload',r.payload)) FROM private.measurement_active a JOIN private.measurement_releases r ON r.id=a.release_id WHERE a.environment=c->>'environment'),'[]'));
 END IF;
 IF op NOT IN ('measurement_config_list','measurement_config_read','measurement_config_save','measurement_config_publish','measurement_release_list','measurement_release_restore','measurement_connection_disable') THEN
  BEGIN RETURN private.measurement_registry_dispatch(c); EXCEPTION WHEN check_violation THEN RETURN '{"error":"DESTINATION_IMMUTABLE","status":409}'; END;
 END IF;
 actor:=(c->>'actor')::uuid;
 perm:=CASE WHEN op IN ('measurement_config_publish','measurement_release_restore','measurement_connection_disable') THEN 'measurement.publish'
 WHEN op='measurement_config_save' THEN 'measurement.configure' ELSE 'measurement.read' END;
 IF actor IS NULL OR NOT private.permitted(actor,perm,'00000000-0000-0000-0000-000000000000') THEN RETURN '{"error":"PERMISSION_DENIED","status":403}'; END IF;
 IF op='measurement_config_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.updated_at DESC) FROM private.measurement_configs m),'[]')); END IF;
 IF op='measurement_release_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(x) FROM(SELECT r.*,a.release_id IS NOT NULL AS active FROM private.measurement_releases r LEFT JOIN private.measurement_active a ON a.release_id=r.id ORDER BY r.created_at DESC,r.id LIMIT 100)x),'[]')); END IF;
 IF op='measurement_connection_disable' THEN
  SELECT * INTO conn FROM private.measurement_connections WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF conn.id IS NULL THEN RETURN '{"error":"NOT_FOUND","status":404}'; END IF;
  IF conn.version<>(c->>'expected_version')::int THEN RETURN '{"error":"VERSION_CONFLICT","status":409}'; END IF;
  UPDATE private.measurement_connections SET payload=jsonb_set(payload,'{enabled}','false'),version=version+1,updated_at=now() WHERE id=conn.id;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,conn.id,op);
  RETURN private.measurement_connection_view(conn.id);
 END IF;
 IF op='measurement_release_restore' THEN
  SELECT config_id,payload INTO rid,p FROM private.measurement_releases WHERE id=(c->>'id')::uuid;
  IF rid IS NULL THEN RETURN '{"error":"NOT_FOUND","status":404}'; END IF;
 ELSE rid:=(c->>'id')::uuid; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,2872));
 SELECT * INTO row FROM private.measurement_configs WHERE id=rid FOR UPDATE;
 IF coalesce(row.version,0)<>(c->>'expected_version')::int THEN RETURN '{"error":"VERSION_CONFLICT","status":409}'; END IF;
 IF op='measurement_config_save' THEN
  p:=c->'payload';
  IF p->>'scope' NOT IN ('global','domain','landing','campaign') OR p->>'environment' NOT IN ('test','staging','production') OR p::text ~* '"(access_token|refresh_token|api_secret|client_secret|ciphertext|endpoint)"' THEN RETURN '{"error":"INVALID_MEASUREMENT_CONFIG","status":422}'; END IF;
  IF row.id IS NULL THEN
   INSERT INTO private.measurement_configs(id,payload) VALUES(rid,p) ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN RETURN '{"error":"CONFIG_SCOPE_EXISTS","status":409}'; END IF;
  ELSE
   IF (row.payload->>'scope',row.payload->>'scope_key',row.payload->>'environment') IS DISTINCT FROM (p->>'scope',p->>'scope_key',p->>'environment') THEN RETURN '{"error":"CONFIG_SCOPE_IMMUTABLE","status":409}'; END IF;
   UPDATE private.measurement_configs SET payload=p,version=version+1,updated_at=now() WHERE id=rid;
  END IF;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,rid,op);
 ELSIF op IN ('measurement_config_publish','measurement_release_restore') THEN
  IF row.id IS NULL THEN RETURN '{"error":"NOT_FOUND","status":404}'; END IF;
  p:=coalesce(p,row.payload);
  FOR ref IN SELECT private.measurement_refs(p) ORDER BY 1 LOOP
   SELECT * INTO conn FROM private.measurement_connections WHERE id=ref FOR SHARE;
   IF conn.id IS NULL OR NOT coalesce((conn.payload->>'enabled')::bool,false) OR conn.payload->>'environment'<>p->>'environment' THEN RETURN '{"error":"INVALID_MEASUREMENT_REFERENCE","status":422}'; END IF;
  END LOOP;
  INSERT INTO private.measurement_releases(config_id,payload,actor_id) VALUES(rid,p,actor) RETURNING id INTO ref;
  INSERT INTO private.measurement_active(environment,scope,scope_key,release_id) VALUES(p->>'environment',p->>'scope',p->>'scope_key',ref)
   ON CONFLICT(environment,scope,scope_key) DO UPDATE SET release_id=excluded.release_id;
  UPDATE private.measurement_configs SET payload=p,version=version+1,updated_at=now() WHERE id=rid;
  INSERT INTO private.audit(actor_id,entity_id,action,payload) VALUES(actor,rid,op,jsonb_build_object('release_id',ref));
  RETURN jsonb_build_object('release_id',ref,'config_id',rid,'version',row.version+1);
 END IF;
 RETURN (SELECT to_jsonb(m) FROM private.measurement_configs m WHERE id=rid);
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['measurement_configs','measurement_releases','measurement_active'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON private.%I TO service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.measurement_dispatch(jsonb),private.measurement_registry_dispatch(jsonb),private.measurement_refs(jsonb),private.measurement_identity_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_dispatch(jsonb),private.measurement_registry_dispatch(jsonb),private.measurement_refs(jsonb),private.measurement_identity_guard() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
