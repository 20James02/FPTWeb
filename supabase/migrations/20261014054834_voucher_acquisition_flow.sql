BEGIN;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_voucher_acquisition;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target text; m private.marketing_links;
BEGIN
 IF command->>'op'='voucher_landing' THEN
  -- Only the public target of an enabled known link is exposed, never draft terms.
  SELECT vl.target INTO target FROM private.voucher_links vl
   WHERE vl.slug=command->>'slug' AND vl.active AND private.voucher_target_available(vl.target) FOR SHARE;
  IF target IS NULL THEN RETURN '{}'; END IF;
  SELECT * INTO m FROM private.marketing_links WHERE kind='voucher' AND slug=command->>'slug' FOR SHARE;
  IF m.id IS NOT NULL AND coalesce((command->>'count_click')::bool,false) THEN
   PERFORM private.link_click(m.id,coalesce((command->>'bot')::bool,false),m.version);
  END IF;
  RETURN jsonb_build_object('target',target,'id',m.id,'version',m.version);
 END IF;
 RETURN api.dispatch_before_voucher_acquisition(command);
END $$;
REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_acquisition(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_acquisition(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
