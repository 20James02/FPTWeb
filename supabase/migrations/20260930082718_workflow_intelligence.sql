BEGIN;
CREATE OR REPLACE FUNCTION api.claim_jobs(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q text:=command->>'queue'; item record; job private.jobs; output jsonb:='[]'; n int;
BEGIN
 IF q NOT IN ('lead_local','lead_external','conversions','notifications','maintenance') THEN RETURN jsonb_build_object('error','INVALID_QUEUE','status',422); END IF;
 -- Global job permits are transaction-serialized, unlike local semaphores.
 PERFORM pg_advisory_xact_lock(6371931);
 DELETE FROM private.permits WHERE expires_at<=now();
 SELECT greatest(0,20-count(*))::int INTO n FROM private.permits;
 n:=least(n,least(10,greatest(1,(command->>'limit')::int)));
 IF n=0 THEN RETURN jsonb_build_object('jobs','[]'::jsonb); END IF;
 FOR item IN SELECT * FROM pgmq.read(q,60,n) LOOP
  SELECT * INTO job FROM private.jobs WHERE id=(item.message->>'job_id')::uuid FOR UPDATE;
  IF job.id IS NULL OR job.state IN ('done','failed') THEN PERFORM pgmq.archive(q,item.msg_id);CONTINUE; END IF;
  IF job.next_attempt_at>now() THEN PERFORM pgmq.set_vt(q,item.msg_id,job.next_attempt_at);CONTINUE; END IF;
  IF job.attempt>=6 THEN UPDATE private.jobs SET state='failed' WHERE id=job.id;PERFORM pgmq.archive(q,item.msg_id);CONTINUE; END IF;
  UPDATE private.jobs SET state='running',attempt=attempt+1,fence=fence+1,lease_until=now()+interval '60 seconds' WHERE id=job.id RETURNING * INTO job;
  INSERT INTO private.permits(id,scope,expires_at) VALUES(job.id,q,job.lease_until) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at;
  output:=output||jsonb_build_array(to_jsonb(job));
 END LOOP;
 RETURN jsonb_build_object('jobs',output);
END $$;
CREATE OR REPLACE FUNCTION api.complete_job(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE job private.jobs; data jsonb:=command->'result'; l private.leads; observation jsonb;
BEGIN
 SELECT * INTO job FROM private.jobs WHERE id=(command->>'id')::uuid FOR UPDATE;
 IF job.id IS NULL OR job.state<>'running' OR job.fence<>(command->>'fence')::bigint OR job.lease_until<=now() THEN RETURN '{"completed":false}'::jsonb; END IF;
 IF job.kind='enrich_local' THEN
  SELECT * INTO l FROM private.leads WHERE id=job.entity_id FOR UPDATE;
  IF l.evidence_version=(data->>'evidence_version')::int THEN
   UPDATE private.leads SET scores=data->'scores',version=version+1,updated_at=now() WHERE id=l.id;
   INSERT INTO private.observations(lead_id,field,value,source,status) VALUES(l.id,'geoip',data->'geoip','geoip',coalesce(data->'geoip'->>'status','unknown'));
   FOR observation IN SELECT value FROM jsonb_array_elements(coalesce(data->'needs','[]')) LOOP
    INSERT INTO private.observations(lead_id,field,value,source,status,evidence_ref) VALUES(l.id,observation->>'field',observation->'value','notes_rule','inferred',(observation->'evidence_span')::text);
   END LOOP;
   INSERT INTO private.audit(branch_id,entity_id,action) VALUES(l.branch_id,l.id,'lead.scored');
   PERFORM private.enqueue('conversions','conversion',l.id,'conversion:'||l.event_id||':lead');
   IF l.status='new' THEN PERFORM private.enqueue('lead_local','auto_assign',l.id,'assign:'||l.id); END IF;
  ELSE
   PERFORM private.enqueue('lead_local','enrich_local',l.id,'enrich:'||l.id||':'||l.evidence_version,l.evidence_version);
  END IF;
 END IF;
 IF job.kind='export' THEN
  UPDATE private.resources SET payload=payload||jsonb_build_object('parts',(payload->'parts')||jsonb_build_array(data->>'part_key'),'part',(data->>'part')::int+1,'before_at',data->>'before_at','before_id',data->>'before_id'),status=CASE WHEN (data->>'has_more')::bool THEN 'draft' ELSE 'complete' END,version=version+1 WHERE id=job.entity_id AND status<>'erased';
  IF NOT FOUND THEN RETURN '{"completed":false}'::jsonb; END IF;
  IF (data->>'has_more')::bool THEN PERFORM private.enqueue('maintenance','export',job.entity_id,'export:'||job.entity_id||':'||((data->>'part')::int+1)); END IF;
 END IF;
 IF job.kind='erase_export' AND (data->>'has_more')::bool THEN PERFORM private.enqueue('maintenance','erase_export',job.entity_id,'erase-more:'||job.id); END IF;
 UPDATE private.jobs SET state='done',result=data,lease_until=NULL WHERE id=job.id;
 DELETE FROM private.permits WHERE id=job.id;
 PERFORM pgmq.archive(job.queue,job.msg_id);
 RETURN '{"completed":true}'::jsonb;
END $$;
CREATE OR REPLACE FUNCTION api.fail_job(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE job private.jobs; delay int:=least(86400,greatest(0,ceil((command->>'delay')::numeric)::int));
BEGIN
 SELECT * INTO job FROM private.jobs WHERE id=(command->>'id')::uuid FOR UPDATE;
 IF job.id IS NULL OR job.state<>'running' OR job.fence<>(command->>'fence')::bigint OR job.lease_until<=now() THEN RETURN '{"updated":false}'; END IF;
 DELETE FROM private.permits WHERE id=job.id;
 IF (command->>'permanent')::bool OR job.attempt>=6 THEN
  UPDATE private.jobs SET state='failed',result=jsonb_build_object('code',command->>'code'),lease_until=NULL WHERE id=job.id;
  PERFORM pgmq.archive(job.queue,job.msg_id);
 ELSE
  UPDATE private.jobs SET state='pending',lease_until=NULL,next_attempt_at=now()+make_interval(secs=>delay) WHERE id=job.id;
  IF command->>'code'='SCHEDULE_DEFERRED' THEN UPDATE private.jobs SET attempt=greatest(0,attempt-1) WHERE id=job.id; END IF;
  PERFORM pgmq.set_vt(job.queue,job.msg_id,delay);
 END IF;
 RETURN '{"updated":true}';
END $$;
CREATE OR REPLACE FUNCTION private.can_read_lead(actor uuid,l private.leads,permission text DEFAULT 'lead.read') RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT private.permitted(actor,permission,coalesce(l.branch_id,'00000000-0000-0000-0000-000000000000')) AND (
 EXISTS(SELECT 1 FROM private.memberships WHERE user_id=actor AND active AND ('*'=ANY(permissions) OR 'lead.all'=ANY(permissions)) AND (branch_id=l.branch_id OR branch_id='00000000-0000-0000-0000-000000000000')) OR l.assignee_id=actor)
$$;
CREATE OR REPLACE FUNCTION private.lead_safe(l private.leads) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(l)-'pii_ciphertext'-'contact_id'-'receipt'||jsonb_build_object('payload',l.payload-'ip_ciphertext') $$;
CREATE OR REPLACE FUNCTION private.crm_dispatch(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE op text:=c->>'op'; actor uuid:=(c->>'actor')::uuid; l private.leads; m private.memberships; out_data jsonb; item jsonb; new_status text; allowed text[]; change_id bigint; branches uuid[]; global_scope boolean;
BEGIN
 IF op='internal_lead' THEN
  SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid;
  IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
  RETURN to_jsonb(l)||jsonb_build_object('events',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'at',last_at)) FROM (SELECT e.name,max(e.created_at) last_at FROM private.events e JOIN private.sessions ss ON ss.id=e.session_id AND ss.analytics WHERE e.session_id=(l.payload->>'session_id')::uuid AND e.created_at>now()-interval '7 days' GROUP BY e.name) tracked),'[]'::jsonb),'observations',coalesce((SELECT jsonb_agg(to_jsonb(observations) ORDER BY observed_at,id) FROM private.observations WHERE lead_id=l.id),'[]'::jsonb));
 ELSIF op='lead_list' THEN
  SELECT coalesce(array_agg(branch_id),'{}') INTO branches FROM private.memberships WHERE user_id=actor AND active AND ('*'=ANY(permissions) OR ('lead.read'=ANY(permissions) AND 'lead.all'=ANY(permissions)));
  global_scope:='00000000-0000-0000-0000-000000000000'::uuid=ANY(branches);
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.lead_safe(x)) FROM (SELECT * FROM private.leads ll WHERE (global_scope OR ll.branch_id=ANY(branches) OR ll.assignee_id=actor) AND private.can_read_lead(actor,ll) AND ((c->>'status') IS NULL OR status=c->>'status') AND ((c->>'before_id') IS NULL OR (created_at,id)<((c->>'before_at')::timestamptz,(c->>'before_id')::uuid)) ORDER BY created_at DESC,id DESC LIMIT least(101,coalesce((c->>'limit')::int,31))) x),'[]'));
 ELSIF op='changes' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('cursor',id,'entity_id',entity_id,'type',action)) FROM (SELECT * FROM private.audit a WHERE id>coalesce((c->>'after')::bigint,0) AND (private.permitted(actor,'lead.all',branch_id) OR EXISTS(SELECT 1 FROM private.leads ll WHERE ll.id=a.entity_id AND private.can_read_lead(actor,ll))) ORDER BY id LIMIT 100) z),'[]'));
 END IF;
 SELECT * INTO l FROM private.leads WHERE id=(c->>'id')::uuid FOR UPDATE;
 IF l.id IS NULL THEN RETURN jsonb_build_object('error','NOT_FOUND','status',404); END IF;
 IF op NOT IN ('internal_assign') AND NOT private.can_read_lead(actor,l,CASE WHEN op IN ('lead_detail','lead_reveal') THEN 'lead.read' ELSE 'lead.write' END) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF op='lead_detail' THEN
  RETURN private.lead_safe(l)||jsonb_build_object('observations',coalesce((SELECT jsonb_agg(to_jsonb(observations) ORDER BY observed_at,id) FROM private.observations WHERE lead_id=l.id),'[]'),'activities',coalesce((SELECT jsonb_agg(to_jsonb(activities)||jsonb_build_object('payload',payload-'notes_ciphertext')) FROM private.activities WHERE lead_id=l.id),'[]'));
 ELSIF op='lead_reveal' THEN
  IF NOT private.permitted(actor,'lead.pii',l.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  INSERT INTO private.audit(actor_id,branch_id,entity_id,action) VALUES(actor,l.branch_id,l.id,'lead.pii_revealed');
  RETURN jsonb_build_object('pii_ciphertext',l.pii_ciphertext);
 END IF;
 IF op NOT IN ('internal_assign','observation','activity') AND l.version<>(c->>'expected_version')::int THEN RETURN jsonb_build_object('error','VERSION_CONFLICT','status',409); END IF;
 IF op IN ('assign','internal_assign') THEN
  IF op='assign' AND NOT private.permitted(actor,'lead.assign',l.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  IF op='internal_assign' AND l.status<>'new' THEN RETURN private.lead_safe(l); END IF;
  IF l.status NOT IN ('new','assigned') THEN RETURN jsonb_build_object('error','INVALID_TRANSITION','status',409); END IF;
  -- Serialize capacity changes without holding a connection across provider I/O.
  PERFORM pg_advisory_xact_lock(6371932);
  SELECT * INTO m FROM private.memberships mm WHERE active AND ('lead.write'=ANY(permissions) OR '*'=ANY(permissions)) AND (branch_id=l.branch_id OR branch_id='00000000-0000-0000-0000-000000000000') AND private.on_shift(mm.shift,now()) AND active_leads<capacity ORDER BY active_leads::numeric/capacity,last_assigned_at NULLS FIRST,user_id LIMIT 1 FOR UPDATE;
  IF m.user_id IS NULL THEN RETURN jsonb_build_object('status','unassigned','id',l.id); END IF;
  IF l.assignee_id IS NOT NULL THEN UPDATE private.memberships SET active_leads=greatest(0,active_leads-1) WHERE user_id=l.assignee_id AND (branch_id=l.branch_id OR branch_id='00000000-0000-0000-0000-000000000000'); END IF;
  UPDATE private.memberships SET active_leads=active_leads+1,last_assigned_at=now() WHERE user_id=m.user_id AND branch_id=m.branch_id;
  UPDATE private.leads SET assignee_id=m.user_id,status='assigned',version=version+1,updated_at=now(),sla_due_at=coalesce(sla_due_at,(c->>'sla_due_at')::timestamptz) WHERE id=l.id RETURNING * INTO l;
 ELSIF op='transition' THEN
  new_status:=c->>'status';
  allowed:=CASE l.status WHEN 'new' THEN ARRAY['assigned','invalid','rejected','duplicate'] WHEN 'assigned' THEN ARRAY['contacting','unreachable','rejected'] WHEN 'contacting' THEN ARRAY['contacted','unreachable','invalid','rejected'] WHEN 'contacted' THEN ARRAY['qualified','no_infrastructure','rejected'] WHEN 'qualified' THEN ARRAY['survey','quoted','closed','rejected'] WHEN 'survey' THEN ARRAY['quoted','no_infrastructure','rejected'] WHEN 'quoted' THEN ARRAY['closed','rejected'] WHEN 'closed' THEN ARRAY['installed','rejected'] WHEN 'unreachable' THEN ARRAY['contacting','rejected'] WHEN 'no_infrastructure' THEN ARRAY['survey','rejected'] ELSE ARRAY[]::text[] END;
  IF NOT new_status=ANY(allowed) OR (new_status='installed' AND coalesce(c->'installation'->>'reference','')='') OR (new_status IN ('invalid','rejected','duplicate') AND coalesce(c->>'reason','')='') THEN RETURN jsonb_build_object('error','INVALID_TRANSITION','status',409); END IF;
  IF new_status IN ('installed','invalid','rejected','duplicate') AND l.assignee_id IS NOT NULL THEN UPDATE private.memberships SET active_leads=greatest(0,active_leads-1) WHERE user_id=l.assignee_id AND (branch_id=l.branch_id OR branch_id='00000000-0000-0000-0000-000000000000'); END IF;
  UPDATE private.leads SET status=new_status,version=version+1,evidence_version=evidence_version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
  INSERT INTO private.activities(lead_id,kind,payload,actor_id) VALUES(l.id,'transition',jsonb_build_object('to',new_status,'reason',c->>'reason','installation',c->'installation'),actor);
  IF new_status='contacted' THEN INSERT INTO private.observations(lead_id,field,value,source,status) VALUES(l.id,'contacted','true','staff','confirmed'); END IF;
  IF new_status='installed' THEN
   PERFORM private.enqueue('conversions','conversion',l.id,'conversion:'||l.event_id||':installed');
   UPDATE private.jobs SET job_command='{"stage":"installed"}' WHERE entity_id=l.id AND dedup_key='conversion:'||l.event_id||':installed';
  END IF;
  PERFORM private.enqueue('lead_local','enrich_local',l.id,'enrich:'||l.id||':'||l.evidence_version,l.evidence_version);
 ELSIF op='observation' THEN
  IF NOT private.permitted(actor,'intelligence.write',l.branch_id) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
  item:=c->'payload';
  INSERT INTO private.observations(lead_id,field,value,source,status,evidence_ref,expires_at) VALUES(l.id,item->>'field',item->'value','staff',item->>'status',item->>'evidence_ref',(item->>'expires_at')::timestamptz);
  UPDATE private.leads SET evidence_version=evidence_version+1,version=version+1,updated_at=now() WHERE id=l.id RETURNING * INTO l;
  PERFORM private.enqueue('lead_local','enrich_local',l.id,'enrich:'||l.id||':'||l.evidence_version,l.evidence_version);
 ELSIF op='activity' THEN
  INSERT INTO private.activities(lead_id,kind,payload,actor_id) VALUES(l.id,c->'payload'->>'kind',c->'payload',actor);
 ELSE RETURN jsonb_build_object('error','UNKNOWN_OPERATION','status',400);
 END IF;
 INSERT INTO private.audit(actor_id,branch_id,entity_id,action,payload) VALUES(actor,l.branch_id,l.id,'lead.'||op,jsonb_build_object('version',l.version));
 RETURN private.lead_safe(l);
END $$;
CREATE OR REPLACE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='identity' THEN RETURN jsonb_build_object('memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('branch_id',branch_id,'permissions',permissions)) FROM private.memberships WHERE user_id=(command->>'subject')::uuid AND active),'[]'::jsonb)); END IF;
 IF command->>'op' IN ('internal_lead','internal_assign','lead_list','lead_detail','lead_reveal','changes','assign','transition','observation','activity') THEN RETURN private.crm_dispatch(command); END IF;
 RETURN private.resource_dispatch(command);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO service_role;
COMMIT;
