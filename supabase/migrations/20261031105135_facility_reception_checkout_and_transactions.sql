-- Reuse canonical amount, policy, locking, order reuse and capture authority.
-- Only financial managers can collect on behalf of a clinic patient.
DO $migration$
DECLARE definition text; marker text;
BEGIN
  definition := pg_get_functiondef('public.prepare_appointment_payment(uuid,text)'::regprocedure);
  marker := 'IF NOT EXISTS(SELECT 1 FROM clinzo.patient_access pa WHERE pa.patient_id=a.patient_id AND pa.identity_id=actor AND pa.verified_at IS NOT NULL AND pa.revoked_at IS NULL) THEN';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected checkout access owner'; END IF;
  EXECUTE replace(definition,marker,
    'IF NOT (a.visit_mode=''clinic'' AND coalesce(clinzo.can_manage_appointment_money(actor,a.id),false)) AND NOT EXISTS(SELECT 1 FROM clinzo.patient_access pa WHERE pa.patient_id=a.patient_id AND pa.identity_id=actor AND pa.verified_at IS NOT NULL AND pa.revoked_at IS NULL) THEN');
  definition := pg_get_functiondef('clinzo.appointment_billing_details(uuid,uuid)'::regprocedure);
  marker := 'AND patient_access AND NOT blocked';
  IF position(marker IN definition)=0 THEN RAISE EXCEPTION 'Unexpected billing eligibility owner'; END IF;
  EXECUTE replace(definition,marker,'AND (patient_access OR (manager AND a.visit_mode=''clinic'')) AND NOT blocked');
END
$migration$;

CREATE FUNCTION public.get_portal_appointment_payment_summaries(p_appointment_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity(); result jsonb;
BEGIN
  IF p_appointment_ids IS NULL OR cardinality(p_appointment_ids)>100 THEN
    RAISE EXCEPTION 'Request up to 100 appointments' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('appointment_id',a.id,'enabled',b.details->'enabled',
    'mode',b.details->'mode','amount_minor',b.details->'amount_minor',
    'captured_minor',b.details->'captured_minor','due_minor',b.details->'due_minor')),'[]'::jsonb)
  INTO result FROM clinzo.appointment a
  CROSS JOIN LATERAL (SELECT clinzo.appointment_billing_details(a.id,actor) AS details) b
  WHERE a.id=ANY(p_appointment_ids) AND coalesce(clinzo.can_access_recovery(actor,a.id),false);
  RETURN result;
END $$;

CREATE FUNCTION public.list_portal_appointment_transactions(p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=clinzo.require_identity(); result jsonb;
BEGIN
  IF (p_before_created_at IS NULL)<>(p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid transaction cursor' USING ERRCODE='22023';
  END IF;
  WITH visible AS MATERIALIZED (
    SELECT p.id,p.created_at,p.method,p.status,p.amount_minor,p.refunded_minor,p.order_id,p.payment_id,c.mode,
      a.id AS appointment_id,a.public_code AS appointment_reference,patient.full_name AS patient_name,
      a.doctor_name_snapshot AS doctor_name,a.facility_name_snapshot AS facility_name
    FROM clinzo.appointment_payment_attempt p JOIN clinzo.appointment_charge c ON c.id=p.charge_id
    JOIN clinzo.appointment a ON a.id=c.appointment_id JOIN clinzo.patient patient ON patient.id=a.patient_id
    WHERE coalesce(clinzo.can_manage_appointment_money(actor,a.id),false)
      AND (p_before_created_at IS NULL OR (p.created_at,p.id)<(p_before_created_at,p_before_id))
    ORDER BY p.created_at DESC,p.id DESC LIMIT 51
  ), page AS (SELECT * FROM visible ORDER BY created_at DESC,id DESC LIMIT 50)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT count(*) FROM visible)>50 THEN
      (SELECT jsonb_build_object('created_at',created_at,'id',id) FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END)
  INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.get_portal_appointment_payment_summaries(uuid[]),public.list_portal_appointment_transactions(timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_portal_appointment_payment_summaries(uuid[]),public.list_portal_appointment_transactions(timestamptz,uuid) TO authenticated;

CREATE INDEX appointment_payment_history_idx ON clinzo.appointment_payment_attempt(created_at DESC,id DESC);
