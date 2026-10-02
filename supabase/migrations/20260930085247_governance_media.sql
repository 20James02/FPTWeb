BEGIN;
CREATE OR REPLACE FUNCTION private.governance_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; l private.leads; r private.resources; contact private.contacts; x record; result jsonb; data jsonb:=c->'payload'; jid uuid;
BEGIN
 IF op='report' THEN
  IF NOT private.permitted(actor,'report.read') THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT jsonb_build_object('leads',count(*),'contacted',count(*) FILTER(WHERE status IN ('contacted','qualified','survey','quoted','closed','installed') OR EXISTS(SELECT 1 FROM private.activities a WHERE a.lead_id=leads.id AND a.kind='transition' AND a.payload->>'to'='contacted')),'qualified',count(*) FILTER(WHERE status IN ('qualified','survey','quoted','closed','installed')),'installed',count(*) FILTER(WHERE status='installed'),'overdue',count(*) FILTER(WHERE sla_due_at<now() AND status IN ('new','assigned','contacting'))) INTO result FROM private.leads WHERE private.permitted(actor,'report.read',branch_id);
  RETURN jsonb_build_object('funnel',result,'definition_version','funnel-v1','as_of',now());
 ELSIF op='privacy_request' THEN
  SELECT * INTO l FROM private.leads WHERE id=(data->>'lead_id')::uuid;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'governance.write',coalesce(l.branch_id,'00000000-0000-0000-0000-000000000000')) OR NOT private.can_read_lead(actor,l) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.resources(kind,branch_id,payload) VALUES('privacy',l.branch_id,data) RETURNING * INTO r;
  RETURN to_jsonb(r);
 ELSIF op='privacy_execute' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='privacy' FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'governance.delete',coalesce(r.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF r.status='complete' THEN RETURN jsonb_build_object('id',r.id,'state','complete'); END IF;
  SELECT * INTO l FROM private.leads WHERE id=(r.payload->>'lead_id')::uuid FOR UPDATE;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF r.payload->>'action'='stop_marketing' THEN
   RETURN private.modules_dispatch(jsonb_build_object('op','preferences','id',l.id,'actor',actor,'payload',jsonb_build_object('marketing_allowed',false,'service_contact_allowed',true,'complaint_open',false)));
  END IF;
  SELECT * INTO contact FROM private.contacts WHERE id=l.contact_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM private.leads ll WHERE ll.contact_id=contact.id AND NOT private.permitted(actor,'governance.delete',coalesce(ll.branch_id,'00000000-0000-0000-0000-000000000000'))) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  FOR x IN SELECT * FROM private.jobs WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id) LOOP PERFORM pgmq.archive(x.queue,x.msg_id); END LOOP;
  DELETE FROM private.permits WHERE id IN (SELECT id FROM private.jobs WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id));
  DELETE FROM private.jobs WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id);
  UPDATE private.idempotency SET result=idempotency.result||'{"quote_status":"deleted","next_action":"request_removed"}' WHERE expires_at='infinity'::timestamptz AND idempotency.result->>'receipt' IN (SELECT receipt::text FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.idempotency WHERE expires_at<>'infinity'::timestamptz AND idempotency.result->>'receipt' IN (SELECT receipt::text FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.audit WHERE entity_id IN (SELECT id FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.deliveries WHERE platform='conversion' AND event_id IN (SELECT event_id FROM private.leads WHERE contact_id=contact.id UNION ALL SELECT md5(event_id::text||':installed')::uuid FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.deliveries WHERE event_id IN (SELECT id FROM private.resources WHERE kind='followup' AND payload->>'contact_id'=contact.id::text);
  DELETE FROM private.resources WHERE id<>r.id AND (payload->>'contact_id'=contact.id::text OR payload->>'lead_id' IN (SELECT id::text FROM private.leads WHERE contact_id=contact.id) OR payload->>'referred_lead_id' IN (SELECT id::text FROM private.leads WHERE contact_id=contact.id) OR payload->>'referrer_lead_id' IN (SELECT id::text FROM private.leads WHERE contact_id=contact.id));
  INSERT INTO private.tombstones(contact_hmac) VALUES(contact.phone_hmac) ON CONFLICT DO NOTHING;
  DELETE FROM private.sessions WHERE id IN (SELECT (payload->>'session_id')::uuid FROM private.leads WHERE contact_id=contact.id AND payload->>'session_id' IS NOT NULL);
  UPDATE private.memberships SET active_leads=greatest(0,active_leads-(SELECT count(*) FROM private.leads WHERE contact_id=contact.id AND assignee_id=memberships.user_id AND status NOT IN ('installed','invalid','rejected','duplicate'))) WHERE user_id IN (SELECT assignee_id FROM private.leads WHERE contact_id=contact.id);
  DELETE FROM private.leads WHERE contact_id=contact.id;
  DELETE FROM private.contacts WHERE id=contact.id;
  -- Export CSVs contain stable lead IDs: invalidate all existing exports conservatively.
  FOR x IN SELECT * FROM private.resources WHERE kind='export' AND status<>'erased' LOOP
   UPDATE private.resources SET status='erased' WHERE id=x.id;
   jid:=private.enqueue('maintenance','erase_export',x.id,'erase-export:'||x.id);
   UPDATE private.jobs SET next_attempt_at=greatest(now()+interval '120 seconds',coalesce((SELECT max(lease_until)+interval '60 seconds' FROM private.jobs WHERE entity_id=x.id AND kind='export'),now())) WHERE id=jid;
  END LOOP;
  UPDATE private.resources SET status='complete',payload='{"action":"delete","state":"database_erased"}',version=version+1 WHERE id=r.id;
  DELETE FROM private.resource_revisions WHERE resource_id=r.id;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,r.id,'privacy.database_erased');
  RETURN jsonb_build_object('id',r.id,'state','database_erased','external_cleanup','queued_if_required');
 ELSIF op='media_finish' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='media' FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF NOT private.permitted(actor,'content.write',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF r.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
  UPDATE private.resources SET payload=data,status='ready',version=version+1 WHERE id=r.id RETURNING * INTO r;
  RETURN to_jsonb(r);
 ELSIF op='export_create' THEN
  IF NOT private.permitted(actor,'governance.export',(c->>'branch_id')::uuid) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.resources(kind,branch_id,payload) VALUES('export',(c->>'branch_id')::uuid,jsonb_build_object('actor',actor,'parts','[]'::jsonb,'part',0)) RETURNING * INTO r;
  PERFORM private.enqueue('maintenance','export',r.id,'export:'||r.id||':0');
  RETURN jsonb_build_object('id',r.id,'state','queued');
 ELSIF op IN ('internal_export','internal_erase_export') THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='export';
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  IF op='internal_erase_export' THEN RETURN to_jsonb(r); END IF;
  actor:=(r.payload->>'actor')::uuid;
  IF r.status='erased' OR NOT private.permitted(actor,'governance.export',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'created_at',created_at,'quote_status',quote_status)),'[]') INTO result FROM (SELECT * FROM private.leads ll WHERE private.can_read_lead(actor,ll) AND (r.branch_id IS NULL OR branch_id=r.branch_id) AND (r.payload->>'before_id' IS NULL OR (created_at,id)<((r.payload->>'before_at')::timestamptz,(r.payload->>'before_id')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 101) z;
  RETURN to_jsonb(r)||jsonb_build_object('rows',result);
 ELSIF op='audit_download' THEN
  SELECT * INTO r FROM private.resources WHERE id=(c->>'id')::uuid AND kind='export';
  IF NOT private.permitted(actor,'governance.export',r.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.audit(actor_id,entity_id,action) VALUES(actor,r.id,'export.download'); RETURN '{"logged":true}';
 ELSIF op='retention' THEN
  RETURN private.operations_dispatch(jsonb_build_object('op','schedule_tick'));
  -- Legacy statements unreachable; retention is bounded by the operations dispatcher.

  DELETE FROM private.idempotency WHERE expires_at<now();
  DELETE FROM private.rate_buckets WHERE expires_at<now();
  DELETE FROM private.quotes WHERE expires_at<now()-interval '1 day';
  UPDATE private.leads SET payload=payload-'ip_ciphertext' WHERE payload ? 'ip_ciphertext' AND created_at<now()-interval '7 days';
  DELETE FROM private.events WHERE created_at<now()-interval '90 days';
  DELETE FROM private.touches WHERE created_at<now()-interval '30 days';
  DELETE FROM private.sessions WHERE updated_at<now()-interval '90 days';
  RETURN '{"retained":true}';
 END IF;
 RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
END $$;
CREATE OR REPLACE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='identity' THEN RETURN jsonb_build_object('memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('branch_id',branch_id,'permissions',permissions)) FROM private.memberships WHERE user_id=(command->>'subject')::uuid AND active),'[]'::jsonb)); END IF;
 IF command->>'op' IN ('internal_lead','internal_assign','lead_list','lead_detail','lead_reveal','changes','assign','transition','observation','activity') THEN RETURN private.crm_dispatch(command); END IF;
 IF command->>'op' IN ('consent','session_read','events','touch','public_resource','public_page','sitemap','resource_list','resource_get','resource_update','resource_retire','preferences','followup','feedback','internal_followup','referral','referral_approve') THEN RETURN private.modules_dispatch(command); END IF;
 IF command->>'op' IN ('report','privacy_request','privacy_execute','media_finish','export_create','internal_export','internal_erase_export','audit_download','retention') THEN RETURN private.governance_dispatch(command); END IF;
 RETURN private.resource_dispatch(command);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
COMMIT;
