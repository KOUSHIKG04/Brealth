import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Clock,
  UserCheck,
  FileCheck2,
  Bell,
  IndianRupee,
  Users,
} from "lucide-react";

// Navigation items configured strictly per Figma & user requirements:
// Patients, Departments, Reports & Logs are intentionally omitted.
// `area` matches the portal areas a role may see (contracts
// `portalAreaMinimumRank`); routes enforce the same rule server-side.
export const navItems = [
  {
    title: "Dashboard",
    url: "/",
    matchUrls: ["/", "/dashboard"],
    icon: LayoutDashboard,
    area: "dashboard",
  },
  {
    title: "Bed Management",
    url: "/bed-management",
    matchUrls: ["/bed-management"],
    icon: Building2,
    area: "bedManagement",
  },
  {
    title: "Schedule",
    url: "/doctor-schedules",
    matchUrls: ["/doctor-schedules", "/doctor-management"],
    icon: CalendarDays,
    area: "doctorSchedules",
    items: [
      {
        title: "Doctor Schedule",
        url: "/doctor-schedules",
        icon: CalendarDays,
        area: "doctorSchedules",
      },
      {
        title: "Doctor Management",
        url: "/doctor-management",
        icon: UserCheck,
        area: "doctorManagement",
      },
    ],
  },
  {
    title: "Appointments",
    url: "/appointments",
    matchUrls: ["/appointments"],
    icon: Clock,
    area: "appointments",
  },
  {
    title: "Notifications",
    url: "/doctor-management?tab=notifications",
    matchUrls: [],
    icon: Bell,
    area: "notifications",
  },
  {
    title: "Transactions",
    url: "/transactions",
    matchUrls: ["/transactions"],
    icon: IndianRupee,
    area: "transactions",
  },
  {
    title: "Team",
    url: "/team",
    matchUrls: ["/team"],
    icon: Users,
    area: "team",
  },
  {
    title: "Facility Verification",
    url: "/facility-verification",
    matchUrls: ["/facility-verification"],
    icon: FileCheck2,
    area: "verification",
  },
];

export const sidebarWidthLimits = {
  min: 208,
  initial: 256,
  max: 352,
  step: 16,
};
