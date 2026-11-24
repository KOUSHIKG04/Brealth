-- Numbered reservations belong to appointment windows, not booking order.
-- Sessions already containing appointments keep their issued numbers. Never
-- silently renumber an existing patient's token during deployment.
ALTER TABLE clinzo.appointment_window ADD COLUMN queue_number_base integer CHECK(queue_number_base>0);
ALTER TABLE clinzo.appointment ADD COLUMN planned_queue_number integer CHECK(planned_queue_number>0);
ALTER TABLE clinzo.doctor_schedule_preferences ADD COLUMN clinic_grace_minutes integer NOT NULL DEFAULT 10 CHECK(clinic_grace_minutes BETWEEN 0 AND 180);
CREATE UNIQUE INDEX appointment_planned_queue_uq ON clinzo.appointment(session_id,planned_queue_number)
  WHERE planned_queue_number IS NOT NULL AND status IN ('pending','confirmed','in_consultation','completed');
DROP INDEX clinzo.queue_entry_uq_2;
CREATE UNIQUE INDEX queue_entry_uq_2 ON clinzo.queue_entry(queue_id,ticket_number) WHERE state NOT IN ('cancelled','no_show');

CREATE FUNCTION clinzo.reserve_clinic_queue_position() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE base_number integer; capacity integer; reserved_number integer; offset_number integer;
BEGIN
  -- Runs after the existing service-mode derivation triggers.
  IF NEW.visit_mode<>'clinic' THEN RETURN NEW; END IF;
  PERFORM 1 FROM clinzo.session WHERE id=NEW.session_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM clinzo.appointment WHERE session_id=NEW.session_id AND planned_queue_number IS NULL) THEN
    RETURN NEW; -- compatibility for already-issued legacy session tokens
  END IF;
  UPDATE clinzo.appointment SET status='rejected',decision_reason='Request expired'
    WHERE session_id=NEW.session_id AND status='pending' AND request_expires_at<=now();
  SELECT coalesce(max(queue_number_base+hard_capacity-1),0) INTO offset_number
    FROM clinzo.appointment_window WHERE session_id=NEW.session_id;
  WITH numbered AS (
    SELECT id,offset_number+1+coalesce(sum(hard_capacity) OVER(ORDER BY starts_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::integer AS first_number
    FROM clinzo.appointment_window WHERE session_id=NEW.session_id AND queue_number_base IS NULL
  ) UPDATE clinzo.appointment_window w SET queue_number_base=n.first_number FROM numbered n WHERE w.id=n.id;
  SELECT queue_number_base,hard_capacity INTO base_number,capacity FROM clinzo.appointment_window WHERE id=NEW.window_id;
  SELECT n INTO reserved_number FROM generate_series(base_number,base_number+capacity-1) n
    WHERE NOT EXISTS(SELECT 1 FROM clinzo.appointment a WHERE a.session_id=NEW.session_id AND a.planned_queue_number=n
      AND a.status IN ('pending','confirmed','in_consultation','completed')) ORDER BY n LIMIT 1;
  IF reserved_number IS NULL THEN RAISE EXCEPTION 'Appointment position is already reserved; refresh available times' USING ERRCODE='PT409'; END IF;
  NEW.planned_queue_number:=reserved_number;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_reserve_clinic_queue_position BEFORE INSERT ON clinzo.appointment
  FOR EACH ROW EXECUTE FUNCTION clinzo.reserve_clinic_queue_position();
REVOKE ALL ON FUNCTION clinzo.reserve_clinic_queue_position() FROM PUBLIC,anon,authenticated;

-- All booking, payment-confirmation and rescheduling paths already create their
-- queue entry in a locked transaction. Apply the reserved number in that owner.
CREATE FUNCTION clinzo.apply_clinic_queue_position() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a clinzo.appointment; booked_at timestamptz; grace integer; arrived_at timestamptz;
BEGIN
  SELECT * INTO a FROM clinzo.appointment WHERE id=NEW.appointment_id;
  IF TG_OP='INSERT' AND a.planned_queue_number IS NOT NULL THEN NEW.ticket_number:=a.planned_queue_number; END IF;
  IF NEW.state='waiting' AND (TG_OP='INSERT' OR OLD.state='awaiting_arrival') THEN
    SELECT CASE WHEN a.source='patient_online' THEN w.starts_at ELSE greatest(w.starts_at,a.created_at) END,coalesce(p.clinic_grace_minutes,10) INTO booked_at,grace
      FROM clinzo.appointment_window w JOIN clinzo.session s ON s.id=w.session_id
      LEFT JOIN clinzo.doctor_schedule_preferences p ON p.doctor_facility_id=s.doctor_facility_id WHERE w.id=a.window_id;
    SELECT created_at INTO arrived_at FROM clinzo.appointment_checkin WHERE appointment_id=a.id;
    IF arrived_at>booked_at+make_interval(mins=>grace) THEN
      NEW.state:='held'; NEW.hold_reason:='Late arrival: reception review required';
    END IF;
  ELSIF TG_OP='UPDATE' AND NEW.state='waiting' AND OLD.state='held' AND OLD.hold_reason='Late arrival: reception review required' THEN
    -- Explicit staff admission uses today's recovery time, never an expired
    -- original position to jump ahead of patients who arrived on time.
    NEW.order_key:=greatest(NEW.order_key,extract(epoch FROM now())::bigint);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER apply_clinic_queue_position BEFORE INSERT OR UPDATE ON clinzo.queue_entry
  FOR EACH ROW EXECUTE FUNCTION clinzo.apply_clinic_queue_position();
REVOKE ALL ON FUNCTION clinzo.apply_clinic_queue_position() FROM PUBLIC,anon,authenticated;

-- A video/home start cannot displace an already called clinic patient. The
-- existing unique active-consultation index remains the final exclusivity guard.
CREATE FUNCTION clinzo.guard_consultation_queue_call() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status<>'active' THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.doctor_id::text,0));
  IF EXISTS(SELECT 1 FROM clinzo.queue_entry q JOIN clinzo.session_queue sq ON sq.id=q.queue_id
    JOIN clinzo.session s ON s.id=sq.session_id WHERE s.doctor_id=NEW.doctor_id
    AND q.state IN ('called','in_service') AND q.appointment_id<>NEW.appointment_id) THEN
    RAISE EXCEPTION 'Finish or hold the patient already called before starting another consultation' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_consultation_queue_call BEFORE INSERT OR UPDATE OF status ON clinzo.consultation
  FOR EACH ROW EXECUTE FUNCTION clinzo.guard_consultation_queue_call();
REVOKE ALL ON FUNCTION clinzo.guard_consultation_queue_call() FROM PUBLIC,anon,authenticated;

-- One ordering owner is used by call validation, patient counts and estimates.
-- Absent/held patients never block the ready queue. A future patient can be
-- offered early service only after all ready, due patients have been considered.
CREATE FUNCTION clinzo.clinic_ready_queue(p_session_id uuid,p_now timestamptz DEFAULT now())
RETURNS TABLE(appointment_id uuid,ticket_number integer,queue_rank bigint,due_at timestamptz,duration_minutes integer)
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT q.appointment_id,q.ticket_number,
    row_number() OVER(ORDER BY CASE WHEN q.state IN ('called','in_service') THEN 0 ELSE 1 END,
      q.priority DESC,CASE WHEN to_timestamp(q.order_key)<=p_now THEN 0 ELSE 1 END,q.order_key,q.ticket_number,q.id),
    to_timestamp(q.order_key),greatest(1,extract(epoch FROM w.ends_at-w.starts_at)::integer/60)
  FROM clinzo.session target JOIN clinzo.session current_session ON current_session.doctor_id=target.doctor_id
    AND current_session.doctor_facility_id=target.doctor_facility_id
    AND (current_session.starts_at AT TIME ZONE target.timezone)::date=(target.starts_at AT TIME ZONE target.timezone)::date
    AND current_session.state IN ('published','open')
    AND (current_session.id=target.id OR current_session.starts_at<=p_now)
  JOIN clinzo.session_queue sq ON sq.session_id=current_session.id JOIN clinzo.queue_entry q ON q.queue_id=sq.id
  JOIN clinzo.appointment a ON a.id=q.appointment_id JOIN clinzo.appointment_window w ON w.id=a.window_id
  WHERE target.id=p_session_id AND a.visit_mode='clinic' AND q.state IN ('waiting','called','in_service')
    AND a.status IN ('confirmed','in_consultation')
    AND EXISTS(SELECT 1 FROM clinzo.appointment_checkin c WHERE c.appointment_id=a.id);
$$;
REVOKE ALL ON FUNCTION clinzo.clinic_ready_queue(uuid,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION clinzo.clinic_queue_details(p_appointment_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('planned_number',a.planned_queue_number,'position',r.queue_rank,
    'patients_ahead',greatest(coalesce(r.queue_rank-1,0),0),'currently_serving',active.ticket_number,
    'late_review_required',q.state='held' AND q.hold_reason='Late arrival: reception review required',
    'grace_minutes',coalesce(p.clinic_grace_minutes,10),
    'can_call',q.state='waiting' AND r.queue_rank=1 AND s.state IN ('published','open') AND now()>=s.starts_at
      AND (now() AT TIME ZONE s.timezone)::date=(s.starts_at AT TIME ZONE s.timezone)::date
      AND NOT EXISTS(SELECT 1 FROM clinzo.queue_entry busy JOIN clinzo.session_queue bq ON bq.id=busy.queue_id
        JOIN clinzo.session bs ON bs.id=bq.session_id WHERE bs.doctor_id=s.doctor_id AND busy.state IN ('called','in_service'))
      AND NOT EXISTS(SELECT 1 FROM clinzo.consultation c WHERE c.doctor_id=s.doctor_id AND c.status='active')
      AND NOT EXISTS(SELECT 1 FROM clinzo.session other WHERE other.doctor_id=s.doctor_id AND other.id<>s.id
        AND other.state IN ('published','open') AND other.starts_at<=now() AND other.ends_at>now()
        AND (other.doctor_facility_id<>s.doctor_facility_id OR clinzo.service_mode_for_session(other.id)<>'clinic'))
      AND NOT EXISTS(SELECT 1 FROM clinzo.schedule_exception e WHERE e.doctor_id=s.doctor_id AND e.state='active'
        AND (e.doctor_facility_id IS NULL OR e.doctor_facility_id=s.doctor_facility_id)
        AND e.service_mode IN ('all','clinic') AND e.starts_at<=now() AND e.ends_at>now()),
    'estimated_start',CASE WHEN q.state='waiting' THEN greatest(w.starts_at,now()+make_interval(mins=>coalesce(work.minutes,0))) END,
    'estimated_end',CASE WHEN q.state='waiting' THEN greatest(w.starts_at,now()+make_interval(mins=>coalesce(work.minutes,0)))
      +make_interval(mins=>greatest(5,coalesce(r.duration_minutes,10))) END,
    'updated_at',now())
  FROM clinzo.appointment a JOIN clinzo.session s ON s.id=a.session_id JOIN clinzo.appointment_window w ON w.id=a.window_id
  LEFT JOIN clinzo.doctor_schedule_preferences p ON p.doctor_facility_id=s.doctor_facility_id
  LEFT JOIN clinzo.queue_entry q ON q.appointment_id=a.id
  LEFT JOIN LATERAL(SELECT * FROM clinzo.clinic_ready_queue(s.id) ready WHERE ready.appointment_id=a.id) r ON true
  LEFT JOIN LATERAL(SELECT busy.ticket_number FROM clinzo.queue_entry busy JOIN clinzo.session_queue bq ON bq.id=busy.queue_id
    JOIN clinzo.session bs ON bs.id=bq.session_id WHERE bs.doctor_id=s.doctor_id AND busy.state IN ('called','in_service') LIMIT 1) active ON true
  LEFT JOIN LATERAL(SELECT sum(ready.duration_minutes)::integer AS minutes FROM clinzo.clinic_ready_queue(s.id) ready WHERE ready.queue_rank<r.queue_rank) work ON true
  WHERE a.id=p_appointment_id AND a.visit_mode='clinic';
$$;
REVOKE ALL ON FUNCTION clinzo.clinic_queue_details(uuid) FROM PUBLIC,anon,authenticated;

DO $$
DECLARE definition text; marker text;
BEGIN
  definition:=pg_get_functiondef('public.list_care_appointments(uuid)'::regprocedure);
  marker:='items.value || jsonb_build_object(';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected appointment projection'; END IF;
  definition:=replace(definition,marker,'items.value || CASE WHEN a.visit_mode=''clinic'' THEN jsonb_build_object(''clinic_queue'',clinzo.clinic_queue_details(a.id),''ticket_number'',coalesce(a.planned_queue_number,(items.value->>''ticket_number'')::integer),''ahead_count'',coalesce((clinzo.clinic_queue_details(a.id)->>''patients_ahead'')::integer,0)) ELSE ''{}''::jsonb END || jsonb_build_object(');
  EXECUTE definition;
  definition:=pg_get_functiondef('public.get_my_schedule_preferences(uuid)'::regprocedure);
  IF position('''row_version'',s.row_version::text' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected settings projection'; END IF;
  EXECUTE replace(definition,'''row_version'',s.row_version::text','''clinic_grace_minutes'',s.clinic_grace_minutes,''row_version'',s.row_version::text');

  definition:=replace(pg_get_functiondef('public.transition_clinic_appointment(uuid,bigint,text,text)'::regprocedure),chr(13),'');
  marker:='SELECT s0.* INTO s FROM clinzo.session s0 JOIN clinzo.appointment a0 ON a0.session_id=s0.id WHERE a0.id=p_appointment_id FOR UPDATE OF s0;';
  IF position(marker IN definition)=0 OR position('ORDER BY next_entry.priority DESC,next_entry.order_key,next_entry.ticket_number LIMIT 1' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected clinic transition owner'; END IF;
  definition:=replace(definition,marker,'PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s0.doctor_id::text,0)) FROM clinzo.session s0 JOIN clinzo.appointment a0 ON a0.session_id=s0.id WHERE a0.id=p_appointment_id;
  '||marker);
  marker:='SELECT next_entry.appointment_id FROM clinzo.queue_entry next_entry'||chr(10)||'        WHERE next_entry.queue_id=q.id AND next_entry.state=''waiting'''||chr(10)||'        ORDER BY next_entry.priority DESC,next_entry.order_key,next_entry.ticket_number LIMIT 1';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected next patient selector'; END IF;
  definition:=replace(definition,marker,'SELECT ready.appointment_id FROM clinzo.clinic_ready_queue(s.id) ready ORDER BY ready.queue_rank LIMIT 1');
  definition:=replace(definition,'UPDATE clinzo.queue_entry SET state=''called'',called_at=now() WHERE appointment_id=a.id;',
    'IF NOT coalesce((clinzo.clinic_queue_details(a.id)->>''can_call'')::boolean,false) THEN RAISE EXCEPTION ''Doctor unavailable or another patient must be called first; refresh the queue'' USING ERRCODE=''22023''; END IF;
    UPDATE clinzo.queue_entry SET state=''called'',called_at=now() WHERE appointment_id=a.id;');
  EXECUTE definition;
END $$;

-- Preserve the old five-argument API for installed clients. New clients save
-- both policies together under the same existing optimistic settings lock.
CREATE FUNCTION public.set_appointment_recovery_policy(p_practice_id uuid,p_expected_version bigint,p_online_grace_minutes integer,p_reschedule_cutoff_minutes integer,p_max_self_reschedules integer,p_clinic_grace_minutes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_clinic_grace_minutes IS NULL OR p_clinic_grace_minutes NOT BETWEEN 0 AND 180 THEN RAISE EXCEPTION 'Invalid clinic grace period' USING ERRCODE='22023'; END IF;
  PERFORM public.set_appointment_recovery_policy(p_practice_id,p_expected_version,p_online_grace_minutes,p_reschedule_cutoff_minutes,p_max_self_reschedules);
  UPDATE clinzo.doctor_schedule_preferences SET clinic_grace_minutes=p_clinic_grace_minutes WHERE doctor_facility_id=p_practice_id;
  RETURN public.get_my_schedule_preferences(p_practice_id);
END $$;
REVOKE ALL ON FUNCTION public.set_appointment_recovery_policy(uuid,bigint,integer,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_appointment_recovery_policy(uuid,bigint,integer,integer,integer,integer) TO authenticated;

-- Reception may fill the currently open window, never an expired historical
-- position. Keep all existing capacity, authorization and payment checks.
DO $$
DECLARE definition text; owner regprocedure;
BEGIN
  FOR owner IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='book_portal_walk_in_appointment' LOOP
    definition:=pg_get_functiondef(owner);
    IF definition !~ 'w\.starts_at[[:space:]]*<=[[:space:]]*now\(\)' THEN RAISE EXCEPTION 'Unexpected walk-in booking owner'; END IF;
    EXECUTE regexp_replace(definition,'w\.starts_at[[:space:]]*<=[[:space:]]*now\(\)','w.ends_at<=now()','g');
  END LOOP;
  definition:=pg_get_functiondef('public.get_portal_clinic_day(uuid,date)'::regprocedure);
  IF position('WHEN w.starts_at<=now() THEN ''past''' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected reception availability projection'; END IF;
  EXECUTE replace(definition,'WHEN w.starts_at<=now() THEN ''past''','WHEN w.ends_at<=now() THEN ''past''');
END $$;
