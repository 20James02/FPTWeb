BEGIN;
-- Auth tables remain provider-owned. This narrowly scoped lookup is reachable
-- only by service_role, in an unexposed schema, never directly from browsers.
CREATE FUNCTION private.recovery_subject(p_email text,p_subject uuid DEFAULT NULL) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'server role required' USING ERRCODE='42501';
 END IF;
 IF p_email IS NULL AND p_subject IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(u.id) INTO ids FROM auth.users u
 WHERE (p_email IS NULL OR lower(u.email)=lower(btrim(p_email)))
  AND (p_subject IS NULL OR u.id=p_subject)
  AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND EXISTS(SELECT 1 FROM private.memberships m WHERE m.user_id=u.id AND m.active);
 IF cardinality(ids)=1 THEN RETURN ids[1]; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.recovery_subject(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.recovery_subject(text,uuid) TO service_role;

ALTER FUNCTION private.telegram_recovery_dispatch(jsonb) RENAME TO telegram_recovery_before_account_check;
CREATE FUNCTION private.telegram_recovery_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.telegram_recovery; job private.jobs;
BEGIN
 IF c->>'op'='telegram_recovery_issue' THEN
  IF private.recovery_subject(c->>'email',(c->>'subject')::uuid) IS NULL THEN
   UPDATE private.telegram_recovery SET state='cancelled',code_ciphertext='',proof_ciphertext='',code_hash=''
    WHERE account_key=c->>'key' AND id=(c->>'id')::uuid AND state='reserved';
   RETURN '{"issued":false}';
  END IF;
 ELSIF c->>'op'='telegram_recovery_consume' THEN
  SELECT * INTO r FROM private.telegram_recovery WHERE account_key=c->>'key' AND id=(c->>'id')::uuid FOR UPDATE;
  IF r.id IS NOT NULL AND r.state='ready'
   AND EXISTS(SELECT 1 FROM private.memberships WHERE user_id=r.subject AND active)
   AND private.recovery_subject(NULL,r.subject) IS NULL THEN
   UPDATE private.telegram_recovery SET state='cancelled',code_ciphertext='',proof_ciphertext='',code_hash='' WHERE id=r.id;
   RETURN '{"error":"RECOVERY_EXPIRED","status":401}';
  END IF;
 ELSIF c->>'op'='telegram_recovery_prepare' THEN
  SELECT * INTO job FROM private.jobs WHERE id=(c->>'id')::uuid AND kind='telegram_recovery' FOR UPDATE;
  IF job.state='running' AND job.fence=(c->>'fence')::bigint AND job.lease_until>now() THEN
   SELECT * INTO r FROM private.telegram_recovery WHERE id=job.entity_id FOR UPDATE;
   IF r.id IS NOT NULL AND r.state='ready' AND private.recovery_subject(NULL,r.subject) IS NULL THEN
    UPDATE private.telegram_recovery SET state='cancelled',code_ciphertext='',proof_ciphertext='',code_hash='' WHERE id=r.id;
    RETURN '{"status":"cancelled"}';
   END IF;
  END IF;
 END IF;
 RETURN private.telegram_recovery_before_account_check(c);
END $$;
REVOKE ALL ON FUNCTION private.telegram_recovery_dispatch(jsonb),private.telegram_recovery_before_account_check(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.telegram_recovery_dispatch(jsonb),private.telegram_recovery_before_account_check(jsonb) TO service_role;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_recovery_account_check;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='telegram_recovery_account' THEN
  RETURN jsonb_build_object('subject',private.recovery_subject(command->>'email'));
 END IF;
 RETURN api.dispatch_before_recovery_account_check(command);
END $$;
REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_recovery_account_check(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_recovery_account_check(jsonb) TO service_role;

-- A worker takes up to 20 seconds; a 2-second pg_net timeout cannot confirm it.
CREATE OR REPLACE FUNCTION private.request_worker(path text,payload jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE config private.runtime_settings; secret text;
BEGIN
 IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN RETURN; END IF;
 SELECT * INTO config FROM private.runtime_settings WHERE id;
 IF config.worker_origin IS NULL THEN RETURN; END IF;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id=$1' INTO secret USING config.job_secret_id;
 IF secret IS NULL OR length(secret)<32 THEN RETURN; END IF;
 IF path='/internal/jobs/recover' THEN
  EXECUTE 'SELECT net.http_get(url:=$1,headers:=$2,timeout_milliseconds:=25000)' USING config.worker_origin||path,jsonb_build_object('Authorization','Bearer '||secret);
 ELSE
  EXECUTE 'SELECT net.http_post(url:=$1,body:=$2,headers:=$3,timeout_milliseconds:=25000)' USING config.worker_origin||path,payload,jsonb_build_object('X-Job-Secret',secret,'Content-Type','application/json');
 END IF;
EXCEPTION WHEN OTHERS THEN INSERT INTO private.wake_failures(code) VALUES('worker_'||SQLSTATE);
END $$;
REVOKE ALL ON FUNCTION private.request_worker(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.request_worker(text,jsonb) TO service_role;
DO $$
BEGIN
 IF to_regclass('cron.job') IS NOT NULL THEN
  -- Update only the operator's existing job, never provision cron in test DBs.
  EXECUTE 'SELECT cron.schedule(jobname,''* * * * *'',command) FROM cron.job WHERE jobname=''pagefpt-recover''';
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
