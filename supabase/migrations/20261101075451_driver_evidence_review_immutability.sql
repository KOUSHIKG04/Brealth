-- Submitted evidence paths identify reviewed bytes, including older versions.
-- Resubmission uploads a new random path and creates a new document version.
CREATE FUNCTION clinzo.can_mutate_unsubmitted_driver_evidence(p_path text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(split_part(p_path, '/', 1) = (SELECT auth.uid())::text, false)
    AND NOT EXISTS (
      SELECT 1 FROM clinzo.verification_document d
      WHERE d.bucket_id = 'driver-evidence' AND d.storage_path = p_path
    );
$$;

REVOKE ALL ON FUNCTION clinzo.can_mutate_unsubmitted_driver_evidence(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION clinzo.can_mutate_unsubmitted_driver_evidence(text)
  TO authenticated;

ALTER POLICY driver_evidence_upload ON storage.objects
  WITH CHECK (
    bucket_id = 'driver-evidence'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND clinzo.can_mutate_unsubmitted_driver_evidence(name)
  );

ALTER POLICY driver_evidence_delete_own ON storage.objects
  USING (
    bucket_id = 'driver-evidence'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND clinzo.can_mutate_unsubmitted_driver_evidence(name)
  );
