import { autoBookingHelpItems } from "../utils/scheduleConstants";
import type { ScheduleScreenProps } from "../types/schedule-screen";
import { Switch, View } from "react-native";
import {
  Accordion,
  Button,
  ClockDurationPicker,
  Input,
  Loader,
  Skeleton,
} from "@startup/mobile-ui";
import { Calendar, Check } from "lucide-react-native";
import type { ClinicPractice } from "@startup/contracts";

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
import { AppointmentRecoveryPolicy } from "../components/AppointmentRecoveryPolicy";

import { ScheduleConflictDialog } from "../components/ScheduleConflictDialog";
import { ScheduleAdjustmentNotices } from "../components/ScheduleAdjustmentNotices";
import { ScheduleBusyBlocks } from "../components/ScheduleBusyBlocks";
import { ScheduleRequestNotice } from "../components/ScheduleRequestNotice";

export function ScheduleScreen({ mode }: ScheduleScreenProps) {
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
  const duration =
    mode === "online"
      ? draft.onlineDuration
      : mode === "home"
        ? draft.homeDuration
        : draft.duration;
  const capacity = draft.walkIn ?? 0;
  const appQuota = draft.clinicApp ?? capacity;
  const walkinQuota = draft.clinicWalkin ?? 0;
  const quotaExcess = appQuota + walkinQuota - capacity;
  const publishLabel = approvalRequired
    ? "Submit for approval"
    : selectedPractice?.verified
      ? "Publish Schedule"
      : "Save Schedule";
  const publishBar = (
    <>
      <Label variant="caption" muted>
        {approvalRequired
          ? `${selectedPractice?.facility_name ?? "Your facility"} reviews changes before they go live.`
          : `New appointment times apply from ${startsFromLabel}.`}
        {hasChanges ? " Unsaved changes." : ""}
      </Label>
      <Button
        loading={pendingAction === "save"}
        theme="doctor"
        label={publishLabel}
        leftIcon={<Calendar size={17} color="white" />}
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
        onPress={save}
      />
    </>
  );
  return (
    <DoctorScreen
      title={
        mode === "clinic"
          ? "Clinic Schedule"
          : mode === "online"
            ? "Online Schedule"
            : "Home Visit Schedule"
      }
      bottomNav={false}
      footer={publishBar}
    >
      {practices.isLoading ? (
        <Loader theme="doctor" style={{ minHeight: 40 }} />
      ) : null}
      {practices.data && practices.data.length > 1 ? (
        <ScheduleSection title="Your clinic">
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
      {showScheduleHelp ? (
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
      ) : null}
      {remoteChanged ? (
        <View accessibilityLiveRegion="polite">
          <Label muted>
            This schedule was updated in another app. Your edits are kept and
            will be merged with that update when you publish.
          </Label>
        </View>
      ) : null}
      <ScheduleAdjustmentNotices onSelectPractice={setPracticeId} />
      {approvalRequired && selectedPractice ? (
        <ScheduleRequestNotice
          request={scheduleRequest}
          facilityName={selectedPractice.facility_name}
          busy={busy}
          onWithdraw={(requestId) => void withdrawRequest(requestId)}
        />
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
      <ClinicHoursPanel
        title={
          mode === "clinic"
            ? "Clinic Hours"
            : mode === "online"
              ? "Online Hours"
              : "Home Visit Hours"
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
        <ClockDurationPicker
          label={
            mode === "home"
              ? "Home-visit slot duration"
              : "Consultation duration"
          }
          value={duration}
          min={mode === "home" ? 30 : 5}
          max={120}
          theme="doctor"
          disabled={busy}
          onChange={(value) =>
            update(
              mode === "online"
                ? { onlineDuration: value }
                : mode === "home"
                  ? { homeDuration: value }
                  : { duration: value }
            )
          }
        />
        <Label variant="caption" muted>
          Appointment times start every {duration} minutes within your hours.
        </Label>
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
            <NumberSetting
              title="Total clinic capacity"
              stepper
              disabled={busy}
              value={draft.walkIn}
              min={0}
              max={100}
              suffix="bookings"
              onChange={(walkIn) => update({ walkIn })}
            />
            <NumberSetting
              title="App booking quota"
              stepper
              disabled={busy}
              value={appQuota}
              min={0}
              max={100}
              suffix="bookings"
              onChange={(clinicApp) => update({ clinicApp })}
            />
            <NumberSetting
              title="Reception walk-in quota"
              stepper
              disabled={busy}
              value={walkinQuota}
              min={0}
              max={100}
              suffix="bookings"
              onChange={(clinicWalkin) => update({ clinicWalkin })}
            />
            <View accessibilityLiveRegion="polite">
              <Label
                variant="caption"
                muted={quotaExcess <= 0}
                style={quotaExcess > 0 ? { color: palette.danger } : undefined}
              >
                {appQuota} app + {walkinQuota} walk-in of {capacity}
                {quotaExcess > 0
                  ? ` · exceeds capacity by ${quotaExcess}`
                  : " · fits"}
                . Set a walk-in quota to accept reception registrations.
              </Label>
            </View>
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
        {mode !== "home" ? (
          <Label variant="caption" muted>
            Changing the daily limit does not change appointment times.
          </Label>
        ) : null}
      </ScheduleSection>

      {/* 3. Fee */}
      <ConsultationChargesPanel mode={mode} draft={draft} onUpdate={update} />

      <Accordion
        title="More options"
        subtitle={
          mode === "home"
            ? "Auto-accept, travel and start date"
            : "Auto-accept and start date"
        }
        theme="doctor"
        variant="outlined"
        contentStyle={{ gap: 16 }}
      >
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
            One daily limit shared across Clinic, Online and Home visits.
          </Label>
          {draft.autoAccept ? (
            <>
              <NumberSetting
                title="Shared daily auto-accept limit"
                stepper
                disabled={busy}
                value={draft.autoLimit}
                min={1}
                max={100}
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
            <ClockDurationPicker
              theme="doctor"
              label="Travel buffer before and after each block"
              value={draft.homeTravelBuffer ?? 0}
              min={0}
              max={180}
              disabled={busy}
              onChange={(homeTravelBuffer) => update({ homeTravelBuffer })}
            />
          </View>
        ) : null}
        {selectedPractice?.verified ? (
          <View style={{ gap: 8 }}>
            <Heading variant="label">Apply changes from</Heading>
            <Label variant="caption" muted>
              Existing appointments and pending requests keep their times. Daily
              booking limits apply when saved.
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
      {/* Saved separately from the schedule; it has its own save button. */}
      {selectedPracticeId && saved.data ? (
        <AppointmentRecoveryPolicy
          key={selectedPracticeId}
          practiceId={selectedPracticeId}
        />
      ) : null}
    </DoctorScreen>
  );
}
