"use client";

import { scheduleServices } from "../utils/facilityDoctorScheduleConstants";

import { FacilityDoctorScheduleEditor } from "../components/FacilityDoctorScheduleEditor";

import type { FacilityDoctorScheduleScreenProps } from "../types/facilityDoctorScheduleScreen";

import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { FacilityUnavailableTime } from "../components/FacilityUnavailableTime";

import { ScheduleAdjustmentNotices } from "../components/ScheduleAdjustmentNotices";

export function FacilityDoctorScheduleScreen({
  practiceId,
  mode,
  onSelectMode,
  transition,
}: FacilityDoctorScheduleScreenProps) {
  if (mode)
    return (
      <FacilityDoctorScheduleEditor
        key={`${practiceId}:${mode}`}
        practiceId={practiceId}
        mode={mode}
        onSelectMode={onSelectMode}
        transition={transition}
      />
    );
  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      {!onSelectMode ? (
        <h1 className="text-2xl font-bold">Manage Schedule</h1>
      ) : null}
      <ScheduleAdjustmentNotices
        practiceId={practiceId}
        onSelectMode={onSelectMode}
      />
      <div className="grid w-full min-w-0 grid-cols-1 gap-4">
        {scheduleServices.map(([service, title, description, Icon]) =>
          onSelectMode ? (
            <button
              type="button"
              key={service}
              onClick={() => onSelectMode(service)}
              className="border-border bg-card hover:bg-muted focus-visible:outline-primary flex min-h-20 w-full items-center gap-3 rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon className="size-5 shrink-0 text-[#008577]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm leading-6 font-semibold">{title}</h2>
                <p className="text-muted-foreground mt-0.5 text-sm leading-5">
                  {description}
                </p>
              </div>
              <ChevronRight className="size-5 text-[#64748b]" />
            </button>
          ) : (
            <Link
              key={service}
              href={`/doctor-schedules/${practiceId}/${service}`}
              className="flex min-h-20 items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008577]"
            >
              <Icon className="size-5 shrink-0 text-[#008577]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm leading-6 font-semibold">{title}</h2>
                <p className="text-muted-foreground mt-0.5 text-sm leading-5">
                  {description}
                </p>
              </div>
              <ChevronRight className="size-5 text-[#64748b]" />
            </Link>
          )
        )}
        <FacilityUnavailableTime
          practiceId={practiceId}
          transition={transition}
        />
      </div>
    </div>
  );
}
