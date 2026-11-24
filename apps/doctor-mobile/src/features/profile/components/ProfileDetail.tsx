import type { ProfileDetailProps } from "../types/profile-detail";
import { styles } from "./ProfileScreen.styles";

import { View } from "react-native";
import { AppText as Text } from "@startup/mobile-ui";

export function ProfileDetail({ icon, label, value }: ProfileDetailProps) {
  return (
    <View style={styles.contactRow}>
      <View style={styles.contactIcon}>{icon}</View>
      <View style={styles.contactCopy}>
        <Text variant="caption" style={styles.contactLabel}>
          {label}
        </Text>
        <Text variant="label" selectable style={styles.contactValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}
