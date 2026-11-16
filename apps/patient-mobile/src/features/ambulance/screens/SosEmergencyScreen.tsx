import { useSosEmergency } from "../hooks/useSosEmergency";
import { Hotline } from "../components/Hotline";
import { ActivatingSos } from "../components/ActivatingSos";
import { SosCancelSheet } from "../components/SosCancelSheet";
import { s } from "../components/SosEmergency.styles";
import { sosTripStatusLabels } from "../utils/sosConstants";
import { sosDistanceLabel } from "../utils/sosDistance";
import type { SosEmergencyScreenProps } from "../types/sos";
import { AppText as Text, Loader, SafeAreaView } from "@startup/mobile-ui";

import { Linking, Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, ChevronDown, Siren, Star } from "lucide-react-native";
import { colors } from "@startup/design-tokens";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function SosEmergencyScreen({ onClose }: SosEmergencyScreenProps) {
  const sos = useSosEmergency({ onClose });
  if (sos.phase !== "live")
    return (
      <ActivatingSos
        phase={sos.phase}
        failure={sos.failure}
        onCancel={sos.leaveBeforeSending}
        onRetry={sos.retry}
      />
    );

  const booking = sos.booking;
  const status = booking?.status;
  const assigned = status === "assigned";
  const searching =
    !booking || status === "searching" || status === "awaiting_location";
  const ended =
    status === "fulfilled" ||
    status === "cancelled" ||
    status === "unfulfilled";
  const driverDistance = sosDistanceLabel(sos.tracking, sos.pickup);

  return (
    <LinearGradient colors={["#3A0508", "#1A0102"]} style={s.screen}>
      <SafeAreaView edges={["top", "bottom"]} style={s.safeArea}>
        <View style={s.header}>
          <View style={s.sirenCircle}>
            <Siren color="#FFFFFF" size={20} />
          </View>
          <Text
            variant="cardHeading"
            accessibilityRole="header"
            style={s.headerTitle}
          >
            EMERGENCY ACTIVATED
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimise. Your SOS stays active"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [s.minimise, pressed && s.pressed]}
          >
            <ChevronDown color="rgba(255,255,255,0.8)" size={22} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          <View style={s.driverCard} accessibilityLiveRegion="polite">
            {assigned && booking?.driver_name ? (
              <>
                <View style={s.driverTop}>
                  <View style={s.avatar}>
                    <Text variant="label" style={s.avatarText}>
                      {initials(booking.driver_name)}
                    </Text>
                  </View>
                  <View style={s.driverCopy}>
                    <Text variant="bodyEmphasis" style={s.driverName}>
                      {booking.driver_name}
                    </Text>
                    <Text variant="caption" style={s.driverMeta}>
                      {[
                        booking.vehicle_registration,
                        `${booking.capability_code.toUpperCase()} ambulance`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  {booking.driver_rating ? (
                    <View style={s.rating}>
                      <Star color={colors.patient.sos.dark} size={12} />
                      <Text variant="labelSmall" style={s.ratingText}>
                        {booking.driver_rating}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.etaRow}>
                  <View style={s.etaCell}>
                    <Text variant="caption" style={s.caption}>
                      Distance
                    </Text>
                    <Text variant="bodyEmphasis" style={s.etaValue}>
                      {driverDistance ?? "Locating driver"}
                    </Text>
                  </View>
                  <View style={[s.etaCell, s.etaCellEnd]}>
                    <Text variant="caption" style={s.caption}>
                      Status
                    </Text>
                    <Text variant="bodyEmphasis" style={s.etaValue}>
                      {booking.trip_status
                        ? sosTripStatusLabels[booking.trip_status]
                        : "Driver accepted"}
                    </Text>
                  </View>
                </View>
                {sos.pinVisible ? (
                  <View style={s.pinBox}>
                    <Text variant="caption" style={s.caption}>
                      Completion PIN · give it to the driver at the hospital
                    </Text>
                    {sos.verificationPin.data ? (
                      <Text
                        variant="pageHeadline"
                        accessibilityLabel="Four-digit completion PIN"
                        style={s.pin}
                      >
                        {sos.verificationPin.data}
                      </Text>
                    ) : (
                      <Loader theme="patient" style={{ minHeight: 36 }} />
                    )}
                  </View>
                ) : null}
              </>
            ) : ended ? (
              <View style={s.searchingRow}>
                <Text variant="bodyEmphasis" style={s.driverName}>
                  {status === "unfulfilled"
                    ? "No ambulance accepted"
                    : status === "fulfilled"
                      ? "Trip completed"
                      : "SOS cancelled"}
                </Text>
                <Text variant="bodySmall" style={s.driverMeta}>
                  {status === "unfulfilled"
                    ? "No nearby ambulance took this request. Call 108 now."
                    : `Request ${booking?.public_code ?? ""}`}
                </Text>
              </View>
            ) : (
              <View style={s.searchingRow}>
                <Loader theme="patient" style={{ minHeight: 32 }} />
                <Text variant="bodyEmphasis" style={s.driverName}>
                  Finding the nearest ambulance
                </Text>
                <Text variant="bodySmall" style={s.driverMeta}>
                  Your location went to ambulances near you. The first driver to
                  accept is assigned.
                </Text>
              </View>
            )}
          </View>

          {sos.hospital ? (
            <View style={s.hospitalCard}>
              <Text variant="labelSmall" style={s.hospitalBadge}>
                Nearest registered hospital
              </Text>
              <Text variant="cardHeading" style={s.hospitalName}>
                {sos.hospital.name}
              </Text>
              <Text variant="bodySmall" style={s.hospitalAddress}>
                {sos.hospital.address}
              </Text>
              {sos.hospital.distance_meters !== null ? (
                <View style={s.capacityPill}>
                  <View style={s.openDot} />
                  <Text variant="labelSmall" style={s.capacityStrong}>
                    {(sos.hospital.distance_meters / 1000).toFixed(1)} km from
                    you
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Directions to ${sos.hospital.name}`}
                onPress={() =>
                  void Linking.openURL(
                    `https://www.google.com/maps/dir/?api=1&destination=${sos.hospital!.latitude},${sos.hospital!.longitude}`
                  )
                }
                style={({ pressed }) => [
                  s.directionButton,
                  pressed && s.pressed,
                ]}
              >
                <ArrowRight color="#0C2434" size={16} />
                <Text variant="button" style={s.directionText}>
                  Directions
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={s.bottomActions}>
          <View style={s.hotlineRow}>
            <Hotline
              label="Ambulance 108"
              onPress={() => void Linking.openURL("tel:108")}
            />
            <Hotline
              label="Emergency 112"
              onPress={() => void Linking.openURL("tel:112")}
            />
          </View>
          {searching && booking ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => sos.setCancelOpen(true)}
              style={({ pressed }) => [s.cancel, pressed && s.pressed]}
            >
              <Text variant="button" style={s.cancelText}>
                I’m safe — Cancel emergency
              </Text>
            </Pressable>
          ) : assigned ? (
            <Text variant="caption" style={s.footnote}>
              A driver has accepted your SOS, so it can’t be cancelled in the
              app. Call 108 if your situation changes.
            </Text>
          ) : ended ? (
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [s.cancel, pressed && s.pressed]}
            >
              <Text variant="button" style={s.cancelText}>
                Close
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>

      <SosCancelSheet
        visible={sos.cancelOpen}
        cancelling={sos.cancel.isPending}
        onConfirm={() => sos.cancel.mutate()}
        onDismiss={() => sos.setCancelOpen(false)}
      />
    </LinearGradient>
  );
}
