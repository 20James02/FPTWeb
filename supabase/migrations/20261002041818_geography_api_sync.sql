BEGIN;
CREATE TABLE private.geography_mappings (
 resource_id uuid PRIMARY KEY REFERENCES private.resources(id),
 provider text NOT NULL, level text NOT NULL CHECK(level IN ('province','ward')),
 external_code integer NOT NULL, imported_payload jsonb NOT NULL,
 UNIQUE(provider,level,external_code)
);
CREATE TABLE private.geography_syncs (
 branch_id uuid PRIMARY KEY, source jsonb NOT NULL, province_codes jsonb NOT NULL,
 result jsonb NOT NULL, synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.geography_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.geography_syncs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON private.geography_mappings,private.geography_syncs TO service_role;

CREATE FUNCTION private.geography_import(c jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid:=(c->>'actor')::uuid; branch uuid:=(c->>'branch_id')::uuid;
 item jsonb; old private.resources; mapping private.geography_mappings; parent private.resources;
 data jsonb; created_count int:=0; updated_count int:=0; skipped_count int:=0; rev int; result jsonb;
 failure jsonb;
BEGIN
 IF NOT private.permitted(actor,'catalog.write',branch) THEN RETURN jsonb_build_object('error','PERMISSION_DENIED','status',403); END IF;
 IF jsonb_typeof(c->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'rows') NOT BETWEEN 1 AND 10100 THEN RETURN jsonb_build_object('error','INVALID_BATCH','status',422); END IF;
 PERFORM 1 FROM private.catalog_revision WHERE id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements(c->'rows') LOOP
  data:=item->'payload';
  IF data->>'branch_id' IS DISTINCT FROM branch::text OR data->>'level' NOT IN ('province','ward') OR nullif(data->>'name','') IS NULL THEN
   failure:=jsonb_build_object('error','INVALID_BATCH','status',422); RAISE EXCEPTION 'rollback geography' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO old FROM private.resources WHERE id=(item->>'id')::uuid FOR UPDATE;
  SELECT * INTO mapping FROM private.geography_mappings WHERE resource_id=(item->>'id')::uuid;
  IF old.id IS NOT NULL AND (old.kind<>'region' OR old.branch_id IS DISTINCT FROM branch OR mapping.resource_id IS NULL OR mapping.provider<>'province_open_api_v2' OR mapping.external_code<>(item->>'external_code')::int OR mapping.level<>data->>'level' OR old.payload->>'parent_id' IS DISTINCT FROM data->>'parent_id') THEN
   failure:=jsonb_build_object('error','GEOGRAPHY_SCOPE_CONFLICT','status',409); RAISE EXCEPTION 'rollback geography' USING ERRCODE='P0001';
  END IF;
  IF data->>'level'='ward' THEN
   SELECT * INTO parent FROM private.resources WHERE id=(data->>'parent_id')::uuid AND kind='region' AND payload->>'level'='province' AND branch_id=branch;
   IF parent.id IS NULL THEN failure:=jsonb_build_object('error','INVALID_PARENT','status',422); RAISE EXCEPTION 'rollback geography' USING ERRCODE='P0001'; END IF;
   IF parent.status<>'published' THEN skipped_count:=skipped_count+1; CONTINUE; END IF;
  END IF;
  IF old.id IS NULL THEN
   INSERT INTO private.resources(id,kind,branch_id,payload,published_payload,status,published_version) VALUES((item->>'id')::uuid,'region',branch,data,data,'published',1);
   INSERT INTO private.geography_mappings(resource_id,provider,level,external_code,imported_payload) VALUES((item->>'id')::uuid,'province_open_api_v2',data->>'level',(item->>'external_code')::int,data);
   created_count:=created_count+1;
  ELSIF old.status<>'published' OR old.payload IS DISTINCT FROM old.published_payload OR old.payload IS DISTINCT FROM mapping.imported_payload THEN
   skipped_count:=skipped_count+1;
  ELSIF old.payload IS DISTINCT FROM data THEN
   UPDATE private.resources SET payload=data,published_payload=data,version=version+1,published_version=version+1,updated_at=now() WHERE id=old.id;
   UPDATE private.geography_mappings SET imported_payload=data WHERE resource_id=old.id;
   updated_count:=updated_count+1;
  END IF;
 END LOOP;
 IF created_count+updated_count>0 THEN UPDATE private.catalog_revision SET version=version+1 WHERE id; END IF;
 SELECT version INTO rev FROM private.catalog_revision WHERE id;
 result:=jsonb_build_object('created',created_count,'updated',updated_count,'skipped',skipped_count,'revision',rev,'total',jsonb_array_length(c->'rows'));
 INSERT INTO private.geography_syncs(branch_id,source,province_codes,result) VALUES(branch,c->'source',c->'province_codes',result)
 ON CONFLICT(branch_id) DO UPDATE SET source=excluded.source,province_codes=excluded.province_codes,result=excluded.result,synced_at=now();
 INSERT INTO private.audit(actor_id,branch_id,action,payload) VALUES(actor,branch,'geography.synced',result||jsonb_build_object('source',c->'source','province_codes',c->'province_codes'));
 RETURN result;
EXCEPTION WHEN SQLSTATE 'P0001' THEN RETURN failure;
 WHEN unique_violation THEN RETURN jsonb_build_object('error','GEOGRAPHY_SCOPE_CONFLICT','status',409);
END $$;

ALTER FUNCTION api.dispatch(jsonb) RENAME TO dispatch_before_geography;
CREATE FUNCTION api.dispatch(command jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF command->>'op'='geography_sync' THEN RETURN private.geography_import(command); END IF;
 IF command->>'op'='geography_status' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY synced_at DESC) FROM private.geography_syncs s WHERE private.permitted((command->>'actor')::uuid,'catalog.write',s.branch_id)),'[]');
 END IF;
 RETURN api.dispatch_before_geography(command);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api,private TO service_role;
GRANT EXECUTE ON FUNCTION private.allowed_topic(text) TO authenticated;
COMMIT;
