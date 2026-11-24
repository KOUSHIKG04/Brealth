export type ServiceStatus = {
  tone: "live" | "waiting" | "off";
  label: string;
};

export type ScheduleMode = "clinic" | "online" | "home";

/** One published service drawn on the week chart, in minutes from midnight. */
export type WeekService = {
  mode: ScheduleMode;
  /** ISO weekdays, 1 = Monday. */
  days: number[];
  blocks: { start: number; end: number }[];
};

export type WeekChart = {
  /** Visible hours, rounded out to whole hours. */
  start: number;
  end: number;
  services: WeekService[];
};
