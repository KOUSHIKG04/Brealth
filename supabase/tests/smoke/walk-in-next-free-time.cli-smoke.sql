-- Runs inside a rollback transaction. Needs a published clinic session today
-- with at least three free single-patient times still ahead. Verifies that
-- walk-ins get the next free time in order and skip an already booked time.
BEGIN;

DO $$
DECLARE practice uuid; actor uuid; identity_id uuid; service uuid; zone text; windows uuid[];
  settings jsonb; policy jsonb; fee bigint; booking jsonb; first_booking uuid; second_booking uuid;
  input jsonb; denied boolean;
BEGIN
  SELECT s.doctor_facility_id,ss.practice_service_id,d.booking_timezone,
      array_agg(w.id ORDER BY w.starts_at,w.id)
    INTO practice,service,zone,windows
  FROM clinzo.session s JOIN clinzo.doctor d ON d.id=s.doctor_id
  JOIN clinzo.session_service ss ON ss.session_id=s.id
  JOIN clinzo.appointment_window w ON w.session_id=s.id
  WHERE clinzo.service_mode_for_session(s.id)='clinic' AND s.state IN ('published','open')
    AND w.state='open' AND w.hard_capacity=1 AND w.starts_at>now()
    AND (w.starts_at AT TIME ZONE d.booking_timezone)::date=(now() AT TIME ZONE d.booking_timezone)::date
    AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.session_id=s.id)
  GROUP BY s.id,s.doctor_facility_id,ss.practice_service_id,d.booking_timezone
  HAVING count(*)>=3 ORDER BY min(w.starts_at) LIMIT 1;
  IF practice IS NULL THEN RAISE EXCEPTION 'Needs an empty clinic session today with three upcoming times'; END IF;
  SELECT u.id,i.id INTO actor,identity_id FROM auth.users u JOIN clinzo.identity i ON i.issuer='supabase' AND i.subject=u.id::text
    WHERE i.disabled_at IS NULL AND clinzo.can_manage_practice(i.id,practice) LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'No authorized reception identity available'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);

  -- Room for walk-ins: every time goes to walk-ins in this fixture.
  settings:=public.get_my_schedule_preferences(practice);
  settings:=public.save_my_schedule_preferences(practice,settings||jsonb_build_object(
    'walkin_daily_limit',3,'clinic_app_daily_limit',0,'clinic_walkin_daily_limit',3),
    (settings->>'row_version')::bigint);

  SELECT fee_minor INTO fee FROM clinzo.practice_service WHERE id=service;
  policy:=public.get_portal_walk_in_payment_policy(practice);
  IF fee>0 AND NOT (policy->>'can_collect')::boolean THEN
    RAISE EXCEPTION 'Fixture identity cannot collect the visit fee';
  END IF;
  input:=jsonb_build_object('practiceId',practice,'practiceServiceId',service,
    'patientName','Next free time verification','patientPhone','','reason','',
    'paymentMethod','cash','termsAccepted',true,'cashReceived',true,
    'policyVersion',policy->>'policy_version','checkIn',false);

  -- A client may not choose the time.
  denied:=false;
  BEGIN PERFORM public.prepare_portal_next_walk_in_booking(input||jsonb_build_object(
      'idempotencyKey',gen_random_uuid(),'windowId',windows[1]));
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'A walk-in time could be chosen by the client'; END IF;

  booking:=public.prepare_portal_next_walk_in_booking(input||jsonb_build_object('idempotencyKey',gen_random_uuid()));
  first_booking:=(booking->>'appointment_id')::uuid;
  IF (SELECT window_id FROM clinzo.appointment WHERE id=first_booking) IS DISTINCT FROM windows[1] THEN
    RAISE EXCEPTION 'First walk-in did not get the first free time'; END IF;

  -- The first time is now booked, so the next walk-in moves to the second.
  booking:=public.prepare_portal_next_walk_in_booking(input||jsonb_build_object('idempotencyKey',gen_random_uuid()));
  second_booking:=(booking->>'appointment_id')::uuid;
  IF (SELECT window_id FROM clinzo.appointment WHERE id=second_booking) IS DISTINCT FROM windows[2] THEN
    RAISE EXCEPTION 'Next walk-in did not skip the booked time'; END IF;
  IF (booking->>'starts_at')::timestamptz IS DISTINCT FROM (SELECT starts_at FROM clinzo.appointment_window WHERE id=windows[2]) THEN
    RAISE EXCEPTION 'Assigned time was not reported'; END IF;
END $$;
SELECT true AS walk_in_next_free_time_smoke_passed;
ROLLBACK;
