BEGIN;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_accessories;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; result jsonb; kind text:=c->>'kind'; op text:=c->>'op'; r private.resources; q private.quotes; slug text; rows jsonb; lim int:=least(100,greatest(1,coalesce((c->>'limit')::int,30)));
BEGIN
 IF op='lead_replay' THEN
  SELECT i.result, i.digest INTO result, slug FROM private.idempotency i WHERE i.key=c->>'key' AND i.expires_at>now() FOR SHARE;
  IF FOUND AND slug IS DISTINCT FROM c->>'digest' THEN RETURN jsonb_build_object('error','IDEMPOTENCY_CONFLICT','status',409); END IF;
  RETURN CASE WHEN result IS NOT NULL THEN result||jsonb_build_object('replayed',true) ELSE '{}'::jsonb END;
 END IF;
 IF op='resource_list' AND kind='product' THEN
  IF NOT private.permitted((c->>'actor')::uuid,'catalog.write') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') INTO rows FROM (SELECT * FROM private.resources rr WHERE rr.kind='product' AND private.permitted((c->>'actor')::uuid,'catalog.write',coalesce(rr.branch_id,'00000000-0000-0000-0000-000000000000')) AND (c->>'before' IS NULL OR rr.id<(c->>'before')::uuid) ORDER BY rr.id DESC LIMIT lim+1) x;
  RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(value ORDER BY n),'[]') FROM jsonb_array_elements(rows) WITH ORDINALITY a(value,n) WHERE n<=lim),'next_cursor',CASE WHEN jsonb_array_length(rows)>lim THEN rows->(lim-1)->>'id' ELSE NULL END);
 END IF;
 IF kind='product' AND op IN ('resource_save','resource_update','resource_publish','resource_retire') THEN PERFORM 1 FROM private.catalog_revision WHERE id FOR UPDATE; END IF;
 IF op='experiment_results' THEN
  IF NOT private.permitted((c->>'actor')::uuid,'marketing.write','00000000-0000-0000-0000-000000000000') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND resources.kind='experiment';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN jsonb_build_object('id',r.id,'version',r.published_version,'variants',coalesce((
   SELECT jsonb_agg(jsonb_build_object('name',v->>'name','exposures',
      (SELECT count(DISTINCT e.session_id) FROM private.events e JOIN private.sessions se ON se.id=e.session_id AND se.analytics WHERE e.name='experiment_exposure' AND e.payload->>'experiment_id'=r.id::text AND e.payload->>'variant'=v->>'name' AND (e.payload->>'experiment_version')::int=r.published_version),
    'leads', (SELECT count(DISTINCT l.id) FROM private.leads l JOIN private.events e ON e.session_id::text=l.payload->>'session_id' JOIN private.sessions se ON se.id=e.session_id AND se.analytics WHERE e.name='experiment_exposure' AND e.payload->>'experiment_id'=r.id::text AND e.payload->>'variant'=v->>'name' AND (e.payload->>'experiment_version')::int=r.published_version AND l.created_at>=e.created_at AND private.can_read_lead((c->>'actor')::uuid,l))))
   FROM jsonb_array_elements(coalesce(r.published_payload->'variants',r.payload->'variants')) v),'[]'::jsonb),'note','Đếm phiên có đồng ý phân tích; chưa kết luận biến thể thắng khi mẫu nhỏ.');
 END IF;
 IF kind='page'  AND op IN ('resource_save','resource_update','resource_publish') THEN
  IF NOT private.permitted((c->>'actor')::uuid,CASE WHEN op='resource_publish' THEN 'content.publish' ELSE 'content.write' END,'00000000-0000-0000-0000-000000000000') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='resource_publish' THEN SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid; slug:=r.payload->>'slug'; ELSE slug:=c->'payload'->>'slug'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('page-slug:'||coalesce(slug,''),0));
  IF slug IN ('admin','api','internal','receipt','health','docs','static','san-pham','do-toc-do','khuyen-mai','chinh-sach-bao-mat','robots','sitemap') THEN RETURN jsonb_build_object('error','RESERVED_SLUG','status',422); END IF;
  IF EXISTS(SELECT 1 FROM private.resources x WHERE x.kind='page' AND x.status<>'retired' AND x.id IS DISTINCT FROM (c->>'id')::uuid AND (x.payload->>'slug'=slug OR x.published_payload->>'slug'=slug)) THEN RETURN jsonb_build_object('error','SLUG_CONFLICT','status',409); END IF;
 END IF;
 IF op='quote_save' THEN
  PERFORM 1 FROM private.catalog_revision WHERE id FOR SHARE;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c->'payload'->'accessory_snapshot','[]'::jsonb)) x LEFT JOIN private.resources rr ON rr.id=(x->>'id')::uuid AND rr.kind='product' LEFT JOIN private.resources pp ON pp.id=(c->'payload'->>'plan_id')::uuid AND pp.kind='plan' WHERE pp.id IS NULL OR pp.status<>'published' OR rr.published_payload->>'service' IS DISTINCT FROM pp.published_payload->>'service' OR (coalesce(jsonb_array_length(rr.published_payload->'plan_ids'),0)>0 AND NOT (rr.published_payload->'plan_ids' ? (pp.id::text))) OR rr.id IS NULL OR rr.status<>'published' OR rr.published_version<>(x->>'version')::int OR rr.published_payload->'price_vnd' IS DISTINCT FROM x->'price_vnd' OR rr.published_payload->'billing_mode' IS DISTINCT FROM x->'billing_mode') THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
  IF (c->'payload'->>'revision')::bigint<>(SELECT version FROM private.catalog_revision WHERE id) THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
 END IF;
 IF op='quote_confirm' THEN
  SELECT * INTO q FROM private.quotes WHERE id=(c->>'quote_id')::uuid;
  IF coalesce(q.payload->'accessory_ids','[]'::jsonb) IS DISTINCT FROM coalesce((SELECT payload->'accessory_ids' FROM private.leads WHERE id=(c->>'id')::uuid),'[]'::jsonb) THEN RETURN jsonb_build_object('error','QUOTE_SCOPE_MISMATCH','status',422); END IF;
 END IF;
 result:=api.dispatch_before_accessories(c);
 IF kind='product' AND op IN ('resource_update','resource_retire') AND NOT result ? 'error' THEN
  UPDATE private.catalog_revision SET version=version+1 WHERE id;
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION api.submit_lead(jsonb) RENAME TO submit_lead_before_accessories;
CREATE FUNCTION api.submit_lead(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; q private.quotes;
BEGIN
 SELECT * INTO q FROM private.quotes WHERE id=(c->>'quote_id')::uuid;
 IF coalesce(q.payload->'accessory_ids','[]'::jsonb) IS DISTINCT FROM coalesce(c->'payload'->'accessory_ids','[]'::jsonb) THEN c:=c||jsonb_build_object('quote_id',NULL); END IF;
 RETURN api.submit_lead_before_accessories(c);
END $$;
REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_accessories(jsonb),api.submit_lead(jsonb),api.submit_lead_before_accessories(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_accessories(jsonb),api.submit_lead(jsonb),api.submit_lead_before_accessories(jsonb) TO service_role;
COMMIT;
