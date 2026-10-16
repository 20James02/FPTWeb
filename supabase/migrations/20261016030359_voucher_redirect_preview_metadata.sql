BEGIN;
-- Read-only metadata for the final client page after a short-link redirect.
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_voucher_redirect_metadata;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE link private.voucher_links; voucher private.vouchers;
BEGIN
 IF command->>'op'='voucher_link_metadata' THEN
  SELECT * INTO link FROM private.voucher_links WHERE slug=command->>'slug' AND active;
  IF link.slug IS NULL OR NOT private.voucher_target_available(link.target) THEN RETURN '{}';END IF;
  SELECT * INTO voucher FROM private.vouchers WHERE id=link.voucher_id AND status='published'
   AND (published_payload->>'start')::timestamptz<=clock_timestamp()
   AND clock_timestamp()<(published_payload->>'end')::timestamptz;
  RETURN jsonb_build_object('target',link.target,'preview_image_url',link.preview_image_url,
   'title',voucher.published_payload->>'name','description',left(voucher.published_payload->>'terms',300));
 END IF;
 RETURN api.dispatch_before_voucher_redirect_metadata(command);
END $$;
REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_redirect_metadata(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_redirect_metadata(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
