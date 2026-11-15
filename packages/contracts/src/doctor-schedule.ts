import { z } from "zod";
import { userErrorMessage } from "./errors";

export const doctorTimeBlockSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/),
  })
  .strict()
  .refine((block) => block.end > block.start, {
    message: "Each time block must end after it starts.",
  });

export type DoctorTimeBlock = z.infer<typeof doctorTimeBlockSchema>;

export const scheduleServiceSchema = z.enum(["clinic", "online", "home"]);

export const scheduleRemainingBlockSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)),
  start: z.string(),
  end: z.string(),
});

export const scheduleAdjustmentSchema = z.object({
  mode: scheduleServiceSchema,
  effective_from: z.iso.date(),
  message: z.string(),
});

export const scheduleConflictSchema = z.object({
  rule_id: z.uuid(),
  practice_id: z.uuid(),
  facility_name: z.string(),
  mode: scheduleServiceSchema,
  days: z.array(z.number().int()),
  start: z.string(),
  end: z.string(),
  travel_buffer_minutes: z.number().int(),
  effective_from: z.iso.date(),
  effective_until: z.iso.date().nullable(),
  remaining: z.array(scheduleRemainingBlockSchema),
  booked_count: z.number().int().nonnegative(),
  replaceable: z.boolean(),
  reason: z.string().nullable(),
  can_request: z.boolean().optional(),
  paused_remaining: z.array(scheduleRemainingBlockSchema).optional(),
  bookings: z
    .array(
      z.object({
        id: z.uuid(),
        booking_code: z.string(),
        patient_name: z.string(),
        starts_at: z.string(),
        ends_at: z.string(),
        timezone: z.string(),
        status: z.string(),
        payment_hold: z.boolean(),
        row_version: z.string(),
      })
    )
    .optional(),
});

export const scheduleChangePreviewSchema = z.object({
  token: z.string(),
  effective_from: z.iso.date(),
  conflicts: z.array(scheduleConflictSchema),
  can_replace: z.boolean(),
  can_request: z.boolean().optional(),
  // First start date with no booked or started sessions in the conflicts.
  suggested_effective_from: z.iso.date().optional(),
});

export const scheduleBusyBlockSchema = z.object({
  rule_id: z.uuid(),
  practice_id: z.uuid(),
  facility_name: z.string(),
  mode: scheduleServiceSchema,
  days: z.array(z.number().int().min(1).max(7)),
  start: z.string(),
  end: z.string(),
  travel_buffer_minutes: z.number().int().nonnegative(),
  effective_from: z.iso.date(),
  effective_until: z.iso.date().nullable(),
});

export type ScheduleBusyBlock = z.infer<typeof scheduleBusyBlockSchema>;

export const scheduleConflictDecisionSchema = z
  .object({
    strategy: z.enum(["trim", "pause"]),
    patientReason: z.string().trim().max(1000).default(""),
  })
  .strict();

export type ScheduleConflictDecision = z.infer<
  typeof scheduleConflictDecisionSchema
>;

export type ScheduleChangePreview = z.infer<typeof scheduleChangePreviewSchema>;

export type ScheduleAdjustment = z.infer<typeof scheduleAdjustmentSchema>;

export const scheduleAdjustmentNoticeSchema = scheduleAdjustmentSchema.extend({
  practice_id: z.uuid(),
  facility_name: z.string(),
});

export type ScheduleAdjustmentNotice = z.infer<
  typeof scheduleAdjustmentNoticeSchema
>;

export function scheduleServiceLabel(mode: "clinic" | "online" | "home") {
  return { clinic: "Clinic", online: "Online", home: "Home visit" }[mode];
}

export function scheduleBlockSummary(
  block: z.infer<typeof scheduleRemainingBlockSchema>
) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `${block.days.map((day) => names[day - 1]).join(", ")}: ${block.start}–${block.end}`;
}

export function scheduleBlocksError(
  blocks: DoctorTimeBlock[],
  duration: number,
  buffer = 0
): string | undefined {
  const minutes = (clock: string) =>
    Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  if (!blocks.length || blocks.length > 8)
    return "Add between 1 and 8 time blocks.";
  const ordered = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 0; index < ordered.length; index++) {
    const block = ordered[index];
    if (
      !doctorTimeBlockSchema.safeParse(block).success ||
      minutes(block.end) - minutes(block.start) < duration
    )
      return "Each time block must fit at least one appointment.";
    if (minutes(block.start) - buffer < 0 || minutes(block.end) + buffer > 1440)
      return "Travel buffers must fit within the same day.";
    if (
      index &&
      minutes(ordered[index - 1].end) + buffer > minutes(block.start) - buffer
    )
      return "Time blocks and travel buffers cannot overlap.";
  }
}

export const doctorScheduleSettingsSchema = z
  .object({
    workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    onlineWorkingDays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .optional(),
    homeWorkingDays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .optional(),
    // Legacy per-mode approval fields: retained for older clients; booking uses autoAccept/autoAcceptLimit.
    onlineAutoAccept: z.boolean().optional(),
    homeAutoAccept: z.boolean().optional(),
    onlineAutoAcceptLimit: z.number().int().min(0).max(100).optional(),
    homeAutoAcceptLimit: z.number().int().min(0).max(100).optional(),
    clinicStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    clinicEnd: z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/),
    onlineStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    onlineEnd: z
      .string()
      .regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/)
      .optional(),
    homeStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    homeEnd: z
      .string()
      .regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/)
      .optional(),
    clinicTimeBlocks: z.array(doctorTimeBlockSchema).min(1).max(8).optional(),
    onlineTimeBlocks: z.array(doctorTimeBlockSchema).min(1).max(8).optional(),
    homeTimeBlocks: z.array(doctorTimeBlockSchema).min(1).max(8).optional(),
    homeTravelBufferMinutes: z.number().int().min(0).max(180).optional(),
    slotMinutes: z.number().int().min(5).max(120),
    onlineSlotMinutes: z.number().int().min(5).max(120),
    homeSlotMinutes: z.number().int().min(30).max(120),
    onlineDailyLimit: z.number().int().min(0).max(100),
    walkinDailyLimit: z.number().int().min(0).max(100),
    clinicAppDailyLimit: z.number().int().min(0).max(100).optional(),
    clinicWalkinDailyLimit: z.number().int().min(0).max(100).optional(),
    autoAccept: z.boolean(),
    autoAcceptLimit: z.number().int().min(0).max(100),
    homeVisits: z.boolean(),
    homeRadiusKm: z.number().positive().max(9999.99).nullable(),
    onlineFeeMinor: z.number().int().min(0).max(100000000).nullable(),
    clinicFeeMinor: z.number().int().min(0).max(100000000),
    homeFeeMinor: z.number().int().min(0).max(100000000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [key, duration, buffer] of [
      ["clinicTimeBlocks", value.slotMinutes, 0],
      ["onlineTimeBlocks", value.onlineSlotMinutes, 0],
      [
        "homeTimeBlocks",
        value.homeSlotMinutes,
        value.homeTravelBufferMinutes ?? 0,
      ],
    ] as const) {
      if (value[key]) {
        const message = scheduleBlocksError(value[key], duration, buffer);
        if (message) context.addIssue({ code: "custom", path: [key], message });
      }
    }
  })
  .refine(
    (value) =>
      value.clinicEnd > value.clinicStart &&
      (!value.onlineStart ||
        !value.onlineEnd ||
        value.onlineEnd > value.onlineStart) &&
      (!value.homeStart || !value.homeEnd || value.homeEnd > value.homeStart) &&
      new Set(value.workingDays).size === value.workingDays.length &&
      [value.onlineWorkingDays, value.homeWorkingDays].every(
        (days) => !days || new Set(days).size === days.length
      ) &&
      (!value.homeVisits || value.homeRadiusKm !== null),
    { message: "Check working days and clinic hours" }
  )
  .refine(
    (value) =>
      (value.clinicAppDailyLimit ?? value.walkinDailyLimit) +
        (value.clinicWalkinDailyLimit ?? 0) <=
      value.walkinDailyLimit,
    {
      message: "App and walk-in quotas must fit within total clinic capacity.",
      path: ["walkinDailyLimit"],
    }
  );

export const doctorSchedulePreferencesSchema = z.object({
  schedule_adjustments: z.array(scheduleAdjustmentSchema).optional(),
  online_grace_minutes: z.number().int().optional(),
  clinic_grace_minutes: z.number().int().optional(),
  reschedule_cutoff_minutes: z.number().int().optional(),
  max_self_reschedules: z.number().int().optional(),
  practice_id: z.uuid(),
  working_days: z.array(z.number().int()),
  online_working_days: z.array(z.number().int()).optional(),
  home_working_days: z.array(z.number().int()).optional(),
  online_auto_accept: z.boolean().optional(),
  home_auto_accept: z.boolean().optional(),
  online_auto_accept_limit: z.number().int().optional(),
  home_auto_accept_limit: z.number().int().optional(),
  clinic_start: z.string(),
  clinic_end: z.string(),
  online_start: z.string().optional(),
  online_end: z.string().optional(),
  home_start: z.string().optional(),
  home_end: z.string().optional(),
  clinic_time_blocks: z.array(doctorTimeBlockSchema).optional(),
  online_time_blocks: z.array(doctorTimeBlockSchema).optional(),
  home_time_blocks: z.array(doctorTimeBlockSchema).optional(),
  home_travel_buffer_minutes: z.number().int().optional(),
  published_modes: z.array(z.enum(["clinic", "online", "home"])).optional(),
  published_from: z.record(z.string(), z.iso.date()).optional(),
  slot_minutes: z.number().int(),
  online_slot_minutes: z.number().int(),
  home_slot_minutes: z.number().int(),
  online_daily_limit: z.number().int(),
  walkin_daily_limit: z.number().int(),
  clinic_app_daily_limit: z.number().int().optional(),
  clinic_walkin_daily_limit: z.number().int().optional(),
  auto_accept: z.boolean(),
  auto_accept_limit: z.number().int(),
  home_visits: z.boolean(),
  home_radius_km: z.number().positive().nullable(),
  online_fee_minor: z.number().nullable(),
  clinic_fee_minor: z.number(),
  home_fee_minor: z.number().nullable(),
  row_version: z.string(),
});

export type DoctorScheduleSettings = z.input<
  typeof doctorScheduleSettingsSchema
>;

export const doctorDailySlotUsageSchema = z.object({
  clinic: z.number().int().nonnegative(),
  online: z.number().int().nonnegative(),
  home: z.number().int().nonnegative(),
});

export type DoctorSchedulePreferences = z.infer<
  typeof doctorSchedulePreferencesSchema
>;

export const doctorSchedulePublicationSchema = z.object({
  settings: doctorSchedulePreferencesSchema,
  slot_count: z.number().int().nonnegative(),
  horizon_days: z.number().int().positive(),
});

type ScheduleSettingKey = keyof DoctorScheduleSettings;

/** Converts a saved preference projection into editable schedule settings. */
export function preferencesToScheduleSettings(
  saved: DoctorSchedulePreferences
): DoctorScheduleSettings {
  return {
    clinicTimeBlocks: saved.clinic_time_blocks ?? [
      {
        start: saved.clinic_start.slice(0, 5),
        end: saved.clinic_end.slice(0, 5),
      },
    ],
    onlineTimeBlocks: saved.online_time_blocks ?? [
      {
        start: saved.online_start?.slice(0, 5) ?? "13:00",
        end: saved.online_end?.slice(0, 5) ?? "15:00",
      },
    ],
    homeTimeBlocks: saved.home_time_blocks ?? [
      {
        start: saved.home_start?.slice(0, 5) ?? "16:00",
        end: saved.home_end?.slice(0, 5) ?? "17:00",
      },
    ],
    homeTravelBufferMinutes: saved.home_travel_buffer_minutes ?? 0,
    workingDays: saved.working_days,
    onlineWorkingDays: saved.online_working_days ?? saved.working_days,
    homeWorkingDays: saved.home_working_days ?? saved.working_days,
    clinicStart: saved.clinic_start.slice(0, 5),
    clinicEnd: saved.clinic_end.slice(0, 5),
    onlineStart: saved.online_start?.slice(0, 5) ?? "13:00",
    onlineEnd: saved.online_end?.slice(0, 5) ?? "15:00",
    homeStart: saved.home_start?.slice(0, 5) ?? "16:00",
    homeEnd: saved.home_end?.slice(0, 5) ?? "17:00",
    slotMinutes: saved.slot_minutes,
    onlineSlotMinutes: saved.online_slot_minutes,
    homeSlotMinutes: saved.home_slot_minutes,
    onlineDailyLimit: saved.online_daily_limit,
    walkinDailyLimit: saved.walkin_daily_limit,
    clinicAppDailyLimit:
      saved.clinic_app_daily_limit ?? saved.walkin_daily_limit,
    clinicWalkinDailyLimit: saved.clinic_walkin_daily_limit ?? 0,
    autoAccept: saved.auto_accept,
    autoAcceptLimit: saved.auto_accept_limit,
    homeVisits: saved.home_visits,
    homeRadiusKm: saved.home_radius_km,
    onlineFeeMinor: saved.online_fee_minor ?? 0,
    clinicFeeMinor: saved.clinic_fee_minor,
    homeFeeMinor: saved.home_fee_minor ?? 0,
  };
}

const scheduleSettingLabels: Partial<Record<ScheduleSettingKey, string>> = {
  workingDays: "clinic working days",
  onlineWorkingDays: "online working days",
  homeWorkingDays: "home-visit working days",
  clinicStart: "clinic hours",
  clinicEnd: "clinic hours",
  onlineStart: "online hours",
  onlineEnd: "online hours",
  homeStart: "home-visit hours",
  homeEnd: "home-visit hours",
  clinicTimeBlocks: "clinic hours",
  onlineTimeBlocks: "online hours",
  homeTimeBlocks: "home-visit hours",
  homeTravelBufferMinutes: "travel buffer",
  slotMinutes: "clinic consultation duration",
  onlineSlotMinutes: "online consultation duration",
  homeSlotMinutes: "home-visit duration",
  onlineDailyLimit: "online daily limit",
  walkinDailyLimit: "clinic daily limit",
  clinicAppDailyLimit: "clinic app bookings",
  clinicWalkinDailyLimit: "clinic walk-ins",
  autoAccept: "automatic booking",
  autoAcceptLimit: "automatic booking limit",
  homeVisits: "home visits",
  homeRadiusKm: "home-visit radius",
  onlineFeeMinor: "online fee",
  clinicFeeMinor: "clinic fee",
  homeFeeMinor: "home-visit fee",
};

/** Readable, de-duplicated names for settings, e.g. for merge conflicts. */
export function scheduleSettingNames(keys: readonly ScheduleSettingKey[]) {
  return [...new Set(keys.map((key) => scheduleSettingLabels[key] ?? key))];
}

function normalizedSetting(value: unknown): string {
  if (Array.isArray(value)) {
    // Day and block order carries no meaning; [3, 1] equals [1, 3].
    return JSON.stringify(
      value
        .map((item) => JSON.stringify(item))
        .sort((a, b) => a.localeCompare(b))
    );
  }
  return JSON.stringify(value ?? null);
}

function sameSetting(left: unknown, right: unknown) {
  return normalizedSetting(left) === normalizedSetting(right);
}

/**
 * Three-way merge of schedule settings. `base` is the saved copy the editor
 * started from, `mine` is the editor's result and `theirs` the latest saved
 * copy. Fields only one side changed merge silently; fields both sides changed
 * differently keep the editor's value and are reported as conflicts.
 */
export function rebaseScheduleSettings(
  base: DoctorScheduleSettings,
  mine: DoctorScheduleSettings,
  theirs: DoctorScheduleSettings
): { settings: DoctorScheduleSettings; conflicts: ScheduleSettingKey[] } {
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(mine),
    ...Object.keys(theirs),
  ] as ScheduleSettingKey[]);
  const merged: Record<string, unknown> = {};
  const conflicts: ScheduleSettingKey[] = [];
  for (const key of keys) {
    const mineValue = mine[key];
    const theirValue = theirs[key];
    let value: unknown;
    if (sameSetting(mineValue, base[key])) value = theirValue;
    else if (
      sameSetting(theirValue, base[key]) ||
      sameSetting(theirValue, mineValue)
    )
      value = mineValue;
    else {
      value = mineValue;
      conflicts.push(key);
    }
    if (value !== undefined) merged[key] = value;
  }
  return { settings: merged as DoctorScheduleSettings, conflicts };
}

function clockMinutes(clock: string) {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}

/**
 * Busy blocks that share a weekday with the draft and overlap one of its time
 * blocks, including both travel buffers. Mirrors the preview's overlap test.
 */
export function scheduleBusyOverlaps(
  busy: readonly ScheduleBusyBlock[],
  days: readonly number[],
  blocks: readonly DoctorTimeBlock[],
  bufferMinutes = 0
): ScheduleBusyBlock[] {
  return busy.filter(
    (item) =>
      item.days.some((day) => days.includes(day)) &&
      blocks.some(
        (block) =>
          clockMinutes(item.start) - item.travel_buffer_minutes <
            clockMinutes(block.end) + bufferMinutes &&
          clockMinutes(item.end) + item.travel_buffer_minutes >
            clockMinutes(block.start) - bufferMinutes
      )
  );
}

/** Shortest online block that research-backed batching guidance suggests. */
export const onlineBatchMinimumMinutes = 60;

/**
 * Advisory hints for keeping online consultations on time: online hours
 * placed between two clinic blocks on the same day, or online blocks shorter
 * than an hour. Compares the draft for `mode` with the doctor's published
 * blocks of the other service at any practice. Never blocks publishing.
 */
export function scheduleBatchingHints(
  mode: "clinic" | "online" | "home",
  days: readonly number[],
  blocks: readonly DoctorTimeBlock[],
  busy: readonly ScheduleBusyBlock[]
): string[] {
  if (mode === "home") return [];
  const draft = blocks.map((block) => ({ ...block, days: [...days] }));
  const others = busy.filter(
    (item) => item.mode === (mode === "online" ? "clinic" : "online")
  );
  const online = mode === "online" ? draft : others;
  const clinic = mode === "online" ? others : draft;
  const hints: string[] = [];
  const between = online.find((block) =>
    block.days.some((day) => {
      const sameDay = clinic.filter((item) => item.days.includes(day));
      return (
        sameDay.some(
          (item) => clockMinutes(item.end) <= clockMinutes(block.start)
        ) &&
        sameDay.some(
          (item) => clockMinutes(item.start) >= clockMinutes(block.end)
        )
      );
    })
  );
  if (between)
    hints.push(
      `Online ${between.start}–${between.end} falls between clinic hours. Online patients are seen on time more often when online hours come before or after clinic.`
    );
  if (mode === "online") {
    const short = draft.find(
      (block) =>
        clockMinutes(block.end) - clockMinutes(block.start) <
        onlineBatchMinimumMinutes
    );
    if (short)
      hints.push(
        `Online ${short.start}–${short.end} is under an hour. Blocks of at least an hour are easier to keep on time.`
      );
  }
  return hints;
}

export function scheduleErrorCode(cause: unknown) {
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { code: unknown }).code)
    : undefined;
}

/** Stable SQLSTATE codes raised by the schedule RPCs. */
export const scheduleErrorCodes = {
  changedElsewhere: "PT409",
  newConflict: "PT410",
} as const;

/** Safe, readable copy for schedule save/publish failures. */
export function scheduleErrorMessage(cause: unknown, fallback: string) {
  const code = scheduleErrorCode(cause);
  if (code === scheduleErrorCodes.changedElsewhere)
    return "This schedule changed in another app. Your edits are kept; review them and publish again.";
  if (code === scheduleErrorCodes.newConflict)
    return "Another schedule now overlaps these hours. Review the conflicts and choose how to continue.";
  if (code === "42501")
    return "You no longer have permission to change this practice's schedule.";
  return userErrorMessage(cause, fallback);
}

/** What a doctor asks a facility to approve. */
export const scheduleChangeRequestKindSchema = z.enum([
  "schedule",
  "time_off_add",
  "time_off_remove",
  "recovery_policy",
]);

export const scheduleChangeRequestSchema = z.object({
  id: z.uuid(),
  practice_id: z.uuid(),
  facility_id: z.uuid(),
  facility_name: z.string(),
  facility_kind: z.enum(["hospital", "clinic"]),
  doctor_name: z.string(),
  kind: scheduleChangeRequestKindSchema,
  service_mode: scheduleServiceSchema.nullable(),
  payload: z.record(z.string(), z.unknown()),
  effective_from: z.iso.date().nullable(),
  base_version: z.string().nullable(),
  current_version: z.string().nullable(),
  current_settings: z.record(z.string(), z.unknown()).nullable().optional(),
  note: z.string().nullable(),
  status: z.enum([
    "pending",
    "approved",
    "rejected",
    "withdrawn",
    "superseded",
    "stale",
  ]),
  decision_reason: z.string().nullable(),
  created_at: z.string(),
  decided_at: z.string().nullable(),
});

export type ScheduleChangeRequest = z.infer<typeof scheduleChangeRequestSchema>;

export type ScheduleChangeRequestKind = z.infer<
  typeof scheduleChangeRequestKindSchema
>;

/** Short, readable title for a request in lists and notices. */
export function scheduleChangeRequestTitle(
  request: Pick<ScheduleChangeRequest, "kind" | "service_mode">
) {
  if (request.kind === "schedule")
    return `${scheduleServiceLabel(request.service_mode ?? "clinic")} schedule`;
  if (request.kind === "time_off_add") return "Time off";
  if (request.kind === "time_off_remove") return "Remove time off";
  return "Attendance and rescheduling policy";
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The settings of one service as readable rows (days, hours, duration, limit,
 * fee), for comparing a request with the current schedule. Accepts the wire
 * (snake_case) settings used by requests and saved preferences.
 */
export function scheduleServiceSummary(
  settings: Record<string, unknown> | null | undefined,
  mode: "clinic" | "online" | "home"
): { label: string; value: string }[] {
  if (!settings) return [];
  const read = (key: string) => settings[key];
  const days = (read(
    mode === "clinic"
      ? "working_days"
      : mode === "online"
        ? "online_working_days"
        : "home_working_days"
  ) ?? read("working_days")) as number[] | undefined;
  const blocks = read(`${mode}_time_blocks`) as
    { start: string; end: string }[] | undefined;
  const duration = read(
    mode === "clinic" ? "slot_minutes" : `${mode}_slot_minutes`
  );
  const limit = read(
    mode === "online"
      ? "online_daily_limit"
      : mode === "home"
        ? "home_visits"
        : "walkin_daily_limit"
  );
  const fee = read(`${mode}_fee_minor`);
  return [
    {
      label: "Days",
      value: days?.length
        ? days.map((day) => dayNames[day - 1] ?? day).join(", ")
        : "—",
    },
    {
      label: "Hours",
      value: blocks?.length
        ? blocks.map((block) => `${block.start}–${block.end}`).join(", ")
        : "—",
    },
    {
      label: "Duration",
      value: typeof duration === "number" ? `${duration} min` : "—",
    },
    {
      label: mode === "home" ? "Home visits" : "Daily limit",
      value:
        mode === "home"
          ? limit === true
            ? "On"
            : "Off"
          : typeof limit === "number"
            ? String(limit)
            : "—",
    },
    {
      label: "Fee",
      value: typeof fee === "number" ? `₹${(fee / 100).toFixed(2)}` : "—",
    },
  ];
}
