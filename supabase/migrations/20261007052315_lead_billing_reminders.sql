BEGIN;
CREATE TABLE private.lead_deals (
 lead_id uuid PRIMARY KEY REFERENCES private.leads(id) ON DELETE CASCADE,
 plan_id uuid NOT NULL REFERENCES private.resources(id), plan_name text NOT NULL,
 billing_months integer NOT NULL CHECK(billing_months IN (1,6,12)), notes_ciphertext text NOT NULL,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_deals_plan ON private.lead_deals(plan_id);
CREATE TABLE private.payments (
 id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES private.lead_deals(lead_id) ON DELETE CASCADE,
 plan_id uuid NOT NULL, plan_name text NOT NULL, billing_months integer NOT NULL CHECK(billing_months IN (1,6,12)),
 due_date date NOT NULL CHECK(due_date BETWEEN '2020-01-01' AND '2100-12-31'), anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
 amount_vnd bigint NOT NULL CHECK(amount_vnd BETWEEN 1 AND 1000000000), notes_ciphertext text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
 version integer NOT NULL DEFAULT 1, command_hash text, collect_hash text,
 next_payment_id uuid, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_live_date ON private.payments(lead_id,due_date) WHERE status<>'cancelled';
CREATE INDEX payments_lead_page ON private.payments(lead_id,created_at DESC,id DESC);
CREATE INDEX payments_due ON private.payments(due_date,id) WHERE status='pending';
CREATE TABLE private.payment_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES private.payments(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL, payment_version integer NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(payment_id,recipient_id,payment_version)
);
CREATE INDEX payment_notices_recipient ON private.payment_notices(recipient_id,created_at DESC,id DESC);
ALTER TABLE private.lead_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.payment_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.lead_deals,private.payments,private.payment_notices FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.lead_deals,private.payments,private.payment_notices TO service_role;

CREATE FUNCTION private.payment_safe(p private.payments,b uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(p)-'command_hash'-'collect_hash'||jsonb_build_object('scope_branch_id',b)
$$;

-- Indexed, bounded and deduplicated. A handoff is evaluated against the current
-- lead and current memberships; cancelled/collected/revised entries stop showing.
CREATE FUNCTION private.payment_reminder_tick(a uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n integer;
BEGIN
 WITH candidates AS (
  SELECT p.id,l.assignee_id,p.version
  FROM private.payments p JOIN private.leads l ON l.id=p.lead_id
  WHERE p.status='pending' AND p.due_date<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
   AND l.status NOT IN ('invalid','duplicate','rejected') AND l.assignee_id IS NOT NULL
   AND (a IS NULL OR l.assignee_id=a) AND private.can_read_lead(l.assignee_id,l)
   AND NOT EXISTS(SELECT 1 FROM private.payment_notices nn WHERE nn.payment_id=p.id AND nn.recipient_id=l.assignee_id AND nn.payment_version=p.version)
  ORDER BY p.due_date,p.id LIMIT 100 FOR UPDATE OF p SKIP LOCKED
 ), inserted AS (
  INSERT INTO private.payment_notices(payment_id,recipient_id,payment_version)
  SELECT id,assignee_id,version FROM candidates ON CONFLICT DO NOTHING RETURNING 1
 ) SELECT count(*) INTO n FROM inserted;
 RETURN n;
END $$;

CREATE FUNCTION private.billing_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; data jsonb:=c->'payload';
 l private.leads; d private.lead_deals; p private.payments; existing private.payments; nxt private.payments;
 r private.resources; lid uuid; selected_id uuid; next_date date; first_date date; result jsonb;
BEGIN
 IF op='payment_notifications' THEN
  IF NOT private.permitted(actor,'lead.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  PERFORM private.payment_reminder_tick(actor);
  WITH visible AS MATERIALIZED (
   SELECT nn.id,nn.read_at,nn.created_at,pp.id AS payment_id,pp.lead_id,pp.version AS payment_version,pp.plan_name,pp.billing_months,pp.due_date,pp.amount_vnd
   FROM private.payment_notices nn JOIN private.payments pp ON pp.id=nn.payment_id JOIN private.leads ll ON ll.id=pp.lead_id
   WHERE nn.recipient_id=actor AND ll.assignee_id=actor AND private.can_read_lead(actor,ll)
    AND pp.status='pending' AND pp.version=nn.payment_version AND pp.due_date<=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND ll.status NOT IN ('invalid','duplicate','rejected')
  ) SELECT jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY (read_at IS NULL) DESC,due_date,id),'[]') FROM (SELECT * FROM visible ORDER BY (read_at IS NULL) DESC,due_date,id LIMIT least(100,coalesce((c->>'limit')::int,30))) x),'unread_count',(SELECT count(*) FROM visible WHERE read_at IS NULL),'as_of',now(),'timezone','Asia/Ho_Chi_Minh') INTO result;
  RETURN result;
 ELSIF op='payment_notice_read' THEN
  UPDATE private.payment_notices nn SET read_at=coalesce(nn.read_at,now())
  FROM private.payments pp JOIN private.leads ll ON ll.id=pp.lead_id
  WHERE nn.id=(c->>'id')::uuid AND nn.recipient_id=actor AND pp.id=nn.payment_id
   AND pp.version=nn.payment_version AND pp.status='pending' AND ll.assignee_id=actor AND private.can_read_lead(actor,ll);
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN '{"read":true}';
 END IF;
 IF op IN ('payment_update','payment_collect') THEN
  SELECT pp.lead_id INTO lid FROM private.payments pp WHERE pp.id=(c->>'id')::uuid;
 ELSE lid:=(c->>'id')::uuid; END IF;
 SELECT * INTO l FROM private.leads WHERE id=lid FOR UPDATE;
 IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF NOT private.can_read_lead(actor,l,CASE WHEN op IN ('billing_read','payment_list') THEN 'lead.read' ELSE 'lead.write' END) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 SELECT * INTO d FROM private.lead_deals WHERE lead_id=l.id FOR UPDATE;
 IF op='billing_read' THEN
  RETURN jsonb_build_object('deal',CASE WHEN d.lead_id IS NULL THEN NULL ELSE to_jsonb(d)||jsonb_build_object('scope_branch_id',l.branch_id) END);
 ELSIF op='payment_list' THEN
  IF c->>'before' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.payments WHERE id=(c->>'before')::uuid AND lead_id=l.id) THEN RETURN jsonb_build_object('error','INVALID_CURSOR','status',422); END IF;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.payment_safe(x,l.branch_id) ORDER BY created_at DESC,id DESC) FROM (SELECT * FROM private.payments pp WHERE pp.lead_id=l.id AND (c->>'before' IS NULL OR (pp.created_at,pp.id)<(SELECT xx.created_at,xx.id FROM private.payments xx WHERE xx.id=(c->>'before')::uuid AND xx.lead_id=l.id)) ORDER BY created_at DESC,id DESC LIMIT least(101,coalesce((c->>'limit')::int,31))) x),'[]'));
 END IF;
 IF l.status IN ('invalid','duplicate','rejected') THEN RETURN jsonb_build_object('error','BILLING_NOT_ALLOWED','status',409); END IF;
 IF op='billing_save' THEN
  IF coalesce(d.version,0)<>(data->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  SELECT * INTO r FROM private.resources WHERE id=(data->>'plan_id')::uuid AND kind='plan' AND status='published';
  IF r.id IS NULL OR (data->>'billing_months')::int NOT IN (1,6,12) THEN RETURN jsonb_build_object('error','INVALID_BILLING_PLAN','status',422); END IF;
  IF d.lead_id IS NULL THEN
   INSERT INTO private.lead_deals(lead_id,plan_id,plan_name,billing_months,notes_ciphertext) VALUES(l.id,r.id,coalesce(r.published_payload->>'name',r.payload->>'name','Gói cước'),(data->>'billing_months')::int,coalesce(data->>'notes_ciphertext',c->>'empty_notes_ciphertext','')) RETURNING * INTO d;
  ELSE
   UPDATE private.lead_deals SET plan_id=r.id,plan_name=coalesce(r.published_payload->>'name',r.payload->>'name','Gói cước'),billing_months=(data->>'billing_months')::int,notes_ciphertext=coalesce(data->>'notes_ciphertext',notes_ciphertext),version=version+1,updated_at=now() WHERE lead_id=l.id RETURNING * INTO d;
  END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'billing.saved');
  RETURN jsonb_build_object('deal',to_jsonb(d)||jsonb_build_object('scope_branch_id',l.branch_id));
 END IF;
 IF d.lead_id IS NULL THEN RETURN jsonb_build_object('error','BILLING_REQUIRED','status',409); END IF;
 IF op='payment_create' THEN
  selected_id:=(data->>'payment_id')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended('pagefpt-payment:'||selected_id::text,0));
  SELECT * INTO existing FROM private.payments WHERE id=selected_id;
  IF existing.id IS NOT NULL THEN
   IF existing.lead_id<>l.id OR existing.command_hash IS DISTINCT FROM data->>'command_hash' THEN RETURN jsonb_build_object('error','IDEMPOTENCY_CONFLICT','status',409); END IF;
   RETURN private.payment_safe(existing,l.branch_id);
  END IF;
  IF d.version<>(data->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF EXISTS(SELECT 1 FROM private.payments WHERE lead_id=l.id AND due_date=(data->>'due_date')::date AND status<>'cancelled') THEN RETURN jsonb_build_object('error','PAYMENT_DATE_EXISTS','status',409); END IF;
  INSERT INTO private.payments(id,lead_id,plan_id,plan_name,billing_months,due_date,anchor_day,amount_vnd,notes_ciphertext,command_hash)
  VALUES(selected_id,l.id,d.plan_id,d.plan_name,d.billing_months,(data->>'due_date')::date,extract(day FROM (data->>'due_date')::date),(data->>'amount_vnd')::bigint,data->>'notes_ciphertext',data->>'command_hash') RETURNING * INTO p;
  UPDATE private.lead_deals SET version=version+1,updated_at=now() WHERE lead_id=l.id;
 ELSE
  SELECT * INTO p FROM private.payments WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF op='payment_collect' AND p.status='paid' AND p.collect_hash=data->>'command_hash' THEN
   SELECT * INTO nxt FROM private.payments WHERE id=p.next_payment_id;
   RETURN jsonb_build_object('payment',private.payment_safe(p,l.branch_id),'next_payment',CASE WHEN nxt.id IS NULL THEN NULL ELSE private.payment_safe(nxt,l.branch_id) END);
  END IF;
  IF p.version<>(data->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF p.status<>'pending' THEN RETURN jsonb_build_object('error','INVALID_PAYMENT_STATE','status',409); END IF;
  IF op='payment_update' THEN
   next_date:=coalesce((data->>'due_date')::date,p.due_date);
   IF EXISTS(SELECT 1 FROM private.payments WHERE lead_id=l.id AND id<>p.id AND due_date=next_date AND status<>'cancelled') AND data->>'status'<>'cancelled' THEN RETURN jsonb_build_object('error','PAYMENT_DATE_EXISTS','status',409); END IF;
   UPDATE private.payments SET status=data->>'status',due_date=next_date,anchor_day=CASE WHEN next_date<>p.due_date THEN extract(day FROM next_date) ELSE anchor_day END,amount_vnd=coalesce((data->>'amount_vnd')::bigint,amount_vnd),notes_ciphertext=coalesce(data->>'notes_ciphertext',notes_ciphertext),version=version+1,updated_at=now() WHERE id=p.id RETURNING * INTO p;
  ELSIF op='payment_collect' THEN
   IF (data->>'create_next')::boolean THEN
    first_date:=(date_trunc('month',p.due_date)+(p.billing_months||' months')::interval)::date;
    next_date:=first_date+least(p.anchor_day,extract(day FROM first_date+interval '1 month'-interval '1 day')::int)-1;
    IF next_date>'2100-12-31' THEN RETURN jsonb_build_object('error','INVALID_DATE_RANGE','status',422); END IF;
    IF EXISTS(SELECT 1 FROM private.payments WHERE lead_id=l.id AND due_date=next_date AND status<>'cancelled') THEN RETURN jsonb_build_object('error','PAYMENT_DATE_EXISTS','status',409); END IF;
    INSERT INTO private.payments(id,lead_id,plan_id,plan_name,billing_months,due_date,anchor_day,amount_vnd,notes_ciphertext)
    VALUES(gen_random_uuid(),l.id,p.plan_id,p.plan_name,p.billing_months,next_date,p.anchor_day,p.amount_vnd,p.notes_ciphertext) RETURNING * INTO nxt;
   END IF;
   UPDATE private.payments SET status='paid',paid_at=now(),next_payment_id=nxt.id,collect_hash=data->>'command_hash',version=version+1,updated_at=now() WHERE id=p.id RETURNING * INTO p;
   UPDATE private.lead_deals SET version=version+1,updated_at=now() WHERE lead_id=l.id;
   INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'payment.collected');
   RETURN jsonb_build_object('payment',private.payment_safe(p,l.branch_id),'next_payment',CASE WHEN nxt.id IS NULL THEN NULL ELSE private.payment_safe(nxt,l.branch_id) END);
  ELSE RETURN jsonb_build_object('error','UNSUPPORTED_OPERATION','status',422); END IF;
 END IF;
 INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,CASE WHEN op='payment_create' THEN 'payment.scheduled' ELSE 'payment.updated' END);
 RETURN private.payment_safe(p,l.branch_id);
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_billing;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op' IN ('billing_read','billing_save','payment_list','payment_create','payment_update','payment_collect','payment_notifications','payment_notice_read') THEN RETURN private.billing_dispatch(command); END IF;
 IF command->>'op'='schedule_tick' THEN PERFORM private.payment_reminder_tick(); END IF;
 RETURN api.dispatch_before_billing(command);
END $$;
REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_billing(jsonb),private.billing_dispatch(jsonb),private.payment_safe(private.payments,uuid),private.payment_reminder_tick(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_billing(jsonb),private.billing_dispatch(jsonb),private.payment_safe(private.payments,uuid),private.payment_reminder_tick(uuid) TO service_role;
COMMIT;
