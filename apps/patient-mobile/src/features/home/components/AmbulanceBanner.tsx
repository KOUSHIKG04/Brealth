import type { AmbulanceBannerProps } from "../types/home";

export type { AmbulanceBannerProps } from "../types/home";

import { AppText as Text, Button } from "@startup/mobile-ui";
import { Image, StyleSheet, View } from "react-native";
import { colors, surfaces } from "@startup/design-tokens";

export function AmbulanceBanner({ onBookPress, style }: AmbulanceBannerProps) {
  return (
    <View style={[styles.banner, style]}>
      <View style={styles.content}>
        <View style={styles.eyebrow}>
          <View style={styles.emergencyDot} />
          <Text variant="labelSmall" style={styles.eyebrowText}>
            Emergency service
          </Text>
        </View>
        <Text variant="cardHeading" style={styles.title}>
          Book an ambulance
        </Text>
        <Button
          label="Book now"
          theme="patient"
          onPress={onBookPress}
          style={styles.button}
        />
        <Text variant="caption" numberOfLines={2} style={styles.description}>
          Real-time tracking · Nearest driver
        </Text>
      </View>

      <View style={styles.imageCard}>
        <Image
          alt=""
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={require("../../../../assets/images/ambulance.png")}
          style={styles.image}
        />
      </View>
    </View>
  );
}

export default AmbulanceBanner;

const styles = StyleSheet.create({
  banner: {
    width: "98%",
    minHeight: 145,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.patient.surface,
    ...surfaces.card,
  },
  content: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    gap: 4,
  },
  eyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emergencyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.patient.sos.primary,
  },
  eyebrowText: {
    color: colors.patient.sos.dark,
  },
  title: {
    color: colors.patient.primaryDark,
  },
  description: {
    marginTop: 4,
    color: colors.patient.textSecondary,
  },
  button: {
    width: 166,
    maxWidth: "100%",
    minHeight: 40,
    marginTop: 8,
    paddingVertical: 0,
    borderRadius: 12,
    backgroundColor: colors.patient.primaryDark,
  },
  imageCard: {
    width: 120,
    height: 88,
    overflow: "hidden",
    borderRadius: 12,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
