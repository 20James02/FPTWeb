BEGIN;
-- Provider-verified recovery is handled by the server, never an anon RPC.
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_password_recovery;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE recovered_subject uuid;
BEGIN
 IF command->>'op' IN ('auth_recovery_revoke_sessions','auth_recovery_complete') THEN
  recovered_subject:=(command->>'subject')::uuid;
  IF NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=recovered_subject AND active) THEN
   RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403);
  END IF;
  DELETE FROM private.admin_sessions WHERE admin_sessions.subject=recovered_subject;
  INSERT INTO private.audit(actor_id,action) VALUES(recovered_subject,CASE WHEN command->>'op'='auth_recovery_complete' THEN 'auth.password_recovered' ELSE 'auth.password_recovery_verified' END);
  RETURN '{"revoked":true}';
 END IF;
 RETURN api.dispatch_before_password_recovery(command);
END $$;
REVOKE ALL ON FUNCTION api.dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb) TO service_role;
COMMIT;
