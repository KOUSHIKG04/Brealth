export const autoBookingHelpItems = [
  "Bookings are accepted instantly under the limit.",
  "Bookings beyond the limit need manual approval.",
];

export const rescheduleCutoffMaxMinutes = 7 * 24 * 60;

export const cutoffDayOptions = Array.from({ length: 8 }, (_, value) => ({
  value: String(value),
  label: String(value),
}));

export const cutoffHourOptions = Array.from({ length: 24 }, (_, value) => ({
  value: String(value),
  label: String(value),
}));

export const cutoffMinuteOptions = Array.from({ length: 60 }, (_, value) => ({
  value: String(value),
  label: String(value),
}));

export const scheduleServices = [
  {
    mode: "clinic",
    short: "Clinic",
    title: "Clinic appointments",
    description: "Visits at your clinic or hospital",
  },
  {
    mode: "online",
    short: "Online",
    title: "Online consultations",
    description: "Video consultation times",
  },
  {
    mode: "home",
    short: "Home visits",
    title: "Home visits",
    description: "Home-visit times and travel radius",
  },
] as const;

// Readable names for editor draft fields, listed in the review step.
export const draftChangeLabels = {
  days: "working days",
  timeBlocks: "hours",
  start: "hours",
  end: "hours",
  duration: "appointment length",
  onlineDuration: "appointment length",
  homeDuration: "appointment length",
  online: "daily booking limit",
  walkIn: "clinic capacity",
  clinicApp: "app booking quota",
  clinicWalkin: "walk-in quota",
  autoAccept: "auto-accept",
  autoLimit: "auto-accept limit",
  homeVisits: "home visits",
  homeRadius: "travel radius",
  homeTravelBuffer: "travel buffer",
  clinicFee: "clinic fee",
  onlineFee: "online fee",
  homeFee: "home-visit fee",
} as const;

export const durationPresets = {
  clinic: [10, 15, 20, 30],
  online: [10, 15, 20, 30],
  home: [30, 45, 60, 90],
} as const;
