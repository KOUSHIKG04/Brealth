import type { LiveVideoStageProps } from "../types/live-video-stage";
import { LiveConsultationCall } from "./LiveConsultationCall";
import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useRoomContext } from "@livekit/react-native";
import { Button, ModalSurface } from "@startup/mobile-ui";
import { Heading, Label } from "../../../components/DoctorScreen";
import { endConsultationCall } from "../utils/callControl";

/**
 * "confirm": the doctor tapped End. "ended": the patient ended the call.
 * "lost": the patient was gone past the reconnect timeout.
 */
type EndPrompt = "confirm" | "ended" | "lost" | null;

export function LiveVideoStage({
  appointmentId,
  patientName,
  patientId,
  initialChat,
}: LiveVideoStageProps) {
  const room = useRoomContext();
  const [prompt, setPrompt] = useState<EndPrompt>(null);
  const [leaving, setLeaving] = useState(false);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/appointments");
  async function continueToNotes() {
    if (leaving) return;
    setLeaving(true);
    // Ends the call for the patient too (no-op if they already left).
    await endConsultationCall(room, "doctor");
    setPrompt(null);
    router.replace({
      pathname: "/clinical-notes",
      params: { appointmentId, patientId, mode: "online" },
    });
  }
  const title =
    prompt === "ended"
      ? "Patient ended the call"
      : prompt === "lost"
        ? "Patient's connection was lost"
        : "End call?";
  const message =
    prompt === "ended"
      ? `${patientName} left the consultation. Continue with clinical notes.`
      : prompt === "lost"
        ? `${patientName} has not reconnected. You can keep waiting or continue with clinical notes.`
        : `This ends the call for ${patientName} too. Continue with clinical notes.`;
  return (
    <View style={{ flex: 1 }}>
      <LiveConsultationCall
        appointmentId={appointmentId}
        name={patientName}
        active
        initialChat={initialChat}
        onBack={back}
        onEnd={() => setPrompt("confirm")}
        onRemoteEnded={(reason) => setPrompt(reason)}
      />
      <ModalSurface
        visible={prompt !== null}
        // After the patient ended the call there is no call to return to.
        onClose={() => (prompt === "ended" ? undefined : setPrompt(null))}
      >
        <View style={{ gap: 16 }}>
          <Heading>{title}</Heading>
          <Label>{message}</Label>
          <Button
            theme="doctor"
            label="Continue to clinical notes"
            loading={leaving}
            disabled={leaving}
            onPress={() => void continueToNotes()}
          />
          {prompt !== "ended" ? (
            <Button
              theme="doctor"
              variant="outline"
              label={prompt === "lost" ? "Keep waiting" : "Stay in call"}
              disabled={leaving}
              onPress={() => setPrompt(null)}
            />
          ) : null}
        </View>
      </ModalSurface>
    </View>
  );
}
