-- Doctor-requested rescheduling preserves reservations and paid credit.
ALTER TABLE clinzo.appointment
  ADD COLUMN schedule_change_reason text CHECK(schedule_change_reason IS NULL OR length(btrim(schedule_change_reason)) BETWEEN 2 AND 1000),
  ADD COLUMN schedule_change_requested_at timestamptz,
  ADD CONSTRAINT appointment_schedule_change_pair CHECK((schedule_change_reason IS NULL)=(schedule_change_requested_at IS NULL));

-- A cancelled historical session must not reserve its start time forever.
-- Live sessions still have both a unique start and the doctor overlap exclusion.
DROP INDEX clinzo.session_uq_1;
CREATE UNIQUE INDEX session_uq_1 ON clinzo.session(doctor_facility_id,starts_at) WHERE state<>'cancelled';

CREATE OR REPLACE FUNCTION public.preview_doctor_schedule_change(
  p_practice_id uuid,p_mode text,p_settings jsonb,p_expected_version bigint,p_effective_from date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); d clinzo.doctor;
  prefs clinzo.doctor_schedule_preferences; r record; days smallint[]; blocks jsonb;
  buffer integer; daily_limit integer; local_day date; count_booked integer; remaining jsonb;
  bookings jsonb; can_request boolean; conflicts jsonb:='[]'; reason text; editable boolean; result jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('clinic','online','home') THEN
    RAISE EXCEPTION 'Choose a service' USING ERRCODE='22023'; END IF;
  IF NOT coalesce(clinzo.can_edit_practice_schedule(actor,p_practice_id),false)
    OR NOT coalesce(clinzo.can_manage_practice(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Verified practice access required' USING ERRCODE='42501'; END IF;
  SELECT d0.* INTO d FROM clinzo.doctor d0 JOIN clinzo.doctor_facility p ON p.doctor_id=d0.id
    JOIN clinzo.facility f ON f.id=p.facility_id JOIN clinzo.organization o ON o.id=f.organization_id
    WHERE p.id=p_practice_id AND p.active AND d0.active AND d0.credential_status='verified'
      AND f.active AND f.verification_status='verified' AND o.active FOR UPDATE OF d0;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Verified practice access required' USING ERRCODE='42501'; END IF;
  local_day:=coalesce(p_effective_from,(now() AT TIME ZONE d.booking_timezone)::date);
  IF local_day<(now() AT TIME ZONE d.booking_timezone)::date OR local_day>(now() AT TIME ZONE d.booking_timezone)::date+365 THEN
    RAISE EXCEPTION 'Schedule changes must start today or a later date within one year' USING ERRCODE='22023'; END IF;
  -- Reuse canonical validation/version checking without persisting a preview.
  -- PL/pgSQL variables survive this deliberate subtransaction rollback.
  BEGIN
    PERFORM public.save_my_schedule_preferences(p_practice_id,p_settings,p_expected_version);
    SELECT * INTO STRICT prefs FROM clinzo.doctor_schedule_preferences WHERE doctor_facility_id=p_practice_id;
    RAISE EXCEPTION 'preview rollback' USING ERRCODE='PZ001';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL; END;
  days:=CASE p_mode WHEN 'online' THEN prefs.online_working_days WHEN 'home' THEN prefs.home_working_days ELSE prefs.working_days END;
  blocks:=CASE p_mode WHEN 'online' THEN prefs.online_time_blocks WHEN 'home' THEN prefs.home_time_blocks ELSE prefs.clinic_time_blocks END;
  buffer:=CASE WHEN p_mode='home' THEN prefs.home_travel_buffer_minutes ELSE 0 END;
  daily_limit:=CASE p_mode WHEN 'online' THEN prefs.online_daily_limit WHEN 'home' THEN CASE WHEN prefs.home_visits THEN 100 ELSE 0 END ELSE prefs.walkin_daily_limit END;
  PERFORM s.id FROM clinzo.session s WHERE s.doctor_id=d.id AND s.ends_at>now()
    AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day AND extract(isodow FROM s.starts_at AT TIME ZONE d.booking_timezone)::int=ANY(days) ORDER BY s.id FOR UPDATE OF s;
  IF daily_limit>0 THEN
    FOR r IN SELECT r0.* FROM clinzo.schedule_rule r0 JOIN clinzo.doctor_facility p ON p.id=r0.doctor_facility_id
      WHERE p.doctor_id=d.id AND (r0.state='published' OR (r0.state='retired' AND r0.automatic AND r0.effective_until IS NOT NULL))
        AND (r0.effective_until IS NULL OR r0.effective_until>=local_day)
        AND NOT(r0.doctor_facility_id=p_practice_id AND r0.service_mode=p_mode)
        AND r0.iso_weekdays && days AND EXISTS(SELECT 1 FROM jsonb_array_elements(blocks) b
          WHERE extract(epoch FROM r0.local_start)/60-r0.travel_buffer_minutes<extract(epoch FROM (b->>'end')::time)/60+buffer
            AND extract(epoch FROM r0.local_end)/60+r0.travel_buffer_minutes>extract(epoch FROM (b->>'start')::time)/60-buffer)
      ORDER BY r0.doctor_facility_id,r0.service_mode,r0.id FOR UPDATE OF r0 LOOP
      SELECT count(*) INTO count_booked FROM clinzo.appointment a JOIN clinzo.session s ON s.id=a.session_id
        WHERE s.schedule_rule_id=r.id AND s.ends_at>now() AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day AND extract(isodow FROM s.starts_at AT TIME ZONE d.booking_timezone)::int=ANY(days)
          AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now()));
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'booking_code',a.public_code,
        'patient_name',pa.full_name,'starts_at',w.starts_at,'ends_at',w.ends_at,'timezone',s.timezone,
        'status',a.status,'payment_hold',a.confirmation_payment_pending,'row_version',a.row_version::text)
        ORDER BY w.starts_at,a.id),'[]'::jsonb) INTO bookings
        FROM clinzo.appointment a JOIN clinzo.patient pa ON pa.id=a.patient_id
        JOIN clinzo.session s ON s.id=a.session_id JOIN clinzo.appointment_window w ON w.id=a.window_id
        WHERE s.schedule_rule_id=r.id AND s.ends_at>now() AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day AND extract(isodow FROM s.starts_at AT TIME ZONE d.booking_timezone)::int=ANY(days)
          AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now()));
      editable:=coalesce(clinzo.can_edit_practice_schedule(actor,r.doctor_facility_id),false)
        AND coalesce(clinzo.can_manage_practice(actor,r.doctor_facility_id),false);
      reason:=CASE
        WHEN NOT editable THEN 'This schedule belongs to another practice. Ask its authorized manager to change it.'
        WHEN NOT r.automatic THEN 'This is a manually published schedule. Edit it separately.'
        WHEN r.timezone<>d.booking_timezone THEN 'This schedule uses a different timezone. Edit it separately.'
        WHEN count_booked>0 THEN 'This schedule has active bookings or payment holds. Review those appointments or choose a later start date.'
        WHEN EXISTS(SELECT 1 FROM clinzo.session s WHERE s.schedule_rule_id=r.id AND s.state<>'cancelled'
          AND s.starts_at<=now() AND s.ends_at>now() AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day AND extract(isodow FROM s.starts_at AT TIME ZONE d.booking_timezone)::int=ANY(days))
          THEN 'This session has already started. Choose a later start date.'
        ELSE NULL END;
      can_request:=editable AND r.automatic AND r.timezone=d.booking_timezone
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bookings) a
          WHERE (a->>'payment_hold')::boolean OR a->>'status' NOT IN ('pending','confirmed'))
        AND NOT EXISTS(SELECT 1 FROM clinzo.session s WHERE s.schedule_rule_id=r.id AND s.state<>'cancelled'
          AND s.starts_at<=now() AND s.ends_at>now() AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day AND extract(isodow FROM s.starts_at AT TIME ZONE d.booking_timezone)::int=ANY(days));
      -- Patient details are returned only to a manager of the affected practice.
      IF NOT editable THEN bookings:='[]'::jsonb; END IF;
      remaining:=clinzo.remaining_schedule_blocks(r.local_start,r.local_end,r.iso_weekdays,r.window_minutes,
        r.travel_buffer_minutes,days,blocks,buffer);
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('rule_id',r.id,'practice_id',r.doctor_facility_id,
        'facility_name',(SELECT f.name FROM clinzo.facility f JOIN clinzo.doctor_facility p ON p.facility_id=f.id WHERE p.id=r.doctor_facility_id),'mode',r.service_mode,'days',r.iso_weekdays,'start',to_char(r.local_start,'HH24:MI'),
        'end',CASE WHEN r.local_end=time '24:00' THEN '24:00' ELSE to_char(r.local_end,'HH24:MI') END,
        'travel_buffer_minutes',r.travel_buffer_minutes,'effective_from',greatest(local_day,r.effective_from),
        'effective_until',r.effective_until,'remaining',remaining,'booked_count',count_booked,
        'replaceable',reason IS NULL,'reason',reason,'bookings',bookings,'can_request',can_request,
        'paused_remaining',CASE WHEN EXISTS(SELECT 1 FROM unnest(r.iso_weekdays) day WHERE day<>ALL(days))
          THEN jsonb_build_array(jsonb_build_object('days',(SELECT jsonb_agg(day ORDER BY day) FROM unnest(r.iso_weekdays) day WHERE day<>ALL(days)),
            'start',to_char(r.local_start,'HH24:MI'),'end',CASE WHEN r.local_end=time '24:00' THEN '24:00' ELSE to_char(r.local_end,'HH24:MI') END)) ELSE '[]'::jsonb END));
    END LOOP;
  END IF;
  result:=jsonb_build_object('effective_from',local_day,'target_days',to_jsonb(days),'conflicts',conflicts,
    'can_request',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(conflicts) c WHERE NOT (c->>'can_request')::boolean),'can_replace',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(conflicts) c WHERE NOT (c->>'replaceable')::boolean));
  RETURN result||jsonb_build_object('token',md5(result::text||p_settings::text||p_expected_version::text));
END $$;

CREATE FUNCTION public.resolve_doctor_schedule_conflicts(
  p_practice_id uuid,p_mode text,p_settings jsonb,p_expected_version bigint,p_effective_from date,p_preview_token text,p_strategy text,p_patient_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); plan jsonb; conflict jsonb; piece jsonb; r clinzo.schedule_rule;
  request_row clinzo.appointment; event_key uuid; local_day date; rule_id uuid; result jsonb; current_version bigint; changed_practice uuid; changed_mode text;
BEGIN
  plan:=public.preview_doctor_schedule_change(p_practice_id,p_mode,p_settings,p_expected_version,p_effective_from);
  IF p_preview_token IS NULL OR p_preview_token IS DISTINCT FROM plan->>'token' THEN
    RAISE EXCEPTION 'Schedule changed. Review the conflicts again before replacing availability.' USING ERRCODE='PT409'; END IF;
  IF p_strategy IS NULL OR p_strategy NOT IN ('trim','pause') THEN RAISE EXCEPTION 'Choose how to adjust availability' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'conflicts') c WHERE (c->>'booked_count')::int>0)
    AND length(btrim(coalesce(p_patient_reason,''))) NOT BETWEEN 2 AND 1000 THEN
    RAISE EXCEPTION 'Enter the reason patients will receive (2–1000 characters)' USING ERRCODE='22023'; END IF;
  IF NOT (plan->>'can_request')::boolean OR jsonb_array_length(plan->'conflicts')=0 THEN
    RAISE EXCEPTION 'These conflicts cannot be replaced. Review the affected schedule or choose another time.' USING ERRCODE='23514'; END IF;
  local_day:=(plan->>'effective_from')::date;
  -- The preview holds doctor, session and rule locks. Only unused availability is withdrawn.
  FOR conflict IN SELECT value FROM jsonb_array_elements(plan->'conflicts') LOOP
    SELECT * INTO STRICT r FROM clinzo.schedule_rule WHERE id=(conflict->>'rule_id')::uuid;
    FOR request_row IN SELECT a0.* FROM clinzo.appointment a0 JOIN clinzo.session s ON s.id=a0.session_id
      WHERE s.schedule_rule_id=r.id AND s.ends_at>now() AND (s.starts_at AT TIME ZONE r.timezone)::date>=local_day
        AND extract(isodow FROM s.starts_at AT TIME ZONE r.timezone)::int IN (SELECT value::int FROM jsonb_array_elements_text(plan->'target_days'))
        AND ((a0.confirmed_at IS NOT NULL AND a0.capacity_released_at IS NULL) OR (a0.status='pending' AND a0.request_expires_at>now()))
      ORDER BY a0.id FOR UPDATE OF a0 LOOP
      IF request_row.schedule_change_requested_at IS NULL THEN
        UPDATE clinzo.appointment SET schedule_change_reason=btrim(p_patient_reason),schedule_change_requested_at=now() WHERE id=request_row.id;
        INSERT INTO clinzo.domain_event(event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,request_id,payload)
          VALUES('appointment.reschedule_requested','appointment',request_row.id,(SELECT row_version FROM clinzo.appointment WHERE id=request_row.id),actor,gen_random_uuid(),'{}') RETURNING id INTO event_key;
        INSERT INTO clinzo.notification_intent(recipient_id,event_id,template_key,dedup_key,safe_parameters,expires_at)
          SELECT pa.identity_id,event_key,'appointment.reschedule_requested','schedule-change:'||request_row.id||':'||pa.identity_id,
            jsonb_build_object('appointment_id',request_row.id,'booking_code',request_row.public_code,'reason',btrim(p_patient_reason)),now()+interval '30 days'
          FROM clinzo.patient_access pa WHERE pa.patient_id=request_row.patient_id AND pa.verified_at IS NOT NULL AND pa.revoked_at IS NULL
          ON CONFLICT(dedup_key) DO NOTHING;
        PERFORM clinzo.emit_appointment_change(request_row.id);
      END IF;
    END LOOP;
    UPDATE clinzo.appointment_window w SET state='blocked' FROM clinzo.session s
      WHERE w.session_id=s.id AND s.schedule_rule_id=r.id AND s.starts_at>now()
        AND (s.starts_at AT TIME ZONE r.timezone)::date>=local_day
        AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.window_id=w.id
          AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now())));
    UPDATE clinzo.session SET state='cancelled' WHERE schedule_rule_id=r.id AND starts_at>now()
      AND (starts_at AT TIME ZONE r.timezone)::date>=local_day
      AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.session_id=clinzo.session.id
        AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now())));
    UPDATE clinzo.schedule_rule SET state='retired',effective_until=
      CASE WHEN effective_from<local_day THEN local_day-1 ELSE NULL END WHERE id=r.id;
  END LOOP;
  -- Preserve nonconflicting weekdays and time fragments, including their original end date.
  FOR conflict IN SELECT value FROM jsonb_array_elements(plan->'conflicts') LOOP
    SELECT * INTO STRICT r FROM clinzo.schedule_rule WHERE id=(conflict->>'rule_id')::uuid;
    FOR piece IN SELECT value FROM jsonb_array_elements(CASE WHEN p_strategy='pause' THEN conflict->'paused_remaining' ELSE conflict->'remaining' END) LOOP
      INSERT INTO clinzo.schedule_rule(doctor_facility_id,version,family_id,effective_from,effective_until,iso_weekdays,
        local_start,local_end,window_minutes,window_capacity,session_capacity,auto_confirm_limit,timezone,state,
        service_mode,fee_minor,automatic,travel_buffer_minutes)
      VALUES(r.doctor_facility_id,1,gen_random_uuid(),(conflict->>'effective_from')::date,
        (conflict->>'effective_until')::date,ARRAY(SELECT value::smallint FROM jsonb_array_elements_text(piece->'days')),
        (piece->>'start')::time,(piece->>'end')::time,r.window_minutes,r.window_capacity,r.session_capacity,
        r.auto_confirm_limit,r.timezone,'published',r.service_mode,r.fee_minor,true,r.travel_buffer_minutes);
    END LOOP;
  END LOOP;
  FOR changed_practice,changed_mode IN SELECT DISTINCT (c->>'practice_id')::uuid,c->>'mode'
    FROM jsonb_array_elements(plan->'conflicts') c LOOP
    UPDATE clinzo.doctor_schedule_preferences SET schedule_adjustments=
      coalesce((SELECT jsonb_agg(n) FROM jsonb_array_elements(schedule_adjustments) n WHERE n->>'mode'<>changed_mode),'[]'::jsonb)
      ||jsonb_build_array(jsonb_build_object('mode',changed_mode,'effective_from',local_day,
        'message',CASE WHEN EXISTS(SELECT 1 FROM clinzo.schedule_rule WHERE doctor_facility_id=changed_practice
            AND service_mode=changed_mode AND state='published' AND automatic AND (effective_until IS NULL OR effective_until>=local_day))
          THEN 'Availability changed to make room for another service. Review the remaining hours before saving this schedule.'
          ELSE 'This service needs new hours. Set its schedule to offer appointments again.' END))
      WHERE doctor_facility_id=changed_practice;
    INSERT INTO clinzo.audit_log(actor_id,actor_kind,action,resource_type,resource_id,facility_id,request_id,outcome,metadata)
      SELECT actor,'identity','schedule.overlap_replaced','doctor_facility',p.id,p.facility_id,gen_random_uuid(),'allowed',
        jsonb_build_object('service_mode',changed_mode,'effective_from',local_day,'replacement_practice',p_practice_id,'replacement_mode',p_mode)
        FROM clinzo.doctor_facility p WHERE p.id=changed_practice;
  END LOOP;
  SELECT row_version INTO current_version FROM clinzo.doctor_schedule_preferences WHERE doctor_facility_id=p_practice_id;
  result:=public.publish_doctor_schedule_from_date(p_practice_id,p_mode,p_settings,coalesce(current_version,0),p_effective_from);
  FOR rule_id IN SELECT r0.id FROM clinzo.schedule_rule r0 WHERE r0.state='published' AND r0.automatic
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'conflicts') c
      WHERE r0.doctor_facility_id=(c->>'practice_id')::uuid AND r0.service_mode=c->>'mode') ORDER BY r0.id LOOP
    PERFORM clinzo.materialize_schedule_rule(rule_id);
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'conflicts') c WHERE (c->>'booked_count')::int>0) THEN
    UPDATE clinzo.doctor_schedule_preferences SET schedule_adjustments=schedule_adjustments||jsonb_build_array(jsonb_build_object(
      'mode',p_mode,'effective_from',local_day,'message','Waiting for rescheduling. Existing reservations keep their times; conflicting new slots remain unavailable. Review affected bookings in Appointments.')) WHERE doctor_facility_id=p_practice_id;
    result:=jsonb_set(result,'{settings}',public.get_my_schedule_preferences(p_practice_id));
  END IF;
  RETURN result||jsonb_build_object('adjustments',plan->'conflicts');
END $$;

REVOKE ALL ON FUNCTION public.resolve_doctor_schedule_conflicts(uuid,text,jsonb,bigint,date,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_doctor_schedule_conflicts(uuid,text,jsonb,bigint,date,text,text,text) TO authenticated;

-- Older clients use the same safe replacement owner, without requesting moves.
CREATE OR REPLACE FUNCTION public.replace_doctor_schedule_conflicts(
  p_practice_id uuid,p_mode text,p_settings jsonb,p_expected_version bigint,p_effective_from date,p_preview_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan jsonb;
BEGIN
  plan:=public.preview_doctor_schedule_change(p_practice_id,p_mode,p_settings,p_expected_version,p_effective_from);
  IF p_preview_token IS DISTINCT FROM plan->>'token' THEN RAISE EXCEPTION 'Schedule changed. Review the conflicts again before replacing availability.' USING ERRCODE='PT409'; END IF;
  IF NOT (plan->>'can_replace')::boolean THEN RAISE EXCEPTION 'Review affected bookings before replacing availability' USING ERRCODE='23514'; END IF;
  RETURN public.resolve_doctor_schedule_conflicts(p_practice_id,p_mode,p_settings,p_expected_version,p_effective_from,p_preview_token,'trim','');
END $$;

-- Keep the canonical publisher and payment-aware rescheduler as the owners.
DO $$
DECLARE definition text; marker text;
BEGIN
  definition:=pg_get_functiondef('public.publish_doctor_schedule_from_date(uuid,text,jsonb,bigint,date)'::regprocedure);
  marker:='ELSIF extract(isodow FROM booked.starts_at';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected booked schedule guard'; END IF;
  definition:=replace(definition,marker,'ELSIF NOT EXISTS(SELECT 1 FROM clinzo.appointment requested JOIN clinzo.session previous_session ON previous_session.id=requested.session_id JOIN clinzo.schedule_rule previous_rule ON previous_rule.id=previous_session.schedule_rule_id WHERE requested.id=booked.id AND requested.schedule_change_requested_at IS NOT NULL AND previous_rule.state=''retired'' AND (previous_rule.effective_until IS NULL OR (previous_session.starts_at AT TIME ZONE previous_rule.timezone)::date>previous_rule.effective_until)) AND extract(isodow FROM booked.starts_at');
  marker:='IF booked.doctor_facility_id=p_practice_id AND booked.mode=p_mode THEN';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected same-service booked guard'; END IF;
  definition:=replace(definition,marker,'IF booked.doctor_facility_id=p_practice_id AND booked.mode=p_mode AND NOT EXISTS(SELECT 1 FROM clinzo.appointment requested JOIN clinzo.session previous_session ON previous_session.id=requested.session_id JOIN clinzo.schedule_rule previous_rule ON previous_rule.id=previous_session.schedule_rule_id WHERE requested.id=booked.id AND requested.schedule_change_requested_at IS NOT NULL AND previous_rule.state=''retired'' AND (previous_rule.effective_until IS NULL OR (previous_session.starts_at AT TIME ZONE previous_rule.timezone)::date>previous_rule.effective_until)) THEN');
  EXECUTE definition;
  definition:=pg_get_functiondef('clinzo.appointment_recovery_details(uuid)'::regprocedure);
  marker:='''reschedule_count'',a.reschedule_count';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected recovery projection'; END IF;
  definition:=replace(definition,marker,'''schedule_change'',CASE WHEN a.schedule_change_requested_at IS NOT NULL THEN jsonb_build_object(''reason'',a.schedule_change_reason,''requested_at'',a.schedule_change_requested_at,''pending'',a.status IN (''pending'',''confirmed'') AND a.capacity_released_at IS NULL) ELSE NULL END,'||marker);
  EXECUTE definition;
  definition:=pg_get_functiondef('public.reschedule_appointment(uuid,bigint,uuid,text,uuid)'::regprocedure);
  marker:='a.recovery_outcome IS DISTINCT FROM ''doctor_unavailable''';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected recovery limit guard'; END IF;
  definition:=replace(definition,marker,marker||' AND a.schedule_change_requested_at IS NULL');
  marker:='manager OR a.recovery_outcome=''doctor_unavailable''';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected recovery move counter'; END IF;
  definition:=replace(definition,marker,marker||' OR a.schedule_change_requested_at IS NOT NULL');
  marker:='SELECT * INTO ps FROM clinzo.practice_service WHERE id=a.practice_service_id;';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected replacement service owner'; END IF;
  definition:=replace(definition,marker,'SELECT ps0.* INTO STRICT ps FROM clinzo.practice_service ps0 JOIN clinzo.session_service ss ON ss.practice_service_id=ps0.id WHERE ss.session_id=target.id AND ps0.active;');
  EXECUTE definition;
  -- Generated sessions have distinct service IDs even for the same visit mode.
  definition:=pg_get_functiondef('public.list_appointment_reschedule_options(uuid)'::regprocedure);
  marker:='AND ps.id=original.practice_service_id';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected reschedule option service filter'; END IF;
  EXECUTE replace(definition,marker,'');
  definition:=pg_get_functiondef('clinzo.insert_generated_schedule_session(uuid,timestamptz,timestamptz)'::regprocedure);
  marker:='WHERE doctor_facility_id=r.doctor_facility_id AND starts_at=p_start FOR UPDATE;';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected generated session reuse owner'; END IF;
  EXECUTE replace(definition,marker,'WHERE doctor_facility_id=r.doctor_facility_id AND starts_at=p_start AND (state<>''cancelled'' OR NOT EXISTS(SELECT 1 FROM clinzo.appointment history WHERE history.session_id=clinzo.session.id)) ORDER BY (state=''cancelled''),id LIMIT 1 FOR UPDATE;');
  definition:=pg_get_functiondef('clinzo.materialize_schedule_rule(uuid)'::regprocedure);
  marker:='AND s.starts_at=candidate AND EXISTS';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected historical session materialization guard'; END IF;
  EXECUTE replace(definition,marker,'AND s.state<>''cancelled'' AND s.starts_at=candidate AND EXISTS');
END $$;

-- Refill only after the last live reservation in a retired session is resolved.
-- This deliberately keeps the entire old session unavailable to other services.
CREATE FUNCTION clinzo.refresh_resolved_schedule_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_session clinzo.session; current_rule clinzo.schedule_rule; released_day date;
BEGIN
  IF NEW.schedule_change_requested_at IS NULL OR (NEW.status NOT IN ('cancelled','rejected','no_show') AND NEW.capacity_released_at IS NULL) THEN RETURN NEW; END IF;
  SELECT * INTO old_session FROM clinzo.session WHERE id=NEW.session_id;
  IF NOT EXISTS(SELECT 1 FROM clinzo.schedule_rule r WHERE r.id=old_session.schedule_rule_id AND r.state='retired'
    AND (r.effective_until IS NULL OR (old_session.starts_at AT TIME ZONE r.timezone)::date>r.effective_until)) THEN RETURN NEW; END IF;
  -- All normal transition owners already hold the doctor/session locks.
  IF EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.session_id=old_session.id
    AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now()))) THEN RETURN NEW; END IF;
  UPDATE clinzo.session SET state='cancelled' WHERE id=old_session.id AND starts_at>now() AND state<>'cancelled';
  released_day:=(old_session.starts_at AT TIME ZONE old_session.timezone)::date;
  FOR current_rule IN SELECT r.* FROM clinzo.schedule_rule r JOIN clinzo.doctor_facility p ON p.id=r.doctor_facility_id
    WHERE p.doctor_id=old_session.doctor_id AND r.state='published' AND r.automatic
      AND r.effective_from<=released_day AND (r.effective_until IS NULL OR r.effective_until>=released_day)
      AND extract(isodow FROM released_day)::int=ANY(r.iso_weekdays)
      AND (released_day+r.local_start) AT TIME ZONE r.timezone<old_session.ends_at+make_interval(mins=>r.travel_buffer_minutes)
      AND (released_day+r.local_end) AT TIME ZONE r.timezone>old_session.starts_at-make_interval(mins=>r.travel_buffer_minutes)
      ORDER BY r.id LOOP
    -- Bound this refill to the released day and restore the recurring horizon.
    UPDATE clinzo.schedule_rule SET materialized_through=released_day-1,effective_until=released_day WHERE id=current_rule.id;
    PERFORM clinzo.materialize_schedule_rule(current_rule.id);
    UPDATE clinzo.schedule_rule SET materialized_through=current_rule.materialized_through,effective_until=current_rule.effective_until WHERE id=current_rule.id;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM clinzo.appointment a JOIN clinzo.session s ON s.id=a.session_id
    WHERE s.doctor_id=old_session.doctor_id AND a.schedule_change_requested_at IS NOT NULL
      AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now()))) THEN
    UPDATE clinzo.doctor_schedule_preferences prefs SET schedule_adjustments=coalesce((SELECT jsonb_agg(n) FROM jsonb_array_elements(prefs.schedule_adjustments) n
      WHERE n->>'message' NOT LIKE 'Waiting for rescheduling.%'),'[]'::jsonb)
      FROM clinzo.doctor_facility p WHERE p.id=prefs.doctor_facility_id AND p.doctor_id=old_session.doctor_id
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(prefs.schedule_adjustments) n WHERE n->>'message' LIKE 'Waiting for rescheduling.%');
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clinzo.refresh_resolved_schedule_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER refresh_resolved_schedule_change AFTER UPDATE OF status,capacity_released_at ON clinzo.appointment
  FOR EACH ROW EXECUTE FUNCTION clinzo.refresh_resolved_schedule_change();
