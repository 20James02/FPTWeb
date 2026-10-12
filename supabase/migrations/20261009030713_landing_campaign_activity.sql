BEGIN;
CREATE INDEX landing_events_recent ON private.events ((payload->>'landing_slug'),created_at DESC) WHERE name='view_landing';

CREATE FUNCTION private.landing_quote_valid(q jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r private.resources; campaign jsonb;
BEGIN
 IF q->'landing' IS NULL THEN RETURN true; END IF;
 SELECT * INTO r FROM private.resources WHERE id=(q#>>'{landing,id}')::uuid AND kind='page' FOR SHARE;
 IF r.id IS NULL OR r.status<>'published' OR r.published_version<>(q#>>'{landing,version}')::int THEN RETURN false; END IF;
 campaign:=r.published_payload#>'{landing,campaign}';
 IF q#>>'{landing,state}'='active' AND (
   NOT coalesce((campaign->>'enabled')::boolean,false)
   OR (campaign->>'start')::timestamptz>now()
   OR (campaign->>'end')::timestamptz<=now()
   OR (campaign->>'stock_remaining')::int=0
 ) THEN RETURN false; END IF;
 RETURN true;
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_landing_campaign;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; op text:=c->>'op'; data jsonb:=c->'payload'; r private.resources; q private.quotes; n bigint; slug text;
BEGIN
 IF op='landing_activity' THEN
  SELECT * INTO r FROM private.resources WHERE kind='page' AND status='published' AND published_payload->>'slug'=c->>'slug';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT coalesce((r.published_payload#>>'{landing,campaign,show_activity}')::boolean,false) THEN RETURN '{"sessions":0,"window_seconds":300}'; END IF;
  SELECT count(DISTINCT e.session_id) INTO n FROM private.events e JOIN private.sessions s ON s.id=e.session_id AND s.analytics
   WHERE e.name='view_landing' AND e.payload->>'landing_slug'=c->>'slug' AND e.created_at>=now()-interval '5 minutes';
  RETURN jsonb_build_object('sessions',CASE WHEN n>=3 THEN n ELSE 0 END,'window_seconds',300);
 END IF;
 IF (op IN ('resource_save','resource_update','resource_publish') AND c->>'kind'='page') OR op IN ('page_schedule','scheduled_publish') THEN
  IF op IN ('resource_publish','page_schedule','scheduled_publish') THEN
   SELECT payload->>'slug' INTO slug FROM private.resources WHERE id=(c->>'id')::uuid AND kind='page';
   -- Match editing's slug-before-row lock order. NOWAIT also avoids a row-lock upgrade cycle.
   IF op<>'page_schedule' THEN PERFORM pg_advisory_xact_lock(hashtextextended('page-slug:'||coalesce(slug,''),0)); END IF;
   BEGIN
    SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='page' FOR UPDATE NOWAIT;
   EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409);
   END;
   IF r.id IS NOT NULL AND r.payload->>'slug' IS DISTINCT FROM slug THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
   IF op='scheduled_publish' AND r.status='published' AND r.version=(c->>'expected_version')::int+1 AND r.published_version=r.version AND r.published_payload=r.payload THEN RETURN '{"already_published":true}'; END IF;
   data:=r.payload;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(data#>'{landing,plan_presentations}','[]')) p WHERE jsonb_array_length(coalesce(p->'campaign_prices','[]'))>0)
   AND NOT private.permitted((c->>'actor')::uuid,CASE WHEN op IN ('resource_publish','page_schedule','scheduled_publish') THEN 'pricing.publish' ELSE 'pricing.write' END,'00000000-0000-0000-0000-000000000000')
   THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 END IF;
 IF op='quote_save' AND NOT private.landing_quote_valid(data) THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
 IF op='quote_confirm' THEN
  SELECT * INTO q FROM private.quotes WHERE id=(c->>'quote_id')::uuid;
  IF NOT private.landing_quote_valid(q.payload) THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
 END IF;
 RETURN api.dispatch_before_landing_campaign(c);
END $$;
ALTER FUNCTION api.submit_lead(jsonb) RENAME TO submit_lead_before_landing_campaign;
CREATE FUNCTION api.submit_lead(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; q private.quotes;
BEGIN
 SELECT * INTO q FROM private.quotes WHERE id=(c->>'quote_id')::uuid;
 IF NOT private.landing_quote_valid(q.payload) THEN c:=c||jsonb_build_object('quote_id',NULL); END IF;
 RETURN api.submit_lead_before_landing_campaign(c);
END $$;
REVOKE EXECUTE ON FUNCTION private.landing_quote_valid(jsonb),api.dispatch(jsonb),api.dispatch_before_landing_campaign(jsonb),api.submit_lead(jsonb),api.submit_lead_before_landing_campaign(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.landing_quote_valid(jsonb),api.dispatch(jsonb),api.dispatch_before_landing_campaign(jsonb),api.submit_lead(jsonb),api.submit_lead_before_landing_campaign(jsonb) TO service_role;
COMMIT;
