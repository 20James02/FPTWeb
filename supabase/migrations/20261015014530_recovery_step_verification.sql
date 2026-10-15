BEGIN;
-- Step two checks the challenge without consuming or releasing provider proof.
-- It shares the same row lock and failure counter as final password reset.
CREATE FUNCTION private.telegram_recovery_verify(c jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.telegram_recovery;
BEGIN
 SELECT * INTO r FROM private.telegram_recovery
  WHERE account_key=c->>'key' AND id=(c->>'id')::uuid FOR UPDATE;
 IF r.id IS NULL OR r.state<>'ready' OR r.attempts>=5
  OR r.chat_id IS DISTINCT FROM c->>'chat_id' THEN
  RETURN '{"error":"RECOVERY_EXPIRED","status":401}';
 END IF;
 IF r.expires_at<=now() OR private.recovery_subject(NULL,r.subject) IS NULL THEN
  UPDATE private.telegram_recovery SET state='cancelled',code_ciphertext='',proof_ciphertext='',code_hash=''
   WHERE account_key=r.account_key;
  RETURN '{"error":"RECOVERY_EXPIRED","status":401}';
 END IF;
 IF r.code_hash IS DISTINCT FROM c->>'code_hash' THEN
  UPDATE private.telegram_recovery SET attempts=attempts+1,
   state=CASE WHEN attempts>=4 THEN 'blocked' ELSE state END,
   proof_ciphertext=CASE WHEN attempts>=4 THEN '' ELSE proof_ciphertext END,
   code_ciphertext=CASE WHEN attempts>=4 THEN '' ELSE code_ciphertext END,
   code_hash=CASE WHEN attempts>=4 THEN '' ELSE code_hash END
   WHERE account_key=r.account_key;
  RETURN '{"error":"RECOVERY_EXPIRED","status":401}';
 END IF;
 RETURN '{"verified":true}';
END $$;
REVOKE ALL ON FUNCTION private.telegram_recovery_verify(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.telegram_recovery_verify(jsonb) TO service_role;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_recovery_step_verification;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='telegram_recovery_verify' THEN
  RETURN private.telegram_recovery_verify(command);
 END IF;
 RETURN api.dispatch_before_recovery_step_verification(command);
END $$;
REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_recovery_step_verification(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_recovery_step_verification(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
