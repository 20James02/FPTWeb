BEGIN;
-- The OAuth record variable `state` collides with the sync job column.
-- Replace only the affected query; fail loudly if the deployed contract differs.
DO $$
DECLARE definition text; old_query text:='SELECT id,connection_id,state,result,created_at,updated_at FROM private.measurement_sync_jobs ORDER BY created_at DESC LIMIT 100';
BEGIN
 definition:=pg_get_functiondef('private.measurement_account_dispatch(jsonb)'::regprocedure);
 IF position(old_query IN definition)=0 THEN RAISE EXCEPTION 'Unexpected measurement sync list contract';END IF;
 definition:=replace(definition,old_query,'SELECT jobs.id,jobs.connection_id,jobs.state,jobs.result,jobs.created_at,jobs.updated_at FROM private.measurement_sync_jobs jobs ORDER BY jobs.created_at DESC,jobs.id DESC LIMIT 100');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
