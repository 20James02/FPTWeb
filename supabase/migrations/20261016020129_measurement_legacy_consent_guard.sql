BEGIN;
-- Existing migrations are deployed: add the legacy guard without rewriting history.
-- Managed destinations and the legacy gateway must obey the same current consent.
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_measurement_legacy_guard;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF command->>'op'='conversion_prepare' THEN
  -- Lock the session before the legacy function locks the lead, matching consent.
  PERFORM 1 FROM private.leads l
   JOIN private.sessions s ON s.id=(l.payload->>'session_id')::uuid
   WHERE l.id=(command->>'id')::uuid
   AND s.analytics AND s.marketing AND s.advertising
   AND coalesce((l.payload->>'marketing_opt_in')::boolean,false)
  FOR SHARE OF s;
  IF NOT FOUND THEN RETURN '{"status":"consent_denied"}';END IF;
  result:=api.dispatch_before_measurement_legacy_guard(command);
  IF NOT EXISTS (
   SELECT 1 FROM private.leads l WHERE l.id=(command->>'id')::uuid
   AND l.created_at>now()-make_interval(days=>private.measurement_retention_days(l.payload->>'measurement_environment'))
  ) THEN result:=result-'click_id_ciphertext';END IF;
  RETURN result;
 END IF;
 RETURN api.dispatch_before_measurement_legacy_guard(command);
END $$;
REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_measurement_legacy_guard(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_measurement_legacy_guard(jsonb) TO service_role;
-- Serialize the managed path with the same current-consent row as well.
DO $$
DECLARE definition text; old_guard text:='IF NOT EXISTS(SELECT 1 FROM private.sessions WHERE id=sid AND analytics AND marketing AND advertising) OR NOT coalesce((l.payload->>''marketing_opt_in'')::bool,false) THEN';
BEGIN
 definition:=pg_get_functiondef('private.measurement_delivery_dispatch(jsonb)'::regprocedure);
 IF position(old_guard IN definition)=0 THEN RAISE EXCEPTION 'Unexpected managed consent contract';END IF;
 definition:=replace(definition,old_guard,'PERFORM 1 FROM private.sessions WHERE id=sid AND analytics AND marketing AND advertising FOR SHARE; IF NOT FOUND OR NOT coalesce((l.payload->>''marketing_opt_in'')::bool,false) THEN');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
