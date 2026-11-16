import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useToast, useToastFeedback } from "@startup/mobile-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMySchedulePreferences,
  getMyDoctorProfile,
  listMyDoctorFacilityRequests,
  listMyPractices,
  listMyScheduleBusyBlocks,
  listMyScheduleChangeRequests,
  publishMyDoctorSchedule,
  scheduleChangeRequiresApproval,
  submitScheduleChangeRequest,
  withdrawScheduleChangeRequest,
  publishPreviewedDoctorSchedule,
  previewMyDoctorSchedule,
  saveMySchedulePreferences,
} from "@startup/data-access";
import {
  preferencesToScheduleSettings,
  rebaseScheduleSettings,
  scheduleBatchingHints,
  scheduleBusyOverlaps,
  scheduleErrorCode,
  scheduleErrorCodes,
  scheduleErrorMessage,
  userErrorMessage,
  scheduleSettingNames,
  scheduleSettingsProblem,
  type ClinicPractice,
  type DoctorScheduleSettings,
  type DoctorSchedulePreferences,
  type ScheduleChangePreview,
  type ScheduleConflictDecision,
} from "@startup/contracts";
import { supabase, useMobileSession } from "../../../services/supabase";
import {
  getSelectedPracticeId,
  setSelectedPracticeId,
} from "../../practices/services/selectedPractice";
import { selectedPracticeQueryKey } from "../../practices/utils/practiceQueryKeys";
import { formatDisplayDate } from "@startup/contracts";
import {
  dismissScheduleHelp,
  isScheduleHelpDismissed,
} from "../services/scheduleHelp";
import {
  draftFromSettings,
  previewTimeBlock,
  scheduleError,
  suggestConsultationDuration,
} from "../utils/schedule";
import { draftChanges, draftSummary } from "../utils/scheduleOverview";
import type { Schedule } from "../../../types/doctor";
import { initialSchedule } from "../utils/scheduleDefaults";

export function useScheduleEditor({
  mode,
}: {
  mode: "clinic" | "online" | "home";
}) {
  const queryClient = useQueryClient();
  // Inline tip until dismissed once; no pop-up on every visit.
  const [showScheduleHelp, setShowScheduleHelp] = useState(false);
  useEffect(() => {
    let active = true;
    void isScheduleHelpDismissed().then((dismissed) => {
      if (active) setShowScheduleHelp(!dismissed);
    });
    return () => {
      active = false;
    };
  }, []);
  const hideScheduleHelp = () => {
    setShowScheduleHelp(false);
    void dismissScheduleHelp();
  };
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["my-doctor-schedule"] });
    }, [queryClient, mode])
  );
  const { showToast } = useToast();
  const { profile } = useMobileSession();
  const doctorId = profile?.doctor?.id;
  const doctorProfile = useQuery({
    queryKey: ["my-doctor-profile"],
    queryFn: () => getMyDoctorProfile(supabase!),
    enabled: Boolean(supabase),
  });
  const zone = doctorProfile.data?.booking_timezone;
  const practices = useQuery({
    queryKey: ["my-practices"],
    queryFn: () => listMyPractices(supabase!),
    enabled: Boolean(supabase),
  });
  const preferredPractice = useQuery({
    queryKey: selectedPracticeQueryKey(doctorId),
    queryFn: () => getSelectedPracticeId(doctorId!),
    enabled: Boolean(doctorId),
  });
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const availablePractices = practices.data as ClinicPractice[] | undefined;
  const selectedPracticeId =
    availablePractices?.find((item) => item.practice_id === practiceId)
      ?.practice_id ??
    availablePractices?.find(
      (item) => item.practice_id === preferredPractice.data
    )?.practice_id ??
    availablePractices?.[0]?.practice_id ??
    null;
  const selectedPractice = availablePractices?.find(
    (item) => item.practice_id === selectedPracticeId
  );
  const associationRequests = useQuery({
    queryKey: ["my-doctor-facility-requests"],
    queryFn: () => listMyDoctorFacilityRequests(supabase!),
    enabled: Boolean(supabase && availablePractices && !selectedPracticeId),
  });
  const requests = associationRequests.data as
    Awaited<ReturnType<typeof listMyDoctorFacilityRequests>> | undefined;
  const pendingAssociation = requests?.find(
    (item) => item.status === "pending"
  );
  const rejectedAssociation = requests?.find(
    (item) => item.status === "rejected"
  );
  const saved = useQuery({
    queryKey: ["my-doctor-schedule", selectedPracticeId],
    queryFn: () => getMySchedulePreferences(supabase!, selectedPracticeId!),
    enabled: Boolean(supabase && selectedPracticeId),
  });
  useToastFeedback({
    error: practices.isError
      ? "Could not load your workplaces."
      : saved.isError
        ? "Could not load saved schedule."
        : "",
  });
  const [draft, setDraft] = useState<Schedule>(() => initialSchedule(mode));
  const dirty = useRef(false);
  const draftVersion = useRef(0);
  const draftPractice = useRef<string | null>(null);
  // Saved copy the draft started from; the base of the three-way merge.
  const baseSettings = useRef<DoctorScheduleSettings | null>(null);
  const applySchedule = useCallback(
    (p: DoctorSchedulePreferences) => {
      const settings = preferencesToScheduleSettings(p);
      dirty.current = false;
      draftVersion.current = Number(p.row_version);
      draftPractice.current = p.practice_id;
      baseSettings.current = settings;
      setDraft(draftFromSettings(settings, mode));
    },
    [mode]
  );
  useEffect(() => {
    if (
      saved.data &&
      (!dirty.current || draftPractice.current !== selectedPracticeId)
    )
      applySchedule(saved.data);
    else if (
      !saved.isLoading &&
      !saved.isError &&
      draftPractice.current !== selectedPracticeId
    ) {
      dirty.current = false;
      draftVersion.current = 0;
      draftPractice.current = selectedPracticeId;
      baseSettings.current = null;
      setDraft(initialSchedule(mode));
    }
  }, [
    saved.data,
    saved.isLoading,
    saved.isError,
    selectedPracticeId,
    applySchedule,
    mode,
  ]);
  const [busy, setBusy] = useState(false);
  // Synchronous guard: state updates are too late to stop a fast double tap.
  const inFlight = useRef(false);
  const [conflict, setConflict] = useState<ScheduleChangePreview | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const startsFrom =
    effectiveDate && effectiveDate >= today ? effectiveDate : today;
  useEffect(() => {
    setEffectiveDate("");
  }, [selectedPracticeId, mode]);
  const dailyLimit = mode === "online" ? draft.online : draft.walkIn;
  const suggestion = suggestConsultationDuration(
    draft.start,
    draft.end,
    dailyLimit,
    draft.timeBlocks
  );
  // Appointment times the suggested duration would create within the hours.
  const suggestedTimes = suggestion
    ? (draft.timeBlocks ?? [{ start: draft.start, end: draft.end }]).flatMap(
        (block) => previewTimeBlock(block.start, block.end, suggestion)
      )
    : [];
  const currentDuration =
    mode === "online"
      ? draft.onlineDuration
      : mode === "home"
        ? draft.homeDuration
        : draft.duration;
  // Offered inline during setup only; a published duration is never recalculated.
  const offerSuggestion =
    mode !== "home" &&
    suggestion !== null &&
    suggestion !== currentDuration &&
    !saved.data?.published_modes?.includes(mode);
  const applySuggestion = () => {
    if (suggestion === null) return;
    update(
      mode === "online"
        ? { onlineDuration: suggestion }
        : { duration: suggestion }
    );
  };
  const busyBlocks = useQuery({
    queryKey: ["schedule-busy-blocks", selectedPracticeId, mode, startsFrom],
    queryFn: () =>
      listMyScheduleBusyBlocks(
        supabase!,
        selectedPracticeId!,
        mode,
        startsFrom
      ),
    enabled: Boolean(
      supabase && selectedPracticeId && selectedPractice?.verified
    ),
    retry: false,
  });
  const busyOverlaps = scheduleBusyOverlaps(
    busyBlocks.data ?? [],
    draft.days.map((day) => day + 1),
    draft.timeBlocks ?? [{ start: draft.start, end: draft.end }],
    mode === "home" ? (draft.homeTravelBuffer ?? 0) : 0
  );
  // Advisory only: online hours are kept on time best when batched before
  // or after clinic hours, in blocks of at least an hour.
  const batchingHints = scheduleBatchingHints(
    mode,
    draft.days.map((day) => day + 1),
    draft.timeBlocks ?? [{ start: draft.start, end: draft.end }],
    busyBlocks.data ?? []
  );
  // Hospitals and clinics the doctor does not run approve schedule changes;
  // the doctor's own clinic publishes directly. The backend enforces this.
  const approval = useQuery({
    queryKey: ["schedule-approval", selectedPracticeId],
    queryFn: () =>
      scheduleChangeRequiresApproval(supabase!, selectedPracticeId!),
    enabled: Boolean(
      supabase && selectedPracticeId && selectedPractice?.verified
    ),
  });
  const approvalRequired = approval.data === true;
  // Until this is known, publishing could bypass a facility that approves changes.
  const approvalChecking = approval.isLoading;
  const changeRequests = useQuery({
    queryKey: ["schedule-change-requests", selectedPracticeId],
    queryFn: () => listMyScheduleChangeRequests(supabase!, selectedPracticeId!),
    enabled: Boolean(supabase && selectedPracticeId && approvalRequired),
  });
  // Newest request for this service: pending, or the latest decision.
  const scheduleRequest = changeRequests.data?.find(
    (request) => request.kind === "schedule" && request.service_mode === mode
  );
  async function withdrawRequest(requestId: string) {
    if (!supabase || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await withdrawScheduleChangeRequest(supabase, requestId);
      await queryClient.invalidateQueries({
        queryKey: ["schedule-change-requests"],
      });
      showToast({
        title: "Request withdrawn",
        message: "Your current schedule stays as it is.",
        type: "success",
      });
    } catch (cause) {
      showToast({
        title: "Could not withdraw request",
        message: userErrorMessage(cause, "Try again."),
        type: "error",
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  // Saved elsewhere while this draft has unsaved edits; merged on publish.
  const remoteChanged =
    dirty.current &&
    saved.data?.practice_id === draftPractice.current &&
    Number(saved.data?.row_version ?? 0) > draftVersion.current;
  const update = (changes: Partial<Schedule>) => {
    setConflict(null);
    dirty.current = true;
    setDraft((current) => ({ ...current, ...changes }));
  };
  const scheduleSettings = () => ({
    clinicTimeBlocks:
      mode === "clinic"
        ? (draft.timeBlocks ?? [{ start: draft.start, end: draft.end }])
        : saved.data?.clinic_time_blocks,
    onlineTimeBlocks:
      mode === "online"
        ? (draft.timeBlocks ?? [{ start: draft.start, end: draft.end }])
        : saved.data?.online_time_blocks,
    homeTimeBlocks:
      mode === "home"
        ? (draft.timeBlocks ?? [{ start: draft.start, end: draft.end }])
        : saved.data?.home_time_blocks,
    homeTravelBufferMinutes:
      draft.homeTravelBuffer ?? saved.data?.home_travel_buffer_minutes ?? 0,
    workingDays:
      mode === "clinic"
        ? draft.days.map((day) => day + 1)
        : (saved.data?.working_days ?? [1, 2, 3, 4, 5]),
    onlineWorkingDays:
      mode === "online"
        ? draft.days.map((day) => day + 1)
        : (saved.data?.online_working_days ?? [1, 2, 3, 4, 5]),
    homeWorkingDays:
      mode === "home"
        ? draft.days.map((day) => day + 1)
        : (saved.data?.home_working_days ?? [1, 2, 3, 4, 5]),
    clinicStart:
      mode === "clinic"
        ? draft.start
        : (saved.data?.clinic_start.slice(0, 5) ?? "09:00"),
    clinicEnd:
      mode === "clinic"
        ? draft.end
        : (saved.data?.clinic_end.slice(0, 5) ?? "17:00"),
    onlineStart:
      mode === "online"
        ? draft.start
        : (saved.data?.online_start?.slice(0, 5) ?? "13:00"),
    onlineEnd:
      mode === "online"
        ? draft.end
        : (saved.data?.online_end?.slice(0, 5) ?? "15:00"),
    homeStart:
      mode === "home"
        ? draft.start
        : (saved.data?.home_start?.slice(0, 5) ?? "16:00"),
    homeEnd:
      mode === "home"
        ? draft.end
        : (saved.data?.home_end?.slice(0, 5) ?? "17:00"),
    slotMinutes: draft.duration,
    onlineSlotMinutes: draft.onlineDuration,
    homeSlotMinutes: draft.homeDuration,
    onlineDailyLimit: draft.online,
    walkinDailyLimit: draft.walkIn,
    clinicAppDailyLimit: draft.clinicApp ?? draft.walkIn,
    clinicWalkinDailyLimit: draft.clinicWalkin ?? 0,
    autoAccept: draft.autoAccept,
    autoAcceptLimit: draft.autoAccept ? draft.autoLimit : 0,
    homeVisits: draft.homeVisits,
    homeRadiusKm: draft.homeRadius ? Number(draft.homeRadius) : null,
    onlineFeeMinor: Math.round(Number(draft.onlineFee) * 100),
    clinicFeeMinor: Math.round(Number(draft.clinicFee) * 100),
    homeFeeMinor: Math.round(Number(draft.homeFee) * 100),
  });
  /**
   * Merges this draft onto a newer saved copy. Fields changed only elsewhere
   * are adopted, fields changed only here are kept. Returns null when both
   * sides changed the same setting; the draft keeps the doctor's values.
   */
  function rebaseOnto(
    latest: DoctorSchedulePreferences,
    mine: DoctorScheduleSettings
  ) {
    const theirs = preferencesToScheduleSettings(latest);
    const { settings, conflicts } = rebaseScheduleSettings(
      baseSettings.current ?? theirs,
      mine,
      theirs
    );
    baseSettings.current = theirs;
    draftVersion.current = Number(latest.row_version);
    draftPractice.current = latest.practice_id;
    dirty.current = true;
    setDraft(draftFromSettings(settings, mode));
    if (!conflicts.length) return settings;
    showToast({
      title: "Changed in another app too",
      message: `${scheduleSettingNames(conflicts).join(", ")} also changed elsewhere. Your values are kept; review them and publish again.`,
      type: "error",
    });
    return null;
  }

  /** Local checks first, then the shared rules the backend applies. */
  function validate() {
    const problem =
      scheduleError(draft, mode) ?? scheduleSettingsProblem(scheduleSettings());
    if (!problem) return true;
    showToast({ title: "Schedule error", message: problem, type: "error" });
    return false;
  }

  async function persist(
    options: {
      previewToken?: string;
      decision?: ScheduleConflictDecision;
      effectiveFrom?: string;
    } = {}
  ) {
    if (!validate()) return;
    if (!supabase || !selectedPracticeId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPendingAction("save");
    const from = options.effectiveFrom ?? startsFrom;
    let { previewToken, decision } = options;
    let settings: DoctorScheduleSettings | null = scheduleSettings();
    let version = draftVersion.current;
    try {
      // A newer copy already arrived (live update or focus refetch): merge first.
      const known = saved.data;
      if (
        known?.practice_id === selectedPracticeId &&
        Number(known.row_version) > version
      ) {
        settings = rebaseOnto(known, settings);
        if (!settings) return;
        version = draftVersion.current;
        previewToken = undefined;
        decision = undefined;
      }
      let publication = null;
      let submitted = false;
      for (let attempt = 0; ; attempt++) {
        try {
          if (approvalRequired) {
            // The facility reviews conflicts and bookings when it decides.
            await submitScheduleChangeRequest(supabase, {
              practiceId: selectedPracticeId,
              kind: "schedule",
              settings,
              serviceMode: mode,
              effectiveFrom: from,
              expectedVersion: version,
            });
            submitted = true;
          } else if (selectedPractice?.verified && !previewToken) {
            const preview = await previewMyDoctorSchedule(
              supabase,
              selectedPracticeId,
              mode,
              settings,
              version,
              from
            );
            if (preview.conflicts.length) {
              setConflict(preview);
              return;
            }
            publication = await publishPreviewedDoctorSchedule(
              supabase,
              selectedPracticeId,
              mode,
              settings,
              version,
              from,
              preview.token
            );
          } else if (selectedPractice?.verified)
            publication = await publishMyDoctorSchedule(
              supabase,
              selectedPracticeId,
              mode,
              settings,
              version,
              from,
              previewToken,
              decision
            );
          break;
        } catch (cause) {
          const code = scheduleErrorCode(cause);
          if (attempt > 0) throw cause;
          if (code === scheduleErrorCodes.changedElsewhere) {
            const latest = (await saved.refetch()).data;
            if (!latest) throw cause;
            settings = rebaseOnto(latest, settings);
            if (!settings) return;
            version = draftVersion.current;
          } else if (code !== scheduleErrorCodes.newConflict) throw cause;
          // Re-preview: new overlaps reopen the conflict dialog with a fresh token.
          previewToken = undefined;
          decision = undefined;
        }
      }
      if (submitted) {
        // The request holds these edits; leaving the editor loses nothing.
        dirty.current = false;
        await queryClient.invalidateQueries({
          queryKey: ["schedule-change-requests"],
        });
        showToast({
          title: "Sent for approval",
          message: `${selectedPractice?.facility_name ?? "The facility"} will review this change. Your current schedule stays live until it is approved.`,
          type: "success",
        });
        return;
      }
      const result =
        publication?.settings ??
        (await saveMySchedulePreferences(
          supabase,
          selectedPracticeId,
          settings,
          version
        ));
      applySchedule(result);
      setConflict(null);
      await queryClient.invalidateQueries({ queryKey: ["my-doctor-schedule"] });
      await queryClient.invalidateQueries({
        queryKey: ["schedule-adjustments"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["schedule-busy-blocks"],
      });
      queryClient.setQueryData(
        ["my-doctor-schedule", selectedPracticeId],
        result
      );
      const active = publication?.settings.published_modes?.includes(mode);
      showToast({
        title: publication
          ? active
            ? "Schedule published"
            : "Schedule paused"
          : "Schedule saved",
        message: options.previewToken
          ? "Schedule saved. Conflicting availability was adjusted. Review the affected service schedules below."
          : publication
            ? active
              ? `Schedule published from ${formatDisplayDate(from)} for this practice and visit type. Existing appointments keep their times.`
              : "Future unbooked slots are withdrawn. Existing appointments keep their times."
            : "Publish after your practice is verified.",
        type: "success",
      });
    } catch (cause) {
      setConflict(null);
      // The facility now approves changes: refresh so the editor submits a request.
      if (scheduleErrorCode(cause) === "PT403")
        void queryClient.invalidateQueries({ queryKey: ["schedule-approval"] });
      showToast({
        title: "Could not publish schedule",
        message: scheduleErrorMessage(cause, "Try again."),
        type: "error",
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setPendingAction(null);
    }
  }

  async function save() {
    await persist();
  }
  function selectPractice(practice: ClinicPractice) {
    setConflict(null);
    setPracticeId(practice.practice_id);
    if (doctorId && practice.is_clinician && practice.verified)
      void setSelectedPracticeId(doctorId, practice.practice_id)
        .then(() =>
          queryClient.setQueryData(
            selectedPracticeQueryKey(doctorId),
            practice.practice_id
          )
        )
        .catch(() =>
          showToast({
            title: "Could not remember practice",
            type: "error",
          })
        );
  }
  return {
    selectPractice,
    queryClient,
    showScheduleHelp,
    hideScheduleHelp,
    showToast,
    doctorId,
    doctorProfile,
    zone,
    practices,
    setPracticeId,
    selectedPracticeId,
    selectedPractice,
    associationRequests,
    pendingAssociation,
    rejectedAssociation,
    saved,
    draft,
    busy,
    pendingAction,
    setEffectiveDate,
    today,
    startsFrom,
    dailyLimit,
    suggestion,
    suggestedTimes,
    offerSuggestion,
    applySuggestion,
    hasChanges: dirty.current,
    validate,
    // Null for a first schedule, which has no saved copy to compare with.
    changes: baseSettings.current
      ? draftChanges(draftFromSettings(baseSettings.current, mode), draft)
      : null,
    summary: draftSummary(draft, mode),
    startsFromLabel:
      startsFrom === today ? "today" : formatDisplayDate(startsFrom),
    update,
    save,
    conflict,
    approvalRequired,
    approvalChecking,
    scheduleRequest,
    withdrawRequest,
    busyBlocks: busyBlocks.data ?? [],
    busyOverlaps,
    batchingHints,
    remoteChanged,
    dismissConflict: () => setConflict(null),
    confirmConflict: (decision?: ScheduleConflictDecision) =>
      conflict?.can_replace || (decision && conflict?.can_request)
        ? persist({
            previewToken: conflict!.token,
            decision,
            effectiveFrom: conflict!.effective_from,
          })
        : Promise.resolve(),
    startFromSuggestedDate: (date: string) => {
      setConflict(null);
      setEffectiveDate(date);
      return persist({ effectiveFrom: date });
    },
  };
}
