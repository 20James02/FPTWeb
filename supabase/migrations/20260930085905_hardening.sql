BEGIN;
CREATE TABLE private.used_challenges(id uuid PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.used_challenges ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.used_challenges TO service_role;
CREATE TABLE private.runtime_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),worker_origin text NOT NULL CHECK(worker_origin LIKE 'https://%'),job_secret_id uuid NOT NULL);
CREATE TABLE private.wake_failures(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,signal_id uuid,code text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.wake_failures ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.runtime_settings,private.wake_failures TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA private TO service_role;
CREATE OR REPLACE FUNCTION private.allowed_topic(topic text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT topic='user:'||auth.uid()::text AND EXISTS(SELECT 1 FROM private.memberships WHERE user_id=auth.uid() AND active AND ('lead.read'=ANY(permissions) OR '*'=ANY(permissions))) $$;
REVOKE EXECUTE ON FUNCTION private.allowed_topic(text) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.allowed_topic(text) TO authenticated;
CREATE OR REPLACE FUNCTION private.emit_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l private.leads; recipient uuid;
BEGIN
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO l FROM private.leads WHERE id=NEW.entity_id;
 IF l.id IS NULL THEN RETURN NEW; END IF;
 FOR recipient IN SELECT DISTINCT user_id FROM private.memberships WHERE active LOOP
  IF private.can_read_lead(recipient,l) THEN
   BEGIN
    EXECUTE 'SELECT realtime.send($1,$2,$3,true)' USING jsonb_build_object('id',l.id,'version',l.version,'type',NEW.action,'cursor',NEW.id),'lead_change','user:'||recipient;
   EXCEPTION WHEN OTHERS THEN
    INSERT INTO private.wake_failures(code) VALUES('realtime_'||SQLSTATE);
   END;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER audit_broadcast AFTER INSERT ON private.audit FOR EACH ROW EXECUTE FUNCTION private.emit_change();
DO $$ BEGIN
 IF to_regclass('realtime.messages') IS NOT NULL AND to_regprocedure('realtime.topic()') IS NOT NULL THEN
  EXECUTE 'CREATE POLICY pagefpt_private_broadcast ON realtime.messages FOR SELECT TO authenticated USING (extension=''broadcast'' AND private.allowed_topic(realtime.topic()))';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION private.request_worker(path text,payload jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE config private.runtime_settings; secret text;
BEGIN
 IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN RETURN; END IF;
 SELECT * INTO config FROM private.runtime_settings WHERE id;
 IF config.worker_origin IS NULL THEN RETURN; END IF;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id=$1' INTO secret USING config.job_secret_id;
 IF length(secret)<32 THEN RETURN; END IF;
 IF path='/internal/jobs/recover' THEN
  EXECUTE 'SELECT net.http_get(url:=$1,headers:=$2,timeout_milliseconds:=2000)' USING config.worker_origin||path,jsonb_build_object('Authorization','Bearer '||secret);
 ELSE
  EXECUTE 'SELECT net.http_post(url:=$1,body:=$2,headers:=$3,timeout_milliseconds:=2000)' USING config.worker_origin||path,payload,jsonb_build_object('X-Job-Secret',secret,'Content-Type','application/json');
 END IF;
EXCEPTION WHEN OTHERS THEN INSERT INTO private.wake_failures(code) VALUES('worker_'||SQLSTATE);
END $$;
CREATE OR REPLACE FUNCTION private.wake_job() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q text;
BEGIN
 SELECT queue INTO q FROM private.jobs WHERE id=NEW.job_id;
 PERFORM private.request_worker('/internal/jobs/process',jsonb_build_object('queue',q));
 RETURN NEW;
END $$;
CREATE TRIGGER job_wake AFTER INSERT ON private.wake_signals FOR EACH ROW EXECUTE FUNCTION private.wake_job();
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
-- Only allowed_topic is browser-callable; all other private helpers remain server-only.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname<>'allowed_topic' LOOP EXECUTE 'REVOKE EXECUTE ON FUNCTION '||f.signature||' FROM authenticated'; END LOOP;
END $$;
COMMIT;
