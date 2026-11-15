import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { formatDisplayDate, userErrorMessage } from "@startup/contracts";
import { useQuery } from "@tanstack/react-query";
import { listMyClinicalRecords } from "@startup/data-access";
import type { ClinicalRecord } from "@startup/contracts";
import { useToast, useToastFeedback } from "@startup/mobile-ui";
import type { PrescriptionScreenProps } from "../types/prescription";
import { supabase } from "../../../services/supabase";
import {
  savePrescriptionPdf,
  sharePrescriptionPdf,
} from "../services/prescriptionPdf";

export function usePrescription({
  appointment,
  appointmentId,
  onBackPress,
  onViewMedicines,
}: PrescriptionScreenProps) {
  const { showToast } = useToast();
  const [pdfAction, setPdfAction] = useState<"share" | "download" | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const clinicalRecords = useQuery({
    queryKey: ["my-clinical-records"],
    queryFn: () => listMyClinicalRecords(supabase!),
    enabled: Boolean(supabase),
  });
  useFocusEffect(
    useCallback(() => {
      if (supabase) void clinicalRecords.refetch();
    }, [clinicalRecords.refetch])
  );
  useToastFeedback({
    error: clinicalRecords.isError
      ? "Could not load prescriptions. Please retry."
      : "",
  });

  const records = clinicalRecords.data ?? [];
  const targetId = appointmentId ?? appointment?.id;
  const record: ClinicalRecord | undefined = targetId
    ? records.find(
        (r: ClinicalRecord) =>
          r.appointment_id === targetId || r.appointment_code === targetId
      )
    : records[0];

  const primaryDiagnosis =
    record?.diagnoses.find((d) => d.is_primary)?.description ??
    record?.diagnoses[0]?.description ??
    "General consultation";

  async function runPdfAction(
    action: "share" | "download",
    work: (record: ClinicalRecord) => Promise<void>
  ) {
    if (!record || pdfAction) return;
    setPdfAction(action);
    try {
      await work(record);
    } catch (cause) {
      showToast({
        title:
          action === "share"
            ? "Could not share prescription"
            : "Could not save prescription",
        message: userErrorMessage(cause, "Try again."),
        type: "error",
      });
    } finally {
      setPdfAction(null);
    }
  }

  const sharePrescription = () =>
    runPdfAction("share", (item) =>
      sharePrescriptionPdf(item, primaryDiagnosis)
    );

  const downloadPrescription = () =>
    runPdfAction("download", async (item) => {
      const result = await savePrescriptionPdf(item, primaryDiagnosis);
      if (result !== "saved") return; // cancelled, or handed to the share sheet
      setDownloaded(true);
      showToast({
        title: "Prescription saved",
        message: "The PDF is in the folder you chose.",
        type: "success",
      });
    });

  const formatDate = (isoString?: string | null) => {
    return formatDisplayDate(isoString ?? new Date());
  };

  return {
    downloaded,
    pdfAction,
    clinicalRecords,
    record,
    primaryDiagnosis,
    sharePrescription,
    downloadPrescription,
    formatDate,
  };
}
