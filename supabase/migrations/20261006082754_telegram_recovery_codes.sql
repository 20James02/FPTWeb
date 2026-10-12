BEGIN;
-- Only one current challenge per configured account. Email/code are HMACs;
-- provider proof and transient outbound code use application AES-GCM.
CREATE TABLE private.telegram_recovery (
 account_key text PRIMARY KEY, id uuid NOT NULL UNIQUE, subject uuid,
 chat_id text, code_hash text NOT NULL DEFAULT '',
 code_ciphertext text NOT NULL DEFAULT '', proof_ciphertext text NOT NULL DEFAULT '',
 state text NOT NULL CHECK(state IN ('reserved','ready','consumed','blocked','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
ALTER TABLE private.telegram_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.telegram_recovery FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.telegram_recovery TO service_role;

CREATE FUNCTION private.telegram_recovery_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.telegram_recovery; job private.jobs; delivery private.deliveries;
 gate jsonb; result jsonb; jid uuid;
BEGIN
 IF c->>'op'='telegram_recovery_request_gate' THEN
  gate:=private.consume_bucket(jsonb_build_object('key','telegram-recovery-send:'||(c->>'key'),'capacity',1,'rate',1.0/60));
  IF NOT (gate->>'allowed')::boolean THEN RETURN jsonb_build_object('error','RATE_LIMITED','status',429); END IF;
  RETURN '{"allowed":true}';
 ELSIF c->>'op'='telegram_recovery_reserve' THEN
  -- Serialize issuance before generating a provider proof, avoiding concurrent
  -- generate_link calls invalidating a newer challenge's underlying token.
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram-recovery:'||(c->>'key'),0));
  SELECT * INTO r FROM private.telegram_recovery WHERE account_key=c->>'key' FOR UPDATE;
  IF r.account_key IS NOT NULL AND r.created_at>now()-interval '60 seconds' THEN
   RETURN jsonb_build_object('error','RATE_LIMITED','status',429);
  END IF;
  INSERT INTO private.telegram_recovery(account_key,id,state,expires_at)
  VALUES(c->>'key',(c->>'id')::uuid,'reserved',now()+interval '5 minutes')
  ON CONFLICT(account_key) DO UPDATE SET id=excluded.id,subject=NULL,chat_id=NULL,code_hash='',
   code_ciphertext='',proof_ciphertext='',state='reserved',attempts=0,created_at=now(),expires_at=excluded.expires_at;
  RETURN '{"reserved":true}';
 ELSIF c->>'op'='telegram_recovery_issue' THEN
  SELECT * INTO r FROM private.telegram_recovery WHERE account_key=c->>'key' AND id=(c->>'id')::uuid FOR UPDATE;
  IF r.id IS NULL OR r.state<>'reserved' OR r.expires_at<=now() THEN RETURN jsonb_build_object('error','RECOVERY_EXPIRED','status',401); END IF;
  IF NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=(c->>'subject')::uuid AND active) THEN
   UPDATE private.telegram_recovery SET state='cancelled' WHERE account_key=r.account_key;
   RETURN '{"issued":false}';
  END IF;
  IF c->>'chat_id' !~ '^[1-9][0-9]{0,19}$' OR length(c->>'code_hash')<>64 THEN
   RETURN jsonb_build_object('error','RECOVERY_UNCONFIGURED','status',503);
  END IF;
  UPDATE private.telegram_recovery SET state='ready',subject=(c->>'subject')::uuid,chat_id=c->>'chat_id',
   code_hash=c->>'code_hash',code_ciphertext=c->>'code_ciphertext',proof_ciphertext=c->>'proof_ciphertext'
  WHERE account_key=r.account_key;
  jid:=private.enqueue('notifications','telegram_recovery',r.id,'telegram-recovery:'||r.id);
  -- Queue/admin job list never contains the code, email or provider proof.
  RETURN jsonb_build_object('issued',true,'queued',jid IS NOT NULL);
 ELSIF c->>'op'='telegram_recovery_consume' THEN
  SELECT * INTO r FROM private.telegram_recovery WHERE account_key=c->>'key' AND id=(c->>'id')::uuid FOR UPDATE;
  IF r.id IS NULL OR r.state<>'ready' OR r.chat_id IS DISTINCT FROM c->>'chat_id' THEN RETURN jsonb_build_object('error','RECOVERY_EXPIRED','status',401); END IF;
  IF r.expires_at<=now() THEN
   UPDATE private.telegram_recovery SET state='cancelled',code_ciphertext='',proof_ciphertext='',code_hash='' WHERE account_key=r.account_key;
   RETURN jsonb_build_object('error','RECOVERY_EXPIRED','status',401);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=r.subject AND active) THEN
   UPDATE private.telegram_recovery SET state='cancelled',code_ciphertext='',proof_ciphertext='',code_hash='' WHERE account_key=r.account_key;
   RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403);
  END IF;
  IF r.code_hash IS DISTINCT FROM c->>'code_hash' THEN
   UPDATE private.telegram_recovery SET attempts=attempts+1,
    state=CASE WHEN attempts>=4 THEN 'blocked' ELSE state END,
    proof_ciphertext=CASE WHEN attempts>=4 THEN '' ELSE proof_ciphertext END,
    code_ciphertext=CASE WHEN attempts>=4 THEN '' ELSE code_ciphertext END,
    code_hash=CASE WHEN attempts>=4 THEN '' ELSE code_hash END WHERE account_key=r.account_key;
   RETURN jsonb_build_object('error','RECOVERY_EXPIRED','status',401);
  END IF;
  result:=jsonb_build_object('subject',r.subject,'proof_ciphertext',r.proof_ciphertext);
  UPDATE private.telegram_recovery SET state='consumed',code_ciphertext='',proof_ciphertext='',code_hash='' WHERE account_key=r.account_key;
  RETURN result;
 END IF;
 -- Delivery is fenced like other workers. Stale, expired, revoked and consumed
 -- challenges are skipped; ambiguous provider sends never replay automatically.
 SELECT * INTO job FROM private.jobs WHERE id=(c->>'id')::uuid AND kind='telegram_recovery' FOR UPDATE;
 IF job.id IS NULL OR job.state<>'running' OR job.fence<>(c->>'fence')::bigint OR job.lease_until<=now() THEN RETURN '{"status":"stale"}'; END IF;
 IF c->>'op'='telegram_recovery_finish' THEN
  IF c->>'state' NOT IN ('accepted','unknown','retry','failed','disabled') THEN RETURN jsonb_build_object('error','INVALID_DELIVERY_STATE','status',422); END IF;
  UPDATE private.deliveries SET state=c->>'state',result=c->'result' WHERE platform='telegram_recovery' AND event_id=job.id AND state='sending';
  IF c->>'state'<>'retry' THEN UPDATE private.telegram_recovery SET code_ciphertext='' WHERE id=job.entity_id; END IF;
  RETURN jsonb_build_object('saved',FOUND);
 END IF;
 SELECT * INTO r FROM private.telegram_recovery WHERE id=job.entity_id FOR UPDATE;
 IF r.id IS NULL OR r.state<>'ready' OR r.expires_at<=now() OR r.code_ciphertext='' OR
  NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=r.subject AND active) THEN
  IF r.id IS NOT NULL AND (r.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=r.subject AND active)) THEN
   UPDATE private.telegram_recovery SET state='cancelled',code_ciphertext='',proof_ciphertext='',code_hash='' WHERE account_key=r.account_key;
  END IF;
  RETURN '{"status":"cancelled"}';
 END IF;
 INSERT INTO private.deliveries(platform,event_id,account_id) VALUES('telegram_recovery',job.id,'telegram') ON CONFLICT DO NOTHING;
 SELECT * INTO delivery FROM private.deliveries WHERE platform='telegram_recovery' AND event_id=job.id AND account_id='telegram' FOR UPDATE;
 IF delivery.state='sending' THEN
  UPDATE private.deliveries SET state='unknown',result='{"code":"ABANDONED_ATTEMPT"}' WHERE id=delivery.id;
  UPDATE private.telegram_recovery SET code_ciphertext='' WHERE id=r.id;
  RETURN '{"status":"unknown"}';
 END IF;
 IF delivery.state NOT IN ('pending','retry','disabled') THEN RETURN jsonb_build_object('status',delivery.state); END IF;
 UPDATE private.deliveries SET state='sending',attempt=attempt+1 WHERE id=delivery.id;
 RETURN jsonb_build_object('status','ready','notice',jsonb_build_object('kind','recovery_code','chat_id',r.chat_id,'code_ciphertext',r.code_ciphertext,'expires_at',r.expires_at));
END $$;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_telegram_recovery;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op' IN ('telegram_recovery_request_gate','telegram_recovery_reserve','telegram_recovery_issue','telegram_recovery_consume','telegram_recovery_prepare','telegram_recovery_finish') THEN RETURN private.telegram_recovery_dispatch(command); END IF;
 RETURN api.dispatch_before_telegram_recovery(command);
END $$;
REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),private.telegram_recovery_dispatch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),private.telegram_recovery_dispatch(jsonb) TO service_role;
COMMIT;
