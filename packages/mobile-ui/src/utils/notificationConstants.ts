import type { NotificationKind } from "../types/notification";

export const notificationKindLabels: Record<NotificationKind, string> = {
  appointment: "Appointment",
  queue: "Visit",
  payment: "Payment",
  prescription: "Prescription",
  medicine: "Medicine",
  ambulance: "Ambulance",
  account: "Account",
  general: "Update",
};
