import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ShiftRotationEditor } from "../components/ShiftRotationEditor";
import { AppDialog, Loader } from "@startup/mobile-ui";
import { Choice, DoctorScreen, Label } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
import { ScheduleScreen } from "./ScheduleScreen";
import { ScheduleSection } from "../components/ScheduleSection";
import { ScheduleModeSelector } from "../components/ScheduleModeSelector";
import { ScheduleAdjustmentNotices } from "../components/ScheduleAdjustmentNotices";
import { ScheduleWeekChart } from "../components/ScheduleWeekChart";
import { UnavailableTimeManager } from "../components/UnavailableTimeManager";
import { AppointmentRecoveryPolicy } from "../components/AppointmentRecoveryPolicy";
import { useScheduleOverview } from "../hooks/useScheduleOverview";
import { useShiftRotationServices } from "../hooks/useShiftPlan";
import { scheduleServices, workplaceCopy } from "../utils/scheduleConstants";
import type { ScheduleMode } from "../types/schedule-overview";

const isMode = (value: unknown): value is ScheduleMode =>
  value === "clinic" || value === "online" || value === "home";

/**
 * One Manage Schedule page: pick one or more services and each one's editor
 * opens below, in the order chosen, each with its own publish bar. The week
 * at a glance, time off and the appointment recovery policy follow.
 */
export function ManageScheduleScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const requested = isMode(params.mode) ? params.mode : null;
  const [modes, setModes] = useState<ScheduleMode[]>([requested ?? "clinic"]);
  // A link such as a schedule notice opens that service too.
  const open = useCallback(
    (mode: ScheduleMode) =>
      setModes((current) =>
        current.includes(mode) ? current : [...current, mode]
      ),
    []
  );
  useEffect(() => {
    if (requested) open(requested);
  }, [requested, open]);
  const dirty = useRef<Partial<Record<ScheduleMode, boolean>>>({});
  const [closing, setClosing] = useState<ScheduleMode | null>(null);
  const close = (mode: ScheduleMode) => {
    dirty.current[mode] = false;
    setModes((current) => current.filter((item) => item !== mode));
  };
  const toggle = (mode: ScheduleMode) => {
    if (!modes.includes(mode)) open(mode);
    else if (dirty.current[mode]) setClosing(mode);
    else close(mode);
  };
  const changeHandlers = useRef(
    Object.fromEntries(
      (["clinic", "online", "home"] as const).map((mode) => [
        mode,
        (hasChanges: boolean) => {
          dirty.current[mode] = hasChanges;
        },
      ])
    ) as Record<ScheduleMode, (hasChanges: boolean) => void>
  );
  const {
    practices,
    availablePractices,
    practiceId,
    selectedPractice,
    selectPractice,
    setPractice,
    saved,
    services,
    week,
  } = useScheduleOverview();
  // Each service follows a weekly pattern or a shift rotation.
  const hasRotation = useShiftRotationServices(practiceId ?? null);
  const [kinds, setKinds] = useState<
    Partial<Record<ScheduleMode, "weekly" | "rotation">>
  >({});
  const kindOf = (mode: ScheduleMode) =>
    kinds[mode] ?? (hasRotation(mode) ? "rotation" : "weekly");
  const serviceTitle = (mode: ScheduleMode) =>
    mode === "clinic"
      ? workplaceCopy[selectedPractice?.facility_kind ?? "unknown"].schedule
      : mode === "online"
        ? "Online Schedule"
        : "Home Visit Schedule";
  const weekSummary = scheduleServices
    .map(({ short, mode }) =>
      services[mode].summary ? `${short}: ${services[mode].summary}` : null
    )
    .filter(Boolean)
    .join(". ");
  return (
    <DoctorScreen title="Manage Schedule" background={palette.subtle}>
      {practices.isLoading ? (
        <Loader theme="doctor" style={{ minHeight: 40 }} />
      ) : null}
      {availablePractices && availablePractices.length > 1 ? (
        <ScheduleSection title="Your workplace">
          <View style={ui.wrap}>
            {availablePractices.map((practice) => (
              <Choice
                key={practice.practice_id}
                label={practice.facility_name}
                selected={practiceId === practice.practice_id}
                onPress={() => selectPractice(practice)}
              />
            ))}
          </View>
        </ScheduleSection>
      ) : null}
      {selectedPractice ? (
        <Label muted>
          {selectedPractice.facility_name}
          {selectedPractice.verified ? "" : " · awaiting verification"}
        </Label>
      ) : null}
      <ScheduleAdjustmentNotices
        onSelectPractice={setPractice}
        onSelectMode={open}
      />
      <ScheduleModeSelector
        modes={modes}
        services={practiceId && saved.data ? services : undefined}
        onToggle={toggle}
      />
      {modes.map((mode, index) => (
        <View key={mode} style={{ gap: 12 }}>
          <View style={ui.wrap}>
            <Choice
              label="Same every week"
              selected={kindOf(mode) === "weekly"}
              onPress={() => setKinds({ ...kinds, [mode]: "weekly" })}
            />
            <Choice
              label="Shift rotation"
              selected={kindOf(mode) === "rotation"}
              onPress={() => setKinds({ ...kinds, [mode]: "rotation" })}
            />
          </View>
          {kindOf(mode) === "rotation" ? (
            <ShiftRotationEditor
              key={`${practiceId}:${mode}`}
              practiceId={practiceId ?? null}
              mode={mode}
              title={serviceTitle(mode)}
              facilityName={selectedPractice?.facility_name}
            />
          ) : (
            <ScheduleScreen
              mode={mode}
              embedded
              showHelp={index === 0}
              onChangesChange={changeHandlers.current[mode]}
            />
          )}
        </View>
      ))}
      {practiceId && saved.data && !saved.isError ? (
        <ScheduleWeekChart chart={week} summary={weekSummary} />
      ) : null}
      <UnavailableTimeManager practiceId={practiceId} />
      {/* Saved separately from the service schedules, with its own save. */}
      {practiceId && saved.data ? (
        <AppointmentRecoveryPolicy key={practiceId} practiceId={practiceId} />
      ) : null}
      {!practices.isLoading && !selectedPractice ? (
        <Label muted>
          {practices.isError
            ? "Could not load your practices. Reopen this screen and try again."
            : "An active clinic or hospital association is required before you can set a schedule."}
        </Label>
      ) : null}
      <AppDialog
        theme="doctor"
        visible={closing !== null}
        title="Discard changes?"
        description="This service has unpublished edits. Closing it discards them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          if (closing) close(closing);
          setClosing(null);
        }}
        onClose={() => setClosing(null)}
      />
    </DoctorScreen>
  );
}
