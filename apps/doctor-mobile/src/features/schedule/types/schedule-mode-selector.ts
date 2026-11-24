import type { ScheduleMode, ServiceStatus } from "./schedule-overview";

/** Each service's status and published hours, shown under the selector. */
export type ScheduleServiceOverview = Record<
  ScheduleMode,
  { status: ServiceStatus; summary: string | null }
>;

export type ScheduleModeSelectorProps = {
  /** Open services, in the order they were chosen. */
  modes: ScheduleMode[];
  services?: ScheduleServiceOverview;
  onToggle: (mode: ScheduleMode) => void;
};
