import { z } from "zod";
import { uuidSchema } from "./validation";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One named shift: start, length (up to 28 hours), slot length and limits. */
export const shiftTemplateSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,20}$/),
  name: z.string().trim().min(1).max(40),
  start: clock,
  duration_minutes: z.number().int().min(30).max(1680),
  slot_minutes: z.number().int().min(5).max(120),
  fee_minor: z.number().int().min(0).max(100000000),
  /** In-person: app booking slots and walk-ins within the shift's times. */
  app_limit: z.number().int().min(0).max(100).optional(),
  walkin_limit: z.number().int().min(0).max(100).optional(),
  /** Online and home visits: bookings per shift. */
  daily_limit: z.number().int().min(1).max(100).optional(),
});

export type ShiftTemplate = z.infer<typeof shiftTemplateSchema>;

/** A rotation of 1-8 weeks (7 days each, a shift key or null for off). */
export const shiftPlanInputSchema = z.object({
  templates: z.array(shiftTemplateSchema).min(1).max(8),
  cycle_start: isoDate,
  cycle_weeks: z.number().int().min(1).max(8),
  rotation: z.array(z.array(z.string().nullable()).length(7)).min(1).max(8),
  overrides: z
    .array(z.object({ date: isoDate, key: z.string().nullable() }))
    .max(120),
});

export type ShiftPlanInput = z.infer<typeof shiftPlanInputSchema>;

export const shiftPlanSchema = shiftPlanInputSchema.extend({
  id: uuidSchema,
  practice_id: uuidSchema,
  service_mode: z.enum(["clinic", "online", "home"]),
  status: z.enum([
    "pending",
    "active",
    "rejected",
    "withdrawn",
    "superseded",
    "ended",
  ]),
  effective_from: isoDate,
  ended_from: isoDate.nullable(),
  decided_at: z.string().nullable(),
  decision_reason: z.string().nullable(),
  created_at: z.string(),
  row_version: z.string(),
  doctor_name: z.string().nullable().optional(),
  facility_name: z.string().nullable().optional(),
});

export type ShiftPlan = z.infer<typeof shiftPlanSchema>;

export const shiftPlanSubmitResultSchema = z.object({
  status: z.enum(["active", "pending"]),
  shifts_created: z.number().int().optional(),
  plan: shiftPlanSchema,
});

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The shift on a local date (date changes first, then the rotation), or null. */
export function shiftForDay(
  plan: Pick<
    ShiftPlanInput,
    "templates" | "cycle_start" | "cycle_weeks" | "rotation" | "overrides"
  >,
  date: string
): ShiftTemplate | null {
  const override = plan.overrides.find((item) => item.date === date);
  let key: string | null;
  if (override) key = override.key;
  else {
    const days = Math.round(
      (Date.parse(`${date}T12:00:00Z`) -
        Date.parse(`${plan.cycle_start}T12:00:00Z`)) /
        86400000
    );
    const week =
      ((Math.floor(days / 7) % plan.cycle_weeks) + plan.cycle_weeks) %
      plan.cycle_weeks;
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    key = plan.rotation[week]?.[weekday] ?? null;
  }
  return key ? (plan.templates.find((item) => item.key === key) ?? null) : null;
}

/**
 * Upcoming shifts for a preview, in minutes from each day's midnight. A shift
 * that would start before the previous one ends is marked as skipped, as the
 * server skips it.
 */
export function shiftPreview(
  plan: Parameters<typeof shiftForDay>[0],
  from: string,
  days: number
) {
  let previousEnd = -Infinity;
  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(from, offset);
    const shift = shiftForDay(plan, date);
    if (!shift) return { date, shift: null, skipped: false };
    const start =
      offset * 1440 +
      Number(shift.start.slice(0, 2)) * 60 +
      Number(shift.start.slice(3, 5));
    const skipped = start < previousEnd;
    if (!skipped) previousEnd = start + shift.duration_minutes;
    return { date, shift, skipped };
  });
}

export const shiftWeekdayLabels = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

export const maxShiftTemplates = 8;

export const maxRotationWeeks = 8;

type ShiftMode = "clinic" | "online" | "home";

/** Starting shifts for a new rotation: a day and a night shift. */
export function defaultShiftTemplates(mode: ShiftMode): ShiftTemplate[] {
  const slot = mode === "home" ? 60 : 15;
  const limits = (slots: number): Partial<ShiftTemplate> =>
    mode === "clinic"
      ? { app_limit: Math.ceil(slots / 2), walkin_limit: Math.floor(slots / 2) }
      : { daily_limit: Math.min(slots, 100) };
  return [
    {
      key: "day",
      name: "Day shift",
      start: "09:00",
      duration_minutes: 480,
      slot_minutes: slot,
      fee_minor: 0,
      ...limits(480 / slot),
    },
    {
      key: "night",
      name: "Night shift",
      start: "21:00",
      duration_minutes: 600,
      slot_minutes: slot,
      fee_minor: 0,
      ...limits(600 / slot),
    },
  ];
}

/** A new rotation: day shifts in week 1, night shifts in week 2. */
export function defaultShiftPlan(
  mode: ShiftMode,
  start: string
): ShiftPlanInput {
  return {
    templates: defaultShiftTemplates(mode),
    cycle_start: start,
    cycle_weeks: 2,
    rotation: [
      ["day", "day", "day", "day", "day", null, null],
      ["night", "night", "night", "night", "night", null, null],
    ],
    overrides: [],
  };
}

/** "07:00 (+1 day)": when a shift starting at `start` ends. */
export function shiftEndLabel(start: string, minutes: number) {
  const total =
    Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes;
  const days = Math.floor(total / 1440);
  const clockText = `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return days ? `${clockText} (+${days} day${days > 1 ? "s" : ""})` : clockText;
}

/** The first problem with a draft rotation, matching the server's checks. */
export function shiftPlanDraftProblem(plan: ShiftPlanInput, mode: ShiftMode) {
  for (const shift of plan.templates) {
    const slots = Math.floor(shift.duration_minutes / shift.slot_minutes);
    if (!shift.name.trim()) return "Name every shift.";
    if (slots < 1) return `${shift.name} must fit at least one appointment.`;
    if (
      mode === "clinic" &&
      (shift.app_limit ?? 0) + (shift.walkin_limit ?? 0) > Math.min(slots, 100)
    )
      return `${shift.name}: app slots and walk-ins exceed its ${slots} times.`;
    if (mode !== "clinic" && (shift.daily_limit ?? 0) < 1)
      return `${shift.name}: allow at least one booking.`;
  }
  if (!plan.rotation.some((week) => week.some(Boolean)))
    return "Put at least one shift in the rotation.";
  return null;
}
