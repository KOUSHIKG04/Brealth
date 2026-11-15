import {
  consultationControlTopic,
  decodeConsultationControl,
  userErrorMessage,
} from "@startup/contracts";
import type { LiveConsultationCallProps } from "../types/live-consultation-call";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import {
  isTrackReference,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/react-native";
import {
  ConnectionState,
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RemoteParticipant,
} from "livekit-client";
import { useToast, useToastFeedback } from "@startup/mobile-ui";
import {
  listOnlineMessages,
  sendOnlineMessage,
  subscribeOnlineMessages,
} from "@startup/data-access";
import { supabase, useMobileSession } from "../../../services/supabase";
import { peerAwayTimeoutMs } from "../utils/callControl";

type Facing = "user" | "environment";

/** Direction reported by the capture itself, when the platform provides it. */
function trackFacing(track: LocalVideoTrack | undefined): Facing | undefined {
  const value = track?.mediaStreamTrack.getSettings?.().facingMode;
  return value === "user" || value === "environment" ? value : undefined;
}

export function useLiveConsultationCall({
  appointmentId,
  name,
  active,
  initialChat = false,
  onBack,
  onEnd,
  onRemoteEnded,
}: LiveConsultationCallProps) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera]);
  const remote = tracks.find(
    (track) => isTrackReference(track) && !track.participant.isLocal
  );
  const local = tracks.find(
    (track) => isTrackReference(track) && track.participant.isLocal
  );
  const { profile } = useMobileSession();
  const client = useQueryClient();
  const { showToast } = useToast();
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  const sendLock = useRef(false);
  const mounted = useRef(false);
  // Last requested camera; the live track's own setting wins when available.
  const [facing, setFacing] = useState<Facing>("user");
  const actualFacing = trackFacing(
    local && isTrackReference(local)
      ? (local.publication.track as LocalVideoTrack | undefined)
      : undefined
  );
  // Mirror only the front camera, as a selfie preview; never the back camera.
  const frontCamera = (actualFacing ?? facing) !== "environment";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const messages = useQuery({
    queryKey: ["online-messages", appointmentId],
    queryFn: () => listOnlineMessages(supabase!, appointmentId),
    enabled: Boolean(active && supabase),
  });
  useToastFeedback({
    error: messages.isError
      ? "Could not refresh consultation messages. Try again."
      : "",
  });
  useEffect(() => {
    if (!active || !supabase) return;
    return subscribeOnlineMessages(
      supabase,
      appointmentId,
      () => {
        void client.invalidateQueries({
          queryKey: ["online-messages", appointmentId],
        });
      },
      () =>
        showToast({
          title: "Chat connection interrupted",
          message: "Messages will catch up when the connection returns.",
          type: "info",
        })
    );
  }, [active, appointmentId, client, showToast]);

  // The other participant: a "call-ended" message ends the call here too; a
  // silent departure is a dropped connection, shown quietly while they may
  // rejoin and treated as lost after the timeout.
  const [peerAway, setPeerAway] = useState(false);
  const remoteEndHandled = useRef(false);
  const onRemoteEndedRef = useRef(onRemoteEnded);
  useEffect(() => {
    onRemoteEndedRef.current = onRemoteEnded;
  });
  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic !== consultationControlTopic || !participant) return;
      if (decodeConsultationControl(payload)?.type !== "call-ended") return;
      if (remoteEndHandled.current) return;
      remoteEndHandled.current = true;
      void room
        .disconnect()
        .catch(() => undefined)
        .then(() => {
          if (mounted.current) onRemoteEndedRef.current?.("ended");
        });
    };
    const onLeft = (participant: RemoteParticipant) => {
      if (!participant.isLocal) setPeerAway(true);
    };
    const onJoined = () => setPeerAway(false);
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    room.on(RoomEvent.ParticipantConnected, onJoined);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
      room.off(RoomEvent.ParticipantConnected, onJoined);
    };
  }, [room]);
  useEffect(() => {
    if (!peerAway) return;
    const timer = setTimeout(() => {
      if (!remoteEndHandled.current) onRemoteEndedRef.current?.("lost");
    }, peerAwayTimeoutMs);
    return () => clearTimeout(timer);
  }, [peerAway]);
  const notice =
    connection === ConnectionState.Reconnecting
      ? "Reconnecting…"
      : peerAway
        ? `${name} left the call. Waiting for them to reconnect…`
        : undefined;

  async function device(action: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setDeviceBusy(true);
    try {
      await action();
    } catch {
      if (mounted.current)
        showToast({
          title: message,
          message: "Check device permissions and try again.",
          type: "error",
        });
    } finally {
      lock.current = false;
      if (mounted.current) setDeviceBusy(false);
    }
  }

  async function flip() {
    await device(async () => {
      const track = room.localParticipant.getTrackPublication(
        Track.Source.Camera
      )?.track as LocalVideoTrack | undefined;
      if (!track || !room.localParticipant.isCameraEnabled)
        throw new Error("Camera unavailable");
      const current =
        trackFacing(track) ?? (frontCamera ? "user" : "environment");
      const target = current === "user" ? "environment" : "user";
      // React Native WebRTC ignores facingMode in applyConstraints, which only
      // flipped the mirror. restartTrack reopens capture on the other camera.
      await track.restartTrack({ facingMode: target });
      const switched = trackFacing(track) ?? target;
      if (!mounted.current) return;
      setFacing(switched);
      if (switched === current)
        showToast({
          title: "Camera unchanged",
          message: "Another camera is not available on this device.",
          type: "info",
        });
    }, "Could not switch your camera");
  }

  async function send(body: string) {
    if (
      sendLock.current ||
      !active ||
      connection !== ConnectionState.Connected ||
      !supabase
    )
      throw new Error("Call is not active");
    sendLock.current = true;
    setSending(true);
    try {
      await sendOnlineMessage(
        supabase,
        appointmentId,
        body,
        Crypto.randomUUID()
      );
      await client.invalidateQueries({
        queryKey: ["online-messages", appointmentId],
      });
    } catch (cause) {
      if (mounted.current)
        showToast({
          title: "Could not send message",
          message: userErrorMessage(cause, "Try again."),
          type: "error",
        });
      throw cause;
    } finally {
      sendLock.current = false;
      if (mounted.current) setSending(false);
    }
  }

  return {
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
  };
}
