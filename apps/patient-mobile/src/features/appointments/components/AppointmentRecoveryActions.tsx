import { useState } from "react";
import {
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { router, type Href } from "expo-router";
import {
  appointmentRecoveryView,
  type ClinicAppointment,
} from "@startup/contracts";
import { AppText, Button } from "@startup/mobile-ui";
import { AppointmentRecovery } from "./AppointmentRecovery";
import { bookAgainRoute } from "../utils/bookAgain";

/**
 * Recovery status and actions. On a list card ("card"), optional actions live
 * in the card's ⋮ menu; only a doctor's rescheduling request stays visible,
 * because the patient must act on it. Details show every action.
 */
export function AppointmentRecoveryActions({
  item,
  now = Date.now(),
  buttonStyle,
  labelStyle,
  placement = "details",
}: {
  item: ClinicAppointment;
  now?: number;
  buttonStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  placement?: "card" | "details";
}) {
  const [intent, setIntent] = useState<"reschedule" | "review" | null>(null);
  const view = appointmentRecoveryView(item, now);
  const request = item.recovery?.request;
  const doctorRequested = Boolean(item.recovery?.schedule_change?.pending);
  const onCard = placement === "card";
  return (
    <View style={{ gap: 12 }}>
      {view.message ? (
        <AppText style={labelStyle}>{view.message}</AppText>
      ) : null}
      {request ? (
        <AppText style={labelStyle}>
          {request.kind === "reschedule" ? "Reschedule" : "Attendance review"}:{" "}
          {request.status}
          {request.decision_note ? ` · ${request.decision_note}` : ""}
        </AppText>
      ) : null}
      {view.canReschedule && (!onCard || doctorRequested) ? (
        <Button
          theme="patient"
          variant="outline"
          label={
            doctorRequested
              ? "Choose another time"
              : view.requiresApproval
                ? "Request reschedule"
                : "Reschedule"
          }
          style={buttonStyle}
          labelStyle={labelStyle}
          onPress={() => setIntent("reschedule")}
        />
      ) : null}
      {view.canReview && !onCard ? (
        <Button
          theme="patient"
          variant="outline"
          label="Report a problem"
          style={buttonStyle}
          labelStyle={labelStyle}
          onPress={() => setIntent("review")}
        />
      ) : null}
      {view.bookAgain && !onCard ? (
        <Button
          theme="patient"
          label="Book again"
          style={buttonStyle}
          labelStyle={labelStyle}
          onPress={() => router.push(bookAgainRoute(item))}
        />
      ) : null}
      {item.recovery?.rescheduled_to_id ? (
        <Button
          theme="patient"
          variant="outline"
          label="View replacement booking"
          style={buttonStyle}
          labelStyle={labelStyle}
          onPress={() =>
            router.push({
              pathname: "/appointment-details/[id]",
              params: { id: item.recovery!.rescheduled_to_id! },
            } as Href)
          }
        />
      ) : null}
      {intent ? (
        <AppointmentRecovery
          key={`${item.id}-${intent}`}
          item={item}
          intent={intent}
          onClose={() => setIntent(null)}
        />
      ) : null}
    </View>
  );
}
