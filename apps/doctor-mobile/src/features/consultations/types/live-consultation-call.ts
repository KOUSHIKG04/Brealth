export type LiveConsultationCallProps = {
  appointmentId: string;
  name: string;
  active: boolean;
  initialChat?: boolean;
  onBack: () => void;
  onEnd: () => void;
  /** The other person ended the call, or was gone past the reconnect timeout. */
  onRemoteEnded?: (reason: "ended" | "lost") => void;
};
