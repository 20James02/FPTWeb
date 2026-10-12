BEGIN;
ALTER TABLE private.prices ADD COLUMN monthly_coefficient numeric NOT NULL DEFAULT 1
 CHECK (monthly_coefficient BETWEEN 0 AND 100 AND monthly_coefficient=round(monthly_coefficient,4));
CREATE OR REPLACE FUNCTION private.pricing_read(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.resources; parent private.resources; plan private.resources; gid uuid; path uuid[]:='{}'; allowed boolean:=true;
BEGIN
 PERFORM 1 FROM private.catalog_revision WHERE id FOR SHARE;
 SELECT * INTO plan FROM private.resources WHERE id=(c->>'plan_id')::uuid AND kind='plan' AND status='published';
 IF plan.id IS NULL THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
 IF c->>'region_id' IS NOT NULL THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'region_id')::uuid AND kind='region' AND status='published';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
  path:=ARRAY[r.id];
  IF r.published_payload->>'level'='ward' THEN
   SELECT * INTO parent FROM private.resources WHERE id=(r.published_payload->>'parent_id')::uuid AND kind='region' AND status='published';
   IF parent.id IS NULL THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
   path:=array_append(path,parent.id);
  END IF;
  gid:=coalesce((r.published_payload->>'price_group_id')::uuid,(parent.published_payload->>'price_group_id')::uuid);
  allowed:=coalesce(jsonb_array_length(plan.published_payload->'applicable_region_ids'),0)=0 OR EXISTS(SELECT 1 FROM unnest(path) x WHERE plan.published_payload->'applicable_region_ids' ? x::text);
 END IF;
 RETURN jsonb_build_object('available',allowed,'region_path',to_jsonb(path),'prices',coalesce((SELECT jsonb_agg(to_jsonb(p)-'effective'||jsonb_build_object('start',lower(p.effective),'end',upper(p.effective))) FROM private.prices p WHERE p.plan_id=plan.id AND p.status='published' AND p.billing_months=ANY(ARRAY[1,6,12,coalesce((c->>'billing_months')::int,6)]) AND ((p.scope_kind='region' AND p.scope_id=ANY(path)) OR (p.scope_kind='group' AND p.scope_id=gid) OR p.scope_kind='default')),'[]'),
 'promotions',coalesce((SELECT jsonb_agg(published_payload||jsonb_build_object('id',id)) FROM private.resources WHERE kind='promotion' AND status='published' AND (coalesce(jsonb_array_length(published_payload->'plan_ids'),0)=0 OR published_payload->'plan_ids' ? (c->>'plan_id'))),'[]'),
 'group_id',gid,'revision',coalesce((SELECT version FROM private.catalog_revision WHERE id),1));
END $$;


CREATE FUNCTION private.period_price_import(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; result jsonb; count_rows int:=0;
BEGIN
 IF jsonb_array_length(c->'rows') NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('error','INVALID_BATCH','status',422); END IF;
 PERFORM 1 FROM private.catalog_revision WHERE id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  result:=api.dispatch(jsonb_build_object('op','price_create','actor',c->>'actor','payload',item));
  IF result ? 'error' THEN RAISE EXCEPTION 'rollback import' USING ERRCODE='P0001'; END IF;
  count_rows:=count_rows+1;
 END LOOP;
 INSERT INTO private.audit(actor_id,action,payload) VALUES((c->>'actor')::uuid,'price.imported',jsonb_build_object('rows',count_rows));
 RETURN jsonb_build_object('imported',count_rows,'status','draft');
EXCEPTION WHEN SQLSTATE 'P0001' THEN RETURN result;
END $$;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_period_coefficient;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; result jsonb; coefficient numeric;
BEGIN
 IF c->>'op'='price_import' THEN RETURN private.period_price_import(c); END IF;
 IF c->>'op' IN ('price_create','price_update') THEN
  coefficient:=coalesce((c->'payload'->>'monthly_coefficient')::numeric,1);
  IF NOT(coefficient BETWEEN 0 AND 100) OR coefficient<>round(coefficient,4) THEN
   RETURN jsonb_build_object('error','INVALID_COEFFICIENT','status',422);
  END IF;
 END IF;
 result:=api.dispatch_before_period_coefficient(c);
 IF c->>'op' IN ('price_create','price_update') AND NOT(result ? 'error') THEN
  UPDATE private.prices SET monthly_coefficient=coefficient WHERE id=(result->>'id')::uuid;
  result:=result||jsonb_build_object('monthly_coefficient',coefficient);
 END IF;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION private.period_price_import(jsonb),api.dispatch(jsonb),api.dispatch_before_period_coefficient(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.period_price_import(jsonb),api.dispatch(jsonb),api.dispatch_before_period_coefficient(jsonb) TO service_role;
COMMIT;
