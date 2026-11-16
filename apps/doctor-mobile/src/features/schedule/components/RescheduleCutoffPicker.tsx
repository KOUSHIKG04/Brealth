import { View } from "react-native";
import { Dropdown } from "@startup/mobile-ui";
import { Label } from "../../../components/DoctorScreen";
import {
  cutoffDayOptions,
  cutoffHourOptions,
  cutoffMinuteOptions,
  rescheduleCutoffMaxMinutes,
} from "../utils/scheduleConstants";

export function RescheduleCutoffPicker({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (minutes: number) => void;
}) {
  const days = Math.floor(value / 1440);
  const hours = Math.floor((value % 1440) / 60);
  const minutes = value % 60;
  return (
    <View style={{ gap: 6 }}>
      <Label variant="body">Self-reschedule cutoff before start</Label>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Dropdown
          theme="doctor"
          label="Days"
          accessibilityLabel="Reschedule cutoff days"
          containerStyle={{ flex: 1, minWidth: 0 }}
          disabled={disabled}
          value={String(days)}
          options={cutoffDayOptions.map((option) => ({
            ...option,
            disabled:
              Number(option.value) * 1440 + hours * 60 + minutes >
              rescheduleCutoffMaxMinutes,
          }))}
          onValueChange={(next) =>
            onChange(Number(next) * 1440 + hours * 60 + minutes)
          }
        />
        <Dropdown
          theme="doctor"
          label="Hours"
          accessibilityLabel="Reschedule cutoff hours"
          containerStyle={{ flex: 1, minWidth: 0 }}
          disabled={disabled}
          value={String(hours)}
          options={cutoffHourOptions.map((option) => ({
            ...option,
            disabled:
              days * 1440 + Number(option.value) * 60 + minutes >
              rescheduleCutoffMaxMinutes,
          }))}
          onValueChange={(next) =>
            onChange(days * 1440 + Number(next) * 60 + minutes)
          }
        />
        <Dropdown
          theme="doctor"
          label="Minutes"
          accessibilityLabel="Reschedule cutoff minutes"
          containerStyle={{ flex: 1, minWidth: 0 }}
          disabled={disabled}
          value={String(minutes)}
          options={cutoffMinuteOptions.map((option) => ({
            ...option,
            disabled:
              days * 1440 + hours * 60 + Number(option.value) >
              rescheduleCutoffMaxMinutes,
          }))}
          onValueChange={(next) =>
            onChange(days * 1440 + hours * 60 + Number(next))
          }
        />
      </View>
      <Label muted>
        {value === 0
          ? "No advance cutoff."
          : `${value} minutes before the appointment starts.`}
      </Label>
    </View>
  );
}
