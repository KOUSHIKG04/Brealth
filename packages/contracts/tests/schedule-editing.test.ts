import { expect, test } from "bun:test";
import {
  preferencesToScheduleSettings,
  rebaseScheduleSettings,
  scheduleBatchingHints,
  scheduleBusyOverlaps,
  scheduleChangePreviewSchema,
  scheduleErrorMessage,
  scheduleSettingNames,
  type DoctorSchedulePreferences,
  type DoctorScheduleSettings,
  type ScheduleBusyBlock,
} from "../src/doctor-schedule";

const saved: DoctorSchedulePreferences = {
  practice_id: "6f1c1f4e-2f0b-4b8e-9a43-7f7b8f0d2a11",
  row_version: "4",
  working_days: [1, 2, 3],
  clinic_start: "09:00:00",
  clinic_end: "17:00:00",
  slot_minutes: 15,
  online_slot_minutes: 20,
  home_slot_minutes: 60,
  online_daily_limit: 6,
  walkin_daily_limit: 20,
  auto_accept: true,
  auto_accept_limit: 5,
  home_visits: false,
  home_radius_km: null,
  online_fee_minor: null,
  clinic_fee_minor: 50000,
  home_fee_minor: null,
};

const base: DoctorScheduleSettings = preferencesToScheduleSettings(saved);

test("saved preferences map to complete editable settings with defaults", () => {
  expect(base.clinicStart).toBe("09:00");
  expect(base.clinicTimeBlocks).toEqual([{ start: "09:00", end: "17:00" }]);
  expect(base.onlineWorkingDays).toEqual([1, 2, 3]);
  expect(base.onlineTimeBlocks).toEqual([{ start: "13:00", end: "15:00" }]);
  expect(base.clinicAppDailyLimit).toBe(20);
  expect(base.clinicWalkinDailyLimit).toBe(0);
  expect(base.onlineFeeMinor).toBe(0);
});

test("edits to different fields merge without conflicts", () => {
  const mine = {
    ...base,
    clinicTimeBlocks: [{ start: "10:00", end: "14:00" }],
  };
  const theirs = { ...base, onlineFeeMinor: 30000 };
  const { settings, conflicts } = rebaseScheduleSettings(base, mine, theirs);
  expect(conflicts).toEqual([]);
  expect(settings.clinicTimeBlocks).toEqual([{ start: "10:00", end: "14:00" }]);
  expect(settings.onlineFeeMinor).toBe(30000);
});

test("identical edits on both sides are not conflicts", () => {
  const mine = { ...base, walkinDailyLimit: 25 };
  const { conflicts } = rebaseScheduleSettings(base, mine, { ...mine });
  expect(conflicts).toEqual([]);
});

test("different edits to the same field keep the editor's value and report it", () => {
  const mine = { ...base, walkinDailyLimit: 25 };
  const theirs = { ...base, walkinDailyLimit: 30, clinicFeeMinor: 60000 };
  const { settings, conflicts } = rebaseScheduleSettings(base, mine, theirs);
  expect(conflicts).toEqual(["walkinDailyLimit"]);
  expect(settings.walkinDailyLimit).toBe(25);
  expect(settings.clinicFeeMinor).toBe(60000);
  expect(scheduleSettingNames(conflicts)).toEqual(["clinic daily limit"]);
});

test("day and block order alone is not treated as an edit", () => {
  const mine = { ...base, workingDays: [3, 1, 2] };
  const theirs = { ...base, workingDays: [1, 2, 4] };
  const { settings, conflicts } = rebaseScheduleSettings(base, mine, theirs);
  expect(conflicts).toEqual([]);
  expect(settings.workingDays).toEqual([1, 2, 4]);
});

const busy: ScheduleBusyBlock[] = [
  {
    rule_id: "0b6f3d2e-6a4f-4d1f-8f0e-1f2a3b4c5d6e",
    practice_id: "9b0e2c1d-3f4a-4b5c-8d6e-7f8091a2b3c4",
    facility_name: "City Clinic",
    mode: "online",
    days: [2, 4],
    start: "13:00",
    end: "15:00",
    travel_buffer_minutes: 0,
    effective_from: "2026-11-20",
    effective_until: null,
  },
  {
    rule_id: "1c7a4e3f-7b5a-4e2a-9a1f-2a3b4c5d6e7f",
    practice_id: "9b0e2c1d-3f4a-4b5c-8d6e-7f8091a2b3c4",
    facility_name: "City Clinic",
    mode: "home",
    days: [1],
    start: "16:00",
    end: "17:00",
    travel_buffer_minutes: 30,
    effective_from: "2026-11-20",
    effective_until: null,
  },
];

test("busy overlaps need a shared weekday and an overlapping time", () => {
  expect(
    scheduleBusyOverlaps(busy, [2], [{ start: "14:00", end: "16:00" }])
  ).toHaveLength(1);
  // Same time, no shared weekday.
  expect(
    scheduleBusyOverlaps(busy, [3], [{ start: "14:00", end: "16:00" }])
  ).toHaveLength(0);
  // Touching end-to-start is not an overlap.
  expect(
    scheduleBusyOverlaps(busy, [2], [{ start: "15:00", end: "16:00" }])
  ).toHaveLength(0);
});

test("busy overlaps include travel buffers on both sides", () => {
  // Busy home block 16:00–17:00 with 30 min buffer reaches back to 15:30.
  expect(
    scheduleBusyOverlaps(busy, [1], [{ start: "14:00", end: "15:45" }])
  ).toHaveLength(1);
  expect(
    scheduleBusyOverlaps(busy, [1], [{ start: "14:00", end: "15:15" }], 0)
  ).toHaveLength(0);
  // The draft's own 20 min buffer closes the remaining gap.
  expect(
    scheduleBusyOverlaps(busy, [1], [{ start: "14:00", end: "15:15" }], 20)
  ).toHaveLength(1);
});

const clinicBlock = (
  start: string,
  end: string,
  days = [1]
): ScheduleBusyBlock => ({
  rule_id: "5d1b2c3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  practice_id: "9b0e2c1d-3f4a-4b5c-8d6e-7f8091a2b3c4",
  facility_name: "City Hospital",
  mode: "clinic",
  days,
  start,
  end,
  travel_buffer_minutes: 0,
  effective_from: "2026-11-20",
  effective_until: null,
});

test("batching hints flag online hours between clinic blocks", () => {
  const clinic = [clinicBlock("09:00", "11:00"), clinicBlock("12:00", "14:00")];
  const hints = scheduleBatchingHints(
    "online",
    [1],
    [{ start: "11:00", end: "12:00" }],
    clinic
  );
  expect(hints).toHaveLength(1);
  expect(hints[0]).toContain("between clinic hours");
  // Before or after clinic, or on another day, is fine.
  expect(
    scheduleBatchingHints(
      "online",
      [1],
      [{ start: "14:00", end: "16:00" }],
      clinic
    )
  ).toEqual([]);
  expect(
    scheduleBatchingHints(
      "online",
      [2],
      [{ start: "11:00", end: "12:00" }],
      clinic
    )
  ).toEqual([]);
});

test("batching hints check the published online side when editing clinic", () => {
  const online = { ...clinicBlock("11:00", "12:00"), mode: "online" as const };
  expect(
    scheduleBatchingHints(
      "clinic",
      [1],
      [
        { start: "09:00", end: "11:00" },
        { start: "12:00", end: "14:00" },
      ],
      [online]
    )[0]
  ).toContain("Online 11:00–12:00");
  expect(
    scheduleBatchingHints(
      "home",
      [1],
      [{ start: "11:00", end: "12:00" }],
      [online]
    )
  ).toEqual([]);
});

test("batching hints suggest online blocks of at least an hour", () => {
  const hints = scheduleBatchingHints(
    "online",
    [1],
    [{ start: "18:00", end: "18:30" }],
    []
  );
  expect(hints).toHaveLength(1);
  expect(hints[0]).toContain("under an hour");
  expect(
    scheduleBatchingHints("online", [1], [{ start: "18:00", end: "19:00" }], [])
  ).toEqual([]);
});

test("schedule errors map to safe, specific copy", () => {
  expect(scheduleErrorMessage({ code: "PT409" }, "x")).toContain(
    "Your edits are kept"
  );
  expect(scheduleErrorMessage({ code: "PT410" }, "x")).toContain("overlaps");
  expect(
    scheduleErrorMessage(
      Object.assign(new Error("Set a consultation fee first"), {
        code: "22023",
      }),
      "x"
    )
  ).toBe("Set a consultation fee first");
  expect(
    scheduleErrorMessage(
      Object.assign(new Error("relation does not exist"), { code: "42P01" }),
      "Try again."
    )
  ).toBe("Try again.");
  expect(scheduleErrorMessage(new TypeError("Failed to fetch"), "x")).toContain(
    "connection"
  );
});

test("previews accept an optional suggested start date", () => {
  const preview = scheduleChangePreviewSchema.parse({
    token: "a".repeat(32),
    effective_from: "2026-11-13",
    conflicts: [],
    can_replace: true,
    suggested_effective_from: "2026-11-21",
  });
  expect(preview.suggested_effective_from).toBe("2026-11-21");
  expect(
    scheduleChangePreviewSchema.parse({
      ...preview,
      suggested_effective_from: undefined,
    }).suggested_effective_from
  ).toBeUndefined();
});
