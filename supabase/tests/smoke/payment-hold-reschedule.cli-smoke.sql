-- Requires security_booking_and_video_boundaries on an explicitly approved test database.
-- Synthetic Auth/domain fixtures only; no provider calls; every change rolls back.
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='2s';
DO $probe$
DECLARE doctor_auth uuid:=gen_random_uuid(); patient_auth uuid:=gen_random_uuid();
 doctor_profile jsonb; patient_profile jsonb; doctor_key uuid; practice_key uuid; patient_key uuid;
 session_key uuid; service_key uuid; window_one uuid; window_two uuid; original uuid;
 start_at timestamptz:=(date_trunc('week',now() AT TIME ZONE 'UTC')+interval '7 days 10 hours') AT TIME ZONE 'UTC';
 prepared jsonb; moved jsonb; before_row jsonb; manager_denied boolean:=false;
 original_deadline timestamptz; result jsonb; actor_version bigint; patient_denied boolean:=false; staff_denied boolean:=false; ordinary uuid; move_key uuid:=gen_random_uuid(); replay jsonb;
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,phone,phone_confirmed_at) VALUES
 (doctor_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+919'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now()),
 (patient_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+918'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now());
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
 doctor_profile:=public.complete_onboarding('solo_doctor',jsonb_build_object('full_name','Audit Validation Doctor','registration_authority','Fixture Council','registration_number',doctor_auth::text,'practice_started_on','2020-01-01','clinic_name','Audit Validation Clinic','address','123 Synthetic Street','latitude',12.9,'longitude',77.5));
 practice_key:=(public.list_my_practices()->0->>'practice_id')::uuid;
 doctor_key:=(doctor_profile->'doctor'->>'id')::uuid;
 EXECUTE 'RESET ROLE';
 PERFORM clinzo.record_manual_credential_review('doctor',doctor_key,'verified','audit-dummy-reviewer','audit-synthetic-evidence');
 UPDATE clinzo.doctor SET booking_timezone='UTC' WHERE id=doctor_key;
 UPDATE clinzo.facility SET verification_status='verified' WHERE id=(SELECT facility_id FROM clinzo.doctor_facility WHERE id=practice_key);
 EXECUTE 'SET LOCAL ROLE authenticated';
 session_key:=public.publish_clinic_session(practice_key,start_at,start_at+interval '1 hour',15,50000,'INR');
 EXECUTE 'RESET ROLE';
 INSERT INTO clinzo.doctor_schedule_preferences(doctor_facility_id,working_days,clinic_start,clinic_end,slot_minutes,online_daily_limit,walkin_daily_limit,auto_accept,auto_accept_limit,home_visits,clinic_fee_minor,clinic_app_daily_limit,clinic_walkin_daily_limit,max_self_reschedules)
 VALUES(practice_key,ARRAY[1,2,3,4,5]::smallint[],'09:00','17:00',15,10,10,true,10,false,50000,10,0,1)
 ON CONFLICT(doctor_facility_id) DO UPDATE SET auto_accept=true,auto_accept_limit=10,walkin_daily_limit=10,clinic_app_daily_limit=10,clinic_walkin_daily_limit=0,max_self_reschedules=1;
 UPDATE clinzo.appointment_billing_config SET enabled=true,mode='test' WHERE singleton;
 SELECT ss.practice_service_id INTO service_key FROM clinzo.session_service ss WHERE ss.session_id=session_key;
 SELECT id INTO window_one FROM clinzo.appointment_window WHERE session_id=session_key ORDER BY starts_at LIMIT 1;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',patient_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',patient_auth,'role','authenticated')::text,true);
 patient_profile:=public.complete_onboarding('patient','{"full_name":"Audit Validation Patient"}'::jsonb);
 patient_key:=(patient_profile->>'patient_id')::uuid;
 prepared:=public.prepare_appointment_booking(patient_key,window_one,service_key,'Audit unpaid reservation',gen_random_uuid(),'online');
 original:=(prepared->>'appointment_id')::uuid;
 EXECUTE 'RESET ROLE';
 SELECT jsonb_build_object('status',a.status,'payment_pending',a.confirmation_payment_pending,'method',a.booking_payment_method,'expires_seconds',extract(epoch FROM a.request_expires_at-now())::integer,'has_charge',EXISTS(SELECT 1 FROM clinzo.appointment_charge c WHERE c.appointment_id=a.id)) INTO before_row FROM clinzo.appointment a WHERE a.id=original;
 IF before_row->>'payment_pending'<>'true' THEN RAISE EXCEPTION 'Fixture failed to create unpaid hold'; END IF;
 SELECT request_expires_at INTO original_deadline FROM clinzo.appointment WHERE id=original;
 SELECT row_version INTO actor_version FROM clinzo.appointment WHERE id=original;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
 BEGIN
  PERFORM public.transition_clinic_appointment(original,actor_version,'approve',NULL);
 EXCEPTION WHEN invalid_parameter_value THEN manager_denied:=true;
 END;
 PERFORM set_config('request.jwt.claim.sub',patient_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',patient_auth,'role','authenticated')::text,true);
 SELECT (x->>'window_id')::uuid INTO window_two FROM jsonb_array_elements(public.list_appointment_reschedule_options(original)) x WHERE (x->>'window_id')::uuid<>window_one ORDER BY x->>'starts_at' LIMIT 1;
 IF window_two IS NULL THEN RAISE EXCEPTION 'No fixture reschedule target'; END IF;
 EXECUTE 'RESET ROLE';
 SELECT request_expires_at INTO original_deadline FROM clinzo.appointment WHERE id=original;
 SELECT row_version INTO actor_version FROM clinzo.appointment WHERE id=original;
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  PERFORM public.reschedule_appointment(original,actor_version,window_two,'Audit move before payment',gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'Complete or cancel the payment reservation before rescheduling' THEN RAISE; END IF;
  patient_denied:=true;
 END;
 PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
 BEGIN
  PERFORM public.reschedule_appointment(original,actor_version,window_two,'Audit staff move before payment',gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'Complete or cancel the payment reservation before rescheduling' THEN RAISE; END IF;
  staff_denied:=true;
 END;
 EXECUTE 'RESET ROLE';
 IF NOT patient_denied OR NOT staff_denied OR NOT manager_denied THEN RAISE EXCEPTION 'Unpaid reservation boundary failed'; END IF;
 IF EXISTS(SELECT 1 FROM clinzo.appointment WHERE replaces_appointment_id=original)
   OR NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=original AND confirmation_payment_pending AND status='pending' AND row_version=actor_version
     AND request_expires_at=original_deadline) THEN
  RAISE EXCEPTION 'Denied move changed the original reservation';
 END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',patient_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',patient_auth,'role','authenticated')::text,true);
 PERFORM public.transition_clinic_appointment(original,actor_version,'cancel','End synthetic reservation');
 EXECUTE 'RESET ROLE';
 -- An ordinary approval-required request is still movable, including exact
 -- idempotent replay with the original (now stale) row version.
 UPDATE clinzo.doctor_schedule_preferences SET auto_accept=false,max_self_reschedules=3 WHERE doctor_facility_id=practice_key;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',patient_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',patient_auth,'role','authenticated')::text,true);
 prepared:=public.prepare_appointment_booking(patient_key,window_two,service_key,'Audit approval request',gen_random_uuid(),'online');
 ordinary:=(prepared->>'appointment_id')::uuid;
 SELECT (x->>'window_id')::uuid INTO window_two FROM jsonb_array_elements(public.list_appointment_reschedule_options(ordinary)) x
   WHERE (x->>'window_id')::uuid<>window_one ORDER BY x->>'starts_at' LIMIT 1;
 IF window_two IS NULL THEN RAISE EXCEPTION 'No ordinary request target'; END IF;
 EXECUTE 'RESET ROLE';
 SELECT row_version INTO actor_version FROM clinzo.appointment WHERE id=ordinary AND NOT confirmation_payment_pending AND status='pending';
 IF actor_version IS NULL THEN RAISE EXCEPTION 'Approval request fixture is not ordinary'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 moved:=public.reschedule_appointment(ordinary,actor_version,window_two,'Audit ordinary request move',move_key);
 replay:=public.reschedule_appointment(ordinary,actor_version,window_two,'Audit ordinary request move',move_key);
 IF moved->>'kind'<>'rescheduled' OR replay IS DISTINCT FROM moved THEN RAISE EXCEPTION 'Ordinary request move/replay failed'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM clinzo.appointment WHERE replaces_appointment_id=ordinary)<>1 THEN RAISE EXCEPTION 'Replay duplicated replacement'; END IF;
 result:=jsonb_build_object('payment_hold_reschedule_ok',true,'patient_hold_move_denied',patient_denied,'staff_hold_move_denied',staff_denied,'ordinary_request_move_and_replay',true,'provider_calls',0);
 PERFORM set_config('audit.validation_result',result::text,true);
END $probe$;
SELECT current_setting('audit.validation_result')::jsonb AS result;
ROLLBACK;