export const sosDispatchEnabled =
  process.env.EXPO_PUBLIC_ENABLE_SOS_DISPATCH === "true";

// One-tap SOS has no form; the backend requires a short description.
export const sosDefaultSummary = "SOS sent from the patient app";

// A slow geocoder must not delay an emergency; coordinates are used instead.
export const sosAddressTimeoutMs = 4000;

// Dispatch rounds expire after 60 seconds and nothing reopens them on the
// server, so the screen asks for the next round while the search runs.
export const sosDispatchRefreshMs = 60_000;

export const sosActiveStatuses = [
  "awaiting_location",
  "searching",
  "assigned",
] as const;

export const sosTripStatusLabels = {
  heading_to_pickup: "On the way to you",
  arrived_at_pickup: "Arrived at your location",
  in_progress: "On the way to hospital",
  arrived_at_destination: "Arrived at hospital",
  completed: "Trip completed",
  cancelled: "Trip cancelled",
} as const;
