"use client";

import type { ScheduleSectionProps } from "../types/scheduleSection";

import { card } from "../utils/facilityScheduleEditorConstants";

export function ScheduleSection({ title, children }: ScheduleSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-base leading-6 font-semibold">
        {title}
      </h2>
      <div className={card}>{children}</div>
    </section>
  );
}
