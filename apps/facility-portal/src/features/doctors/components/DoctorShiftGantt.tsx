"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import { Input } from "@startup/web-ui/components/ui/input";
import type { DoctorShiftGanttProps } from "../types/doctorShiftGantt";
import {
  scheduleTimeLabels,
  shiftStyles,
} from "../utils/doctorSchedulesConstants";
import { facilityDayKey } from "../utils/facilitySchedule";

function moveDay(day: string, offset: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}

function timelinePosition(time: string) {
  const [start, end] = time.split("-").map((clock) => {
    const [h, m] = clock.split(":").map(Number);
    return h * 60 + m;
  });
  const finish = end <= start ? 1440 : end;
  return {
    left: (start / 1440) * 100 + "%",
    width: ((finish - start) / 1440) * 100 + "%",
  };
}

export function DoctorShiftGantt({
  selectedDay,
  onDayChange,
  nextScheduledDay,
  departments,
}: DoctorShiftGanttProps) {
  const today = facilityDayKey(new Date());
  const tomorrow = moveDay(today, 1);
  const selectedDate = new Date(selectedDay + "T12:00:00Z");
  const monday = moveDay(selectedDay, -((selectedDate.getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => moveDay(monday, index));
  const selectedLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(selectedDate);
  const shiftCount = departments.reduce(
    (sum, department) => sum + department.shifts.length,
    0
  );
  return (
    <section className="border-border bg-card min-w-0 rounded-xl border">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-foreground text-lg font-semibold">
              Daily schedule
            </h2>
            <p className="text-muted-foreground text-sm">{selectedLabel}</p>
          </div>
          <span className="bg-muted text-primary rounded-md px-2.5 py-1 text-xs font-medium tabular-nums">
            {shiftCount} published {shiftCount === 1 ? "shift" : "shifts"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              aria-label="Previous schedule day"
              disabled={selectedDay <= today}
              onClick={() => onDayChange(moveDay(selectedDay, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="date"
              aria-label="Schedule date"
              value={selectedDay}
              min={today}
              onChange={(event) => {
                if (event.target.value >= today)
                  onDayChange(event.target.value);
              }}
              className="h-10 w-40 min-w-0 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              aria-label="Next schedule day"
              onClick={() => onDayChange(moveDay(selectedDay, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="border-border flex gap-1 rounded-lg border p-1">
            {[
              ["Today", today],
              ["Tomorrow", tomorrow],
            ].map(([label, day]) => (
              <button
                type="button"
                key={label}
                aria-pressed={selectedDay === day}
                onClick={() => onDayChange(day)}
                className={
                  "focus-visible:ring-ring min-h-8 rounded-md px-3 text-sm focus-visible:ring-2 " +
                  (selectedDay === day
                    ? "bg-muted text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div
          className="overflow-x-auto pb-1"
          role="group"
          aria-label="Choose a schedule day"
        >
          <div className="grid min-w-[308px] grid-cols-7 gap-1.5">
            {week.map((day) => {
              const date = new Date(day + "T12:00:00Z");
              const name = new Intl.DateTimeFormat("en-US", {
                timeZone: "UTC",
                weekday: "short",
              }).format(date);
              return (
                <button
                  type="button"
                  key={day}
                  aria-label={day}
                  aria-pressed={day === selectedDay}
                  disabled={day < today}
                  onClick={() => onDayChange(day)}
                  className={
                    "focus-visible:ring-ring flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm focus-visible:ring-2 disabled:opacity-40 " +
                    (day === selectedDay
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted text-foreground")
                  }
                >
                  <span className="text-xs">{name}</span>
                  <span className="font-semibold tabular-nums">
                    {date.getUTCDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-border border-t px-4 sm:px-5">
        {departments.length ? (
          <>
            <div className="border-border text-muted-foreground hidden grid-cols-[16rem_minmax(0,1fr)] gap-4 border-b py-3 text-xs lg:grid">
              <span>Doctor / Service</span>
              <div className="relative h-4 tabular-nums">
                {[...scheduleTimeLabels, "24:00"].map((time, index) => (
                  <span
                    key={time}
                    style={{ left: `${(index / 6) * 100}%` }}
                    className={
                      "absolute " +
                      (index === 0
                        ? ""
                        : index === 6
                          ? "-translate-x-full"
                          : "-translate-x-1/2")
                    }
                  >
                    {time}
                  </span>
                ))}
              </div>
            </div>
            {departments.map((department) => (
              <section
                key={department.department}
                className="border-border border-b py-4 last:border-0"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-foreground text-sm font-semibold">
                    {department.department}
                  </h3>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {department.shifts.length}{" "}
                    {department.shifts.length === 1 ? "shift" : "shifts"}
                  </span>
                </div>
                <ul className="divide-border divide-y">
                  {[...department.shifts]
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((shift, index) => {
                      const style = shiftStyles[shift.type];
                      return (
                        <li
                          key={shift.doctor + shift.time + shift.type + index}
                          className="grid gap-4 py-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-center"
                        >
                          <div className="min-w-0 space-y-2">
                            <p className="text-foreground text-sm font-medium">
                              {shift.doctor}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={
                                  "rounded-md px-2 py-0.5 text-xs " +
                                  style.badge
                                }
                              >
                                {style.label}
                              </span>
                              <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                                {shift.time.replace("-", " – ")}
                              </span>
                            </div>
                          </div>
                          <div
                            role="img"
                            aria-label={
                              shift.doctor +
                              " · " +
                              style.label +
                              " · " +
                              shift.time
                            }
                            className="bg-muted/50 relative hidden h-10 overflow-hidden rounded-md lg:block"
                          >
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 grid grid-cols-6"
                            >
                              {scheduleTimeLabels.map((time) => (
                                <span
                                  key={time}
                                  className="border-border border-l first:border-0"
                                />
                              ))}
                            </div>
                            <div
                              className={
                                "absolute top-2 bottom-2 min-w-px rounded-sm " +
                                style.bar
                              }
                              style={timelinePosition(shift.time)}
                            />
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 py-10 sm:flex-row sm:gap-4">
            <CalendarDays className="text-muted-foreground size-6 shrink-0" />
            <div className="space-y-2">
              <h3 className="text-foreground text-sm font-medium">
                No published shifts for this date
              </h3>
              <p className="text-muted-foreground max-w-lg text-sm leading-6">
                Choose another date or publish availability from Doctor
                Management.
              </p>
              <div className="flex flex-wrap gap-3">
                {nextScheduledDay && selectedDay < nextScheduledDay ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDayChange(nextScheduledDay)}
                  >
                    View next scheduled day: {nextScheduledDay}
                  </Button>
                ) : null}
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link href="/doctor-management">Manage doctor schedules</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
