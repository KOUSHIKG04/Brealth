import type { ClinicAppointment } from "@startup/contracts";
import { doctor, facility } from "./portal";

const clinicDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function clinicDay(offset = 0) {
  return clinicDate.format(new Date(Date.now() + offset * 86_400_000));
}

export const appointment: ClinicAppointment = {
  id: "60000000-0000-4000-8000-000000000001",
  practice_id: doctor.practice_id,
  visit_mode: "clinic",
  public_code: "APT-CEDAR-001",
  status: "confirmed",
  row_version: "7",
  patient_id: "60000000-0000-4000-8000-000000000002",
  patient_name: "Asha Patel",
  patient_public_code: "CLINZO-PAT-4412",
  patient_gender: "Female",
  patient_age_years: 36,
  patient_blood_group: null,
  service_name: "Clinic consultation",
  doctor_name: doctor.name,
  facility_name: facility.facility_name,
  reason: "Routine follow-up",
  fee_minor: "50000",
  currency: "INR",
  starts_at: `${clinicDay()}T10:00:00+05:30`,
  ends_at: `${clinicDay()}T10:30:00+05:30`,
  timezone: "Asia/Kolkata",
  request_expires_at: null,
  decision_reason: null,
  queue_state: "awaiting_arrival",
  ticket_number: null,
  ahead_count: 0,
  can_consult: false,
  assessment: null,
  source: "patient_online",
};

export const clinicSlot = {
  window_id: "60000000-0000-4000-8000-000000000005",
  practice_service_id: "60000000-0000-4000-8000-000000000006",
  practice_id: doctor.practice_id,
  facility_name: facility.facility_name,
  doctor_name: doctor.name,
  address: "1 Cedar Road",
  starts_at: `${clinicDay()}T14:00:00+05:30`,
  ends_at: `${clinicDay()}T14:30:00+05:30`,
  timezone: appointment.timezone,
  fee_minor: appointment.fee_minor,
  currency: appointment.currency,
  state: "open",
};
