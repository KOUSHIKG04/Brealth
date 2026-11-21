"use client";

import { useState } from "react";
import { formatDisplayDate, type ShiftPlan } from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@startup/web-ui/components/ui/dialog";
import { Textarea } from "@startup/web-ui/components/ui/textarea";
import { useShiftPlanRequests } from "../hooks/useShiftPlanRequests";

const serviceLabels = {
  clinic: "In-person (OPD)",
  online: "Online",
  home: "Home visits",
} as const;

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ends(start: string, minutes: number) {
  const total =
    Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes;
  const clock = `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return total >= 1440 ? `${clock} next day` : clock;
}

function PlanSummary({ plan }: { plan: ShiftPlan }) {
  const name = (key: string | null) =>
    key ? (plan.templates.find((t) => t.key === key)?.name ?? key) : "Off";
  return (
    <div className="space-y-2 text-sm">
      <ul className="space-y-1">
        {plan.templates.map((shift) => (
          <li key={shift.key}>
            <span className="font-medium">{shift.name}</span> · {shift.start}–
            {ends(shift.start, shift.duration_minutes)} · {shift.slot_minutes}{" "}
            min appointments
            {plan.service_mode === "clinic"
              ? ` · ${shift.app_limit ?? 0} app / ${shift.walkin_limit ?? 0} walk-in`
              : ` · ${shift.daily_limit ?? 0} bookings`}
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        {plan.rotation.map((week, index) => (
          <p key={index} className="text-muted-foreground">
            Week {index + 1}:{" "}
            {week.map((key, day) => `${weekdays[day]} ${name(key)}`).join(", ")}
          </p>
        ))}
      </div>
      {plan.overrides.length ? (
        <p className="text-muted-foreground">
          Date changes:{" "}
          {plan.overrides
            .map((item) => `${formatDisplayDate(item.date)} ${name(item.key)}`)
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/** Doctors' shift rotations waiting for approval at this facility. */
export function ShiftPlanRequests() {
  const { plans, loadError, pending, declining, setDeclining, decide } =
    useShiftPlanRequests();
  const [reason, setReason] = useState("");
  if (!plans.length && !loadError) return null;
  return (
    <section
      aria-label="Shift rotation requests"
      className="bg-card space-y-4 rounded-xl border p-4"
    >
      <h2 className="font-semibold">Shift rotation requests</h2>
      {loadError ? (
        <p role="alert" className="text-destructive text-sm">
          {loadError}
        </p>
      ) : null}
      {plans.map((plan) => (
        <article key={plan.id} className="space-y-3 border-t pt-3">
          <p className="text-sm">
            <span className="font-medium">{plan.doctor_name ?? "Doctor"}</span>{" "}
            · {serviceLabels[plan.service_mode]} · {plan.cycle_weeks}-week
            rotation from {formatDisplayDate(plan.effective_from)}
          </p>
          <PlanSummary plan={plan} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => decide(plan, true)}>
              Approve rotation
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setReason("");
                setDeclining(plan);
              }}
            >
              Decline
            </Button>
          </div>
        </article>
      ))}
      <Dialog
        open={declining !== null}
        onOpenChange={(open: boolean) => {
          if (!open && !pending) setDeclining(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Decline shift rotation</DialogTitle>
          <DialogDescription>
            The doctor sees this reason and can submit a new rotation.
          </DialogDescription>
          <Textarea
            aria-label="Reason for declining"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            disabled={pending || reason.trim().length < 3}
            onClick={() => declining && decide(declining, false, reason.trim())}
          >
            Decline rotation
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
