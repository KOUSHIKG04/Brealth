import { getFindDoctorRoute } from "../utils/homeRoutes";
import type { HomeFeedContentProps } from "../types/home-feed-content";
import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { colors } from "@startup/design-tokens";
import { IconLabel, Skeleton, useToastFeedback } from "@startup/mobile-ui";
import { homeActions } from "../utils/homeActionsConstants";
import AmbulanceBanner from "./AmbulanceBanner";
import UpcomingAppointmentCard from "../../appointments/components/UpcomingAppointmentCard";
import { formatDisplayDate } from "@startup/contracts";
import PopularServices from "./PopularServices";

export function HomeFeedContent({
  upcoming,
  isLoading,
  isError,
}: HomeFeedContentProps) {
  useToastFeedback({
    error: isError
      ? "Could not load appointments. Open Bookings to retry."
      : "",
  });
  return (
    <>
      <View style={styles.actionsRow}>
        {homeActions.map((action) => (
          <IconLabel
            key={action.key}
            icon={action.icon}
            label={action.label}
            backgroundColor={colors.patient.primary}
            iconColor={colors.patient.surface}
            onPress={
              action.consultationType
                ? () =>
                    router.push(getFindDoctorRoute(action.consultationType!))
                : undefined
            }
            surfaceSize={52}
            surfaceRadius={16}
            iconSize={24}
            labelWidth={76}
            gap={8}
            labelNumberOfLines={2}
            labelStyle={styles.actionLabel}
          />
        ))}
      </View>

      <View style={styles.ambulanceBanner}>
        <AmbulanceBanner
          onBookPress={() => router.push("/ambulance" as unknown as Href)}
        />
      </View>

      {/* Home shows only the next appointment; View all opens the full list. */}
      {upcoming?.[0] ? (
        <UpcomingAppointmentCard
          key={upcoming[0].id}
          doctorName={upcoming[0].doctor_name}
          specialization={upcoming[0].facility_name}
          date={formatDisplayDate(upcoming[0].starts_at)}
          time={new Date(upcoming[0].starts_at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
          onCardPress={() => router.push("/appointments" as Href)}
        />
      ) : isLoading ? (
        <Skeleton theme="patient" height={118} radius={16} />
      ) : null}

      <PopularServices />
    </>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 2,
  },
  actionLabel: {
    textAlign: "center",
    fontSize: 12,
    color: colors.patient.text,
  },
  ambulanceBanner: {
    marginTop: 12,
    alignItems: "center",
  },
});
