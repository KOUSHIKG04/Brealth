-- Reception no longer chooses a time for a walk-in. Each walk-in is given the
-- next free in-person time today, in order from the start of clinic hours,
-- skipping times already booked (for example through the app) and times that
-- have ended. Walk-ins are registered for today only.
--
-- The chosen time is booked through the existing
-- public.prepare_portal_walk_in_booking, so payment terms, cash, the walk-in
-- limit, queue numbering and check-in rules are unchanged. If another booking
-- takes that time first, the next free time is tried.

CREATE FUNCTION public.prepare_portal_next_walk_in_booking(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); practice uuid; service uuid; zone text;
  previous_window uuid; candidate record; result jsonb; attempts integer:=0; message text;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR p_input ? 'windowId' THEN
    RAISE EXCEPTION 'Invalid walk-in booking details' USING ERRCODE='22023';
  END IF;
  practice:=(p_input->>'practiceId')::uuid;
  service:=(p_input->>'practiceServiceId')::uuid;
  IF practice IS NULL OR service IS NULL OR (p_input->>'idempotencyKey') IS NULL THEN
    RAISE EXCEPTION 'Invalid walk-in booking details' USING ERRCODE='22023';
  END IF;
  IF NOT coalesce(clinzo.can_manage_practice(actor,practice),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501';
  END IF;

  -- A retried request keeps the time it was already given.
  SELECT a.window_id INTO previous_window FROM clinzo.idempotency_record r
    JOIN clinzo.appointment a ON a.id=r.resource_id
    WHERE r.principal_scope=actor::text AND r.operation='clinic.walk_in'
      AND r.key=p_input->>'idempotencyKey';
  IF previous_window IS NOT NULL THEN
    RETURN public.prepare_portal_walk_in_booking(p_input||jsonb_build_object('windowId',previous_window))
      ||jsonb_build_object('starts_at',(SELECT starts_at FROM clinzo.appointment_window WHERE id=previous_window));
  END IF;

  SELECT d.booking_timezone INTO zone FROM clinzo.doctor d
    JOIN clinzo.doctor_facility p ON p.doctor_id=d.id WHERE p.id=practice;
  IF zone IS NULL THEN RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501'; END IF;

  FOR candidate IN
    SELECT w.id,w.starts_at FROM clinzo.appointment_window w
      JOIN clinzo.session s ON s.id=w.session_id
      JOIN clinzo.session_service ss ON ss.session_id=s.id AND ss.practice_service_id=service
    WHERE s.doctor_facility_id=practice AND clinzo.service_mode_for_session(s.id)='clinic'
      AND s.state IN ('published','open') AND w.state='open' AND w.ends_at>now()
      AND (w.starts_at AT TIME ZONE zone)::date=(now() AT TIME ZONE zone)::date
      AND (SELECT count(*) FROM clinzo.appointment a WHERE a.window_id=w.id
        AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL)
          OR (a.status='pending' AND a.request_expires_at>now())))<w.hard_capacity
      AND NOT EXISTS(SELECT 1 FROM clinzo.schedule_exception e WHERE e.doctor_id=s.doctor_id AND e.state='active'
        AND (e.doctor_facility_id IS NULL OR e.doctor_facility_id=practice)
        AND e.service_mode IN ('all','clinic') AND e.starts_at<w.ends_at AND e.ends_at>w.starts_at)
    ORDER BY w.starts_at,w.id
  LOOP
    attempts:=attempts+1;
    BEGIN
      result:=public.prepare_portal_walk_in_booking(p_input||jsonb_build_object('windowId',candidate.id));
      RETURN result||jsonb_build_object('starts_at',candidate.starts_at);
    EXCEPTION WHEN check_violation OR SQLSTATE 'PT409' THEN
      GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
      -- Only a time taken a moment ago moves on; every other rule (walk-in
      -- limit, payment terms, reservation expiry) is reported as before.
      IF attempts>=25 OR (message NOT LIKE 'Slot is full%'
          AND message NOT LIKE 'Appointment position is already reserved%') THEN
        RAISE;
      END IF;
    END;
  END LOOP;
  RAISE EXCEPTION 'No free time left today' USING ERRCODE='23514';
END $$;

REVOKE ALL ON FUNCTION public.prepare_portal_next_walk_in_booking(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_portal_next_walk_in_booking(jsonb) TO authenticated;
