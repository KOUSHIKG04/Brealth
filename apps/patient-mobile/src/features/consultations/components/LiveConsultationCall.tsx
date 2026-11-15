import { useLiveConsultationCall } from "../hooks/useLiveConsultationCall";
import type { LiveConsultationCallProps } from "../types/live-consultation-call";
import { AppText as Text } from "@startup/mobile-ui";

import { StyleSheet, View } from "react-native";

import { VideoTrack, isTrackReference } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { UserRound } from "lucide-react-native";
import { colors, fontFamilies } from "@startup/design-tokens";
import { ConsultationCall } from "@startup/mobile-ui";
import { endConsultationCall } from "../utils/callControl";

export function LiveConsultationCall({
  appointmentId,
  name,
  active,
  initialChat = false,
  onBack,
  onEnd,
  onRemoteEnded,
}: LiveConsultationCallProps) {
  const {
    room,
    connection,
    isCameraEnabled,
    isMicrophoneEnabled,
    remote,
    local,
    profile,
    deviceBusy,
    sending,
    frontCamera,
    notice,
    messages,
    device,
    flip,
    send,
  } = useLiveConsultationCall({
    appointmentId,
    name,
    active,
    initialChat,
    onBack,
    onEnd,
    onRemoteEnded,
  });
  const fallback = (label: string) => (
    <View style={styles.placeholder}>
      <UserRound size={32} color={colors.patient.primary} />
      <Text variant="body" style={styles.name}>
        {label}
      </Text>
    </View>
  );
  return (
    <ConsultationCall
      key={appointmentId}
      theme="patient"
      name={name}
      initialChat={initialChat}
      remoteVideo={
        remote && isTrackReference(remote) && !remote.publication.isMuted ? (
          <VideoTrack trackRef={remote} style={StyleSheet.absoluteFill} />
        ) : (
          fallback(name)
        )
      }
      localVideo={
        local && isTrackReference(local) && isCameraEnabled ? (
          <VideoTrack
            trackRef={local}
            mirror={frontCamera}
            zOrder={1}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          fallback("Camera off")
        )
      }
      cameraEnabled={isCameraEnabled}
      microphoneEnabled={isMicrophoneEnabled}
      connected={connection === ConnectionState.Connected}
      chatAllowed={active}
      deviceBusy={deviceBusy}
      sending={sending}
      messages={messages.data}
      identityId={profile?.identity_id}
      notice={notice}
      onSend={send}
      onCamera={() =>
        void device(
          () =>
            room.localParticipant.setCameraEnabled(
              !room.localParticipant.isCameraEnabled
            ),
          "Could not change your camera"
        )
      }
      onMicrophone={() =>
        void device(
          () =>
            room.localParticipant.setMicrophoneEnabled(
              !room.localParticipant.isMicrophoneEnabled
            ),
          "Could not change your microphone"
        )
      }
      onFlipCamera={() => void flip()}
      onEnd={() => {
        // Tell the doctor first so their call closes too, then leave.
        void endConsultationCall(room, "patient").finally(onEnd);
      }}
      onBack={onBack}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.patient.surface,
  },
  name: {
    color: colors.patient.text,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    textAlign: "center",
  },
});
