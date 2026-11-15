"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Minus,
  Search,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  X,
} from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import type { DashboardScreenProps } from "../types/dashboardScreen";
import {
  scheduleDays,
  weeklySchedulePageSize,
  fullScheduleDateFormatter,
  weekRangeFormatter,
} from "../utils/dashboardConstants";

function getDoctorInitials(name: string): string {
  const words = name
    .replace(/^Dr\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "DR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function WeeklyDoctorSchedule({
  doctors,
}: {
  doctors: DashboardScreenProps["weeklyDoctors"];
}) {
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const monday = new Date(todayKey + "T12:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const dates = scheduleDays.map(
    (_, index) => new Date(monday.getTime() + index * 86400000)
  );
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const query = search.trim().toLowerCase();
  const filtered = doctors.filter((doctor) =>
    (doctor.name + " " + doctor.speciality).toLowerCase().includes(query)
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / weeklySchedulePageSize)
  );
  const page = Math.min(pageIndex, pageCount - 1);
  const pageDoctors = filtered.slice(
    page * weeklySchedulePageSize,
    (page + 1) * weeklySchedulePageSize
  );

  return (
    <section className="border-border/80 bg-card min-w-0 overflow-hidden rounded-2xl border shadow-xs lg:col-span-8">
      <header className="border-border/60 bg-muted/10 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary border-primary/20 flex size-10 shrink-0 items-center justify-center rounded-xl border">
            <Stethoscope className="size-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-foreground text-lg font-semibold tracking-tight">
                Doctor weekly schedule
              </h2>
              <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                Live Roster
              </span>
            </div>
            <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
              <CalendarDays className="size-3.5" />
              <span
                className="text-foreground/80 font-medium tabular-nums"
                suppressHydrationWarning
              >
                {weekRangeFormatter.format(dates[0])} –{" "}
                {weekRangeFormatter.format(dates[6])}
              </span>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              <span>Published clinic availability</span>
            </p>
          </div>
        </div>

        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-border/80 hover:border-primary/40 hover:bg-primary/5 hover:text-primary h-8 gap-1.5 self-start text-xs font-medium transition-colors sm:self-center"
        >
          <Link href="/doctor-schedules">
            View schedules
            <ArrowUpRight className="text-muted-foreground size-3.5" />
          </Link>
        </Button>
      </header>

      {doctors.length ? (
        <>
          <div className="border-border/50 bg-background/50 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="relative max-w-sm min-w-[200px] flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search weekly doctors"
                placeholder="Search doctor or speciality"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPageIndex(0);
                }}
                className="border-border/80 bg-muted/20 text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background focus:ring-primary/20 h-9 w-full rounded-lg border pr-8 pl-9 text-sm transition-[color,background-color,border-color,box-shadow] outline-none focus:ring-2"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setPageIndex(0);
                  }}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5"
                  aria-label="Clear input"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <span
              className="border-border/60 bg-muted/50 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums"
              aria-live="polite"
            >
              <span className="bg-primary/80 size-1.5 rounded-full" />
              {filtered.length} {filtered.length === 1 ? "doctor" : "doctors"}
            </span>
          </div>

          <div
            role="region"
            aria-label="Weekly doctor schedule"
            tabIndex={0}
            className="border-border focus-visible:outline-ring overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
          >
            <div
              role="table"
              aria-label="Doctor clinic availability from Monday to Sunday"
              className="min-w-[580px]"
            >
              <div role="rowgroup">
                <div
                  role="row"
                  className="border-border/80 bg-muted/25 grid grid-cols-[minmax(12rem,1.7fr)_repeat(7,minmax(3.2rem,1fr))] border-b"
                >
                  <div
                    role="columnheader"
                    className="bg-card text-muted-foreground border-border/40 sticky left-0 z-10 flex items-center border-r px-4 py-3 text-xs font-semibold tracking-wider uppercase sm:px-5"
                  >
                    Doctor / Speciality
                  </div>
                  {scheduleDays.map((day, index) => {
                    const date = dates[index];
                    const isToday =
                      date.toISOString().slice(0, 10) === todayKey;
                    return (
                      <div
                        role="columnheader"
                        key={day}
                        aria-label={fullScheduleDateFormatter.format(date)}
                        aria-current={isToday ? "date" : undefined}
                        className={
                          "relative flex flex-col items-center justify-center gap-1 px-1 py-2.5 text-xs transition-colors " +
                          (isToday
                            ? "bg-primary/10 text-primary after:bg-primary font-semibold after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-8 after:-translate-x-1/2 after:rounded-full"
                            : "text-muted-foreground")
                        }
                      >
                        <span
                          className={
                            "text-xs font-semibold tracking-wider uppercase " +
                            (isToday
                              ? "text-primary"
                              : "text-muted-foreground/80")
                          }
                        >
                          {day}
                        </span>
                        <span
                          className={
                            "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums " +
                            (isToday
                              ? "bg-primary text-primary-foreground shadow-2xs"
                              : "text-foreground/90")
                          }
                        >
                          {date.getUTCDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div role="rowgroup" className="divide-border/60 divide-y">
                {pageDoctors.map((doctor, rowIndex) => (
                  <div
                    role="row"
                    key={doctor.id + ":" + rowIndex}
                    className="group hover:bg-muted/30 grid grid-cols-[minmax(12rem,1.7fr)_repeat(7,minmax(3.2rem,1fr))] items-stretch transition-colors duration-150"
                  >
                    <div
                      role="rowheader"
                      className="bg-card group-hover:bg-muted/30 border-border/40 sticky left-0 z-10 flex min-w-0 items-center gap-3 border-r px-4 py-3 transition-colors sm:px-5"
                    >
                      <div className="bg-primary/10 text-primary border-primary/20 flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold shadow-2xs">
                        {getDoctorInitials(doctor.name)}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p
                          className="text-foreground group-hover:text-primary truncate text-sm font-semibold transition-colors"
                          title={doctor.name}
                        >
                          {doctor.name}
                        </p>
                        <p
                          className="text-muted-foreground flex items-center gap-1.5 truncate text-xs"
                          title={doctor.speciality || "Speciality not recorded"}
                        >
                          <span className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500/80" />
                          <span className="truncate">
                            {doctor.speciality || "Speciality not recorded"}
                          </span>
                        </p>
                      </div>
                    </div>

                    {scheduleDays.map((day, index) => {
                      const scheduled = !!doctor.days[index];
                      const date = dates[index];
                      const isToday =
                        date.toISOString().slice(0, 10) === todayKey;
                      return (
                        <div
                          role="cell"
                          key={day}
                          aria-label={
                            doctor.name +
                            " · " +
                            day +
                            " · " +
                            (scheduled
                              ? "Clinic scheduled"
                              : "No published clinic shift")
                          }
                          title={
                            day +
                            ": " +
                            (scheduled
                              ? "Clinic scheduled"
                              : "No published clinic shift")
                          }
                          className={
                            "flex items-center justify-center px-1 py-2.5 transition-colors " +
                            (isToday ? "bg-primary/[0.03]" : "")
                          }
                        >
                          {scheduled ? (
                            <span className="bg-primary/15 text-primary border-primary/25 inline-flex size-8 items-center justify-center rounded-lg border shadow-2xs transition-transform group-hover:scale-105">
                              <Check
                                aria-hidden="true"
                                className="size-4 stroke-[2.5]"
                              />
                            </span>
                          ) : (
                            <span className="text-muted-foreground/35 group-hover:text-muted-foreground/60 inline-flex size-8 items-center justify-center rounded-lg transition-colors">
                              <Minus
                                aria-hidden="true"
                                className="size-3.5 stroke-[2]"
                              />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {!filtered.length ? (
              <div className="space-y-3 px-5 py-10 text-center">
                <div className="bg-muted/40 text-muted-foreground mx-auto flex size-10 items-center justify-center rounded-full">
                  <Search className="size-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-foreground text-sm font-medium">
                    No doctors match your search.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Try checking for typos or searching by a broader medical
                    speciality.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setPageIndex(0);
                  }}
                  className="h-8 text-xs"
                >
                  Clear search
                </Button>
              </div>
            ) : null}
          </div>

          <footer className="border-border/60 bg-muted/15 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
            <div className="text-muted-foreground flex items-center gap-4 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span className="bg-primary/15 text-primary border-primary/25 flex size-4 items-center justify-center rounded border">
                  <Check aria-hidden="true" className="size-3 stroke-[2.5]" />
                </span>
                <span>Scheduled</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="bg-muted/50 text-muted-foreground/70 border-border/40 flex size-4 items-center justify-center rounded border">
                  <Minus aria-hidden="true" className="size-2.5 stroke-[2]" />
                </span>
                <span>No clinic shift</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs font-medium tabular-nums">
                {filtered.length ? page * weeklySchedulePageSize + 1 : 0}–
                {Math.min((page + 1) * weeklySchedulePageSize, filtered.length)}{" "}
                of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="border-border/80 hover:bg-muted/80 size-7 rounded-md disabled:opacity-40"
                  aria-label="Previous doctors"
                  disabled={page === 0}
                  onClick={() => setPageIndex(page - 1)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="border-border/80 hover:bg-muted/80 size-7 rounded-md disabled:opacity-40"
                  aria-label="Next doctors"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPageIndex(page + 1)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </footer>
        </>
      ) : (
        <div className="border-border/60 flex items-start gap-4 border-t p-6">
          <div className="bg-muted/50 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
            <CalendarDays className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-foreground text-sm font-medium">
              No doctors associated
            </p>
            <p className="text-muted-foreground text-xs leading-5">
              No doctors are associated with this facility yet. Add a doctor to
              set their schedule.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
