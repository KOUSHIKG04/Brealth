import { StyleSheet, View } from "react-native";
import { Label } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";

/** The day's in-person capacity: app booking slots plus the walk-in limit. */
export function ClinicCapacityBar({
  app,
  walkin,
}: {
  app: number;
  walkin: number;
}) {
  const total = Math.max(app + walkin, 1);
  const segments = [
    { key: "app", value: app, color: palette.primary, label: "App" },
    { key: "walkin", value: walkin, color: palette.header, label: "Walk-in" },
  ];
  return (
    <View
      style={{ gap: 8 }}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${app} app bookings and ${walkin} walk-ins a day`}
    >
      <View style={styles.bar}>
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <View
              key={segment.key}
              style={{
                flex: segment.value / total,
                backgroundColor: segment.color,
              }}
            />
          ))}
      </View>
      <View style={[ui.row, { flexWrap: "wrap", gap: 16 }]}>
        {segments.map((segment) => (
          <View key={segment.key} style={[ui.row, { gap: 6 }]}>
            <View style={[styles.swatch, { backgroundColor: segment.color }]} />
            <Label variant="caption">
              {segment.label} {segment.value}
            </Label>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    gap: 2,
    backgroundColor: palette.subtle,
  },
  swatch: { width: 10, height: 10, borderRadius: 3 },
});
