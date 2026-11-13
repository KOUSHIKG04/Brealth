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
