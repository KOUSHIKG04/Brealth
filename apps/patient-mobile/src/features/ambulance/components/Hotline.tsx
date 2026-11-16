import type { HotlineProps } from "../types/sos";
import { s } from "./SosEmergency.styles";

import { AppText as Text } from "@startup/mobile-ui";
import { Pressable } from "react-native";

export function Hotline({
  label,
  onPress,
  inverse = false,
}: HotlineProps & { inverse?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Call ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.hotline,
        inverse && s.hotlineInverse,
        pressed && s.pressed,
      ]}
    >
      <Text
        variant="button"
        style={[s.hotlineText, inverse && s.hotlineInverseText]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
