BEGIN;
ALTER TABLE private.memberships ADD COLUMN email text NOT NULL DEFAULT '' CHECK(length(email)<=254);
ALTER TABLE private.memberships ADD COLUMN require_mfa boolean NOT NULL DEFAULT false;
ALTER TABLE private.memberships ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE private.account_operation_locks(subject uuid PRIMARY KEY,lease uuid NOT NULL,expires_at timestamptz NOT NULL,revoked_before timestamptz);
ALTER TABLE private.account_operation_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.account_operation_locks FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.account_operation_locks TO service_role;
CREATE OR REPLACE FUNCTION private.allowed_topic(topic text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT topic='user:'||auth.uid()::text
 AND EXISTS(SELECT 1 FROM private.memberships WHERE user_id=auth.uid() AND active AND ('lead.read'=ANY(permissions) OR '*'=ANY(permissions)))
 AND (coalesce(auth.jwt()->>'aal','aal1')='aal2' OR NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=auth.uid() AND active AND require_mfa))
$$;
REVOKE EXECUTE ON FUNCTION private.allowed_topic(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.allowed_topic(text) TO authenticated;

-- Existing indexes on (branch_id,created_at) and activity lead/time cover the
-- bounded cohort. Aggregate on the server; never return contact/IP payloads.
CREATE FUNCTION private.analytics_report(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=(c->>'actor')::uuid; start_day date:=(c->>'start')::date; end_day date:=(c->>'end')::date;
 result jsonb; global_id uuid:='00000000-0000-0000-0000-000000000000';
BEGIN
 IF NOT private.permitted(actor,'report.read') OR (c->>'branch_id' IS NOT NULL AND NOT private.permitted(actor,'report.read',(c->>'branch_id')::uuid)) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF start_day IS NULL OR end_day IS NULL OR start_day>end_day OR end_day-start_day>92 THEN RETURN jsonb_build_object('error','INVALID_DATE_RANGE','status',422); END IF;
 WITH cohort AS MATERIALIZED (
  SELECT ll.id,ll.status,ll.branch_id,ll.payload->>'plan_id' AS plan_id,
   (ll.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
   coalesce(nullif(ll.payload#>>'{attribution,last_touch,payload,utm_source}',''),nullif(ll.payload#>>'{attribution,last_touch,utm_source}',''),'unattributed') AS source,
   ll.status IN ('contacted','qualified','survey','quoted','closed','installed') OR EXISTS(SELECT 1 FROM private.activities a WHERE a.lead_id=ll.id AND a.kind='transition' AND a.payload->>'to'='contacted') AS contacted,
   ll.status IN ('qualified','survey','quoted','closed','installed') AS qualified,
   ll.status='installed' AS installed,
   ll.status IN ('new','assigned','contacting') AS awaiting,
   ll.status IN ('new','assigned','contacting') AND ll.sla_due_at<now() AS overdue
  FROM private.leads ll
  WHERE ll.created_at>=start_day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
   AND ll.created_at<(end_day+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
   AND private.permitted(actor,'report.read',coalesce(ll.branch_id,global_id))
   AND (c->>'branch_id' IS NULL OR ll.branch_id=(c->>'branch_id')::uuid)
   AND (c->>'campaign' IS NULL OR coalesce(ll.payload#>>'{attribution,last_touch,payload,utm_campaign}',ll.payload#>>'{attribution,last_touch,utm_campaign}','unattributed')=c->>'campaign')
 ), days AS (
  SELECT dd::date AS day FROM generate_series(start_day::timestamp,end_day::timestamp,interval '1 day') dd
 ), daily AS (
  SELECT d.day,count(x.id) AS leads,count(x.id) FILTER(WHERE x.contacted) AS contacted,count(x.id) FILTER(WHERE x.qualified) AS qualified,count(x.id) FILTER(WHERE x.installed) AS installed FROM days d LEFT JOIN cohort x ON x.day=d.day GROUP BY d.day
 ), status_counts AS (SELECT status AS label,count(*) AS value FROM cohort GROUP BY status),
 source_counts AS (SELECT source AS label,count(*) AS value,count(*) FILTER(WHERE installed) AS installed FROM cohort GROUP BY source),
 plan_counts AS (SELECT coalesce(p.payload->>'name','Chưa chọn gói') AS label,count(*) AS value,count(*) FILTER(WHERE x.installed) AS installed FROM cohort x LEFT JOIN private.resources p ON p.kind='plan' AND p.id::text=x.plan_id GROUP BY coalesce(p.payload->>'name','Chưa chọn gói')),
 branch_counts AS (SELECT coalesce(b.name,CASE WHEN x.branch_id IS NULL THEN 'Chưa phân chi nhánh' ELSE x.branch_id::text END) AS label,count(*) AS value,count(*) FILTER(WHERE x.installed) AS installed FROM cohort x LEFT JOIN (SELECT branch_id,min(payload->>'name') AS name FROM private.resources WHERE kind='region' GROUP BY branch_id) b ON b.branch_id=x.branch_id GROUP BY coalesce(b.name,CASE WHEN x.branch_id IS NULL THEN 'Chưa phân chi nhánh' ELSE x.branch_id::text END))
 SELECT jsonb_build_object(
  'totals',(SELECT jsonb_build_object('leads',count(*),'contacted',count(*) FILTER(WHERE contacted),'qualified',count(*) FILTER(WHERE qualified),'installed',count(*) FILTER(WHERE installed),'awaiting',count(*) FILTER(WHERE awaiting),'overdue',count(*) FILTER(WHERE overdue)) FROM cohort),
  'daily',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY day),'[]') FROM daily d),
  'statuses',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY value DESC,label),'[]') FROM status_counts s),
  'sources',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY value DESC,label),'[]') FROM source_counts s),
  'plans',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY value DESC,label),'[]') FROM plan_counts s),
  'branches',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY value DESC,label),'[]') FROM branch_counts s),
  'as_of',now(),'start',start_day,'end',end_day,'timezone','Asia/Ho_Chi_Minh','definition_version','cohort-v3') INTO result;
 RETURN result;
END $$;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_accounts_analytics;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=command->>'op'; actor uuid:=(command->>'actor')::uuid; data jsonb:=command->'payload'; target uuid; b uuid; previous private.memberships; result jsonb;
BEGIN
 IF op='auth_throttle' THEN
  result:=api.dispatch_before_accounts_analytics(command);
  IF result ? 'error' THEN RETURN result; END IF;
  RETURN result||jsonb_build_object('login_started_at',clock_timestamp());
 ELSIF op='admin_session_create' THEN
  target:=(command->>'subject')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended('pagefpt-auth:'||target::text,0));
  IF EXISTS(SELECT 1 FROM private.account_operation_locks WHERE subject=target AND (expires_at>clock_timestamp() OR coalesce((command->>'login_started_at')::timestamptz,'-infinity')<=revoked_before)) THEN RETURN jsonb_build_object('error','SESSION_REFRESH_BUSY','status',503); END IF;
  RETURN api.dispatch_before_accounts_analytics(command);
 ELSIF op='identity' THEN
  RETURN jsonb_build_object('memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('branch_id',branch_id,'permissions',permissions,'require_mfa',require_mfa,'display_name',display_name)) FROM private.memberships WHERE user_id=(command->>'subject')::uuid AND active),'[]'));
 ELSIF op='report_analytics' THEN RETURN private.analytics_report(command);
 ELSIF op='account_lock_claim' THEN
  INSERT INTO private.account_operation_locks(subject,lease,expires_at) VALUES(actor,(command->>'lease')::uuid,now()+interval '30 seconds')
  ON CONFLICT(subject) DO UPDATE SET lease=excluded.lease,expires_at=excluded.expires_at WHERE private.account_operation_locks.expires_at<now();
  RETURN jsonb_build_object('claimed',FOUND);
 ELSIF op='account_lock_release' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('pagefpt-auth:'||actor::text,0));
  UPDATE private.account_operation_locks SET expires_at='-infinity',revoked_before=CASE WHEN coalesce((command->>'password_change')::boolean,false) THEN clock_timestamp() ELSE revoked_before END WHERE subject=actor AND lease=(command->>'lease')::uuid;
  RETURN '{"released":true}';
 ELSIF op='account_branches' THEN
  IF command->>'permission' NOT IN ('identity.manage','report.read') OR NOT private.permitted(actor,command->>'permission') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  WITH branches AS (SELECT branch_id AS id FROM private.memberships UNION SELECT branch_id FROM private.resources WHERE kind='region' AND branch_id IS NOT NULL), names AS (SELECT branch_id,min(payload->>'name') AS name FROM private.resources WHERE kind='region' GROUP BY branch_id)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',CASE WHEN b.id='00000000-0000-0000-0000-000000000000' THEN 'Toàn hệ thống' ELSE coalesce(n.name,b.id::text) END) ORDER BY b.id),'[]') INTO result FROM branches b LEFT JOIN names n ON n.branch_id=b.id WHERE private.permitted(actor,command->>'permission',b.id);
  RETURN jsonb_build_object('items',result);
 ELSIF op='account_release_lease' THEN
  UPDATE private.admin_sessions SET refresh_lease=NULL,refresh_until=NULL WHERE key=command->>'key' AND refresh_lease=(command->>'lease')::uuid;
  RETURN jsonb_build_object('released',FOUND);
 ELSIF op='account_audit' THEN
  IF NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=actor AND active) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF command->>'action' NOT IN ('auth.mfa_enrollment_started','auth.mfa_verified','auth.mfa_removed','auth.password_changed') THEN RETURN jsonb_build_object('error','INVALID_ACTION','status',422); END IF;
  INSERT INTO private.audit(actor_id,action) VALUES(actor,command->>'action'); RETURN '{"saved":true}';
 ELSIF op='account_revoke_sessions' THEN
  -- The fence is written BEFORE the irreversible provider change. If final
  -- release fails, its future timestamp rejects all login attempts from the
  -- protected window even after the lease expires. Auth HTTP calls are bounded
  -- to 3 seconds each; the password flow has fewer than ten sequential calls.
  PERFORM pg_advisory_xact_lock(hashtextextended('pagefpt-auth:'||actor::text,0));
  IF EXISTS(SELECT 1 FROM private.account_operation_locks WHERE subject=actor AND expires_at>clock_timestamp()) THEN RETURN jsonb_build_object('error','SESSION_REFRESH_BUSY','status',503); END IF;
  INSERT INTO private.account_operation_locks(subject,lease,expires_at,revoked_before) VALUES(actor,(command->>'lease')::uuid,clock_timestamp()+interval '90 seconds',clock_timestamp()+interval '90 seconds') ON CONFLICT(subject) DO UPDATE SET lease=excluded.lease,expires_at=excluded.expires_at,revoked_before=excluded.revoked_before;
  DELETE FROM private.admin_sessions WHERE subject=actor;
  INSERT INTO private.audit(actor_id,action) VALUES(actor,'auth.sessions_revoked'); RETURN '{"revoked":true}';
 ELSIF op='membership_list' THEN
  IF NOT private.permitted(actor,'identity.manage') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM (SELECT * FROM private.memberships WHERE private.permitted(actor,'identity.manage',branch_id) ORDER BY user_id,branch_id LIMIT 100) m),'[]'));
 ELSIF op='staff_list' THEN
  IF NOT private.permitted(actor,'identity.manage') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM (SELECT * FROM private.memberships WHERE private.permitted(actor,'identity.manage',branch_id) AND (coalesce(command->>'q','')='' OR strpos(lower(display_name||' '||email),lower(command->>'q'))>0) ORDER BY user_id,branch_id LIMIT 51 OFFSET greatest(0,least(100000,coalesce((command->>'offset')::integer,0)))) m),'[]'));
 ELSIF op='membership_save' THEN
  target:=(data->>'user_id')::uuid; b:=(data->>'branch_id')::uuid;
  -- Serialize all changes that could remove an owner. Protect the target,
  -- rather than only protecting the requesting owner's own membership.
  PERFORM pg_advisory_xact_lock(hashtextextended('pagefpt-membership-grants',0));
  IF NOT private.permitted(actor,'identity.manage',b) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT * INTO previous FROM private.memberships WHERE user_id=target AND branch_id=b FOR UPDATE;
  IF command->'payload'->>'expected_version' IS NOT NULL AND previous.version IS DISTINCT FROM (data->>'expected_version')::integer THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF previous.active AND '*'=ANY(previous.permissions) AND b='00000000-0000-0000-0000-000000000000' AND
   (NOT (data->>'active')::boolean OR NOT data->'permissions' ? '*') AND NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id<>target AND branch_id=b AND active AND '*'=ANY(permissions)) THEN RETURN jsonb_build_object('error','LAST_OWNER_REQUIRED','status',409); END IF;
  result:=api.dispatch_before_accounts_analytics(command);
  IF NOT result ? 'error' THEN
   UPDATE private.memberships SET version=coalesce(previous.version,0)+1 WHERE user_id=target AND branch_id=b;
   IF data ? 'email' THEN UPDATE private.memberships SET email=data->>'email' WHERE user_id=target AND branch_id=b; END IF;
   IF data ? 'require_mfa' THEN UPDATE private.memberships SET require_mfa=(data->>'require_mfa')::boolean WHERE user_id=target AND branch_id=b; END IF;
   IF previous.user_id IS NOT NULL AND (previous.active IS DISTINCT FROM (data->>'active')::boolean OR previous.permissions IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(data->'permissions'))) THEN DELETE FROM private.admin_sessions WHERE subject=target; END IF;
  END IF;
  RETURN result;
 END IF;
 RETURN api.dispatch_before_accounts_analytics(command);
END $$;
REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),private.analytics_report(jsonb),api.dispatch_before_accounts_analytics(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),private.analytics_report(jsonb),api.dispatch_before_accounts_analytics(jsonb) TO service_role;
-- Supabase's public auto-RLS event trigger needs no browser execution grant.
DO $$ BEGIN IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated'; END IF; END $$;
COMMIT;
