export type SosEmergencyScreenProps = {
  onClose: () => void;
};

export type SosPhase = "starting" | "locating" | "sending" | "failed" | "live";

export type ActivatingSosProps = {
  phase: SosPhase;
  failure: string;
  onCancel: () => void;
  onRetry: () => void;
};

export type SosCancelSheetProps = {
  visible: boolean;
  cancelling: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
};

export type HotlineProps = {
  label: string;
  onPress: () => void;
};
