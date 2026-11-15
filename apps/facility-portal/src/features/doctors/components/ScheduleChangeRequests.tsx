"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  scheduleChangeRequestTitle,
  scheduleServiceSummary,
  type ScheduleChangeRequest,
} from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@startup/web-ui/components/ui/dialog";
import { Textarea } from "@startup/web-ui/components/ui/textarea";
import { useScheduleChangeRequests } from "../hooks/useScheduleChangeRequests";
import { ScheduleConflictDialog } from "./ScheduleConflictDialog";

const policyRows: [string, string, string][] = [
  ["Clinic arrival grace", "clinic_grace_minutes", "min"],
  ["Online attendance grace", "online_grace_minutes", "min"],
  ["Reschedule cutoff", "reschedule_cutoff_minutes", "min"],
  ["Self-service reschedules", "max_self_reschedules", ""],
];

function value(
  source: Record<string, unknown> | null | undefined,
  key: string
) {
  const item = source?.[key];
  return item === undefined || item === null ? "—" : String(item);
}

/** Current versus requested values, shown before deciding. */
function RequestDetails({ request }: { request: ScheduleChangeRequest }) {
  if (request.kind === "schedule" && request.service_mode) {
    const current = scheduleServiceSummary(
      request.current_settings,
      request.service_mode
    );
    const requested = scheduleServiceSummary(
      request.payload,
      request.service_mode
    );
    return (
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1 pr-3 font-medium">Setting</th>
            <th className="py-1 pr-3 font-medium">Current</th>
            <th className="py-1 font-medium">Requested</th>
          </tr>
        </thead>
        <tbody>
          {requested.map((row, index) => (
            <tr
              key={row.label}
              className={
                row.value !== current[index]?.value ? "font-semibold" : ""
              }
            >
              <td className="py-1 pr-3">{row.label}</td>
              <td className="text-muted-foreground py-1 pr-3">
                {current[index]?.value ?? "—"}
              </td>
              <td className="py-1">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (request.kind === "recovery_policy")
    return (
      <table className="w-full text-left text-sm">
        <tbody>
          {policyRows.map(([label, key, unit]) => (
            <tr key={key}>
              <td className="py-1 pr-3">{label}</td>
              <td className="text-muted-foreground py-1 pr-3">
                {value(request.current_settings, key)} {unit}
              </td>
              <td className="py-1 font-semibold">
                {value(request.payload, key)} {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  const startsAt = request.payload.starts_at;
  const endsAt = request.payload.ends_at;
  return (
    <p className="text-sm">
      {typeof startsAt === "string" ? formatDisplayDateTime(startsAt) : "—"}
      {" to "}
      {typeof endsAt === "string" ? formatDisplayDateTime(endsAt) : "—"}
      {typeof request.payload.reason === "string"
        ? ` · ${request.payload.reason}`
        : ""}
    </p>
  );
}

/**
 * Doctors' schedule, time-off and policy requests awaiting this facility.
 * `compact` shows a count with a link, for the dashboard.
 */
export function ScheduleChangeRequests({
  compact = false,
}: {
  compact?: boolean;
}) {
  const {
    requests,
    list,
    pending,
    approve,
    review,
    dismissReview,
    confirmConflict,
    rejecting,
    startReject,
    cancelReject,
    reject,
  } = useScheduleChangeRequests();
  const [reason, setReason] = useState("");
  if (requests.isLoading || !list.length) return null;
  if (compact)
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <span>
          {list.length} doctor schedule{" "}
          {list.length === 1 ? "request" : "requests"} waiting for approval
        </span>
        <Link
          href="/doctor-schedules"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Review
        </Link>
      </div>
    );
  return (
    <section
      aria-labelledby="schedule-requests-heading"
      className="space-y-3 rounded-xl border p-4"
    >
      <h2 id="schedule-requests-heading" className="text-base font-semibold">
        Requests waiting for approval ({list.length})
      </h2>
      <ul className="space-y-3">
        {list.map((request) => (
          <li key={request.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {request.doctor_name} · {scheduleChangeRequestTitle(request)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {request.facility_name} · sent{" "}
                  {formatDisplayDate(request.created_at)}
                  {request.effective_from
                    ? ` · starts ${formatDisplayDate(request.effective_from)}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setReason("");
                    startReject(request);
                  }}
                >
                  Decline
                </Button>
                <Button disabled={pending} onClick={() => approve(request)}>
                  Approve
                </Button>
              </div>
            </div>
            <RequestDetails request={request} />
            {request.note ? (
              <p className="text-muted-foreground text-sm">
                Doctor&apos;s note: {request.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <ScheduleConflictDialog
        preview={review?.preview ?? null}
        pending={pending}
        onClose={dismissReview}
        onConfirm={confirmConflict}
      />
      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open && !pending) cancelReject();
        }}
      >
        <DialogContent>
          <DialogTitle>Decline request</DialogTitle>
          <DialogDescription>
            {rejecting
              ? `${rejecting.doctor_name} will receive this reason. Their current schedule stays as it is.`
              : ""}
          </DialogDescription>
          <Textarea
            aria-label="Reason for declining"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={pending} onClick={cancelReject}>
              Cancel
            </Button>
            <Button
              disabled={pending || reason.trim().length < 5}
              onClick={() => reject(reason)}
            >
              Decline request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
