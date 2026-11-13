import type { DoctorSchedulesStatsProps } from "../types/doctorSchedulesStats";

export function DoctorSchedulesStats({
  scheduleSummary,
  scheduledShifts,
  departments,
}: DoctorSchedulesStatsProps) {
  return (
    <dl
      aria-label="Schedule summary"
      className="border-border bg-card grid grid-cols-2 gap-y-5 rounded-xl border p-4 sm:p-5 lg:grid-cols-4"
    >
      <div className="space-y-1 pr-4">
        <dt className="text-muted-foreground text-sm">Associated doctors</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {scheduleSummary.total}
        </dd>
        <dd className="text-muted-foreground text-xs">Facility roster</dd>
      </div>
      <div className="border-border space-y-1 border-l px-4">
        <dt className="text-muted-foreground text-sm">Available now</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {scheduleSummary.available}
        </dd>
        <dd className="text-muted-foreground text-xs">Active clinic session</dd>
      </div>
      <div className="border-border space-y-1 pr-4 lg:border-l lg:px-4">
        <dt className="text-muted-foreground text-sm">Published shifts</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {scheduledShifts}
        </dd>
        <dd className="text-muted-foreground text-xs">Selected date</dd>
      </div>
      <div className="border-border space-y-1 border-l px-4">
        <dt className="text-muted-foreground text-sm">Departments</dt>
        <dd className="text-foreground text-2xl font-semibold tabular-nums">
          {departments}
        </dd>
        <dd className="text-muted-foreground text-xs">Selected date</dd>
      </div>
    </dl>
  );
}
