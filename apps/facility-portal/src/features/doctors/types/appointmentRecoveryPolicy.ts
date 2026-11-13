export type PolicyDraft = {
  onlineGraceMinutes: number;
  clinicGraceMinutes: number;
  rescheduleCutoffMinutes: number;
  maxSelfReschedules: number;
  expectedVersion: number;
};
