import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, ClockTimePicker, Input, Loader } from "@startup/mobile-ui";
import {
  defaultShiftPlan,
  defaultShiftTemplates,
  formatDisplayDate,
  maxRotationWeeks,
  maxShiftTemplates,
  shiftEndLabel as clockAfter,
  shiftPlanDraftProblem,
  shiftPreview,
  shiftWeekdayLabels,
  type ShiftPlanInput,
  type ShiftTemplate,
} from "@startup/contracts";
import {
  Choice,
  Heading,
  Label,
  Panel,
} from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
import { DatePicker } from "../../../components/DatePicker";
import { NumberSetting } from "./NumberSetting";
import { ScheduleSection } from "./ScheduleSection";
import { useShiftPlan } from "../hooks/useShiftPlan";
import type { ShiftRotationEditorProps } from "../types/shift-rotation-editor";

type Draft = ShiftPlanInput & { effectiveFrom: string };

/**
 * Shift rotation for one service: named shifts (overnight and up to 28 hours),
 * a rotation of 1-8 weeks, single-date changes, a start date and a preview.
 */
export function ShiftRotationEditor({
  practiceId,
  mode,
  title,
  facilityName,
}: ShiftRotationEditorProps) {
  const plan = useShiftPlan(practiceId, mode);
  const source = plan.pending ?? plan.active;
  const [edits, setEdits] = useState<Draft | null>(null);
  const [overrideDate, setOverrideDate] = useState("");
  const [endFrom, setEndFrom] = useState("");
  const tomorrow = new Date(`${plan.today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const firstDay = tomorrow.toISOString().slice(0, 10);
  const base: Draft = source
    ? {
        templates: source.templates,
        cycle_start: source.cycle_start,
        cycle_weeks: source.cycle_weeks,
        rotation: source.rotation,
        overrides: source.overrides,
        effectiveFrom:
          source.effective_from >= firstDay ? source.effective_from : firstDay,
      }
    : { ...defaultShiftPlan(mode, firstDay), effectiveFrom: firstDay };
  const draft = edits ?? base;
  const update = (changes: Partial<Draft>) =>
    setEdits({ ...draft, ...changes });
  const setShift = (index: number, changes: Partial<ShiftTemplate>) =>
    update({
      templates: draft.templates.map((shift, i) =>
        i === index ? { ...shift, ...changes } : shift
      ),
    });
  const removeShift = (key: string) =>
    update({
      templates: draft.templates.filter((shift) => shift.key !== key),
      rotation: draft.rotation.map((week) =>
        week.map((day) => (day === key ? null : day))
      ),
      overrides: draft.overrides.filter((item) => item.key !== key),
    });
  const addShift = () => {
    const used = new Set(draft.templates.map((shift) => shift.key));
    let n = draft.templates.length + 1;
    while (used.has(`shift-${n}`)) n++;
    update({
      templates: [
        ...draft.templates,
        {
          ...defaultShiftTemplates(mode)[0],
          key: `shift-${n}`,
          name: `Shift ${n}`,
        },
      ],
    });
  };
  const setWeeks = (weeks: number) =>
    update({
      cycle_weeks: weeks,
      rotation: Array.from(
        { length: weeks },
        (_, i) => draft.rotation[i] ?? Array(7).fill(null)
      ),
    });
  // Tapping a day cycles Off -> each shift -> Off.
  const cycleDay = (week: number, day: number) => {
    const options = [null, ...draft.templates.map((shift) => shift.key)];
    const current = options.indexOf(draft.rotation[week][day]);
    const next = options[(current + 1) % options.length];
    update({
      rotation: draft.rotation.map((row, w) =>
        w === week ? row.map((value, d) => (d === day ? next : value)) : row
      ),
    });
  };
  const addOverride = (key: string | null) => {
    if (!overrideDate) return;
    update({
      overrides: [
        ...draft.overrides.filter((item) => item.date !== overrideDate),
        { date: overrideDate, key },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    });
    setOverrideDate("");
  };
  const preview = shiftPreview(
    { ...draft, cycle_start: draft.cycle_start },
    draft.effectiveFrom,
    28
  );
  const problem = shiftPlanDraftProblem(draft, mode);
  const busy =
    plan.submit.isPending || plan.withdraw.isPending || plan.end.isPending;
  const nameOf = (key: string | null) =>
    key
      ? (draft.templates.find((shift) => shift.key === key)?.name ?? "—")
      : "Off";
  if (plan.loading) return <Loader theme="doctor" style={{ minHeight: 40 }} />;
  return (
    <View style={{ gap: 16 }}>
      <Heading>{title} · Shift rotation</Heading>
      {plan.active ? (
        <Label variant="caption" muted>
          Rotation live from {formatDisplayDate(plan.active.effective_from)}
          {plan.active.ended_from
            ? `, ending ${formatDisplayDate(plan.active.ended_from)}`
            : ""}
          .
        </Label>
      ) : null}
      {plan.pending ? (
        <Panel style={{ gap: 8 }}>
          <Label>
            Waiting for {facilityName ?? "the facility"} to approve the rotation
            sent {formatDisplayDate(plan.pending.created_at)}.
          </Label>
          <Button
            theme="doctor"
            variant="outline"
            label="Withdraw request"
            disabled={busy}
            onPress={() => plan.withdraw.mutate(plan.pending!.id)}
          />
        </Panel>
      ) : null}
      {plan.rejected && !plan.pending ? (
        <Label style={{ color: palette.danger }}>
          Last rotation declined
          {plan.rejected.decision_reason
            ? `: ${plan.rejected.decision_reason}`
            : "."}
        </Label>
      ) : null}

      <ScheduleSection title="Shifts">
        {draft.templates.map((shift, index) => {
          const slots = Math.floor(shift.duration_minutes / shift.slot_minutes);
          return (
            <View
              key={shift.key}
              style={{
                gap: 10,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderColor: palette.border,
              }}
            >
              <Input
                label="Shift name"
                value={shift.name}
                maxLength={40}
                onChangeText={(name) => setShift(index, { name })}
              />
              <ClockTimePicker
                theme="doctor"
                label="Starts at"
                value={shift.start}
                disabled={busy}
                onChange={(start) => setShift(index, { start })}
              />
              <NumberSetting
                title="Length"
                stepper
                step={30}
                value={shift.duration_minutes}
                min={30}
                max={1680}
                suffix="minutes"
                hint={`${Math.floor(shift.duration_minutes / 60)} h ${shift.duration_minutes % 60} min · ends ${clockAfter(shift.start, shift.duration_minutes)}`}
                onChange={(duration_minutes) =>
                  setShift(index, { duration_minutes })
                }
              />
              <NumberSetting
                title={mode === "home" ? "Visit length" : "Appointment length"}
                stepper
                step={5}
                value={shift.slot_minutes}
                min={mode === "home" ? 30 : 5}
                max={120}
                suffix="minutes"
                hint={`${slots} appointment times in this shift`}
                onChange={(slot_minutes) => setShift(index, { slot_minutes })}
              />
              {mode === "clinic" ? (
                <>
                  <NumberSetting
                    title="App booking slots"
                    stepper
                    value={Math.min(shift.app_limit ?? 0, slots)}
                    min={0}
                    max={slots}
                    suffix="slots"
                    onChange={(app_limit) =>
                      setShift(index, {
                        app_limit,
                        walkin_limit: Math.min(
                          shift.walkin_limit ?? 0,
                          slots - app_limit
                        ),
                      })
                    }
                  />
                  <NumberSetting
                    title="Walk-in limit"
                    stepper
                    value={shift.walkin_limit ?? 0}
                    min={0}
                    max={Math.max(0, slots - (shift.app_limit ?? 0))}
                    suffix="walk-ins"
                    onChange={(walkin_limit) =>
                      setShift(index, { walkin_limit })
                    }
                  />
                </>
              ) : (
                <NumberSetting
                  title="Bookings per shift"
                  stepper
                  value={Math.min(shift.daily_limit ?? 1, Math.max(1, slots))}
                  min={1}
                  max={Math.max(1, Math.min(slots, 100))}
                  suffix="bookings"
                  onChange={(daily_limit) => setShift(index, { daily_limit })}
                />
              )}
              <Input
                label="Fee (₹)"
                keyboardType="decimal-pad"
                value={String(shift.fee_minor / 100)}
                onChangeText={(value) => {
                  if (/^\d{0,6}(\.\d{0,2})?$/.test(value))
                    setShift(index, {
                      fee_minor: Math.round(Number(value || 0) * 100),
                    });
                }}
              />
              {draft.templates.length > 1 ? (
                <Button
                  theme="doctor"
                  variant="ghost"
                  label={`Remove ${shift.name}`}
                  disabled={busy}
                  onPress={() => removeShift(shift.key)}
                />
              ) : null}
            </View>
          );
        })}
        {draft.templates.length < maxShiftTemplates ? (
          <Button
            theme="doctor"
            variant="outline"
            label="Add shift"
            disabled={busy}
            onPress={addShift}
          />
        ) : null}
      </ScheduleSection>

      <ScheduleSection title="Rotation">
        <NumberSetting
          title="Rotation length"
          stepper
          value={draft.cycle_weeks}
          min={1}
          max={maxRotationWeeks}
          suffix="weeks"
          hint="Tap a day to change its shift. The weeks repeat in order."
          onChange={setWeeks}
        />
        {draft.rotation.map((week, w) => (
          <View key={w} style={{ gap: 6 }}>
            <Label variant="label">Week {w + 1}</Label>
            <View style={[ui.wrap, { gap: 6 }]}>
              {week.map((key, d) => (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={`Week ${w + 1} ${shiftWeekdayLabels[d]}: ${nameOf(key)}`}
                  onPress={() => cycleDay(w, d)}
                  style={{
                    minWidth: 76,
                    padding: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: key ? palette.primary : palette.border,
                    backgroundColor: key ? palette.primary : palette.white,
                    alignItems: "center",
                  }}
                >
                  <Label
                    variant="caption"
                    style={{ color: key ? palette.white : palette.muted }}
                  >
                    {shiftWeekdayLabels[d]}
                  </Label>
                  <Label
                    variant="label"
                    style={{ color: key ? palette.white : palette.dark }}
                  >
                    {nameOf(key)}
                  </Label>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScheduleSection>

      <ScheduleSection title="Date changes">
        <Label variant="caption" muted>
          Change a single date, for example a 24-hour shift or a day off.
        </Label>
        {draft.overrides.map((item) => (
          <View key={item.date} style={ui.between}>
            <Label>
              {formatDisplayDate(item.date)} · {nameOf(item.key)}
            </Label>
            <Button
              theme="doctor"
              variant="ghost"
              label="Remove"
              onPress={() =>
                update({
                  overrides: draft.overrides.filter(
                    (other) => other.date !== item.date
                  ),
                })
              }
            />
          </View>
        ))}
        <DatePicker
          value={overrideDate || draft.effectiveFrom}
          onChange={setOverrideDate}
          timeZone={plan.zone}
          minDate={plan.today}
          disabled={busy}
          label="Date to change"
        />
        {overrideDate ? (
          <View style={ui.wrap}>
            <Choice
              label="Off"
              selected={false}
              onPress={() => addOverride(null)}
            />
            {draft.templates.map((shift) => (
              <Choice
                key={shift.key}
                label={shift.name}
                selected={false}
                onPress={() => addOverride(shift.key)}
              />
            ))}
          </View>
        ) : null}
      </ScheduleSection>

      <ScheduleSection title="Start and preview">
        <DatePicker
          value={draft.effectiveFrom}
          onChange={(effectiveFrom) =>
            update({
              effectiveFrom,
              cycle_start:
                edits?.cycle_start ?? source?.cycle_start ?? effectiveFrom,
            })
          }
          timeZone={plan.zone}
          minDate={firstDay}
          disabled={busy}
          label="Rotation starts on"
        />
        <Label variant="caption" muted>
          From this date the weekly schedule for this service stops. Booked
          appointments after it must be moved first.
        </Label>
        {preview.map((day) => (
          <Label
            key={day.date}
            variant="caption"
            style={day.skipped ? { color: palette.danger } : undefined}
            muted={!day.skipped && !day.shift}
          >
            {formatDisplayDate(day.date)} ·{" "}
            {day.shift
              ? `${day.shift.name} ${day.shift.start}–${clockAfter(day.shift.start, day.shift.duration_minutes)}${day.skipped ? " · overlaps the previous shift, skipped" : ""}`
              : "Off"}
          </Label>
        ))}
      </ScheduleSection>

      <Panel style={{ gap: 8 }}>
        {problem ? (
          <Label variant="caption" style={{ color: palette.danger }}>
            {problem}
          </Label>
        ) : (
          <Label variant="caption" muted>
            {plan.approvalRequired
              ? `${facilityName ?? "The facility"} approves the rotation before it starts.`
              : "Shifts are created for the next 30 days and kept up to date."}
          </Label>
        )}
        <Button
          theme="doctor"
          label={
            plan.approvalRequired ? "Submit for approval" : "Publish rotation"
          }
          disabled={busy || Boolean(problem) || !practiceId}
          loading={plan.submit.isPending}
          onPress={() => {
            const { effectiveFrom, ...input } = draft;
            plan.submit.mutate(
              { plan: input, effectiveFrom },
              { onSuccess: () => setEdits(null) }
            );
          }}
        />
        {plan.active && !plan.approvalRequired ? (
          <View style={{ gap: 8 }}>
            <DatePicker
              value={endFrom || firstDay}
              onChange={setEndFrom}
              timeZone={plan.zone}
              minDate={plan.today}
              disabled={busy}
              label="End rotation from"
            />
            <Button
              theme="doctor"
              variant="outline"
              label="End rotation"
              disabled={busy}
              loading={plan.end.isPending}
              onPress={() => plan.end.mutate(endFrom || firstDay)}
            />
          </View>
        ) : null}
      </Panel>
    </View>
  );
}
