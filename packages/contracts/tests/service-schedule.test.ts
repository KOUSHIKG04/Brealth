import { expect, test } from "bun:test";
import { doctorScheduleSettingsSchema } from "../src/doctor-schedule";

const base = {
  workingDays: [1, 2],
  onlineWorkingDays: [3],
  homeWorkingDays: [4],
  clinicStart: "09:00",
  clinicEnd: "17:00",
  slotMinutes: 15,
  onlineSlotMinutes: 30,
  homeSlotMinutes: 60,
  onlineDailyLimit: 5,
  walkinDailyLimit: 12,
  autoAccept: true,
  autoAcceptLimit: 1,
  homeVisits: true,
  homeRadiusKm: 5,
  onlineFeeMinor: 30000,
  clinicFeeMinor: 50000,
  homeFeeMinor: 70000,
};

test("service rules retain independent working days and one shared approval limit", () => {
  const result = doctorScheduleSettingsSchema.parse(base);
  expect(result.workingDays).toEqual([1, 2]);
  expect(result.onlineWorkingDays).toEqual([3]);
  expect(result.homeWorkingDays).toEqual([4]);
  expect(result.autoAcceptLimit).toBe(1);
  expect(result.autoAccept).toBe(true);
});

test("invalid service days and approval counts are rejected", () => {
  expect(
    doctorScheduleSettingsSchema.safeParse({
      ...base,
      onlineWorkingDays: [3, 3],
    }).success
  ).toBe(false);
  expect(
    doctorScheduleSettingsSchema.safeParse({ ...base, homeWorkingDays: [] })
      .success
  ).toBe(false);
  expect(
    doctorScheduleSettingsSchema.safeParse({ ...base, autoAcceptLimit: -1 })
      .success
  ).toBe(false);
});
