import {
  doctorSchedulePreferencesSchema,
  doctorScheduleSettingsSchema,
  doctorSchedulePublicationSchema,
  scheduleChangePreviewSchema,
  scheduleAdjustmentNoticeSchema,
  scheduleBusyBlockSchema,
  scheduleChangeRequestSchema,
  scheduleConflictDecisionSchema,
  uuidSchema,
} from "@startup/contracts";
import type {
  DoctorScheduleSettings,
  ScheduleChangeRequestKind,
  ScheduleConflictDecision,
} from "@startup/contracts";
import type { AppSupabaseClient } from "../client/createSupabaseClient";
import type { Json } from "../generated/supabase.types";

export async function getMyDoctorPresence(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("get_my_doctor_presence");
  if (error) throw error;
  return Boolean(data);
}

export async function setMyDoctorPresence(
  client: AppSupabaseClient,
  present: boolean
) {
  const { data, error } = await client.rpc("set_my_doctor_presence", {
    p_present: present,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getMySchedulePreferences(
  client: AppSupabaseClient,
  practiceId: string
) {
  const { data, error } = await client.rpc("get_my_schedule_preferences", {
    p_practice_id: uuidSchema.parse(practiceId),
  });
  if (error) throw error;
  return data === null ? null : doctorSchedulePreferencesSchema.parse(data);
}

export async function listMyScheduleAdjustments(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("list_my_schedule_adjustments");
  if (error) throw Object.assign(new Error(error.message), error);
  return scheduleAdjustmentNoticeSchema.array().parse(data);
}

export async function saveMySchedulePreferences(
  client: AppSupabaseClient,
  practiceId: string,
  settings: DoctorScheduleSettings,
  expectedVersion: number
) {
  const value = doctorScheduleSettingsSchema.parse(settings);
  const { data, error } = await client.rpc("save_my_schedule_preferences", {
    p_practice_id: uuidSchema.parse(practiceId),
    p_settings: {
      working_days: value.workingDays,
      online_working_days: value.onlineWorkingDays,
      home_working_days: value.homeWorkingDays,
      online_auto_accept: value.onlineAutoAccept,
      home_auto_accept: value.homeAutoAccept,
      online_auto_accept_limit: value.onlineAutoAcceptLimit,
      home_auto_accept_limit: value.homeAutoAcceptLimit,
      clinic_start: value.clinicStart,
      clinic_end: value.clinicEnd,
      online_start: value.onlineStart,
      online_end: value.onlineEnd,
      home_start: value.homeStart,
      home_end: value.homeEnd,
      clinic_time_blocks: value.clinicTimeBlocks,
      online_time_blocks: value.onlineTimeBlocks,
      home_time_blocks: value.homeTimeBlocks,
      home_travel_buffer_minutes: value.homeTravelBufferMinutes,
      slot_minutes: value.slotMinutes,
      online_slot_minutes: value.onlineSlotMinutes,
      home_slot_minutes: value.homeSlotMinutes,
      online_daily_limit: value.onlineDailyLimit,
      walkin_daily_limit: value.walkinDailyLimit,
      clinic_app_daily_limit: value.clinicAppDailyLimit,
      clinic_walkin_daily_limit: value.clinicWalkinDailyLimit,
      auto_accept: value.autoAccept,
      auto_accept_limit: value.autoAcceptLimit,
      home_visits: value.homeVisits,
      home_radius_km: value.homeRadiusKm,
      online_fee_minor: value.onlineFeeMinor,
      clinic_fee_minor: value.clinicFeeMinor,
      home_fee_minor: value.homeFeeMinor,
    },
    p_expected_version: expectedVersion,
  });

  if (error) throw error;

  return doctorSchedulePreferencesSchema.parse(data);
}

function scheduleSettingsWire(value: DoctorScheduleSettings) {
  return {
    working_days: value.workingDays,
    online_working_days: value.onlineWorkingDays,
    home_working_days: value.homeWorkingDays,
    clinic_start: value.clinicStart,
    clinic_end: value.clinicEnd,
    online_start: value.onlineStart,
    online_end: value.onlineEnd,
    home_start: value.homeStart,
    home_end: value.homeEnd,
    clinic_time_blocks: value.clinicTimeBlocks,
    online_time_blocks: value.onlineTimeBlocks,
    home_time_blocks: value.homeTimeBlocks,
    home_travel_buffer_minutes: value.homeTravelBufferMinutes,
    slot_minutes: value.slotMinutes,
    online_slot_minutes: value.onlineSlotMinutes,
    home_slot_minutes: value.homeSlotMinutes,
    online_daily_limit: value.onlineDailyLimit,
    walkin_daily_limit: value.walkinDailyLimit,
    clinic_app_daily_limit: value.clinicAppDailyLimit,
    clinic_walkin_daily_limit: value.clinicWalkinDailyLimit,
    auto_accept: value.autoAccept,
    auto_accept_limit: value.autoAcceptLimit,
    home_visits: value.homeVisits,
    home_radius_km: value.homeRadiusKm,
    online_fee_minor: value.onlineFeeMinor,
    clinic_fee_minor: value.clinicFeeMinor,
    home_fee_minor: value.homeFeeMinor,
  };
}

export async function previewMyDoctorSchedule(
  client: AppSupabaseClient,
  practiceId: string,
  mode: "clinic" | "online" | "home",
  settings: DoctorScheduleSettings,
  expectedVersion: number,
  effectiveFrom?: string
) {
  const value = doctorScheduleSettingsSchema.parse(settings);
  const { data, error } = await client.rpc("preview_doctor_schedule_change", {
    p_practice_id: uuidSchema.parse(practiceId),
    p_mode: mode,
    p_settings: scheduleSettingsWire(value),
    p_expected_version: expectedVersion,
    p_effective_from: effectiveFrom ?? null,
  });
  if (error) throw Object.assign(new Error(error.message), error);
  return scheduleChangePreviewSchema.parse(data);
}

export async function publishMyDoctorSchedule(
  client: AppSupabaseClient,
  practiceId: string,
  mode: "clinic" | "online" | "home",
  settings: DoctorScheduleSettings,
  expectedVersion: number,
  effectiveFrom?: string,
  previewToken?: string,
  decision?: ScheduleConflictDecision
) {
  const value = doctorScheduleSettingsSchema.parse(settings);
  const choice = decision
    ? scheduleConflictDecisionSchema.parse(decision)
    : null;
  // Saving and slot generation share one transaction and one version check.
  const { data, error } = await client.rpc(
    previewToken && choice
      ? "resolve_doctor_schedule_conflicts"
      : previewToken
        ? "replace_doctor_schedule_conflicts"
        : "publish_doctor_schedule_from_date",
    {
      p_practice_id: uuidSchema.parse(practiceId),
      p_mode: mode,
      p_settings: scheduleSettingsWire(value),
      p_expected_version: expectedVersion,
      p_effective_from: effectiveFrom ?? null,
      ...(previewToken ? { p_preview_token: previewToken } : {}),
      ...(choice
        ? {
            p_strategy: choice.strategy,
            p_patient_reason: choice.patientReason,
          }
        : {}),
    }
  );
  if (error) throw Object.assign(new Error(error.message), error);
  return doctorSchedulePublicationSchema.parse(data);
}

// PostgREST reports an RPC that the connected database does not define yet.
function isMissingRpc(error: { code?: string }) {
  return error.code === "PGRST202";
}

/**
 * Other published blocks of the practice's doctor (all practices and services
 * except the one being edited). Returns an empty list on a database that has
 * not yet deployed the projection, so editors simply omit the hint.
 */
export async function listMyScheduleBusyBlocks(
  client: AppSupabaseClient,
  practiceId: string,
  mode: "clinic" | "online" | "home",
  effectiveFrom?: string
) {
  const { data, error } = await client.rpc("list_my_schedule_busy_blocks", {
    p_practice_id: uuidSchema.parse(practiceId),
    p_mode: mode,
    p_effective_from: effectiveFrom ?? null,
  });
  if (error) {
    if (isMissingRpc(error)) return [];
    throw Object.assign(new Error(error.message), error);
  }
  return scheduleBusyBlockSchema.array().parse(data);
}

/**
 * Publishes a conflict-free preview. The backend reruns the preview under the
 * publication locks: new overlaps raise PT410 and other changes raise PT409.
 * Falls back to the unchecked publisher where the checked RPC is not deployed.
 */
export async function publishPreviewedDoctorSchedule(
  client: AppSupabaseClient,
  practiceId: string,
  mode: "clinic" | "online" | "home",
  settings: DoctorScheduleSettings,
  expectedVersion: number,
  effectiveFrom: string | undefined,
  previewToken: string
) {
  const value = doctorScheduleSettingsSchema.parse(settings);
  const { data, error } = await client.rpc(
    "publish_previewed_doctor_schedule",
    {
      p_practice_id: uuidSchema.parse(practiceId),
      p_mode: mode,
      p_settings: scheduleSettingsWire(value),
      p_expected_version: expectedVersion,
      p_effective_from: effectiveFrom ?? null,
      p_preview_token: previewToken,
    }
  );
  if (error) {
    if (isMissingRpc(error))
      return publishMyDoctorSchedule(
        client,
        practiceId,
        mode,
        value,
        expectedVersion,
        effectiveFrom
      );
    throw Object.assign(new Error(error.message), error);
  }
  return doctorSchedulePublicationSchema.parse(data);
}

function rpcError(error: { message: string }) {
  return Object.assign(new Error(error.message), error);
}

/**
 * Whether this doctor's changes at the practice need the facility's approval
 * (hospitals and clinics the doctor does not run). False where the database
 * predates approvals, so the editor keeps publishing directly.
 */
export async function scheduleChangeRequiresApproval(
  client: AppSupabaseClient,
  practiceId: string
) {
  const { data, error } = await client.rpc(
    "schedule_change_requires_approval",
    { p_practice_id: uuidSchema.parse(practiceId) }
  );
  if (error) {
    if (isMissingRpc(error)) return false;
    throw rpcError(error);
  }
  return data === true;
}

export type ScheduleChangeRequestInput = {
  practiceId: string;
  kind: ScheduleChangeRequestKind;
  /** Full schedule settings for "schedule"; the RPC payload otherwise. */
  settings?: DoctorScheduleSettings;
  payload?: Record<string, unknown>;
  serviceMode?: "clinic" | "online" | "home";
  effectiveFrom?: string;
  expectedVersion?: number;
  note?: string;
};

export async function submitScheduleChangeRequest(
  client: AppSupabaseClient,
  input: ScheduleChangeRequestInput
) {
  // Both shapes are plain JSON objects; the wire type is checked by the RPC.
  const payload = (
    input.kind === "schedule"
      ? scheduleSettingsWire(doctorScheduleSettingsSchema.parse(input.settings))
      : (input.payload ?? {})
  ) as Json;
  const { data, error } = await client.rpc("submit_schedule_change_request", {
    p_practice_id: uuidSchema.parse(input.practiceId),
    p_kind: input.kind,
    p_payload: payload,
    p_service_mode: input.serviceMode ?? null,
    p_effective_from: input.effectiveFrom ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw rpcError(error);
  return scheduleChangeRequestSchema.parse(data);
}

export async function withdrawScheduleChangeRequest(
  client: AppSupabaseClient,
  requestId: string
) {
  const { data, error } = await client.rpc("withdraw_schedule_change_request", {
    p_request_id: uuidSchema.parse(requestId),
  });
  if (error) throw rpcError(error);
  return scheduleChangeRequestSchema.parse(data);
}

/** The doctor's own requests, newest first; empty before approvals exist. */
export async function listMyScheduleChangeRequests(
  client: AppSupabaseClient,
  practiceId?: string
) {
  const { data, error } = await client.rpc("list_my_schedule_change_requests", {
    p_practice_id: practiceId ? uuidSchema.parse(practiceId) : null,
  });
  if (error) {
    if (isMissingRpc(error)) return [];
    throw rpcError(error);
  }
  return scheduleChangeRequestSchema.array().parse(data);
}

/** Requests the signed-in facility owner or administrator can decide. */
export async function listFacilityScheduleChangeRequests(
  client: AppSupabaseClient,
  status: "pending" | null = "pending"
) {
  const { data, error } = await client.rpc(
    "list_facility_schedule_change_requests",
    { p_status: status }
  );
  if (error) {
    if (isMissingRpc(error)) return [];
    throw rpcError(error);
  }
  return scheduleChangeRequestSchema.array().parse(data);
}

/** Conflicts and affected bookings of a schedule request, or "stale". */
export async function previewScheduleChangeRequest(
  client: AppSupabaseClient,
  requestId: string
) {
  const { data, error } = await client.rpc("preview_schedule_change_request", {
    p_request_id: uuidSchema.parse(requestId),
  });
  if (error) throw rpcError(error);
  const value = data as { status?: string; preview?: unknown };
  return value.status === "stale"
    ? ({ status: "stale" } as const)
    : ({
        status: "pending",
        preview: scheduleChangePreviewSchema.parse(value.preview),
      } as const);
}

export async function approveScheduleChangeRequest(
  client: AppSupabaseClient,
  input: {
    requestId: string;
    previewToken?: string;
    decision?: ScheduleConflictDecision;
  }
) {
  const decision = input.decision
    ? scheduleConflictDecisionSchema.parse(input.decision)
    : null;
  const { data, error } = await client.rpc("approve_schedule_change_request", {
    p_request_id: uuidSchema.parse(input.requestId),
    p_preview_token: input.previewToken ?? null,
    p_strategy: decision?.strategy ?? null,
    p_patient_reason: decision?.patientReason ?? null,
  });
  if (error) throw rpcError(error);
  return (data as { status: "approved" | "stale" }).status;
}

export async function rejectScheduleChangeRequest(
  client: AppSupabaseClient,
  requestId: string,
  reason: string
) {
  const { error } = await client.rpc("reject_schedule_change_request", {
    p_request_id: uuidSchema.parse(requestId),
    p_reason: reason.trim(),
  });
  if (error) throw rpcError(error);
}
