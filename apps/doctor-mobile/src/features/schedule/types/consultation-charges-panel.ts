export type ConsultationChargesPanelProps = {
  mode: "clinic" | "online" | "home";
  /** Label for the in-person fee, e.g. "Hospital Visit". */
  inPersonTitle?: string;
  draft: {
    onlineFee: string;
    clinicFee: string;
    homeFee: string;
  };
  onUpdate: (
    changes: Partial<{ onlineFee: string; clinicFee: string; homeFee: string }>
  ) => void;
};
