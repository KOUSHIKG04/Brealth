-- Reception reserves capacity first; only captured money creates a paid booking
-- and its queue entry. Keep both legacy UUID signatures safe for old clients.
DO $migration$
DECLARE definition text; target regprocedure; marker text;
BEGIN
  FOR target IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='book_portal_walk_in_appointment'
  LOOP
    definition:=pg_get_functiondef(target);
    marker:='  INSERT INTO clinzo.patient(';
    IF position(marker IN definition)=0 OR position('''reception_walk_in'',''confirmed'',actor,now()' IN definition)=0 THEN
      RAISE EXCEPTION 'Unexpected reception booking owner: %',target;
    END IF;
    definition:=replace(definition,marker,
      '  IF ps.fee_minor>0 AND (ps.currency<>''INR'' OR ps.fee_minor<100 OR NOT EXISTS(
        SELECT 1 FROM clinzo.appointment_billing_config WHERE singleton AND enabled)) THEN
        RAISE EXCEPTION ''Payment collection is unavailable for this fee. Contact the facility administrator.'' USING ERRCODE=''22023'';
      END IF;
'||marker);
    definition:=replace(definition,'reason,visit_mode)',
      'reason,visit_mode,confirmation_payment_pending,booking_payment_method,request_expires_at)');
    definition:=replace(definition,'''reception_walk_in'',''confirmed'',actor,now(),ps.fee_minor,ps.currency,',
      '''reception_walk_in'',CASE WHEN ps.fee_minor>0 THEN ''pending'' ELSE ''confirmed'' END,
      actor,CASE WHEN ps.fee_minor=0 THEN now() END,ps.fee_minor,ps.currency,');
    definition:=replace(definition,'nullif(btrim(p_reason),''''),''clinic'') RETURNING id INTO appointment_id;',
      'nullif(btrim(p_reason),''''),''clinic'',ps.fee_minor>0,''online'',least(w.ends_at,now()+interval ''10 minutes'')) RETURNING id INTO appointment_id;');
    definition:=replace(definition,'  INSERT INTO clinzo.session_queue(session_id) VALUES(s.id)',
      '  IF ps.fee_minor=0 THEN
  INSERT INTO clinzo.session_queue(session_id) VALUES(s.id)');
    definition:=replace(definition,'  INSERT INTO clinzo.idempotency_record(principal_scope,operation,key,request_hash,',
      '  END IF;
  INSERT INTO clinzo.idempotency_record(principal_scope,operation,key,request_hash,');
    definition:=replace(definition,'PERFORM clinzo.appointment_event(appointment_id,actor,''staff_booked'');',
      'PERFORM clinzo.appointment_event(appointment_id,actor,CASE WHEN ps.fee_minor>0 THEN ''payment_reserved'' ELSE ''staff_booked'' END);');
    definition:=replace(definition,'IF coalesce(p_check_in,false) THEN','IF coalesce(p_check_in,false) AND ps.fee_minor=0 THEN');
    EXECUTE definition;
  END LOOP;

  definition:=pg_get_functiondef('public.record_appointment_cash(uuid,bigint,text)'::regprocedure);
  marker:='a.status<>''confirmed''';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cash receipt owner'; END IF;
  definition:=replace(definition,marker,
    '(a.status<>''confirmed'' AND NOT(a.status=''pending'' AND a.confirmation_payment_pending AND a.request_expires_at>now()))');
  definition:=replace(definition,'Cash can only be recorded for a confirmed clinic booking',
    'Cash can only be recorded for an active clinic booking or payment reservation');
  EXECUTE definition;

  -- Preserve accepted policy wording, with a human-readable percentage.
  definition:=pg_get_functiondef('clinzo.appointment_billing_details(uuid,uuid)'::regprocedure);
  definition:=replace(definition,'coalesce(c.deduction_bps,cfg.deduction_bps)::numeric/100',
    'trim_scale(coalesce(c.deduction_bps,cfg.deduction_bps)::numeric/100)');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.get_appointment_booking_options(uuid,uuid)'::regprocedure);
  definition:=replace(definition,'cfg.deduction_bps::numeric/100','trim_scale(cfg.deduction_bps::numeric/100)');
  EXECUTE definition;
END
$migration$;

CREATE FUNCTION public.get_portal_walk_in_payment_policy(p_practice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); cfg clinzo.appointment_billing_config;
BEGIN
  IF NOT coalesce(clinzo.can_manage_practice(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO cfg FROM clinzo.appointment_billing_config WHERE singleton;
  RETURN jsonb_build_object('enabled',cfg.enabled,'mode',cfg.mode,'policy_version',cfg.policy_version,
    'can_collect',coalesce(clinzo.can_manage_appointment_practice_money(actor,p_practice_id),false),
    'policy_text',format('Paid credit follows a rescheduled booking. Higher fees require an additional payment; unused credit can be refunded. Cancellation refunds require clinic review. The accepted deduction is %s%%; doctor unavailability has no deduction. Refunds return to the original payment method.',trim_scale(cfg.deduction_bps::numeric/100)));
END $$;

CREATE FUNCTION public.prepare_portal_walk_in_booking(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); policy jsonb; booking_id uuid; a clinzo.appointment; billing jsonb;
  payment_method text:=p_input->>'paymentMethod'; fee bigint;
BEGIN
  policy:=public.get_portal_walk_in_payment_policy((p_input->>'practiceId')::uuid);
  SELECT fee_minor INTO fee FROM clinzo.practice_service WHERE id=(p_input->>'practiceServiceId')::uuid;
  IF payment_method IS NULL OR payment_method NOT IN ('gateway','cash') THEN
    RAISE EXCEPTION 'Choose Razorpay or cash received' USING ERRCODE='22023';
  END IF;
  IF fee>0 AND ((p_input->>'termsAccepted')::boolean IS DISTINCT FROM true
    OR p_input->>'policyVersion' IS DISTINCT FROM policy->>'policy_version') THEN
    RAISE EXCEPTION 'Review the latest payment terms before booking' USING ERRCODE='PT409';
  END IF;
  IF fee>0 AND NOT (policy->>'can_collect')::boolean THEN
    RAISE EXCEPTION 'Financial collection access required' USING ERRCODE='42501';
  END IF;
  IF fee>0 AND payment_method='cash' AND (p_input->>'cashReceived')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirm the cash has been received before booking' USING ERRCODE='22023';
  END IF;
  booking_id:=public.book_portal_walk_in_appointment((p_input->>'practiceId')::uuid,(p_input->>'windowId')::uuid,
    (p_input->>'practiceServiceId')::uuid,p_input->>'patientName',nullif(p_input->>'patientPhone',''),
    nullif(p_input->>'reason',''),(p_input->>'idempotencyKey')::uuid,(p_input->>'patientAge')::integer,
    nullif(p_input->>'patientGender',''),false);
  SELECT * INTO a FROM clinzo.appointment WHERE id=booking_id;
  IF a.confirmation_payment_pending AND (a.status<>'pending' OR a.request_expires_at<=now()) THEN
    RAISE EXCEPTION 'Payment reservation expired. Choose another time.' USING ERRCODE='PT409';
  END IF;
  IF payment_method='cash' AND a.confirmation_payment_pending THEN
    billing:=clinzo.appointment_billing_details(booking_id,actor);
    PERFORM public.record_appointment_cash(booking_id,(billing->>'due_minor')::bigint,'Cash received at reception; patient accepted payment terms.');
  END IF;
  SELECT * INTO a FROM clinzo.appointment WHERE id=booking_id;
  IF a.status='confirmed' AND coalesce((p_input->>'checkIn')::boolean,false)
    AND NOT EXISTS(SELECT 1 FROM clinzo.queue_entry WHERE appointment_id=booking_id AND state<>'awaiting_arrival') THEN
    PERFORM public.transition_clinic_appointment(booking_id,a.row_version,'check_in',NULL);
  END IF;
  RETURN jsonb_build_object('appointment_id',a.id,'status',a.status,
    'requires_payment',a.confirmation_payment_pending AND a.status='pending',
    'reservation_expires_at',CASE WHEN a.confirmation_payment_pending THEN a.request_expires_at END);
END $$;

REVOKE ALL ON FUNCTION public.get_portal_walk_in_payment_policy(uuid),public.prepare_portal_walk_in_booking(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_portal_walk_in_payment_policy(uuid),public.prepare_portal_walk_in_booking(jsonb) TO authenticated;
