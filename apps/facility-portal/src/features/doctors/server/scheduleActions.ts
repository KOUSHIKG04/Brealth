"use server";

import { userErrorMessage } from "@startup/contracts";
import "server-only";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  doctorScheduleSettingsSchema,
  publishSelectedDoctorSlotsSchema,
  uuidSchema,
  scheduleConflictDecisionSchema,
  scheduleErrorCode,
  scheduleErrorMessage,
} from "@startup/contracts";
import type {
  DoctorScheduleSettings,
  PublishSelectedDoctorSlotsInput,
  AddClinicUnavailabilityInput,
  ScheduleConflictDecision,
} from "@startup/contracts";
import {
  getMySchedulePreferences,
  getMyDoctorDailySlotUsage,
  listMyFacilityDoctors,
  listMyClinicSessions,
  saveMySchedulePreferences,
  publishSelectedDoctorSlots,
  publishMyDoctorSchedule,
  publishPreviewedDoctorSchedule,
  previewMyDoctorSchedule,
  listMyScheduleBusyBlocks,
  listMyScheduleAdjustments,
  listClinicUnavailability,
  addClinicUnavailability,
  revokeClinicUnavailability,
  setAppointmentRecoveryPolicy,
  listFacilityScheduleChangeRequests,
  previewScheduleChangeRequest,
  approveScheduleChangeRequest,
  rejectScheduleChangeRequest,
  listFacilityShiftPlanRequests,
  decideShiftPlan,
  getShiftPlans,
  submitShiftPlan,
  endShiftPlan,
} from "@startup/data-access";
import { recoveryPolicySchema, shiftPlanInputSchema } from "@startup/contracts";
import { requireApprovedFacility } from "@/server/auth/facilityAccess";
import { createClient } from "@/lib/supabase/server";

async function authorizedPractice(practiceId: string) {
  uuidSchema.parse(practiceId);
  await requireApprovedFacility();
  const client = await createClient();
  const doctor = (await listMyFacilityDoctors(client)).find(
    (item) => item.practice_id === practiceId && item.verified
  );
  if (!doctor)
    throw new Error(
      "An approved doctor association with your facility is required."
    );
  if (!doctor.booking_timezone)
    throw new Error(
      "Practice timezone unavailable. Refresh after database setup."
    );
  // This RPC checks owner/admin membership at the database boundary.
  const settings = await getMySchedulePreferences(client, practiceId);
  return { client, doctor, settings };
}

export async function loadFacilityScheduleAdjustments(practiceId: string) {
  const { client } = await authorizedPractice(practiceId);
  return (await listMyScheduleAdjustments(client)).filter(
    (notice) => notice.practice_id === practiceId
  );
}

export async function loadFacilityRecoveryPolicy(practiceId: string) {
  return (await authorizedPractice(practiceId)).settings;
}

export async function saveFacilityRecoveryPolicy(input: unknown) {
  const parsed = recoveryPolicySchema.parse(input);
  const { client } = await authorizedPractice(parsed.practiceId);
  const settings = await setAppointmentRecoveryPolicy(client, parsed);
  revalidatePath("/doctor-schedules");
  return settings;
}

export async function loadFacilityDoctorSchedule(
  practiceId: string,
  localDay?: string
) {
  try {
    const { client, doctor, settings } = await authorizedPractice(practiceId);
    if (localDay) z.iso.date().parse(localDay);
    const [sessions, usage, unavailable] = await Promise.all([
      listMyClinicSessions(client, practiceId),
      localDay
        ? getMyDoctorDailySlotUsage(client, practiceId, localDay)
        : Promise.resolve(null),
      listClinicUnavailability(client, practiceId),
    ]);
    return {
      ok: true as const,
      doctor,
      settings,
      sessions,
      usage,
      unavailable,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false as const,
      error: userErrorMessage(error, "Could not load schedule."),
    };
  }
}

// Server Action errors lose their SQLSTATE in production, so schedule actions
// return the stable code with safe copy instead of throwing.
function scheduleFailure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    code: scheduleErrorCode(error),
    error: scheduleErrorMessage(error, fallback),
  };
}

function parsePublication(
  practiceId: string,
  mode: "clinic" | "online" | "home",
  settings: DoctorScheduleSettings,
  expectedVersion: number,
  effectiveFrom?: string,
  previewToken?: string
) {
  const value = doctorScheduleSettingsSchema.parse(settings);
  uuidSchema.parse(practiceId);
  z.enum(["clinic", "online", "home"]).parse(mode);
  z.number().int().nonnegative().parse(expectedVersion);
  if (effectiveFrom) z.iso.date().parse(effectiveFrom);
  if (previewToken)
    z.string()
      .regex(/^[a-f0-9]{32}$/)
      .parse(previewToken);
  return value;
}

function revalidateSchedulePaths() {
  revalidatePath("/doctor-schedules");
  revalidatePath("/appointments");
}

export async function publishFacilityDoctorSchedule(
  practiceId: string,
  mode: "clinic" | "online" | "home",
  settings: DoctorScheduleSettings,
  expectedVersion: number,
  effectiveFrom?: string,
  previewToken?: string,
  decision?: ScheduleConflictDecision
) {
  try {
    const value = parsePublication(
      practiceId,
      mode,
      settings,
      expectedVersion,
      effectiveFrom,
      previewToken
    );
    const { client } = await authorizedPractice(practiceId);
    const publication = await publishMyDoctorSchedule(
      client,
      practiceId,
      mode,
      value,
      expectedVersion,
      effectiveFrom,
      previewToken,
      decision ? scheduleConflictDecisionSchema.parse(decision) : undefined
    );
    revalidateSchedulePaths();
    return { ok: true as const, ...publication };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not publish schedule.");
  }
}

/** Publishes a conflict-free preview; the backend rechecks it under locks. */
export async function publishPreviewedFacilityDoctorSchedule(
  practiceId: string,
  mode: "clinic" | "online" | "home",
  settings: DoctorScheduleSettings,
  expectedVersion: number,
  effectiveFrom: string,
  previewToken: string
) {
  try {
    const value = parsePublication(
      practiceId,
      mode,
      settings,
      expectedVersion,
      effectiveFrom,
      previewToken
    );
    const { client } = await authorizedPractice(practiceId);
    const publication = await publishPreviewedDoctorSchedule(
      client,
      practiceId,
      mode,
      value,
      expectedVersion,
      effectiveFrom,
      previewToken
    );
    revalidateSchedulePaths();
    return { ok: true as const, ...publication };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not publish schedule.");
  }
}

export async function previewFacilityDoctorSchedule(
  practiceId: string,
  mode: "clinic" | "online" | "home",
  settings: DoctorScheduleSettings,
  expectedVersion: number,
  effectiveFrom: string
) {
  try {
    const value = parsePublication(
      practiceId,
      mode,
      settings,
      expectedVersion,
      effectiveFrom
    );
    const { client } = await authorizedPractice(practiceId);
    const preview = await previewMyDoctorSchedule(
      client,
      practiceId,
      mode,
      value,
      expectedVersion,
      effectiveFrom
    );
    return { ok: true as const, preview };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not check the schedule. Try again.");
  }
}

/** Other published blocks of this practice's doctor, for the editor hint. */
export async function listFacilityDoctorBusyBlocks(
  practiceId: string,
  mode: "clinic" | "online" | "home",
  effectiveFrom: string
) {
  z.enum(["clinic", "online", "home"]).parse(mode);
  z.iso.date().parse(effectiveFrom);
  const { client } = await authorizedPractice(practiceId);
  return listMyScheduleBusyBlocks(client, practiceId, mode, effectiveFrom);
}

export async function addFacilityDoctorUnavailability(
  input: AddClinicUnavailabilityInput
) {
  try {
    const { client } = await authorizedPractice(input.practiceId);
    await addClinicUnavailability(client, input);
    revalidatePath("/doctor-schedules");
    revalidatePath("/appointments");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false as const,
      error: userErrorMessage(error, "Could not add unavailable time."),
    };
  }
}

export async function removeFacilityDoctorUnavailability(
  practiceId: string,
  exceptionId: string,
  expectedVersion: number
) {
  try {
    const { client } = await authorizedPractice(practiceId);
    // Revocation also checks that the exception belongs to an authorized practice.
    const items = await listClinicUnavailability(client, practiceId);
    if (!items.some((item) => item.id === exceptionId))
      throw new Error("Unavailable time does not belong to this practice.");
    await revokeClinicUnavailability(client, { exceptionId, expectedVersion });
    revalidatePath("/doctor-schedules");
    revalidatePath("/appointments");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false as const,
      error: userErrorMessage(error, "Could not remove unavailable time."),
    };
  }
}

export async function saveFacilityDoctorSchedule(
  practiceId: string,
  settings: DoctorScheduleSettings,
  expectedVersion: number
) {
  try {
    const value = doctorScheduleSettingsSchema.parse(settings);
    z.number().int().nonnegative().parse(expectedVersion);
    const { client } = await authorizedPractice(practiceId);
    const saved = await saveMySchedulePreferences(
      client,
      practiceId,
      value,
      expectedVersion
    );
    revalidatePath("/doctor-schedules");
    return { ok: true as const, settings: saved };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not save schedule.");
  }
}

export async function publishFacilityDoctorSlots(
  input: PublishSelectedDoctorSlotsInput
) {
  try {
    const value = publishSelectedDoctorSlotsSchema.parse(input);
    const { client } = await authorizedPractice(value.practiceId);
    await publishSelectedDoctorSlots(client, value);
    revalidatePath("/doctor-schedules");
    revalidatePath("/appointments");
    revalidatePath("/dashboard");
    return { ok: true as const, count: value.slotStarts.length };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false as const,
      error: userErrorMessage(error, "Could not publish slots."),
    };
  }
}

// Doctor schedule, time-off and policy requests at facilities that approve
// them. The database checks the approver role on every call.
export async function loadFacilityScheduleChangeRequests() {
  try {
    await requireApprovedFacility();
    const client = await createClient();
    return {
      ok: true as const,
      requests: await listFacilityScheduleChangeRequests(client, "pending"),
    };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not load schedule requests.");
  }
}

export async function previewFacilityScheduleChangeRequest(requestId: string) {
  try {
    uuidSchema.parse(requestId);
    await requireApprovedFacility();
    const client = await createClient();
    const result = await previewScheduleChangeRequest(client, requestId);
    if (result.status === "stale") revalidatePath("/doctor-schedules");
    return { ok: true as const, ...result };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not review this request.");
  }
}

export async function approveFacilityScheduleChangeRequest(
  requestId: string,
  previewToken?: string,
  decision?: ScheduleConflictDecision
) {
  try {
    uuidSchema.parse(requestId);
    if (previewToken)
      z.string()
        .regex(/^[a-f0-9]{32}$/)
        .parse(previewToken);
    await requireApprovedFacility();
    const client = await createClient();
    const status = await approveScheduleChangeRequest(client, {
      requestId,
      previewToken,
      decision: decision
        ? scheduleConflictDecisionSchema.parse(decision)
        : undefined,
    });
    revalidatePath("/doctor-schedules");
    revalidatePath("/appointments");
    return { ok: true as const, status };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not approve this request.");
  }
}

export async function rejectFacilityScheduleChangeRequest(
  requestId: string,
  reason: string
) {
  try {
    uuidSchema.parse(requestId);
    z.string().trim().min(5).max(500).parse(reason);
    await requireApprovedFacility();
    const client = await createClient();
    await rejectScheduleChangeRequest(client, requestId, reason);
    revalidatePath("/doctor-schedules");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not decline this request.");
  }
}

/** Doctors' shift rotations waiting for this facility's approval. */
export async function loadFacilityShiftPlanRequests() {
  try {
    await requireApprovedFacility();
    const client = await createClient();
    return {
      ok: true as const,
      plans: await listFacilityShiftPlanRequests(client),
    };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not load shift rotation requests.");
  }
}

export async function decideFacilityShiftPlan(
  planId: string,
  approve: boolean,
  reason?: string
) {
  try {
    uuidSchema.parse(planId);
    if (!approve) z.string().trim().min(3).max(500).parse(reason);
    await requireApprovedFacility();
    const client = await createClient();
    await decideShiftPlan(client, { planId, approve, reason });
    revalidatePath("/doctor-schedules");
    revalidatePath("/appointments");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(
      error,
      approve
        ? "Could not approve this rotation."
        : "Could not decline this rotation."
    );
  }
}

const serviceModeSchema = z.enum(["clinic", "online", "home"]);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A doctor's shift plans at this facility, with the doctor's time zone. */
export async function loadFacilityShiftPlans(practiceId: string) {
  try {
    const { client, doctor } = await authorizedPractice(practiceId);
    return {
      ok: true as const,
      timezone: doctor.booking_timezone as string,
      plans: await getShiftPlans(client, practiceId),
    };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not load the shift rotation.");
  }
}

/** Facility staff publish a doctor's rotation directly (no approval step). */
export async function submitFacilityShiftPlan(input: {
  practiceId: string;
  mode: "clinic" | "online" | "home";
  plan: unknown;
  effectiveFrom: string;
}) {
  try {
    const { client } = await authorizedPractice(input.practiceId);
    const result = await submitShiftPlan(client, {
      practiceId: input.practiceId,
      mode: serviceModeSchema.parse(input.mode),
      plan: shiftPlanInputSchema.parse(input.plan),
      effectiveFrom: isoDateSchema.parse(input.effectiveFrom),
    });
    revalidatePath("/doctor-schedules");
    revalidatePath("/appointments");
    return {
      ok: true as const,
      status: result.status,
      shiftsCreated: result.shifts_created ?? 0,
    };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not publish the rotation.");
  }
}

export async function endFacilityShiftPlan(input: {
  practiceId: string;
  mode: "clinic" | "online" | "home";
  from: string;
}) {
  try {
    const { client } = await authorizedPractice(input.practiceId);
    await endShiftPlan(client, {
      practiceId: input.practiceId,
      mode: serviceModeSchema.parse(input.mode),
      from: isoDateSchema.parse(input.from),
    });
    revalidatePath("/doctor-schedules");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return scheduleFailure(error, "Could not end the rotation.");
  }
}
