import {
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useMobileTheme } from "../theme/MobileThemeProvider";
import type { AppTheme } from "../utils/appTheme";

export function Loader({
  theme,
  size = "small",
  color,
  style,
}: {
  theme?: AppTheme;
  /** Overrides the theme colour, e.g. white on a coloured action. */
  color?: string;
  size?: "small" | "large";
  style?: StyleProp<ViewStyle>;
}) {
  const palette = useMobileTheme(theme);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[styles.container, style]}
    >
      <ActivityIndicator color={color ?? palette.primary} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
});
