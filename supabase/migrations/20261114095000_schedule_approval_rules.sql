-- Who may change a practice's schedule directly.
-- A doctor's own facility (where the doctor is its owner or an administrator)
-- is direct. At hospitals and at clinics run by someone else, the facility
-- approves the doctor's schedule, time-off and recovery-policy changes.
-- Facility owners and administrators always act directly.

CREATE FUNCTION clinzo.current_identity() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT i.id FROM clinzo.identity i
  WHERE i.issuer='supabase' AND i.subject=auth.uid()::text AND i.disabled_at IS NULL
$$;
REVOKE ALL ON FUNCTION clinzo.current_identity() FROM PUBLIC,anon,authenticated;

-- True when the practice's doctor runs its facility (owner or administrator).
CREATE FUNCTION clinzo.doctor_runs_practice_facility(p_practice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1 FROM clinzo.doctor_facility p
    JOIN clinzo.doctor d ON d.id=p.doctor_id
    JOIN clinzo.facility f ON f.id=p.facility_id
    JOIN clinzo.organization_member m ON m.organization_id=f.organization_id
      AND m.identity_id=d.identity_id AND m.active
      AND (m.facility_id IS NULL OR m.facility_id=f.id)
      AND m.role IN ('owner','organization_admin','facility_admin')
    WHERE p.id=p_practice)
$$;
REVOKE ALL ON FUNCTION clinzo.doctor_runs_practice_facility(uuid) FROM PUBLIC,anon,authenticated;

-- True when the actor is the practice's own doctor and the facility approves
-- that doctor's changes. Approvers and workers are never subject to it.
CREATE FUNCTION clinzo.schedule_change_needs_approval(p_actor uuid,p_practice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_actor IS NOT NULL
    AND EXISTS(SELECT 1 FROM clinzo.doctor_facility p JOIN clinzo.doctor d ON d.id=p.doctor_id
      WHERE p.id=p_practice AND d.identity_id=p_actor)
    AND NOT clinzo.doctor_runs_practice_facility(p_practice)
$$;
REVOKE ALL ON FUNCTION clinzo.schedule_change_needs_approval(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Facility owners and administrators who decide a practice's requests.
CREATE FUNCTION clinzo.can_approve_practice_changes(p_actor uuid,p_practice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_actor IS NOT NULL AND EXISTS(
    SELECT 1 FROM clinzo.doctor_facility p
    JOIN clinzo.facility f ON f.id=p.facility_id
    JOIN clinzo.organization o ON o.id=f.organization_id
    JOIN clinzo.organization_member m ON m.organization_id=f.organization_id
      AND m.identity_id=p_actor AND m.active
      AND (m.facility_id IS NULL OR m.facility_id=f.id)
      AND m.role IN ('owner','organization_admin','facility_admin')
    WHERE p.id=p_practice AND f.active AND o.active)
$$;
REVOKE ALL ON FUNCTION clinzo.can_approve_practice_changes(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Lets the Doctor app choose between "Publish" and "Submit for approval".
CREATE FUNCTION public.schedule_change_requires_approval(p_practice_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.current_identity();
BEGIN
  IF actor IS NULL OR NOT coalesce(clinzo.can_edit_practice_schedule(actor,p_practice_id),false) THEN
    RAISE EXCEPTION 'Practice access required' USING ERRCODE='42501'; END IF;
  RETURN clinzo.schedule_change_needs_approval(actor,p_practice_id);
END $$;
REVOKE ALL ON FUNCTION public.schedule_change_requires_approval(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_change_requires_approval(uuid) TO authenticated;
