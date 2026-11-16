import type { UnavailableTimePanelProps } from "../types/unavailable-time-panel";
import { StyleSheet, View } from "react-native";
import { Button, Input, ClockTimePicker } from "@startup/mobile-ui";
import { Label } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
import { UnavailableDatePicker } from "./UnavailableDatePicker";
import { formatDisplayDateTime } from "@startup/contracts";

export function UnavailableTimePanel({
  timeZone,
  leaveDate,
  onLeaveDateChange,
  leaveStart,
  onLeaveStartChange,
  leaveEnd,
  onLeaveEndChange,
  leaveReason,
  onLeaveReasonChange,
  formOpen,
  busy,
  pendingAction,
  canAdd,
  onAddLeave,
  unavailable,
  onRemoveLeave,
  isError,
}: UnavailableTimePanelProps) {
  return (
    <>
      {formOpen ? (
        <>
          <UnavailableDatePicker
            value={leaveDate}
            onChange={onLeaveDateChange}
            timeZone={timeZone}
            disabled={busy}
          />
          <View style={ui.row}>
            <ClockTimePicker
              theme="doctor"
              label="Start time"
              value={leaveStart}
              onChange={onLeaveStartChange}
              disabled={busy}
            />
            <ClockTimePicker
              theme="doctor"
              label="End time"
              value={leaveEnd}
              onChange={onLeaveEndChange}
              disabled={busy}
              endOfDay
            />
          </View>
          <Input
            label="Reason"
            value={leaveReason}
            onChangeText={onLeaveReasonChange}
          />
          <Button
            loading={pendingAction === "add-leave"}
            theme="doctor"
            variant="outline"
            label="Add unavailable time"
            disabled={busy || !canAdd}
            onPress={onAddLeave}
          />
        </>
      ) : null}
      {unavailable
        ?.filter((item) => item.state === "active")
        .map((item) => (
          <View key={item.id} style={[ui.between, styles.entry]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Label variant="label">
                {formatDisplayDateTime(item.starts_at, timeZone)} –{" "}
                {formatDisplayDateTime(item.ends_at, timeZone)}
              </Label>
              <Label variant="caption" muted>
                {item.service_mode === "all"
                  ? "All services"
                  : item.service_mode === "home"
                    ? "Home visits"
                    : item.service_mode === "online"
                      ? "Online"
                      : "Clinic"}{" "}
                · {item.reason}
              </Label>
            </View>
            <Button
              loading={pendingAction === `remove-leave:${item.id}`}
              theme="doctor"
              variant="ghost"
              label="Remove"
              accessibilityLabel={`Remove time off on ${formatDisplayDateTime(item.starts_at, timeZone)}`}
              disabled={busy}
              onPress={() => void onRemoveLeave(item)}
            />
          </View>
        ))}
      {isError ? (
        <Label variant="label" style={ui.error}>
          Could not load unavailable time.
        </Label>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  entry: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
});
