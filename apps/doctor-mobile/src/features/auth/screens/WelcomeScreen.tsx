import { StyleSheet, View } from "react-native";
import { AppText as Text } from "@startup/mobile-ui";
import { router } from "expo-router";
import { colors, fontFamilies } from "@startup/design-tokens";
import { OnboardingShell } from "../components/OnboardingShell";
import { OnboardingButton } from "../components/OnboardingButton";

export default function WelcomeScreen() {
  return (
    <OnboardingShell>
      <View style={styles.body}>
        <View style={styles.brand}>
          <Text variant="inherit" style={styles.name}>
            Clinzo
            <Text variant="pageHeadline" style={styles.plus}>
              +
            </Text>
          </Text>
          <Text variant="body" style={styles.tagline}>
            Right Care. Right Time.
          </Text>
        </View>
        <View style={styles.action}>
          <OnboardingButton
            label="GET STARTED"
            onPress={() => router.push("/login")}
          />
          <Text variant="bodySmall" style={styles.trust}>
            Care for patients with Clinzo
          </Text>
        </View>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: "center", paddingTop: 195 },
  brand: { alignItems: "center" },
  name: {
    color: colors.patient.primaryDark,
    fontFamily: fontFamilies.medium,
    fontSize: 48,
  },
  plus: { fontSize: 30 },
  tagline: { color: colors.black, fontStyle: "italic", marginTop: 3 },
  action: { width: "100%", maxWidth: 296, marginTop: 108 },
  trust: { color: "#6B7280", textAlign: "center", marginTop: 16 },
});
