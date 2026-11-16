import { consultationCharges } from "../utils/consultationChargesPanelConstants";
import { ScheduleSection } from "./ScheduleSection";

import type { ConsultationChargesPanelProps } from "../types/consultation-charges-panel";
import { View } from "react-native";
import { Input } from "@startup/mobile-ui";
import { Label } from "../../../components/DoctorScreen";
import { ui } from "../../../components/theme";

export function ConsultationChargesPanel({
  mode,
  inPersonTitle,
  draft,
  onUpdate,
}: ConsultationChargesPanelProps) {
  return (
    <ScheduleSection title="Consultation Charges">
      <Label variant="caption" muted>
        Set your appointment fee.
      </Label>
      {consultationCharges
        .filter(
          ([, key]) =>
            key ===
            (mode === "clinic"
              ? "clinicFee"
              : mode === "online"
                ? "onlineFee"
                : "homeFee")
        )
        .map(
          ([defaultTitle, key]) =>
            [
              key === "clinicFee"
                ? (inPersonTitle ?? defaultTitle)
                : defaultTitle,
              key,
            ] as const
        )
        .map(([title, key]) => (
          <View key={key} style={ui.between}>
            <Label variant="body" style={{ flex: 1 }}>
              {title}
            </Label>
            <Label variant="body">₹</Label>
            <Input
              accessibilityLabel={`${title} charge in rupees`}
              value={draft[key]}
              onChangeText={(value) => onUpdate({ [key]: value })}
              keyboardType="decimal-pad"
              containerStyle={{ width: 100 }}
            />
          </View>
        ))}
    </ScheduleSection>
  );
}
