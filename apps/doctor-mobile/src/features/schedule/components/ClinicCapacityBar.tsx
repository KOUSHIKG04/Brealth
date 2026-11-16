import { StyleSheet, View } from "react-native";
import { Label } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";

/**
 * Clinic capacity split into app bookings, walk-ins and free places. The bar
 * and its line turn red when the quotas exceed the capacity.
 */
export function ClinicCapacityBar({
  capacity,
  app,
  walkin,
}: {
  capacity: number;
  app: number;
  walkin: number;
}) {
  const used = app + walkin;
  const excess = used - capacity;
  const total = Math.max(capacity, used, 1);
  const free = Math.max(0, capacity - used);
  const segments = [
    { key: "app", value: app, color: palette.primary, label: "App" },
    { key: "walkin", value: walkin, color: palette.header, label: "Walk-in" },
    { key: "free", value: free, color: palette.chart, label: "Free" },
  ];
  return (
    <View
      style={{ gap: 8 }}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${app} app and ${walkin} walk-in of ${capacity}${
        excess > 0 ? `, exceeds capacity by ${excess}` : ""
      }`}
    >
      <View
        style={[
          styles.bar,
          excess > 0 && { borderColor: palette.danger, borderWidth: 1.5 },
        ]}
      >
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
      {excess > 0 ? (
        <Label variant="caption" style={{ color: palette.danger }}>
          Quotas exceed capacity by {excess}
        </Label>
      ) : null}
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
