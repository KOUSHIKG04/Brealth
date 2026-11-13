import {
  listMyPracticeAppointments,
  attachPortalAppointmentPayments,
} from "@startup/data-access";
import type { ClinicAppointment } from "@startup/contracts";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedFacility } from "@/server/auth/facilityAccess";
import { AppointmentsScreen } from "@/features/appointments";

export default async function AppointmentsPage() {
  await requireApprovedFacility();
  const client = await createClient();
  let appointments: ClinicAppointment[] = [];
  let loadError: string | undefined;

  try {
    appointments = await listMyPracticeAppointments(client);
  } catch {
    loadError =
      "Appointments are unavailable. Confirm portal membership and apply the care-access migrations.";
  }

  if (appointments.length) {
    try {
      appointments = await attachPortalAppointmentPayments(
        client,
        appointments
      );
    } catch {
      loadError =
        "Appointments loaded, but payment status is unavailable. Refresh before collecting a payment.";
    }
  }

  return (
    <AppointmentsScreen appointments={appointments} loadError={loadError} />
  );
}
