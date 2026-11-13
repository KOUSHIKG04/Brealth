-- Requires security_booking_and_video_boundaries on an explicitly approved test database.
-- No JWT signing/media requests; synthetic Auth/domain rows are rolled back.
BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='2s';
DO $probe$
DECLARE doctor_auth uuid:=gen_random_uuid(); patient_auth uuid:=gen_random_uuid();
 doctor_profile jsonb; patient_profile jsonb; doctor_key uuid; doctor_identity uuid; practice_key uuid; patient_key uuid;
 session_key uuid; service_key uuid; window_key uuid; appointment_key uuid; org_key uuid;
 start_at timestamptz:=date_trunc('minute',now())+interval '10 minutes';
 prepared jsonb; normal_context jsonb; patient_context jsonb; denied boolean; candidate_status text;
 result jsonb;
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,phone,phone_confirmed_at) VALUES
 (doctor_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+919'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now()),
 (patient_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+918'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now());
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
 doctor_profile:=public.complete_onboarding('solo_doctor',jsonb_build_object('full_name','Audit Video Doctor','registration_authority','Fixture Council','registration_number',doctor_auth::text,'practice_started_on','2020-01-01','clinic_name','Audit Video Clinic','address','123 Synthetic Street','latitude',12.9,'longitude',77.5));
 practice_key:=(public.list_my_practices()->0->>'practice_id')::uuid;
 doctor_key:=(doctor_profile->'doctor'->>'id')::uuid;
 EXECUTE 'RESET ROLE';
 SELECT identity_id INTO doctor_identity FROM clinzo.doctor WHERE id=doctor_key;
 PERFORM clinzo.record_manual_credential_review('doctor',doctor_key,'verified','audit-dummy-reviewer','audit-synthetic-evidence');
 UPDATE clinzo.doctor SET booking_timezone=CASE WHEN extract(hour FROM start_at AT TIME ZONE 'UTC')>=23 THEN 'Asia/Kolkata' ELSE 'UTC' END WHERE id=doctor_key;
 UPDATE clinzo.facility SET verification_status='verified' WHERE id=(SELECT facility_id FROM clinzo.doctor_facility WHERE id=practice_key);
 SELECT f.organization_id INTO org_key FROM clinzo.facility f JOIN clinzo.doctor_facility df ON df.facility_id=f.id WHERE df.id=practice_key;
 INSERT INTO clinzo.doctor_schedule_preferences(doctor_facility_id,working_days,clinic_start,clinic_end,slot_minutes,online_daily_limit,walkin_daily_limit,auto_accept,auto_accept_limit,home_visits,clinic_fee_minor,online_fee_minor,clinic_app_daily_limit,clinic_walkin_daily_limit)
 VALUES(practice_key,ARRAY[1,2,3,4,5]::smallint[],'09:00','17:00',15,10,10,true,10,false,0,0,10,0)
 ON CONFLICT(doctor_facility_id) DO UPDATE SET online_daily_limit=10,auto_accept=true,auto_accept_limit=10;
 EXECUTE 'SET LOCAL ROLE authenticated';
 session_key:=public.publish_online_session(practice_key,start_at,start_at+interval '30 minutes',15,0,'INR');
 EXECUTE 'RESET ROLE';
 SELECT ss.practice_service_id INTO service_key FROM clinzo.session_service ss WHERE ss.session_id=session_key;
 SELECT id INTO window_key FROM clinzo.appointment_window WHERE session_id=session_key ORDER BY starts_at LIMIT 1;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',patient_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',patient_auth,'role','authenticated')::text,true);
 patient_profile:=public.complete_onboarding('patient','{"full_name":"Audit Video Patient"}'::jsonb);
 patient_key:=(patient_profile->>'patient_id')::uuid;
 prepared:=public.prepare_appointment_booking(patient_key,window_key,service_key,'Audit free online visit',gen_random_uuid(),'online');
 appointment_key:=(prepared->>'appointment_id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
 normal_context:=public.get_online_join_context(appointment_key);
 EXECUTE 'RESET ROLE';
 IF normal_context->>'role' IS DISTINCT FROM 'doctor' OR normal_context->>'room_name' IS NULL THEN RAISE EXCEPTION 'Verified doctor lost join access'; END IF;
 IF NOT EXISTS(SELECT 1 FROM clinzo.organization_member WHERE identity_id=doctor_identity AND organization_id=org_key AND active) THEN
  RAISE EXCEPTION 'Fixture lacks surviving facility membership';
 END IF;
 FOREACH candidate_status IN ARRAY ARRAY['pending','suspended'] LOOP
  UPDATE clinzo.doctor SET credential_status=candidate_status WHERE id=doctor_key;
  EXECUTE 'SET LOCAL ROLE authenticated';
  denied:=false;
  BEGIN
   PERFORM public.get_online_join_context(appointment_key);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Clinician status % still received doctor context',candidate_status; END IF;
  -- Patient access remains governed by the patient branch, not clinical status.
  PERFORM set_config('request.jwt.claim.sub',patient_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',patient_auth,'role','authenticated')::text,true);
  patient_context:=public.get_online_join_context(appointment_key);
  IF patient_context->>'role' IS DISTINCT FROM 'patient' THEN RAISE EXCEPTION 'Patient branch regressed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',doctor_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',doctor_auth,'role','authenticated')::text,true);
  EXECUTE 'RESET ROLE';
 END LOOP;
 UPDATE clinzo.doctor SET credential_status='verified',active=false WHERE id=doctor_key;
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN
  PERFORM public.get_online_join_context(appointment_key);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Inactive clinician received doctor context'; END IF;
 EXECUTE 'RESET ROLE';
 UPDATE clinzo.doctor SET active=true WHERE id=doctor_key;
 EXECUTE 'SET LOCAL ROLE authenticated';
 normal_context:=public.get_online_join_context(appointment_key);
 IF normal_context->>'role' IS DISTINCT FROM 'doctor' THEN RAISE EXCEPTION 'Restored verified doctor lost join access'; END IF;
 EXECUTE 'RESET ROLE';
 result:=jsonb_build_object('online_join_credentials_ok',true,'pending_denied',true,'suspended_denied',true,'inactive_denied',true,'patient_branch_preserved',true,'verified_doctor_allowed',true,'media_provider_calls',0);
 PERFORM set_config('audit.validation_result',result::text,true);
END $probe$;
SELECT current_setting('audit.validation_result')::jsonb AS result;
ROLLBACK;