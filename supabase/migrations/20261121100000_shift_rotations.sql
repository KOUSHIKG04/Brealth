-- Shift rotations: a service (clinic, online or home) can follow named shifts
-- instead of one weekly pattern. A plan holds up to 8 shift templates (start,
-- length up to 28 hours, slot length and limits), a rotation of 1-8 weeks and
-- single-date overrides. Each shift instance is ONE session, booked against the
-- date it starts, with its own limits and one queue, even across midnight.
--
-- Doctors at a facility they do not run submit plans for approval; facility
-- admins and doctors running their own clinic activate plans directly.
-- Activating a plan stops the service's weekly schedule from its start date.
-- Existing booking, walk-in, payment and queue paths are unchanged: they use
-- the generated sessions like any other.

CREATE TABLE clinzo.shift_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_facility_id uuid NOT NULL REFERENCES clinzo.doctor_facility(id),
  service_mode text NOT NULL CHECK (service_mode IN ('clinic','online','home')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','rejected','withdrawn','superseded','ended')),
  templates jsonb NOT NULL,
  cycle_start date NOT NULL,
  cycle_weeks smallint NOT NULL CHECK (cycle_weeks BETWEEN 1 AND 8),
  rotation jsonb NOT NULL,
  overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from date NOT NULL,
  ended_from date,
  materialized_through date,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX shift_plan_one_active ON clinzo.shift_plan(doctor_facility_id,service_mode) WHERE status='active';
CREATE UNIQUE INDEX shift_plan_one_pending ON clinzo.shift_plan(doctor_facility_id,service_mode) WHERE status='pending';
ALTER TABLE clinzo.shift_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinzo.shift_plan FROM PUBLIC,anon,authenticated;

ALTER TABLE clinzo.session
  ADD COLUMN shift_plan_id uuid REFERENCES clinzo.shift_plan(id),
  ADD COLUMN shift_key text;

-- Problem with a submitted plan, or NULL when it is valid.
CREATE FUNCTION clinzo.shift_plan_problem(p_mode text, p_plan jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE t jsonb; keys text[]:='{}'; slots int; duration int; slot int; app int; walkin int; daily int;
  weeks int; week jsonb; entry jsonb; o jsonb;
BEGIN
  IF p_plan IS NULL OR jsonb_typeof(p_plan->'templates')<>'array'
    OR jsonb_array_length(p_plan->'templates') NOT BETWEEN 1 AND 8 THEN
    RETURN 'Add between 1 and 8 shifts.'; END IF;
  FOR t IN SELECT * FROM jsonb_array_elements(p_plan->'templates') LOOP
    IF coalesce(t->>'key','')!~'^[a-z0-9-]{1,20}$' OR (t->>'key')=ANY(keys) THEN RETURN 'Each shift needs a unique key.'; END IF;
    keys:=keys||(t->>'key');
    IF length(btrim(coalesce(t->>'name','')))NOT BETWEEN 1 AND 40 THEN RETURN 'Name each shift (up to 40 characters).'; END IF;
    IF coalesce(t->>'start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN 'Enter each shift start as HH:MM.'; END IF;
    duration:=(t->>'duration_minutes')::int; slot:=(t->>'slot_minutes')::int;
    IF duration IS NULL OR duration NOT BETWEEN 30 AND 1680 THEN RETURN 'A shift lasts from 30 minutes to 28 hours.'; END IF;
    IF slot IS NULL OR slot NOT BETWEEN (CASE WHEN p_mode='home' THEN 30 ELSE 5 END) AND 120 THEN
      RETURN 'Choose an appointment length from 5 to 120 minutes (home visits from 30).'; END IF;
    slots:=duration/slot;
    IF slots<1 THEN RETURN 'Each shift must fit at least one appointment.'; END IF;
    IF coalesce((t->>'fee_minor')::bigint,-1) NOT BETWEEN 0 AND 100000000 THEN RETURN 'Enter a valid fee for each shift.'; END IF;
    IF p_mode='clinic' THEN
      app:=(t->>'app_limit')::int; walkin:=(t->>'walkin_limit')::int;
      IF app IS NULL OR walkin IS NULL OR app<0 OR walkin<0 OR app+walkin>least(slots,100) THEN
        RETURN 'App slots and walk-ins must fit within each shift''s appointment times.'; END IF;
    ELSE
      daily:=(t->>'daily_limit')::int;
      IF daily IS NULL OR daily NOT BETWEEN 1 AND least(slots,100) THEN
        RETURN 'Each shift''s booking limit must fit within its appointment times.'; END IF;
    END IF;
  END LOOP;
  weeks:=(p_plan->>'cycle_weeks')::int;
  IF weeks IS NULL OR weeks NOT BETWEEN 1 AND 8 OR jsonb_typeof(p_plan->'rotation')<>'array'
    OR jsonb_array_length(p_plan->'rotation')<>weeks THEN RETURN 'The rotation needs one row per week (1 to 8 weeks).'; END IF;
  FOR week IN SELECT * FROM jsonb_array_elements(p_plan->'rotation') LOOP
    IF jsonb_typeof(week)<>'array' OR jsonb_array_length(week)<>7 THEN RETURN 'Each rotation week needs 7 days.'; END IF;
    FOR entry IN SELECT * FROM jsonb_array_elements(week) LOOP
      IF jsonb_typeof(entry)<>'null' AND NOT (entry#>>'{}')=ANY(keys) THEN RETURN 'The rotation uses a shift that does not exist.'; END IF;
    END LOOP;
  END LOOP;
  IF jsonb_typeof(coalesce(p_plan->'overrides','[]'::jsonb))<>'array'
    OR jsonb_array_length(coalesce(p_plan->'overrides','[]'::jsonb))>120 THEN RETURN 'Add up to 120 date changes.'; END IF;
  FOR o IN SELECT * FROM jsonb_array_elements(coalesce(p_plan->'overrides','[]'::jsonb)) LOOP
    IF coalesce(o->>'date','')!~'^\d{4}-\d{2}-\d{2}$' THEN RETURN 'Each date change needs a date.'; END IF;
    IF o->>'key' IS NOT NULL AND NOT (o->>'key')=ANY(keys) THEN RETURN 'A date change uses a shift that does not exist.'; END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- The shift template that applies on a local date, or NULL for a day off.
CREATE FUNCTION clinzo.shift_template_for_day(p_plan clinzo.shift_plan, p_day date) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE o jsonb; key text; week_index int;
BEGIN
  SELECT x INTO o FROM jsonb_array_elements(p_plan.overrides) x WHERE x->>'date'=p_day::text LIMIT 1;
  IF o IS NOT NULL THEN key:=o->>'key';
  ELSE
    week_index:=(((p_day-p_plan.cycle_start)/7)%p_plan.cycle_weeks+p_plan.cycle_weeks)%p_plan.cycle_weeks;
    IF p_day<p_plan.cycle_start THEN
      week_index:=((floor((p_day-p_plan.cycle_start)::numeric/7)::int%p_plan.cycle_weeks)+p_plan.cycle_weeks)%p_plan.cycle_weeks;
    END IF;
    key:=p_plan.rotation->week_index->>(extract(isodow FROM p_day)::int-1);
  END IF;
  IF key IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT t FROM jsonb_array_elements(p_plan.templates) t WHERE t->>'key'=key LIMIT 1);
END $$;

-- Template of a generated shift session, or NULL for any other session.
CREATE FUNCTION clinzo.shift_template_for_session(p_session_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT t FROM clinzo.session s JOIN clinzo.shift_plan pl ON pl.id=s.shift_plan_id
    CROSS JOIN LATERAL jsonb_array_elements(pl.templates) t
  WHERE s.id=p_session_id AND t->>'key'=s.shift_key LIMIT 1;
$$;
REVOKE ALL ON FUNCTION clinzo.shift_template_for_session(uuid) FROM PUBLIC,anon,authenticated;

-- Creates the plan's shift sessions for the next 30 days. A shift that would
-- overlap the doctor's other sessions is skipped by the existing overlap guard.
CREATE FUNCTION clinzo.materialize_shift_plan(p_plan_id uuid) RETURNS integer
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE pl clinzo.shift_plan; d clinzo.doctor; zone text; today date; first_day date; day date; tpl jsonb;
  starts timestamptz; slot int; n int; sid uuid; service uuid; day_id uuid; created int:=0; w timestamptz;
BEGIN
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=p_plan_id AND status='active' FOR UPDATE;
  IF pl.id IS NULL THEN RETURN 0; END IF;
  SELECT d0.* INTO d FROM clinzo.doctor d0 JOIN clinzo.doctor_facility p ON p.doctor_id=d0.id
    JOIN clinzo.facility f ON f.id=p.facility_id JOIN clinzo.organization o ON o.id=f.organization_id
    WHERE p.id=pl.doctor_facility_id AND p.active AND d0.active AND d0.credential_status='verified'
      AND f.active AND f.verification_status='verified' AND o.active;
  IF d.id IS NULL THEN RETURN 0; END IF;
  zone:=coalesce(nullif(d.booking_timezone,''),'Asia/Kolkata');
  today:=(now() AT TIME ZONE zone)::date;
  first_day:=greatest(pl.effective_from,today,coalesce(pl.materialized_through+1,today));
  IF first_day>today+29 THEN RETURN 0; END IF;
  FOR day IN SELECT generate_series(first_day,today+29,interval '1 day')::date LOOP
    EXIT WHEN pl.ended_from IS NOT NULL AND day>=pl.ended_from;
    -- A weekly schedule published after this plan takes over from its start date.
    CONTINUE WHEN EXISTS(SELECT 1 FROM clinzo.schedule_rule r WHERE r.doctor_facility_id=pl.doctor_facility_id
      AND r.automatic AND r.service_mode=pl.service_mode AND r.state='published' AND r.created_at>pl.activated_at
      AND r.effective_from<=day AND (r.effective_until IS NULL OR r.effective_until>=day));
    tpl:=clinzo.shift_template_for_day(pl,day);
    CONTINUE WHEN tpl IS NULL;
    starts:=(day+(tpl->>'start')::time) AT TIME ZONE zone;
    slot:=(tpl->>'slot_minutes')::int;
    n:=((tpl->>'duration_minutes')::int)/slot;
    CONTINUE WHEN starts<=now();
    CONTINUE WHEN EXISTS(SELECT 1 FROM clinzo.session s WHERE s.doctor_facility_id=pl.doctor_facility_id
      AND s.starts_at=starts AND s.state<>'cancelled');
    BEGIN
      SELECT id INTO day_id FROM clinzo.doctor_booking_day WHERE doctor_id=d.id AND local_date=day FOR UPDATE;
      IF day_id IS NULL THEN
        INSERT INTO clinzo.doctor_booking_day(doctor_id,local_date,timezone) VALUES(d.id,day,zone)
          ON CONFLICT(doctor_id,local_date) DO UPDATE SET timezone=excluded.timezone RETURNING id INTO day_id;
      END IF;
      INSERT INTO clinzo.session(doctor_facility_id,doctor_id,booking_day_id,schedule_rule_id,starts_at,ends_at,
          timezone,hard_capacity,auto_confirm_limit,state,shift_plan_id,shift_key)
        VALUES(pl.doctor_facility_id,d.id,day_id,NULL,starts,starts+make_interval(mins=>slot*n),zone,n,NULL,
          'published',pl.id,tpl->>'key') RETURNING id INTO sid;
      INSERT INTO clinzo.practice_service(doctor_facility_id,code,name,fee_minor,currency,duration_minutes)
        VALUES(pl.doctor_facility_id,pl.service_mode||'-'||sid::text,
          CASE pl.service_mode WHEN 'online' THEN 'Video consultation' WHEN 'home' THEN 'Home visit' ELSE 'Clinic consultation' END,
          (tpl->>'fee_minor')::bigint,'INR',slot) RETURNING id INTO service;
      INSERT INTO clinzo.session_service(session_id,practice_service_id) VALUES(sid,service);
      INSERT INTO clinzo.session_queue(session_id) VALUES(sid);
      FOR w IN SELECT generate_series(starts,starts+make_interval(mins=>slot*(n-1)),make_interval(mins=>slot)) LOOP
        CONTINUE WHEN w<=now() OR EXISTS(SELECT 1 FROM clinzo.schedule_exception e WHERE e.doctor_id=d.id
          AND e.state='active' AND (e.doctor_facility_id IS NULL OR e.doctor_facility_id=pl.doctor_facility_id)
          AND e.service_mode IN ('all',pl.service_mode) AND e.starts_at<w+make_interval(mins=>slot) AND e.ends_at>w);
        INSERT INTO clinzo.appointment_window(session_id,starts_at,ends_at,hard_capacity,state)
          VALUES(sid,w,w+make_interval(mins=>slot),1,'open');
      END LOOP;
      created:=created+1;
    EXCEPTION WHEN check_violation THEN
      NULL; -- overlaps another of the doctor's blocks: this shift is skipped
    END;
  END LOOP;
  UPDATE clinzo.shift_plan SET materialized_through=today+29,updated_at=now() WHERE id=pl.id;
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION clinzo.materialize_shift_plan(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION clinzo.refresh_shift_plans() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; created int:=0;
BEGIN
  FOR r IN SELECT id FROM clinzo.shift_plan WHERE status='active' ORDER BY doctor_facility_id,id LOOP
    created:=created+clinzo.materialize_shift_plan(r.id);
  END LOOP;
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION clinzo.refresh_shift_plans() FROM PUBLIC,anon,authenticated;

-- The nightly schedule job also extends shift plans.
-- (The stored body uses CRLF line endings, so the marker is one line.)
DO $$
DECLARE definition text; marker text:='RETURN created;';
BEGIN
  definition:=pg_get_functiondef('clinzo.refresh_automatic_schedules()'::regprocedure);
  IF position(marker IN definition)=0 OR position('refresh_shift_plans' IN definition)>0
    OR length(definition)-length(replace(definition,marker,''))<>length(marker) THEN
    RAISE EXCEPTION 'Unexpected nightly schedule job'; END IF;
  EXECUTE replace(definition,marker,'created:=created+clinzo.refresh_shift_plans(); '||marker);
END $$;

-- Activates a plan from its start date: ends the service's weekly schedule and
-- any earlier plan, cancels their unbooked sessions from then, and generates.
CREATE FUNCTION clinzo.activate_shift_plan(p_plan_id uuid, p_actor uuid) RETURNS integer
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE pl clinzo.shift_plan; zone text; booked int; first_booked date;
BEGIN
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=p_plan_id FOR UPDATE;
  SELECT coalesce(nullif(d.booking_timezone,''),'Asia/Kolkata') INTO zone FROM clinzo.doctor d
    JOIN clinzo.doctor_facility p ON p.doctor_id=d.id WHERE p.id=pl.doctor_facility_id;
  IF pl.effective_from<(now() AT TIME ZONE zone)::date THEN
    RAISE EXCEPTION 'Choose a start date from today' USING ERRCODE='22023'; END IF;
  -- Booked visits from the start date must be moved first; nothing is lost.
  SELECT count(DISTINCT a.id),min((s.starts_at AT TIME ZONE zone)::date) INTO booked,first_booked
  FROM clinzo.session s JOIN clinzo.appointment a ON a.session_id=s.id
  LEFT JOIN clinzo.schedule_rule r ON r.id=s.schedule_rule_id
  WHERE s.doctor_facility_id=pl.doctor_facility_id AND s.state<>'cancelled'
    AND (s.starts_at AT TIME ZONE zone)::date>=pl.effective_from
    AND clinzo.service_mode_for_session(s.id)=pl.service_mode
    AND (r.automatic OR s.shift_plan_id IS NOT NULL)
    AND a.status IN ('pending','confirmed','in_consultation') AND a.capacity_released_at IS NULL;
  IF booked>0 THEN
    RAISE EXCEPTION '% booked appointments from % keep the current schedule. Move them or choose a later start date.',
      booked,first_booked USING ERRCODE='PT409';
  END IF;
  UPDATE clinzo.schedule_rule SET state='retired',effective_until=pl.effective_from-1
    WHERE doctor_facility_id=pl.doctor_facility_id AND automatic AND service_mode=pl.service_mode
      AND state='published' AND effective_from<pl.effective_from
      AND (effective_until IS NULL OR effective_until>=pl.effective_from);
  UPDATE clinzo.schedule_rule SET state='draft'
    WHERE doctor_facility_id=pl.doctor_facility_id AND automatic AND service_mode=pl.service_mode
      AND state='published' AND effective_from>=pl.effective_from;
  UPDATE clinzo.session s SET state='cancelled'
    WHERE s.doctor_facility_id=pl.doctor_facility_id AND s.state IN ('published','open')
      AND (s.starts_at AT TIME ZONE zone)::date>=pl.effective_from
      AND clinzo.service_mode_for_session(s.id)=pl.service_mode
      AND (s.shift_plan_id IS NOT NULL OR EXISTS(SELECT 1 FROM clinzo.schedule_rule r WHERE r.id=s.schedule_rule_id AND r.automatic))
      AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.session_id=s.id);
  UPDATE clinzo.shift_plan SET status='superseded',ended_from=pl.effective_from,updated_at=now(),row_version=row_version+1
    WHERE doctor_facility_id=pl.doctor_facility_id AND service_mode=pl.service_mode AND status='active' AND id<>pl.id;
  UPDATE clinzo.shift_plan SET status='active',activated_at=now(),decided_by=coalesce(decided_by,p_actor),
      decided_at=coalesce(decided_at,now()),materialized_through=NULL,updated_at=now(),row_version=row_version+1
    WHERE id=pl.id;
  RETURN clinzo.materialize_shift_plan(pl.id);
END $$;
REVOKE ALL ON FUNCTION clinzo.activate_shift_plan(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION clinzo.shift_plan_json(p clinzo.shift_plan) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',p.id,'practice_id',p.doctor_facility_id,'service_mode',p.service_mode,
    'status',p.status,'templates',p.templates,'cycle_start',p.cycle_start,'cycle_weeks',p.cycle_weeks,
    'rotation',p.rotation,'overrides',p.overrides,'effective_from',p.effective_from,'ended_from',p.ended_from,
    'decided_at',p.decided_at,'decision_reason',p.decision_reason,'created_at',p.created_at,
    'row_version',p.row_version::text,
    'doctor_name',(SELECT d.full_name FROM clinzo.doctor_facility f JOIN clinzo.doctor d ON d.id=f.doctor_id WHERE f.id=p.doctor_facility_id),
    'facility_name',(SELECT fa.name FROM clinzo.doctor_facility f JOIN clinzo.facility fa ON fa.id=f.facility_id WHERE f.id=p.doctor_facility_id));
$$;

-- Active, pending and the latest decided plan of each service.
CREATE FUNCTION public.get_shift_plans(p_practice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity();
BEGIN
  IF NOT (coalesce(clinzo.can_edit_practice_schedule(actor,p_practice_id),false)
      OR coalesce(clinzo.can_manage_practice(actor,p_practice_id),false)) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(clinzo.shift_plan_json(p) ORDER BY p.service_mode,p.created_at DESC)
    FROM clinzo.shift_plan p WHERE p.doctor_facility_id=p_practice_id AND (p.status IN ('active','pending')
      OR p.id IN (SELECT DISTINCT ON (service_mode) id FROM clinzo.shift_plan
        WHERE doctor_facility_id=p_practice_id AND status IN ('rejected') ORDER BY service_mode,created_at DESC))),'[]'::jsonb);
END $$;

-- Saves a plan: active at once for facility admins and doctors running their
-- own clinic; pending facility approval for doctors at other facilities.
CREATE FUNCTION public.submit_shift_plan(p_practice_id uuid,p_mode text,p_plan jsonb,p_effective_from date) RETURNS jsonb
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
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=plan_id;
  RETURN jsonb_build_object('status','active','shifts_created',created,'plan',clinzo.shift_plan_json(pl));
END $$;

-- Facility decision on a pending plan.
CREATE FUNCTION public.decide_shift_plan(p_plan_id uuid,p_approve boolean,p_reason text DEFAULT NULL) RETURNS jsonb
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
  ELSE
    UPDATE clinzo.shift_plan SET decided_by=actor,decided_at=now() WHERE id=pl.id;
    created:=clinzo.activate_shift_plan(pl.id,actor);
  END IF;
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=p_plan_id;
  RETURN jsonb_build_object('shifts_created',created,'plan',clinzo.shift_plan_json(pl));
END $$;

-- Pending plans at the facilities this staff member manages.
CREATE FUNCTION public.list_facility_shift_plan_requests() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity();
BEGIN
  RETURN coalesce((SELECT jsonb_agg(clinzo.shift_plan_json(p) ORDER BY p.created_at)
    FROM clinzo.shift_plan p WHERE p.status='pending'
      AND coalesce(clinzo.can_manage_practice(actor,p.doctor_facility_id),false)
      AND NOT clinzo.schedule_change_needs_approval(actor,p.doctor_facility_id)),'[]'::jsonb);
END $$;

-- Withdraw a pending plan (requester or facility).
CREATE FUNCTION public.withdraw_shift_plan(p_plan_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity(); pl clinzo.shift_plan;
BEGIN
  SELECT * INTO pl FROM clinzo.shift_plan WHERE id=p_plan_id FOR UPDATE;
  IF pl.id IS NULL OR NOT coalesce(clinzo.can_edit_practice_schedule(actor,pl.doctor_facility_id),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501'; END IF;
  IF pl.status<>'pending' THEN RAISE EXCEPTION 'Only pending requests can be withdrawn' USING ERRCODE='22023'; END IF;
  UPDATE clinzo.shift_plan SET status='withdrawn',updated_at=now(),row_version=row_version+1 WHERE id=pl.id;
END $$;

-- Ends an active rotation from a date (unbooked shifts from then are cancelled).
-- Doctors at facilities that approve changes ask the facility instead.
CREATE FUNCTION public.end_shift_plan(p_practice_id uuid,p_mode text,p_from date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity(); pl clinzo.shift_plan; zone text; booked int;
BEGIN
  IF NOT coalesce(clinzo.can_edit_practice_schedule(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501'; END IF;
  IF clinzo.schedule_change_needs_approval(actor,p_practice_id) THEN
    RAISE EXCEPTION 'This facility approves schedule changes. Ask the facility to end the rotation.' USING ERRCODE='PT403'; END IF;
  SELECT * INTO pl FROM clinzo.shift_plan WHERE doctor_facility_id=p_practice_id AND service_mode=p_mode AND status='active' FOR UPDATE;
  IF pl.id IS NULL THEN RAISE EXCEPTION 'No active rotation for this service' USING ERRCODE='22023'; END IF;
  SELECT coalesce(nullif(d.booking_timezone,''),'Asia/Kolkata') INTO zone FROM clinzo.doctor d
    JOIN clinzo.doctor_facility p ON p.doctor_id=d.id WHERE p.id=p_practice_id;
  IF p_from IS NULL OR p_from<(now() AT TIME ZONE zone)::date THEN RAISE EXCEPTION 'Choose an end date from today' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO booked FROM clinzo.session s JOIN clinzo.appointment a ON a.session_id=s.id
    WHERE s.shift_plan_id=pl.id AND s.state<>'cancelled' AND (s.starts_at AT TIME ZONE zone)::date>=p_from
      AND a.status IN ('pending','confirmed','in_consultation') AND a.capacity_released_at IS NULL;
  IF booked>0 THEN RAISE EXCEPTION '% booked appointments are on shifts from that date. Move them or choose a later date.',booked USING ERRCODE='PT409'; END IF;
  UPDATE clinzo.session s SET state='cancelled' WHERE s.shift_plan_id=pl.id AND s.state IN ('published','open')
    AND (s.starts_at AT TIME ZONE zone)::date>=p_from AND NOT EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.session_id=s.id);
  UPDATE clinzo.shift_plan SET status=CASE WHEN p_from<=pl.effective_from THEN 'ended' ELSE status END,
    ended_from=p_from,updated_at=now(),row_version=row_version+1 WHERE id=pl.id;
END $$;

REVOKE ALL ON FUNCTION public.get_shift_plans(uuid),public.submit_shift_plan(uuid,text,jsonb,date),
  public.decide_shift_plan(uuid,boolean,text),public.list_facility_shift_plan_requests(),
  public.withdraw_shift_plan(uuid),public.end_shift_plan(uuid,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_shift_plans(uuid),public.submit_shift_plan(uuid,text,jsonb,date),
  public.decide_shift_plan(uuid,boolean,text),public.list_facility_shift_plan_requests(),
  public.withdraw_shift_plan(uuid),public.end_shift_plan(uuid,text,date) TO authenticated;

-- Limits on a shift come from its template and count that shift only.
CREATE OR REPLACE FUNCTION clinzo.remaining_clinic_channel_capacity(p_session_id uuid, p_source text, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
DECLARE target clinzo.session; settings clinzo.doctor_schedule_preferences; used_total int; used_channel int; channel_limit int;
  shift jsonb;
BEGIN
  SELECT * INTO target FROM clinzo.session WHERE id=p_session_id;
  IF target.id IS NULL THEN RETURN 0; END IF;
  shift:=clinzo.shift_template_for_session(target.id);
  IF shift IS NOT NULL THEN
    SELECT count(*)::int,count(*) FILTER (WHERE (a.source='patient_online')=(p_source='patient_online'))::int
      INTO used_total,used_channel
    FROM clinzo.appointment a WHERE a.session_id=target.id AND (p_exclude_id IS NULL OR a.id<>p_exclude_id)
      AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL)
        OR (a.status='pending' AND a.request_expires_at>now()));
    channel_limit:=CASE WHEN p_source='patient_online' THEN (shift->>'app_limit')::int ELSE (shift->>'walkin_limit')::int END;
    RETURN greatest(least((shift->>'app_limit')::int+(shift->>'walkin_limit')::int-used_total,channel_limit-used_channel),0);
  END IF;
  SELECT * INTO settings FROM clinzo.doctor_schedule_preferences WHERE doctor_facility_id=target.doctor_facility_id;
  IF settings.doctor_facility_id IS NULL THEN RETURN 2147483647; END IF;
  channel_limit:=CASE WHEN p_source='patient_online' THEN settings.clinic_app_daily_limit ELSE settings.clinic_walkin_daily_limit END;
  SELECT count(*)::int,count(*) FILTER (WHERE (a.source='patient_online')=(p_source='patient_online'))::int
    INTO used_total,used_channel
  FROM clinzo.appointment a JOIN clinzo.session s ON s.id=a.session_id
  WHERE s.booking_day_id=target.booking_day_id AND s.doctor_facility_id=target.doctor_facility_id
    AND s.shift_plan_id IS NULL
    AND clinzo.service_mode_for_session(s.id)='clinic' AND (p_exclude_id IS NULL OR a.id<>p_exclude_id)
    AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL)
      OR (a.status='pending' AND a.request_expires_at>now()));
  RETURN greatest(least(settings.walkin_daily_limit-used_total,channel_limit-used_channel),0);
END $function$;
REVOKE ALL ON FUNCTION clinzo.remaining_clinic_channel_capacity(uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION clinzo.remaining_daily_booking_capacity(p_session_id uuid, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
DECLARE target clinzo.session; settings clinzo.doctor_schedule_preferences; mode text; daily_limit int; reserved int;
  shift jsonb;
BEGIN
 SELECT * INTO target FROM clinzo.session WHERE id=p_session_id;
 IF target.id IS NULL THEN RETURN 0; END IF;
 mode:=clinzo.service_mode_for_session(target.id);
 shift:=clinzo.shift_template_for_session(target.id);
 IF shift IS NOT NULL THEN
   daily_limit:=CASE WHEN mode='clinic' THEN (shift->>'app_limit')::int+(shift->>'walkin_limit')::int
     ELSE (shift->>'daily_limit')::int END;
   SELECT count(*)::int INTO reserved FROM clinzo.appointment a WHERE a.session_id=target.id
     AND (p_exclude_id IS NULL OR a.id<>p_exclude_id)
     AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL)
       OR (a.status='pending' AND a.request_expires_at>now()));
   RETURN greatest(coalesce(daily_limit,0)-reserved,0);
 END IF;
 SELECT * INTO settings FROM clinzo.doctor_schedule_preferences WHERE doctor_facility_id=target.doctor_facility_id;
 -- Sessions explicitly published without recurring preferences retain their own capacity.
 IF settings.doctor_facility_id IS NULL THEN RETURN NULL; END IF;
 daily_limit:=CASE mode WHEN 'online' THEN settings.online_daily_limit
   WHEN 'home' THEN CASE WHEN settings.home_visits THEN 100 ELSE 0 END ELSE settings.walkin_daily_limit END;
 IF coalesce(daily_limit,0)<1 THEN RETURN 0; END IF;
 SELECT count(*)::int INTO reserved FROM clinzo.appointment a
 JOIN clinzo.session s ON s.id=a.session_id
 WHERE s.booking_day_id=target.booking_day_id AND s.doctor_facility_id=target.doctor_facility_id
   AND s.shift_plan_id IS NULL AND clinzo.service_mode_for_session(s.id)=mode
   AND (p_exclude_id IS NULL OR a.id<>p_exclude_id)
   AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL)
     OR (a.status='pending' AND a.request_expires_at>now()));
 RETURN greatest(daily_limit-reserved,0);
END $function$;
REVOKE ALL ON FUNCTION clinzo.remaining_daily_booking_capacity(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Reception's day view shows the shift's own limits on shift days.
DO $$
DECLARE definition text; marker text:='  SELECT count(*)::int,count(*) FILTER(WHERE a.source=''patient_online'')::int,count(*) FILTER(WHERE a.source<>''patient_online'')::int';
BEGIN
  definition:=pg_get_functiondef('public.get_portal_clinic_day(uuid,date)'::regprocedure);
  IF position(marker IN definition)=0 OR position('total_used int;' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected portal clinic day definition'; END IF;
  definition:=replace(definition,'total_used int;','total_used int; shift jsonb;');
  definition:=replace(definition,marker,'  SELECT clinzo.shift_template_for_session(s.id) INTO shift FROM clinzo.session s
    WHERE s.doctor_facility_id=p_practice_id AND s.shift_plan_id IS NOT NULL AND s.state<>''cancelled''
      AND (s.starts_at AT TIME ZONE zone)::date=day AND clinzo.service_mode_for_session(s.id)=''clinic''
    ORDER BY s.starts_at LIMIT 1;
  IF shift IS NOT NULL THEN
    settings.clinic_app_daily_limit:=(shift->>''app_limit'')::int;
    settings.clinic_walkin_daily_limit:=(shift->>''walkin_limit'')::int;
    settings.walkin_daily_limit:=(shift->>''app_limit'')::int+(shift->>''walkin_limit'')::int;
  END IF;
'||marker);
  EXECUTE definition;
END $$;
