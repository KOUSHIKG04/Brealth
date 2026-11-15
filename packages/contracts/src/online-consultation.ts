import { z } from "zod";
import { uuidSchema } from "./validation";

export const onlineMessageSchema = z.object({
  id: uuidSchema,
  appointment_id: uuidSchema,
  sender_id: uuidSchema,
  body: z.string(),
  created_at: z.string(),
});

export const onlineJoinContextSchema = z.object({
  appointment_id: uuidSchema,
  room_name: z.string(),
  role: z.enum(["patient", "doctor"]),
  starts_at: z.string(),
  ends_at: z.string(),
});

export const onlineTokenSchema = z.object({
  serverUrl: z.string().url(),
  participantToken: z.string().min(1),
});

/** LiveKit data topic for call control between the two participants. */
export const consultationControlTopic = "consultation-control";

export const consultationControlSchema = z
  .object({
    type: z.literal("call-ended"),
    by: z.enum(["patient", "doctor"]),
  })
  .strict();

export type ConsultationControl = z.infer<typeof consultationControlSchema>;

// Control messages are ASCII JSON, so a byte-per-character codec avoids
// depending on TextEncoder/TextDecoder support in the JavaScript engine.
export function encodeConsultationControl(
  message: ConsultationControl
): Uint8Array<ArrayBuffer> {
  const text = JSON.stringify(consultationControlSchema.parse(message));
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0x7f);
}

/** Parses a control message; anything else (or malformed data) is null. */
export function decodeConsultationControl(
  payload: Uint8Array
): ConsultationControl | null {
  try {
    const parsed = consultationControlSchema.safeParse(
      JSON.parse(String.fromCharCode(...payload))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type OnlineMessage = z.infer<typeof onlineMessageSchema>;

export type OnlineJoinContext = z.infer<typeof onlineJoinContextSchema>;
