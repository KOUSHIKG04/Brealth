import type { AppointmentPeriod } from "../types/appointments";
import { formatDisplayDate } from "@startup/contracts";

export const appointmentPeriods = [
  "All",
  "Today",
  "Tomorrow",
  "This Week",
] as const satisfies readonly AppointmentPeriod[];

export const defaultAppointmentPeriod: AppointmentPeriod = "Today";

export const appointmentModeLabels = {
  clinic: "Clinic visits",
  online: "Online consultations",
  home: "Home visits",
} as const;

export const patientGenderOptions = [
  "Male",
  "Female",
  "Other",
  "Prefer not to say",
] as const;

export const appointmentSourceLabels = {
  patient_online: "Patient app",
  reception_walk_in: "Reception walk-in",
  staff_booking: "Staff booking",
  offline_sync: "Offline registration",
} as const;

export const appointmentsDateFormatter = {
  format: (date: Date) => formatDisplayDate(date, "Asia/Kolkata"),
};

export const appointmentStatuses = [
  "Needs review",
  "Request expired",
  "Doctor unavailable",
  "Rescheduled",
  "All",
  "Pending",
  "Confirmed",
  "Rejected",
  "Cancelled",
  "Completed",
  "No_show",
  "In_consultation",
];

export const appointmentTableHeaders = [
  ["token", "Reserved token", 104, 80],
  ["patientId", "Patient ID", 144, 128],
  ["patient", "Patient name", 184, 120],
  ["doctor", "Doctor / Department", 184, 120],
  ["time", "Time", 116, 100],
  ["mode", "Mode", 128, 112],
  ["source", "Source / Queue", 144, 100],
  ["status", "Status", 160, 120],
  ["actions", "Actions", 168, 120],
] as const;

export const appointmentPeriodLabels = {
  All: "All dates",
  Today: "Today",
  Tomorrow: "Tomorrow",
  "This Week": "Next 7 days",
} as const;
