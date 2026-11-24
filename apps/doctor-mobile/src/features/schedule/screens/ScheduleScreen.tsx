import { useEffect, useState } from "react";
import {
  autoBookingHelpItems,
  durationPresets,
  workplaceCopy,
} from "../utils/scheduleConstants";
import {
  appointmentsPerDay,
  clinicTimeSlots,
  normalizeDraft,
} from "../utils/scheduleOverview";
import { ClinicCapacityBar } from "../components/ClinicCapacityBar";
import type { ScheduleScreenProps } from "../types/schedule-screen";
import { Switch, View } from "react-native";
import {
  Accordion,
  AppDialog,
  Button,
  Chip,
  ClockDurationPicker,
  Input,
  Loader,
  Skeleton,
} from "@startup/mobile-ui";
import { Check } from "lucide-react-native";
import {
  formatDisplayDate,
  maxTravelBufferMinutes,
  type ClinicPractice,
} from "@startup/contracts";

import {
  Choice,
  DoctorScreen,
  Heading,
  Label,
  Panel,
} from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
import { DatePicker } from "../../../components/DatePicker";
import { ConsultationChargesPanel } from "../components/ConsultationChargesPanel";
import { ScheduleSection } from "../components/ScheduleSection";
import { WorkingDaysPanel } from "../components/WorkingDaysPanel";
import { ClinicHoursPanel } from "../components/ClinicHoursPanel";
import { NumberSetting } from "../components/NumberSetting";
import { useScheduleEditor } from "../hooks/useScheduleEditor";
import { useDiscardChangesPrompt } from "../hooks/useDiscardChangesPrompt";
import { SchedulePublishBar } from "../components/SchedulePublishBar";

import { ScheduleConflictDialog } from "../components/ScheduleConflictDialog";
import { ScheduleAdjustmentNotices } from "../components/ScheduleAdjustmentNotices";
import { ScheduleBusyBlocks } from "../components/ScheduleBusyBlocks";
import { ScheduleRequestDialog } from "../components/ScheduleRequestDialog";

export function ScheduleScreen({
  mode,
  embedded = false,
  showHelp = true,
  onChangesChange,
  overview,
}: ScheduleScreenProps) {
  const {
    selectPractice,
    setPracticeId,
    showScheduleHelp,
    hideScheduleHelp,
    doctorProfile,
    zone,
    practices,
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
    startsFromLabel,
    hasChanges,
    validate,
    changes,
    summary,
    suggestion,
    suggestedTimes,
    offerSuggestion,
    applySuggestion,
    update,
    save,
    conflict,
    approvalRequired,
    approvalChecking,
    scheduleRequest,
    withdrawRequest,
    busyBlocks,
    busyOverlaps,
    batchingHints,
    remoteChanged,
    dismissConflict,
    confirmConflict,
    startFromSuggestedDate,
  } = useScheduleEditor({ mode });
  const workplace = workplaceCopy[selectedPractice?.facility_kind ?? "unknown"];
  const duration =
    mode === "online"
      ? draft.onlineDuration
      : mode === "home"
        ? draft.homeDuration
        : draft.duration;
  const setDuration = (value: number) =>
    update(
      mode === "online"
        ? { onlineDuration: value }
        : mode === "home"
          ? { homeDuration: value }
          : { duration: value }
    );
  const presets: readonly number[] = durationPresets[mode];
  // Custom opens for a saved length that is not one of the quick choices.
  const [customChosen, setCustomDuration] = useState(false);
  const customDuration = customChosen || !presets.includes(duration);
  const perDay = appointmentsPerDay(
    draft.timeBlocks ?? [{ start: draft.start, end: draft.end }],
    duration,
    mode === "home" ? (draft.homeTravelBuffer ?? 0) : 0
  );
  const maxBuffer =
    mode === "home"
      ? maxTravelBufferMinutes(
          draft.timeBlocks ?? [{ start: draft.start, end: draft.end }]
        )
      : 180;
  // In-person capacity is every appointment time a day: app quota + walk-ins.
  const clinicSplit = normalizeDraft(draft, "clinic");
  const totalSlots = clinicTimeSlots(draft);
  const appQuota = clinicSplit.clinicApp ?? totalSlots;
  const walkinQuota = clinicSplit.clinicWalkin ?? 0;
  const [requestOpen, setRequestOpen] = useState(false);
  // Request the doctor chose to edit; a newer pending request locks again.
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const pendingRequest =
    approvalRequired && scheduleRequest?.status === "pending"
      ? scheduleRequest
      : undefined;
  const locked = Boolean(
    pendingRequest && editingRequestId !== pendingRequest.id
  );
  const publishLabel = approvalRequired
    ? "Submit for approval"
    : selectedPractice?.verified
      ? "Publish Schedule"
      : "Save Schedule";
  // Embedded editors share one page; the page asks before discarding them.
  const leavePrompt = useDiscardChangesPrompt(embedded ? false : hasChanges);
  useEffect(() => {
    onChangesChange?.(hasChanges);
  }, [hasChanges, onChangesChange]);
  const title =
    mode === "clinic"
      ? workplace.schedule
      : mode === "online"
        ? "Online Schedule"
        : "Home Visit Schedule";
  const lockedStyle = {
    pointerEvents: locked ? ("none" as const) : ("auto" as const),
    accessibilityState: { disabled: locked },
    style: { gap: 16, opacity: locked ? 0.6 : 1 },
  };
  // In-person auto-accept stays within the app booking slots.
  const autoLimitMax = mode === "clinic" ? Math.max(1, appQuota) : 100;
  const autoAcceptSettings = (
    <View style={{ gap: 8 }}>
      <View style={ui.between}>
        <Label>Auto-accept bookings</Label>
        <Switch
          accessibilityLabel="Auto Accept Bookings"
          value={draft.autoAccept}
          onValueChange={(autoAccept) => update({ autoAccept })}
          trackColor={{ false: "#D1D5DB", true: palette.primary }}
        />
      </View>
      <Label variant="caption" muted>
        {mode === "clinic"
          ? "Accepts app bookings automatically, up to your app booking slots. The limit is shared with Online and Home visits."
          : "One daily limit shared across Clinic, Online and Home visits."}
      </Label>
      {draft.autoAccept ? (
        <>
          <NumberSetting
            title="Shared daily auto-accept limit"
            stepper
            disabled={busy}
            value={mode === "clinic" ? clinicSplit.autoLimit : draft.autoLimit}
            min={1}
            max={autoLimitMax}
            suffix="bookings"
            onChange={(autoLimit) => update({ autoLimit })}
          />
          {autoBookingHelpItems.map((text) => (
            <View key={text} style={ui.row}>
              <Check size={14} color={palette.primary} />
              <Label variant="caption" muted style={{ flex: 1 }}>
                {text}
              </Label>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
  const publishBar = (
    <SchedulePublishBar
      key={`${selectedPracticeId}:${mode}`}
      publishLabel={publishLabel}
      approvalFacility={
        approvalRequired
          ? (selectedPractice?.facility_name ?? "Your facility")
          : undefined
      }
      startsFromLabel={startsFromLabel}
      hasChanges={hasChanges}
      changes={changes}
      summary={summary}
      pausesService={mode === "home" && !draft.homeVisits}
      loading={pendingAction === "save"}
      disabled={
        busy ||
        approvalChecking ||
        practices.isFetching ||
        saved.isFetching ||
        saved.isError ||
        !zone ||
        doctorProfile.isError ||
        !selectedPracticeId
      }
      validate={validate}
      onPublish={save}
      pending={locked}
      approvedLabel={
        approvalRequired && scheduleRequest?.status === "approved"
          ? `${selectedPractice?.facility_name ?? "Your facility"} approved this schedule on ${formatDisplayDate(scheduleRequest.decided_at ?? scheduleRequest.created_at)}.`
          : undefined
      }
      onShowRequest={() => setRequestOpen(true)}
      onEdit={() => setEditingRequestId(pendingRequest?.id ?? null)}
    />
  );
  const helpPanel =
    showScheduleHelp && showHelp ? (
      <Panel style={{ gap: 8 }}>
        <Label variant="label">How your schedule works</Label>
        <Label variant="caption" muted>
          Choose your days and hours, then the appointment length. Publishing
          creates the next 30 days of appointment times; unavailable time and
          existing appointments are respected.
        </Label>
        <Button
          theme="doctor"
          variant="ghost"
          label="Got it"
          onPress={hideScheduleHelp}
        />
      </Panel>
    ) : null;
  const content = (
    <>
      {embedded ? null : (
        <>
          {practices.isLoading ? (
            <Loader theme="doctor" style={{ minHeight: 40 }} />
          ) : null}
          {practices.data && practices.data.length > 1 ? (
            <ScheduleSection title="Your workplace">
              <Label variant="caption" muted>
                Select your clinic or hospital.
              </Label>
              <View style={ui.wrap}>
                {(practices.data as ClinicPractice[]).map(
                  (practice: ClinicPractice) => (
                    <Choice
                      key={practice.practice_id}
                      label={practice.facility_name}
                      selected={selectedPracticeId === practice.practice_id}
                      onPress={() => selectPractice(practice)}
                    />
                  )
                )}
              </View>
            </ScheduleSection>
          ) : null}
          {selectedPractice ? (
            <Label muted>
              {selectedPractice.facility_name}
              {selectedPractice.verified ? "" : " · awaiting verification"}
            </Label>
          ) : null}
          {helpPanel}
        </>
      )}
      {remoteChanged ? (
        <View accessibilityLiveRegion="polite">
          <Label muted>
            This schedule was updated in another app. Your edits are kept and
            will be merged with that update when you publish.
          </Label>
        </View>
      ) : null}
      {embedded ? null : (
        <ScheduleAdjustmentNotices onSelectPractice={setPracticeId} />
      )}
      {approvalRequired && selectedPractice ? (
        <ScheduleRequestDialog
          visible={requestOpen}
          request={scheduleRequest}
          facilityName={selectedPractice.facility_name}
          busy={busy}
          onClose={() => setRequestOpen(false)}
          onWithdraw={(requestId) => void withdrawRequest(requestId)}
          onEdit={() => setEditingRequestId(pendingRequest?.id ?? null)}
        />
      ) : null}
      {approvalRequired && scheduleRequest?.status === "rejected" ? (
        <Label style={{ color: palette.danger }}>
          {selectedPractice?.facility_name ?? "Your facility"} declined your
          last request
          {scheduleRequest.decision_reason
            ? `: ${scheduleRequest.decision_reason}`
            : "."}
        </Label>
      ) : null}
      {approvalRequired && scheduleRequest?.status === "stale" ? (
        <Label style={{ color: palette.danger }}>
          {selectedPractice?.facility_name ?? "Your facility"} changed this
          schedule after your request. Review the current hours and submit
          again.
        </Label>
      ) : null}
      {pendingRequest && editingRequestId === pendingRequest.id ? (
        <Label variant="caption" muted>
          Editing your pending request. Submitting again replaces it.
        </Label>
      ) : null}
      <ScheduleConflictDialog
        preview={conflict}
        busy={busy}
        onClose={dismissConflict}
        onConfirm={confirmConflict}
        onStartFromSuggestedDate={startFromSuggestedDate}
      />
      {saved.isLoading ? (
        <Skeleton theme="doctor" height={72} radius={12} />
      ) : null}

      {/* 1. When you're available */}
      <View {...lockedStyle}>
        <WorkingDaysPanel
          selectedDays={draft.days}
          onToggleDay={(index) =>
            update({
              days: draft.days.includes(index)
                ? draft.days.filter((d) => d !== index)
                : [...draft.days, index],
            })
          }
        />
      </View>
      <View {...lockedStyle}>
        <ClinicHoursPanel
          title={
            mode === "clinic"
              ? workplace.hours
              : mode === "online"
                ? "Online hours"
                : "Home-visit hours"
          }
          start={draft.start}
          end={draft.end}
          blocks={draft.timeBlocks}
          disabled={busy}
          onUpdate={update}
        />
        <ScheduleBusyBlocks blocks={busyBlocks} overlaps={busyOverlaps} />
        {batchingHints.map((hint) => (
          <Label variant="caption" key={hint} muted>
            Tip: {hint}
          </Label>
        ))}

        {/* 2. Appointments */}
        <ScheduleSection title="Appointments">
          <View style={{ gap: 8 }}>
            <Label variant="label">
              {mode === "home" ? "Visit length" : "Appointment length"}
            </Label>
            <View style={ui.wrap}>
              {presets.map((value) => (
                <Chip
                  key={value}
                  theme="doctor"
                  variant="radio"
                  label={`${value} min`}
                  selected={!customDuration && duration === value}
                  disabled={busy}
                  onPress={() => {
                    setCustomDuration(false);
                    setDuration(value);
                  }}
                />
              ))}
              <Chip
                theme="doctor"
                variant="radio"
                label="Custom"
                selected={customDuration}
                disabled={busy}
                onPress={() => setCustomDuration(true)}
              />
            </View>
            {customDuration ? (
              <ClockDurationPicker
                label={mode === "home" ? "Visit length" : "Appointment length"}
                value={duration}
                min={mode === "home" ? 30 : 5}
                max={120}
                theme="doctor"
                disabled={busy}
                onChange={setDuration}
              />
            ) : null}
            <Label variant="caption" muted>
              {perDay} appointment {perDay === 1 ? "time" : "times"} a day,
              every{" "}
              {duration + (mode === "home" ? (draft.homeTravelBuffer ?? 0) : 0)}{" "}
              min
            </Label>
          </View>
          {offerSuggestion ? (
            <View style={[ui.between, { flexWrap: "wrap" }]}>
              <Label variant="caption" muted style={{ flex: 1, minWidth: 160 }}>
                {suggestion} minutes fits {suggestedTimes.length} appointment
                times in your hours.
              </Label>
              <Button
                theme="doctor"
                variant="outline"
                label={`Use ${suggestion} min`}
                disabled={busy}
                onPress={applySuggestion}
              />
            </View>
          ) : null}
          {mode === "online" ? (
            <NumberSetting
              title="Daily booking limit"
              stepper
              disabled={busy}
              value={draft.online}
              min={0}
              max={100}
              suffix="bookings"
              onChange={(online) => update({ online })}
            />
          ) : null}
          {mode === "clinic" ? (
            <View style={{ gap: 12 }}>
              <View style={ui.between}>
                <Label variant="label">Time slots a day</Label>
                <Label variant="label">{totalSlots}</Label>
              </View>
              {perDay > totalSlots ? (
                <Label variant="caption" muted>
                  Your hours fit {perDay} times; up to {totalSlots} can be
                  booked a day.
                </Label>
              ) : null}
              <NumberSetting
                title="App booking slots"
                stepper
                disabled={busy}
                value={appQuota}
                min={0}
                max={totalSlots}
                suffix="slots"
                hint="Patients book these times in the app. When they are all taken, the app shows booking closed for that day."
                onChange={(clinicApp) => update({ clinicApp })}
              />
              <NumberSetting
                title="Walk-in limit"
                stepper
                disabled={busy}
                value={walkinQuota}
                min={0}
                max={totalSlots - appQuota}
                suffix="walk-ins"
                hint="Reception registers walk-ins into the next free time, in order from the start of your hours. App-booked times are kept for those patients."
                onChange={(clinicWalkin) => update({ clinicWalkin })}
              />
              <ClinicCapacityBar app={appQuota} walkin={walkinQuota} />
              {autoAcceptSettings}
            </View>
          ) : null}
          {mode === "home" ? (
            <View style={ui.between}>
              <Label>Accept home visits</Label>
              <Switch
                accessibilityLabel="Home Visit Appointments"
                value={draft.homeVisits}
                onValueChange={(homeVisits) => update({ homeVisits })}
                trackColor={{ false: "#D1D5DB", true: palette.primary }}
              />
            </View>
          ) : null}
          {mode === "online" ? (
            <Label variant="caption" muted>
              Changing the daily limit does not change appointment times.
            </Label>
          ) : null}
        </ScheduleSection>

        {/* 3. Fee */}
        <ConsultationChargesPanel
          mode={mode}
          inPersonTitle={workplace.visitFee}
          draft={draft}
          onUpdate={update}
        />

        <Accordion
          title="More options"
          subtitle={
            mode === "home"
              ? "Auto-accept, travel and start date"
              : mode === "clinic"
                ? "Start date"
                : "Auto-accept and start date"
          }
          theme="doctor"
          variant="outlined"
          contentStyle={{ gap: 16 }}
        >
          {mode !== "clinic" ? autoAcceptSettings : null}
          {mode === "home" ? (
            <View style={{ gap: 12 }}>
              {draft.homeVisits ? (
                <Input
                  label="Travel radius from practice (km)"
                  accessibilityLabel="Home visit travel radius in kilometres"
                  value={draft.homeRadius}
                  onChangeText={(homeRadius) => update({ homeRadius })}
                  keyboardType="decimal-pad"
                />
              ) : null}
              <NumberSetting
                title="Travel buffer before and after each block"
                stepper
                step={5}
                disabled={busy}
                value={draft.homeTravelBuffer ?? 0}
                min={0}
                max={maxBuffer}
                suffix="minutes"
                hint={
                  maxBuffer === 0
                    ? "No buffer fits: your home-visit hours reach midnight or blocks touch. Leave a gap to add travel time."
                    : `Up to ${maxBuffer} min fits your home-visit hours.`
                }
                onChange={(homeTravelBuffer) => update({ homeTravelBuffer })}
              />
            </View>
          ) : null}
          {selectedPractice?.verified ? (
            <View style={{ gap: 8 }}>
              <Heading variant="label">Apply changes from</Heading>
              <Label variant="caption" muted>
                Existing appointments and pending requests keep their times.
                Daily booking limits apply when saved.
              </Label>
              <DatePicker
                key={`${selectedPracticeId}:${mode}`}
                value={startsFrom}
                onChange={setEffectiveDate}
                timeZone={zone}
                minDate={today}
                disabled={busy}
                label="Start date"
              />
            </View>
          ) : null}
        </Accordion>
      </View>
      {overview}

      {embedded ? null : (
        <>
          {!selectedPracticeId && associationRequests.isLoading ? (
            <Loader theme="doctor" style={{ minHeight: 40 }} />
          ) : null}
          {!practices.isLoading &&
          !associationRequests.isLoading &&
          !selectedPracticeId ? (
            <Label muted>
              {pendingAssociation
                ? `${pendingAssociation.facility_name} must accept your doctor association in its Doctor Management portal before you can save a schedule.`
                : rejectedAssociation
                  ? `Your association with ${rejectedAssociation.facility_name} was declined. Update your facility request before saving a schedule.`
                  : practices.isError || associationRequests.isError
                    ? "Could not load your practice status. Reopen this screen and try again."
                    : "An active clinic or hospital association is required before you can save a schedule."}
            </Label>
          ) : null}
          <AppDialog
            theme="doctor"
            visible={leavePrompt.visible}
            title="Discard changes?"
            description="Your schedule edits are not published. If you leave now, they are lost."
            confirmLabel="Discard changes"
            cancelLabel="Keep editing"
            onConfirm={leavePrompt.discard}
            onClose={leavePrompt.keepEditing}
          />
        </>
      )}
    </>
  );
  if (embedded)
    return (
      <View style={{ gap: 16 }}>
        <Heading>{title}</Heading>
        {helpPanel}
        {content}
        <Panel style={{ gap: 8 }}>{publishBar}</Panel>
      </View>
    );
  return (
    <DoctorScreen
      title={title}
      background={palette.subtle}
      bottomNav={false}
      footer={publishBar}
    >
      {content}
    </DoctorScreen>
  );
}
