import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Directory, File, Paths } from "expo-file-system";
import type { ClinicalRecord } from "@startup/contracts";
import {
  prescriptionFileName,
  prescriptionHtml,
} from "../utils/prescriptionDocument";

const pdfType = { mimeType: "application/pdf", UTI: "com.adobe.pdf" } as const;

/** Renders the prescription to a clearly named PDF in the app cache. */
async function createPrescriptionPdf(
  record: ClinicalRecord,
  primaryDiagnosis: string
) {
  const { uri } = await Print.printToFileAsync({
    html: prescriptionHtml(record, primaryDiagnosis),
  });
  const printed = new File(uri);
  const named = new File(Paths.cache, prescriptionFileName(record));
  try {
    named.delete(); // replace an earlier copy of the same prescription
  } catch {
    // No earlier copy.
  }
  await printed.move(named);
  return printed;
}

async function requireSharing() {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing files is not available on this device.");
}

/** Opens the share sheet with the prescription attached as a PDF. */
export async function sharePrescriptionPdf(
  record: ClinicalRecord,
  primaryDiagnosis: string
) {
  await requireSharing();
  const file = await createPrescriptionPdf(record, primaryDiagnosis);
  await Sharing.shareAsync(file.uri, {
    ...pdfType,
    dialogTitle: "Share prescription",
  });
}

/**
 * Saves the prescription PDF. Android writes it to a folder the patient picks
 * (for example Downloads); iOS uses the share sheet's "Save to Files".
 */
export async function savePrescriptionPdf(
  record: ClinicalRecord,
  primaryDiagnosis: string
): Promise<"saved" | "shared" | "cancelled"> {
  if (Platform.OS === "android") {
    let folder: Directory;
    try {
      folder = await Directory.pickDirectoryAsync();
    } catch {
      return "cancelled"; // the patient closed the folder picker
    }
    const file = await createPrescriptionPdf(record, primaryDiagnosis);
    const target = folder.createFile(
      prescriptionFileName(record),
      pdfType.mimeType
    );
    target.write(await file.bytes());
    return "saved";
  }
  await requireSharing();
  const file = await createPrescriptionPdf(record, primaryDiagnosis);
  await Sharing.shareAsync(file.uri, {
    ...pdfType,
    dialogTitle: "Save prescription",
  });
  return "shared";
}
