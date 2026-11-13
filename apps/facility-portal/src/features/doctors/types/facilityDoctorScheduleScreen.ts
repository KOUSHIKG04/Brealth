import type { TransitionStartFunction } from "react";

export type ScheduleTransition = [pending: boolean, startTransition: TransitionStartFunction];

export type Mode = "clinic" | "online" | "home";

export type FacilityDoctorScheduleScreenProps = {
  practiceId: string;
  mode?: Mode;
  onSelectMode?: (mode: Mode) => void;
  transition?: ScheduleTransition;
};
