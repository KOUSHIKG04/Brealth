import { useState } from "react";
import { View, TextInput } from "react-native";
import { colors, spacing } from "@startup/design-tokens";
import { Button, AppDialog } from "@startup/mobile-ui";
import {
  formatDisplayDate,
  scheduleBlockSummary,
  scheduleServiceLabel,
  type ScheduleChangePreview,
  type ScheduleConflictDecision,
} from "@startup/contracts";
import { Heading, Label } from "../../../components/DoctorScreen";

export function ScheduleConflictDialog({
  preview,
  busy,
  onClose,
  onConfirm,
  onStartFromSuggestedDate,
}: {
  preview: ScheduleChangePreview | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (decision: ScheduleConflictDecision) => void;
  onStartFromSuggestedDate?: (date: string) => void;
}) {
  const suggestedDate = preview?.suggested_effective_from;
  const [choice, setChoice] = useState<{
    token: string;
    strategy: "trim" | "pause";
    reason: string;
  } | null>(null);
  const decision = choice?.token === preview?.token ? choice : null;
  const bookings =
    preview?.conflicts.flatMap((item) => item.bookings ?? []) ?? [];
  const affected = [
    ...new Map(bookings.map((item) => [item.id, item])).values(),
  ];
  const canProceed = preview?.can_request ?? preview?.can_replace;
  return (
    <AppDialog
      theme="doctor"
      title="This time is already scheduled"
      busy={busy}
      actions={
        <View style={{ gap: spacing.sm }}>
          {canProceed && !decision ? (
            <View style={{ gap: spacing.sm }}>
              <Button
                theme="doctor"
                label="Replace overlapping availability"
                disabled={busy}
                onPress={() =>
                  setChoice({
                    token: preview!.token,
                    strategy: "trim",
                    reason: "",
                  })
                }
              />
              <Button
                theme="doctor"
                variant="outline"
                label="Publish new schedule and pause affected blocks"
                disabled={busy}
                onPress={() =>
                  setChoice({
                    token: preview!.token,
                    strategy: "pause",
                    reason: "",
                  })
                }
              />
            </View>
          ) : decision ? (
            <View style={{ gap: spacing.sm }}>
              <Button
                theme="doctor"
                label={
                  busy
                    ? "Saving schedules…"
                    : affected.length
                      ? "Publish and send rescheduling requests"
                      : decision.strategy === "pause"
                        ? "Confirm publish and pause"
                        : "Confirm replacement"
                }
                loading={busy}
                disabled={
                  busy ||
                  !canProceed ||
                  (affected.length > 0 && decision.reason.trim().length < 2)
                }
                onPress={() =>
                  onConfirm({
                    strategy: decision.strategy,
                    patientReason: decision.reason.trim(),
                  })
                }
              />
              <Button
                theme="doctor"
                variant="outline"
                label="Back to options"
                disabled={busy}
                onPress={() => setChoice(null)}
              />
            </View>
          ) : null}
          {suggestedDate && onStartFromSuggestedDate && !decision ? (
            <Button
              theme="doctor"
              variant={canProceed ? "outline" : undefined}
              label={`Start from ${formatDisplayDate(suggestedDate)} instead`}
              accessibilityHint="Publishes the same hours from the first date with no booked patients in the way."
              disabled={busy}
              onPress={() => onStartFromSuggestedDate(suggestedDate)}
            />
          ) : null}
          <Button
            theme="doctor"
            variant="outline"
            label="Edit my new hours"
            disabled={busy}
            onPress={onClose}
          />
        </View>
      }
      visible={preview !== null}
      onClose={onClose}
    >
      <Label muted>
        Review the affected availability from{" "}
        {preview ? formatDisplayDate(preview.effective_from) : ""}. Remaining
        hours below preserve complete appointment slots.
      </Label>
      <View style={{ gap: spacing.md }}>
        {preview?.conflicts.map((item) => (
          <View key={item.rule_id} style={{ gap: 6 }}>
            <Heading>
              {scheduleServiceLabel(item.mode)} · {item.facility_name}
            </Heading>
            <Label>{scheduleBlockSummary(item)}</Label>
            {item.travel_buffer_minutes > 0 ? (
              <Label muted>
                Includes {item.travel_buffer_minutes} minutes of travel before
                and after the block.
              </Label>
            ) : null}
            <Label muted>
              Change starts {formatDisplayDate(item.effective_from)}
              {item.effective_until
                ? `, through ${formatDisplayDate(item.effective_until)}`
                : ""}
              .
            </Label>
            <Label>
              {(decision?.strategy === "pause"
                ? (item.paused_remaining ?? [])
                : item.remaining
              ).length
                ? "Remaining availability:"
                : "No hours remain for this block. Set new hours to offer it again."}
            </Label>
            {(decision?.strategy === "pause"
              ? (item.paused_remaining ?? [])
              : item.remaining
            ).map((block) => (
              <Label key={scheduleBlockSummary(block)} muted>
                {scheduleBlockSummary(block)}
              </Label>
            ))}
            {decision?.strategy === "pause" ? (
              <Label>
                This affected block will be paused on the new schedule’s working
                days until you publish new hours. Other days keep their hours.
              </Label>
            ) : null}
            {item.reason ? (
              <Label>
                {item.reason}
                {item.booked_count
                  ? ` (${item.booked_count} active reservations)`
                  : ""}
              </Label>
            ) : null}
          </View>
        ))}
        {affected.length ? (
          <View style={{ gap: spacing.sm }}>
            <Heading>Affected bookings ({affected.length})</Heading>
            {affected.map((booking) => (
              <Label key={booking.id}>
                {booking.patient_name} · {booking.booking_code} ·{" "}
                {new Date(booking.starts_at).toLocaleString(undefined, {
                  timeZone: booking.timezone,
                })}{" "}
                ({booking.timezone})
                {booking.payment_hold
                  ? " · Awaiting payment — resolve this hold first"
                  : ""}
              </Label>
            ))}
            <Label>
              Bookings keep their times and payments. Conflicting new slots stay
              unavailable until rescheduling is resolved. Sending a request does
              not mean the patient accepted a new time.
            </Label>
          </View>
        ) : null}
        {decision && affected.length ? (
          <View style={{ gap: spacing.sm }}>
            <Label variant="label">Reason shown to patients</Label>
            <TextInput
              accessibilityLabel="Reason shown to patients"
              multiline
              maxLength={1000}
              editable={!busy}
              value={decision.reason}
              onChangeText={(reason) => setChoice({ ...decision, reason })}
              placeholder="Explain why a new appointment time is needed."
              style={{
                minHeight: 100,
                borderWidth: 1,
                borderColor: colors.doctor.border,
                borderRadius: 8,
                padding: spacing.md,
                color: colors.doctor.text,
                textAlignVertical: "top",
              }}
            />
            <Label muted>
              Message preview: Your doctor has requested a new appointment time.{" "}
              {decision.reason.trim() || "[Your reason]"} Choose another time or
              contact the clinic. Your booking and payment stay in place until a
              separate decision is made.
            </Label>
          </View>
        ) : null}
      </View>
      <Label muted>
        Appointments are never automatically moved or cancelled. If another
        service loses all its hours, a notice will stay in Manage Schedule until
        you set new hours.
      </Label>
    </AppDialog>
  );
}
