import {
  appointmentQueueNumber,
  localDateKey,
  type ClinicAppointment,
} from "@startup/contracts";

/** Where a visit is in today's operations, following the backend queue. */
type QueueStage =
  "with-doctor" | "called" | "waiting" | "held" | "upcoming" | "done";

export function queueStage(item: ClinicAppointment): QueueStage {
  if (item.status === "in_consultation" || item.queue_state === "in_service")
    return "with-doctor";
  if (
    ["completed", "no_show"].includes(item.status) ||
    item.queue_state === "completed" ||
    item.queue_state === "no_show"
  )
    return "done";
  if (item.queue_state === "called") return "called";
  if (item.queue_state === "waiting") return "waiting";
  // Late arrivals the clinic must admit or reschedule before they can be called.
  if (item.queue_state === "held") return "held";
  return "upcoming";
}

const stageOrder: Record<QueueStage, number> = {
  "with-doctor": 0,
  called: 1,
  waiting: 2,
  held: 3,
  upcoming: 4,
  done: 5,
};

// Visits that are booked for the day. Payment holds, requests awaiting a
// decision, cancellations, rejections and no-shows are not today's workload.
const bookedStatuses = new Set(["confirmed", "in_consultation", "completed"]);

/** Serving order: stage, then the backend's queue position, then time. */
function compareOperations(a: ClinicAppointment, b: ClinicAppointment) {
  const position = (item: ClinicAppointment) =>
    item.clinic_queue?.position ??
    appointmentQueueNumber(item) ??
    Number.MAX_SAFE_INTEGER;
  return (
    stageOrder[queueStage(a)] - stageOrder[queueStage(b)] ||
    position(a) - position(b) ||
    a.starts_at.localeCompare(b.starts_at) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Today's operational view for the doctor dashboard. "Today" is the clinic's
 * calendar day in each appointment's own timezone, not the phone's.
 */
export function doctorDayBoard(
  appointments: readonly ClinicAppointment[],
  now = Date.now()
) {
  const isToday = (item: ClinicAppointment) =>
    localDateKey(item.starts_at, item.timezone) ===
    localDateKey(new Date(now), item.timezone);
  const todays = appointments.filter(
    (item) =>
      isToday(item) &&
      !item.confirmation_payment_pending &&
      (bookedStatuses.has(item.status) || item.status === "no_show")
  );
  const booked = todays.filter((item) => bookedStatuses.has(item.status));
  const count = (stage: QueueStage) =>
    booked.filter((item) => queueStage(item) === stage).length;
  const pendingRequests = appointments.filter(
    (item) =>
      item.status === "pending" &&
      !item.confirmation_payment_pending &&
      Date.parse(item.request_expires_at ?? item.starts_at) > now &&
      Date.parse(item.starts_at) > now
  );
  return {
    /** Booked visits today (confirmed, in consultation or completed). */
    today: booked.length,
    /** Checked in and ready to be called. */
    waiting: count("waiting"),
    /** Called or currently in consultation. */
    withDoctor: count("called") + count("with-doctor"),
    /** Late arrivals awaiting admission or rescheduling. */
    needsReview: count("held"),
    /** Today's visits in serving order, finished ones last. */
    ordered: [...todays].sort(compareOperations),
    pendingRequests,
  };
}
