-- Doctor apps label schedules, hours and fees by workplace ("Hospital hours"
-- vs "Clinic hours"). Expose the facility kind with each practice; the
-- existing fields, filters, ordering and grants are unchanged.
CREATE OR REPLACE FUNCTION public.list_my_practices() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := clinzo.require_care_actor();
BEGIN
  RETURN coalesce((SELECT jsonb_agg(x) FROM (
    SELECT p.id AS practice_id,d.full_name AS doctor_name,f.name AS facility_name,
      f.kind AS facility_kind,
      d.credential_status='verified' AND d.active AS verified,
      d.identity_id=actor AS is_clinician
    FROM clinzo.doctor_facility p JOIN clinzo.doctor d ON d.id=p.doctor_id
    JOIN clinzo.facility f ON f.id=p.facility_id JOIN clinzo.organization o ON o.id=f.organization_id
    WHERE p.active AND f.active AND o.active AND (
      (d.identity_id=actor AND d.active) OR clinzo.can_manage_practice(actor,p.id))
    ORDER BY f.name,d.full_name LIMIT 100
  ) x),'[]'::jsonb);
END $$;
