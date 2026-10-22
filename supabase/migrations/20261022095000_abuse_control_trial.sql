BEGIN;

CREATE TABLE IF NOT EXISTS private.abuse_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK(target_type IN ('ip', 'session', 'phone', 'subnet')),
  target_hash text NOT NULL,
  target_masked text NOT NULL,
  action text NOT NULL DEFAULT 'challenge' CHECK(action IN ('block', 'challenge', 'shadow_ban')),
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS abuse_rules_lookup_idx ON private.abuse_rules(target_type, target_hash) WHERE active;

CREATE OR REPLACE FUNCTION private.abuse_check(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE
 r private.abuse_rules;
 hashes text[];
BEGIN
 hashes:=ARRAY[c->>'ip_hash', c->>'session_hash', c->>'phone_hash'];
 SELECT * INTO r FROM private.abuse_rules
  WHERE active AND expires_at > now() AND target_hash = ANY(hashes)
  ORDER BY CASE action WHEN 'block' THEN 1 WHEN 'challenge' THEN 2 ELSE 3 END, created_at DESC
  LIMIT 1;

 IF r.id IS NOT NULL THEN
  UPDATE private.abuse_rules SET hit_count=hit_count+1 WHERE id=r.id;
  RETURN jsonb_build_object(
   'matched', true,
   'action', r.action,
   'reason', r.reason,
   'rule_id', r.id,
   'target_type', r.target_type
  );
 END IF;

 RETURN jsonb_build_object('matched', false);
END $$;

CREATE OR REPLACE FUNCTION private.abuse_rule_save(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE
 r private.abuse_rules;
 exp timestamptz;
 hours int:=coalesce((c->>'duration_hours')::int, 24);
BEGIN
 IF hours <= 0 THEN exp:='infinity'::timestamptz; ELSE exp:=now() + (hours || ' hours')::interval; END IF;
 
 INSERT INTO private.abuse_rules(target_type, target_hash, target_masked, action, reason, expires_at, created_by, active)
 VALUES(
  c->>'target_type',
  c->>'target_hash',
  coalesce(c->>'target_masked', '***'),
  coalesce(c->>'action', 'challenge'),
  coalesce(c->>'reason', 'Admin block'),
  exp,
  (c->>'actor')::uuid,
  true
 ) RETURNING * INTO r;

 INSERT INTO private.audit(actor_id, action, payload)
 VALUES((c->>'actor')::uuid, 'abuse_rule.created', jsonb_build_object('rule_id', r.id, 'target_type', r.target_type, 'action', r.action));

 RETURN to_jsonb(r);
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_abuse_trial;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; op text:=c->>'op';
BEGIN
 IF op='abuse_check' THEN
  RETURN private.abuse_check(c);
 END IF;
 IF op='abuse_rule_list' THEN
  IF NOT (private.permitted((c->>'actor')::uuid, 'lead.read') OR private.permitted((c->>'actor')::uuid, 'workflow.manage')) THEN
   RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403);
  END IF;
  RETURN jsonb_build_object('items', coalesce((
   SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
   FROM (
    SELECT * FROM private.abuse_rules
    WHERE (coalesce((c->>'active_only')::bool, true) IS FALSE OR (active AND expires_at > now()))
    ORDER BY created_at DESC LIMIT least(100, coalesce((c->>'limit')::int, 50))
   ) r
  ), '[]'::jsonb));
 END IF;
 IF op='abuse_rule_save' THEN
  IF NOT (private.permitted((c->>'actor')::uuid, 'lead.write') OR private.permitted((c->>'actor')::uuid, 'workflow.manage')) THEN
   RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403);
  END IF;
  RETURN private.abuse_rule_save(c);
 END IF;
 IF op='abuse_rule_delete' THEN
  IF NOT (private.permitted((c->>'actor')::uuid, 'lead.write') OR private.permitted((c->>'actor')::uuid, 'workflow.manage')) THEN
   RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403);
  END IF;
  UPDATE private.abuse_rules SET active=false WHERE id=(c->>'id')::uuid;
  INSERT INTO private.audit(actor_id, action, payload)
  VALUES((c->>'actor')::uuid, 'abuse_rule.deleted', jsonb_build_object('rule_id', c->>'id'));
  RETURN jsonb_build_object('success', true, 'id', c->>'id');
 END IF;
 IF op='lead_abuse_targets' THEN
  IF NOT private.permitted((c->>'actor')::uuid, 'lead.write') THEN
   RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403);
  END IF;
  RETURN (
   SELECT jsonb_build_object(
    'ip_ciphertext', l.payload->>'ip_ciphertext',
    'session_id', l.payload->>'session_id',
    'pii_ciphertext', l.pii_ciphertext,
    'version', l.version,
    'status', l.status
   )
   FROM private.leads l WHERE l.id=(c->>'id')::uuid
  );
 END IF;
 RETURN api.dispatch_before_abuse_trial(command);
END $$;

REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_abuse_trial(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_abuse_trial(jsonb) TO service_role;
REVOKE ALL ON TABLE private.abuse_rules FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE private.abuse_rules TO service_role;
REVOKE ALL ON FUNCTION private.abuse_check(jsonb), private.abuse_rule_save(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.abuse_check(jsonb), private.abuse_rule_save(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
