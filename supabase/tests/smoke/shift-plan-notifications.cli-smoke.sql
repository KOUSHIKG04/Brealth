-- Runs inside a rollback transaction. Needs a verified practice without future
-- clinic bookings and a facility manager for it. Verifies the doctor is
-- notified when a rotation is declined and when one is approved.
BEGIN;

DO $$
DECLARE practice uuid; manager text; doctor_identity uuid; zone text; start_day date; plan jsonb;
  declined uuid; approved uuid;
BEGIN
  SELECT p.id,d.identity_id,coalesce(nullif(d.booking_timezone,''),'Asia/Kolkata')
    INTO practice,doctor_identity,zone
  FROM clinzo.doctor_facility p JOIN clinzo.doctor d ON d.id=p.doctor_id
    JOIN clinzo.facility f ON f.id=p.facility_id JOIN clinzo.organization o ON o.id=f.organization_id
  WHERE p.active AND d.active AND d.credential_status='verified' AND f.active AND f.verification_status='verified'
    AND o.active AND d.identity_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM clinzo.session s JOIN clinzo.appointment a ON a.session_id=s.id
      WHERE s.doctor_facility_id=p.id AND s.starts_at>now() AND clinzo.service_mode_for_session(s.id)='clinic'
        AND a.status IN ('pending','confirmed','in_consultation'))
    AND EXISTS(SELECT 1 FROM clinzo.identity i WHERE i.disabled_at IS NULL AND i.id<>d.identity_id
      AND coalesce(clinzo.can_manage_practice(i.id,p.id),false))
  ORDER BY p.id LIMIT 1;
  IF practice IS NULL THEN RAISE EXCEPTION 'Needs a practice with a facility manager and no future clinic bookings'; END IF;
  SELECT i.subject INTO manager FROM clinzo.identity i WHERE i.disabled_at IS NULL AND i.id<>doctor_identity
    AND coalesce(clinzo.can_manage_practice(i.id,practice),false)
    AND NOT clinzo.schedule_change_needs_approval(i.id,practice) LIMIT 1;
  start_day:=(now() AT TIME ZONE zone)::date+1;
  plan:=jsonb_build_object('templates',jsonb_build_array(jsonb_build_object('key','day','name','Day shift',
      'start','09:00','duration_minutes',240,'slot_minutes',30,'fee_minor',0,'app_limit',4,'walkin_limit',4)),
    'cycle_weeks',1,'rotation',jsonb_build_array(jsonb_build_array('day','day','day','day','day',null,null)));
  -- Two doctor requests (inserted directly, as a doctor at a hospital would submit them).
  INSERT INTO clinzo.shift_plan(doctor_facility_id,service_mode,templates,cycle_start,cycle_weeks,rotation,effective_from,requested_by)
    VALUES(practice,'clinic',plan->'templates',start_day,1,plan->'rotation',start_day,doctor_identity) RETURNING id INTO declined;
  PERFORM set_config('request.jwt.claim.sub',manager,true);
  PERFORM public.decide_shift_plan(declined,false,'Cover the night roster first');
  INSERT INTO clinzo.shift_plan(doctor_facility_id,service_mode,templates,cycle_start,cycle_weeks,rotation,effective_from,requested_by)
    VALUES(practice,'clinic',plan->'templates',start_day,1,plan->'rotation',start_day,doctor_identity) RETURNING id INTO approved;
  PERFORM public.decide_shift_plan(approved,true,NULL);
  IF NOT EXISTS(SELECT 1 FROM clinzo.notification_intent WHERE recipient_id=doctor_identity
      AND template_key='shift.plan_rejected' AND safe_parameters->>'plan_id'=declined::text
      AND safe_parameters->>'reason'='Cover the night roster first' AND safe_parameters->>'service_mode'='clinic') THEN
    RAISE EXCEPTION 'The doctor was not notified of the declined rotation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clinzo.notification_intent WHERE recipient_id=doctor_identity
      AND template_key='shift.plan_approved' AND safe_parameters->>'plan_id'=approved::text) THEN
    RAISE EXCEPTION 'The doctor was not notified of the approved rotation'; END IF;
END $$;
SELECT true AS shift_plan_notifications_smoke_passed;
ROLLBACK;
