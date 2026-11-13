import { createDisplayColumns } from "@startup/web-ui/components/data-table";

export const transactionHeaders = [
  ["date", "Date / Reference", 176, 130],
  ["patient", "Patient / Appointment", 190, 140],
  ["doctor", "Doctor / Facility", 190, 140],
  ["method", "Method", 112, 90],
  ["status", "Status", 170, 130],
  ["amount", "Amount / Refunded", 156, 120],
  ["manage", "", 120, 100],
] as const;

export const transactionColumns = createDisplayColumns(transactionHeaders);

export const transactionStatusLabels = {
  creating: "Preparing checkout",
  created: "Awaiting payment",
  authorized: "Awaiting capture",
  captured: "Payment received",
  failed: "Failed",
  uncertain: "Checking status",
} as const;
