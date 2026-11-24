import { StyleSheet, View } from "react-native";
import { Heading, Label } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
import type { WeekChart } from "../types/schedule-overview";
import { hourLabel } from "../utils/scheduleOverview";
import { scheduleServices } from "../utils/scheduleConstants";
import { workingDayLabels } from "../utils/workingDaysPanelConstants";

const trackHeight = 132;

// Steps of the one brand hue tell the services apart.
const serviceChartStyles = {
  clinic: { fill: palette.primary, border: palette.primary },
  online: { fill: palette.header, border: palette.header },
  home: { fill: palette.white, border: palette.primary },
};

/**
 * The doctor's published week at a glance: one column per day, one lane per
 * live service, blocks placed by time of day.
 */
export function ScheduleWeekChart({
  chart,
  summary,
}: {
  chart: WeekChart | null;
  /** Spoken in place of the drawing. */
  summary: string;
}) {
  if (!chart)
    return (
      <View style={[ui.panel, { gap: 4 }]}>
        <Heading>Your week</Heading>
        <Label variant="caption" muted>
          Publish a service to see your working hours here
        </Label>
      </View>
    );
  const span = chart.end - chart.start;
  const lanes = chart.services.length;
  return (
    <View
      style={[ui.panel, { gap: 12 }]}
      accessible
      accessibilityLabel={`Your week. ${summary}`}
    >
      <Heading>Your week</Heading>
      <View style={styles.grid}>
        <View style={styles.axis}>
          <Label variant="caption" muted>
            {hourLabel(chart.start)}
          </Label>
          <Label variant="caption" muted>
            {hourLabel(chart.end)}
          </Label>
        </View>
        {workingDayLabels.map((name, index) => {
          const day = index + 1;
          return (
            <View key={name} style={styles.column}>
              <View style={styles.track}>
                {chart.services.map((service, lane) =>
                  service.days.includes(day)
                    ? service.blocks.map((block) => {
                        const style = serviceChartStyles[service.mode];
                        return (
                          <View
                            key={`${service.mode}:${block.start}`}
                            style={[
                              styles.block,
                              {
                                top: `${((block.start - chart.start) / span) * 100}%`,
                                height: `${((block.end - block.start) / span) * 100}%`,
                                left: `${(lane / lanes) * 100}%`,
                                width: `${100 / lanes}%`,
                                backgroundColor: style.fill,
                                borderColor: style.border,
                              },
                            ]}
                          />
                        );
                      })
                    : null
                )}
              </View>
              <Label variant="caption" muted style={styles.dayLabel}>
                {name.slice(0, 1)}
              </Label>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        {scheduleServices
          .filter(({ mode }) =>
            chart.services.some((service) => service.mode === mode)
          )
          .map(({ mode, short }) => (
            <View key={mode} style={ui.row}>
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: serviceChartStyles[mode].fill,
                    borderColor: serviceChartStyles[mode].border,
                  },
                ]}
              />
              <Label variant="caption">{short}</Label>
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 6 },
  axis: {
    height: trackHeight,
    justifyContent: "space-between",
    marginRight: 2,
  },
  column: { flex: 1, alignItems: "stretch", gap: 6 },
  track: {
    height: trackHeight,
    borderRadius: 8,
    backgroundColor: palette.subtle,
    overflow: "hidden",
  },
  block: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 1.5,
    marginHorizontal: 1,
  },
  dayLabel: { textAlign: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5 },
});
