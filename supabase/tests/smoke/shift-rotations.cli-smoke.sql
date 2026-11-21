-- Runs inside a rollback transaction. Needs a verified practice whose clinic
-- service has no active future bookings. Verifies shift plans: validation,
-- one session per shift (overnight and 26-hour shifts), per-shift limits and
-- skipping a shift that would overlap the previous one.
BEGIN;

DO $$
DECLARE practice uuid; sub text; zone text; start_day date; plan jsonb; result jsonb; plan_id uuid;
  long_session clinzo.session; night_session clinzo.session; problem text; created int;
BEGIN
  SELECT p.id INTO practice FROM clinzo.doctor_facility p JOIN clinzo.doctor d ON d.id=p.doctor_id
    JOIN clinzo.facility f ON f.id=p.facility_id JOIN clinzo.organization o ON o.id=f.organization_id
    WHERE p.active AND d.active AND d.credential_status='verified' AND f.active AND f.verification_status='verified'
      AND o.active AND d.identity_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM clinzo.session s JOIN clinzo.appointment a ON a.session_id=s.id
        WHERE s.doctor_facility_id=p.id AND s.starts_at>now() AND clinzo.service_mode_for_session(s.id)='clinic'
          AND a.status IN ('pending','confirmed','in_consultation'))
    ORDER BY p.id LIMIT 1;
  IF practice IS NULL THEN RAISE EXCEPTION 'Needs a practice without future clinic bookings'; END IF;
  SELECT i.subject,coalesce(nullif(d.booking_timezone,''),'Asia/Kolkata') INTO sub,zone FROM clinzo.identity i
    JOIN clinzo.doctor d ON d.identity_id=i.id JOIN clinzo.doctor_facility p ON p.doctor_id=d.id WHERE p.id=practice;
  PERFORM set_config('request.jwt.claim.sub',sub,true);
  start_day:=(now() AT TIME ZONE zone)::date+1;

  problem:=clinzo.shift_plan_problem('clinic','{"templates":[]}'::jsonb);
  IF problem IS NULL THEN RAISE EXCEPTION 'An empty plan was accepted'; END IF;
  problem:=clinzo.shift_plan_problem('clinic',jsonb_build_object('templates',jsonb_build_array(jsonb_build_object(
    'key','x','name','X','start','09:00','duration_minutes',60,'slot_minutes',30,'fee_minor',0,
    'app_limit',2,'walkin_limit',1)),'cycle_weeks',1,'rotation',jsonb_build_array(jsonb_build_array(null,null,null,null,null,null,null))));
  IF problem IS NULL THEN RAISE EXCEPTION 'Limits above the shift''s times were accepted'; END IF;

  plan:=jsonb_build_object(
    'templates',jsonb_build_array(
      jsonb_build_object('key','day','name','Day shift','start','09:00','duration_minutes',480,'slot_minutes',30,
        'fee_minor',50000,'app_limit',10,'walkin_limit',6),
      jsonb_build_object('key','night','name','Night shift','start','21:00','duration_minutes',600,'slot_minutes',30,
        'fee_minor',60000,'app_limit',12,'walkin_limit',8),
      jsonb_build_object('key','long','name','Long shift','start','08:00','duration_minutes',1560,'slot_minutes',60,
        'fee_minor',70000,'app_limit',20,'walkin_limit',6)),
    'cycle_start',start_day,'cycle_weeks',2,
    'rotation',jsonb_build_array(
      jsonb_build_array('day','day','day','day','day',null,null),
      jsonb_build_array('night','night','night','night','night',null,null)),
    -- A 26-hour shift two days in; the next day's shift overlaps it and is skipped.
    'overrides',jsonb_build_array(jsonb_build_object('date',start_day+2,'key','long'),
      jsonb_build_object('date',start_day+3,'key','day')));
  result:=public.submit_shift_plan(practice,'clinic',plan,start_day);
  plan_id:=(result->'plan'->>'id')::uuid;
  IF result->>'status'='pending' THEN created:=clinzo.activate_shift_plan(plan_id,NULL); END IF;
  IF (SELECT status FROM clinzo.shift_plan WHERE id=plan_id)<>'active' THEN RAISE EXCEPTION 'Plan was not activated'; END IF;
  IF (SELECT count(*) FROM clinzo.session WHERE shift_plan_id=plan_id AND state='published')<8 THEN
    RAISE EXCEPTION 'Too few shift sessions were generated'; END IF;

  SELECT * INTO long_session FROM clinzo.session WHERE shift_plan_id=plan_id AND shift_key='long';
  IF long_session.id IS NULL OR long_session.ends_at-long_session.starts_at<>interval '26 hours'
    OR (long_session.ends_at AT TIME ZONE zone)::date<>(long_session.starts_at AT TIME ZONE zone)::date+1 THEN
    RAISE EXCEPTION 'The 26-hour shift is not one session across midnight'; END IF;
  IF (SELECT count(*) FROM clinzo.appointment_window WHERE session_id=long_session.id)<>26 THEN
    RAISE EXCEPTION 'The long shift does not have 26 hourly times'; END IF;
  IF EXISTS(SELECT 1 FROM clinzo.session WHERE shift_plan_id=plan_id AND state<>'cancelled'
      AND (starts_at AT TIME ZONE zone)::date=start_day+3) THEN
    RAISE EXCEPTION 'A shift overlapping the long shift was created'; END IF;

  SELECT * INTO night_session FROM clinzo.session WHERE shift_plan_id=plan_id AND shift_key='night' ORDER BY starts_at LIMIT 1;
  IF night_session.id IS NULL THEN
    -- The second rotation week may be beyond the window only if the horizon is short.
    RAISE EXCEPTION 'No night shift was generated';
  END IF;
  IF (night_session.starts_at AT TIME ZONE zone)::time<>'21:00' OR night_session.ends_at-night_session.starts_at<>interval '10 hours' THEN
    RAISE EXCEPTION 'The night shift is not 21:00 for 10 hours'; END IF;
  IF clinzo.remaining_clinic_channel_capacity(night_session.id,'patient_online')<>12
    OR clinzo.remaining_clinic_channel_capacity(night_session.id,'reception_walk_in')<>8
    OR clinzo.remaining_daily_booking_capacity(night_session.id)<>20 THEN
    RAISE EXCEPTION 'Shift limits do not come from the shift template'; END IF;

  IF clinzo.refresh_shift_plans()<>0 THEN RAISE EXCEPTION 'Refreshing created duplicate shifts'; END IF;
  IF position('refresh_shift_plans' IN pg_get_functiondef('clinzo.refresh_automatic_schedules()'::regprocedure))=0 THEN
    RAISE EXCEPTION 'The nightly job does not extend shift plans'; END IF;
END $$;
SELECT true AS shift_rotations_smoke_passed;
ROLLBACK;
