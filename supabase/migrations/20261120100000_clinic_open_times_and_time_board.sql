-- In-person bookings have two independent limits: app bookings, which use the
-- day's time slots, and walk-ins, which reception registers. The existing
-- per-channel capacity rule (clinzo.remaining_clinic_channel_capacity) is kept
-- unchanged. RPC signatures and grants are unchanged.

-- Patients see every open time while app quota remains, not only the first
-- N times of the day.
DO $$
DECLARE fn regprocedure; definition text; changed integer:=0;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('list_clinic_slots','list_practice_clinic_slots','list_practice_service_slots') LOOP
    definition:=pg_get_functiondef(fn);
    IF position('OR ranked._daily_rank<=ranked._daily_remaining' in definition)=0 THEN
      RAISE EXCEPTION 'Unexpected ranked availability: %',fn;
    END IF;
    definition:=replace(definition,'OR ranked._daily_rank<=ranked._daily_remaining','OR ranked._daily_remaining>0');
    EXECUTE definition;
    changed:=changed+1;
  END LOOP;
  IF changed<>3 THEN RAISE EXCEPTION 'Expected three slot listing functions; updated %',changed; END IF;
END $$;

-- Upcoming in-person times a patient cannot book through the app, so the
-- doctor page can label them: 'booked' (taken) or 'closed' (the day's app
-- booking limit is reached). Exposes times only, never who booked them.
CREATE FUNCTION public.list_practice_clinic_time_board(p_practice_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH sessions AS (
    SELECT s.id,s.doctor_id,s.hard_capacity,
      clinzo.remaining_clinic_channel_capacity(s.id,'patient_online') AS app_remaining
    FROM clinzo.session s
    JOIN clinzo.doctor d ON d.id=s.doctor_id
    JOIN clinzo.doctor_facility p ON p.id=s.doctor_facility_id
    JOIN clinzo.facility f ON f.id=p.facility_id
    JOIN clinzo.organization o ON o.id=f.organization_id
    WHERE s.doctor_facility_id=p_practice_id AND s.state IN ('published','open')
      AND s.ends_at>now() AND s.starts_at<now()+interval '31 days'
      AND clinzo.service_mode_for_session(s.id)='clinic'
      AND d.active AND d.credential_status='verified' AND p.active
      AND f.active AND f.verification_status='verified' AND o.active
  ), board AS (
    SELECT w.id,w.starts_at,w.ends_at,
      CASE WHEN occupied.used>=w.hard_capacity THEN 'booked' ELSE 'closed' END AS status
    FROM sessions x JOIN clinzo.appointment_window w ON w.session_id=x.id
    CROSS JOIN LATERAL(SELECT count(*) FILTER(WHERE a.window_id=w.id) AS used,count(*) AS session_used
      FROM clinzo.appointment a WHERE a.session_id=x.id
        AND ((a.confirmed_at IS NOT NULL AND a.capacity_released_at IS NULL)
          OR (a.status='pending' AND a.request_expires_at>now()))) occupied
    WHERE w.starts_at>now() AND w.state='open'
      AND (occupied.used>=w.hard_capacity OR occupied.session_used>=x.hard_capacity OR x.app_remaining<1)
      AND NOT EXISTS(SELECT 1 FROM clinzo.schedule_exception e WHERE e.doctor_id=x.doctor_id AND e.state='active'
        AND (e.doctor_facility_id IS NULL OR e.doctor_facility_id=p_practice_id)
        AND e.service_mode IN ('all','clinic') AND e.starts_at<w.ends_at AND e.ends_at>w.starts_at)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('window_id',id,'starts_at',starts_at,'ends_at',ends_at,'status',status)
    ORDER BY starts_at,id),'[]'::jsonb) FROM board;
$$;
REVOKE ALL ON FUNCTION public.list_practice_clinic_time_board(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_practice_clinic_time_board(uuid) TO anon,authenticated;
