"use client";

import type { FacilityDoctorScheduleEditorProps } from "../types/facilityDoctorScheduleEditor";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@startup/web-ui/components/ui/toast";
import {
  doctorScheduleSettingsSchema,
  formatDisplayDate,
  preferencesToScheduleSettings,
  rebaseScheduleSettings,
  scheduleBusyOverlaps,
  scheduleErrorCodes,
  scheduleErrorMessage,
  scheduleSettingNames,
  type DoctorScheduleSettings,
  type DoctorSchedulePreferences,
  type ScheduleChangePreview,
  type ScheduleConflictDecision,
} from "@startup/contracts";
import {
  listFacilityDoctorBusyBlocks,
  loadFacilityDoctorSchedule,
  publishFacilityDoctorSchedule,
  publishPreviewedFacilityDoctorSchedule,
  previewFacilityDoctorSchedule,
} from "../server/scheduleActions";
import { initialSettings } from "../utils/facilityScheduleEditorConstants";
import {
  previewClocks,
  suggestConsultationDuration,
} from "../utils/scheduleEditor";

export function useFacilityDoctorSchedule({
  practiceId,
  transition,
  mode,
}: FacilityDoctorScheduleEditorProps) {
  const client = useQueryClient();
  const router = useRouter();
  const schedule = useQuery({
    queryKey: ["facility-practice-schedule", practiceId],
    queryFn: () => loadFacilityDoctorSchedule(practiceId),
  });
  const result = schedule.data as
    Awaited<ReturnType<typeof loadFacilityDoctorSchedule>> | undefined;
  const saved = result?.ok ? result.settings : null;
  const daysKey: "workingDays" | "onlineWorkingDays" | "homeWorkingDays" =
    mode === "online"
      ? "onlineWorkingDays"
      : mode === "home"
        ? "homeWorkingDays"
        : "workingDays";
  const startKey: "clinicStart" | "onlineStart" | "homeStart" =
    mode === "online"
      ? "onlineStart"
      : mode === "home"
        ? "homeStart"
        : "clinicStart";
  const endKey: "clinicEnd" | "onlineEnd" | "homeEnd" =
    mode === "online" ? "onlineEnd" : mode === "home" ? "homeEnd" : "clinicEnd";
  const durationKey: "slotMinutes" | "onlineSlotMinutes" | "homeSlotMinutes" =
    mode === "online"
      ? "onlineSlotMinutes"
      : mode === "home"
        ? "homeSlotMinutes"
        : "slotMinutes";
  const limitKey: "walkinDailyLimit" | "onlineDailyLimit" =
    mode === "online" ? "onlineDailyLimit" : "walkinDailyLimit";
  const feeKey: "clinicFeeMinor" | "onlineFeeMinor" | "homeFeeMinor" =
    mode === "online"
      ? "onlineFeeMinor"
      : mode === "home"
        ? "homeFeeMinor"
        : "clinicFeeMinor";
  // base is the saved copy the edits started from (three-way merge base).
  const [edits, setEdits] = useState<{
    version: number;
    base: DoctorScheduleSettings | null;
    settings: DoctorScheduleSettings;
  } | null>(null);
  const savedSettings = saved ? preferencesToScheduleSettings(saved) : null;
  const version = edits?.version ?? Number(saved?.row_version ?? 0);
  const draft = edits?.settings ??
    savedSettings ?? { ...initialSettings, [daysKey]: [] };
  // Saved elsewhere while these edits are unsaved; merged on publish.
  const remoteChanged =
    edits !== null &&
    saved !== null &&
    Number(saved.row_version) > edits.version;
  const localTransition = useTransition();
  const [pending, startTransition] = transition ?? localTransition;
  const [conflict, setConflict] = useState<ScheduleChangePreview | null>(null);
  const [showScheduleHelp, setShowScheduleHelp] = useState(true);
  const [showAutoBookingHelp, setShowAutoBookingHelp] = useState(false);
  const [availabilityDuration, setAvailabilityDuration] = useState<
    number | null
  >(null);
  const [suggestedDuration, setSuggestedDuration] = useState<number | null>(
    null
  );
  const [effectiveDate, setEffectiveDate] = useState("");
  const zone = result?.ok ? result.doctor.booking_timezone : undefined;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const startsFrom =
    effectiveDate && effectiveDate >= today ? effectiveDate : today;
  const serviceDays = draft[daysKey] ?? draft.workingDays;
  const duration = draft[durationKey];
  const blocksKey =
    mode === "clinic"
      ? "clinicTimeBlocks"
      : mode === "online"
        ? "onlineTimeBlocks"
        : "homeTimeBlocks";
  const timeBlocks = draft[blocksKey] ?? [
    { start: draft[startKey] ?? "", end: draft[endKey] ?? "" },
  ];
  const suggestion = suggestConsultationDuration(
    draft[startKey] ?? "",
    draft[endKey] ?? "",
    draft[limitKey],
    timeBlocks
  );
  const suggestedTimes = suggestedDuration
    ? timeBlocks.flatMap((block) =>
        previewClocks(block.start, block.end, suggestedDuration)
      )
    : [];
  const busyBlocks = useQuery({
    queryKey: ["facility-schedule-busy-blocks", practiceId, mode, startsFrom],
    queryFn: () => listFacilityDoctorBusyBlocks(practiceId, mode, startsFrom),
    enabled: Boolean(result?.ok),
    retry: false,
  });
  const busyOverlaps = scheduleBusyOverlaps(
    busyBlocks.data ?? [],
    serviceDays,
    timeBlocks,
    mode === "home" ? (draft.homeTravelBufferMinutes ?? 0) : 0
  );
  const update = (changes: Partial<DoctorScheduleSettings>) => {
    setConflict(null);
    setEdits({
      version,
      base: edits ? edits.base : savedSettings,
      settings: { ...draft, ...changes },
    });
  };
  const fail = (message: string) =>
    toast.add({
      title: "Schedule action failed",
      description: message,
      type: "error",
    });
  const fee = draft[feeKey];
  const feeLabel =
    mode === "clinic"
      ? "Clinic Visit"
      : mode === "online"
        ? "Online Consultation"
        : "Home Visit";

  const validate = () => {
    if (!serviceDays.length) return "Select at least one working day.";
    const start = draft[startKey] ?? "";
    const end = draft[endKey] ?? "";
    if (!start || !end || end <= start)
      return "End time must be after start time.";
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    if (endHour * 60 + endMinute - startHour * 60 - startMinute < duration)
      return "Working hours must fit at least one appointment slot.";
    if (draft.autoAccept && draft.autoAcceptLimit < 1)
      return "Choose a daily auto-booking limit from 1 to 100.";
    if (
      mode === "home" &&
      draft.homeVisits &&
      (!draft.homeRadiusKm || draft.homeRadiusKm <= 0)
    )
      return "Enter a positive home-visit travel radius in km.";
    const parsed = doctorScheduleSettingsSchema.safeParse(draft);
    return parsed.success
      ? null
      : (parsed.error.issues[0]?.message ?? "Check the schedule fields.");
  };
  type EditState = {
    version: number;
    base: DoctorScheduleSettings | null;
    settings: DoctorScheduleSettings;
  };
  /**
   * Merges the draft onto a newer saved copy. Fields changed only elsewhere are
   * adopted; returns null when both sides changed a setting (draft values kept).
   */
  const rebaseOnto = (
    latest: DoctorSchedulePreferences,
    current: EditState
  ): EditState | null => {
    const theirs = preferencesToScheduleSettings(latest);
    const { settings, conflicts } = rebaseScheduleSettings(
      current.base ?? theirs,
      current.settings,
      theirs
    );
    const next = {
      version: Number(latest.row_version),
      base: theirs,
      settings,
    };
    setEdits(next);
    if (!conflicts.length) return next;
    fail(
      `${scheduleSettingNames(conflicts).join(", ")} also changed elsewhere. Your values are kept; review them and publish again.`
    );
    return null;
  };
  const persist = (
    options: {
      previewToken?: string;
      decision?: ScheduleConflictDecision;
      effectiveFrom?: string;
    } = {}
  ) => {
    if (pending) return;
    const problem = validate();
    if (problem) {
      fail(problem);
      return;
    }
    startTransition(async () => {
      const from = options.effectiveFrom ?? startsFrom;
      let { previewToken, decision } = options;
      let current: EditState | null = {
        version,
        base: edits ? edits.base : savedSettings,
        settings: draft,
      };
      try {
        // A newer copy already loaded: merge before asking the server.
        if (saved && Number(saved.row_version) > current.version) {
          current = rebaseOnto(saved, current);
          if (!current) return;
          previewToken = undefined;
          decision = undefined;
        }
        let response;
        for (let attempt = 0; ; attempt++) {
          if (!previewToken) {
            const checked = await previewFacilityDoctorSchedule(
              practiceId,
              mode,
              current.settings,
              current.version,
              from
            );
            if (checked.ok && checked.preview.conflicts.length) {
              setConflict(checked.preview);
              return;
            }
            response = checked.ok
              ? await publishPreviewedFacilityDoctorSchedule(
                  practiceId,
                  mode,
                  current.settings,
                  current.version,
                  from,
                  checked.preview.token
                )
              : checked;
          } else
            response = await publishFacilityDoctorSchedule(
              practiceId,
              mode,
              current.settings,
              current.version,
              from,
              previewToken,
              decision
            );
          if (response.ok || attempt > 0) break;
          if (response.code === scheduleErrorCodes.changedElsewhere) {
            const refreshed = await schedule.refetch();
            const latest = refreshed.data?.ok ? refreshed.data.settings : null;
            if (!latest) break;
            current = rebaseOnto(latest, current);
            if (!current) return;
          } else if (response.code !== scheduleErrorCodes.newConflict) break;
          // Re-preview: new overlaps reopen the conflict dialog with a fresh token.
          previewToken = undefined;
          decision = undefined;
        }
        if (!response.ok || !("settings" in response)) {
          setConflict(null);
          fail(response.ok ? "Could not publish schedule." : response.error);
          return;
        }
        client.setQueryData(["facility-practice-schedule", practiceId], {
          ...result,
          settings: response.settings,
        });
        setEdits(null);
        setConflict(null);
        await client.invalidateQueries({ queryKey: ["schedule-adjustments"] });
        await client.invalidateQueries({
          queryKey: ["facility-practice-schedule", practiceId],
        });
        await client.invalidateQueries({
          queryKey: ["facility-recovery-policy", practiceId],
        });
        await client.invalidateQueries({
          queryKey: ["facility-schedule-busy-blocks", practiceId],
        });
        router.refresh();
        toast.add({
          title: response.settings.published_modes?.includes(mode)
            ? "Schedule published"
            : "Schedule paused",
          description: options.previewToken
            ? "Schedule saved. Conflicting availability was adjusted. Review the affected service schedules below."
            : response.settings.published_modes?.includes(mode)
              ? `Schedule published from ${formatDisplayDate(from)} for this practice and visit type. Existing appointments keep their times.`
              : "Future unbooked slots are withdrawn. Existing appointments keep their times.",
          type: "success",
        });
      } catch (cause) {
        setConflict(null);
        fail(
          scheduleErrorMessage(
            cause,
            "Could not check the schedule. Try again."
          )
        );
      }
    });
  };
  const save = () => persist();

  return {
    schedule,
    result,
    saved,
    daysKey,
    startKey,
    endKey,
    durationKey,
    limitKey,
    feeKey,
    draft,
    pending,
    showScheduleHelp,
    setShowScheduleHelp,
    showAutoBookingHelp,
    setShowAutoBookingHelp,
    availabilityDuration,
    setAvailabilityDuration,
    suggestedDuration,
    setSuggestedDuration,
    setEffectiveDate,
    zone,
    today,
    startsFrom,
    serviceDays,
    duration,
    suggestion,
    suggestedTimes,
    update,
    fee,
    feeLabel,
    save,
    conflict,
    busyBlocks: busyBlocks.data ?? [],
    busyOverlaps,
    remoteChanged,
    dismissConflict: () => setConflict(null),
    confirmConflict: (decision?: ScheduleConflictDecision) => {
      if (conflict?.can_replace || (decision && conflict?.can_request))
        persist({
          previewToken: conflict!.token,
          decision,
          effectiveFrom: conflict!.effective_from,
        });
    },
    startFromSuggestedDate: (date: string) => {
      setConflict(null);
      setEffectiveDate(date);
      persist({ effectiveFrom: date });
    },
  };
}
