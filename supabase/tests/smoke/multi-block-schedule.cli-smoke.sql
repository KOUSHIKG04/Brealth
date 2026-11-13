-- Execute within BEGIN/ROLLBACK only. Uses an existing managed practice with no
-- reserved appointments from the chosen effective date, plus transient test data.
BEGIN;

DO $$
DECLARE practice uuid; actor uuid; identity_id uuid; doctor_key uuid; zone text; day date;
  settings jsonb; result jsonb; view jsonb; slot jsonb; version_before bigint; denied boolean;
  plan jsonb; preview_version bigint; notice jsonb; hold_key uuid; patient uuid; appointment_key uuid; original_window uuid; home_session clinzo.session;
  patient_actor uuid; patient_identity uuid; replacement_key uuid; requested_window uuid; billing jsonb; payment_attempt uuid; charge_key uuid; provider_order text;
BEGIN
  SELECT p.id,u.id,i.id,d.id,d.booking_timezone INTO practice,actor,identity_id,doctor_key,zone
    FROM clinzo.doctor_schedule_preferences prefs JOIN clinzo.doctor_facility p ON p.id=prefs.doctor_facility_id
    JOIN clinzo.doctor d ON d.id=p.doctor_id JOIN clinzo.identity i ON i.disabled_at IS NULL
    JOIN auth.users u ON i.issuer='supabase' AND i.subject=u.id::text
    WHERE clinzo.can_edit_practice_schedule(i.id,p.id) AND clinzo.can_manage_practice(i.id,p.id)
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL) AND (u.banned_until IS NULL OR u.banned_until<now())
      AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a JOIN clinzo.session s ON s.id=a.session_id
        WHERE s.doctor_id=d.id AND s.ends_at>((now() AT TIME ZONE d.booking_timezone)::date+7)::timestamp AT TIME ZONE d.booking_timezone
          AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now())))
      AND NOT EXISTS(SELECT 1 FROM clinzo.schedule_rule other_rule JOIN clinzo.doctor_facility other_practice ON other_practice.id=other_rule.doctor_facility_id
        WHERE other_practice.doctor_id=d.id AND other_practice.id<>p.id
          AND (other_rule.state='published' OR (other_rule.state='retired' AND other_rule.effective_until>=(now() AT TIME ZONE d.booking_timezone)::date+7)))
    ORDER BY p.id LIMIT 1;
  IF practice IS NULL THEN RAISE EXCEPTION 'No empty managed future schedule available for rollback verification'; END IF;
  day:=(now() AT TIME ZONE zone)::date+7;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  settings:=public.get_my_schedule_preferences(practice);
  -- Withdraw future unbooked online/home blocks through the real owner first.
  result:=public.publish_doctor_schedule_from_date(practice,'online',settings||jsonb_build_object('online_daily_limit',0),(settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'home',settings||jsonb_build_object('home_visits',false),(settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'clinic',settings||jsonb_build_object(
    'working_days',jsonb_build_array(1,2,3,4,5,6,7),'slot_minutes',30,'walkin_daily_limit',12,'clinic_app_daily_limit',12,'clinic_walkin_daily_limit',0,
    'clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','10:00'),jsonb_build_object('start','11:00','end','12:00'),jsonb_build_object('start','14:00','end','16:00'))),
    (settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  IF jsonb_array_length(settings->'clinic_time_blocks')<>3 OR (result->>'slot_count')::int<8 THEN RAISE EXCEPTION 'Split clinic blocks failed'; END IF;
  result:=public.publish_doctor_schedule_from_date(practice,'online',settings||jsonb_build_object(
    'online_working_days',jsonb_build_array(1,2,3,4,5,6,7),'online_daily_limit',2,'online_slot_minutes',30,'online_fee_minor',10000,
    'online_time_blocks',jsonb_build_array(jsonb_build_object('start','10:00','end','11:00'),jsonb_build_object('start','16:30','end','17:30'))),
    (settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'home',settings||jsonb_build_object(
    'home_working_days',jsonb_build_array(1,2,3,4,5,6,7),'home_visits',true,'home_radius_km',10,'home_fee_minor',10000,'home_slot_minutes',60,
    'home_time_blocks',jsonb_build_array(jsonb_build_object('start','12:30','end','13:30')),'home_travel_buffer_minutes',15),
    (settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  version_before:=(settings->>'row_version')::bigint;
  view:=public.get_portal_clinic_day(practice,day);
  IF jsonb_array_length(view->'doctor_timeline')<>6 OR jsonb_array_length(view->'clinic_time_blocks')<>3
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(view->'doctor_timeline') x WHERE x->>'service_mode'='home' AND x->>'travel_buffer_minutes'='15') THEN
    RAISE EXCEPTION 'Reception mixed calendar or travel buffer is missing'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(public.list_practice_service_slots(practice,'clinic',NULL,now(),10000)) x
    WHERE ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::date=day)<>8 THEN RAISE EXCEPTION 'Patient clinic availability does not match split blocks'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(view->'slots') x WHERE x->>'state'='open'
    AND ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::time>=time '10:00'
    AND ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::time<time '11:00') THEN RAISE EXCEPTION 'Online time remains available for clinic registration'; END IF;
  IF EXISTS(SELECT 1 FROM clinzo.session a JOIN clinzo.session b ON a.doctor_id=b.doctor_id AND a.id<b.id
    WHERE a.doctor_id=doctor_key AND a.state<>'cancelled' AND b.state<>'cancelled'
      AND a.starts_at<b.ends_at AND a.ends_at>b.starts_at) THEN RAISE EXCEPTION 'Doctor calendar contains overlapping sessions'; END IF;
  denied:=false;
  BEGIN PERFORM public.publish_doctor_schedule_from_date(practice,'clinic',settings||jsonb_build_object('clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','09:00','end','10:30'))),version_before,day);
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cross-mode overlap accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.publish_doctor_schedule_from_date(practice,'home',settings||jsonb_build_object('home_time_blocks',jsonb_build_array(jsonb_build_object('start','12:05','end','13:05'))),version_before,day);
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied OR (public.get_my_schedule_preferences(practice)->>'row_version')::bigint<>version_before THEN RAISE EXCEPTION 'Travel conflict accepted or failed edit mutated settings'; END IF;
  SELECT s.* INTO home_session FROM clinzo.session s WHERE s.doctor_id=doctor_key AND s.state='published' AND clinzo.service_mode_for_session(s.id)='home' AND (s.starts_at AT TIME ZONE zone)::date=day LIMIT 1;
  denied:=false;
  BEGIN INSERT INTO clinzo.session(doctor_facility_id,doctor_id,booking_day_id,starts_at,ends_at,timezone,hard_capacity,state)
    VALUES(practice,doctor_key,home_session.booking_day_id,(day+time '12:10') AT TIME ZONE zone,(day+time '12:25') AT TIME ZONE zone,zone,1,'published');
    EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Manual publisher bypassed home travel reservation'; END IF;
  SELECT x INTO slot FROM jsonb_array_elements(view->'slots') x WHERE x->>'state'='open' AND ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::time=time '09:00' LIMIT 1;
  original_window:=(slot->>'window_id')::uuid;
  INSERT INTO clinzo.patient(public_code,full_name) VALUES(gen_random_uuid()::text,'Mixed schedule verification') RETURNING id INTO patient;
  INSERT INTO clinzo.patient_access(patient_id,identity_id,relationship,verified_at) VALUES(patient,identity_id,'delegate',now());
  appointment_key:=public.book_clinic_appointment(patient,original_window,(slot->>'practice_service_id')::uuid,'Rollback verification',gen_random_uuid());
  denied:=false;
  BEGIN PERFORM public.publish_doctor_schedule_from_date(practice,'clinic',settings||jsonb_build_object('clinic_time_blocks',jsonb_build_array(jsonb_build_object('start','14:00','end','16:00'))),version_before,day);
    EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied OR NOT EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.id=appointment_key AND a.window_id=original_window AND a.capacity_released_at IS NULL) THEN RAISE EXCEPTION 'Existing reservation was moved or lost'; END IF;
  denied:=false;
  BEGIN PERFORM public.publish_doctor_schedule_from_date(practice,'clinic',settings,version_before-1,day); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale schedule version accepted'; END IF;
  -- A preview must not persist a preference edit or retire any rule. Confirmation
  -- trims only unused other-service availability and preserves the booked clinic slot.
  settings:=public.get_my_schedule_preferences(practice);
  preview_version:=(settings->>'row_version')::bigint;
  settings:=settings||jsonb_build_object('clinic_time_blocks',jsonb_build_array(
    jsonb_build_object('start','09:00','end','10:30'),
    jsonb_build_object('start','11:00','end','12:00'),
    jsonb_build_object('start','14:00','end','16:00')));
  EXECUTE 'SET LOCAL ROLE authenticated';
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings,preview_version,day);
  EXECUTE 'RESET ROLE';
  IF jsonb_array_length(plan->'conflicts')<>1 OR NOT (plan->>'can_replace')::boolean
    OR (public.get_my_schedule_preferences(practice)->>'row_version')::bigint<>preview_version
    OR plan->'conflicts'->0->'remaining'->0->>'start'<>'10:30' THEN
    RAISE EXCEPTION 'Overlap preview mutated state or reported incorrect remaining hours'; END IF;
  denied:=false;
  BEGIN PERFORM public.replace_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,'stale-token');
    EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unreviewed conflict replacement accepted'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.replace_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,plan->>'token');
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=appointment_key AND window_id=original_window AND capacity_released_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM clinzo.schedule_rule WHERE doctor_facility_id=practice AND service_mode='online'
      AND state='published' AND local_start=time '10:30' AND local_end=time '11:00') THEN
    RAISE EXCEPTION 'Conflict replacement lost a booking or unaffected availability'; END IF;
  SELECT x INTO notice FROM jsonb_array_elements(public.list_my_schedule_adjustments()) x
    WHERE x->>'practice_id'=practice::text AND x->>'mode'='online';
  IF notice IS NULL THEN RAISE EXCEPTION 'Persistent schedule review notice missing'; END IF;
  IF has_function_privilege('anon','public.replace_doctor_schedule_conflicts(uuid,text,jsonb,bigint,date,text)','EXECUTE')
    OR has_function_privilege('authenticated','clinzo.remaining_schedule_blocks(time,time,smallint[],integer,integer,smallint[],jsonb,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Schedule replacement/helper grants are too broad'; END IF;
  settings:=result->'settings';
  version_before:=(settings->>'row_version')::bigint;
  -- A fresh payment hold between preview and confirmation invalidates consent.
  settings:=public.save_my_schedule_preferences(practice,settings||jsonb_build_object('auto_accept',true,'auto_accept_limit',100),version_before);
  settings:=settings||jsonb_build_object('clinic_time_blocks',jsonb_build_array(
    jsonb_build_object('start','09:00','end','11:00'),
    jsonb_build_object('start','11:00','end','12:00'),
    jsonb_build_object('start','14:00','end','18:00')));
  preview_version:=(settings->>'row_version')::bigint;
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings,preview_version,day);
  IF NOT (plan->>'can_replace')::boolean OR jsonb_array_length(plan->'conflicts')<>2 THEN
    RAISE EXCEPTION 'Full replacement preview did not identify both online blocks'; END IF;
  SELECT x INTO slot FROM jsonb_array_elements(public.list_practice_service_slots(practice,'online',NULL,now(),10000)) x
    WHERE ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::date=day
      AND ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::time=time '10:30' LIMIT 1;
  IF slot IS NULL THEN RAISE EXCEPTION 'No preserved online time for payment-hold verification'; END IF;
  hold_key:=public.book_clinic_appointment(patient,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,'Rollback payment hold',gen_random_uuid());
  denied:=false;
  BEGIN PERFORM public.replace_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,plan->>'token');
    EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  IF NOT denied OR NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=hold_key AND status='pending'
      AND confirmation_payment_pending AND capacity_released_at IS NULL) THEN
    RAISE EXCEPTION 'Booking after preview did not invalidate replacement or payment hold was lost'; END IF;
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings,preview_version,day);
  IF (plan->>'can_replace')::boolean OR (plan->>'can_request')::boolean OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'conflicts') x WHERE (x->>'booked_count')::int>0) THEN
    RAISE EXCEPTION 'Active payment hold did not block automatic replacement'; END IF;
  denied:=false;
  BEGIN PERFORM public.replace_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,plan->>'token');
    EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Replacement accepted while affected reservation was active'; END IF;
  denied:=false;
  BEGIN PERFORM public.resolve_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,plan->>'token','pause','Clinic hours changed');
    EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Rescheduling-request path bypassed an active payment hold'; END IF;
  PERFORM public.transition_clinic_appointment(hold_key,(SELECT row_version FROM clinzo.appointment WHERE id=hold_key),'cancel','Rollback hold cleanup');
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings,preview_version,day);
  result:=public.replace_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,plan->>'token');
  IF EXISTS(SELECT 1 FROM clinzo.schedule_rule WHERE doctor_facility_id=practice AND service_mode='online' AND state='published')
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_my_schedule_adjustments()) x
      WHERE x->>'practice_id'=practice::text AND x->>'mode'='online' AND x->>'message' LIKE '%needs new hours%') THEN
    RAISE EXCEPTION 'Full removal did not preserve a needs-new-hours notice'; END IF;
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'online',settings||jsonb_build_object(
    'online_time_blocks',jsonb_build_array(jsonb_build_object('start','18:30','end','19:30'))),
    (settings->>'row_version')::bigint,day);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_my_schedule_adjustments()) x
      WHERE x->>'practice_id'=practice::text AND x->>'mode'='online') THEN
    RAISE EXCEPTION 'Publishing replacement online hours did not clear the review notice'; END IF;
  -- Explicit pause and patient consent: sending a reason must not free the time.
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'online',settings||jsonb_build_object('online_fee_minor',10000),
    (settings->>'row_version')::bigint,day);
  settings:=result->'settings';
  SELECT x INTO slot FROM jsonb_array_elements(public.list_practice_service_slots(practice,'online',NULL,now(),10000)) x
    WHERE ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::date=day
      AND ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::time=time '18:30' LIMIT 1;
  requested_window:=(slot->>'window_id')::uuid;
  hold_key:=public.book_clinic_appointment(patient,requested_window,(slot->>'practice_service_id')::uuid,'Schedule request fixture',gen_random_uuid());
  -- Synthetic provider commands exercise paid credit without any provider HTTP.
  billing:=public.get_appointment_billing(hold_key);
  billing:=public.prepare_appointment_payment(hold_key,billing->>'policy_version');
  payment_attempt:=(billing->>'id')::uuid;
  provider_order:='order_'||replace(payment_attempt::text,'-','');
  PERFORM public.appointment_provider_command('claim_order',jsonb_build_object('attempt_id',payment_attempt));
  PERFORM public.appointment_provider_command('order_ready',jsonb_build_object('attempt_id',payment_attempt,'entity',jsonb_build_object('id',provider_order,'amount',10000,'currency','INR','receipt',payment_attempt::text)));
  PERFORM public.appointment_provider_command('payment',jsonb_build_object('entity',jsonb_build_object('id','pay_'||replace(payment_attempt::text,'-',''),'order_id',provider_order,'amount',10000,'currency','INR','status','captured','captured',true)));
  charge_key:=(public.get_appointment_billing(hold_key)->>'charge_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=hold_key AND status='confirmed' AND NOT confirmation_payment_pending) THEN
    RAISE EXCEPTION 'Confirmed source booking missing for rescheduling request'; END IF;
  settings:=settings||jsonb_build_object('walkin_daily_limit',100,'clinic_app_daily_limit',100,'clinic_walkin_daily_limit',0,'clinic_time_blocks',(settings->'clinic_time_blocks')||jsonb_build_array(jsonb_build_object('start','18:30','end','19:00')));
  preview_version:=(settings->>'row_version')::bigint;
  plan:=public.preview_doctor_schedule_change(practice,'clinic',settings,preview_version,day);
  IF (plan->>'can_replace')::boolean OR NOT (plan->>'can_request')::boolean
    OR plan->'conflicts'->0->'bookings'->0->>'id'<>hold_key::text THEN RAISE EXCEPTION 'Booked conflict not presented for explicit patient request'; END IF;
  denied:=false;
  BEGIN PERFORM public.resolve_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,plan->>'token','pause',' ');
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Patient-facing reason was not required'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.resolve_doctor_schedule_conflicts(practice,'clinic',settings,preview_version,day,plan->>'token','pause','My clinic hours have changed. Please choose another time.');
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=hold_key AND window_id=requested_window AND status='confirmed'
    AND capacity_released_at IS NULL AND schedule_change_reason='My clinic hours have changed. Please choose another time.') THEN
    RAISE EXCEPTION 'Schedule request changed the patient reservation'; END IF;
  IF (public.get_appointment_billing(hold_key)->>'charge_id')::uuid IS DISTINCT FROM charge_key
    OR (public.get_appointment_billing(hold_key)->>'credit_minor')::bigint<>10000 THEN RAISE EXCEPTION 'Request changed paid credit'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clinzo.notification_intent WHERE template_key='appointment.reschedule_requested'
    AND safe_parameters->>'appointment_id'=hold_key::text AND safe_parameters->>'reason'='My clinic hours have changed. Please choose another time.') THEN
    RAISE EXCEPTION 'Patient reason notification missing'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_practice_service_slots(practice,'clinic',NULL,now(),10000)) x
    WHERE ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::date=day AND ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::time=time '18:30') THEN
    RAISE EXCEPTION 'Clinic slot opened before patient rescheduling'; END IF;
  IF EXISTS(SELECT 1 FROM clinzo.schedule_rule WHERE doctor_facility_id=practice AND service_mode='online' AND state='published') THEN
    RAISE EXCEPTION 'Pause retained affected online availability'; END IF;
  settings:=result->'settings';
  result:=public.publish_doctor_schedule_from_date(practice,'online',settings||jsonb_build_object('online_time_blocks',jsonb_build_array(jsonb_build_object('start','20:00','end','21:00'))),
    (settings->>'row_version')::bigint,day);
  settings:=public.set_appointment_recovery_policy(practice,(result->'settings'->>'row_version')::bigint,15,10080,0);
  SELECT u.id,i.id INTO patient_actor,patient_identity FROM clinzo.identity i JOIN auth.users u ON i.issuer='supabase' AND i.subject=u.id::text
    WHERE i.disabled_at IS NULL AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
      AND (u.banned_until IS NULL OR u.banned_until<now()) AND NOT clinzo.can_manage_practice(i.id,practice) LIMIT 1;
  IF patient_actor IS NULL THEN RAISE EXCEPTION 'Non-manager patient identity required for consent verification'; END IF;
  INSERT INTO clinzo.patient_access(patient_id,identity_id,relationship,verified_at) VALUES(patient,patient_identity,'delegate',now()) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub',patient_actor::text,true);
  SELECT x INTO slot FROM jsonb_array_elements(public.list_appointment_reschedule_options(hold_key)) x
    WHERE ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::date=day LIMIT 1;
  SELECT row_version INTO version_before FROM clinzo.appointment WHERE id=hold_key;
  EXECUTE 'SET LOCAL ROLE authenticated';
  view:=public.reschedule_appointment(hold_key,version_before,(slot->>'window_id')::uuid,'I accept the new time',gen_random_uuid());
  EXECUTE 'RESET ROLE';
  replacement_key:=(view->>'id')::uuid;
  SET CONSTRAINTS clinzo.refresh_resolved_schedule_change IMMEDIATE;
  SET CONSTRAINTS clinzo.refresh_resolved_schedule_change DEFERRED;
  IF view->>'kind'<>'rescheduled' OR NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=replacement_key AND replaces_appointment_id=hold_key AND reschedule_count=0) THEN
    RAISE EXCEPTION 'Doctor-requested move consumed patient allowance or needed another approval'; END IF;
  IF (public.get_appointment_billing(replacement_key)->>'charge_id')::uuid IS DISTINCT FROM charge_key
    OR (public.get_appointment_billing(replacement_key)->>'credit_minor')::bigint<>10000 THEN RAISE EXCEPTION 'Paid credit did not follow explicit cross-session rescheduling'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_practice_service_slots(practice,'clinic',NULL,now(),10000)) x
    WHERE ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::date=day AND ((x->>'starts_at')::timestamptz AT TIME ZONE zone)::time=time '18:30') THEN
    RAISE EXCEPTION 'Clinic slot did not reopen after explicit patient rescheduling'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_my_schedule_adjustments()) x WHERE x->>'practice_id'=practice::text AND x->>'message' LIKE 'Waiting for rescheduling.%') THEN
    RAISE EXCEPTION 'Resolved schedule retained a waiting notice'; END IF;
  -- A separate cancellation decision cannot be revived by a historical request.
  UPDATE clinzo.appointment SET schedule_change_reason='Fixture historical doctor request',schedule_change_requested_at=now() WHERE id=replacement_key;
  PERFORM set_config('request.jwt.claim.sub',patient_actor::text,true);
  PERFORM public.transition_clinic_appointment(replacement_key,(SELECT row_version FROM clinzo.appointment WHERE id=replacement_key),'cancel','I prefer cancellation');
  SELECT row_version INTO version_before FROM clinzo.appointment WHERE id=replacement_key;
  denied:=false;
  BEGIN PERFORM public.reschedule_appointment(replacement_key,version_before,(slot->>'window_id')::uuid,'Try to revive cancelled booking',gen_random_uuid());
    EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Historical request revived a cancelled appointment'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF has_function_privilege('anon','public.resolve_doctor_schedule_conflicts(uuid,text,jsonb,bigint,date,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','clinzo.refresh_resolved_schedule_change()','EXECUTE') THEN
    RAISE EXCEPTION 'Rescheduling request grants are too broad'; END IF;
  settings:=result->'settings';
  version_before:=(settings->>'row_version')::bigint;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);denied:=false;
  BEGIN PERFORM public.publish_doctor_schedule_from_date(practice,'clinic',settings,version_before,day); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unauthorized mixed schedule edit accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.preview_doctor_schedule_change(practice,'clinic',settings,version_before,day);
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unauthorized overlap preview accepted'; END IF;
  denied:=false;
  BEGIN PERFORM public.replace_doctor_schedule_conflicts(practice,'clinic',settings,version_before,day,plan->>'token');
    EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unauthorized overlap replacement accepted'; END IF;
END $$;
SELECT true AS multi_block_workflow_smoke_passed;
ROLLBACK;
