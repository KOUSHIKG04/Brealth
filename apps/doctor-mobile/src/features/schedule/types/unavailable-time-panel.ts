import { type ClinicUnavailability } from "@startup/contracts";

export type UnavailableTimePanelProps = {
  timeZone?: string;
  leaveDate: string;
  onLeaveDateChange: (val: string) => void;
  leaveStart: string;
  onLeaveStartChange: (val: string) => void;
  leaveEnd: string;
  onLeaveEndChange: (val: string) => void;
  leaveReason: string;
  onLeaveReasonChange: (val: string) => void;
  /** The add form shows only while the doctor is adding time off. */
  formOpen: boolean;
  busy: boolean;
  pendingAction: string | null;
  canAdd: boolean;
  onAddLeave: () => void;
  unavailable?: ClinicUnavailability[];
  onRemoveLeave: (item: ClinicUnavailability) => Promise<void>;
  isError: boolean;
};
