import { AppText as Text } from "@startup/mobile-ui";
import { StyleSheet, View } from "react-native";
import { Video } from "lucide-react-native";
import { colors, fontFamilies, radius, surfaces } from "@startup/design-tokens";
import { Button, Card } from "@startup/mobile-ui";
import type { OnlineConsultationProps } from "../types/doctor-profile";

export function OnlineConsultation({
  fee,
  onBookPress,
}: OnlineConsultationProps) {
  return (
    <Card
      backgroundColor={colors.white}
      borderRadius={radius.md}
      gap={12}
      padding={14}
      variant="outlined"
      style={styles.consultationCard}
    >
      <View style={styles.titleRow}>
        <View style={styles.consultationIconContainer}>
          <Video color={colors.patient.primary} size={18} strokeWidth={2.2} />
        </View>
        <Text
          variant="cardHeading"
          numberOfLines={1}
          style={styles.consultationTitle}
        >
          Online Consultation Available
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Text
          variant="bodySmall"
          numberOfLines={1}
          style={styles.consultationSubtitle}
        >
          {`Video call from home · ${fee}`}
        </Text>
        <Button
          label="Book"
          theme="patient"
          onPress={onBookPress}
          style={styles.consultationButton}
          labelStyle={styles.consultationButtonLabel}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  consultationCard: {
    ...surfaces.card,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  consultationIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#E6F7F5",
    alignItems: "center",
    justifyContent: "center",
  },
  consultationTitle: {
    flex: 1,
    color: "#0C2434",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  consultationSubtitle: {
    flex: 1,
    color: "#5B6B79",
  },
  consultationButton: {
    minHeight: 40,
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.patient.primary,
  },
  consultationButtonLabel: {
    color: colors.white,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
});
