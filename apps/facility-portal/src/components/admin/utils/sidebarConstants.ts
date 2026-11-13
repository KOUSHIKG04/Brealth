import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Clock,
  UserCheck,
  FileCheck2,
  Bell,
  IndianRupee,
} from "lucide-react";

// Navigation items configured strictly per Figma & user requirements:
// Patients, Departments, Reports & Logs are intentionally omitted.
export const navItems = [
  {
    title: "Dashboard",
    url: "/",
    matchUrls: ["/", "/dashboard"],
    icon: LayoutDashboard,
  },
  {
    title: "Bed Management",
    url: "/bed-management",
    matchUrls: ["/bed-management"],
    icon: Building2,
  },
  {
    title: "Schedule",
    url: "/doctor-schedules",
    matchUrls: ["/doctor-schedules", "/doctor-management"],
    icon: CalendarDays,
    items: [
      {
        title: "Doctor Schedule",
        url: "/doctor-schedules",
        icon: CalendarDays,
      },
      {
        title: "Doctor Management",
        url: "/doctor-management",
        icon: UserCheck,
      },
    ],
  },
  {
    title: "Appointments",
    url: "/appointments",
    matchUrls: ["/appointments"],
    icon: Clock,
  },
  {
    title: "Notifications",
    url: "/doctor-management?tab=notifications",
    matchUrls: [],
    icon: Bell,
  },
  {
    title: "Transactions",
    url: "/transactions",
    matchUrls: ["/transactions"],
    icon: IndianRupee,
  },
  {
    title: "Facility Verification",
    url: "/facility-verification",
    matchUrls: ["/facility-verification"],
    icon: FileCheck2,
  },
];

export const sidebarWidthLimits = {
  min: 208,
  initial: 256,
  max: 352,
  step: 16,
};
