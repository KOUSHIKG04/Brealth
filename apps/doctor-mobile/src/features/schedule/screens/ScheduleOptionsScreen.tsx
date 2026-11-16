import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Building2, House, Video, ChevronRight } from "lucide-react-native";
import { Loader, Skeleton, StatusBadge } from "@startup/mobile-ui";
import {
  Choice,
  DoctorScreen,
  Heading,
  Label,
} from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";
import { UnavailableTimeManager } from "../components/UnavailableTimeManager";
import { AppointmentRecoveryPolicy } from "../components/AppointmentRecoveryPolicy";
import { ScheduleAdjustmentNotices } from "../components/ScheduleAdjustmentNotices";
import { ScheduleSection } from "../components/ScheduleSection";
import { ScheduleWeekChart } from "../components/ScheduleWeekChart";
import { useScheduleOverview } from "../hooks/useScheduleOverview";
import { scheduleServices } from "../utils/scheduleConstants";

const serviceIcons = { clinic: Building2, online: Video, home: House };

// Brand teal only; the status text carries the meaning.
const serviceStatusStyles = {
  live: { dot: palette.primary, background: palette.surface },
  waiting: { dot: palette.header, background: palette.chart },
  off: { dot: palette.muted, background: palette.subtle },
};

export function ScheduleOptionsScreen() {
  const {
    practices,
    availablePractices,
    practiceId,
    selectedPractice,
    selectPractice,
    setPractice,
    saved,
    services,
    week,
  } = useScheduleOverview();
  const weekSummary = scheduleServices
    .map(({ short, mode }) =>
      services[mode].summary ? `${short}: ${services[mode].summary}` : null
    )
    .filter(Boolean)
    .join(". ");
  return (
    <DoctorScreen title="Manage Schedule" background={palette.subtle}>
      {practices.isLoading ? (
        <Loader theme="doctor" style={{ minHeight: 40 }} />
      ) : null}
      {availablePractices && availablePractices.length > 1 ? (
        <ScheduleSection title="Your workplace">
          <View style={ui.wrap}>
            {availablePractices.map((p) => (
              <Choice
                key={p.practice_id}
                label={p.facility_name}
                selected={practiceId === p.practice_id}
                onPress={() => selectPractice(p)}
              />
            ))}
          </View>
        </ScheduleSection>
      ) : null}
      <ScheduleAdjustmentNotices onSelectPractice={setPractice} />
      {saved.isLoading ? (
        <Skeleton theme="doctor" height={220} radius={14} />
      ) : practiceId && !saved.isError ? (
        <ScheduleWeekChart chart={week} summary={weekSummary} />
      ) : null}
      <View style={styles.services}>
        {scheduleServices.map(({ mode, title, description }, index) => {
          const Icon = serviceIcons[mode];
          const { status, summary } = services[mode];
          const tone = serviceStatusStyles[status.tone];
          const loaded = Boolean(practiceId && saved.data);
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityLabel={loaded ? `${title}, ${status.label}` : title}
              accessibilityHint={summary ?? description}
              onPress={() => router.push(`/manage-schedule/${mode}`)}
              style={({ pressed }) => [
                styles.service,
                index > 0 && styles.serviceDivider,
                index === 0 && styles.firstService,
                index === scheduleServices.length - 1 && styles.lastService,
                pressed && { backgroundColor: palette.subtle },
              ]}
            >
              <View style={styles.iconTile}>
                <Icon size={20} color={palette.primary} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={[ui.row, { flexWrap: "wrap", gap: 8 }]}>
                  <Heading>{title}</Heading>
                  {loaded ? (
                    <StatusBadge
                      status={status.label}
                      dotColor={tone.dot}
                      backgroundColor={tone.background}
                      dotStyle={
                        status.tone === "waiting"
                          ? {
                              backgroundColor: "transparent",
                              borderWidth: 1.5,
                              borderColor: tone.dot,
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </View>
                <Label variant="caption" muted>
                  {summary ?? description}
                </Label>
              </View>
              <ChevronRight size={20} color={palette.muted} />
            </Pressable>
          );
        })}
      </View>
      <UnavailableTimeManager practiceId={practiceId} />
      {/* Saved separately from the service schedules, with its own save. */}
      {practiceId && saved.data ? (
        <AppointmentRecoveryPolicy key={practiceId} practiceId={practiceId} />
      ) : null}
      {!practices.isLoading && !selectedPractice ? (
        <Label muted>
          {practices.isError
            ? "Could not load your practices. Reopen this screen and try again."
            : "An active clinic or hospital association is required before you can set a schedule."}
        </Label>
      ) : null}
    </DoctorScreen>
  );
}

const styles = StyleSheet.create({
  services: { ...StyleSheet.flatten(ui.panel), padding: 0, gap: 0 },
  service: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // Pressed rows follow the group's rounded corners.
  firstService: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  lastService: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  serviceDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
});
