-- Push and in-app notifications for shift rotations: the doctor hears when a
-- facility approves or declines their rotation, or publishes one for them.
-- Delivery uses the existing notification_intent pipeline (send-notification).

CREATE FUNCTION clinzo.notify_shift_plan_change(p_plan_id uuid,p_event text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pl clinzo.shift_plan; recipient uuid; facility_name text; event_key uuid;
BEGIN
  IF p_event NOT IN ('approved','rejected','published') THEN RETURN; END IF;
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=p_plan_id;
  SELECT d.identity_id,f.name INTO recipient,facility_name FROM clinzo.doctor_facility p
    JOIN clinzo.doctor d ON d.id=p.doctor_id JOIN clinzo.facility f ON f.id=p.facility_id
    WHERE p.id=pl.doctor_facility_id;
  IF recipient IS NULL THEN RETURN; END IF;
  INSERT INTO clinzo.domain_event(event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,request_id,payload)
    VALUES('shift.plan_'||p_event,'shift_plan',pl.id,1,pl.decided_by,gen_random_uuid(),'{}')
    RETURNING id INTO event_key;
  INSERT INTO clinzo.notification_intent(recipient_id,event_id,template_key,dedup_key,safe_parameters,expires_at)
    VALUES(recipient,event_key,'shift.plan_'||p_event,'shift-plan:'||pl.id||':'||p_event,
      jsonb_build_object('plan_id',pl.id,'practice_id',pl.doctor_facility_id,'service_mode',pl.service_mode,
        'effective_from',pl.effective_from,'facility_name',facility_name,'reason',pl.decision_reason),
      now()+interval '30 days')
    ON CONFLICT(dedup_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION clinzo.notify_shift_plan_change(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.decide_shift_plan(p_plan_id uuid,p_approve boolean,p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity(); pl clinzo.shift_plan; created int:=0;
BEGIN
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=p_plan_id FOR UPDATE;
  IF pl.id IS NULL OR NOT coalesce(clinzo.can_manage_practice(actor,pl.doctor_facility_id),false)
    OR clinzo.schedule_change_needs_approval(actor,pl.doctor_facility_id) THEN
    RAISE EXCEPTION 'Facility approval access required' USING ERRCODE='42501'; END IF;
  IF pl.status<>'pending' THEN RAISE EXCEPTION 'This request was already decided' USING ERRCODE='PT409'; END IF;
  IF NOT coalesce(p_approve,false) THEN
    IF length(btrim(coalesce(p_reason,'')))<3 THEN RAISE EXCEPTION 'Give the doctor a reason' USING ERRCODE='22023'; END IF;
    UPDATE clinzo.shift_plan SET status='rejected',decided_by=actor,decided_at=now(),decision_reason=btrim(p_reason),
      updated_at=now(),row_version=row_version+1 WHERE id=pl.id;
    PERFORM clinzo.notify_shift_plan_change(pl.id,'rejected');
  ELSE
    UPDATE clinzo.shift_plan SET decided_by=actor,decided_at=now() WHERE id=pl.id;
    created:=clinzo.activate_shift_plan(pl.id,actor);
    PERFORM clinzo.notify_shift_plan_change(pl.id,'approved');
  END IF;
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=p_plan_id;
  RETURN jsonb_build_object('shifts_created',created,'plan',clinzo.shift_plan_json(pl));
END $$;

CREATE OR REPLACE FUNCTION public.submit_shift_plan(p_practice_id uuid,p_mode text,p_plan jsonb,p_effective_from date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity(); problem text; plan_id uuid; created int; pl clinzo.shift_plan;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('clinic','online','home') OR p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Invalid shift plan' USING ERRCODE='22023'; END IF;
  IF NOT coalesce(clinzo.can_edit_practice_schedule(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501'; END IF;
  problem:=clinzo.shift_plan_problem(p_mode,p_plan);
  IF problem IS NOT NULL THEN RAISE EXCEPTION '%',problem USING ERRCODE='22023'; END IF;
  UPDATE clinzo.shift_plan SET status='superseded',updated_at=now(),row_version=row_version+1
    WHERE doctor_facility_id=p_practice_id AND service_mode=p_mode AND status='pending';
  INSERT INTO clinzo.shift_plan(doctor_facility_id,service_mode,templates,cycle_start,cycle_weeks,rotation,overrides,
      effective_from,requested_by)
    VALUES(p_practice_id,p_mode,p_plan->'templates',coalesce((p_plan->>'cycle_start')::date,p_effective_from),
      (p_plan->>'cycle_weeks')::smallint,p_plan->'rotation',coalesce(p_plan->'overrides','[]'::jsonb),
      p_effective_from,actor) RETURNING id INTO plan_id;
  IF clinzo.schedule_change_needs_approval(actor,p_practice_id) THEN
    SELECT * INTO pl FROM clinzo.shift_plan WHERE id=plan_id;
    RETURN jsonb_build_object('status','pending','plan',clinzo.shift_plan_json(pl));
  END IF;
  created:=clinzo.activate_shift_plan(plan_id,actor);
  -- Facility staff published it for the doctor: tell the doctor.
  IF actor IS DISTINCT FROM (SELECT d.identity_id FROM clinzo.doctor_facility p
      JOIN clinzo.doctor d ON d.id=p.doctor_id WHERE p.id=p_practice_id) THEN
    PERFORM clinzo.notify_shift_plan_change(plan_id,'published');
  END IF;
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=plan_id;
  RETURN jsonb_build_object('status','active','shifts_created',created,'plan',clinzo.shift_plan_json(pl));
END $$;
