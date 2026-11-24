-- Execute within BEGIN/ROLLBACK only. Requires
-- 20261113103000_schedule_update_smoothness.sql. Uses an existing managed
-- practice with no reserved appointments from the chosen effective date and no
-- other practice; every write below rolls back.
BEGIN;

DO $$
DECLARE practice uuid; actor uuid; zone text; day date; settings jsonb; result jsonb;
  busy jsonb; plan jsonb; version_before bigint; raised text;
BEGIN
  SELECT p.id,u.id,d.booking_timezone INTO practice,actor,zone
    FROM clinzo.doctor_schedule_preferences prefs JOIN clinzo.doctor_facility p ON p.id=prefs.doctor_facility_id
    JOIN clinzo.doctor d ON d.id=p.doctor_id JOIN clinzo.identity i ON i.disabled_at IS NULL
    JOIN auth.users u ON i.issuer='supabase' AND i.subject=u.id::text
    WHERE clinzo.can_edit_practice_schedule(i.id,p.id) AND clinzo.can_manage_practice(i.id,p.id)
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL) AND (u.banned_until IS NULL OR u.banned_until<now())
      AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a JOIN clinzo.session s ON s.id=a.session_id
        WHERE s.doctor_id=d.id AND s.ends_at>((now() AT TIME ZONE d.booking_timezone)::date+7)::timestamp AT TIME ZONE d.booking_timezone
          AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now())))
      AND NOT EXISTS(SELECT 1 FROM clinzo.doctor_facility other_practice
        WHERE other_practice.doctor_id=d.id AND other_practice.id<>p.id AND other_practice.active)
    ORDER BY p.id LIMIT 1;
  IF practice IS NULL THEN RAISE EXCEPTION 'No empty managed single-practice schedule available for rollback verification'; END IF;
  day:=(now() AT TIME ZONE zone)::date+7;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  settings:=public.get_my_schedule_preferences(practice);

  -- Known layout through the real publisher: clinic 09:00-12:00, online 13:00-15:00, no home visits.
  result:=public.publish_doctor_schedule_from_date(practice,'home',settings||jsonb_build_object('home_visits',false),(settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'clinic',settings||jsonb_build_object(
    'working_days',jsonb_build_array(1,2,3,4,5,6,7),'slot_minutes',30,'walkin_daily_limit',12,'clinic_app_daily_limit',12,'clinic_walkin_daily_limit',0,
    'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','12:00'))),
    (settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'online',settings||jsonb_build_object(
    'online_working_days',jsonb_build_array(1,2,3,4,5,6,7),'online_daily_limit',2,'online_slot_minutes',30,'online_fee_minor',10000,
    'online_time_blocks',jsonb_build_array(jsonb_build_object('start','13:00','end','15:00'))),
    (settings->>'row_version')::bigint,day);
  settings:=result->'settings';

  -- 1. Busy blocks list other services only, with no patient details.
  busy:=public.list_my_schedule_busy_blocks(practice,'clinic',day);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(busy) b WHERE b->>'mode'='online' AND b->>'start'='13:00' AND b->>'end'='15:00')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(busy) b WHERE b->>'mode'='clinic' AND (b->>'practice_id')::uuid=practice)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(busy) b WHERE b ? 'bookings' OR b ? 'patient_name') THEN
    RAISE EXCEPTION 'Busy blocks for clinic are wrong: %',busy; END IF;
  busy:=public.list_my_schedule_busy_blocks(practice,'online',day);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(busy) b WHERE b->>'mode'='clinic' AND b->>'start'='09:00') THEN
    RAISE EXCEPTION 'Busy blocks for online are wrong: %',busy; END IF;

  -- 2. A conflicting draft cannot be published through the checked publisher.
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings||jsonb_build_object(
    'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','14:00'))),(settings->>'row_version')::bigint,day);
  IF jsonb_array_length(plan->'conflicts')=0 THEN RAISE EXCEPTION 'Expected an online conflict: %',plan; END IF;
  IF plan ? 'suggested_effective_from' THEN
    RAISE EXCEPTION 'No booking blocks the change, so no later date should be suggested: %',plan; END IF;
  version_before:=(settings->>'row_version')::bigint;
  raised:=NULL;
  BEGIN
    PERFORM public.publish_previewed_doctor_schedule(practice,'clinic',settings||jsonb_build_object(
      'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','14:00'))),version_before,day,plan->>'token');
  EXCEPTION WHEN SQLSTATE 'PT410' THEN raised:='PT410'; END;
  IF raised IS DISTINCT FROM 'PT410' THEN RAISE EXCEPTION 'Checked publish accepted a conflicting draft'; END IF;

  -- 3. A conflict-free draft needs the matching token.
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings||jsonb_build_object(
    'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','12:30'))),version_before,day);
  IF jsonb_array_length(plan->'conflicts')<>0 THEN RAISE EXCEPTION 'Unexpected conflict: %',plan; END IF;
  raised:=NULL;
  BEGIN
    PERFORM public.publish_previewed_doctor_schedule(practice,'clinic',settings||jsonb_build_object(
      'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','12:30'))),version_before,day,md5('stale'));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN raised:='PT409'; END;
  IF raised IS DISTINCT FROM 'PT409' THEN RAISE EXCEPTION 'Checked publish accepted a stale token'; END IF;
  IF (public.get_my_schedule_preferences(practice)->>'row_version')::bigint<>version_before THEN
    RAISE EXCEPTION 'Rejected publications changed the schedule'; END IF;

  -- 4. Another change after the preview (here: the online schedule) is caught.
  result:=public.publish_doctor_schedule_from_date(practice,'online',settings||jsonb_build_object(
    'online_time_blocks',jsonb_build_array(jsonb_build_object('start','12:30','end','13:30'))),version_before,day);
  raised:=NULL;
  BEGIN
    PERFORM public.publish_previewed_doctor_schedule(practice,'clinic',settings||jsonb_build_object(
      'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','12:30'))),version_before,day,plan->>'token');
  EXCEPTION WHEN SQLSTATE 'PT409' OR SQLSTATE 'PT410' THEN raised:=SQLSTATE; END;
  IF raised IS NULL THEN RAISE EXCEPTION 'Checked publish ignored a change made after its preview'; END IF;
  settings:=result->'settings';

  -- 5. The success path publishes and returns the normal publication shape.
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings||jsonb_build_object(
    'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','12:00'))),(settings->>'row_version')::bigint,day);
  IF jsonb_array_length(plan->'conflicts')<>0 THEN RAISE EXCEPTION 'Unexpected conflict before success: %',plan; END IF;
  result:=public.publish_previewed_doctor_schedule(practice,'clinic',settings||jsonb_build_object(
    'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','12:00'))),(settings->>'row_version')::bigint,day,plan->>'token');
  IF NOT (result ? 'settings' AND result ? 'slot_count')
    OR NOT (result->'settings'->'published_modes') ? 'clinic' THEN
    RAISE EXCEPTION 'Checked publish returned an unexpected result: %',result; END IF;
END $$;

-- 6. Grants: authenticated only.
DO $$
BEGIN
  IF has_function_privilege('anon','public.publish_previewed_doctor_schedule(uuid,text,jsonb,bigint,date,text)','EXECUTE')
    OR has_function_privilege('anon','public.list_my_schedule_busy_blocks(uuid,text,date)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.publish_previewed_doctor_schedule(uuid,text,jsonb,bigint,date,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.list_my_schedule_busy_blocks(uuid,text,date)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.preview_doctor_schedule_change(uuid,text,jsonb,bigint,date)','EXECUTE') THEN
    RAISE EXCEPTION 'Schedule smoothness grants are wrong'; END IF;
END $$;

SELECT 'schedule update smoothness smoke passed' AS result;
ROLLBACK;
