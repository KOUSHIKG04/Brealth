import type { PatientCardProps } from "../types/patient-card";
import {
  appointmentQueueNumber,
  appointmentRecoveryView,
} from "@startup/contracts";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, User } from "lucide-react-native";
import { Button } from "@startup/mobile-ui";
import { fontFamilies, surfaces } from "@startup/design-tokens";

import { Heading, Label } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";

export function PatientCard({
  now,
  appointment,
  home = false,
  onOpen,
  onAction,
  actionLabel,
}: PatientCardProps) {
  const completed = appointment.status === "completed";
  const recovery = appointmentRecoveryView(appointment, now);
  const expiredRequest =
    appointment.status === "pending" &&
    Date.parse(appointment.request_expires_at ?? appointment.starts_at) <=
      Date.now();
  const consultationLabel =
    appointment.visit_mode === "online"
      ? "Video Consultation"
      : appointment.visit_mode === "home"
        ? "Home Visit"
        : "In-Clinic Consultation";
  const time = new Date(appointment.starts_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  // Issued ticket or reserved hybrid-queue number; ahead count only while waiting.
  const queueNumber = appointmentQueueNumber(appointment);
  const queueLabel =
    appointment.visit_mode !== "clinic"
      ? ""
      : ` • Queue ${queueNumber ? `#${queueNumber}` : "not assigned"}${
          appointment.queue_state === "waiting"
            ? ` (${appointment.ahead_count} ahead)`
            : ""
        }`;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${appointment.patient_name}, ${consultationLabel}, ${recovery.staffStatus}. Open appointment`}
        onPress={onOpen}
        style={({ pressed }) => [ui.row, pressed && { opacity: 0.88 }]}
      >
        <View
          style={[
            styles.avatar,
            { width: home ? 40 : 52, height: home ? 40 : 52 },
          ]}
        >
          <User size={home ? 25 : 28} color="white" />
        </View>
        <View style={ui.flex}>
          <Heading style={styles.white}>{appointment.patient_name}</Heading>
          <Label variant="caption" style={styles.secondary}>
            {home
              ? `${appointment.patient_gender ?? "Gender unavailable"}, ${appointment.patient_age_years ?? "age unavailable"}${queueLabel}`
              : `${appointment.patient_gender ?? "Gender unavailable"}, Age - ${appointment.patient_age_years ?? "unavailable"}`}
          </Label>
          {!home ? (
            <Label variant="labelSmall" style={styles.time}>
              {time}
            </Label>
          ) : null}
        </View>
        <View style={styles.badge}>
          <Label variant="labelSmall" style={styles.badgeText}>
            {home
              ? expiredRequest
                ? "REQUEST EXPIRED"
                : completed
                  ? "COMPLETED"
                  : recovery.staffStatus.toUpperCase()
              : recovery.needsReview ||
                  recovery.bookAgain ||
                  appointment.recovery?.outcome ||
                  appointment.status === "in_consultation"
                ? recovery.staffStatus
                : appointment.visit_mode === "online"
                  ? "ONLINE"
                  : "CLINIC VISIT"}
          </Label>
        </View>
        {!home ? (
          <View style={styles.arrow}>
            <ChevronRight size={20} color={palette.primary} />
          </View>
        ) : null}
      </Pressable>
      {home ? (
        <>
          <View style={ui.between}>
            <Label variant="caption" style={styles.secondary}>
              Type:{" "}
              <Label variant="labelSmall" style={styles.time}>
                {consultationLabel}
              </Label>
            </Label>
            <Label variant="labelSmall" style={styles.time}>
              {new Date(appointment.starts_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                timeZone: appointment.timezone,
              })}{" "}
              · {time}
            </Label>
          </View>
          {!completed && onAction ? (
            <Button
              label={actionLabel ?? "Start Consultation"}
              theme="doctor"
              onPress={onAction}
              style={{ backgroundColor: palette.white }}
              labelStyle={{ color: palette.primary }}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surfaces.card,
    padding: 16,
    gap: 14,
    borderRadius: 16,
    backgroundColor: palette.card,
  },
  avatar: {
    borderRadius: 26,
    backgroundColor: "rgba(230,247,246,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  white: { color: palette.white },
  secondary: { color: "#D4F0EC" },
  time: { color: palette.white },
  badge: {
    backgroundColor: "#DEF5F2",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  badgeText: { color: palette.dark },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
