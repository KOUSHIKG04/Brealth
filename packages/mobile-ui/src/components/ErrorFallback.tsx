import { Pressable, StyleSheet, Text, View } from "react-native";
import { appThemeColors, type AppTheme } from "../utils/appTheme";

export type ErrorFallbackProps = {
  theme: AppTheme;
  onRetry: () => void;
  title?: string;
  message?: string;
  retryLabel?: string;
};

/**
 * Screen shown by an app's root error boundary. It renders outside app
 * providers, so it depends only on React Native and the theme tokens.
 */
export function ErrorFallback({
  theme,
  onRetry,
  title = "Something went wrong",
  message = "This screen stopped unexpectedly. Your saved information is safe. Try again, or restart the app if this keeps happening.",
  retryLabel = "Try again",
}: ErrorFallbackProps) {
  const colors = appThemeColors[theme];
  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background }]}
      accessibilityRole="alert"
    >
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textMuted }]}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: colors.onPrimary }]}>
          {retryLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  title: { fontSize: 20, fontWeight: "600", textAlign: "center" },
  message: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  button: {
    marginTop: 8,
    minHeight: 48,
    minWidth: 160,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonLabel: { fontSize: 16, fontWeight: "600" },
});
