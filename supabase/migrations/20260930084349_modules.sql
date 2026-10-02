BEGIN;
ALTER TABLE private.resources ADD COLUMN published_payload jsonb;
ALTER TABLE private.resources ADD COLUMN published_version int;
CREATE TABLE private.resource_revisions(resource_id uuid NOT NULL REFERENCES private.resources(id) ON DELETE CASCADE,version int NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(resource_id,version));
ALTER TABLE private.resource_revisions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.resource_revisions TO service_role;
CREATE OR REPLACE FUNCTION private.resource_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO private.resource_revisions(resource_id,version,payload) VALUES(OLD.id,OLD.version,OLD.payload) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER resource_history BEFORE UPDATE ON private.resources FOR EACH ROW EXECUTE FUNCTION private.resource_history();
CREATE TABLE private.touches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES private.sessions(id) ON DELETE CASCADE,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.touches ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.touches TO service_role;
CREATE UNIQUE INDEX preference_contact ON private.resources((payload->>'contact_id')) WHERE kind='preference';
CREATE UNIQUE INDEX referral_installation ON private.resources((payload->>'installation_reference')) WHERE kind='referral';
CREATE OR REPLACE FUNCTION private.modules_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; kind text:=c->>'kind'; r private.resources; l private.leads; l2 private.leads; sid uuid; item jsonb; n int:=0; pref jsonb; data jsonb:=c->'payload';
BEGIN
 IF op='consent' THEN
  INSERT INTO private.sessions(id,analytics,marketing,consent_version) VALUES((c->>'id')::uuid,(c->>'analytics')::bool,(c->>'marketing')::bool,c->>'consent_version') ON CONFLICT(id) DO UPDATE SET analytics=excluded.analytics,marketing=excluded.marketing,consent_version=excluded.consent_version,updated_at=now();
  IF NOT (c->>'analytics')::bool THEN UPDATE private.leads SET payload=payload-'session_id'-'attribution' WHERE payload->>'session_id'=c->>'id';DELETE FROM private.events WHERE session_id=(c->>'id')::uuid;DELETE FROM private.touches WHERE session_id=(c->>'id')::uuid; END IF;
  RETURN '{"saved":true}';
 ELSIF op='session_read' THEN
  RETURN coalesce((SELECT to_jsonb(sessions) FROM private.sessions WHERE id=(c->>'id')::uuid),'{}');
 ELSIF op='events' THEN
  sid:=(c->>'session_id')::uuid;
  PERFORM 1 FROM private.sessions WHERE id=sid AND analytics FOR SHARE;
  IF NOT FOUND THEN RETURN '{"accepted":0}'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(c->'events') LOOP
   INSERT INTO private.events(id,session_id,name,payload) VALUES((item->>'id')::uuid,sid,item->>'name',item-'id'-'name') ON CONFLICT DO NOTHING;
   IF FOUND THEN n:=n+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('accepted',n);
 ELSIF op='touch' THEN
  sid:=(c->>'session_id')::uuid;
  PERFORM 1 FROM private.sessions WHERE id=sid AND analytics FOR SHARE;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  INSERT INTO private.touches(session_id,payload) VALUES(sid,data) RETURNING id INTO sid;
  RETURN jsonb_build_object('id',sid);
 ELSIF op='public_resource' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND resources.kind=kind AND published_payload IS NOT NULL AND status='published';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN jsonb_build_object('id',r.id,'version',r.published_version,'payload',r.published_payload);
 ELSIF op='public_page' THEN
  SELECT * INTO r FROM private.resources WHERE resources.kind='page' AND status='published' AND published_payload->>'slug'=c->>'slug';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN jsonb_build_object('id',r.id,'version',r.published_version,'payload',r.published_payload);
 ELSIF op='sitemap' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('payload',published_payload)) FROM private.resources WHERE resources.kind='page' AND status='published' AND published_payload IS NOT NULL),'[]'));
 ELSIF op='resource_list' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM private.resources rr WHERE rr.kind=kind AND private.permitted(actor,private.resource_permission(kind),coalesce(branch_id,'00000000-0000-0000-0000-000000000000')) ORDER BY updated_at DESC,id DESC LIMIT least(100,coalesce((c->>'limit')::int,30))) x),'[]'));
 ELSIF op IN ('resource_get','resource_update','resource_retire','referral_approve') THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND (resources.kind=kind OR op='referral_approve') FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,private.resource_permission(r.kind),coalesce(r.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='resource_get' THEN RETURN to_jsonb(r); END IF;
  IF r.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  IF op='resource_update' THEN
   IF data->>'branch_id' IS DISTINCT FROM r.payload->>'branch_id' THEN RETURN jsonb_build_object('error','IMMUTABLE_SCOPE','status',409); END IF;
   UPDATE private.resources SET payload=data,version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  ELSIF op='resource_retire' THEN UPDATE private.resources SET status='retired',version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  ELSE
   IF r.kind<>'referral' OR NOT private.permitted(actor,'care.approve',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
   IF NOT EXISTS(SELECT 1 FROM private.leads WHERE id=(r.payload->>'referred_lead_id')::uuid AND status='installed' AND EXISTS(SELECT 1 FROM private.activities a WHERE a.lead_id=leads.id AND a.kind='transition' AND a.payload->'installation'->>'reference'=r.payload->>'installation_reference')) THEN RETURN jsonb_build_object('error','INSTALLATION_REQUIRED','status',409); END IF;
   UPDATE private.resources SET status='approved',version=version+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  END IF;
  IF op IN ('resource_retire','resource_update') AND r.kind IN ('plan','region','promotion') THEN INSERT INTO private.catalog_revision(id,version) VALUES(true,1) ON CONFLICT(id) DO UPDATE SET version=private.catalog_revision.version+1; END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,r.branch_id,r.id,op);
  RETURN to_jsonb(r);
 ELSIF op='referral' THEN
  SELECT * INTO l FROM private.leads WHERE id=(data->>'referrer_lead_id')::uuid;
  SELECT * INTO l2 FROM private.leads WHERE id=(data->>'referred_lead_id')::uuid;
  IF l.id IS NULL OR l2.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.can_read_lead(actor,l) OR NOT private.can_read_lead(actor,l2) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF l.contact_id=l2.contact_id THEN RETURN jsonb_build_object('error','SELF_REFERRAL','status',409); END IF;
  INSERT INTO private.resources(kind,branch_id,payload) VALUES('referral',l2.branch_id,data) RETURNING * INTO r;
  RETURN to_jsonb(r);
 ELSIF op IN ('preferences','followup','feedback','internal_followup') THEN
  SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF op NOT IN ('feedback','internal_followup') AND (NOT private.can_read_lead(actor,l) OR NOT private.permitted(actor,'care.write',l.branch_id)) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT payload INTO pref FROM private.resources WHERE resources.kind='preference' AND payload->>'contact_id'=l.contact_id::text;
  IF op='preferences' THEN
   data:=data||jsonb_build_object('contact_id',l.contact_id);
   INSERT INTO private.resources(kind,branch_id,payload) VALUES('preference',l.branch_id,data) ON CONFLICT((payload->>'contact_id')) WHERE resources.kind='preference' DO UPDATE SET payload=excluded.payload,version=resources.version+1 RETURNING * INTO r;
   IF NOT (data->>'service_contact_allowed')::bool OR NOT (data->>'marketing_allowed')::bool THEN
    UPDATE private.resources SET status='cancelled',version=version+1 WHERE resources.kind='followup' AND payload->>'contact_id'=l.contact_id::text AND status='draft' AND (NOT (data->>'service_contact_allowed')::bool OR payload->>'purpose' IN ('marketing','upsell'));
   END IF;
  ELSIF op IN ('followup','internal_followup') THEN
   IF (pref->>'service_contact_allowed')::bool=false OR (data->>'purpose' IN ('marketing','upsell') AND (coalesce((pref->>'marketing_allowed')::bool,(l.payload->>'marketing_opt_in')::bool,false)=false OR (pref->>'complaint_open')::bool=true)) THEN RETURN jsonb_build_object('error','CONTACT_NOT_PERMITTED','status',409); END IF;
   INSERT INTO private.resources(kind,branch_id,payload) VALUES('followup',l.branch_id,data||jsonb_build_object('contact_id',l.contact_id)) RETURNING * INTO r;
   PERFORM private.enqueue('notifications','notify',r.id,'notify:'||r.id);
   UPDATE private.jobs SET next_attempt_at=greatest(now(),(data->>'scheduled_at')::timestamptz) WHERE entity_id=r.id AND private.jobs.kind='notify';
  ELSE
   IF EXISTS(SELECT 1 FROM private.resources WHERE resources.kind='feedback' AND payload->>'lead_id'=l.id::text) THEN RETURN jsonb_build_object('error','FEEDBACK_ALREADY_RECORDED','status',409); END IF;
   INSERT INTO private.resources(kind,branch_id,payload,status) VALUES('feedback',l.branch_id,data||jsonb_build_object('lead_id',l.id),'recorded') RETURNING * INTO r;
  END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,op);
  RETURN to_jsonb(r)-'payload'||jsonb_build_object('payload',r.payload-'contact_id');
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error','DUPLICATE_RESOURCE','status',409);
END $$;
CREATE OR REPLACE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='identity' THEN RETURN jsonb_build_object('memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('branch_id',branch_id,'permissions',permissions)) FROM private.memberships WHERE user_id=(command->>'subject')::uuid AND active),'[]'::jsonb)); END IF;
 IF command->>'op' IN ('internal_lead','internal_assign','lead_list','lead_detail','lead_reveal','changes','assign','transition','observation','activity') THEN RETURN private.crm_dispatch(command); END IF;
 IF command->>'op' IN ('consent','session_read','events','touch','public_resource','public_page','sitemap','resource_list','resource_get','resource_update','resource_retire','preferences','followup','feedback','internal_followup','referral','referral_approve') THEN RETURN private.modules_dispatch(command); END IF;
 RETURN private.resource_dispatch(command);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
COMMIT;
