BEGIN;
-- One-time migration of the existing production ID; runtime IDs are managed through Admin thereafter.
CREATE FUNCTION private.measurement_bootstrap(p_env text DEFAULT 'production') RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cid uuid:=gen_random_uuid();cfg uuid:=gen_random_uuid();rid uuid;p jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM private.measurement_active WHERE environment=p_env AND scope='global') THEN RETURN; END IF;
 INSERT INTO private.measurement_connections(id,payload) VALUES(cid,jsonb_build_object('name','GA4 Website','provider','ga4','environment',p_env,'enabled',true,'settings',jsonb_build_object('measurement_id','G-D0J0XLJ891','browser_enabled',true,'server_enabled',false)));
 p:=jsonb_build_object('name','Website','scope','global','scope_key','*','environment',p_env,'policy',jsonb_build_object('ga4_connection_id',cid,'consent_mode','advanced'));
 INSERT INTO private.measurement_configs(id,payload) VALUES(cfg,p);
 INSERT INTO private.measurement_releases(config_id,payload) VALUES(cfg,p) RETURNING id INTO rid;
 INSERT INTO private.measurement_active VALUES(p_env,'global','*',rid);
END $$;
REVOKE ALL ON FUNCTION private.measurement_bootstrap(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.measurement_bootstrap(text) TO service_role;
SELECT private.measurement_bootstrap();
COMMIT;
