-- Requires the driver_evidence_review_immutability migration on an approved test DB.
-- Synthetic metadata only, inside rollback. Does not replace the Storage API test.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';

DO $probe$
DECLARE
  owner_auth uuid := gen_random_uuid();
  owner_identity uuid;
  application_key uuid;
  case_key uuid;
  document_key uuid;
  evidence_path text := owner_auth::text || '/synthetic-evidence/original.pdf';
  fresh_path text := owner_auth::text || '/synthetic-evidence/resubmission.pdf';
  document_status text;
  denied boolean;
BEGIN
  INSERT INTO auth.users(id, instance_id, aud, role, phone, phone_confirmed_at)
  VALUES (owner_auth, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    '+919' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0'), now());

  INSERT INTO clinzo.identity(issuer, subject, display_name)
  VALUES ('supabase', owner_auth::text, 'Synthetic immutable evidence owner')
  RETURNING id INTO owner_identity;

  INSERT INTO clinzo.driver_registration_application(
    identity_id, full_name, contact_phone, date_of_birth, city, consent_at)
  VALUES (owner_identity, 'Synthetic immutable evidence owner',
    '+919000000004', '1990-01-01', 'Synthetic City', now())
  RETURNING id INTO application_key;

  INSERT INTO clinzo.verification_case(driver_application_id, status)
  VALUES (application_key, 'under_review') RETURNING id INTO case_key;

  INSERT INTO clinzo.verification_document(
    case_id, kind, bucket_id, storage_path, version, status)
  VALUES (case_key, 'aadhaar', 'driver-evidence', evidence_path, 1, 'pending')
  RETURNING id INTO document_key;

  PERFORM set_config('request.jwt.claim.sub', owner_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_auth, 'role', 'authenticated')::text, true);

  FOREACH document_status IN ARRAY ARRAY['pending', 'approved', 'rejected', 'superseded'] LOOP
    UPDATE clinzo.verification_document SET status = document_status
    WHERE id = document_key;

    -- The private schema is intentionally not directly addressable by app roles.
    -- Check the helper with the synthetic JWT subject, then exercise RLS as user.
    IF clinzo.can_mutate_unsubmitted_driver_evidence(evidence_path) THEN
      RAISE EXCEPTION 'Submitted % evidence is mutable', document_status;
    END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    denied := false;
    BEGIN
      INSERT INTO storage.objects(bucket_id, name, owner, owner_id)
      VALUES ('driver-evidence', evidence_path, owner_auth, owner_auth::text);
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Referenced path could be recreated'; END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;

  IF NOT clinzo.can_mutate_unsubmitted_driver_evidence(fresh_path)
    OR clinzo.can_mutate_unsubmitted_driver_evidence(
      gen_random_uuid()::text || '/other-owner.pdf')
    OR clinzo.can_mutate_unsubmitted_driver_evidence(NULL) THEN
    RAISE EXCEPTION 'Fresh upload or owner-prefix control failed';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects(bucket_id, name, owner, owner_id)
  VALUES ('driver-evidence', fresh_path, owner_auth, owner_auth::text);
  EXECUTE 'RESET ROLE';

  IF has_function_privilege('anon',
    'clinzo.can_mutate_unsubmitted_driver_evidence(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous evidence helper grant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'driver_evidence_delete_own'
    AND qual LIKE '%can_mutate_unsubmitted_driver_evidence%') THEN
    RAISE EXCEPTION 'Owner deletion policy lacks immutability guard';
  END IF;

  PERFORM set_config('audit.validation_result',
    '{"driver_evidence_immutability_ok":true,"storage_api_tested":false}'::text, true);
END $probe$;

SELECT current_setting('audit.validation_result')::jsonb AS result;
ROLLBACK;
