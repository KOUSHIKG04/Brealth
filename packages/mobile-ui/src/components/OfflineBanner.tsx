import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appThemeColors, type AppTheme } from "../utils/appTheme";

export type OfflineBannerProps = {
  visible: boolean;
  theme: AppTheme;
  message?: string;
};

/**
 * Non-blocking connectivity notice. Apps decide when it is visible; it never
 * intercepts touches, so the current screen stays usable offline.
 */
export function OfflineBanner({
  visible,
  theme,
  message = "You're offline. Changes will sync when you reconnect.",
}: OfflineBannerProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const colors = appThemeColors[theme];
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.banner,
        { paddingTop: insets.top + 6, backgroundColor: colors.text },
      ]}
    >
      <Text style={[styles.label, { color: colors.surface }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    paddingBottom: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  label: { fontSize: 13, fontWeight: "500", textAlign: "center" },
});
