import { View } from "react-native";
import {
  scheduleBlockSummary,
  scheduleServiceLabel,
  type ScheduleBusyBlock,
} from "@startup/contracts";
import { Label } from "../../../components/DoctorScreen";
import { palette } from "../../../components/theme";
import { ScheduleSection } from "./ScheduleSection";

/** Time already published for other services or practices of this doctor. */
export function ScheduleBusyBlocks({
  blocks,
  overlaps,
}: {
  blocks: ScheduleBusyBlock[];
  overlaps: ScheduleBusyBlock[];
}) {
  if (!blocks.length) return null;
  const clashing = new Set(overlaps.map((item) => item.rule_id));
  return (
    <ScheduleSection title="Already scheduled elsewhere">
      <Label muted style={{ fontSize: 12 }}>
        Choose hours outside these blocks to publish without conflicts.
      </Label>
      {overlaps.length ? (
        <View accessibilityLiveRegion="polite">
          <Label style={{ color: palette.danger }}>
            Your hours overlap{" "}
            {overlaps.length === 1 ? "one block" : `${overlaps.length} blocks`}{" "}
            below. Publishing will ask how to adjust them.
          </Label>
        </View>
      ) : null}
      {blocks.map((item) => (
        <View key={item.rule_id} style={{ gap: 2 }}>
          <Label
            style={
              clashing.has(item.rule_id) ? { color: palette.danger } : undefined
            }
          >
            {scheduleServiceLabel(item.mode)} · {item.facility_name}
            {clashing.has(item.rule_id) ? " · overlaps" : ""}
          </Label>
          <Label muted style={{ fontSize: 12 }}>
            {scheduleBlockSummary(item)}
            {item.travel_buffer_minutes
              ? ` · ${item.travel_buffer_minutes} min travel buffer`
              : ""}
          </Label>
        </View>
      ))}
    </ScheduleSection>
  );
}
