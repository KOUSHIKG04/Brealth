"use client";

import { useState } from "react";
import {
  defaultShiftPlan,
  defaultShiftTemplates,
  formatDisplayDate,
  maxRotationWeeks,
  maxShiftTemplates,
  shiftEndLabel,
  shiftPlanDraftProblem,
  shiftPreview,
  shiftWeekdayLabels,
  type ShiftPlanInput,
  type ShiftTemplate,
} from "@startup/contracts";
import { Button } from "@startup/web-ui/components/ui/button";
import { Input } from "@startup/web-ui/components/ui/input";
import { Label } from "@startup/web-ui/components/ui/label";
import { Skeleton } from "@startup/web-ui/components/ui/skeleton";
import { ClockTimePicker } from "./ClockTimePicker";
import { NumberSetting } from "./NumberSetting";
import { ScheduleSection } from "./ScheduleSection";
import { useFacilityShiftPlan } from "../hooks/useFacilityShiftPlan";
import type { FacilityShiftRotationEditorProps } from "../types/facilityShiftRotationEditor";

type Draft = ShiftPlanInput & { effectiveFrom: string };

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Facility staff edit a doctor's shift rotation: named shifts (overnight and
 * up to 28 hours), a 1-8 week rotation, single-date changes, a start date and
 * a preview. Staff publish directly; the doctor sees the result in the app.
 */
export function FacilityShiftRotationEditor({
  practiceId,
  mode,
}: FacilityShiftRotationEditorProps) {
  const plan = useFacilityShiftPlan(practiceId, mode);
  const firstDay = addDays(plan.today, 1);
  // A doctor's pending request is shown for reference; staff may replace it.
  const source = plan.pending ?? plan.active;
  const [edits, setEdits] = useState<Draft | null>(null);
  const [overrideDate, setOverrideDate] = useState("");
  const [endFrom, setEndFrom] = useState("");
  const base: Draft = source
    ? {
        templates: source.templates,
        cycle_start: source.cycle_start,
        cycle_weeks: source.cycle_weeks,
        rotation: source.rotation,
        overrides: source.overrides,
        effectiveFrom:
          source.effective_from >= firstDay ? source.effective_from : firstDay,
      }
    : { ...defaultShiftPlan(mode, firstDay), effectiveFrom: firstDay };
  const draft = edits ?? base;
  const update = (changes: Partial<Draft>) =>
    setEdits({ ...draft, ...changes });
  const setShift = (index: number, changes: Partial<ShiftTemplate>) =>
    update({
      templates: draft.templates.map((shift, i) =>
        i === index ? { ...shift, ...changes } : shift
      ),
    });
  const nameOf = (key: string | null) =>
    key
      ? (draft.templates.find((shift) => shift.key === key)?.name ?? "—")
      : "Off";
  const cycleDay = (week: number, day: number) => {
    const options = [null, ...draft.templates.map((shift) => shift.key)];
    const next =
      options[
        (options.indexOf(draft.rotation[week][day]) + 1) % options.length
      ];
    update({
      rotation: draft.rotation.map((row, w) =>
        w === week ? row.map((value, d) => (d === day ? next : value)) : row
      ),
    });
  };
  const addShift = () => {
    const used = new Set(draft.templates.map((shift) => shift.key));
    let n = draft.templates.length + 1;
    while (used.has(`shift-${n}`)) n++;
    update({
      templates: [
        ...draft.templates,
        {
          ...defaultShiftTemplates(mode)[0],
          key: `shift-${n}`,
          name: `Shift ${n}`,
        },
      ],
    });
  };
  const removeShift = (key: string) =>
    update({
      templates: draft.templates.filter((shift) => shift.key !== key),
      rotation: draft.rotation.map((week) =>
        week.map((day) => (day === key ? null : day))
      ),
      overrides: draft.overrides.filter((item) => item.key !== key),
    });
  const addOverride = (key: string | null) => {
    if (!overrideDate) return;
    update({
      overrides: [
        ...draft.overrides.filter((item) => item.date !== overrideDate),
        { date: overrideDate, key },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    });
    setOverrideDate("");
  };
  const problem = shiftPlanDraftProblem(draft, mode);
  const preview = shiftPreview(draft, draft.effectiveFrom, 28);
  if (plan.loading)
    return (
      <div className="space-y-3" aria-label="Loading shift rotation">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  return (
    <div className="space-y-6">
      {plan.loadError ? (
        <p role="alert" className="text-destructive text-sm">
          {plan.loadError}
        </p>
      ) : null}
      {plan.active ? (
        <p className="text-muted-foreground text-sm">
          Rotation live from {formatDisplayDate(plan.active.effective_from)}
          {plan.active.ended_from
            ? `, ending ${formatDisplayDate(plan.active.ended_from)}`
            : ""}
          .
        </p>
      ) : null}
      {plan.pending ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          The doctor requested this rotation on{" "}
          {formatDisplayDate(plan.pending.created_at)}. Approve it in Doctor
          Schedules, or edit and publish it here.
        </p>
      ) : null}

      <ScheduleSection title="Shifts">
        <div className="space-y-5">
          {draft.templates.map((shift, index) => {
            const slots = Math.floor(
              shift.duration_minutes / shift.slot_minutes
            );
            return (
              <fieldset
                key={shift.key}
                className="space-y-4 rounded-lg border p-4"
              >
                <legend className="px-1 text-sm font-medium">
                  {shift.name || `Shift ${index + 1}`}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`shift-name-${shift.key}`}>
                      Shift name
                    </Label>
                    <Input
                      id={`shift-name-${shift.key}`}
                      value={shift.name}
                      maxLength={40}
                      disabled={plan.busy}
                      onChange={(event) =>
                        setShift(index, { name: event.target.value })
                      }
                    />
                  </div>
                  <ClockTimePicker
                    label="Starts at"
                    value={shift.start}
                    disabled={plan.busy}
                    onChange={(start) => setShift(index, { start })}
                  />
                  <div className="space-y-1">
                    <NumberSetting
                      title="Length"
                      value={shift.duration_minutes}
                      min={30}
                      max={1680}
                      step={30}
                      suffix="min"
                      disabled={plan.busy}
                      onChange={(duration_minutes) =>
                        setShift(index, { duration_minutes })
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      {Math.floor(shift.duration_minutes / 60)} h{" "}
                      {shift.duration_minutes % 60} min · ends{" "}
                      {shiftEndLabel(shift.start, shift.duration_minutes)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <NumberSetting
                      title={
                        mode === "home" ? "Visit length" : "Appointment length"
                      }
                      value={shift.slot_minutes}
                      min={mode === "home" ? 30 : 5}
                      max={120}
                      step={5}
                      suffix="min"
                      disabled={plan.busy}
                      onChange={(slot_minutes) =>
                        setShift(index, { slot_minutes })
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      {slots} appointment times in this shift
                    </p>
                  </div>
                  {mode === "clinic" ? (
                    <>
                      <NumberSetting
                        title="App booking slots"
                        value={Math.min(shift.app_limit ?? 0, slots)}
                        min={0}
                        max={Math.min(slots, 100)}
                        suffix="slots"
                        disabled={plan.busy}
                        onChange={(app_limit) =>
                          setShift(index, {
                            app_limit,
                            walkin_limit: Math.min(
                              shift.walkin_limit ?? 0,
                              Math.max(0, Math.min(slots, 100) - app_limit)
                            ),
                          })
                        }
                      />
                      <NumberSetting
                        title="Walk-in limit"
                        value={shift.walkin_limit ?? 0}
                        min={0}
                        max={Math.max(
                          0,
                          Math.min(slots, 100) - (shift.app_limit ?? 0)
                        )}
                        suffix="walk-ins"
                        disabled={plan.busy}
                        onChange={(walkin_limit) =>
                          setShift(index, { walkin_limit })
                        }
                      />
                    </>
                  ) : (
                    <NumberSetting
                      title="Bookings per shift"
                      value={Math.min(
                        shift.daily_limit ?? 1,
                        Math.max(1, slots)
                      )}
                      min={1}
                      max={Math.max(1, Math.min(slots, 100))}
                      suffix="bookings"
                      disabled={plan.busy}
                      onChange={(daily_limit) =>
                        setShift(index, { daily_limit })
                      }
                    />
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`shift-fee-${shift.key}`}>Fee (₹)</Label>
                    <Input
                      id={`shift-fee-${shift.key}`}
                      inputMode="decimal"
                      value={String(shift.fee_minor / 100)}
                      disabled={plan.busy}
                      onChange={(event) => {
                        if (/^\d{0,6}(\.\d{0,2})?$/.test(event.target.value))
                          setShift(index, {
                            fee_minor: Math.round(
                              Number(event.target.value || 0) * 100
                            ),
                          });
                      }}
                    />
                  </div>
                </div>
                {draft.templates.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={plan.busy}
                    onClick={() => removeShift(shift.key)}
                  >
                    Remove {shift.name}
                  </Button>
                ) : null}
              </fieldset>
            );
          })}
          {draft.templates.length < maxShiftTemplates ? (
            <Button
              type="button"
              variant="outline"
              disabled={plan.busy}
              onClick={addShift}
            >
              Add shift
            </Button>
          ) : null}
        </div>
      </ScheduleSection>

      <ScheduleSection title="Rotation">
        <NumberSetting
          title="Rotation length"
          value={draft.cycle_weeks}
          min={1}
          max={maxRotationWeeks}
          suffix="weeks"
          disabled={plan.busy}
          onChange={(weeks) =>
            update({
              cycle_weeks: weeks,
              rotation: Array.from(
                { length: weeks },
                (_, i) => draft.rotation[i] ?? Array(7).fill(null)
              ),
            })
          }
        />
        <p className="text-muted-foreground text-sm">
          Click a day to change its shift. The weeks repeat in order.
        </p>
        <div className="space-y-3 overflow-x-auto">
          {draft.rotation.map((week, w) => (
            <div key={w} className="space-y-1">
              <p className="text-sm font-medium">Week {w + 1}</p>
              <div className="grid min-w-[560px] grid-cols-7 gap-2">
                {week.map((key, d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={plan.busy}
                    aria-label={`Week ${w + 1} ${shiftWeekdayLabels[d]}: ${nameOf(key)}`}
                    onClick={() => cycleDay(w, d)}
                    className={`rounded-lg border p-2 text-center text-xs focus-visible:outline-2 focus-visible:outline-[#008577] ${
                      key
                        ? "border-[#008577] bg-[#008577] text-white"
                        : "bg-white text-[#475569]"
                    }`}
                  >
                    <span className="block">{shiftWeekdayLabels[d]}</span>
                    <span className="block truncate font-medium">
                      {nameOf(key)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScheduleSection>

      <ScheduleSection title="Date changes">
        <p className="text-muted-foreground text-sm">
          Change a single date, for example a 24-hour shift or a day off.
        </p>
        <ul className="space-y-1 text-sm">
          {draft.overrides.map((item) => (
            <li key={item.date} className="flex items-center justify-between">
              <span>
                {formatDisplayDate(item.date)} · {nameOf(item.key)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  update({
                    overrides: draft.overrides.filter(
                      (other) => other.date !== item.date
                    ),
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor={`override-${mode}`}>Date to change</Label>
          <Input
            id={`override-${mode}`}
            type="date"
            min={plan.today}
            value={overrideDate}
            disabled={plan.busy}
            onChange={(event) => setOverrideDate(event.target.value)}
          />
        </div>
        {overrideDate ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => addOverride(null)}
            >
              Off
            </Button>
            {draft.templates.map((shift) => (
              <Button
                key={shift.key}
                type="button"
                variant="outline"
                onClick={() => addOverride(shift.key)}
              >
                {shift.name}
              </Button>
            ))}
          </div>
        ) : null}
      </ScheduleSection>

      <ScheduleSection title="Start and preview">
        <div className="space-y-2">
          <Label htmlFor={`rotation-start-${mode}`}>Rotation starts on</Label>
          <Input
            id={`rotation-start-${mode}`}
            type="date"
            min={firstDay}
            value={draft.effectiveFrom}
            disabled={plan.busy}
            onChange={(event) => {
              if (event.target.value)
                update({ effectiveFrom: event.target.value });
            }}
          />
          <p className="text-muted-foreground text-sm">
            From this date the doctor&apos;s weekly schedule for this service
            stops. Booked appointments after it must be moved first.
          </p>
        </div>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {preview.map((day) => (
            <li
              key={day.date}
              className={
                day.skipped
                  ? "text-destructive"
                  : day.shift
                    ? ""
                    : "text-muted-foreground"
              }
            >
              {formatDisplayDate(day.date)} ·{" "}
              {day.shift
                ? `${day.shift.name} ${day.shift.start}–${shiftEndLabel(day.shift.start, day.shift.duration_minutes)}${day.skipped ? " · overlaps the previous shift, skipped" : ""}`
                : "Off"}
            </li>
          ))}
        </ul>
      </ScheduleSection>

      <div className="space-y-3 rounded-xl border p-4">
        {problem ? (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Shifts are created for the next 30 days and kept up to date.
          </p>
        )}
        <Button
          type="button"
          disabled={plan.busy || Boolean(problem)}
          onClick={() => {
            const { effectiveFrom, ...input } = draft;
            plan.publish(input, effectiveFrom, () => setEdits(null));
          }}
        >
          {plan.busy ? "Publishing…" : "Publish rotation"}
        </Button>
        {plan.active ? (
          <div className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="space-y-2">
              <Label htmlFor={`rotation-end-${mode}`}>End rotation from</Label>
              <Input
                id={`rotation-end-${mode}`}
                type="date"
                min={plan.today}
                value={endFrom || firstDay}
                disabled={plan.busy}
                onChange={(event) => setEndFrom(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={plan.busy}
              onClick={() => plan.end(endFrom || firstDay)}
            >
              End rotation
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
