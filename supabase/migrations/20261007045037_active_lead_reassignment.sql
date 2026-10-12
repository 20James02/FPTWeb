-- Reassign active leads without rewinding business progress or resetting SLA.
BEGIN;
CREATE OR REPLACE FUNCTION private.manual_assignment(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=(c->>'actor')::uuid; l private.leads; m private.memberships;
BEGIN
 PERFORM private.lock_contact_command(c);
 SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF NOT private.can_read_lead(actor,l,'lead.write') OR NOT private.permitted(actor,'lead.assign',coalesce(l.branch_id,'00000000-0000-0000-0000-000000000000')) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF l.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 IF l.status NOT IN ('new','assigned','contacting','contacted','qualified','survey','quoted','closed','unreachable','no_infrastructure') THEN RETURN jsonb_build_object('error','ASSIGNMENT_NOT_ALLOWED','status',409); END IF;
 PERFORM pg_advisory_xact_lock(6371932);
 SELECT * INTO m FROM private.memberships mm WHERE user_id=(c->>'assignee_id')::uuid AND active AND ('lead.write'=ANY(permissions) OR '*'=ANY(permissions))
  AND (branch_id=l.branch_id OR branch_id='00000000-0000-0000-0000-000000000000') AND private.on_shift(mm.shift,now())
  AND (active_leads<capacity OR (l.assignee_id=mm.user_id AND l.assignment_branch_id=mm.branch_id)) ORDER BY (branch_id=l.branch_id) DESC,branch_id LIMIT 1 FOR UPDATE;
 IF m.user_id IS NULL THEN RETURN jsonb_build_object('error','ASSIGNEE_UNAVAILABLE','status',409); END IF;
 IF l.assignee_id IS NOT NULL THEN UPDATE private.memberships SET active_leads=greatest(0,active_leads-1) WHERE user_id=l.assignee_id AND branch_id=l.assignment_branch_id; END IF;
 UPDATE private.memberships SET active_leads=active_leads+1,last_assigned_at=now() WHERE user_id=m.user_id AND branch_id=m.branch_id;
 UPDATE private.leads SET assignee_id=m.user_id,assignment_branch_id=m.branch_id,status=CASE WHEN l.status='new' THEN 'assigned' ELSE l.status END,version=version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
 INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'lead.assign');
 RETURN private.lead_safe(l);
END $$;
REVOKE EXECUTE ON FUNCTION private.manual_assignment(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.manual_assignment(jsonb) TO service_role;
COMMIT;
