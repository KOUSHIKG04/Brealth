import { s } from "./SosEmergency.styles";
import type { ActivatingSosProps } from "../types/sos";
import { Hotline } from "./Hotline";

import { AppText as Text } from "@startup/mobile-ui";
import { Linking, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ambulance } from "lucide-react-native";
import { SafeAreaView } from "@startup/mobile-ui";

export function ActivatingSos({
  phase,
  failure,
  onCancel,
  onRetry,
}: ActivatingSosProps) {
  const failed = phase === "failed";
  return (
    <LinearGradient colors={["#F23F47", "#C9161D"]} style={s.activation}>
      <SafeAreaView edges={["top", "bottom"]} style={s.activationSafeArea}>
        <View style={s.activationBody}>
          <View style={s.activationOuter}>
            <View style={s.activationInner}>
              <Ambulance color="#FFFFFF" size={44} />
            </View>
          </View>
          <Text
            variant="screenTitle"
            accessibilityRole="header"
            style={s.activationTitle}
          >
            {failed ? "SOS not sent" : "EMERGENCY ACTIVATED"}
          </Text>
          <Text
            variant="body"
            accessibilityLiveRegion="polite"
            style={s.activationCopy}
          >
            {failed
              ? failure
              : phase === "sending"
                ? "Sending your location to nearby ambulances"
                : "Getting your precise location"}
          </Text>
        </View>

        <View style={s.activationActions}>
          {failed ? (
            <>
              <View style={s.hotlineRow}>
                <Hotline
                  inverse
                  label="Ambulance 108"
                  onPress={() => void Linking.openURL("tel:108")}
                />
                <Hotline
                  inverse
                  label="Emergency 112"
                  onPress={() => void Linking.openURL("tel:112")}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={({ pressed }) => [
                  s.activationLink,
                  pressed && s.pressed,
                ]}
              >
                <Text variant="button" style={s.activationLinkText}>
                  Try again
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                style={({ pressed }) => [
                  s.activationLink,
                  pressed && s.pressed,
                ]}
              >
                <Text variant="label" style={s.activationLinkText}>
                  Close
                </Text>
              </Pressable>
            </>
          ) : phase === "sending" ? null : (
            // Leaving is safe only before the request is sent.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel SOS before it is sent"
              onPress={onCancel}
              style={({ pressed }) => [s.activationLink, pressed && s.pressed]}
            >
              <Text variant="button" style={s.activationLinkText}>
                Cancel
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
