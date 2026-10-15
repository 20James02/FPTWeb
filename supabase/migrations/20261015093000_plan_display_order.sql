-- Migration: Plan display order support for public catalog
BEGIN;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_display_order;

CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command;
BEGIN
 IF c->>'op'='public_catalog' AND c->>'kind'='plan' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'version',published_version)||published_payload ORDER BY coalesce((published_payload->>'sort_order')::int, 9999) ASC, (published_payload->>'name') ASC, id) FROM private.resources WHERE kind='plan' AND status='published'),'[]'));
 END IF;
 RETURN api.dispatch_before_display_order(c);
END $$;

REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_display_order(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_display_order(jsonb) TO service_role;

COMMIT;
