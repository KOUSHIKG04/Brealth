"use client";

import { useState } from "react";
import {
  formatDisplayDate,
  scheduleBlockSummary,
  scheduleServiceLabel,
  type ScheduleChangePreview,
  type ScheduleConflictDecision,
} from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@startup/web-ui/components/ui/dialog";

export function ScheduleConflictDialog({
  preview,
  pending,
  onClose,
  onConfirm,
  onStartFromSuggestedDate,
}: {
  preview: ScheduleChangePreview | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (decision: ScheduleConflictDecision) => void;
  onStartFromSuggestedDate?: (date: string) => void;
}) {
  const suggestedDate = preview?.suggested_effective_from;
  const [choice, setChoice] = useState<{
    token: string;
    strategy: "trim" | "pause";
    reason: string;
  } | null>(null);
  const decision = choice?.token === preview?.token ? choice : null;
  const bookings =
    preview?.conflicts.flatMap((item) => item.bookings ?? []) ?? [];
  const affected = [
    ...new Map(bookings.map((item) => [item.id, item])).values(),
  ];
  const canProceed = preview?.can_request ?? preview?.can_replace;
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open: boolean) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>This time is already scheduled</DialogTitle>
        <DialogDescription>
          Review the affected availability from{" "}
          {preview ? formatDisplayDate(preview.effective_from) : ""}. Remaining
          hours below preserve complete appointment slots.
        </DialogDescription>
        <div className="space-y-5">
          {preview?.conflicts.map((item) => (
            <section key={item.rule_id} className="space-y-2">
              <h3 className="font-semibold">
                {scheduleServiceLabel(item.mode)} · {item.facility_name}
              </h3>
              <p className="text-sm">{scheduleBlockSummary(item)}</p>
              {item.travel_buffer_minutes > 0 ? (
                <p className="text-muted-foreground text-sm">
                  Includes {item.travel_buffer_minutes} minutes of travel before
                  and after the block.
                </p>
              ) : null}
              <p className="text-muted-foreground text-sm">
                Change starts {formatDisplayDate(item.effective_from)}
                {item.effective_until
                  ? `, through ${formatDisplayDate(item.effective_until)}`
                  : ""}
                .
              </p>
              <p className="text-sm">
                {(decision?.strategy === "pause"
                  ? (item.paused_remaining ?? [])
                  : item.remaining
                ).length
                  ? "Remaining availability:"
                  : "No hours remain for this block. Set new hours to offer it again."}
              </p>
              {(decision?.strategy === "pause"
                ? (item.paused_remaining ?? [])
                : item.remaining
              ).map((block) => (
                <p
                  key={scheduleBlockSummary(block)}
                  className="text-muted-foreground text-sm"
                >
                  {scheduleBlockSummary(block)}
                </p>
              ))}
              {decision?.strategy === "pause" ? (
                <p className="text-sm font-medium">
                  This affected block will be paused on the new schedule’s
                  working days. No new bookings will be offered until you
                  publish new hours. Other days keep their hours.
                </p>
              ) : null}
              {item.reason ? (
                <p role="alert" className="text-sm font-medium">
                  {item.reason}
                  {item.booked_count
                    ? ` (${item.booked_count} active reservations)`
                    : ""}
                </p>
              ) : null}
            </section>
          ))}
        </div>
        {affected.length ? (
          <section className="space-y-3" aria-label="Affected bookings">
            <h3 className="font-semibold">
              Affected bookings ({affected.length})
            </h3>
            {affected.map((booking) => (
              <p key={booking.id} className="text-sm">
                {booking.patient_name} · {booking.booking_code} ·{" "}
                {new Date(booking.starts_at).toLocaleString(undefined, {
                  timeZone: booking.timezone,
                })}{" "}
                ({booking.timezone})
                {booking.payment_hold
                  ? " · Awaiting payment — resolve this hold first"
                  : ""}
              </p>
            ))}
            <p className="text-sm">
              These bookings keep their times and payments. Conflicting new
              slots stay unavailable while rescheduling is unresolved. A request
              does not mean the patient has accepted a new time.
            </p>
          </section>
        ) : null}
        {decision && affected.length ? (
          <div className="space-y-2">
            <label
              htmlFor="schedule-patient-reason"
              className="text-sm font-medium"
            >
              Reason shown to patients
            </label>
            <textarea
              id="schedule-patient-reason"
              className="border-input min-h-24 w-full rounded-md border p-3 text-sm"
              maxLength={1000}
              disabled={pending}
              value={decision.reason}
              onChange={(event) =>
                setChoice({ ...decision, reason: event.target.value })
              }
              placeholder="Explain why the appointment needs a new time. Do not include private clinical information."
            />
            <p className="text-muted-foreground text-sm">
              Message preview: Your doctor has requested a new appointment time.{" "}
              {decision.reason.trim() || "[Your reason]"} Choose another time or
              contact the clinic. Your booking and payment stay in place until a
              separate decision is made.
            </p>
          </div>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Appointments are never automatically moved or cancelled. If another
          service loses all its hours, a notice will stay in Manage Schedule
          until you set new hours.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Edit my new hours
          </Button>
          {suggestedDate && onStartFromSuggestedDate && !decision ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              title="Publishes the same hours from the first date with no booked patients in the way."
              onClick={() => onStartFromSuggestedDate(suggestedDate)}
            >
              Start from {formatDisplayDate(suggestedDate)} instead
            </Button>
          ) : null}
          {canProceed && !decision ? (
            <>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  setChoice({
                    token: preview!.token,
                    strategy: "trim",
                    reason: "",
                  })
                }
              >
                Replace overlapping availability
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  setChoice({
                    token: preview!.token,
                    strategy: "pause",
                    reason: "",
                  })
                }
              >
                Publish new schedule and pause affected blocks
              </Button>
            </>
          ) : decision ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setChoice(null)}
              >
                Back to options
              </Button>
              <Button
                type="button"
                disabled={
                  pending ||
                  !canProceed ||
                  (affected.length > 0 && decision.reason.trim().length < 2)
                }
                onClick={() =>
                  onConfirm({
                    strategy: decision.strategy,
                    patientReason: decision.reason.trim(),
                  })
                }
              >
                {pending
                  ? "Saving schedules…"
                  : affected.length
                    ? "Publish and send rescheduling requests"
                    : decision.strategy === "pause"
                      ? "Confirm publish and pause"
                      : "Confirm replacement"}
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
