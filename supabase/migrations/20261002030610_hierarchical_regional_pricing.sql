BEGIN;
CREATE INDEX resources_published_province ON private.resources(id) WHERE kind='region' AND status='published' AND coalesce(published_payload->>'level','province')='province';
CREATE INDEX resources_region_parent ON private.resources ((payload->>'parent_id'),id) WHERE kind='region';
CREATE INDEX resources_published_region_parent ON private.resources ((published_payload->>'parent_id'),id) WHERE kind='region' AND status='published';

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
 RETURN jsonb_build_object('available',allowed,'region_path',to_jsonb(path),'prices',coalesce((SELECT jsonb_agg(to_jsonb(p)-'effective'||jsonb_build_object('start',lower(p.effective),'end',upper(p.effective))) FROM private.prices p WHERE p.plan_id=plan.id AND p.status='published' AND p.billing_months=coalesce((c->>'billing_months')::int,6) AND ((p.scope_kind='region' AND p.scope_id=ANY(path)) OR (p.scope_kind='group' AND p.scope_id=gid) OR p.scope_kind='default')),'[]'),
 'promotions',coalesce((SELECT jsonb_agg(published_payload||jsonb_build_object('id',id)) FROM private.resources WHERE kind='promotion' AND status='published' AND (coalesce(jsonb_array_length(published_payload->'plan_ids'),0)=0 OR published_payload->'plan_ids' ? (c->>'plan_id'))),'[]'),
 'group_id',gid,'revision',coalesce((SELECT version FROM private.catalog_revision WHERE id),1));
END $$;

-- JSON errors trigger a subtransaction rollback, including audit and revision writes.
CREATE FUNCTION private.regional_price_write(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE out_value jsonb; items jsonb:='[]'; row jsonb; old private.prices; start_at timestamptz;
BEGIN
 IF c->>'op'='price_bulk' THEN
  IF jsonb_array_length(c->'rows') NOT BETWEEN 1 AND 500 THEN RETURN jsonb_build_object('error','INVALID_BATCH','status',422); END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
   out_value:=api.dispatch(jsonb_build_object('op','price_create','actor',c->>'actor','payload',row));
   IF out_value ? 'error' THEN RAISE EXCEPTION 'rollback batch' USING ERRCODE='P0001'; END IF;
   IF coalesce((c->>'publish')::bool,false) THEN
    out_value:=api.dispatch(jsonb_build_object('op','price_publish','actor',c->>'actor','id',out_value->>'id','expected_version',out_value->'version'));
    IF out_value ? 'error' THEN RAISE EXCEPTION 'rollback batch' USING ERRCODE='P0001'; END IF;
   END IF;
   items:=items||jsonb_build_array(out_value);
  END LOOP;
  RETURN jsonb_build_object('items',items);
 END IF;
 SELECT * INTO old FROM private.prices WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF old.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF NOT private.permitted((c->>'actor')::uuid,'pricing.write',private.price_branch(old)) OR NOT private.permitted((c->>'actor')::uuid,'pricing.publish',private.price_branch(old)) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF old.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 IF old.status<>'published' THEN RETURN jsonb_build_object('error','PRICE_NOT_PUBLISHED','status',409); END IF;
 row:=c->'payload'; start_at:=(row->>'start')::timestamptz;
 IF old.plan_id<>(row->>'plan_id')::uuid OR old.scope_id<>(row->>'scope_id')::uuid OR old.scope_kind<>row->>'scope_kind' OR old.billing_months<>(row->>'billing_months')::int THEN RETURN jsonb_build_object('error','IMMUTABLE_SCOPE','status',409); END IF;
 IF NOT old.effective @> start_at THEN RETURN jsonb_build_object('error','INVALID_REPLACEMENT_START','status',422); END IF;
 IF start_at=lower(old.effective) THEN
  UPDATE private.prices SET status='retired',version=version+1 WHERE id=old.id;
 ELSE
  UPDATE private.prices SET effective=tstzrange(lower(old.effective),start_at,'[)'),version=version+1 WHERE id=old.id;
 END IF;
 out_value:=api.dispatch(jsonb_build_object('op','price_create','actor',c->>'actor','payload',row));
 IF out_value ? 'error' THEN RAISE EXCEPTION 'rollback replacement' USING ERRCODE='P0001'; END IF;
 out_value:=api.dispatch(jsonb_build_object('op','price_publish','actor',c->>'actor','id',out_value->>'id','expected_version',out_value->'version'));
 IF out_value ? 'error' THEN RAISE EXCEPTION 'rollback replacement' USING ERRCODE='P0001'; END IF;
 INSERT INTO private.audit(actor_id,entity_id,action,payload) VALUES((c->>'actor')::uuid,old.id,'price.replaced',jsonb_build_object('replacement_id',out_value->>'id'));
 RETURN out_value;
EXCEPTION WHEN SQLSTATE 'P0001' THEN RETURN out_value;
 WHEN exclusion_violation THEN RETURN jsonb_build_object('error','PRICE_OVERLAP','status',409);
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_regional_pricing;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c jsonb:=command; op text:=c->>'op'; kind text:=c->>'kind'; actor uuid:=(c->>'actor')::uuid; data jsonb:=c->'payload'; r private.resources; parent private.resources; p private.prices; x text; b uuid; rows jsonb; lim int:=least(100,coalesce((c->>'limit')::int,100)); is_public boolean:=coalesce((c->>'public')::bool,false);
BEGIN
 IF op='public_catalog' AND kind='region' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'version',published_version)||published_payload ORDER BY published_payload->>'name',id) FROM private.resources WHERE resources.kind='region' AND status='published' AND coalesce(published_payload->>'level','province')='province'),'[]'));
 END IF;
 IF op='price_list' THEN
  rows:=api.dispatch_before_regional_pricing(c);
  RETURN rows||jsonb_build_object('items',(SELECT coalesce(jsonb_agg(value||jsonb_build_object('scope_label',CASE WHEN value->>'scope_kind'='default' THEN 'Giá mặc định' WHEN value->>'scope_kind'='group' THEN 'Nhóm giá' ELSE coalesce(scope_region.payload->>'name','Địa bàn đã cấu hình')||CASE WHEN scope_region.payload->>'level'='ward' THEN ' · '||coalesce(scope_parent.payload->>'name','Xã/phường') ELSE '' END END) ORDER BY (value->>'id')::uuid DESC),'[]') FROM jsonb_array_elements(rows->'items') a(value) LEFT JOIN private.resources scope_region ON scope_region.id=(value->>'scope_id')::uuid AND scope_region.kind='region' LEFT JOIN private.resources scope_parent ON scope_parent.id=(scope_region.payload->>'parent_id')::uuid AND scope_parent.kind='region'));
 END IF;
 IF op='location_list' OR (op='resource_list' AND kind IN ('plan','region')) THEN
  IF op='location_list' THEN kind:='region'; END IF;
  IF is_public AND NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(c->>'parent_id')::uuid AND resources.kind='region' AND status='published' AND coalesce(published_payload->>'level','province')='province') THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
  IF NOT is_public AND NOT private.permitted(actor,'catalog.write') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.id DESC),'[]') INTO rows FROM (SELECT rr.* FROM private.resources rr WHERE rr.kind=kind AND ((is_public AND status='published') OR (NOT is_public AND private.permitted(actor,'catalog.write',coalesce(branch_id,'00000000-0000-0000-0000-000000000000')))) AND (op<>'location_list' OR (coalesce((CASE WHEN is_public THEN published_payload ELSE payload END)->>'level','province')=c->>'level' AND (c->>'parent_id' IS NULL OR (CASE WHEN is_public THEN published_payload ELSE payload END)->>'parent_id'=c->>'parent_id'))) AND (c->>'before' IS NULL OR rr.id<(c->>'before')::uuid) ORDER BY rr.id DESC LIMIT lim+1) z;
  IF is_public THEN SELECT coalesce(jsonb_agg(value->'published_payload'||jsonb_build_object('id',value->>'id','version',value->'published_version') ORDER BY value->>'id' DESC),'[]') INTO rows FROM jsonb_array_elements(rows); END IF;
  RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(value ORDER BY n),'[]') FROM jsonb_array_elements(rows) WITH ORDINALITY a(value,n) WHERE n<=lim),'next_cursor',CASE WHEN jsonb_array_length(rows)>lim THEN rows->(lim-1)->>'id' ELSE NULL END);
 END IF;
 -- Lock catalog before rows: prevents parent retirement racing with child creation/publish.
 IF (op IN ('resource_save','resource_update','resource_publish','resource_retire') AND kind IN ('plan','region')) OR op IN ('price_create','price_update','price_publish','price_retire','price_bulk','price_replace') THEN
  PERFORM 1 FROM private.catalog_revision WHERE id FOR UPDATE;
 END IF;
 IF op IN ('price_bulk','price_replace') THEN RETURN private.regional_price_write(c); END IF;
 IF op IN ('resource_save','resource_update','resource_publish','resource_retire') AND kind IN ('plan','region') THEN
  IF op<>'resource_save' THEN SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND resources.kind=kind FOR UPDATE; IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF; END IF;
  b:=coalesce(r.branch_id,(c->>'branch_id')::uuid,'00000000-0000-0000-0000-000000000000');
  IF NOT private.permitted(actor,'catalog.write',b) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='resource_publish' THEN data:=r.payload; END IF;
  IF kind='region' THEN
   IF op='resource_retire' THEN
    IF EXISTS(SELECT 1 FROM private.resources WHERE resources.kind='region' AND status<>'retired' AND payload->>'parent_id'=r.id::text) THEN RETURN jsonb_build_object('error','REGION_HAS_CHILDREN','status',409); END IF;
   ELSE
    IF op='resource_update' AND (coalesce(data->>'level','province') IS DISTINCT FROM coalesce(r.payload->>'level','province') OR data->>'parent_id' IS DISTINCT FROM r.payload->>'parent_id') THEN RETURN jsonb_build_object('error','IMMUTABLE_SCOPE','status',409); END IF;
    IF data->>'level'='ward' THEN
     SELECT * INTO parent FROM private.resources WHERE id=(data->>'parent_id')::uuid AND resources.kind='region' AND status<>'retired' AND coalesce(payload->>'level','province')='province';
     IF parent.id IS NULL OR parent.branch_id IS DISTINCT FROM (data->>'branch_id')::uuid OR (op='resource_publish' AND parent.status<>'published') THEN RETURN jsonb_build_object('error','INVALID_PARENT','status',422); END IF;
    END IF;
   END IF;
  ELSIF op<>'resource_retire' THEN
   FOR x IN SELECT jsonb_array_elements_text(coalesce(data->'applicable_region_ids','[]')) LOOP
    IF NOT EXISTS(SELECT 1 FROM private.resources WHERE id=x::uuid AND resources.kind='region' AND status<>'retired' AND (op<>'resource_publish' OR status='published')) THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
   END LOOP;
  END IF;
 END IF;
 IF op IN ('price_create','price_update','price_publish') THEN
  IF op='price_publish' THEN SELECT * INTO p FROM private.prices WHERE id=(c->>'id')::uuid; data:=to_jsonb(p); END IF;
  IF data->>'scope_kind'='region' THEN
   SELECT * INTO r FROM private.resources WHERE id=(data->>'scope_id')::uuid AND resources.kind='region' AND status<>'retired';
   IF r.id IS NULL OR (op='price_publish' AND r.status<>'published') THEN RETURN jsonb_build_object('error','INVALID_REGION','status',422); END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(data->>'plan_id')::uuid AND resources.kind='plan' AND status<>'retired' AND (op<>'price_publish' OR status='published')) THEN RETURN jsonb_build_object('error','INVALID_PLAN','status',422); END IF;
 END IF;
 RETURN api.dispatch_before_regional_pricing(c);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private TO service_role;
GRANT EXECUTE ON FUNCTION private.allowed_topic(text) TO authenticated;
COMMIT;
