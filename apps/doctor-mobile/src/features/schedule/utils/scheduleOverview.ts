import {
  formatDisplayDate,
  preferencesToScheduleSettings,
  type DoctorSchedulePreferences,
  type ScheduleChangeRequest,
} from "@startup/contracts";
import type { Schedule } from "../../../types/doctor";
import type { ServiceStatus } from "../types/schedule-overview";
import { draftChangeLabels } from "./scheduleConstants";
import { workingDayLabels } from "./workingDaysPanelConstants";
import { draftFromSettings, endMinutes, formatTime, minutes } from "./schedule";

type Mode = "clinic" | "online" | "home";

/** Where one service stands: live, waiting for something, or not set up. */
export function serviceStatus(
  saved: DoctorSchedulePreferences | null | undefined,
  mode: Mode,
  {
    pendingRequest,
    verified,
    today,
  }: {
    pendingRequest?: ScheduleChangeRequest;
    verified: boolean;
    today: string;
  }
): ServiceStatus {
  if (pendingRequest) return { tone: "waiting", label: "Awaiting approval" };
  const published = saved?.published_modes?.includes(mode) ?? false;
  if (published && mode === "home" && !saved?.home_visits)
    return { tone: "off", label: "Not accepting visits" };
  if (published) {
    const from = saved?.published_from?.[mode];
    return from && from > today
      ? { tone: "waiting", label: `Starts ${formatDisplayDate(from)}` }
      : { tone: "live", label: "Published" };
  }
  if (!verified) return { tone: "waiting", label: "Awaiting verification" };
  return { tone: "off", label: "Not published" };
}

function shortTime(value: number) {
  return formatTime(value).replace(/^0/, "");
}

/** "Mon–Sat", "Mon, Wed, Fri" or "Every day" from ISO weekdays (1 = Monday). */
export function workingDaysSummary(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  const short = (day: number) => workingDayLabels[day - 1]?.slice(0, 3) ?? "";
  const contiguous = sorted.every(
    (day, index) => index === 0 || day === sorted[index - 1] + 1
  );
  if (contiguous && sorted.length >= 3)
    return `${short(sorted[0])}–${short(sorted[sorted.length - 1])}`;
  return sorted.map(short).join(", ");
}

/** One line with the service's days, hours and appointment length. */
export function serviceSummary(saved: DoctorSchedulePreferences, mode: Mode) {
  return draftSummary(
    draftFromSettings(preferencesToScheduleSettings(saved), mode),
    mode
  );
}

/** The same line for an editor draft. */
export function draftSummary(draft: Schedule, mode: Mode) {
  const duration =
    mode === "online"
      ? draft.onlineDuration
      : mode === "home"
        ? draft.homeDuration
        : draft.duration;
  const hours = (draft.timeBlocks ?? [{ start: draft.start, end: draft.end }])
    .map(
      (block) =>
        `${shortTime(minutes(block.start))}–${shortTime(endMinutes(block.end))}`
    )
    .join(", ");
  return [
    workingDaysSummary(draft.days.map((day) => day + 1)),
    hours,
    `${duration} min`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function sameValue(left: unknown, right: unknown) {
  const normal = (value: unknown) =>
    Array.isArray(value)
      ? JSON.stringify(value.map((item) => JSON.stringify(item)).sort())
      : JSON.stringify(value ?? null);
  return normal(left) === normal(right);
}

/** Readable names of what the doctor changed since the saved copy. */
export function draftChanges(base: Schedule, draft: Schedule) {
  const keys = Object.keys(draftChangeLabels) as Array<
    keyof typeof draftChangeLabels
  >;
  const changed = keys.filter((key) => {
    // The limit means nothing while auto-accept stays off.
    if (key === "autoLimit" && !base.autoAccept && !draft.autoAccept)
      return false;
    return !sameValue(base[key], draft[key]);
  });
  return [...new Set(changed.map((key) => draftChangeLabels[key]))];
}
