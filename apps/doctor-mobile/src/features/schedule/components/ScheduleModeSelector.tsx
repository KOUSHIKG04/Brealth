import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Label } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
import { scheduleServices } from "../utils/scheduleConstants";
import { ScheduleSection } from "./ScheduleSection";
import type { ScheduleModeSelectorProps } from "../types/schedule-mode-selector";

/**
 * Opens one or more services; each chosen service's editor appears below,
 * in the order chosen. Lists every service's status at a glance.
 */
export function ScheduleModeSelector({
  modes,
  services,
  onToggle,
}: ScheduleModeSelectorProps) {
  return (
    <ScheduleSection title="Services">
      <Label variant="caption" muted>
        Choose one or more services to edit.
      </Label>
      <View style={ui.wrap}>
        {scheduleServices.map((service) => {
          const selected = modes.includes(service.mode);
          return (
            <Pressable
              key={service.mode}
              accessibilityRole="checkbox"
              accessibilityLabel={service.short}
              accessibilityState={{ checked: selected }}
              onPress={() => onToggle(service.mode)}
              style={({ pressed }) => [
                ui.choice,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: selected ? palette.primary : palette.border,
                  backgroundColor: selected ? palette.primary : palette.white,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              {selected ? <Check size={16} color={palette.white} /> : null}
              <Label
                variant="label"
                style={{ color: selected ? palette.white : palette.dark }}
              >
                {service.short}
              </Label>
            </Pressable>
          );
        })}
      </View>
      {services
        ? scheduleServices.map(({ mode, short }) => (
            <Label key={mode} variant="caption" muted>
              {short}: {services[mode].status.label}
              {services[mode].summary ? ` · ${services[mode].summary}` : ""}
            </Label>
          ))
        : null}
    </ScheduleSection>
  );
}
