-- Runs inside a rollback transaction. Uses a managed existing practice
-- and transient verification patients/bookings; does not create Auth accounts.
BEGIN;

DO $$
DECLARE practice uuid; actor uuid; identity_id uuid; day date; slot jsonb; view jsonb; settings jsonb; version_before bigint;
  patient uuid; current_appointment uuid; previous uuid; key uuid; denied boolean; patients_before bigint; records_before bigint;
  queue_session uuid; online_booking uuid; first_reception uuid; second_reception uuid; original_number integer; ready_id uuid;
BEGIN
  SELECT settings.doctor_facility_id INTO practice
  FROM clinzo.doctor_schedule_preferences settings
  WHERE EXISTS(SELECT 1 FROM clinzo.session s JOIN clinzo.appointment_window w ON w.session_id=s.id
    WHERE s.doctor_facility_id=settings.doctor_facility_id AND clinzo.service_mode_for_session(s.id)='clinic'
      AND w.starts_at>now()+interval '1 day' AND w.state='open' AND s.state IN ('published','open'))
  ORDER BY settings.walkin_daily_limit DESC LIMIT 1;
  IF practice IS NULL THEN RAISE EXCEPTION 'No published clinic fixture available'; END IF;
  SELECT u.id,i.id INTO actor,identity_id FROM auth.users u JOIN clinzo.identity i ON i.issuer='supabase' AND i.subject=u.id::text
    WHERE i.disabled_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<now())
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
      AND clinzo.can_manage_practice(i.id,practice) LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'No authorized reception identity available'; END IF;
  SELECT bd.local_date INTO day FROM clinzo.session s JOIN clinzo.doctor_booking_day bd ON bd.id=s.booking_day_id
    JOIN clinzo.appointment_window w ON w.session_id=s.id
    WHERE s.doctor_facility_id=practice AND clinzo.service_mode_for_session(s.id)='clinic'
      AND w.starts_at>now()+interval '1 day' AND w.state='open' AND s.state IN ('published','open')
      AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a JOIN clinzo.session booked ON booked.id=a.session_id
        WHERE booked.booking_day_id=s.booking_day_id AND booked.doctor_facility_id=practice)
    GROUP BY bd.local_date HAVING count(*)>=8 ORDER BY bd.local_date LIMIT 1;
  IF day IS NULL THEN RAISE EXCEPTION 'No empty future clinic day for verification'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  settings:=public.get_my_schedule_preferences(practice);
  version_before:=(settings->>'row_version')::bigint;
  settings:=public.save_my_schedule_preferences(practice,settings||jsonb_build_object(
    'walkin_daily_limit',5,'clinic_app_daily_limit',2,'clinic_walkin_daily_limit',3),version_before);
  IF settings->>'clinic_app_daily_limit'<>'2' OR settings->>'clinic_walkin_daily_limit'<>'3'
    OR (settings->>'row_version')::bigint<>version_before+1 THEN RAISE EXCEPTION 'Editable quota save or version increment failed'; END IF;
  denied:=false;
  BEGIN PERFORM public.save_my_schedule_preferences(practice,settings||jsonb_build_object('clinic_walkin_daily_limit',4),version_before+1);
    EXCEPTION WHEN invalid_parameter_value OR check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Invalid channel allocation accepted'; END IF;
  view:=public.get_portal_clinic_day(practice,day);
  IF view->>'app_remaining'<>'2' OR view->>'walkin_remaining'<>'3' THEN RAISE EXCEPTION 'Separate editable quotas not reflected'; END IF;
  IF jsonb_array_length(view->'slots')<=2 THEN RAISE EXCEPTION 'Reception cannot inspect full day'; END IF;
  INSERT INTO clinzo.patient(public_code,full_name) VALUES(gen_random_uuid()::text,'Clinic channel verification') RETURNING id INTO patient;
  INSERT INTO clinzo.patient_access(patient_id,identity_id,relationship,verified_at) VALUES(patient,identity_id,'delegate',now());
  SELECT s.id INTO queue_session FROM clinzo.session s JOIN clinzo.appointment_window w ON w.session_id=s.id
    WHERE s.doctor_facility_id=practice AND (w.starts_at AT TIME ZONE s.timezone)::date=day
      AND clinzo.service_mode_for_session(s.id)='clinic' AND w.state='open' AND s.state IN ('published','open')
    GROUP BY s.id HAVING count(*)>=6 AND bool_and(w.hard_capacity=1) ORDER BY s.starts_at LIMIT 1;
  IF queue_session IS NULL THEN RAISE EXCEPTION 'Queue verification needs six single-patient windows in one empty session'; END IF;
  FOR n IN 1..2 LOOP
    view:=public.get_portal_clinic_day(practice,day);
    SELECT x INTO slot FROM jsonb_array_elements(view->'slots') x JOIN clinzo.appointment_window w ON w.id=(x->>'window_id')::uuid
      WHERE x->>'state'='open' AND w.session_id=queue_session ORDER BY w.starts_at DESC LIMIT 1;
    current_appointment:=public.book_clinic_appointment(patient,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,'',gen_random_uuid());
    IF n=1 THEN online_booking:=current_appointment; END IF;
  END LOOP;
  view:=public.get_portal_clinic_day(practice,day);
  IF view->>'app_used'<>'2' OR view->>'app_remaining'<>'0' OR view->>'walkin_remaining'<>'3' THEN
    RAISE EXCEPTION 'App reservations consumed walk-in allocation'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_practice_service_slots(practice,'clinic',NULL,now(),10000)) x
    WHERE ((x->>'starts_at')::timestamptz AT TIME ZONE (x->>'timezone'))::date=day) THEN
    RAISE EXCEPTION 'Patient app still offers exhausted app quota'; END IF;
  -- The doctor page labels the taken times and shows app booking closed.
  IF (SELECT count(*) FILTER(WHERE x->>'status'='booked')<>2 OR count(*) FILTER(WHERE x->>'status'='closed')=0
      FROM jsonb_array_elements(public.list_practice_clinic_time_board(practice)) x
      JOIN clinzo.appointment_window w ON w.id=(x->>'window_id')::uuid
      JOIN clinzo.session s ON s.id=w.session_id JOIN clinzo.doctor_booking_day bd ON bd.id=s.booking_day_id
      WHERE bd.local_date=day) THEN
    RAISE EXCEPTION 'Time board does not label booked and closed times'; END IF;
  SELECT x INTO slot FROM jsonb_array_elements(view->'slots') x WHERE x->>'state'='open' LIMIT 1;
  denied:=false;
  BEGIN PERFORM public.book_clinic_appointment(patient,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,'',gen_random_uuid());
    EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'App quota can be bypassed'; END IF;
  SELECT count(*) INTO patients_before FROM clinzo.patient;
  denied:=false;
  BEGIN PERFORM public.book_portal_walk_in_appointment(practice,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,
    'Reception future-day verification',NULL,'',gen_random_uuid(),29,'Other',true);
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied OR (SELECT count(*) FROM clinzo.patient)<>patients_before THEN RAISE EXCEPTION 'Invalid future check-in did not roll back registration'; END IF;
  FOR n IN 1..3 LOOP
    view:=public.get_portal_clinic_day(practice,day);
    SELECT x INTO slot FROM jsonb_array_elements(view->'slots') x JOIN clinzo.appointment_window w ON w.id=(x->>'window_id')::uuid
      WHERE x->>'state'='open' AND w.session_id=queue_session ORDER BY w.starts_at LIMIT 1;
    key:=gen_random_uuid();
    current_appointment:=public.book_portal_walk_in_appointment(practice,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,
      'Reception channel verification',NULL,'Verification only',key,29,'Other',false);
    previous:=public.book_portal_walk_in_appointment(practice,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,
      'Reception channel verification',NULL,'Verification only',key,29,'Other',false);
    IF current_appointment<>previous THEN RAISE EXCEPTION 'Reception idempotency failed'; END IF;
    IF n=1 THEN first_reception:=current_appointment; ELSIF n=2 THEN second_reception:=current_appointment; END IF;
    IF NOT EXISTS(SELECT 1 FROM clinzo.appointment a JOIN clinzo.patient p ON p.id=a.patient_id
      JOIN clinzo.queue_entry q ON q.appointment_id=a.id WHERE a.id=current_appointment AND a.source='reception_walk_in'
        AND p.reported_age_years=29 AND p.gender_identity='Other' AND q.state='awaiting_arrival') THEN
      RAISE EXCEPTION 'Reception demographics or shared queue entry missing'; END IF;
  END LOOP;
  view:=public.get_portal_clinic_day(practice,day);
  IF view->>'total_used'<>'5' OR view->>'walkin_used'<>'3' OR view->>'walkin_remaining'<>'0' THEN RAISE EXCEPTION 'Combined capacity incorrect'; END IF;
  SELECT x INTO slot FROM jsonb_array_elements(view->'slots') x WHERE x->>'state'='open' LIMIT 1;
  denied:=false;
  BEGIN PERFORM public.book_portal_walk_in_appointment(practice,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,
    'Excess reception verification',NULL,'',gen_random_uuid(),NULL,NULL,false);
    EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Reception or total quota can be bypassed'; END IF;
  -- The actual migration/RPCs must reserve by window, even when the later app
  -- booking was made first. No reduced schema or substituted auth helpers.
  SELECT planned_queue_number INTO original_number FROM clinzo.appointment WHERE id=online_booking;
  IF original_number IS NULL OR original_number <= (SELECT planned_queue_number FROM clinzo.appointment WHERE id=first_reception)
    OR NOT EXISTS(SELECT 1 FROM clinzo.queue_entry q JOIN clinzo.appointment a ON a.id=q.appointment_id
      WHERE a.id=first_reception AND q.ticket_number=a.planned_queue_number) THEN
    RAISE EXCEPTION 'Tokens followed booking order instead of reserved appointment positions'; END IF;
  INSERT INTO clinzo.appointment_checkin(appointment_id,checked_in_by,method,reason,created_at)
    SELECT a.id,identity_id,'manual','Disposable queue arrival fixture',w.starts_at FROM clinzo.appointment a
    JOIN clinzo.appointment_window w ON w.id=a.window_id WHERE a.id=second_reception;
  UPDATE clinzo.queue_entry SET state='waiting' WHERE appointment_id=second_reception;
  SELECT appointment_id INTO ready_id FROM clinzo.clinic_ready_queue(queue_session) ORDER BY queue_rank LIMIT 1;
  IF ready_id IS DISTINCT FROM second_reception THEN RAISE EXCEPTION 'An absent earlier reservation blocked a ready patient'; END IF;
  -- Explicit check-in timestamps simulate late attendance in a future fixture
  -- session; all normal table triggers and checks remain enabled.
  INSERT INTO clinzo.appointment_checkin(appointment_id,checked_in_by,method,reason,created_at)
    SELECT a.id,identity_id,'manual','Disposable late arrival fixture',w.starts_at+interval '11 minutes'
    FROM clinzo.appointment a JOIN clinzo.appointment_window w ON w.id=a.window_id WHERE a.id=first_reception;
  UPDATE clinzo.queue_entry SET state='waiting' WHERE appointment_id=first_reception;
  -- Grace periods are retired: no reception hold, and the late patient waits
  -- from their arrival time rather than their booked time.
  IF coalesce((clinzo.clinic_queue_details(first_reception)->>'late_review_required')::boolean,false) THEN
    RAISE EXCEPTION 'Late arrival was held for review after grace periods were retired'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clinzo.clinic_ready_queue(queue_session) r
      JOIN clinzo.appointment_checkin c ON c.appointment_id=r.appointment_id
      WHERE r.appointment_id=first_reception AND abs(extract(epoch FROM r.due_at-c.created_at))<1) THEN
    RAISE EXCEPTION 'Late arrival did not join the queue at its arrival time'; END IF;
  IF coalesce((clinzo.clinic_queue_details(second_reception)->>'can_call')::boolean,false) THEN
    RAISE EXCEPTION 'Future session allowed consultation before its start'; END IF;
  PERFORM public.transition_clinic_appointment(online_booking,(SELECT row_version FROM clinzo.appointment WHERE id=online_booking),'cancel','Disposable cancellation fixture');
  SELECT jsonb_build_object('window_id',w.id,'practice_service_id',a.practice_service_id) INTO slot
    FROM clinzo.appointment a JOIN clinzo.appointment_window w ON w.id=a.window_id WHERE a.id=online_booking;
  -- Reuse the released position without changing the cancelled appointment's token.
  current_appointment:=public.book_clinic_appointment(patient,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,'',gen_random_uuid());
  IF (SELECT planned_queue_number FROM clinzo.appointment WHERE id=current_appointment) IS DISTINCT FROM original_number
    OR (SELECT planned_queue_number FROM clinzo.appointment WHERE id=online_booking) IS DISTINCT FROM original_number THEN
    RAISE EXCEPTION 'Cancellation lost the reserved position or historical token'; END IF;
  IF has_function_privilege('authenticated','clinzo.clinic_queue_details(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.set_appointment_recovery_policy(uuid,bigint,integer,integer,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Queue helper or policy grants exposed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  denied:=false;
  BEGIN PERFORM public.get_portal_clinic_day(practice,day); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unauthenticated capacity access allowed'; END IF;
END $$;
SELECT true AS clinic_channel_capacity_smoke_passed;
ROLLBACK;
