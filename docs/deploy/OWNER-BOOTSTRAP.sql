-- Project: FPTWeb / ryfdlhmbytabinsbxbup.
-- Run as an authenticated database operator; never expose through a public RPC.
-- Grants the owner account requested by the user. Does not set password or verify MFA.
BEGIN;
DO $owner_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = 'f3c42a7d-b47d-4045-bdd4-e8c0cd0cd3e2'::uuid
      AND lower(email) = '27jd07@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Owner Auth identity mismatch; no permission change applied';
  END IF;
END;
$owner_guard$;

WITH created AS (
  INSERT INTO private.memberships
    (user_id, branch_id, permissions, active, capacity, display_name)
  VALUES (
    'f3c42a7d-b47d-4045-bdd4-e8c0cd0cd3e2'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    ARRAY['*']::text[], true, 20, 'Chủ hệ thống'
  )
  ON CONFLICT (user_id, branch_id) DO NOTHING
  RETURNING user_id, branch_id
)
INSERT INTO private.audit (actor_id, branch_id, entity_id, action, payload)
SELECT user_id, branch_id, user_id, 'owner_bootstrap',
       jsonb_build_object('source', 'database_operator')
FROM created;

DO $owner_verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM private.memberships
    WHERE user_id = 'f3c42a7d-b47d-4045-bdd4-e8c0cd0cd3e2'::uuid
      AND branch_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND active AND '*' = ANY(permissions)
  ) THEN
    RAISE EXCEPTION 'Owner membership verification failed';
  END IF;
END;
$owner_verify$;
COMMIT;

SELECT user_id, branch_id, permissions, active, display_name
FROM private.memberships
WHERE user_id = 'f3c42a7d-b47d-4045-bdd4-e8c0cd0cd3e2'::uuid
  AND branch_id = '00000000-0000-0000-0000-000000000000'::uuid;
