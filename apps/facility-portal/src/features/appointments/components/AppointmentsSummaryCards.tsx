import type { AppointmentsSummaryCardsProps } from "../types/appointmentsSummaryCards";

export function AppointmentsSummaryCards({
  summary,
}: AppointmentsSummaryCardsProps) {
  return (
    <dl
      aria-label="Appointment totals across all dates"
      className="border-border bg-card grid grid-cols-2 gap-y-5 rounded-xl border p-4 sm:p-5 lg:grid-cols-4"
    >
      <div className="space-y-1 pr-4">
        <dt className="text-muted-foreground text-sm">Total bookings</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {summary.total}
        </dd>
        <dd className="text-muted-foreground text-xs">All dates</dd>
      </div>
      <div className="border-border space-y-1 border-l px-4">
        <dt className="text-muted-foreground text-sm">Confirmed</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {summary.confirmed}
        </dd>
        <dd className="text-muted-foreground text-xs">
          Confirmed appointments
        </dd>
      </div>
      <div className="border-border space-y-1 pr-4 lg:border-l lg:px-4">
        <dt className="text-muted-foreground text-sm">Needs approval</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {summary.pending}
        </dd>
        <dd className="text-muted-foreground text-xs">Pending requests</dd>
      </div>
      <div className="border-border space-y-1 border-l px-4">
        <dt className="text-muted-foreground text-sm">Cancelled</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {summary.cancelled}
        </dd>
        <dd className="text-muted-foreground text-xs">Cancelled bookings</dd>
      </div>
    </dl>
  );
}
