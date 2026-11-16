import type { NotificationKind } from "@startup/mobile-ui";

type NotificationCopy = {
  kind: NotificationKind;
  title: string;
  message: string;
};

// Patient-facing wording per backend template key. The backend sends only
// booking codes, statuses and reasons, so messages describe the event itself.
export const notificationCopy: Record<string, NotificationCopy> = {
  "appointment.requested": {
    kind: "appointment",
    title: "Appointment requested",
    message: "Waiting for the doctor to accept",
  },
  "appointment.auto_confirmed": {
    kind: "appointment",
    title: "Appointment confirmed",
    message: "Your booking is confirmed",
  },
  "appointment.approve": {
    kind: "appointment",
    title: "Appointment confirmed",
    message: "The doctor accepted your booking",
  },
  "appointment.reject": {
    kind: "appointment",
    title: "Appointment declined",
    message: "The doctor can’t take this booking. Choose another time",
  },
  "appointment.rejected_unavailable": {
    kind: "appointment",
    title: "Appointment declined",
    message: "The doctor is unavailable at this time. Choose another time",
  },
  "appointment.cancel": {
    kind: "appointment",
    title: "Appointment cancelled",
    message: "This booking was cancelled",
  },
  "appointment.expired": {
    kind: "appointment",
    title: "Request expired",
    message: "The doctor didn’t respond in time. Book another slot",
  },
  "appointment.reschedule": {
    kind: "appointment",
    title: "Appointment rescheduled",
    message: "Your booking has a new time",
  },
  "appointment.reschedule_requested": {
    kind: "appointment",
    title: "Doctor requested a new appointment time",
    message: "Your doctor asked to move this appointment",
  },
  "appointment.no_show": {
    kind: "appointment",
    title: "Marked as missed",
    message: "This appointment was marked as missed",
  },
  "appointment.check_in": {
    kind: "queue",
    title: "Checked in",
    message: "You’re in the queue",
  },
  "appointment.call": {
    kind: "queue",
    title: "The doctor is ready for you",
    message: "It’s your turn",
  },
  "appointment.start": {
    kind: "queue",
    title: "Consultation started",
    message: "Your consultation is in progress",
  },
  "appointment.complete": {
    kind: "queue",
    title: "Consultation completed",
    message: "Your visit is complete",
  },
  "appointment.cash_received": {
    kind: "payment",
    title: "Payment received",
    message: "Your payment at reception was recorded",
  },
  "appointment.cash_refunded": {
    kind: "payment",
    title: "Cash refund recorded",
    message: "Your refund at reception was recorded",
  },
  "appointment.refund_decided": {
    kind: "payment",
    title: "Refund update",
    message: "A decision was made on your refund",
  },
  "prescription.issued": {
    kind: "prescription",
    title: "New prescription",
    message: "Your doctor issued a prescription",
  },
  "consultation.followup_recommended": {
    kind: "prescription",
    title: "Follow-up recommended",
    message: "Your doctor recommended a follow-up visit",
  },
  "ambulance.requested": {
    kind: "ambulance",
    title: "Ambulance requested",
    message: "Finding the nearest driver",
  },
  "ambulance.book": {
    kind: "ambulance",
    title: "Ambulance requested",
    message: "Finding the nearest driver",
  },
  "ambulance.assigned": {
    kind: "ambulance",
    title: "Ambulance assigned",
    message: "A driver is on the way",
  },
  "ambulance.trip_completed": {
    kind: "ambulance",
    title: "Trip completed",
    message: "Your ambulance trip is complete",
  },
  "ambulance.cancelled": {
    kind: "ambulance",
    title: "Ambulance cancelled",
    message: "This ambulance booking was cancelled",
  },
  "ambulance.unfulfilled": {
    kind: "ambulance",
    title: "No ambulance available",
    message: "We couldn’t find a driver. Try booking again",
  },
  "ambulance.sos": {
    kind: "ambulance",
    title: "SOS alert sent",
    message: "Your emergency request was sent",
  },
};

// Fallbacks for template keys without their own copy.
export const notificationPrefixCopy: readonly (readonly [
  string,
  NotificationCopy,
])[] = [
  [
    "appointment.",
    { kind: "appointment", title: "Appointment update", message: "" },
  ],
  ["ambulance.", { kind: "ambulance", title: "Ambulance update", message: "" }],
  [
    "verification.",
    { kind: "account", title: "Verification update", message: "" },
  ],
  [
    "prescription.",
    { kind: "prescription", title: "Prescription update", message: "" },
  ],
  [
    "consultation.",
    { kind: "prescription", title: "Consultation update", message: "" },
  ],
];
