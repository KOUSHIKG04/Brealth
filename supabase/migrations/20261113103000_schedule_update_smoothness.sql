-- Smoother schedule updates without new tables.
-- 1. The preview suggests the first start date that avoids booked or started
--    sessions, when a later date alone can clear every blocking conflict.
-- 2. A checked publisher reruns the preview under the same doctor, session and
--    rule locks, so availability published elsewhere after the preview cannot
--    slip in between preview and publication.
-- 3. A read-only projection lists the doctor's other published blocks so the
--    editors can show taken time before the doctor saves.
-- Existing RPC names, arguments and grants are unchanged.

CREATE OR REPLACE FUNCTION public.preview_doctor_schedule_change(
  p_practice_id uuid,p_mode text,p_settings jsonb,p_expected_version bigint,p_effective_from date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); d clinzo.doctor;
  prefs clinzo.doctor_schedule_preferences; r record; days smallint[]; blocks jsonb;
  buffer integer; daily_limit integer; local_day date; count_booked integer; remaining jsonb;
  bookings jsonb; can_request boolean; conflicts jsonb:='[]'; reason text; editable boolean; result jsonb;
  blocked_until date; latest_blocked date; suggestion_possible boolean:=true; local_today date;
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
      -- A later start date clears this conflict only when its obstacle is a
      -- booking, payment hold or session already under way in a rule we manage.
      IF editable AND r.automatic AND r.timezone=d.booking_timezone THEN
        SELECT max((s.starts_at AT TIME ZONE d.booking_timezone)::date) INTO blocked_until
          FROM clinzo.session s WHERE s.schedule_rule_id=r.id AND s.ends_at>now()
            AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day
            AND extract(isodow FROM s.starts_at AT TIME ZONE d.booking_timezone)::int=ANY(days)
            AND ((s.state<>'cancelled' AND s.starts_at<=now()) OR EXISTS(SELECT 1 FROM clinzo.appointment a
              WHERE a.session_id=s.id AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL)
                OR (a.status='pending' AND a.request_expires_at>now()))));
        latest_blocked:=greatest(latest_blocked,blocked_until);
      ELSIF reason IS NOT NULL THEN
        suggestion_possible:=false;
      END IF;
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
  local_today:=(now() AT TIME ZONE d.booking_timezone)::date;
  IF suggestion_possible AND latest_blocked IS NOT NULL AND latest_blocked+1<=local_today+365 THEN
    result:=result||jsonb_build_object('suggested_effective_from',latest_blocked+1);
  END IF;
  RETURN result||jsonb_build_object('token',md5(result::text||p_settings::text||p_expected_version::text));
END $$;

REVOKE ALL ON FUNCTION public.preview_doctor_schedule_change(uuid,text,jsonb,bigint,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_doctor_schedule_change(uuid,text,jsonb,bigint,date) TO authenticated;

CREATE FUNCTION public.publish_previewed_doctor_schedule(
  p_practice_id uuid,p_mode text,p_settings jsonb,p_expected_version bigint,p_effective_from date,p_preview_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan jsonb;
BEGIN
  -- The preview takes the doctor, session and rule locks in this transaction.
  plan:=public.preview_doctor_schedule_change(p_practice_id,p_mode,p_settings,p_expected_version,p_effective_from);
  IF jsonb_array_length(plan->'conflicts')>0 THEN
    RAISE EXCEPTION 'Another schedule now overlaps these hours. Review the conflicts before publishing.'
      USING ERRCODE='PT410';
  END IF;
  IF p_preview_token IS NULL OR p_preview_token IS DISTINCT FROM plan->>'token' THEN
    RAISE EXCEPTION 'Schedule changed. Review it again before publishing.' USING ERRCODE='PT409';
  END IF;
  RETURN public.publish_doctor_schedule_from_date(p_practice_id,p_mode,p_settings,p_expected_version,p_effective_from);
END $$;
REVOKE ALL ON FUNCTION public.publish_previewed_doctor_schedule(uuid,text,jsonb,bigint,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_previewed_doctor_schedule(uuid,text,jsonb,bigint,date,text) TO authenticated;

CREATE FUNCTION public.list_my_schedule_busy_blocks(
  p_practice_id uuid,p_mode text,p_effective_from date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); v_doctor uuid; v_zone text; local_day date; result jsonb;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('clinic','online','home') THEN
    RAISE EXCEPTION 'Choose a service' USING ERRCODE='22023'; END IF;
  IF NOT coalesce(clinzo.can_edit_practice_schedule(actor,p_practice_id),false)
    OR NOT coalesce(clinzo.can_manage_practice(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Verified practice access required' USING ERRCODE='42501'; END IF;
  SELECT p.doctor_id,d.booking_timezone INTO v_doctor,v_zone FROM clinzo.doctor_facility p
    JOIN clinzo.doctor d ON d.id=p.doctor_id WHERE p.id=p_practice_id AND p.active;
  IF v_doctor IS NULL THEN RAISE EXCEPTION 'Verified practice access required' USING ERRCODE='42501'; END IF;
  local_day:=greatest(coalesce(p_effective_from,(now() AT TIME ZONE v_zone)::date),(now() AT TIME ZONE v_zone)::date);
  -- Same rule set the preview checks, without locks and without patient details.
  SELECT coalesce(jsonb_agg(jsonb_build_object('rule_id',r.id,'practice_id',r.doctor_facility_id,
      'facility_name',f.name,'mode',r.service_mode,'days',to_jsonb(r.iso_weekdays),
      'start',to_char(r.local_start,'HH24:MI'),
      'end',CASE WHEN r.local_end=time '24:00' THEN '24:00' ELSE to_char(r.local_end,'HH24:MI') END,
      'travel_buffer_minutes',r.travel_buffer_minutes,'effective_from',greatest(local_day,r.effective_from),
      'effective_until',r.effective_until)
    ORDER BY r.local_start,f.name,r.service_mode,r.id),'[]'::jsonb) INTO result
    FROM clinzo.schedule_rule r JOIN clinzo.doctor_facility p ON p.id=r.doctor_facility_id
    JOIN clinzo.facility f ON f.id=p.facility_id
    WHERE p.doctor_id=v_doctor
      AND (r.state='published' OR (r.state='retired' AND r.automatic AND r.effective_until IS NOT NULL))
      AND (r.effective_until IS NULL OR r.effective_until>=local_day)
      AND NOT (r.doctor_facility_id=p_practice_id AND r.service_mode=p_mode);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_my_schedule_busy_blocks(uuid,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_schedule_busy_blocks(uuid,text,date) TO authenticated;
