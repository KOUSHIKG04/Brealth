-- Facility approval of a doctor's schedule, time-off and recovery-policy
-- changes at hospitals and at clinics the doctor does not run, and removal of
-- single-doctor clinics from the list other doctors can ask to join.
-- Requires 20261114095000_schedule_approval_rules.sql and
-- 20261114096000_schedule_preview_approval_guard.sql.

-- 1. Guard. Whatever RPC is used, a doctor cannot change such a practice's
-- schedule, rules or time off directly. Facility approvers (and workers, which
-- have no signed-in identity) are unaffected. Previews validate inside a
-- rolled-back subtransaction and mark themselves with clinzo.schedule_preview.
CREATE FUNCTION clinzo.guard_doctor_schedule_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
  IF coalesce(current_setting('clinzo.schedule_preview',true),'')='on' THEN RETURN NEW; END IF;
  actor:=clinzo.current_identity();
  IF actor IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='schedule_exception' AND NEW.doctor_facility_id IS NULL THEN
    -- Doctor-wide time off reaches every practice of the doctor.
    IF EXISTS(SELECT 1 FROM clinzo.doctor_facility p WHERE p.doctor_id=NEW.doctor_id AND p.active
        AND clinzo.schedule_change_needs_approval(actor,p.id)) THEN
      RAISE EXCEPTION 'A facility you work at approves time off. Submit a request for approval instead.'
        USING ERRCODE='PT403';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.doctor_facility_id IS NOT NULL
      AND clinzo.schedule_change_needs_approval(actor,NEW.doctor_facility_id) THEN
    RAISE EXCEPTION 'This facility approves schedule, time-off and policy changes. Submit a request for approval instead.'
      USING ERRCODE='PT403';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clinzo.guard_doctor_schedule_change() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER guard_doctor_schedule_change BEFORE INSERT OR UPDATE ON clinzo.doctor_schedule_preferences
  FOR EACH ROW EXECUTE FUNCTION clinzo.guard_doctor_schedule_change();
CREATE TRIGGER guard_doctor_schedule_change BEFORE INSERT OR UPDATE ON clinzo.schedule_rule
  FOR EACH ROW EXECUTE FUNCTION clinzo.guard_doctor_schedule_change();
CREATE TRIGGER guard_doctor_schedule_change BEFORE INSERT OR UPDATE ON clinzo.schedule_exception
  FOR EACH ROW EXECUTE FUNCTION clinzo.guard_doctor_schedule_change();

-- 2. Requests.
CREATE TABLE clinzo.schedule_change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_facility_id uuid NOT NULL REFERENCES clinzo.doctor_facility(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK(kind IN ('schedule','time_off_add','time_off_remove','recovery_policy')),
  service_mode text CHECK(service_mode IN ('clinic','online','home')),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  effective_from date,
  base_version bigint,
  note text CHECK(note IS NULL OR length(btrim(note)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','withdrawn','superseded','stale')),
  decision_reason text CHECK(decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 5 AND 500),
  requested_by uuid NOT NULL REFERENCES clinzo.identity(id),
  decided_by uuid REFERENCES clinzo.identity(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT schedule_change_request_mode_ck CHECK((kind='schedule')=(service_mode IS NOT NULL)),
  CONSTRAINT schedule_change_request_version_ck
    CHECK(kind NOT IN ('schedule','recovery_policy') OR base_version IS NOT NULL)
);
-- One pending schedule request per service and one pending policy request per
-- practice; a new submission supersedes the previous one.
CREATE UNIQUE INDEX schedule_change_request_one_pending
  ON clinzo.schedule_change_request(doctor_facility_id,kind,coalesce(service_mode,''))
  WHERE status='pending' AND kind IN ('schedule','recovery_policy');
CREATE INDEX schedule_change_request_practice_idx
  ON clinzo.schedule_change_request(doctor_facility_id,created_at DESC);
CREATE INDEX schedule_change_request_pending_idx
  ON clinzo.schedule_change_request(created_at) WHERE status='pending';
ALTER TABLE clinzo.schedule_change_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinzo.schedule_change_request FROM PUBLIC,anon,authenticated;

CREATE FUNCTION clinzo.schedule_change_request_json(p_request_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',r.id,'practice_id',r.doctor_facility_id,'facility_id',f.id,
    'facility_name',f.name,'facility_kind',f.kind,'doctor_name',d.full_name,'kind',r.kind,
    'service_mode',r.service_mode,'payload',r.payload,'effective_from',r.effective_from,
    'base_version',r.base_version::text,
    'current_version',(SELECT s.row_version::text FROM clinzo.doctor_schedule_preferences s
      WHERE s.doctor_facility_id=r.doctor_facility_id),
    -- Current settings (same keys as the request payload) for side-by-side review.
    'current_settings',(SELECT to_jsonb(s)-'row_version'-'created_at'-'updated_at'
      FROM clinzo.doctor_schedule_preferences s WHERE s.doctor_facility_id=r.doctor_facility_id),
    'note',r.note,'status',r.status,'decision_reason',r.decision_reason,
    'created_at',r.created_at,'decided_at',r.decided_at)
  FROM clinzo.schedule_change_request r
  JOIN clinzo.doctor_facility p ON p.id=r.doctor_facility_id
  JOIN clinzo.doctor d ON d.id=p.doctor_id
  JOIN clinzo.facility f ON f.id=p.facility_id
  WHERE r.id=p_request_id
$$;
REVOKE ALL ON FUNCTION clinzo.schedule_change_request_json(uuid) FROM PUBLIC,anon,authenticated;

-- A request no longer matches the practice when its settings changed since
-- submission, or the time off it removes is gone or was edited.
CREATE FUNCTION clinzo.schedule_change_request_is_stale(p_request_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE
    WHEN r.kind IN ('schedule','recovery_policy') THEN r.base_version IS DISTINCT FROM
      coalesce((SELECT s.row_version FROM clinzo.doctor_schedule_preferences s
        WHERE s.doctor_facility_id=r.doctor_facility_id),0)
    WHEN r.kind='time_off_remove' THEN NOT EXISTS(SELECT 1 FROM clinzo.schedule_exception e
      WHERE e.id=(r.payload->>'exception_id')::uuid AND e.state='active'
        AND e.row_version=(r.payload->>'expected_version')::bigint)
    ELSE false END
  FROM clinzo.schedule_change_request r WHERE r.id=p_request_id
$$;
REVOKE ALL ON FUNCTION clinzo.schedule_change_request_is_stale(uuid) FROM PUBLIC,anon,authenticated;

-- The requested start date, never earlier than today at the practice.
CREATE FUNCTION clinzo.schedule_change_request_effective_day(p_request_id uuid) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT greatest(coalesce(r.effective_from,(now() AT TIME ZONE d.booking_timezone)::date),
    (now() AT TIME ZONE d.booking_timezone)::date)
  FROM clinzo.schedule_change_request r
  JOIN clinzo.doctor_facility p ON p.id=r.doctor_facility_id
  JOIN clinzo.doctor d ON d.id=p.doctor_id
  WHERE r.id=p_request_id
$$;
REVOKE ALL ON FUNCTION clinzo.schedule_change_request_effective_day(uuid) FROM PUBLIC,anon,authenticated;

-- Tells the doctor about a decision through the existing push pipeline.
CREATE FUNCTION clinzo.notify_schedule_change_decision(p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r clinzo.schedule_change_request; recipient uuid; facility_name text; event_key uuid;
BEGIN
  SELECT * INTO r FROM clinzo.schedule_change_request WHERE id=p_request_id;
  SELECT d.identity_id,f.name INTO recipient,facility_name FROM clinzo.doctor_facility p
    JOIN clinzo.doctor d ON d.id=p.doctor_id JOIN clinzo.facility f ON f.id=p.facility_id
    WHERE p.id=r.doctor_facility_id;
  IF recipient IS NULL THEN RETURN; END IF;
  INSERT INTO clinzo.domain_event(event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,request_id,payload)
    VALUES('schedule.request_'||r.status,'schedule_change_request',r.id,1,r.decided_by,gen_random_uuid(),'{}')
    RETURNING id INTO event_key;
  INSERT INTO clinzo.notification_intent(recipient_id,event_id,template_key,dedup_key,safe_parameters,expires_at)
    VALUES(recipient,event_key,'schedule.request_'||r.status,'schedule-request:'||r.id||':'||r.status,
      jsonb_build_object('request_id',r.id,'practice_id',r.doctor_facility_id,'kind',r.kind,
        'facility_name',facility_name,'reason',r.decision_reason),
      now()+interval '30 days')
    ON CONFLICT(dedup_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION clinzo.notify_schedule_change_decision(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION clinzo.audit_schedule_change_request(p_request_id uuid,p_actor uuid,p_action text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO clinzo.audit_log(actor_id,actor_kind,action,resource_type,resource_id,facility_id,request_id,outcome,metadata)
  SELECT p_actor,'identity',p_action,'schedule_change_request',r.id,p.facility_id,gen_random_uuid(),'allowed',
    jsonb_build_object('kind',r.kind,'service_mode',r.service_mode,'practice_id',r.doctor_facility_id)
  FROM clinzo.schedule_change_request r JOIN clinzo.doctor_facility p ON p.id=r.doctor_facility_id
  WHERE r.id=p_request_id
$$;
REVOKE ALL ON FUNCTION clinzo.audit_schedule_change_request(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

-- 3. Doctor operations.
CREATE FUNCTION public.submit_schedule_change_request(
  p_practice_id uuid,p_kind text,p_payload jsonb,p_service_mode text DEFAULT NULL,
  p_effective_from date DEFAULT NULL,p_expected_version bigint DEFAULT NULL,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.current_identity(); request_id uuid; starts timestamptz; ends timestamptz;
BEGIN
  IF actor IS NULL OR NOT coalesce(clinzo.can_edit_practice_schedule(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501'; END IF;
  IF NOT clinzo.schedule_change_needs_approval(actor,p_practice_id) THEN
    RAISE EXCEPTION 'This practice does not need approval. Publish the change directly.' USING ERRCODE='22023'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('schedule','time_off_add','time_off_remove','recovery_policy') THEN
    RAISE EXCEPTION 'Choose what to change' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Request details are required' USING ERRCODE='22023'; END IF;
  IF p_kind='schedule' THEN
    IF p_service_mode IS NULL OR p_service_mode NOT IN ('clinic','online','home') OR p_expected_version IS NULL THEN
      RAISE EXCEPTION 'Choose a service and review the current schedule' USING ERRCODE='22023'; END IF;
    -- Validates settings, version and start date exactly as publishing would.
    PERFORM public.preview_doctor_schedule_change(p_practice_id,p_service_mode,p_payload,p_expected_version,p_effective_from);
  ELSIF p_kind='recovery_policy' THEN
    IF p_expected_version IS NULL
        OR NOT p_payload ?& ARRAY['online_grace_minutes','clinic_grace_minutes','reschedule_cutoff_minutes','max_self_reschedules']
        OR EXISTS(SELECT 1 FROM jsonb_each(p_payload) e WHERE jsonb_typeof(e.value)<>'number') THEN
      RAISE EXCEPTION 'Complete every policy setting' USING ERRCODE='22023'; END IF;
  ELSIF p_kind='time_off_add' THEN
    starts:=(p_payload->>'starts_at')::timestamptz;
    ends:=(p_payload->>'ends_at')::timestamptz;
    IF starts IS NULL OR ends IS NULL OR ends<=starts OR ends<=now()
        OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 2 AND 500
        OR jsonb_typeof(p_payload->'service_modes') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Enter a future time-off period and a reason' USING ERRCODE='22023'; END IF;
  ELSE
    IF (p_payload->>'expected_version') IS NULL OR NOT EXISTS(SELECT 1 FROM clinzo.schedule_exception e
        WHERE e.id=(p_payload->>'exception_id')::uuid AND e.doctor_facility_id=p_practice_id AND e.state='active') THEN
      RAISE EXCEPTION 'Choose an active time-off entry' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_kind IN ('schedule','recovery_policy') THEN
    UPDATE clinzo.schedule_change_request SET status='superseded',decided_at=now()
      WHERE doctor_facility_id=p_practice_id AND kind=p_kind
        AND coalesce(service_mode,'')=coalesce(p_service_mode,'') AND status='pending';
  END IF;
  INSERT INTO clinzo.schedule_change_request(doctor_facility_id,kind,service_mode,payload,effective_from,
      base_version,note,requested_by)
    VALUES(p_practice_id,p_kind,CASE WHEN p_kind='schedule' THEN p_service_mode END,p_payload,
      CASE WHEN p_kind='schedule' THEN p_effective_from END,
      CASE WHEN p_kind IN ('schedule','recovery_policy') THEN p_expected_version END,
      nullif(btrim(coalesce(p_note,'')),''),actor)
    RETURNING id INTO request_id;
  PERFORM clinzo.audit_schedule_change_request(request_id,actor,'schedule_change.requested');
  PERFORM clinzo.emit_practice_change(p_practice_id,'schedule');
  RETURN clinzo.schedule_change_request_json(request_id);
END $$;
REVOKE ALL ON FUNCTION public.submit_schedule_change_request(uuid,text,jsonb,text,date,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_schedule_change_request(uuid,text,jsonb,text,date,bigint,text) TO authenticated;

CREATE FUNCTION public.withdraw_schedule_change_request(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.current_identity(); r clinzo.schedule_change_request;
BEGIN
  SELECT * INTO r FROM clinzo.schedule_change_request WHERE id=p_request_id FOR UPDATE;
  IF r.id IS NULL OR actor IS NULL OR r.requested_by<>actor THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE='42501'; END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION 'Only pending requests can be withdrawn' USING ERRCODE='22023'; END IF;
  UPDATE clinzo.schedule_change_request SET status='withdrawn',decided_at=now() WHERE id=r.id;
  PERFORM clinzo.audit_schedule_change_request(r.id,actor,'schedule_change.withdrawn');
  PERFORM clinzo.emit_practice_change(r.doctor_facility_id,'schedule');
  RETURN clinzo.schedule_change_request_json(r.id);
END $$;
REVOKE ALL ON FUNCTION public.withdraw_schedule_change_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_schedule_change_request(uuid) TO authenticated;

CREATE FUNCTION public.list_my_schedule_change_requests(p_practice_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(clinzo.schedule_change_request_json(x.id) ORDER BY x.created_at DESC),'[]'::jsonb)
  FROM (SELECT r.id,r.created_at FROM clinzo.schedule_change_request r
    JOIN clinzo.doctor_facility p ON p.id=r.doctor_facility_id
    JOIN clinzo.doctor d ON d.id=p.doctor_id
    WHERE d.identity_id=clinzo.current_identity()
      AND (p_practice_id IS NULL OR r.doctor_facility_id=p_practice_id)
    ORDER BY r.created_at DESC LIMIT 50) x
$$;
REVOKE ALL ON FUNCTION public.list_my_schedule_change_requests(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_schedule_change_requests(uuid) TO authenticated;

-- 4. Approver operations (facility owners and administrators).
CREATE FUNCTION public.list_facility_schedule_change_requests(p_status text DEFAULT 'pending') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.current_identity();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','approved','rejected','withdrawn','superseded','stale') THEN
    RAISE EXCEPTION 'Unknown request status' USING ERRCODE='22023'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(clinzo.schedule_change_request_json(x.id) ORDER BY x.created_at),'[]'::jsonb)
    FROM (SELECT r.id,r.created_at FROM clinzo.schedule_change_request r
      WHERE (p_status IS NULL OR r.status=p_status)
        AND clinzo.can_approve_practice_changes(actor,r.doctor_facility_id)
      ORDER BY r.created_at DESC LIMIT 100) x);
END $$;
REVOKE ALL ON FUNCTION public.list_facility_schedule_change_requests(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_facility_schedule_change_requests(text) TO authenticated;

CREATE FUNCTION clinzo.lock_reviewable_schedule_request(p_request_id uuid,p_actor uuid)
RETURNS clinzo.schedule_change_request LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r clinzo.schedule_change_request;
BEGIN
  SELECT * INTO r FROM clinzo.schedule_change_request WHERE id=p_request_id FOR UPDATE;
  IF r.id IS NULL OR NOT clinzo.can_approve_practice_changes(p_actor,r.doctor_facility_id) THEN
    RAISE EXCEPTION 'Facility owner or administrator required' USING ERRCODE='42501'; END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION 'This request was already decided' USING ERRCODE='PT409'; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION clinzo.lock_reviewable_schedule_request(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Marks a request stale and tells the doctor; callers return instead of
-- raising so the status change is kept.
CREATE FUNCTION clinzo.mark_schedule_request_stale(p_request_id uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE practice uuid;
BEGIN
  UPDATE clinzo.schedule_change_request SET status='stale',decided_by=p_actor,decided_at=now()
    WHERE id=p_request_id RETURNING doctor_facility_id INTO practice;
  PERFORM clinzo.notify_schedule_change_decision(p_request_id);
  PERFORM clinzo.audit_schedule_change_request(p_request_id,p_actor,'schedule_change.stale');
  PERFORM clinzo.emit_practice_change(practice,'schedule');
  RETURN jsonb_build_object('status','stale','request',clinzo.schedule_change_request_json(p_request_id));
END $$;
REVOKE ALL ON FUNCTION clinzo.mark_schedule_request_stale(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- The approver reviews conflicts and affected bookings before approving a
-- schedule request; the returned token is required by the approval.
CREATE FUNCTION public.preview_schedule_change_request(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.current_identity(); r clinzo.schedule_change_request;
BEGIN
  r:=clinzo.lock_reviewable_schedule_request(p_request_id,actor);
  IF r.kind<>'schedule' THEN RAISE EXCEPTION 'Only schedule requests have a preview' USING ERRCODE='22023'; END IF;
  IF clinzo.schedule_change_request_is_stale(r.id) THEN
    RETURN clinzo.mark_schedule_request_stale(r.id,actor); END IF;
  RETURN jsonb_build_object('status','pending','preview',
    public.preview_doctor_schedule_change(r.doctor_facility_id,r.service_mode,r.payload,r.base_version,
      clinzo.schedule_change_request_effective_day(r.id)));
END $$;
REVOKE ALL ON FUNCTION public.preview_schedule_change_request(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_schedule_change_request(uuid) TO authenticated;

-- Applies the request through the existing owners as the approver: the checked
-- publisher (or conflict resolution), the time-off RPCs and the recovery-policy
-- RPC keep every validation, lock and booking protection.
CREATE FUNCTION public.approve_schedule_change_request(
  p_request_id uuid,p_preview_token text DEFAULT NULL,p_strategy text DEFAULT NULL,p_patient_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.current_identity(); r clinzo.schedule_change_request; result jsonb; day date;
BEGIN
  r:=clinzo.lock_reviewable_schedule_request(p_request_id,actor);
  IF clinzo.schedule_change_request_is_stale(r.id) THEN
    RETURN clinzo.mark_schedule_request_stale(r.id,actor); END IF;
  IF r.kind='schedule' THEN
    IF p_preview_token IS NULL THEN
      RAISE EXCEPTION 'Review the schedule preview before approving' USING ERRCODE='22023'; END IF;
    day:=clinzo.schedule_change_request_effective_day(r.id);
    IF p_strategy IS NULL THEN
      result:=public.publish_previewed_doctor_schedule(r.doctor_facility_id,r.service_mode,r.payload,
        r.base_version,day,p_preview_token);
    ELSE
      result:=public.resolve_doctor_schedule_conflicts(r.doctor_facility_id,r.service_mode,r.payload,
        r.base_version,day,p_preview_token,p_strategy,coalesce(p_patient_reason,''));
    END IF;
  ELSIF r.kind='recovery_policy' THEN
    result:=public.set_appointment_recovery_policy(r.doctor_facility_id,r.base_version,
      (r.payload->>'online_grace_minutes')::integer,(r.payload->>'reschedule_cutoff_minutes')::integer,
      (r.payload->>'max_self_reschedules')::integer,(r.payload->>'clinic_grace_minutes')::integer);
  ELSIF r.kind='time_off_add' THEN
    result:=to_jsonb(public.add_doctor_unavailability_for_services(r.doctor_facility_id,
      (r.payload->>'starts_at')::timestamptz,(r.payload->>'ends_at')::timestamptz,r.payload->>'reason',
      ARRAY(SELECT jsonb_array_elements_text(r.payload->'service_modes'))));
  ELSE
    result:=to_jsonb(public.revoke_clinic_unavailability((r.payload->>'exception_id')::uuid,
      (r.payload->>'expected_version')::bigint));
  END IF;
  UPDATE clinzo.schedule_change_request SET status='approved',decided_by=actor,decided_at=now() WHERE id=r.id;
  PERFORM clinzo.notify_schedule_change_decision(r.id);
  PERFORM clinzo.audit_schedule_change_request(r.id,actor,'schedule_change.approved');
  PERFORM clinzo.emit_practice_change(r.doctor_facility_id,'schedule');
  RETURN jsonb_build_object('status','approved','request',clinzo.schedule_change_request_json(r.id),'result',result);
END $$;
REVOKE ALL ON FUNCTION public.approve_schedule_change_request(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_schedule_change_request(uuid,text,text,text) TO authenticated;

CREATE FUNCTION public.reject_schedule_change_request(p_request_id uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.current_identity(); r clinzo.schedule_change_request;
BEGIN
  r:=clinzo.lock_reviewable_schedule_request(p_request_id,actor);
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Enter the reason the doctor will receive (5–500 characters)' USING ERRCODE='22023'; END IF;
  UPDATE clinzo.schedule_change_request SET status='rejected',decision_reason=btrim(p_reason),
    decided_by=actor,decided_at=now() WHERE id=r.id;
  PERFORM clinzo.notify_schedule_change_decision(r.id);
  PERFORM clinzo.audit_schedule_change_request(r.id,actor,'schedule_change.rejected');
  PERFORM clinzo.emit_practice_change(r.doctor_facility_id,'schedule');
  RETURN jsonb_build_object('status','rejected','request',clinzo.schedule_change_request_json(r.id));
END $$;
REVOKE ALL ON FUNCTION public.reject_schedule_change_request(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_schedule_change_request(uuid,text) TO authenticated;

-- 5. A doctor's own single-doctor clinic (created by solo onboarding, the
-- doctor is its owner) does not take other doctors: its owner has no portal
-- account to approve them. Such clinics leave the join list.
CREATE FUNCTION clinzo.is_doctor_owned_facility(p_facility uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM clinzo.facility f
    JOIN clinzo.organization_member m ON m.organization_id=f.organization_id AND m.active AND m.role='owner'
    JOIN clinzo.doctor d ON d.identity_id=m.identity_id
    WHERE f.id=p_facility)
$$;
REVOKE ALL ON FUNCTION clinzo.is_doctor_owned_facility(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.list_registered_care_facilities() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'kind',f.kind,
    'address',f.address) ORDER BY f.name,f.id),'[]'::jsonb)
  FROM (SELECT f.id,f.name,f.kind,f.address FROM clinzo.facility f
    JOIN clinzo.organization o ON o.id=f.organization_id
    WHERE f.active AND f.verification_status='verified' AND o.active
      AND o.kind='care_provider' AND NOT clinzo.is_doctor_owned_facility(f.id)
    ORDER BY f.name,f.id LIMIT 200) f;
$$;

CREATE OR REPLACE FUNCTION public.request_my_doctor_facility(p_facility_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := clinzo.require_identity(); my_doctor_id uuid; request_id uuid;
BEGIN
  SELECT id INTO my_doctor_id FROM clinzo.doctor WHERE identity_id=actor AND active
    AND credential_status IN ('pending','verified');
  IF my_doctor_id IS NULL THEN RAISE EXCEPTION 'Doctor profile required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clinzo.facility f JOIN clinzo.organization o ON o.id=f.organization_id
    WHERE f.id=p_facility_id AND f.active AND f.verification_status='verified'
      AND o.active AND o.kind='care_provider') THEN
    RAISE EXCEPTION 'Select a verified, registered hospital or clinic' USING ERRCODE='22023'; END IF;
  IF clinzo.is_doctor_owned_facility(p_facility_id) THEN
    RAISE EXCEPTION 'This clinic is a doctor''s own practice and does not accept other doctors' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM clinzo.doctor_facility df WHERE df.doctor_id=my_doctor_id AND df.facility_id=p_facility_id) THEN
    RAISE EXCEPTION 'Already associated with this facility' USING ERRCODE='22023'; END IF;
  INSERT INTO clinzo.doctor_facility_request(doctor_id,facility_id)
    VALUES(my_doctor_id,p_facility_id)
    ON CONFLICT(doctor_id,facility_id) DO UPDATE SET status='pending',updated_at=now(),
      reviewed_at=NULL,reviewed_by=NULL,rejection_reason=NULL
    WHERE clinzo.doctor_facility_request.status='rejected'
    RETURNING id INTO request_id;
  IF request_id IS NULL THEN
    SELECT id INTO request_id FROM clinzo.doctor_facility_request
      WHERE doctor_facility_request.doctor_id=my_doctor_id AND facility_id=p_facility_id;
  END IF;
  RETURN request_id;
END $$;

-- Requests already sent to such clinics could never be decided; close them.
UPDATE clinzo.doctor_facility_request r
  SET status='rejected',updated_at=now(),reviewed_at=now(),
    rejection_reason='This clinic is a doctor''s own practice and does not accept other doctors.'
  WHERE r.status='pending' AND clinzo.is_doctor_owned_facility(r.facility_id);
