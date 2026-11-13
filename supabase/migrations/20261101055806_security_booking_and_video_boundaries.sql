-- Patch the current owners so intervening scheduling/payment changes and grants
-- are retained. Fail closed if the expected decision points have changed.
DO $migration$
DECLARE
  definition text;
  marker text;
  replacement text;
BEGIN
  definition := pg_get_functiondef('public.reschedule_appointment(uuid,bigint,uuid,text,uuid)'::regprocedure);
  marker := 'IF a.row_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION ''Appointment changed; refresh and retry'' USING ERRCODE=''PT409''; END IF;';
  IF (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 THEN
    RAISE EXCEPTION 'Unexpected reschedule version guard';
  END IF;
  -- The idempotency replay above this point remains valid. New moves must not
  -- turn an unpaid short reservation into an ordinary approval request.
  replacement := marker || E'\n IF a.confirmation_payment_pending THEN\n   RAISE EXCEPTION ''Complete or cancel the payment reservation before rescheduling'' USING ERRCODE=''22023'';\n END IF;';
  EXECUTE replace(definition, marker, replacement);

  definition := pg_get_functiondef('public.get_online_join_context(uuid)'::regprocedure);
  marker := 'IF doctor_identity=actor THEN participant_role:=''doctor'';';
  IF (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 THEN
    RAISE EXCEPTION 'Unexpected online doctor role guard';
  END IF;
  -- Facility management is not a clinical credential. Require the assigned
  -- clinician to remain active and verified before returning a fresh context.
  replacement := $guard$IF doctor_identity=actor THEN
    IF NOT EXISTS (
      SELECT 1 FROM clinzo.doctor d
      JOIN clinzo.session s ON s.doctor_id=d.id
      WHERE s.id=a.session_id AND d.identity_id=actor
        AND d.active AND d.credential_status='verified'
    ) THEN
      RAISE EXCEPTION 'Verified appointment doctor required' USING ERRCODE='42501';
    END IF;
    participant_role:='doctor';$guard$;
  EXECUTE replace(definition, marker, replacement);
END $migration$;
