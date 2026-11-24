"use client";

import Link from "next/link";
import { ArrowUpRight, Bell } from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import { useDoctorSchedules } from "../hooks/useDoctorSchedules";
import type { DoctorSchedulesScreenProps } from "../types/doctorSchedulesScreen";
import { DoctorSchedulesStats } from "../components/DoctorSchedulesStats";
import { DoctorShiftGantt } from "../components/DoctorShiftGantt";
import { DoctorAssignmentsTable } from "../components/DoctorAssignmentsTable";
import { ScheduleChangeRequests } from "../components/ScheduleChangeRequests";
import { ShiftPlanRequests } from "../components/ShiftPlanRequests";

export default function DoctorSchedulesScreen({
  doctors,
  sessions,
  loadError,
}: DoctorSchedulesScreenProps) {
  const { selectedDay, setSelectedDay, schedule, router } = useDoctorSchedules({
    doctors,
    sessions,
    loadError,
  });
  return (
    <div className="flex min-w-0 flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            Doctor schedules
          </h1>
          <p className="text-muted-foreground max-w-xl text-sm leading-6">
            Review published clinic, online and home-visit availability by date.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="icon" className="size-10">
            <Link
              href="/doctor-management?tab=notifications"
              aria-label="Doctor notifications"
            >
              <Bell className="size-4" />
            </Link>
          </Button>
          <Button asChild className="min-h-10 gap-2">
            <Link href="/doctor-management">
              Manage doctor schedules
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>
      {loadError ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"
        >
          <p>{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      <ScheduleChangeRequests />
      <ShiftPlanRequests />
      <DoctorSchedulesStats
        scheduleSummary={schedule.summary}
        scheduledShifts={schedule.departments.reduce(
          (sum, department) => sum + department.shifts.length,
          0
        )}
        departments={schedule.departments.length}
      />
      <DoctorShiftGantt
        selectedDay={selectedDay}
        onDayChange={setSelectedDay}
        nextScheduledDay={schedule.nextScheduledDay}
        departments={schedule.departments}
      />
      <DoctorAssignmentsTable
        assignments={schedule.assignments}
        selectedDay={selectedDay}
      />
    </div>
  );
}
