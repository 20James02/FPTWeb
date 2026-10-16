BEGIN;
-- Privacy erasure owns the customer session before cascading lead/delivery deletion.
-- Preparation/retry must take that session lock before taking a delivery lock too.
DO $$
DECLARE definition text; anchor text:='SELECT * INTO d FROM private.measurement_deliveries WHERE id=(c->>''id'')::uuid FOR UPDATE;';
BEGIN
 definition:=pg_get_functiondef('private.measurement_delivery_dispatch(jsonb)'::regprocedure);
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Unexpected managed delivery lock contract';END IF;
 definition:=replace(definition,anchor,$patch$
 IF op IN ('measurement_delivery_prepare','measurement_delivery_retry') THEN
  PERFORM 1 FROM private.sessions sess
  JOIN private.leads lead ON sess.id=(lead.payload->>'session_id')::uuid
  JOIN private.measurement_occurrences occurrence ON occurrence.lead_id=lead.id
  JOIN private.measurement_deliveries delivery ON delivery.occurrence_id=occurrence.id
  WHERE delivery.id=(c->>'id')::uuid FOR SHARE OF sess;
 END IF;
 SELECT * INTO d FROM private.measurement_deliveries WHERE id=(c->>'id')::uuid FOR UPDATE;
$patch$);
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
