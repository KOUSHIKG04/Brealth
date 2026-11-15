import {
  listPortalAppointmentTransactions,
  listMyPracticeAppointments,
} from "@startup/data-access";
import { uuidSchema, type PortalTransactions } from "@startup/contracts";
import { TransactionsScreen } from "@/features/transactions";
import { AppointmentPaymentPanel } from "@/features/appointments";
import { requirePortalArea } from "@/server/auth/facilityAccess";
import { createClient } from "@/lib/supabase/server";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  await requirePortalArea("transactions");
  const client = await createClient();
  const selected = uuidSchema.safeParse((await searchParams).appointment);
  let initialPage: PortalTransactions | undefined;
  try {
    initialPage = await listPortalAppointmentTransactions(client);
  } catch {
    /* The client owns retry and an explicit error state. */
  }
  const appointment = selected.success
    ? (await listMyPracticeAppointments(client)).find(
        (item) => item.id === selected.data
      )
    : undefined;
  return (
    <TransactionsScreen
      initialPage={initialPage}
      paymentPanel={
        appointment ? (
          <div className="space-y-2">
            <p className="text-sm">
              {appointment.patient_name} · {appointment.doctor_name} ·{" "}
              {appointment.public_code.slice(-8)}
            </p>
            <AppointmentPaymentPanel
              key={appointment.id}
              item={appointment}
              checkoutAvailable
            />
          </div>
        ) : selected.success ? (
          <p role="alert" className="text-sm">
            This appointment is unavailable or outside your facility access.
          </p>
        ) : undefined
      }
    />
  );
}
