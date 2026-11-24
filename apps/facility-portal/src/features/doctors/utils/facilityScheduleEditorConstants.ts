import type { DoctorScheduleSettings } from "@startup/contracts";

export const initialSettings: DoctorScheduleSettings = {
  workingDays: [1, 2, 3, 4, 5],
  onlineWorkingDays: [1, 2, 3, 4, 5],
  homeWorkingDays: [1, 2, 3, 4, 5],
  clinicStart: "09:00",
  clinicEnd: "17:00",
  onlineStart: "13:00",
  onlineEnd: "15:00",
  homeStart: "16:00",
  homeEnd: "17:00",
  slotMinutes: 15,
  onlineSlotMinutes: 15,
  homeSlotMinutes: 60,
  onlineDailyLimit: 8,
  walkinDailyLimit: 12,
  clinicAppDailyLimit: 12,
  clinicWalkinDailyLimit: 0,
  autoAccept: false,
  autoAcceptLimit: 0,
  homeVisits: false,
  homeRadiusKm: null,
  onlineFeeMinor: 0,
  clinicFeeMinor: 0,
  homeFeeMinor: 0,
};

export const card =
  "space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5";

export const unavailableServiceOptions = [
  ["all", "All"],
  ["online", "Online"],
  ["clinic", "Clinic"],
  ["home", "Home"],
] as const;
