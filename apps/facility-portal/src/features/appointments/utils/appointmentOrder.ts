import {
  appointmentQueueNumber,
  localDateKey,
  type ClinicAppointment,
} from "@startup/contracts";

/** Calendar day of an appointment in its clinic's timezone. */
export function appointmentClinicDay(item: ClinicAppointment) {
  return localDateKey(item.starts_at, item.timezone);
}

/** Days between today and the appointment's clinic day (0 = today). */
export function appointmentDayOffset(item: ClinicAppointment, now: number) {
  const day = (key: string) => Date.parse(`${key}T00:00:00Z`);
  return Math.round(
    (day(appointmentClinicDay(item)) -
      day(localDateKey(new Date(now), item.timezone))) /
      86400000
  );
}

export function compareAppointmentQueue(
  a: ClinicAppointment,
  b: ClinicAppointment
) {
  const token = (item: ClinicAppointment) =>
    appointmentQueueNumber(item) ?? Number.MAX_SAFE_INTEGER;
  return (
    appointmentClinicDay(a).localeCompare(appointmentClinicDay(b)) ||
    token(a) - token(b) ||
    a.starts_at.localeCompare(b.starts_at) ||
    a.doctor_name.localeCompare(b.doctor_name) ||
    a.id.localeCompare(b.id)
  );
}
