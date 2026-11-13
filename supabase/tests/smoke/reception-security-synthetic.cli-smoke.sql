-- Fully synthetic reception authorization/payment regression; no provider calls.
-- All public user operations run as authenticated; privileged setup is explicit.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
DO $probe$
DECLARE
 staff_auth uuid:=gen_random_uuid(); outsider_auth uuid:=gen_random_uuid();
 profile jsonb; practice uuid; doctor_key uuid; session_key uuid; service_key uuid;
 window_one uuid; window_two uuid; booking_key uuid; cash_id uuid;
 start_at timestamptz:=(date_trunc('week',now() AT TIME ZONE 'UTC')+interval '7 days 10 hours') AT TIME ZONE 'UTC';
 policy jsonb; booking_input jsonb; booking jsonb; prepared jsonb; retried jsonb;
 details jsonb; history jsonb; next_page jsonb; denied boolean;
 order_key text; payment_key text; result jsonb;
BEGIN
 INSERT INTO auth.users(id,instance_id,aud,role,phone,phone_confirmed_at) VALUES
 (staff_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+919'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now()),
 (outsider_auth,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','+918'||lpad(floor(random()*1000000000)::bigint::text,9,'0'),now());
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',staff_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_auth,'role','authenticated')::text,true);
 profile:=public.complete_onboarding('solo_doctor',jsonb_build_object('full_name','Audit Reception Security Doctor','registration_authority','Fixture Council','registration_number',staff_auth::text,'practice_started_on','2020-01-01','clinic_name','Audit Reception Security Clinic','address','123 Synthetic Street','latitude',12.9,'longitude',77.5));
 practice:=(public.list_my_practices()->0->>'practice_id')::uuid;
 doctor_key:=(profile->'doctor'->>'id')::uuid;
 EXECUTE 'RESET ROLE';
 PERFORM clinzo.record_manual_credential_review('doctor',doctor_key,'verified','audit-dummy-reviewer','audit-synthetic-evidence');
 UPDATE clinzo.doctor SET booking_timezone='UTC' WHERE id=doctor_key;
 UPDATE clinzo.facility SET verification_status='verified' WHERE id=(SELECT facility_id FROM clinzo.doctor_facility WHERE id=practice);
 INSERT INTO clinzo.doctor_schedule_preferences(doctor_facility_id,working_days,clinic_start,clinic_end,slot_minutes,online_daily_limit,walkin_daily_limit,auto_accept,auto_accept_limit,home_visits,clinic_fee_minor,clinic_app_daily_limit,clinic_walkin_daily_limit)
 VALUES(practice,ARRAY[1,2,3,4,5]::smallint[],'09:00','17:00',15,10,10,true,10,false,50000,0,10)
 ON CONFLICT(doctor_facility_id) DO UPDATE SET walkin_daily_limit=10,clinic_app_daily_limit=0,clinic_walkin_daily_limit=10;
 -- Singleton changes below are transaction-local and roll back with the fixtures.
 UPDATE clinzo.appointment_billing_config SET enabled=true,mode='test' WHERE singleton;
 EXECUTE 'SET LOCAL ROLE authenticated';
 session_key:=public.publish_clinic_session(practice,start_at,start_at+interval '1 hour',15,50000,'INR');
 PERFORM set_config('request.jwt.claim.sub',outsider_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider_auth,'role','authenticated')::text,true);
 PERFORM public.complete_onboarding('patient','{"full_name":"Audit Reception Security Outsider"}'::jsonb);
 EXECUTE 'RESET ROLE';
 SELECT ss.practice_service_id INTO service_key FROM clinzo.session_service ss WHERE ss.session_id=session_key;
 SELECT id INTO window_one FROM clinzo.appointment_window WHERE session_id=session_key ORDER BY starts_at LIMIT 1;
 SELECT id INTO window_two FROM clinzo.appointment_window WHERE session_id=session_key ORDER BY starts_at OFFSET 1 LIMIT 1;
 IF window_one IS NULL OR window_two IS NULL THEN RAISE EXCEPTION 'Missing synthetic reception windows'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',staff_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_auth,'role','authenticated')::text,true);
 policy:=public.get_portal_walk_in_payment_policy(practice);
 booking_input:=jsonb_build_object('practiceId',practice,'windowId',window_one,'practiceServiceId',service_key,
   'patientName','Audit Reception Security Walk-in','patientPhone','','patientAge',30,'patientGender','Other',
   'reason','Synthetic security check','idempotencyKey',gen_random_uuid(),'paymentMethod','gateway',
   'cashReceived',false,'termsAccepted',true,'policyVersion',policy->>'policy_version','checkIn',false);
 booking:=public.prepare_portal_walk_in_booking(booking_input);
 booking_key:=(booking->>'appointment_id')::uuid;
 details:=public.get_appointment_billing(booking_key);
 IF booking->>'requires_payment' IS DISTINCT FROM 'true' OR details->>'can_pay' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Synthetic paid walk-in did not reserve payable capacity'; END IF;
 denied:=false;
 BEGIN PERFORM public.prepare_appointment_payment(booking_key,'stale-policy');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale policy accepted'; END IF;
 prepared:=public.prepare_appointment_payment(booking_key,details->>'policy_version');
 retried:=public.prepare_appointment_payment(booking_key,details->>'policy_version');
 IF prepared->>'id' IS DISTINCT FROM retried->>'id' THEN RAISE EXCEPTION 'Checkout retry duplicated attempt'; END IF;
 -- Public user roles must never reach the provider mutation command.
 IF has_function_privilege('authenticated','public.appointment_provider_command(text,jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.list_portal_appointment_transactions(timestamptz,uuid)','EXECUTE')
   OR has_function_privilege('anon','public.get_portal_appointment_payment_summaries(uuid[])','EXECUTE') THEN
   RAISE EXCEPTION 'Unexpected financial function grant'; END IF;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=booking_key AND status='pending' AND confirmation_payment_pending AND confirmed_at IS NULL)
   OR EXISTS(SELECT 1 FROM clinzo.queue_entry WHERE appointment_id=booking_key) THEN
   RAISE EXCEPTION 'Unpaid hold became confirmed or queued'; END IF;
 -- Trusted synthetic provider setup only. No HTTP request or external payment.
 order_key:='order_'||replace(prepared->>'id','-','');
 payment_key:='pay_'||replace(prepared->>'id','-','');
 denied:=false;
 BEGIN PERFORM public.appointment_provider_command('order_ready',jsonb_build_object('attempt_id',prepared->>'id','entity',jsonb_build_object('id',order_key,'receipt',prepared->>'id','amount',1,'currency','INR')));
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Mismatched provider order amount accepted'; END IF;
 PERFORM public.appointment_provider_command('order_ready',jsonb_build_object('attempt_id',prepared->>'id','entity',jsonb_build_object('id',order_key,'receipt',prepared->>'id','amount',50000,'currency','INR')));
 PERFORM public.appointment_provider_command('payment',jsonb_build_object('mode','test','entity',jsonb_build_object('id',payment_key,'order_id',order_key,'amount',50000,'currency','INR','status','authorized','captured',false)));
 EXECUTE 'SET LOCAL ROLE authenticated';
 details:=public.get_appointment_billing(booking_key);
 IF details->>'due_minor' IS DISTINCT FROM '50000' THEN RAISE EXCEPTION 'Authorization counted as received money'; END IF;
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM clinzo.queue_entry WHERE appointment_id=booking_key) THEN RAISE EXCEPTION 'Authorization created a queue entry'; END IF;
 PERFORM public.appointment_provider_command('payment',jsonb_build_object('mode','test','entity',jsonb_build_object('id',payment_key,'order_id',order_key,'amount',50000,'currency','INR','status','captured','captured',true)));
 EXECUTE 'SET LOCAL ROLE authenticated';
 details:=public.get_appointment_billing(booking_key);
 IF details->>'due_minor' IS DISTINCT FROM '0' OR details->>'captured_minor' IS DISTINCT FROM '50000' THEN RAISE EXCEPTION 'Capture failed to settle balance'; END IF;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=booking_key AND status='confirmed' AND NOT confirmation_payment_pending)
   OR (SELECT count(*) FROM clinzo.queue_entry WHERE appointment_id=booking_key)<>1 THEN
   RAISE EXCEPTION 'Capture did not confirm exactly one queue entry'; END IF;
 INSERT INTO clinzo.appointment_payment_attempt(charge_id,amount_minor,status,created_at)
   SELECT (prepared->>'charge_id')::uuid,50000,'failed',now()+interval '1 second' FROM generate_series(1,52);
 EXECUTE 'SET LOCAL ROLE authenticated';
 history:=public.list_portal_appointment_transactions();
 IF jsonb_array_length(history->'items')<>50 OR history->'next_cursor'='null'::jsonb THEN RAISE EXCEPTION 'Missing stable transaction page'; END IF;
 next_page:=public.list_portal_appointment_transactions((history->'next_cursor'->>'created_at')::timestamptz,(history->'next_cursor'->>'id')::uuid);
 IF jsonb_array_length(next_page->'items')<>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(history->'items') a JOIN jsonb_array_elements(next_page->'items') b ON a->>'id'=b->>'id') THEN
   RAISE EXCEPTION 'Transaction cursor skipped or repeated same-timestamp records'; END IF;
 denied:=false;
 BEGIN PERFORM public.list_portal_appointment_transactions(now(),NULL);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Partial cursor accepted'; END IF;
 -- Atomic cash confirmation, consent and idempotent receipt on another own window.
 booking_input:=booking_input||jsonb_build_object('windowId',window_two,'idempotencyKey',gen_random_uuid(),'paymentMethod','cash');
 denied:=false;
 BEGIN PERFORM public.prepare_portal_walk_in_booking(booking_input);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Cash acknowledgement omitted'; END IF;
 denied:=false;
 BEGIN PERFORM public.prepare_portal_walk_in_booking(booking_input||'{"cashReceived":true,"termsAccepted":false}'::jsonb);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Cash consent omitted'; END IF;
 booking_input:=booking_input||'{"cashReceived":true}'::jsonb;
 booking:=public.prepare_portal_walk_in_booking(booking_input);
 cash_id:=(booking->>'appointment_id')::uuid;
 IF booking->>'status' IS DISTINCT FROM 'confirmed' OR booking->>'requires_payment' IS DISTINCT FROM 'false'
   OR public.prepare_portal_walk_in_booking(booking_input)->>'appointment_id' IS DISTINCT FROM cash_id::text THEN
   RAISE EXCEPTION 'Cash confirmation/replay failed'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM clinzo.appointment_payment_attempt WHERE charge_id=clinzo.appointment_charge_id(cash_id))<>1
   OR (SELECT count(*) FROM clinzo.queue_entry WHERE appointment_id=cash_id)<>1 THEN RAISE EXCEPTION 'Cash retry duplicated receipt or queue'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',outsider_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider_auth,'role','authenticated')::text,true);
 denied:=false;
 BEGIN PERFORM public.prepare_appointment_payment(booking_key,policy->>'policy_version');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Outsider could start checkout'; END IF;
 IF public.get_portal_appointment_payment_summaries(ARRAY[booking_key,cash_id])<>'[]'::jsonb
   OR public.list_portal_appointment_transactions()->'items'<>'[]'::jsonb
   OR public.list_portal_appointment_transactions((history->'next_cursor'->>'created_at')::timestamptz,(history->'next_cursor'->>'id')::uuid)->'items'<>'[]'::jsonb THEN
   RAISE EXCEPTION 'Outsider read financial data or reused a foreign cursor'; END IF;
 denied:=false;
 BEGIN PERFORM public.prepare_portal_walk_in_booking(booking_input);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Outsider could replay another staff booking'; END IF;
 EXECUTE 'RESET ROLE';
 result:=jsonb_build_object('reception_security_synthetic_ok',true,'authenticated_public_rpcs',true,
   'unrelated_actor_denied',true,'attempt_reused',true,'capture_required',true,'cash_atomic_idempotent',true,
   'same_timestamp_cursor_stable',true,'partial_cursor_denied',true,'provider_amount_mismatch_denied',true,'provider_calls',0);
 PERFORM set_config('audit.validation_result',result::text,true);
END $probe$;
SELECT current_setting('audit.validation_result')::jsonb AS result;
ROLLBACK;
