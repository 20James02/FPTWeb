BEGIN;
ALTER TABLE private.voucher_links ADD COLUMN preview_image_url text NOT NULL DEFAULT '' CHECK (length(preview_image_url)<=1500);
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_voucher_preview;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb; link private.voucher_links; voucher private.vouchers; tracked private.marketing_links;
BEGIN
 IF command->>'op'='voucher_link_preview' THEN
  SELECT * INTO link FROM private.voucher_links WHERE slug=command->>'slug' AND active FOR SHARE;
  IF link.slug IS NULL OR NOT private.voucher_target_available(link.target) THEN RETURN '{}';END IF;
  SELECT * INTO voucher FROM private.vouchers WHERE id=link.voucher_id AND status='published'
   AND (published_payload->>'start')::timestamptz<=clock_timestamp()
   AND clock_timestamp()<(published_payload->>'end')::timestamptz;
  SELECT * INTO tracked FROM private.marketing_links WHERE kind='voucher' AND slug=link.slug FOR SHARE;
  IF tracked.id IS NOT NULL THEN PERFORM private.link_click(tracked.id,true,tracked.version);END IF;
  -- Only published content; draft terms, notes, staff identities and budgets stay private.
  RETURN jsonb_build_object('target',link.target,'preview_image_url',link.preview_image_url,
   'title',voucher.published_payload->>'name','description',left(voucher.published_payload->>'terms',300));
 END IF;
 result:=api.dispatch_before_voucher_preview(command);
 IF command->>'op'='voucher_link_save' AND NOT result ? 'error' AND command->'payload' ? 'preview_image_url' THEN
  UPDATE private.voucher_links SET preview_image_url=coalesce(command->'payload'->>'preview_image_url','')
   WHERE slug=result->>'slug' AND voucher_id=(command->>'id')::uuid RETURNING * INTO link;
  result:=to_jsonb(link);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_preview(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_preview(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
