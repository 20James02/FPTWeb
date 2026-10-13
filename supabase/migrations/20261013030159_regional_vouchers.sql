BEGIN;
CREATE TABLE private.vouchers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 payload jsonb NOT NULL, version int NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','paused')),
 published_payload jsonb, published_version int, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.voucher_links(
 slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9-]{3,50}$'), voucher_id uuid NOT NULL REFERENCES private.vouchers(id),
 target text NOT NULL CHECK(target IN ('/','/khuyen-mai','/do-toc-do') OR (target ~ '^/[a-z0-9-]{1,100}$' AND target NOT IN ('/admin','/api','/static','/health','/internal','/s','/docs','/receipt'))),
 channel text NOT NULL, employee_id uuid, active bool NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voucher_link_campaign ON private.voucher_links(voucher_id,slug);
CREATE TABLE private.voucher_inventory(
 product_id uuid PRIMARY KEY REFERENCES private.resources(id), stock int NOT NULL CHECK(stock>=0),
 cost_vnd bigint NOT NULL CHECK(cost_vnd>=0), version int NOT NULL DEFAULT 1
);
CREATE TABLE private.voucher_redemptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL REFERENCES private.vouchers(id),
 lead_id uuid NOT NULL REFERENCES private.leads(id) ON DELETE CASCADE,
 contact_id uuid REFERENCES private.contacts(id), rule_key text NOT NULL, gift_product_id uuid REFERENCES private.resources(id),
 state text NOT NULL CHECK(state IN ('held','redeemed','released','expired')), snapshot jsonb NOT NULL,
 cost_vnd bigint NOT NULL CHECK(cost_vnd>=0), expires_at timestamptz NOT NULL,
 version int NOT NULL DEFAULT 1, actor_id uuid NOT NULL, reason text,
 link_slug text REFERENCES private.voucher_links(slug), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX voucher_one_active_lead ON private.voucher_redemptions(lead_id) WHERE state IN ('held','redeemed');
CREATE INDEX voucher_capacity ON private.voucher_redemptions(voucher_id,state,expires_at) INCLUDE(cost_vnd,rule_key,contact_id);
CREATE INDEX voucher_gift_capacity ON private.voucher_redemptions(gift_product_id,state,expires_at);
CREATE INDEX voucher_lead_history ON private.voucher_redemptions(lead_id,created_at DESC);
ALTER TABLE private.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.voucher_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.voucher_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.voucher_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.vouchers,private.voucher_links,private.voucher_inventory,private.voucher_redemptions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.vouchers,private.voucher_links,private.voucher_inventory,private.voucher_redemptions TO service_role;

CREATE FUNCTION private.voucher_live(vid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v private.vouchers; data jsonb; rules jsonb; used bigint; cost bigint;
BEGIN
 SELECT * INTO v FROM private.vouchers WHERE id=vid AND status='published';
 IF v.id IS NULL THEN RETURN '{}'::jsonb; END IF;
 data:=v.published_payload;
 SELECT count(*),coalesce(sum(cost_vnd),0) INTO used,cost FROM private.voucher_redemptions
 WHERE voucher_id=v.id AND (state='redeemed' OR (state='held' AND expires_at>now()));
 SELECT jsonb_agg(r || jsonb_build_object('sold_out',
  (r->>'quota' IS NOT NULL AND (SELECT count(*) FROM private.voucher_redemptions d WHERE d.voucher_id=v.id AND d.rule_key=r->>'key' AND (d.state='redeemed' OR (d.state='held' AND d.expires_at>now()))) >= (r->>'quota')::int)
  OR (r->>'gift_product_id' IS NOT NULL AND coalesce((SELECT stock<=(SELECT count(*) FROM private.voucher_redemptions d WHERE d.gift_product_id=i.product_id AND (d.state='redeemed' OR (d.state='held' AND d.expires_at>now()))) FROM private.voucher_inventory i WHERE i.product_id=(r->>'gift_product_id')::uuid),true)),
  'gift',CASE WHEN r->>'gift_product_id' IS NOT NULL THEN (SELECT jsonb_build_object('id',p.id,'name',p.published_payload->>'name','cost_vnd',i.cost_vnd,'price_vnd',p.published_payload->'price_vnd','plan_ids',p.published_payload->'plan_ids','service',p.published_payload->'service') FROM private.voucher_inventory i JOIN private.resources p ON p.id=i.product_id WHERE i.product_id=(r->>'gift_product_id')::uuid AND p.status='published') ELSE NULL END))
 INTO rules FROM jsonb_array_elements(data->'rules') r;
 RETURN data||jsonb_build_object('id',v.id,'published_version',v.published_version,'remaining_budget_vnd',greatest(0,(data->>'budget_vnd')::bigint-cost),'rules',rules,'sold_out',used>=(data->>'quota')::int OR cost>=(data->>'budget_vnd')::bigint);
END $$;


ALTER FUNCTION private.lead_safe(private.leads) RENAME TO lead_safe_before_vouchers;
CREATE FUNCTION private.lead_safe(l private.leads) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE out jsonb:=private.lead_safe_before_vouchers(l); d private.voucher_redemptions;
BEGIN
 SELECT * INTO d FROM private.voucher_redemptions WHERE lead_id=l.id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF l.quote->'voucher'->>'id'=d.voucher_id::text AND ((d.state='held' AND d.expires_at<=statement_timestamp()) OR d.state IN ('expired','released')) THEN
  out:=out||jsonb_build_object('quote_status','needs_confirmation','quote',jsonb_set(l.quote,'{voucher,status}',to_jsonb(CASE WHEN d.state='released' THEN 'released'::text ELSE 'expired'::text END)));
 END IF;
 RETURN out;
END $$;
REVOKE EXECUTE ON FUNCTION private.lead_safe(private.leads),private.lead_safe_before_vouchers(private.leads) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.lead_safe(private.leads),private.lead_safe_before_vouchers(private.leads) TO service_role;
CREATE INDEX voucher_request_campaign ON private.leads((payload->'voucher_request'->>'voucher_id')) WHERE payload->'voucher_request'->>'voucher_id' IS NOT NULL;
CREATE FUNCTION private.voucher_report() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH funnel AS (
  SELECT l.id,l.status,r->>'voucher_id' AS voucher_id,coalesce(r->'source'->>'channel','direct') AS channel,r->'source'->>'employee_id' AS employee_id,
   coalesce(d.rule_key,'pending_address') AS rule_key,1 AS requested,(d.id IS NOT NULL)::int AS eligible,
   (coalesce(d.state='held' AND d.expires_at>now(),false))::int AS held,(coalesce(d.state='redeemed',false))::int AS redeemed,
   (l.status='installed')::int AS installed,CASE WHEN d.state='redeemed' THEN d.cost_vnd ELSE 0 END AS cost_vnd
  FROM private.leads l CROSS JOIN LATERAL (SELECT l.payload->'voucher_request' AS r) req
  LEFT JOIN LATERAL (SELECT * FROM private.voucher_redemptions x WHERE x.lead_id=l.id AND x.voucher_id::text=r->>'voucher_id' ORDER BY created_at DESC,id DESC LIMIT 1) d ON true
  WHERE r->>'voucher_id' IS NOT NULL
 ), totals AS (SELECT count(*) AS requested,coalesce(sum(eligible),0) AS eligible,coalesce(sum(held),0) AS held,coalesce(sum(redeemed),0) AS redeemed,coalesce(sum(installed),0) AS installed,coalesce(sum(cost_vnd),0) AS cost_vnd FROM funnel)
 SELECT jsonb_build_object('totals',(SELECT to_jsonb(totals) FROM totals),
 'campaigns',coalesce((SELECT jsonb_agg(x) FROM (SELECT v.id,v.code,coalesce(v.published_payload->>'name',v.payload->>'name') AS name,count(f.id) AS requested,coalesce(sum(f.eligible),0) AS eligible,coalesce(sum(f.held),0) AS held,coalesce(sum(f.redeemed),0) AS redeemed,coalesce(sum(f.installed),0) AS installed,coalesce(sum(f.cost_vnd),0) AS cost_vnd FROM private.vouchers v LEFT JOIN funnel f ON f.voucher_id=v.id::text GROUP BY v.id) x),'[]'),
 'channels',coalesce((SELECT jsonb_agg(x) FROM (SELECT channel,employee_id,sum(requested) AS requested,sum(eligible) AS eligible,sum(held) AS held,sum(redeemed) AS redeemed,sum(installed) AS installed,sum(cost_vnd) AS cost_vnd FROM funnel GROUP BY channel,employee_id) x),'[]'),
 'regions',coalesce((SELECT jsonb_agg(x) FROM (SELECT voucher_id,rule_key,sum(requested) AS requested,sum(eligible) AS eligible,sum(held) AS held,sum(redeemed) AS redeemed,sum(installed) AS installed,sum(cost_vnd) AS cost_vnd FROM funnel GROUP BY voucher_id,rule_key) x),'[]'))
$$;
REVOKE EXECUTE ON FUNCTION private.voucher_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.voucher_report() TO service_role;

CREATE FUNCTION private.voucher_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_column
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; data jsonb:=c->'payload';
 v private.vouchers; l private.leads; d private.voucher_redemptions; inv private.voucher_inventory;
 out jsonb; rule jsonb; used bigint; cost bigint; gift uuid; link private.voucher_links;
 global_id constant uuid:='00000000-0000-0000-0000-000000000000';
BEGIN
 IF op='voucher_resolve' THEN
  IF c->>'code' IS NOT NULL THEN SELECT * INTO v FROM private.vouchers WHERE code=upper(c->>'code') AND status='published';
  ELSE SELECT * INTO link FROM private.voucher_links WHERE slug=c->>'slug' AND active;
   SELECT * INTO v FROM private.vouchers WHERE id=link.voucher_id AND status='published';
  END IF;
  IF v.id IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF link.slug IS NOT NULL AND NOT ((v.published_payload->>'start')::timestamptz<=clock_timestamp() AND clock_timestamp()<(v.published_payload->>'end')::timestamptz) THEN RETURN '{}'::jsonb; END IF;
  out:=private.voucher_live(v.id);
  IF link.slug IS NOT NULL THEN out:=out||jsonb_build_object('link',jsonb_build_object('slug',link.slug,'target',link.target,'channel',link.channel)); END IF;
  RETURN out;
 END IF;
 IF op IN ('voucher_lead_read','voucher_reserve','voucher_redeem','voucher_release') THEN
  -- Contact lock precedes lead lock, matching CRM/profile/intake to avoid lock inversion.
  PERFORM private.lock_contact_command(c);
  SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT coalesce(private.can_read_lead(actor,l,'lead.write'),false) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT * INTO d FROM private.voucher_redemptions WHERE lead_id=l.id ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
  IF op='voucher_lead_read' THEN
   RETURN jsonb_build_object('lead',private.lead_safe(l),'request',l.payload->'voucher_request','deal',(SELECT jsonb_build_object('plan_id',plan_id,'billing_months',billing_months) FROM private.lead_deals WHERE lead_id=l.id),
    'redemption',CASE WHEN d.id IS NULL THEN NULL ELSE to_jsonb(d)-'contact_id'||jsonb_build_object('state',CASE WHEN d.state='held' AND d.expires_at<=clock_timestamp() THEN 'expired' ELSE d.state END) END);
  END IF;
  IF op IN ('voucher_redeem','voucher_release') THEN
   IF d.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
   IF (op='voucher_redeem' AND d.state='redeemed') OR (op='voucher_release' AND d.state='released') THEN RETURN to_jsonb(d)-'contact_id'||'{"replayed":true}'::jsonb; END IF;
   IF d.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
   IF d.state<>'held' THEN RETURN jsonb_build_object('error','VOUCHER_STATE_INVALID','status',409); END IF;
   IF length(trim(c->>'reason'))<3 THEN RETURN jsonb_build_object('error','REASON_REQUIRED','status',422); END IF;
   -- Serialize entitlement changes with reservations, including expiry boundary races.
   PERFORM 1 FROM private.vouchers WHERE id=d.voucher_id FOR UPDATE;
   IF d.gift_product_id IS NOT NULL THEN PERFORM 1 FROM private.voucher_inventory WHERE product_id=d.gift_product_id FOR UPDATE; END IF;
   IF op='voucher_redeem' THEN
    IF d.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('error','VOUCHER_HOLD_EXPIRED','status',410); END IF;
    IF l.status NOT IN ('closed','installed') OR (d.snapshot->>'redeem_at'='installed' AND l.status<>'installed') THEN RETURN jsonb_build_object('error','VOUCHER_REDEMPTION_CONDITION','status',422); END IF;
    IF EXISTS(SELECT 1 FROM private.lead_deals WHERE lead_id=l.id AND (plan_id::text IS DISTINCT FROM d.snapshot->>'plan_id' OR billing_months IS DISTINCT FROM (d.snapshot->>'billing_months')::int)) THEN RETURN jsonb_build_object('error','VOUCHER_SCOPE_CHANGED','status',409); END IF;
    IF d.snapshot->'scope' IS DISTINCT FROM jsonb_build_object('plan_id',l.payload->'plan_id','accessory_ids',coalesce(l.payload->'accessory_ids','[]'::jsonb),'address',l.payload->'address_confirmation') THEN RETURN jsonb_build_object('error','VOUCHER_SCOPE_CHANGED','status',409); END IF;
   END IF;
   UPDATE private.voucher_redemptions SET state=CASE WHEN op='voucher_redeem' THEN 'redeemed' ELSE 'released' END,reason=c->>'reason',version=version+1,updated_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
   IF op='voucher_release' THEN UPDATE private.leads SET quote_status='needs_confirmation',quote=jsonb_set(quote,'{voucher,status}','"released"'),version=version+1,updated_at=clock_timestamp() WHERE id=l.id; END IF;
   INSERT INTO private.audit(actor_id,branch_id,entity_id,action,payload) VALUES(actor,l.branch_id,l.id,op,jsonb_build_object('redemption_id',d.id,'reason',d.reason));
   RETURN to_jsonb(d)-'contact_id';
  END IF;
  -- Idempotent repeated reservation returns the committed snapshot, even after publication changes.
  IF d.state IN ('held','redeemed') AND (d.state='redeemed' OR d.expires_at>clock_timestamp()) THEN
   IF d.snapshot->'voucher'->>'code'=data->'voucher'->>'code' AND d.snapshot->>'billing_months'=data->>'billing_months' THEN RETURN to_jsonb(d)-'contact_id'||'{"replayed":true}'::jsonb; END IF;
   RETURN jsonb_build_object('error','VOUCHER_ALREADY_HELD','status',409);
  END IF;
  IF l.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF l.payload->'address_confirmation' IS NULL OR l.payload->'address_confirmation' IS DISTINCT FROM c->'address_confirmation' THEN RETURN jsonb_build_object('error','VOUCHER_ADDRESS_REQUIRED','status',422); END IF;
  IF l.status NOT IN ('quoted','closed','installed') THEN RETURN jsonb_build_object('error','VOUCHER_CLOSE_REQUIRED','status',422); END IF;
  IF data->>'status'<>'confirmed' OR data->'voucher'->>'status'<>'eligible' OR (data->>'expires_at')::timestamptz<=clock_timestamp()
   OR data->>'plan_id' IS DISTINCT FROM l.payload->>'plan_id' OR data->>'region_id' IS DISTINCT FROM l.payload->>'region_id'
   OR coalesce(data->'accessory_ids','[]'::jsonb) IS DISTINCT FROM coalesce(l.payload->'accessory_ids','[]'::jsonb)
   OR (data->>'revision')::int<>(SELECT version FROM private.catalog_revision WHERE id) THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
  IF EXISTS(SELECT 1 FROM private.lead_deals WHERE lead_id=l.id AND (plan_id::text IS DISTINCT FROM data->>'plan_id' OR billing_months IS DISTINCT FROM (data->>'billing_months')::int)) THEN RETURN jsonb_build_object('error','VOUCHER_SCOPE_CHANGED','status',409); END IF;
  SELECT * INTO v FROM private.vouchers WHERE id=(data->'voucher'->>'id')::uuid FOR UPDATE;
  IF v.id IS NULL OR v.status<>'published' OR v.published_version<>(data->'voucher'->>'version')::int
   OR NOT ((v.published_payload->>'start')::timestamptz<=clock_timestamp() AND clock_timestamp()<(v.published_payload->>'end')::timestamptz) THEN RETURN jsonb_build_object('error','VOUCHER_UNAVAILABLE','status',409); END IF;
  SELECT value INTO rule FROM jsonb_array_elements(v.published_payload->'rules') WHERE value->>'key'=data->'voucher'->>'rule_key';
  gift:=(rule->>'gift_product_id')::uuid;
  IF gift IS NOT NULL THEN
   SELECT * INTO inv FROM private.voucher_inventory WHERE product_id=gift FOR UPDATE;
   IF inv.product_id IS NULL OR inv.cost_vnd IS DISTINCT FROM (data->'voucher'->'gift'->>'cost_vnd')::bigint THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
   SELECT count(*) INTO used FROM private.voucher_redemptions WHERE gift_product_id=gift AND (state='redeemed' OR (state='held' AND expires_at>clock_timestamp()));
   IF used>=inv.stock THEN RETURN jsonb_build_object('error','VOUCHER_GIFT_SOLD_OUT','status',409); END IF;
  END IF;
  -- Capacity locks precede catalog lock, matching publication order and avoiding inversion.
  PERFORM 1 FROM private.catalog_revision WHERE id FOR SHARE;
  IF (data->>'revision')::int<>(SELECT version FROM private.catalog_revision WHERE id) OR (data->>'expires_at')::timestamptz<=clock_timestamp() THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
  SELECT count(*),coalesce(sum(cost_vnd),0) INTO used,cost FROM private.voucher_redemptions WHERE voucher_id=v.id AND (state='redeemed' OR (state='held' AND expires_at>clock_timestamp()));
  IF used>=(v.published_payload->>'quota')::int THEN RETURN jsonb_build_object('error','VOUCHER_QUOTA_EXCEEDED','status',409); END IF;
  IF cost+(data->'voucher'->>'budget_cost_vnd')::bigint>(v.published_payload->>'budget_vnd')::bigint THEN RETURN jsonb_build_object('error','VOUCHER_BUDGET_EXCEEDED','status',409); END IF;
  SELECT count(*) INTO used FROM private.voucher_redemptions WHERE voucher_id=v.id AND rule_key=rule->>'key' AND (state='redeemed' OR (state='held' AND expires_at>clock_timestamp()));
  IF rule->>'quota' IS NOT NULL AND used>=(rule->>'quota')::int THEN RETURN jsonb_build_object('error','VOUCHER_REGION_QUOTA_EXCEEDED','status',409); END IF;
  SELECT count(*) INTO used FROM private.voucher_redemptions WHERE voucher_id=v.id AND contact_id=l.contact_id AND (state='redeemed' OR (state='held' AND expires_at>clock_timestamp()));
  IF used>=(v.published_payload->>'per_contact_limit')::int THEN RETURN jsonb_build_object('error','VOUCHER_CUSTOMER_LIMIT','status',409); END IF;
  UPDATE private.voucher_redemptions SET state='expired',updated_at=clock_timestamp(),version=version+1 WHERE lead_id=l.id AND state='held' AND expires_at<=clock_timestamp();
  SELECT * INTO link FROM private.voucher_links WHERE slug=l.payload->'voucher_request'->>'link_slug' AND voucher_id=v.id;
  INSERT INTO private.voucher_redemptions(voucher_id,lead_id,contact_id,rule_key,gift_product_id,state,snapshot,cost_vnd,expires_at,actor_id,link_slug)
   VALUES(v.id,l.id,l.contact_id,rule->>'key',gift,'held',data||jsonb_build_object('source',CASE WHEN l.payload->'voucher_request'->>'voucher_id'=v.id::text THEN coalesce(l.payload->'voucher_request'->'source','{"channel":"direct"}') ELSE '{"channel":"direct"}'::jsonb END,'redeem_at',v.published_payload->>'redeem_at','scope',jsonb_build_object('plan_id',l.payload->'plan_id','accessory_ids',coalesce(l.payload->'accessory_ids','[]'::jsonb),'address',l.payload->'address_confirmation')),
    (data->'voucher'->>'budget_cost_vnd')::bigint,least(clock_timestamp()+make_interval(hours=>(v.published_payload->>'hold_hours')::int),(v.published_payload->>'end')::timestamptz),actor,link.slug) RETURNING * INTO d;
  IF l.quote IS NOT NULL THEN INSERT INTO private.quote_history(lead_id,snapshot,actor_id) VALUES(l.id,l.quote,actor); END IF;
  UPDATE private.leads SET payload=payload||jsonb_build_object('voucher_request',coalesce(payload->'voucher_request','{}')||jsonb_build_object('voucher_id',v.id,'code',v.code,'version',v.published_version,'status','eligible','source',d.snapshot->'source')),quote=data-'quote_token'-'billing_options',quote_status='confirmed',version=version+1,updated_at=clock_timestamp() WHERE id=l.id;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action,payload) VALUES(actor,l.branch_id,l.id,'voucher.held',jsonb_build_object('redemption_id',d.id,'voucher_id',v.id,'cost_vnd',d.cost_vnd));
  RETURN to_jsonb(d)-'contact_id';
 END IF;
 IF NOT private.permitted(actor,'marketing.write',global_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF op IN ('voucher_publish','voucher_pause','voucher_delete','voucher_inventory_save') AND NOT private.permitted(actor,'pricing.publish',global_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF op='voucher_employees' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(x) FROM (SELECT user_id AS id,max(nullif(display_name,'')) AS name FROM private.memberships WHERE active GROUP BY user_id ORDER BY user_id LIMIT 500) x),'[]')); END IF;
 IF op='voucher_link_read' THEN
  SELECT * INTO link FROM private.voucher_links WHERE slug=c->>'slug';
  IF link.slug IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN to_jsonb(link);
 END IF;
 IF op='voucher_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM private.vouchers WHERE c->>'before' IS NULL OR id<(c->>'before')::uuid ORDER BY id DESC LIMIT 50) x),'[]'),'links',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM private.voucher_links ORDER BY created_at DESC LIMIT 500) x),'[]')); END IF;
 IF op='voucher_inventory_list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM private.voucher_inventory x),'[]')); END IF;
 IF op='voucher_inventory_save' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(data->>'product_id',6371938));
  IF NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(data->>'product_id')::uuid AND kind='product' AND status='published' AND published_payload->>'billing_mode'='one_time') THEN RETURN jsonb_build_object('error','INVALID_GIFT','status',422); END IF;
  SELECT * INTO inv FROM private.voucher_inventory WHERE product_id=(data->>'product_id')::uuid FOR UPDATE;
  IF coalesce(inv.version,0)<>(data->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  SELECT count(*) INTO used FROM private.voucher_redemptions WHERE gift_product_id=(data->>'product_id')::uuid AND (state='redeemed' OR (state='held' AND expires_at>clock_timestamp()));
  IF (data->>'stock')::int<used THEN RETURN jsonb_build_object('error','INVENTORY_BELOW_COMMITTED','status',409); END IF;
  INSERT INTO private.voucher_inventory(product_id,stock,cost_vnd) VALUES((data->>'product_id')::uuid,(data->>'stock')::int,(data->>'cost_vnd')::bigint)
   ON CONFLICT(product_id) DO UPDATE SET stock=excluded.stock,cost_vnd=excluded.cost_vnd,version=private.voucher_inventory.version+1 RETURNING * INTO inv;
  INSERT INTO private.audit(actor_id,entity_id,action,payload) VALUES(actor,inv.product_id,'voucher.inventory',to_jsonb(inv));
  RETURN to_jsonb(inv);
 END IF;
 IF op='voucher_report' THEN RETURN private.voucher_report(); END IF;
 IF op='voucher_save' THEN
  IF c->>'id' IS NULL THEN
   IF EXISTS(SELECT 1 FROM private.vouchers WHERE code=data->>'code') THEN RETURN jsonb_build_object('error','VOUCHER_CODE_EXISTS','status',409); END IF;
   INSERT INTO private.vouchers(code,payload) VALUES(data->>'code',data) RETURNING * INTO v;
  ELSE
   SELECT * INTO v FROM private.vouchers WHERE id=(c->>'id')::uuid FOR UPDATE;
   IF v.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
   IF v.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
   IF v.code<>data->>'code' THEN RETURN jsonb_build_object('error','VOUCHER_CODE_IMMUTABLE','status',422); END IF;
   UPDATE private.vouchers SET payload=data,version=version+1,updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
  END IF;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,v.id,'voucher.draft_saved');
  RETURN to_jsonb(v);
 END IF;
 SELECT * INTO v FROM private.vouchers WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF v.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF op='voucher_link_save' THEN
  IF data->>'employee_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.memberships WHERE user_id=(data->>'employee_id')::uuid AND active) THEN RETURN jsonb_build_object('error','INVALID_EMPLOYEE','status',422); END IF;
  IF EXISTS(SELECT 1 FROM private.voucher_links WHERE slug=data->>'slug' AND voucher_id<>v.id) THEN RETURN jsonb_build_object('error','LINK_SLUG_EXISTS','status',409); END IF;
  INSERT INTO private.voucher_links(slug,voucher_id,target,channel,employee_id,active) VALUES(data->>'slug',v.id,data->>'target',data->>'channel',(data->>'employee_id')::uuid,(data->>'active')::bool)
   ON CONFLICT(slug) DO UPDATE SET target=excluded.target,channel=excluded.channel,employee_id=excluded.employee_id,active=excluded.active RETURNING * INTO link;
  INSERT INTO private.audit(actor_id,entity_id,action,payload) VALUES(actor,v.id,'voucher.link_saved',jsonb_build_object('slug',link.slug));
  RETURN to_jsonb(link);
 END IF;
 IF v.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 IF op='voucher_publish' THEN
  IF (v.payload->>'end')::timestamptz<=clock_timestamp() THEN RETURN jsonb_build_object('error','VOUCHER_EXPIRED','status',422); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(v.payload->'plan_ids') x LEFT JOIN private.resources r ON r.id=x.value::uuid AND r.kind='plan' AND r.status='published' WHERE r.id IS NULL) THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v.payload->'rules') x LEFT JOIN private.voucher_inventory i ON i.product_id=(x->>'gift_product_id')::uuid LEFT JOIN private.resources p ON p.id=i.product_id AND p.status='published' AND p.kind='product' AND p.published_payload->>'billing_mode'='one_time' WHERE x->>'gift_product_id' IS NOT NULL AND p.id IS NULL) THEN RETURN jsonb_build_object('error','INVALID_GIFT','status',422); END IF;
  SELECT count(*),coalesce(sum(cost_vnd),0) INTO used,cost FROM private.voucher_redemptions WHERE voucher_id=v.id AND (state='redeemed' OR (state='held' AND expires_at>clock_timestamp()));
  IF used>(v.payload->>'quota')::int OR cost>(v.payload->>'budget_vnd')::bigint THEN RETURN jsonb_build_object('error','VOUCHER_LIMIT_BELOW_COMMITTED','status',409); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v.payload->'rules') r WHERE r->>'quota' IS NOT NULL AND (SELECT count(*) FROM private.voucher_redemptions d WHERE d.voucher_id=v.id AND d.rule_key=r->>'key' AND (d.state='redeemed' OR (d.state='held' AND d.expires_at>clock_timestamp())))>(r->>'quota')::int)
   OR EXISTS(SELECT 1 FROM private.voucher_redemptions WHERE voucher_id=v.id AND (state='redeemed' OR (state='held' AND expires_at>clock_timestamp())) GROUP BY contact_id HAVING count(*)>(v.payload->>'per_contact_limit')::int) THEN RETURN jsonb_build_object('error','VOUCHER_LIMIT_BELOW_COMMITTED','status',409); END IF;
  UPDATE private.vouchers SET published_payload=payload,published_version=version,status='published',version=version+1,updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
 ELSIF op='voucher_pause' THEN UPDATE private.vouchers SET status='paused',version=version+1,updated_at=clock_timestamp() WHERE id=v.id RETURNING * INTO v;
 ELSIF op='voucher_delete' THEN
  IF v.published_payload IS NOT NULL OR EXISTS(SELECT 1 FROM private.voucher_redemptions WHERE voucher_id=v.id) OR EXISTS(SELECT 1 FROM private.voucher_links WHERE voucher_id=v.id) THEN RETURN jsonb_build_object('error','VOUCHER_ARCHIVE_REQUIRED','status',409); END IF;
  DELETE FROM private.vouchers WHERE id=v.id;
 ELSE RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
 END IF;
 UPDATE private.catalog_revision SET version=version+1 WHERE id;
 INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,v.id,op);
 RETURN to_jsonb(v);
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_vouchers;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l private.leads;
BEGIN
 IF command->>'op' LIKE 'voucher_%' THEN RETURN private.voucher_dispatch(command); END IF;
 IF command->>'op' IN ('lead_profile_update','quote_confirm','billing_save') THEN
  PERFORM private.lock_contact_command(command);
  SELECT * INTO l FROM private.leads WHERE id=(command->>'id')::uuid FOR UPDATE;
  IF coalesce(private.can_read_lead((command->>'actor')::uuid,l,'lead.write'),false) AND EXISTS(SELECT 1 FROM private.voucher_redemptions WHERE lead_id=l.id AND state='held' AND expires_at>clock_timestamp() AND (command->>'op'<>'billing_save' OR snapshot->>'plan_id' IS DISTINCT FROM command->'payload'->>'plan_id' OR snapshot->>'billing_months' IS DISTINCT FROM command->'payload'->>'billing_months')) THEN RETURN jsonb_build_object('error','VOUCHER_RELEASE_BEFORE_EDIT','status',409); END IF;
 END IF;
 RETURN api.dispatch_before_vouchers(command);
END $$;
ALTER FUNCTION api.submit_lead(jsonb) RENAME TO submit_lead_before_vouchers;
CREATE FUNCTION api.submit_lead(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; result jsonb; v private.vouchers; k private.voucher_links; intent jsonb; l private.leads;
BEGIN
 IF nullif(c->'payload'->>'voucher_code','') IS NOT NULL THEN SELECT * INTO v FROM private.vouchers WHERE code=c->'payload'->>'voucher_code' AND status='published';
 ELSIF c->'payload'->>'voucher_code' IS DISTINCT FROM '' AND c->'payload'->>'voucher_link' IS NOT NULL THEN
  SELECT * INTO k FROM private.voucher_links WHERE slug=c->'payload'->>'voucher_link' AND active;
  SELECT * INTO v FROM private.vouchers WHERE id=k.voucher_id AND status='published';
 END IF;
 IF v.id IS NOT NULL OR nullif(c->'payload'->>'voucher_code','') IS NOT NULL OR k.slug IS NOT NULL THEN
  intent:=jsonb_build_object('voucher_id',v.id,'code',coalesce(v.code,c->'payload'->>'voucher_code'),'version',v.published_version,'status',CASE WHEN v.id IS NULL OR NOT ((v.published_payload->>'start')::timestamptz<=now() AND now()<(v.published_payload->>'end')::timestamptz) THEN 'unavailable' ELSE 'pending_address' END,'link_slug',k.slug);
  -- Explicit code may be the same campaign as a sharing link; preserve operational source.
  IF k.slug IS NULL THEN SELECT * INTO k FROM private.voucher_links WHERE slug=c->'payload'->>'voucher_link' AND active AND voucher_id=v.id; intent:=intent||jsonb_build_object('link_slug',k.slug); END IF;
  intent:=intent||jsonb_build_object('source',jsonb_build_object('channel',coalesce(k.channel,'direct'),'employee_id',k.employee_id,'link_slug',k.slug));
  c:=jsonb_set(c,'{payload}',(c->'payload')||jsonb_build_object('voucher_request',intent));
 END IF;
 c:=jsonb_set(c,'{payload}',(c->'payload')-'voucher_link'-'voucher_code');
 result:=api.submit_lead_before_vouchers(c);
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION private.voucher_live(uuid),private.voucher_dispatch(jsonb),api.dispatch(jsonb),api.dispatch_before_vouchers(jsonb),api.submit_lead(jsonb),api.submit_lead_before_vouchers(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.voucher_live(uuid),private.voucher_dispatch(jsonb),api.dispatch(jsonb),api.dispatch_before_vouchers(jsonb),api.submit_lead(jsonb),api.submit_lead_before_vouchers(jsonb) TO service_role;
COMMIT;
