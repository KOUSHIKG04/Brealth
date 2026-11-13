"use client";

import {
  DataTable,
  createDisplayColumns,
} from "@startup/web-ui/components/data-table";
import { appointmentTableHeaders } from "../utils/appointmentsConstants";
import { PatientDetailsDrawer } from "./PatientDetailsDrawer";
import type { AppointmentsTableProps } from "../types/appointmentsTable";
import { appointmentRecoveryView } from "@startup/contracts";

import { CalendarDays, Check, X, User, Video } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@startup/web-ui/components/ui/avatar";

import {
  appointmentPeriods,
  appointmentPeriodLabels,
  appointmentSourceLabels,
} from "../utils/appointmentsConstants";

const appointmentColumns = createDisplayColumns(appointmentTableHeaders);

export function AppointmentsTable({
  now,
  filters,
  pageRows,
  pending,
  onManage,
  onAct,
  pagination,
  onPageChange,
  displayedCount,
  filterPeriod,
  onFilterPeriodChange,
}: AppointmentsTableProps) {
  const tableRows = pageRows.map((item) => {
    const start = new Date(item.starts_at);
    const end = new Date(item.ends_at);
    const appointmentTimeFormatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: item.timezone,
    });
    const clinicDayFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: item.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const isClinicDay =
      clinicDayFormatter.format(start) ===
      clinicDayFormatter.format(new Date(now));
    const expiredPending =
      !item.confirmation_payment_pending &&
      item.status === "pending" &&
      (start.getTime() <= now ||
        (item.request_expires_at !== null &&
          new Date(item.request_expires_at).getTime() <= now));
    const row = {
      id: item.id,
      queueNo:
        item.visit_mode === "clinic"
          ? (item.ticket_number?.toString() ?? "—")
          : "—",
      patientId: item.patient_public_code,
      patientName: item.patient_name,
      patientAvatar: undefined,
      doctorName: item.doctor_name,
      department: item.service_name,
      time: `${appointmentTimeFormatter.format(start)} - ${appointmentTimeFormatter.format(end)}`,
      mode:
        item.visit_mode === "online"
          ? "Video"
          : item.visit_mode === "home"
            ? "Home Visit"
            : "In-Person",
      status: appointmentRecoveryView(item, now).staffStatus,
    };
    return {
      id: item.id,
      cells: [
        <div key="token" className="text-foreground px-3 py-3.5 font-semibold">
          {row.queueNo}
        </div>,
        <div
          key="patientId"
          className="text-primary px-3 py-3.5 font-medium whitespace-nowrap tabular-nums"
        >
          <span title={row.patientId}>{row.patientId.split("-").at(-1)}</span>
        </div>,
        <div key="patient" className="min-w-0 px-3 py-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar className="border-border size-8 shrink-0 rounded-full border">
              <AvatarImage src={row.patientAvatar} alt={row.patientName} />
              <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
                {row.patientName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <PatientDetailsDrawer item={item} />
          </div>
        </div>,
        <div key="doctor" className="px-3 py-3.5">
          <div className="flex min-w-0 flex-col gap-1 leading-5">
            <span className="text-foreground font-semibold">
              {row.doctorName}
            </span>
            <span className="text-muted-foreground text-xs">
              {row.department}
            </span>
          </div>
        </div>,
        <div
          key="time"
          className="text-foreground px-3 py-3.5 font-medium whitespace-nowrap tabular-nums"
        >
          <span className="block">
            {appointmentTimeFormatter.format(start)}
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            to {appointmentTimeFormatter.format(end)}
          </span>
        </div>,
        <div key="mode" className="px-3 py-3.5">
          <span className="bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap">
            {row.mode !== "Video" ? (
              <User className="text-muted-foreground size-3.5" />
            ) : (
              <Video className="size-3.5 text-blue-500" />
            )}
            {row.mode}
          </span>
        </div>,
        <div key="source" className="px-3 py-3.5 text-xs">
          <p>
            {item.source
              ? appointmentSourceLabels[item.source]
              : "Not recorded"}
          </p>
          {item.visit_mode === "clinic" ? (
            <p className="mt-1 capitalize">
              {item.queue_state?.replaceAll("_", " ") ?? "No queue entry"}
              {item.queue_state === "waiting"
                ? ` · ${item.ahead_count} ahead`
                : ""}
            </p>
          ) : null}
        </div>,
        <div key="status" className="px-3 py-3.5">
          {item.payment_summary?.enabled &&
          ["pending", "confirmed", "in_consultation", "completed"].includes(
            item.status
          ) &&
          !item.confirmation_payment_pending ? (
            <p className="text-muted-foreground mb-1.5 text-xs">
              {item.payment_summary.due_minor > 0
                ? item.status === "pending"
                  ? "Payment after approval"
                  : "Payment due"
                : item.payment_summary.captured_minor > 0
                  ? "Paid"
                  : "No payment required"}
            </p>
          ) : null}
          {item.confirmation_payment_pending ? (
            <span className="bg-muted text-foreground inline-flex rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap">
              {appointmentRecoveryView(item, now).staffStatus}
            </span>
          ) : null}
          {row.status === "Pending" &&
            !expiredPending &&
            !item.confirmation_payment_pending && (
              <span className="bg-muted text-primary inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap">
                <span className="bg-primary size-1.5 rounded-full" />
                Pending
              </span>
            )}
          {expiredPending && (
            <span className="bg-muted text-foreground inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap">
              Expired request
            </span>
          )}
          {row.status === "Confirmed" && (
            <span className="bg-muted inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap text-blue-600">
              <span className="size-1.5 rounded-full bg-blue-600" />
              Confirmed
            </span>
          )}
          {row.status === "Rejected" && !item.confirmation_payment_pending && (
            <span className="bg-destructive/10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap text-red-600">
              <span className="size-1.5 rounded-full bg-red-600" />
              Rejected
            </span>
          )}
          {row.status === "Cancelled" && !item.confirmation_payment_pending && (
            <span className="bg-destructive/10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap text-red-600">
              <span className="size-1.5 rounded-full bg-red-600" />
              Cancelled
            </span>
          )}
          {!item.confirmation_payment_pending &&
          !["Pending", "Confirmed", "Rejected", "Cancelled"].includes(
            row.status
          ) ? (
            <span className="bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap">
              {row.status.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>,
        <div key="actions" className="px-3 py-3.5 text-right">
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {item.recovery?.can_manage ? (
              <button
                type="button"
                className="border-border hover:bg-muted min-h-9 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap disabled:opacity-50"
                disabled={pending}
                onClick={() => onManage(item)}
              >
                Manage
              </button>
            ) : null}
            {item.visit_mode === "clinic" && item.status === "confirmed" ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                {(
                  [
                    [
                      "check_in",
                      "Check in",
                      item.queue_state === "awaiting_arrival" && isClinicDay,
                    ],
                    [
                      "call",
                      "Call next",
                      item.queue_state === "waiting" &&
                        (item.clinic_queue
                          ? item.clinic_queue.can_call
                          : item.ahead_count === 0) &&
                        isClinicDay,
                    ],
                    [
                      "hold",
                      "Hold",
                      ["waiting", "called"].includes(item.queue_state ?? ""),
                    ],
                    [
                      "resume",
                      item.clinic_queue?.late_review_required
                        ? "Admit to next opening"
                        : "Resume",
                      item.queue_state === "held",
                    ],
                    [
                      "no_show",
                      "No-show",
                      appointmentRecoveryView(item, now).canMarkNoShow &&
                        [
                          "awaiting_arrival",
                          "waiting",
                          "called",
                          "held",
                        ].includes(item.queue_state ?? ""),
                    ],
                  ] as const
                )
                  .filter(([, , visible]) => visible)
                  .map(([action, label]) => (
                    <button
                      key={action}
                      disabled={pending}
                      onClick={() => onAct(item, action)}
                      className="border-border hover:bg-muted rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
              </div>
            ) : null}
            {row.status === "Pending" &&
              !expiredPending &&
              !item.confirmation_payment_pending && (
                <>
                  <button
                    disabled={pending}
                    onClick={() => onAct(item, "approve")}
                    className="bg-primary text-primary-foreground hover:bg-primary flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold shadow-2xs transition-colors"
                  >
                    <Check className="size-3.5 stroke-2" />
                    <span>Accept</span>
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => onAct(item, "reject")}
                    className="bg-destructive text-primary-foreground hover:bg-destructive flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold shadow-2xs transition-colors"
                  >
                    <X className="size-3.5 stroke-2" />
                    <span>Reject</span>
                  </button>
                </>
              )}
          </div>
        </div>,
      ],
    };
  });
  return (
    <div className="border-border bg-card min-w-0 rounded-xl border p-4 sm:p-5">
      <div className="border-border space-y-4 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-foreground text-lg font-semibold">Bookings</h2>
            <p className="text-muted-foreground text-sm">
              {appointmentPeriodLabels[filterPeriod]} · {displayedCount}{" "}
              {displayedCount === 1 ? "appointment" : "appointments"}
            </p>
          </div>
          <p className="text-muted-foreground pt-1 text-xs">
            Slide column dividers to adjust their width.
          </p>
        </div>
        <div
          className="flex max-w-full gap-1 overflow-x-auto"
          role="group"
          aria-label="Appointment dates"
        >
          {appointmentPeriods.map((period) => (
            <button
              type="button"
              key={period}
              aria-pressed={filterPeriod === period}
              onClick={() => onFilterPeriodChange(period)}
              className={
                "focus-visible:ring-ring min-h-10 shrink-0 rounded-lg px-3 text-sm focus-visible:ring-2 " +
                (filterPeriod === period
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              {appointmentPeriodLabels[period]}
            </button>
          ))}
        </div>
        {filters}
      </div>

      {/* Appointments Table */}
      <div
        className="focus-visible:outline-ring mt-4 overflow-x-auto overscroll-x-contain rounded-lg focus-visible:outline-2"
        role="region"
        aria-label="Appointments table"
        tabIndex={0}
      >
        <DataTable
          columns={appointmentColumns}
          data={tableRows}
          enableColumnResizing
          manualPagination
          hidePagination
          bare
          cellClassName="p-0 align-top"
          getRowId={(row) => row.id}
          emptyState={
            <div className="mx-auto max-w-sm space-y-2 py-3">
              <CalendarDays className="text-muted-foreground mx-auto mb-3 size-6" />
              <p className="text-foreground text-sm font-medium">
                No appointments to display
              </p>
              <p className="text-muted-foreground text-sm leading-6">
                Try another date, search or status, or add an appointment using
                the button above.
              </p>
            </div>
          }
        />
      </div>

      {/* Table Footer & Pagination (Figma 815:202) */}
      <div className="border-border text-muted-foreground mt-6 flex flex-col justify-between gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center">
        <p>
          Showing{" "}
          <strong className="text-foreground font-semibold">
            {pagination.range}
          </strong>{" "}
          of{" "}
          <strong className="text-foreground font-semibold">
            {pagination.total}
          </strong>{" "}
          results
        </p>

        <div className="flex items-center gap-1 self-center">
          <button
            disabled={pagination.currentPage === 1}
            onClick={() => onPageChange(pagination.currentPage - 1)}
            className="border-border text-muted-foreground hover:bg-muted cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Previous
          </button>
          <button className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-xs font-bold">
            {pagination.currentPage}
          </button>
          {pagination.nextPages.map((nextPage) => (
            <button
              key={nextPage}
              onClick={() => onPageChange(nextPage)}
              className="text-muted-foreground hover:bg-muted flex size-8 cursor-pointer items-center justify-center rounded-md text-xs font-medium"
            >
              {nextPage}
            </button>
          ))}
          {pagination.lastPage > pagination.currentPage + 3 && (
            <span className="text-muted-foreground px-1">...</span>
          )}
          {pagination.lastPage > pagination.currentPage + 2 && (
            <button
              onClick={() => onPageChange(pagination.lastPage)}
              className="text-muted-foreground hover:bg-muted flex size-8 cursor-pointer items-center justify-center rounded-md text-xs font-medium"
            >
              {pagination.lastPage}
            </button>
          )}
          <button
            disabled={pagination.currentPage === pagination.lastPage}
            onClick={() => onPageChange(pagination.currentPage + 1)}
            className="border-border text-muted-foreground hover:bg-muted cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
