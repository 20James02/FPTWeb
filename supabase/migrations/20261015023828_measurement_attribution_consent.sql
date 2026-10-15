BEGIN;
ALTER TABLE private.sessions ADD COLUMN advertising boolean NOT NULL DEFAULT false;
ALTER TABLE private.sessions ADD COLUMN personalization boolean NOT NULL DEFAULT false;
CREATE INDEX measurement_touch_session_time ON private.touches(session_id,created_at DESC,id DESC);
CREATE FUNCTION private.measurement_touch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sid uuid:=(c->>'session_id')::uuid; p jsonb:=c->'payload'; previous private.touches; id uuid;
BEGIN
 PERFORM 1 FROM private.sessions WHERE sessions.id=sid AND analytics FOR UPDATE;
 IF NOT FOUND THEN RETURN '{}'; END IF;
 SELECT * INTO previous FROM private.touches WHERE session_id=sid AND created_at>now()-interval '90 days' ORDER BY created_at DESC,touches.id DESC LIMIT 1;
 IF coalesce(p->>'utm_source','')='' AND coalesce(p->>'utm_campaign','')='' AND coalesce(p->>'platform','')='' AND coalesce(p->>'campaign_id','')='' AND coalesce(p->>'click_id_ciphertext','')='' THEN
  IF previous.id IS NOT NULL AND p ? 'provider_ids_ciphertext' THEN UPDATE private.touches SET payload=payload||jsonb_build_object('provider_ids_ciphertext',p->'provider_ids_ciphertext') WHERE touches.id=previous.id; END IF;
  IF previous.id IS NOT NULL OR NOT p ? 'provider_ids_ciphertext' THEN RETURN jsonb_build_object('id',previous.id); END IF;
 END IF;
 IF previous.id IS NOT NULL AND previous.created_at>now()-interval '30 minutes' AND previous.payload-'click_id_ciphertext'-'provider_ids_ciphertext'=p-'click_id_ciphertext'-'provider_ids_ciphertext' THEN
 UPDATE private.touches SET payload=payload||p WHERE touches.id=previous.id;RETURN jsonb_build_object('id',previous.id); END IF;
 INSERT INTO private.touches(session_id,payload) VALUES(sid,p) RETURNING touches.id INTO id;
 RETURN jsonb_build_object('id',id);
END $$;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_measurement_attribution;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF command->>'op'='touch' THEN RETURN private.measurement_touch(command); END IF;
 result:=api.dispatch_before_measurement_attribution(command);
 IF command->>'op'='consent' AND NOT result ? 'error' THEN
  UPDATE private.sessions SET advertising=coalesce((command->>'advertising')::bool,false) AND analytics AND marketing,
   personalization=coalesce((command->>'personalization')::bool,false) AND coalesce((command->>'advertising')::bool,false) AND analytics AND marketing
   WHERE id=(command->>'id')::uuid;
  IF NOT coalesce((command->>'advertising')::bool,false) THEN UPDATE private.touches SET payload=payload-'provider_ids_ciphertext'-'click_id_ciphertext' WHERE session_id=(command->>'id')::uuid;
   UPDATE private.leads SET click_id_ciphertext=NULL,click_id_expires_at=NULL WHERE payload->>'session_id'=command->>'id';
   UPDATE private.measurement_occurrences SET snapshot=snapshot-'provider_ids_ciphertext'-'client_context_ciphertext' WHERE lead_id IN(SELECT id FROM private.leads WHERE payload->>'session_id'=command->>'id');
  END IF;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.measurement_touch(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_attribution(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_touch(jsonb),api.dispatch(jsonb),api.dispatch_before_measurement_attribution(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
