BEGIN;

ALTER TABLE private.voucher_links 
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_domain text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hide_domain bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_title bool NOT NULL DEFAULT false;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_voucher_social_meta;

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
  RETURN jsonb_build_object(
   'target',link.target,
   'preview_image_url',link.preview_image_url,
   'title',CASE WHEN link.hide_title THEN '' ELSE coalesce(nullif(link.title,''),voucher.published_payload->>'name','') END,
   'description',CASE WHEN link.hide_title THEN '' ELSE coalesce(nullif(link.content_note,''),left(voucher.published_payload->>'terms',300),'') END,
   'custom_domain',link.custom_domain,
   'hide_domain',link.hide_domain,
   'hide_title',link.hide_title
  );
 END IF;

 IF command->>'op'='voucher_link_metadata' THEN
  SELECT * INTO link FROM private.voucher_links WHERE slug=command->>'slug' AND active;
  IF link.slug IS NULL OR NOT private.voucher_target_available(link.target) THEN RETURN '{}';END IF;
  SELECT * INTO voucher FROM private.vouchers WHERE id=link.voucher_id AND status='published'
   AND (published_payload->>'start')::timestamptz<=clock_timestamp()
   AND clock_timestamp()<(published_payload->>'end')::timestamptz;
  RETURN jsonb_build_object(
   'target',link.target,
   'preview_image_url',link.preview_image_url,
   'title',CASE WHEN link.hide_title THEN '' ELSE coalesce(nullif(link.title,''),voucher.published_payload->>'name','') END,
   'description',CASE WHEN link.hide_title THEN '' ELSE coalesce(nullif(link.content_note,''),left(voucher.published_payload->>'terms',300),'') END,
   'custom_domain',link.custom_domain,
   'hide_domain',link.hide_domain,
   'hide_title',link.hide_title
  );
 END IF;

 result:=api.dispatch_before_voucher_social_meta(command);

 IF command->>'op'='voucher_link_save' AND NOT result ? 'error' THEN
  UPDATE private.voucher_links SET 
   title=coalesce(command->'payload'->>'title',title),
   content_note=coalesce(command->'payload'->>'content_note',content_note),
   custom_domain=coalesce(command->'payload'->>'custom_domain',custom_domain),
   hide_domain=coalesce((command->'payload'->>'hide_domain')::bool,hide_domain),
   hide_title=coalesce((command->'payload'->>'hide_title')::bool,hide_title)
  WHERE slug=result->>'slug' AND voucher_id=(command->>'id')::uuid RETURNING * INTO link;
  IF link.slug IS NOT NULL THEN
   result:=to_jsonb(link);
  END IF;
 END IF;

 RETURN result;
END $$;

REVOKE ALL ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_social_meta(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_voucher_social_meta(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
