import type { ClinicalRecord } from "@startup/contracts";

/** Read-only records lack row IDs; content identifies distinct rows across refresh/reordering. */
export function recordMedicineRows(medicines: ClinicalRecord["medicines"]) {
  const occurrences = new Map<string, number>();
  return medicines.map((medicine) => {
    const content = JSON.stringify(medicine);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { medicine, key: `${content}:${occurrence}` };
  });
}
