import { formatDisplayDate, type ClinicalRecord } from "@startup/contracts";

type Medicine = ClinicalRecord["medicines"][number];

type Timing = NonNullable<Medicine["schedule"]>["timings"][number];

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes record text so clinician-entered content cannot inject markup. */
function escapeHtml(value: string | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

const anchorLabels: Record<Timing["meal_anchor"], string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  bedtime: "bedtime",
};

function timingLabel(timing: Timing) {
  const anchor = anchorLabels[timing.meal_anchor];
  if (timing.meal_anchor === "bedtime") return "At bedtime";
  if (timing.meal_relation === "independent")
    return `${anchor[0].toUpperCase()}${anchor.slice(1)} time`;
  const relation = { before: "Before", with: "With", after: "After" }[
    timing.meal_relation
  ];
  return `${relation} ${anchor}`;
}

function medicineRow(medicine: Medicine, index: number) {
  const schedule = medicine.schedule;
  const dose = schedule
    ? `${schedule.dose_quantity} ${schedule.dose_unit}`
    : "As prescribed";
  const when = schedule?.timings.length
    ? schedule.timings.map(timingLabel).join(", ")
    : "As directed";
  const period = schedule
    ? `${formatDisplayDate(schedule.starts_on)}${
        schedule.ends_on ? ` to ${formatDisplayDate(schedule.ends_on)}` : ""
      }`
    : "";
  return `<tr>
    <td>${index + 1}</td>
    <td><strong>${escapeHtml(medicine.medicine_name)}</strong><br />
      <span class="muted">${escapeHtml(
        [medicine.strength, medicine.form, medicine.route]
          .filter(Boolean)
          .join(" · ")
      )}</span></td>
    <td>${escapeHtml(dose)}</td>
    <td>${escapeHtml(when)}${period ? `<br /><span class="muted">${escapeHtml(period)}</span>` : ""}</td>
    <td>${escapeHtml(medicine.instructions || "As prescribed")}</td>
  </tr>`;
}

/** Safe file name, e.g. Prescription-RX1234-14-11-2026.pdf */
export function prescriptionFileName(record: ClinicalRecord) {
  const reference = (record.prescription_code ?? record.appointment_code)
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = formatDisplayDate(record.signed_at ?? record.started_at);
  return `Prescription-${reference}-${date}.pdf`;
}

/**
 * Printable A4 prescription built from the authorized clinical record.
 * Generated on the device; it is a copy of the record, not a signed original.
 */
export function prescriptionHtml(
  record: ClinicalRecord,
  primaryDiagnosis: string
) {
  const doctorLine = [record.doctor_qualification, record.doctor_specialty]
    .filter(Boolean)
    .join(" · ");
  const vitals = record.vitals
    .map(
      (vital) =>
        `<li>${escapeHtml(vital.code.replaceAll("_", " "))}: ${escapeHtml(
          `${vital.value} ${vital.unit}`.trim()
        )}</li>`
    )
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.5; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #008877; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0; color: #008877; }
  h2 { font-size: 13px; margin: 16px 0 6px; color: #087f78; text-transform: uppercase; letter-spacing: 0.04em; }
  .muted { color: #6b7280; font-size: 11px; }
  .right { text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 7px 6px; border-bottom: 1px solid #e5e7eb; }
  th { background: #e6f7f6; font-size: 11px; }
  ul { margin: 0; padding-left: 18px; }
  footer { margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style></head>
<body>
  <header>
    <div>
      <h1>Prescription</h1>
      <div><strong>${escapeHtml(record.doctor_name)}</strong></div>
      ${doctorLine ? `<div class="muted">${escapeHtml(doctorLine)}</div>` : ""}
      <div class="muted">${escapeHtml(record.facility_name)}</div>
    </div>
    <div class="right">
      <div><strong>No. ${escapeHtml(record.prescription_code ?? "Not issued")}</strong></div>
      <div class="muted">Appointment ${escapeHtml(record.appointment_code)}</div>
      <div class="muted">Date ${escapeHtml(
        formatDisplayDate(record.signed_at ?? record.started_at)
      )}</div>
    </div>
  </header>

  <h2>Diagnosis</h2>
  <div>${escapeHtml(primaryDiagnosis)}</div>
  ${vitals ? `<h2>Vitals</h2><ul>${vitals}</ul>` : ""}

  <h2>Medicines</h2>
  ${
    record.medicines.length
      ? `<table><thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>When</th><th>Instructions</th></tr></thead>
    <tbody>${record.medicines.map(medicineRow).join("")}</tbody></table>`
      : `<div class="muted">No medicines prescribed.</div>`
  }

  ${record.assessment ? `<h2>Advice</h2><div>${escapeHtml(record.assessment)}</div>` : ""}
  ${
    record.followup
      ? `<h2>Follow-up</h2><div>${escapeHtml(
          formatDisplayDate(record.followup.recommended_date)
        )} · ${escapeHtml(record.followup.reason)}</div>`
      : ""
  }

  <footer class="muted">
    ${
      record.signed_at
        ? `Consultation completed ${escapeHtml(formatDisplayDate(record.signed_at))}.`
        : "Consultation not yet completed."
    }
    Copy generated from your Clinzo health record. Follow your doctor's instructions and consult them before changing any medicine.
  </footer>
</body></html>`;
}
