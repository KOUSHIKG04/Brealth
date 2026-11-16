import type { BookingFilter } from "../types/appointments";

export const bookingFilterLabels: Record<BookingFilter, string> = {
  All: "All",
  "Clinic Visit": "In-person (OPD)",
  "Home Visit": "Home Visit",
  Online: "Online",
  "Medicine and test": "Medicine and test",
};

export const bookingFilters: readonly BookingFilter[] = [
  "All",
  "Clinic Visit",
  "Home Visit",
  "Online",
  "Medicine and test",
];
