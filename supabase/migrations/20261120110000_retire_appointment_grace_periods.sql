-- Appointment grace periods are retired.
--   * In-person: a late check-in is no longer held for reception review. The
--     patient joins the ready queue at their arrival time, so they never move
--     ahead of patients who were already due and waiting.
--   * Online: the attendance deadline is the booked end time.
-- Entries already held for late review before this migration keep the
-- existing staff-admission path. Columns, RPC signatures, request payloads
-- and the reschedule cutoff / self-reschedule limits are unchanged; the stored
-- grace values are ignored and reported as 0.

CREATE OR REPLACE FUNCTION clinzo.apply_clinic_queue_position() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a clinzo.appointment; booked_at timestamptz; arrived_at timestamptz;
BEGIN
  SELECT * INTO a FROM clinzo.appointment WHERE id=NEW.appointment_id;
  IF TG_OP='INSERT' AND a.planned_queue_number IS NOT NULL THEN NEW.ticket_number:=a.planned_queue_number; END IF;
  IF NEW.state='waiting' AND (TG_OP='INSERT' OR OLD.state='awaiting_arrival') THEN
    SELECT CASE WHEN a.source='patient_online' THEN w.starts_at ELSE greatest(w.starts_at,a.created_at) END INTO booked_at
      FROM clinzo.appointment_window w WHERE w.id=a.window_id;
    SELECT created_at INTO arrived_at FROM clinzo.appointment_checkin WHERE appointment_id=a.id;
    -- A late arrival waits from the time they arrived, not their booked time.
    IF arrived_at>booked_at THEN
      NEW.order_key:=greatest(NEW.order_key,extract(epoch FROM arrived_at)::bigint);
    END IF;
  ELSIF TG_OP='UPDATE' AND NEW.state='waiting' AND OLD.state='held' AND OLD.hold_reason='Late arrival: reception review required' THEN
    -- Explicit staff admission uses today's recovery time, never an expired
    -- original position to jump ahead of patients who arrived on time.
    NEW.order_key:=greatest(NEW.order_key,extract(epoch FROM now())::bigint);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clinzo.apply_clinic_queue_position() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE definition text; marker text;
BEGIN
  definition:=pg_get_functiondef('clinzo.appointment_recovery_details(uuid)'::regprocedure);
  marker:='ELSE w.ends_at+make_interval(mins=>coalesce(p.online_grace_minutes,15)) END';
  IF position(marker IN definition)=0 OR position('''online_grace_minutes'',coalesce(p.online_grace_minutes,15)' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected recovery details definition';
  END IF;
  definition:=replace(definition,marker,'ELSE w.ends_at END');
  definition:=replace(definition,'''online_grace_minutes'',coalesce(p.online_grace_minutes,15)','''online_grace_minutes'',0');
  EXECUTE definition;

  definition:=pg_get_functiondef('clinzo.clinic_queue_details(uuid)'::regprocedure);
  marker:='''grace_minutes'',coalesce(p.clinic_grace_minutes,10)';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected clinic queue details definition'; END IF;
  definition:=replace(definition,marker,'''grace_minutes'',0');
  EXECUTE definition;
END $$;
