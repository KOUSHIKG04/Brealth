export const scheduleTabs = [
  "Today",
  "Tomorrow",
  "This Week",
  "Custom",
] as const;

export const scheduleTimeLabels = [
  "00:00",
  "04:00",
  "08:00",
  "12:00",
  "16:00",
  "20:00",
] as const;

export const shiftStyles = {
  "on-duty": {
    label: "Clinic",
    bar: "bg-primary",
    badge: "bg-muted text-primary",
  },
  surgery: {
    label: "Surgery",
    bar: "bg-destructive",
    badge: "bg-destructive/10 text-destructive",
  },
  "on-call": {
    label: "Online",
    bar: "bg-slate-500",
    badge: "bg-slate-100 text-slate-700",
  },
  "home-visit": {
    label: "Home visit",
    bar: "bg-sky-600",
    badge: "bg-sky-100 text-sky-800",
  },
} as const;

export const assignmentTableHeaders = [
  ["doctor", "Doctor name"],
  ["department", "Department"],
  ["time", "Shift time"],
  ["status", "Status"],
  ["contact", "Contact"],
] as const;
