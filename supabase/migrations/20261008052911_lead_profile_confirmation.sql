BEGIN;
CREATE TABLE private.lead_profile_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 lead_id uuid NOT NULL REFERENCES private.leads(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 before_pii_ciphertext text NOT NULL, before_payload jsonb NOT NULL,
 changed_fields text[] NOT NULL
);
CREATE INDEX lead_profile_history_lead_idx ON private.lead_profile_history(lead_id,created_at DESC);
ALTER TABLE private.lead_profile_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.lead_profile_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.lead_profile_history TO service_role;
GRANT USAGE,SELECT ON SEQUENCE private.lead_profile_history_id_seq TO service_role;
ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_profile;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb:=command; actor uuid; l private.leads; candidate uuid; oldscope jsonb; newscope jsonb;
BEGIN
 IF c->>'op' NOT IN ('lead_profile_read','lead_profile_update') THEN RETURN api.dispatch_before_profile(c); END IF;
 actor:=(c->>'actor')::uuid;
 PERFORM private.lock_contact_command(c);
 SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF NOT private.can_read_lead(actor,l,'lead.write') OR NOT private.can_read_lead(actor,l,'lead.pii') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF c->>'op'='lead_profile_read' THEN
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'lead.profile_view');
  RETURN jsonb_build_object('lead',private.lead_safe(l),'pii_ciphertext',l.pii_ciphertext);
 END IF;
 IF l.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 PERFORM 1 FROM private.catalog_revision WHERE id FOR SHARE;
 IF c->>'plan_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.resources WHERE id=(c->>'plan_id')::uuid AND kind='plan' AND status='published' AND published_payload IS NOT NULL) THEN RETURN jsonb_build_object('error','PLAN_UNAVAILABLE','status',422); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'accessory_snapshot') x LEFT JOIN private.resources r ON r.id=(x->>'id')::uuid AND r.kind='product' LEFT JOIN private.resources pp ON pp.id=(c->>'plan_id')::uuid AND pp.kind='plan' WHERE pp.id IS NULL OR pp.status<>'published' OR r.published_payload->>'service' IS DISTINCT FROM pp.published_payload->>'service' OR (coalesce(jsonb_array_length(r.published_payload->'plan_ids'),0)>0 AND NOT (r.published_payload->'plan_ids' ? (pp.id::text))) OR r.id IS NULL OR r.status<>'published' OR r.published_version<>(x->>'version')::int OR r.published_payload->'price_vnd' IS DISTINCT FROM x->'price_vnd' OR r.published_payload->'billing_mode' IS DISTINCT FROM x->'billing_mode') THEN RETURN jsonb_build_object('error','QUOTE_STALE','status',409); END IF;
 SELECT id INTO candidate FROM private.resources WHERE kind='region' AND status='published' AND published_payload IS NOT NULL AND id IN ((c->>'region_candidate')::uuid,(c->>'province_candidate')::uuid) ORDER BY (id=(c->>'region_candidate')::uuid) DESC LIMIT 1;
 oldscope:=jsonb_build_object('plan_id',l.payload->'plan_id','region_id',l.payload->'region_id','accessory_ids',coalesce(l.payload->'accessory_ids','[]'::jsonb));
 newscope:=jsonb_build_object('plan_id',c->'plan_id','region_id',candidate,'accessory_ids',c->'accessory_ids');
 INSERT INTO private.lead_profile_history(lead_id,actor_id,before_pii_ciphertext,before_payload,changed_fields) VALUES(l.id,actor,l.pii_ciphertext,l.payload,ARRAY['name','installation_address','address_confirmation','plan_id','accessory_ids']);
 UPDATE private.leads SET pii_ciphertext=c->>'pii_ciphertext', payload=payload||newscope||jsonb_build_object('accessory_snapshot',c->'accessory_snapshot','address_confirmation',c->'address_confirmation'), quote_status=CASE WHEN oldscope IS DISTINCT FROM newscope OR payload->'address_confirmation'->'ward_code' IS DISTINCT FROM c->'address_confirmation'->'ward_code' THEN 'needs_confirmation' ELSE quote_status END,version=version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
 INSERT INTO private.audit(actor_id,branch_id,entity_id,action,payload) VALUES(actor,l.branch_id,l.id,'lead.profile_updated',jsonb_build_object('fields',ARRAY['name','installation_address','address_confirmation','plan_id','accessory_ids'],'version',l.version));
 RETURN private.lead_safe(l);
END $$;
REVOKE EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_profile(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.dispatch(jsonb),api.dispatch_before_profile(jsonb) TO service_role;
COMMIT;
