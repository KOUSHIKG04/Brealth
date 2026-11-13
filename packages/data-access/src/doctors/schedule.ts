import {
  doctorSchedulePreferencesSchema,
  doctorScheduleSettingsSchema,
  doctorSchedulePublicationSchema,
  scheduleChangePreviewSchema,
  scheduleAdjustmentNoticeSchema,
  scheduleBusyBlockSchema,
  scheduleConflictDecisionSchema,
  uuidSchema,
} from "@startup/contracts";
import type {
  DoctorScheduleSettings,
  ScheduleConflictDecision,
} from "@startup/contracts";
import type { AppSupabaseClient } from "../client/createSupabaseClient";

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
