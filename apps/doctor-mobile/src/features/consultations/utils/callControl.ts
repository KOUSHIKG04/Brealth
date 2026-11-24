import type { Room } from "livekit-client";
import {
  consultationControlTopic,
  encodeConsultationControl,
} from "@startup/contracts";

/** The other person's absence after which the call is treated as lost. */
export const peerAwayTimeoutMs = 60_000;

/**
 * Tells the other participant the call ended, then leaves the room. If the
 * message cannot be sent they still see us leave and get the timeout.
 */
export async function endConsultationCall(
  room: Room,
  by: "doctor" | "patient"
) {
  try {
    await room.localParticipant.publishData(
      encodeConsultationControl({ type: "call-ended", by }),
      { reliable: true, topic: consultationControlTopic }
    );
  } catch {
    // Best effort; leaving still disconnects us below.
  }
  await room.disconnect().catch(() => undefined);
}
