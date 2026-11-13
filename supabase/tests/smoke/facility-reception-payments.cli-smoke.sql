-- Synthetic order/capture records only. All fixture writes are rolled back.
BEGIN;
DO $$
DECLARE practice uuid; staff_auth uuid; staff_identity uuid; outsider_auth uuid; slot jsonb; booking_key uuid;
  details jsonb; prepared jsonb; retried jsonb; history jsonb; next_page jsonb; denied boolean; order_key text; payment_key text;
  policy jsonb; booking_input jsonb; cash_booking jsonb; cash_id uuid;
BEGIN
  SELECT p.id,i.id,i.subject::uuid INTO practice,staff_identity,staff_auth
  FROM clinzo.doctor_facility p JOIN clinzo.identity i ON i.issuer='supabase' AND i.disabled_at IS NULL
  WHERE coalesce(clinzo.can_manage_appointment_practice_money(i.id,p.id),false)
    AND EXISTS(SELECT 1 FROM clinzo.session s JOIN clinzo.appointment_window w ON w.session_id=s.id
      WHERE s.doctor_facility_id=p.id AND clinzo.service_mode_for_session(s.id)='clinic'
        AND w.starts_at>now()+interval '1 day' AND w.state='open' AND s.state IN ('published','open')) LIMIT 1;
  IF practice IS NULL THEN RAISE EXCEPTION 'No authorized reception fixture'; END IF;
  SELECT i.subject::uuid INTO outsider_auth FROM clinzo.identity i JOIN auth.users u ON u.id::text=i.subject AND i.issuer='supabase'
    WHERE i.disabled_at IS NULL AND NOT coalesce(clinzo.can_manage_practice(i.id,practice),false)
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL) LIMIT 1;
  IF outsider_auth IS NULL THEN RAISE EXCEPTION 'No outsider fixture'; END IF;
  PERFORM set_config('request.jwt.claim.sub',staff_auth::text,true);
  UPDATE clinzo.appointment_billing_config SET enabled=true,mode='test' WHERE singleton;
  SELECT x INTO slot FROM jsonb_array_elements(public.list_practice_service_slots(practice,'clinic',NULL,now()+interval '1 day',10000)) x LIMIT 1;
  IF slot IS NULL THEN RAISE EXCEPTION 'No reception slot'; END IF;
  UPDATE clinzo.practice_service SET fee_minor=50000 WHERE id=(slot->>'practice_service_id')::uuid;
  booking_key:=public.book_portal_walk_in_appointment(practice,(slot->>'window_id')::uuid,(slot->>'practice_service_id')::uuid,
    'Reception payment rollback fixture',NULL,'Payment fixture',gen_random_uuid(),30,'Other',false);
  IF EXISTS(SELECT 1 FROM clinzo.patient_access WHERE patient_id=(SELECT patient_id FROM clinzo.appointment WHERE id=booking_key) AND identity_id=staff_identity) THEN
    RAISE EXCEPTION 'Fixture accidentally grants patient access'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=booking_key AND status='pending' AND confirmation_payment_pending AND confirmed_at IS NULL)
    OR EXISTS(SELECT 1 FROM clinzo.queue_entry WHERE appointment_id=booking_key) THEN
    RAISE EXCEPTION 'Reception confirmed or queued a patient before payment'; END IF;
  details:=public.get_appointment_billing(booking_key);
  IF details->>'can_pay'<>'true' OR details->>'due_minor'<>'50000' THEN RAISE EXCEPTION 'Authorized reception cannot collect'; END IF;
  denied:=false;BEGIN PERFORM public.prepare_appointment_payment(booking_key,'stale-policy');EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale payment terms accepted'; END IF;
  prepared:=public.prepare_appointment_payment(booking_key,details->>'policy_version');
  retried:=public.prepare_appointment_payment(booking_key,details->>'policy_version');
  IF prepared->>'id'<>retried->>'id' THEN RAISE EXCEPTION 'Reception retry duplicated the payment attempt'; END IF;
  order_key:='order_'||replace(prepared->>'id','-',''); payment_key:='pay_'||replace(prepared->>'id','-','');
  PERFORM public.appointment_provider_command('order_ready',jsonb_build_object('attempt_id',prepared->>'id','entity',jsonb_build_object('id',order_key,'receipt',prepared->>'id','amount',50000,'currency','INR')));
  PERFORM public.appointment_provider_command('payment',jsonb_build_object('mode','test','entity',jsonb_build_object('id',payment_key,'order_id',order_key,'amount',50000,'currency','INR','status','authorized','captured',false)));
  IF public.get_appointment_billing(booking_key)->>'due_minor'<>'50000' THEN RAISE EXCEPTION 'Authorization counted as received money'; END IF;
  IF EXISTS(SELECT 1 FROM clinzo.queue_entry WHERE appointment_id=booking_key) THEN RAISE EXCEPTION 'Authorization created a queue entry'; END IF;
  PERFORM public.appointment_provider_command('payment',jsonb_build_object('mode','test','entity',jsonb_build_object('id',payment_key,'order_id',order_key,'amount',50000,'currency','INR','status','captured','captured',true)));
  details:=public.get_appointment_billing(booking_key);
  IF details->>'due_minor'<>'0' OR details->>'captured_minor'<>'50000' OR details->>'can_pay'<>'false' THEN RAISE EXCEPTION 'Capture did not settle reception balance'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clinzo.appointment WHERE id=booking_key AND status='confirmed' AND NOT confirmation_payment_pending)
    OR (SELECT count(*) FROM clinzo.queue_entry WHERE appointment_id=booking_key)<>1 THEN
    RAISE EXCEPTION 'Capture did not confirm exactly one queued appointment'; END IF;
  IF details->>'policy_text' LIKE '%0.000000%' THEN RAISE EXCEPTION 'Payment terms contain an unformatted percentage'; END IF;
  IF public.get_portal_appointment_payment_summaries(ARRAY[booking_key])->0->>'due_minor'<>'0' THEN RAISE EXCEPTION 'Appointment payment label is stale'; END IF;
  INSERT INTO clinzo.appointment_payment_attempt(charge_id,amount_minor,status,created_at)
    SELECT (prepared->>'charge_id')::uuid,50000,'failed',now()+interval '1 second' FROM generate_series(1,52);
  history:=public.list_portal_appointment_transactions();
  IF jsonb_array_length(history->'items')<>50 OR history->'next_cursor'='null'::jsonb THEN RAISE EXCEPTION 'Missing transaction pagination'; END IF;
  next_page:=public.list_portal_appointment_transactions((history->'next_cursor'->>'created_at')::timestamptz,(history->'next_cursor'->>'id')::uuid);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(history->'items') a JOIN jsonb_array_elements(next_page->'items') b ON a->>'id'=b->>'id') THEN RAISE EXCEPTION 'Transaction cursor repeats records'; END IF;
  policy:=public.get_portal_walk_in_payment_policy(practice);
  IF policy->>'policy_text' LIKE '%0.000000%' THEN RAISE EXCEPTION 'Reservation terms contain an unformatted percentage'; END IF;
  SELECT x INTO slot FROM jsonb_array_elements(public.list_practice_service_slots(practice,'clinic',NULL,now()+interval '1 day',10000)) x LIMIT 1;
  IF slot IS NULL THEN RAISE EXCEPTION 'No remaining reception cash fixture slot'; END IF;
  booking_input:=jsonb_build_object('practiceId',practice,'windowId',slot->>'window_id','practiceServiceId',slot->>'practice_service_id',
    'patientName','Cash payment rollback fixture','patientAge',30,'patientGender','Other','patientPhone','',
    'reason','Payment fixture','idempotencyKey',gen_random_uuid(),'paymentMethod','cash','cashReceived',false,
    'termsAccepted',true,'policyVersion',policy->>'policy_version','checkIn',false);
  denied:=false;BEGIN PERFORM public.prepare_portal_walk_in_booking(booking_input);EXCEPTION WHEN invalid_parameter_value THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Cash booking did not require a receipt acknowledgement'; END IF;
  denied:=false;BEGIN PERFORM public.prepare_portal_walk_in_booking(booking_input||'{"cashReceived":true,"termsAccepted":false}'::jsonb);EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Cash booking accepted missing consent'; END IF;
  booking_input:=booking_input||'{"cashReceived":true}'::jsonb;
  cash_booking:=public.prepare_portal_walk_in_booking(booking_input);
  cash_id:=(cash_booking->>'appointment_id')::uuid;
  IF cash_booking->>'status'<>'confirmed' OR cash_booking->>'requires_payment'<>'false'
    OR public.get_appointment_billing(cash_id)->>'due_minor'<>'0'
    OR (SELECT count(*) FROM clinzo.queue_entry WHERE appointment_id=cash_id)<>1 THEN
    RAISE EXCEPTION 'Cash receipt and confirmation were not atomic'; END IF;
  IF public.prepare_portal_walk_in_booking(booking_input)->>'appointment_id'<>cash_id::text
    OR (SELECT count(*) FROM clinzo.appointment_payment_attempt WHERE charge_id=clinzo.appointment_charge_id(cash_id))<>1 THEN
    RAISE EXCEPTION 'Cash booking retry duplicated its receipt'; END IF;
  PERFORM set_config('request.jwt.claim.sub',outsider_auth::text,true);
  denied:=false;BEGIN PERFORM public.prepare_appointment_payment(booking_key,details->>'policy_version');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Unrelated actor could start reception checkout'; END IF;
  IF public.get_portal_appointment_payment_summaries(ARRAY[booking_key])<>'[]'::jsonb THEN RAISE EXCEPTION 'Financial summary leaked to outsider'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_portal_appointment_transactions()->'items') x WHERE x->>'appointment_id'=booking_key::text) THEN RAISE EXCEPTION 'Foreign transaction leaked'; END IF;
  IF has_function_privilege('anon','public.list_portal_appointment_transactions(timestamptz,uuid)','EXECUTE')
    OR has_function_privilege('anon','public.get_portal_appointment_payment_summaries(uuid[])','EXECUTE') THEN RAISE EXCEPTION 'Anonymous financial access'; END IF;
END $$;
SELECT true AS facility_reception_payments_passed;
ROLLBACK;
