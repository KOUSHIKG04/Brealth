"use client";

import { workingDayLabels } from "../utils/facilityDoctorScheduleEditorConstants";

import { ScheduleSection } from "./ScheduleSection";
import { NumberSetting } from "./NumberSetting";
import { DecimalSetting } from "./DecimalSetting";
import { ToggleSetting } from "./ToggleSetting";
import { HelpDialog } from "./HelpDialog";

import { useFacilityDoctorSchedule } from "../hooks/useFacilityDoctorSchedule";
import type { FacilityDoctorScheduleEditorProps } from "../types/facilityDoctorScheduleEditor";
import { CalendarDays, Check } from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import { Skeleton } from "@startup/web-ui/components/ui/skeleton";
import { Spinner } from "@startup/web-ui/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@startup/web-ui/components/ui/dialog";
import { ScheduleTimeBlocks } from "./ScheduleTimeBlocks";
import { AppointmentRecoveryPolicy } from "./AppointmentRecoveryPolicy";
import { ClockDurationPicker } from "./ClockDurationPicker";
import { UnavailableDatePicker } from "./UnavailableDatePicker";
import { card } from "../utils/facilityScheduleEditorConstants";
import { clinicTimeSlotCount } from "@startup/contracts";

import { ScheduleConflictDialog } from "./ScheduleConflictDialog";
import { ScheduleBusyBlocks } from "./ScheduleBusyBlocks";
import { ScheduleAdjustmentNotices } from "./ScheduleAdjustmentNotices";

export function FacilityDoctorScheduleEditor({
  practiceId,
  mode,
  onSelectMode,
  transition,
}: FacilityDoctorScheduleEditorProps) {
  const {
    schedule,
    result,
    saved,
    daysKey,
    startKey,
    endKey,
    durationKey,
    limitKey,
    publishable,
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
    busyBlocks,
    busyOverlaps,
    batchingHints,
    remoteChanged,
    dismissConflict,
    confirmConflict,
    startFromSuggestedDate,
  } = useFacilityDoctorSchedule({ practiceId, mode, transition });
  const blocksKey =
    mode === "clinic"
      ? "clinicTimeBlocks"
      : mode === "online"
        ? "onlineTimeBlocks"
        : "homeTimeBlocks";
  const timeBlocks = draft[blocksKey] ?? [
    { start: draft[startKey] ?? "09:00", end: draft[endKey] ?? "17:00" },
  ];
  const changeBlocks = (blocks: typeof timeBlocks) =>
    update({
      [blocksKey]: blocks,
      [startKey]: [...blocks].sort((a, b) => a.start.localeCompare(b.start))[0]
        .start,
      [endKey]: [...blocks].sort((a, b) => b.end.localeCompare(a.end))[0].end,
    });
  return (
    <div className="w-full max-w-full min-w-0 space-y-7 pb-4">
      <div className="space-y-1">
        <h1 className="text-foreground text-xl leading-7 font-semibold tracking-tight">
          {mode === "clinic"
            ? "Clinic Schedule"
            : mode === "online"
              ? "Online Schedule"
              : "Home Visit Schedule"}
        </h1>
        {result?.ok ? (
          <p className="text-sm text-[#475569]">{result.doctor.name}</p>
        ) : null}
      </div>
      <ScheduleAdjustmentNotices
        practiceId={practiceId}
        onSelectMode={onSelectMode}
      />
      <ScheduleConflictDialog
        preview={conflict}
        pending={pending}
        onClose={dismissConflict}
        onConfirm={confirmConflict}
        onStartFromSuggestedDate={startFromSuggestedDate}
      />
      {remoteChanged ? (
        <p className="text-muted-foreground text-sm" role="status">
          This schedule was updated in another app. Your edits are kept and will
          be merged with that update when you publish.
        </p>
      ) : null}
      {schedule.isPending ? (
        <div className={card} aria-label="Loading schedule">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : result?.ok ? (
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <ScheduleSection title="Working Days">
            <p className="text-muted-foreground text-sm leading-6">
              Select your working days.
            </p>
            <div className="grid grid-cols-7 gap-1.5 py-1">
              {workingDayLabels.map((day, index) => {
                const selected = serviceDays.includes(index + 1);
                return (
                  <button
                    key={day}
                    type="button"
                    role="checkbox"
                    aria-label={day}
                    aria-checked={selected}
                    disabled={pending}
                    onClick={() =>
                      update({
                        [daysKey]: selected
                          ? serviceDays.filter((value) => value !== index + 1)
                          : [...serviceDays, index + 1].sort((a, b) => a - b),
                      })
                    }
                    className={`flex h-11 min-w-0 items-center justify-center rounded-lg border text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008577] disabled:opacity-50 ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </ScheduleSection>
          <ScheduleSection
            title={
              mode === "clinic"
                ? "Clinic Hours"
                : mode === "online"
                  ? "Online Hours"
                  : "Home Visit Hours"
            }
          >
            <p className="text-muted-foreground text-sm leading-6">
              Add separate time blocks for these working days. Leave gaps for
              other appointment types or breaks.
            </p>
            <ScheduleTimeBlocks
              key={`${practiceId}:${mode}:${saved?.row_version ?? 0}`}
              initialBlocks={timeBlocks}
              end={draft[endKey] ?? "17:00"}
              pending={pending}
              onChange={changeBlocks}
            />
            <ScheduleBusyBlocks blocks={busyBlocks} overlaps={busyOverlaps} />
            {batchingHints.map((hint) => (
              <p key={hint} className="text-muted-foreground text-sm">
                Tip: {hint}
              </p>
            ))}
            {mode === "home" ? (
              <NumberSetting
                title="Travel buffer before and after each block"
                value={draft.homeTravelBufferMinutes ?? 0}
                min={0}
                max={180}
                suffix="min"
                disabled={pending}
                onChange={(value) => update({ homeTravelBufferMinutes: value })}
              />
            ) : null}
          </ScheduleSection>
          <AppointmentSlotSettings
            mode={mode}
            duration={duration}
            pending={pending}
            durationKey={durationKey}
            update={update}
            setAvailabilityDuration={setAvailabilityDuration}
            draft={draft}
            publishable={publishable}
            limitKey={limitKey}
            saved={saved}
            suggestion={suggestion}
            setSuggestedDuration={setSuggestedDuration}
          />
          <ScheduleAutoAcceptance
            mode={mode}
            draft={draft}
            publishable={publishable}
            pending={pending}
            update={update}
            setShowAutoBookingHelp={setShowAutoBookingHelp}
          />
          <HomeVisitSettings
            mode={mode}
            draft={draft}
            pending={pending}
            update={update}
          />{" "}
          <ScheduleSection title="Consultation Charges">
            <p className="text-muted-foreground text-sm leading-6">
              Set your appointment fee.
            </p>
            <div className="flex items-center justify-between gap-3 text-sm">
              <label htmlFor="consultation-fee">{feeLabel}</label>
              <div className="flex w-36 items-center gap-2">
                <span>₹</span>
                <DecimalSetting
                  id="consultation-fee"
                  label={`${feeLabel} charge in rupees`}
                  value={(fee ?? 0) / 100}
                  max={100000}
                  disabled={pending}
                  onChange={(value) =>
                    update({ [feeKey]: Math.round((value ?? 0) * 100) })
                  }
                />
              </div>
            </div>
          </ScheduleSection>
          <ScheduleSection title="Apply changes from">
            <p className="text-muted-foreground text-sm leading-6">
              New appointment times apply from this date. Existing appointments
              and pending requests keep their times. Daily booking limits apply
              when saved.
            </p>
            <UnavailableDatePicker
              value={startsFrom}
              onChange={setEffectiveDate}
              timeZone={zone ?? undefined}
              minDate={today}
              disabled={pending}
              label="Start date"
            />
          </ScheduleSection>
          <Button
            type="submit"
            disabled={pending || schedule.isFetching}
            className="min-h-11 w-full sm:w-auto"
          >
            {pending ? <Spinner /> : <CalendarDays size={17} />}
            Publish Schedule
          </Button>
        </form>
      ) : (
        <div className={card}>
          <p role="alert">
            {result && !result.ok ? result.error : "Could not load schedule."}
          </p>
          <Button variant="outline" onClick={() => void schedule.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <HelpDialog
        open={showScheduleHelp}
        title="Set your schedule"
        onClose={() => setShowScheduleHelp(false)}
      >
        <p>
          Choose working days, hours and the slot interval. Publishing creates
          the next 30 days automatically. The daily booking limit counts active
          bookings; patients can choose any available time within working hours.
          Auto-accept uses one shared daily limit across all services.
        </p>
      </HelpDialog>
      <HelpDialog
        open={showAutoBookingHelp}
        title="Automatic bookings"
        onClose={() => setShowAutoBookingHelp(false)}
      >
        <p>
          Up to {draft.autoAcceptLimit} bookings per day are auto-accepted
          across Clinic, Online and Home visits combined.
        </p>
        <div className="flex items-start gap-2">
          <Check size={16} className="mt-0.5 shrink-0 text-[#008577]" />
          <span>Bookings are accepted instantly under the limit.</span>
        </div>
        <div className="flex items-start gap-2">
          <Check size={16} className="mt-0.5 shrink-0 text-[#008577]" />
          <span>Bookings beyond the limit need manual approval.</span>
        </div>
      </HelpDialog>
      <HelpDialog
        open={availabilityDuration !== null}
        title="Automatic availability"
        onClose={() => setAvailabilityDuration(null)}
      >
        <p>
          When you publish, slots are created every {availabilityDuration}{" "}
          minutes on your selected working days. Unavailable time and existing
          appointments are respected.
        </p>
      </HelpDialog>
      <AppointmentRecoveryPolicy key={practiceId} practiceId={practiceId} />
      <Dialog
        open={suggestedDuration !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setSuggestedDuration(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white text-[#0f172a] sm:max-w-sm">
          <DialogTitle>Suggested consultation duration</DialogTitle>
          <DialogDescription>
            Based on your working hours and daily booking limit. Review this
            duration before publishing.
          </DialogDescription>
          <p className="text-lg font-semibold">
            {suggestedDuration} minutes per consultation
          </p>
          <p className="text-sm text-[#475569]">
            {suggestedTimes.length} appointment times within your hours, with up
            to {draft[limitKey]} bookings per day.
          </p>
          <p className="text-sm text-[#475569]">
            {suggestedTimes.slice(0, 4).join(" · ")}
            {suggestedTimes.length > 4 ? " …" : ""}
          </p>
          <p className="text-sm text-[#475569]">
            Later daily-limit changes will not recalculate it.
          </p>
          <Button
            type="button"
            onClick={() => {
              if (suggestedDuration === null) return;
              update({ [durationKey]: suggestedDuration });
              setSuggestedDuration(null);
            }}
          >
            Use this duration
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSuggestedDuration(null)}
          >
            Keep current duration
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ScheduleEditor = ReturnType<typeof useFacilityDoctorSchedule>;

function AppointmentSlotSettings({
  mode,
  duration,
  pending,
  durationKey,
  update,
  setAvailabilityDuration,
  draft,
  publishable,
  limitKey,
  saved,
  suggestion,
  setSuggestedDuration,
}: Pick<
  ScheduleEditor,
  | "duration"
  | "pending"
  | "durationKey"
  | "update"
  | "setAvailabilityDuration"
  | "draft"
  | "publishable"
  | "limitKey"
  | "saved"
  | "suggestion"
  | "setSuggestedDuration"
> &
  Pick<FacilityDoctorScheduleEditorProps, "mode">) {
  const timeSlots = clinicTimeSlotCount(
    draft.clinicTimeBlocks ?? [
      { start: draft.clinicStart, end: draft.clinicEnd },
    ],
    draft.slotMinutes
  );
  return (
    <ScheduleSection title="Appointment slots">
      <p className="text-muted-foreground text-sm leading-6">
        {mode === "home"
          ? "Set your visit duration."
          : "Duration sets appointment times. The daily limit caps bookings."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ClockDurationPicker
          label={
            mode === "home"
              ? "Home-visit slot duration"
              : "Consultation duration"
          }
          value={duration}
          min={mode === "home" ? 30 : 5}
          max={120}
          disabled={pending}
          onChange={(minutes) => {
            update({ [durationKey]: minutes });
            setAvailabilityDuration(minutes);
          }}
        />
        {mode === "online" ? (
          <NumberSetting
            title="Daily booking limit"
            value={draft[limitKey]}
            min={0}
            max={100}
            suffix="bookings"
            disabled={pending}
            onChange={(value) => update({ [limitKey]: value })}
          />
        ) : null}
      </div>
      {mode === "clinic" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="text-sm font-medium sm:col-span-2">
            Time slots a day: {timeSlots}
          </p>
          <NumberSetting
            title="App booking slots"
            value={publishable.clinicAppDailyLimit ?? 0}
            min={0}
            max={timeSlots}
            suffix="slots"
            disabled={pending}
            onChange={(clinicAppDailyLimit) => update({ clinicAppDailyLimit })}
          />
          <NumberSetting
            title="Walk-in limit"
            value={publishable.clinicWalkinDailyLimit ?? 0}
            min={0}
            max={timeSlots - (publishable.clinicAppDailyLimit ?? 0)}
            suffix="walk-ins"
            disabled={pending}
            onChange={(clinicWalkinDailyLimit) =>
              update({ clinicWalkinDailyLimit })
            }
          />
          <p className="text-muted-foreground text-sm sm:col-span-2">
            Patients book app slots at set times; when they are all taken, the
            app shows booking closed for that day. Reception registers each
            walk-in into the next free time, in order from the start of clinic
            hours. App slots and walk-ins share the day&apos;s time slots.
          </p>
        </div>
      ) : null}
      {mode !== "home" ? (
        <>
          {mode === "online" ? (
            <p className="text-muted-foreground text-sm leading-6">
              Changing the daily limit does not change appointment times.
            </p>
          ) : null}
          {!saved?.published_modes?.includes(mode) ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm leading-6">
                Preview a duration based on your hours and daily limit.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={pending || suggestion === null}
                onClick={() => setSuggestedDuration(suggestion)}
              >
                Suggest duration
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </ScheduleSection>
  );
}

function ScheduleAutoAcceptance({
  mode,
  draft,
  publishable,
  pending,
  update,
  setShowAutoBookingHelp,
}: Pick<
  ScheduleEditor,
  "draft" | "publishable" | "pending" | "update" | "setShowAutoBookingHelp"
> &
  Pick<FacilityDoctorScheduleEditorProps, "mode">) {
  // In-person auto-accept stays within the app booking slots.
  const max =
    mode === "clinic" ? Math.max(1, publishable.clinicAppDailyLimit ?? 0) : 100;
  return (
    <ScheduleSection title="Auto Accept Bookings">
      <ToggleSetting
        title="Enable automatic acceptance"
        checked={draft.autoAccept}
        disabled={pending}
        onChange={(checked) =>
          update({
            autoAccept: checked,
            autoAcceptLimit: checked ? Math.max(1, draft.autoAcceptLimit) : 0,
          })
        }
      />
      <p className="text-muted-foreground text-sm leading-6">
        Set your daily auto-booking limit.
      </p>
      {draft.autoAccept ? (
        <>
          <NumberSetting
            title="Shared daily auto-accept limit"
            value={
              mode === "clinic"
                ? publishable.autoAcceptLimit
                : draft.autoAcceptLimit
            }
            min={1}
            max={max}
            suffix="bookings"
            disabled={pending}
            onChange={(value) => update({ autoAcceptLimit: value })}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setShowAutoBookingHelp(true)}
          >
            Set auto-booking limit
          </Button>
        </>
      ) : null}
    </ScheduleSection>
  );
}

function HomeVisitSettings({
  mode,
  draft,
  pending,
  update,
}: Pick<ScheduleEditor, "draft" | "pending" | "update"> &
  Pick<FacilityDoctorScheduleEditorProps, "mode">) {
  return (
    <>
      {mode === "home" ? (
        <ScheduleSection title="Home Visit Appointments">
          <ToggleSetting
            title="Enable home visits"
            checked={draft.homeVisits}
            disabled={pending}
            onChange={(homeVisits) => update({ homeVisits })}
          />
          <p className="text-muted-foreground text-sm leading-6">
            Set your home-visit travel radius.
          </p>
          {draft.homeVisits ? (
            <div className="space-y-2">
              <label
                htmlFor="home-radius"
                className="block text-sm font-medium"
              >
                Travel radius from practice (km)
              </label>
              <DecimalSetting
                id="home-radius"
                label="Home visit travel radius in kilometres"
                value={draft.homeRadiusKm}
                max={9999.99}
                nullable
                disabled={pending}
                onChange={(homeRadiusKm) => update({ homeRadiusKm })}
              />
            </div>
          ) : null}
        </ScheduleSection>
      ) : null}
    </>
  );
}
