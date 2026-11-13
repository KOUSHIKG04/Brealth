import type { DashboardScreenProps } from "../types/dashboardScreen";

import Link from "next/link";
import { AcceptPendingAppointmentButton } from "../components/AcceptPendingAppointmentButton";
import { DashboardErrorToast } from "../components/DashboardErrorToast";
import { formatDisplayDate, formatDisplayDateTime } from "@startup/contracts";
import { Calendar, Clock } from "lucide-react";

import { WeeklyDoctorSchedule } from "../components/WeeklyDoctorSchedule";
import { wards as wardStyles } from "../utils/dashboardConstants";

export default function DashboardScreen({
  doctorAction,
  appointmentAction,
  doctorRequests,
  inventory,
  appointments,
  weeklyDoctors,
  loadError,
  acceptAppointment,
}: DashboardScreenProps) {
  const wards = inventory
    .filter((item) => item.configured && item.total > 0)
    .map((item, index) => {
      const style = wardStyles[index % wardStyles.length];
      return {
        ...style,
        name: item.bedTypeName,
        total: item.total,
        available: item.available,
        occupied: item.occupied,
        percent:
          item.total > 0 ? Math.round((item.available / item.total) * 100) : 0,
      };
    });

  const capacity = inventory
    .filter((item) => item.configured)
    .reduce((sum, item) => sum + item.total, 0);
  const now = new Date().getTime();

  const pendingRequests = appointments
    .filter(
      (item) =>
        item.status === "pending" &&
        new Date(item.starts_at).getTime() > now &&
        (item.request_expires_at === null ||
          new Date(item.request_expires_at).getTime() > now)
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    )
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-6 pb-12">
      <DashboardErrorToast message={loadError} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              Hospital Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live Facility
            </span>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 text-xs sm:text-sm">
            <Calendar className="text-muted-foreground/80 size-4" />
            <span suppressHydrationWarning className="font-medium tabular-nums">
              {formatDisplayDate(new Date(), "Asia/Kolkata")}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doctorAction}
          {appointmentAction}
        </div>
      </header>

      {wards.length > 0 ? (
        <div className="border-border bg-card rounded-lg border p-6 shadow-xs">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-foreground text-lg font-bold">
                Bed Availability by Type
              </h2>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Availability &amp; occupancy metrics across specialized wards
              </p>
            </div>
            <div className="bg-muted inline-flex items-center self-start rounded-lg px-3 py-1.5 sm:self-auto">
              <span className="text-primary text-xs font-semibold tracking-wide uppercase">
                TOTAL CAPACITY: {capacity} BEDS
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {wards.map((ward) => {
              const Icon = ward.icon;
              return (
                <div
                  key={ward.name}
                  className="border-border bg-card hover:border-border flex flex-col justify-between gap-3 rounded-xl border p-4 shadow-2xs transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-foreground text-sm leading-tight font-semibold">
                        {ward.name}
                      </h3>
                      <span className="text-muted-foreground text-xs">
                        Total: {ward.total}
                      </span>
                    </div>
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${ward.iconBg} ${ward.iconColor}`}
                    >
                      <Icon className="size-[18px]" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Available{" "}
                        <strong className="text-foreground font-bold">
                          {ward.available}
                        </strong>{" "}
                        • Occupied{" "}
                        <strong className="text-foreground font-bold">
                          {ward.occupied}
                        </strong>
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${ward.iconBg} ${ward.iconColor}`}
                      >
                        {ward.percent}%
                      </span>
                    </div>

                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${ward.progressColor}`}
                        style={{ width: `${ward.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <WeeklyDoctorSchedule doctors={weeklyDoctors} />

        <div className="border-border bg-card flex min-h-[420px] flex-col justify-between rounded-lg border p-6 shadow-xs lg:col-span-4">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Clock className="text-primary size-5" />
                <h3 className="text-foreground text-lg font-bold">
                  Pending Requests
                </h3>
              </div>
              <Link
                href="/appointments"
                className="text-primary cursor-pointer text-sm font-semibold hover:underline"
              >
                View All
              </Link>
            </div>

            <div className="flex flex-col gap-3.5">
              {doctorRequests}
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="border-border bg-card hover:border-border rounded-xl border p-4 shadow-2xs transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-foreground text-sm font-bold">
                        {request.patient_name}
                      </h4>
                      <p className="text-muted-foreground text-xs">
                        {request.service_name}
                      </p>
                    </div>
                    <span className="bg-muted text-primary rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                      {formatDisplayDateTime(request.starts_at, "Asia/Kolkata")}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">
                      {request.public_code}
                    </span>
                    <AcceptPendingAppointmentButton
                      appointmentId={request.id}
                      expectedVersion={Number(request.row_version)}
                      action={acceptAppointment}
                    />
                  </div>
                </div>
              ))}
              {pendingRequests.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No pending appointment requests.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
