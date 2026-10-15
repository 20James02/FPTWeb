BEGIN;
ALTER TABLE private.prices
 ADD COLUMN display_monthly_vnd bigint CHECK(display_monthly_vnd BETWEEN 0 AND 1000000000),
 ADD COLUMN equipment jsonb CHECK(equipment IS NULL OR (jsonb_typeof(equipment)='array' AND jsonb_array_length(equipment)<=20));

-- Reuse the existing permission, overlap, history and compare-and-swap boundaries.
-- A JSON domain error must raise inside this subtransaction to roll back EVERY row.
CREATE FUNCTION private.price_matrix_write(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; data jsonb; result jsonb; items jsonb:='[]'; old private.prices;
 publish_now boolean:=coalesce((c->>'publish')::boolean,false);
BEGIN
 IF jsonb_array_length(c->'rows') NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('error','INVALID_BATCH','status',422); END IF;
 PERFORM 1 FROM private.catalog_revision WHERE id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  data:=item->'price';
  IF coalesce((data->>'monthly_coefficient')::numeric,1)<>1 THEN
   result:=jsonb_build_object('error','INVALID_COEFFICIENT','status',422);
   RAISE EXCEPTION 'rollback matrix' USING ERRCODE='P0001';
  END IF;
  IF item->>'id' IS NULL THEN
   result:=api.dispatch(jsonb_build_object('op','price_create','actor',c->>'actor','payload',data));
  ELSE
   -- Check access before inspecting state or comparing any submitted identity.
   result:=api.dispatch(jsonb_build_object('op','price_get','actor',c->>'actor','id',item->>'id'));
   IF result ? 'error' THEN RAISE EXCEPTION 'rollback matrix' USING ERRCODE='P0001'; END IF;
   SELECT * INTO old FROM private.prices WHERE id=(item->>'id')::uuid FOR UPDATE;
   IF old.plan_id IS DISTINCT FROM (data->>'plan_id')::uuid OR old.scope_id IS DISTINCT FROM (data->>'scope_id')::uuid
    OR old.scope_kind IS DISTINCT FROM data->>'scope_kind' OR old.billing_months IS DISTINCT FROM (data->>'billing_months')::int THEN
    result:=jsonb_build_object('error','IMMUTABLE_SCOPE','status',409);
    RAISE EXCEPTION 'rollback matrix' USING ERRCODE='P0001';
   END IF;
   IF old.version IS DISTINCT FROM (item->>'expected_version')::int THEN
    result:=jsonb_build_object('error','VERSION_CONFLICT','status',409);
    RAISE EXCEPTION 'rollback matrix' USING ERRCODE='P0001';
   END IF;
   IF old.status='published' AND NOT publish_now THEN
    result:=jsonb_build_object('error','PUBLISHED_PRICE_IMMUTABLE','status',409);
    RAISE EXCEPTION 'rollback matrix' USING ERRCODE='P0001';
   END IF;
   result:=api.dispatch(jsonb_build_object('op',CASE WHEN old.status='published' THEN 'price_replace' ELSE 'price_update' END,
    'actor',c->>'actor','id',item->>'id','expected_version',item->'expected_version','payload',data));
  END IF;
  IF result ? 'error' THEN RAISE EXCEPTION 'rollback matrix' USING ERRCODE='P0001'; END IF;
  IF publish_now AND result->>'status'<>'published' THEN
   result:=api.dispatch(jsonb_build_object('op','price_publish','actor',c->>'actor','id',result->>'id','expected_version',result->'version'));
   IF result ? 'error' THEN RAISE EXCEPTION 'rollback matrix' USING ERRCODE='P0001'; END IF;
  END IF;
  items:=items||jsonb_build_array(result);
 END LOOP;
 RETURN jsonb_build_object('items',items);
EXCEPTION WHEN SQLSTATE 'P0001' THEN RETURN result;
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_direct_period_prices;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; result jsonb; p private.prices; anchor_at timestamptz;
BEGIN
 IF c->>'op'='price_matrix_save' THEN RETURN private.price_matrix_write(c); END IF;
 IF c->>'op'='price_matrix_read' THEN
  result:=api.dispatch_before_direct_period_prices(jsonb_build_object('op','price_get','actor',c->>'actor','id',c->>'id'));
  IF result ? 'error' THEN RETURN result; END IF;
  SELECT * INTO p FROM private.prices WHERE id=(c->>'id')::uuid;
  anchor_at:=CASE WHEN p.effective @> now() THEN now() ELSE lower(p.effective) END;
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'effective'||jsonb_build_object('start',lower(x.effective),'end',upper(x.effective)) ORDER BY x.billing_months,x.id)
   FROM private.prices x WHERE x.plan_id=p.plan_id AND x.scope_kind=p.scope_kind AND x.scope_id=p.scope_id
    AND (x.id=p.id OR (x.status IN ('draft','published') AND x.effective @> anchor_at))),'[]'));
 END IF;
 result:=api.dispatch_before_direct_period_prices(c);
 IF NOT(result ? 'error') AND c->>'op' IN ('price_create','price_update') THEN
  UPDATE private.prices SET display_monthly_vnd=(c->'payload'->>'display_monthly_vnd')::bigint,
   equipment=nullif(c->'payload'->'equipment','null'::jsonb) WHERE id=(result->>'id')::uuid RETURNING * INTO p;
  result:=result||jsonb_build_object('display_monthly_vnd',p.display_monthly_vnd,'equipment',p.equipment);
 END IF;
 IF NOT(result ? 'error') AND c->>'op'='pricing_data' THEN
  result:=result||jsonb_build_object('plan_equipment',(SELECT published_payload->'equipment' FROM private.resources WHERE id=(c->>'plan_id')::uuid AND kind='plan' AND status='published'));
 END IF;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION private.price_matrix_write(jsonb),api.dispatch(jsonb),api.dispatch_before_direct_period_prices(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.price_matrix_write(jsonb),api.dispatch(jsonb),api.dispatch_before_direct_period_prices(jsonb) TO service_role;
COMMIT;
