BEGIN;
CREATE TABLE private.measurement_connections(
 id uuid PRIMARY KEY, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), checked_at timestamptz,
 check_result jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.measurement_secrets(
 connection_id uuid PRIMARY KEY REFERENCES private.measurement_connections(id),
 ciphertext text NOT NULL, expires_at timestamptz, rotated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION private.measurement_connection_view(p_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',m.id,'payload',m.payload,'version',m.version,'checked_at',m.checked_at,
 'check_result',m.check_result,'created_at',m.created_at,'updated_at',m.updated_at,
 'secret_configured',s.connection_id IS NOT NULL,'secret_expires_at',s.expires_at)
 FROM private.measurement_connections m LEFT JOIN private.measurement_secrets s ON s.connection_id=m.id WHERE m.id=p_id
$$;
CREATE FUNCTION private.measurement_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; actor uuid; permission text; row private.measurement_connections; p jsonb:=c->'payload';
BEGIN
 actor:=(c->>'actor')::uuid;
 permission:=CASE WHEN op='measurement_connection_list' THEN 'measurement.read'
 WHEN op='measurement_secret_save' THEN 'measurement.credentials' ELSE 'measurement.configure' END;
 IF actor IS NULL OR NOT private.permitted(actor,permission,'00000000-0000-0000-0000-000000000000') THEN
  RETURN '{"error":"PERMISSION_DENIED","status":403}'; END IF;
 IF op='measurement_connection_list' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.measurement_connection_view(id) ORDER BY created_at DESC,id) FROM private.measurement_connections),'[]'));
 END IF;
 IF op IN ('measurement_connection_save','measurement_secret_save') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(c->>'id',2871));
  SELECT * INTO row FROM private.measurement_connections WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF coalesce(row.version,0)<>(c->>'expected_version')::int THEN RETURN '{"error":"VERSION_CONFLICT","status":409}'; END IF;
  IF op='measurement_connection_save' THEN
   IF p->>'provider' NOT IN ('ga4','google_ads','meta') OR p->>'environment' NOT IN ('test','staging','production')
    OR coalesce(length(trim(p->>'name')),0) NOT BETWEEN 1 AND 100
    OR p::text ~* '"(access_token|refresh_token|api_secret|client_secret|endpoint|ciphertext)"' THEN
    RETURN '{"error":"INVALID_MEASUREMENT_CONFIG","status":422}'; END IF;
   IF row.id IS NULL THEN INSERT INTO private.measurement_connections(id,payload) VALUES((c->>'id')::uuid,p);
   ELSE UPDATE private.measurement_connections SET payload=p,version=version+1,updated_at=now(),checked_at=NULL,check_result='{}' WHERE id=row.id; END IF;
  ELSE
   IF row.id IS NULL THEN RETURN '{"error":"NOT_FOUND","status":404}'; END IF;
   INSERT INTO private.measurement_secrets(connection_id,ciphertext,expires_at) VALUES(row.id,c->>'ciphertext',(c->>'expires_at')::timestamptz)
    ON CONFLICT(connection_id) DO UPDATE SET ciphertext=excluded.ciphertext,expires_at=excluded.expires_at,rotated_at=now();
   UPDATE private.measurement_connections SET version=version+1,updated_at=now(),checked_at=NULL,check_result='{}' WHERE id=row.id;
  END IF;
  INSERT INTO private.audit(actor_id,action,entity_id,payload) VALUES(actor,op,(c->>'id')::uuid,jsonb_build_object('version',(c->>'expected_version')::int+1));
  RETURN private.measurement_connection_view((c->>'id')::uuid);
 END IF;
 RETURN '{"error":"UNKNOWN_OPERATION","status":400}';
END $$;
ALTER TABLE private.measurement_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.measurement_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.measurement_connections,private.measurement_secrets FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.measurement_connections,private.measurement_secrets TO service_role;
REVOKE ALL ON FUNCTION private.measurement_dispatch(jsonb),private.measurement_connection_view(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_dispatch(jsonb),private.measurement_connection_view(uuid) TO service_role;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_measurement;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op' LIKE 'measurement_%' THEN RETURN private.measurement_dispatch(command); END IF;
 RETURN api.dispatch_before_measurement(command);
END $$;
REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_measurement(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_measurement(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
