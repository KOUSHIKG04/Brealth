import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Building2, House, Video, ChevronRight } from "lucide-react-native";
import { Loader, Skeleton } from "@startup/mobile-ui";
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
import { useScheduleOverview } from "../hooks/useScheduleOverview";
import {
  scheduleServices,
  serviceStatusColors,
} from "../utils/scheduleConstants";

const serviceIcons = { clinic: Building2, online: Video, home: House };

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
  } = useScheduleOverview();
  return (
    <DoctorScreen title="Manage Schedule">
      {practices.isLoading ? (
        <Loader theme="doctor" style={{ minHeight: 40 }} />
      ) : null}
      {availablePractices && availablePractices.length > 1 ? (
        <ScheduleSection title="Your clinic">
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
      {scheduleServices.map(({ mode, title, description }) => {
        const Icon = serviceIcons[mode];
        const { status, summary } = services[mode];
        const actionLabel =
          status.label === "Not published" ? "Set up" : undefined;
        return (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityLabel={
              saved.data ? `${title}, ${status.label}` : title
            }
            accessibilityHint={summary ?? description}
            onPress={() => router.push(`/manage-schedule/${mode}`)}
            style={({ pressed }) => [
              ui.panel,
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                minHeight: 80,
                backgroundColor: pressed ? "#F1F5F5" : palette.white,
              },
            ]}
          >
            <Icon size={24} color={palette.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Heading>{title}</Heading>
              {saved.isLoading ? (
                <Skeleton theme="doctor" width={140} height={14} radius={4} />
              ) : practiceId && !saved.isError ? (
                <View style={ui.row}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: serviceStatusColors[status.tone],
                    }}
                  />
                  <Label
                    variant="label"
                    style={{ color: serviceStatusColors[status.tone] }}
                  >
                    {status.label}
                  </Label>
                </View>
              ) : null}
              <Label variant="caption" muted>
                {summary ?? description}
              </Label>
            </View>
            {actionLabel ? (
              <Label variant="label" style={{ color: palette.primary }}>
                {actionLabel}
              </Label>
            ) : null}
            <ChevronRight size={20} color={palette.muted} />
          </Pressable>
        );
      })}
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
