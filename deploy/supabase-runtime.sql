-- Review in staging first. Run as database operator, NEVER from a browser.
-- Enable pg_cron, pg_net and Supabase Vault in the project dashboard first.
-- Create the worker secret with Vault UI; copy its UUID below, not its value.
BEGIN;
DO $$
DECLARE worker_origin text := 'REPLACE_WITH_HTTPS_ORIGIN';
        vault_secret_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
 IF worker_origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$'
    OR vault_secret_id='00000000-0000-0000-0000-000000000000'::uuid THEN
  RAISE EXCEPTION 'Replace origin and Vault UUID before executing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE id=vault_secret_id AND length(decrypted_secret)>=32) THEN
  RAISE EXCEPTION 'Worker secret missing or too short';
 END IF;
 INSERT INTO private.runtime_settings(id,worker_origin,job_secret_id)
 VALUES(true,worker_origin,vault_secret_id)
 ON CONFLICT(id) DO UPDATE SET worker_origin=excluded.worker_origin,job_secret_id=excluded.job_secret_id;
 -- Named cron.schedule updates a matching existing job instead of adding duplicates.
 PERFORM cron.schedule('pagefpt-recover','* * * * *',
  $cron$SELECT private.request_worker('/internal/jobs/recover','{}'::jsonb);$cron$);
END $$;
COMMIT;
-- Inspect private.wake_failures and net._http_response after a synthetic job.
-- Wake is a latency optimization; the durable queue plus cron provide recovery.
