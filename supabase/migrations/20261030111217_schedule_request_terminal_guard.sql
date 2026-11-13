-- A doctor request waives the patient's move limit, but never revives an
-- appointment the patient explicitly cancelled or the clinic rejected.
DO $$
DECLARE definition text; marker text;
BEGIN
  definition:=pg_get_functiondef('public.reschedule_appointment(uuid,bigint,uuid,text,uuid)'::regprocedure);
  marker:='OR (a.status IN (''cancelled'',''rejected'') AND a.recovery_outcome IS DISTINCT FROM ''doctor_unavailable'' AND a.schedule_change_requested_at IS NULL AND coalesce';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected terminal appointment recovery guard'; END IF;
  EXECUTE replace(definition,marker,'OR (a.status IN (''cancelled'',''rejected'') AND a.recovery_outcome IS DISTINCT FROM ''doctor_unavailable'' AND coalesce');
END $$;
