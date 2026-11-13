import type { ClinicAppointment } from "@startup/contracts";

export function compareAppointmentQueue(
  a: ClinicAppointment,
  b: ClinicAppointment
) {
  const day = (item: ClinicAppointment) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: item.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(item.starts_at));
  return (
    day(a).localeCompare(day(b)) ||
    (a.ticket_number ?? Number.MAX_SAFE_INTEGER) -
      (b.ticket_number ?? Number.MAX_SAFE_INTEGER) ||
    a.starts_at.localeCompare(b.starts_at) ||
    a.doctor_name.localeCompare(b.doctor_name) ||
    a.id.localeCompare(b.id)
  );
}
