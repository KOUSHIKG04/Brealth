"use client";

import Link from "next/link";
import type { Mode } from "../types/facilityDoctorScheduleScreen";
import { useQuery } from "@tanstack/react-query";
import {
  scheduleServiceLabel,
  type ScheduleAdjustmentNotice,
} from "@startup/contracts";
import { loadFacilityScheduleAdjustments } from "../server/scheduleActions";

export function ScheduleAdjustmentNotices({
  practiceId,
  onSelectMode,
}: {
  practiceId: string;
  onSelectMode?: (mode: Mode) => void;
}) {
  const notices = useQuery({
    queryKey: ["schedule-adjustments", practiceId],
    queryFn: () => loadFacilityScheduleAdjustments(practiceId),
  });
  return (
    <>
      {notices.data?.map((notice: ScheduleAdjustmentNotice) => (
        <section
          key={notice.mode}
          className="border-border space-y-2 rounded-xl border p-4"
          aria-live="polite"
        >
          <h2 className="text-sm font-semibold">
            {scheduleServiceLabel(notice.mode)} schedule needs review
          </h2>
          <p className="text-muted-foreground text-sm">{notice.message}</p>
          {onSelectMode &&
          !notice.message.startsWith("Waiting for rescheduling.") ? (
            <button
              type="button"
              className="inline-block text-sm font-medium underline underline-offset-4"
              onClick={() => onSelectMode(notice.mode)}
            >
              Set {scheduleServiceLabel(notice.mode)} hours
            </button>
          ) : (
            <Link
              className="inline-block text-sm font-medium underline underline-offset-4"
              href={
                notice.message.startsWith("Waiting for rescheduling.")
                  ? "/appointments"
                  : `/doctor-schedules/${practiceId}/${notice.mode}`
              }
            >
              {notice.message.startsWith("Waiting for rescheduling.")
                ? "Review affected bookings"
                : `Set ${scheduleServiceLabel(notice.mode)} hours`}
            </Link>
          )}
        </section>
      ))}
    </>
  );
}
