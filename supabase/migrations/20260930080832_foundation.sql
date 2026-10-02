BEGIN;
DO $$ BEGIN IF to_regprocedure('pgmq.create(text)') IS NULL THEN CREATE EXTENSION IF NOT EXISTS pgmq; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS api;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA api TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE private.memberships (
 user_id uuid NOT NULL, branch_id uuid NOT NULL, permissions text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true, capacity integer NOT NULL DEFAULT 20 CHECK(capacity>0),
 active_leads integer NOT NULL DEFAULT 0, last_assigned_at timestamptz,
 shift jsonb NOT NULL DEFAULT '{"weekdays":[0,1,2,3,4,5],"start":"08:00","end":"18:00"}',
 PRIMARY KEY(user_id,branch_id)
);
CREATE TABLE private.resources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL,
 branch_id uuid, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'draft',
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind IN ('product','plan','region','promotion','page','campaign','experiment','integration','followup','feedback','referral','import','media','export','privacy','cost','preference'))
);
CREATE INDEX resources_kind_scope ON private.resources(kind,branch_id,updated_at DESC,id DESC);
CREATE TABLE private.catalog_revision(id boolean PRIMARY KEY DEFAULT true CHECK(id),version integer NOT NULL DEFAULT 1);
INSERT INTO private.catalog_revision DEFAULT VALUES;
CREATE TABLE private.prices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL, scope_id uuid NOT NULL,
 scope_kind text NOT NULL CHECK(scope_kind IN ('region','group','default')), billing_months integer NOT NULL CHECK(billing_months>0),
 monthly_vnd bigint NOT NULL CHECK(monthly_vnd>=0), setup_vnd bigint NOT NULL DEFAULT 0 CHECK(setup_vnd>=0),
 equipment_vnd bigint NOT NULL DEFAULT 0 CHECK(equipment_vnd>=0), vat_included boolean NOT NULL DEFAULT true,
 vat_bps integer NOT NULL DEFAULT 0 CHECK(vat_bps BETWEEN 0 AND 10000), gift_months integer NOT NULL DEFAULT 0,
 effective tstzrange NOT NULL CHECK(NOT isempty(effective)), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','published','retired')),
 source text NOT NULL, approved_by uuid, version integer NOT NULL DEFAULT 1,
 CHECK(lower_inc(effective) AND NOT upper_inc(effective))
);
CREATE INDEX prices_resolve ON private.prices(plan_id,scope_id,billing_months) WHERE status='published';
CREATE OR REPLACE FUNCTION private.guard_price() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO private.catalog_revision(id,version) VALUES(true,1) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM private.catalog_revision WHERE id FOR UPDATE;
 IF NEW.status='published' THEN
  IF NEW.approved_by IS NULL THEN RAISE EXCEPTION 'price approval required'; END IF;
  IF EXISTS(SELECT 1 FROM private.prices p WHERE p.id<>NEW.id AND p.status='published' AND p.plan_id=NEW.plan_id AND p.scope_id=NEW.scope_id AND p.scope_kind=NEW.scope_kind AND p.billing_months=NEW.billing_months AND p.effective && NEW.effective) THEN
   RAISE EXCEPTION 'overlapping price interval' USING ERRCODE='23P01';
  END IF;
 END IF;
 UPDATE private.catalog_revision SET version=version+1 WHERE id;
 RETURN NEW;
END $$;
CREATE TRIGGER price_guard BEFORE INSERT OR UPDATE ON private.prices FOR EACH ROW EXECUTE FUNCTION private.guard_price();
CREATE TABLE private.contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone_hmac text NOT NULL UNIQUE, phone_ciphertext text NOT NULL, key_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL REFERENCES private.contacts(id), branch_id uuid,
 assignee_id uuid, status text NOT NULL DEFAULT 'new', version integer NOT NULL DEFAULT 1, evidence_version integer NOT NULL DEFAULT 1,
 payload jsonb NOT NULL, pii_ciphertext text NOT NULL, quote jsonb, quote_status text NOT NULL, scores jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sla_due_at timestamptz,
 receipt uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
CREATE INDEX lead_branch ON private.leads(branch_id,status,created_at DESC,id DESC);
CREATE INDEX lead_assignee ON private.leads(assignee_id,status,created_at DESC,id DESC);
CREATE INDEX lead_created ON private.leads(created_at DESC,id DESC);
CREATE INDEX lead_branch_created ON private.leads(branch_id,created_at DESC,id DESC);
CREATE INDEX lead_assignee_created ON private.leads(assignee_id,created_at DESC,id DESC);
CREATE INDEX lead_contact ON private.leads(contact_id,created_at DESC);
CREATE TABLE private.idempotency(key text PRIMARY KEY, digest text NOT NULL, result jsonb, expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours');
CREATE TABLE private.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, branch_id uuid, entity_id uuid, action text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_scope_cursor ON private.audit(branch_id,id);
CREATE TABLE private.observations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES private.leads(id) ON DELETE CASCADE, field text NOT NULL,value jsonb,source text NOT NULL,status text NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz,evidence_ref text);
CREATE TABLE private.activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES private.leads(id) ON DELETE CASCADE,kind text NOT NULL,payload jsonb NOT NULL,actor_id uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.rate_buckets(key text PRIMARY KEY,tokens numeric NOT NULL,updated_at timestamptz NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE private.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),queue text NOT NULL,kind text NOT NULL,entity_id uuid NOT NULL,dedup_key text NOT NULL UNIQUE,msg_id bigint,version integer NOT NULL DEFAULT 1,job_command jsonb NOT NULL DEFAULT '{}',state text NOT NULL DEFAULT 'pending',attempt integer NOT NULL DEFAULT 0,fence bigint NOT NULL DEFAULT 0,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),result jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX jobs_pending ON private.jobs(queue,state,next_attempt_at);
CREATE TABLE private.wake_signals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid NOT NULL REFERENCES private.jobs(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.sessions(id uuid PRIMARY KEY,analytics boolean NOT NULL DEFAULT false,marketing boolean NOT NULL DEFAULT false,consent_version text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.events(id uuid NOT NULL,session_id uuid NOT NULL REFERENCES private.sessions(id) ON DELETE CASCADE,name text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(session_id,id));
CREATE TABLE private.deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),platform text NOT NULL,event_id uuid NOT NULL,account_id text NOT NULL,state text NOT NULL DEFAULT 'pending',attempt integer NOT NULL DEFAULT 0,result jsonb,UNIQUE(platform,event_id,account_id));
CREATE TABLE private.daily_metrics(day date NOT NULL,branch_id uuid NOT NULL,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(day,branch_id));
CREATE TABLE private.tombstones(contact_hmac text PRIMARY KEY,deleted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.permits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scope text NOT NULL,expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION private.permitted(p_actor uuid,p_permission text,p_branch uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
SELECT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=p_actor AND active AND p_permission=ANY(permissions) AND (p_branch IS NULL OR branch_id=p_branch)) $$;
CREATE OR REPLACE FUNCTION api.health(command jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SET search_path='' AS $$ SELECT '{"ready":true}'::jsonb $$;
CREATE OR REPLACE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; subject uuid;
BEGIN
 IF c->>'op'='identity' THEN
  subject:=(c->>'subject')::uuid;
  RETURN jsonb_build_object('memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('branch_id',branch_id,'permissions',permissions)) FROM private.memberships WHERE user_id=subject AND active),'[]'::jsonb));
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
END $$;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA private TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION api.health(jsonb),api.dispatch(jsonb) TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC,anon,authenticated;
-- Private storage has defense-in-depth RLS; direct browser grants remain absent.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='private' LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t.tablename);
 END LOOP;
END $$;
COMMIT;
