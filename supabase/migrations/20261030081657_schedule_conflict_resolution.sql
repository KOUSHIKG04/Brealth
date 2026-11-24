-- Preview and confirmed replacement share the same owner and doctor/session locks.
-- Existing appointment rows, windows, prices and tokens are never rescheduled.
ALTER TABLE clinzo.doctor_schedule_preferences
  ADD COLUMN schedule_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE FUNCTION clinzo.remaining_schedule_blocks(
  p_start time, p_end time, p_days smallint[], p_duration integer,
  p_buffer integer, p_new_days smallint[], p_blocks jsonb, p_new_buffer integer
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  WITH limits AS (
    SELECT extract(epoch FROM p_start)::int/60 AS lo, extract(epoch FROM p_end)::int/60 AS hi
  ), pieces AS (
    SELECT day, unnest(int4multirange(int4range(lo,hi,'[)')) - coalesce((
      SELECT range_agg(int4range(
        greatest(lo,extract(epoch FROM (b->>'start')::time)::int/60-p_new_buffer-p_buffer),
        least(hi,extract(epoch FROM (b->>'end')::time)::int/60+p_new_buffer+p_buffer),'[)'))
      FROM jsonb_array_elements(p_blocks) b
      WHERE day=ANY(p_new_days)
        AND extract(epoch FROM (b->>'start')::time)::int/60-p_new_buffer-p_buffer<hi
        AND extract(epoch FROM (b->>'end')::time)::int/60+p_new_buffer+p_buffer>lo
    ),'{}'::int4multirange)) AS span,lo
    FROM limits CROSS JOIN unnest(p_days) day
  ), aligned AS (
    SELECT day,lo+ceil((lower(span)-lo)::numeric/p_duration)::int*p_duration AS a,
      lo+floor((upper(span)-lo)::numeric/p_duration)::int*p_duration AS b FROM pieces
  ), grouped AS (
    SELECT a,b,jsonb_agg(day ORDER BY day) AS days FROM aligned
      WHERE b-a>=p_duration GROUP BY a,b
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('days',days,
      'start',to_char(date '2000-01-01'+make_interval(mins=>a),'HH24:MI'),
      'end',CASE WHEN b=1440 THEN '24:00' ELSE to_char(date '2000-01-01'+make_interval(mins=>b),'HH24:MI') END)
      ORDER BY a,b),'[]'::jsonb) FROM grouped;
$$;
REVOKE ALL ON FUNCTION clinzo.remaining_schedule_blocks(time,time,smallint[],integer,integer,smallint[],jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.preview_doctor_schedule_change(
  p_practice_id uuid,p_mode text,p_settings jsonb,p_expected_version bigint,p_effective_from date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); d clinzo.doctor;
  prefs clinzo.doctor_schedule_preferences; r record; days smallint[]; blocks jsonb;
  buffer integer; daily_limit integer; local_day date; count_booked integer; remaining jsonb;
  conflicts jsonb:='[]'; reason text; editable boolean; result jsonb;
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
    AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day ORDER BY s.id FOR UPDATE OF s;
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
        WHERE s.schedule_rule_id=r.id AND s.ends_at>now() AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day
          AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL) OR (a.status='pending' AND a.request_expires_at>now()));
      editable:=coalesce(clinzo.can_edit_practice_schedule(actor,r.doctor_facility_id),false)
        AND coalesce(clinzo.can_manage_practice(actor,r.doctor_facility_id),false);
      reason:=CASE
        WHEN NOT editable THEN 'This schedule belongs to another practice. Ask its authorized manager to change it.'
        WHEN NOT r.automatic THEN 'This is a manually published schedule. Edit it separately.'
        WHEN r.timezone<>d.booking_timezone THEN 'This schedule uses a different timezone. Edit it separately.'
        WHEN count_booked>0 THEN 'This schedule has active bookings or payment holds. Review those appointments or choose a later start date.'
        WHEN EXISTS(SELECT 1 FROM clinzo.session s WHERE s.schedule_rule_id=r.id AND s.state<>'cancelled'
          AND s.starts_at<=now() AND s.ends_at>now() AND (s.starts_at AT TIME ZONE d.booking_timezone)::date>=local_day)
          THEN 'This session has already started. Choose a later start date.'
        ELSE NULL END;
      remaining:=clinzo.remaining_schedule_blocks(r.local_start,r.local_end,r.iso_weekdays,r.window_minutes,
        r.travel_buffer_minutes,days,blocks,buffer);
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('rule_id',r.id,'practice_id',r.doctor_facility_id,
        'facility_name',(SELECT f.name FROM clinzo.facility f JOIN clinzo.doctor_facility p ON p.facility_id=f.id WHERE p.id=r.doctor_facility_id),'mode',r.service_mode,'days',r.iso_weekdays,'start',to_char(r.local_start,'HH24:MI'),
        'end',CASE WHEN r.local_end=time '24:00' THEN '24:00' ELSE to_char(r.local_end,'HH24:MI') END,
        'travel_buffer_minutes',r.travel_buffer_minutes,'effective_from',greatest(local_day,r.effective_from),
        'effective_until',r.effective_until,'remaining',remaining,'booked_count',count_booked,
        'replaceable',reason IS NULL,'reason',reason));
    END LOOP;
  END IF;
  result:=jsonb_build_object('effective_from',local_day,'conflicts',conflicts,
    'can_replace',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(conflicts) c WHERE NOT (c->>'replaceable')::boolean));
  RETURN result||jsonb_build_object('token',md5(result::text||p_settings::text||p_expected_version::text));
END $$;
REVOKE ALL ON FUNCTION public.preview_doctor_schedule_change(uuid,text,jsonb,bigint,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_doctor_schedule_change(uuid,text,jsonb,bigint,date) TO authenticated;

CREATE FUNCTION public.replace_doctor_schedule_conflicts(
  p_practice_id uuid,p_mode text,p_settings jsonb,p_expected_version bigint,p_effective_from date,p_preview_token text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); plan jsonb; conflict jsonb; piece jsonb; r clinzo.schedule_rule;
  local_day date; rule_id uuid; result jsonb; current_version bigint; changed_practice uuid; changed_mode text;
BEGIN
  plan:=public.preview_doctor_schedule_change(p_practice_id,p_mode,p_settings,p_expected_version,p_effective_from);
  IF p_preview_token IS NULL OR p_preview_token IS DISTINCT FROM plan->>'token' THEN
    RAISE EXCEPTION 'Schedule changed. Review the conflicts again before replacing availability.' USING ERRCODE='PT409'; END IF;
  IF NOT (plan->>'can_replace')::boolean OR jsonb_array_length(plan->'conflicts')=0 THEN
    RAISE EXCEPTION 'These conflicts cannot be replaced. Review the affected schedule or choose another time.' USING ERRCODE='23514'; END IF;
  local_day:=(plan->>'effective_from')::date;
  -- The preview holds doctor, session and rule locks. Only unused availability is withdrawn.
  FOR conflict IN SELECT value FROM jsonb_array_elements(plan->'conflicts') LOOP
    SELECT * INTO STRICT r FROM clinzo.schedule_rule WHERE id=(conflict->>'rule_id')::uuid;
    UPDATE clinzo.appointment_window w SET state='blocked' FROM clinzo.session s
      WHERE w.session_id=s.id AND s.schedule_rule_id=r.id AND s.starts_at>now()
        AND (s.starts_at AT TIME ZONE r.timezone)::date>=local_day;
    UPDATE clinzo.session SET state='cancelled' WHERE schedule_rule_id=r.id AND starts_at>now()
      AND (starts_at AT TIME ZONE r.timezone)::date>=local_day;
    UPDATE clinzo.schedule_rule SET state='retired',effective_until=
      CASE WHEN effective_from<local_day THEN local_day-1 ELSE NULL END WHERE id=r.id;
  END LOOP;
  -- Preserve nonconflicting weekdays and time fragments, including their original end date.
  FOR conflict IN SELECT value FROM jsonb_array_elements(plan->'conflicts') LOOP
    SELECT * INTO STRICT r FROM clinzo.schedule_rule WHERE id=(conflict->>'rule_id')::uuid;
    FOR piece IN SELECT value FROM jsonb_array_elements(conflict->'remaining') LOOP
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
  RETURN result||jsonb_build_object('adjustments',plan->'conflicts');
END $$;
REVOKE ALL ON FUNCTION public.replace_doctor_schedule_conflicts(uuid,text,jsonb,bigint,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_doctor_schedule_conflicts(uuid,text,jsonb,bigint,date,text) TO authenticated;

-- Expose persistent review notices through the existing authorized projection.
DO $$
DECLARE definition text; marker text;
BEGIN
  definition:=pg_get_functiondef('public.get_my_schedule_preferences(uuid)'::regprocedure);
  marker:='''clinic_time_blocks'',s.clinic_time_blocks';
  IF position(marker in definition)=0 THEN RAISE EXCEPTION 'Unexpected schedule preference projection'; END IF;
  definition:=replace(definition,marker,'''schedule_adjustments'',s.schedule_adjustments,'||marker);
  EXECUTE definition;
  definition:=pg_get_functiondef('public.publish_doctor_schedule_from_date(uuid,text,jsonb,bigint,date)'::regprocedure);
  marker:='RETURN jsonb_build_object(''settings'',public.get_my_schedule_preferences(p_practice_id)';
  IF position(marker in definition)=0 THEN RAISE EXCEPTION 'Unexpected schedule publication owner'; END IF;
  definition:=replace(definition,marker,
    'UPDATE clinzo.doctor_schedule_preferences SET schedule_adjustments=coalesce((SELECT jsonb_agg(n) FROM jsonb_array_elements(schedule_adjustments) n WHERE n->>''mode''<>p_mode),''[]''::jsonb)
      WHERE doctor_facility_id=p_practice_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(schedule_adjustments) n WHERE n->>''mode''=p_mode);
  '||marker);
  EXECUTE definition;
END $$;

CREATE FUNCTION public.list_my_schedule_adjustments() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_care_actor(); result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(n.value||jsonb_build_object('practice_id',p.id,'facility_name',f.name)
    ORDER BY p.id,n.value->>'mode'),'[]'::jsonb) INTO result
    FROM clinzo.doctor_schedule_preferences prefs JOIN clinzo.doctor_facility p ON p.id=prefs.doctor_facility_id
    JOIN clinzo.facility f ON f.id=p.facility_id CROSS JOIN LATERAL jsonb_array_elements(prefs.schedule_adjustments) n
    WHERE clinzo.can_edit_practice_schedule(actor,p.id) AND clinzo.can_manage_practice(actor,p.id);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_my_schedule_adjustments() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_schedule_adjustments() TO authenticated;
