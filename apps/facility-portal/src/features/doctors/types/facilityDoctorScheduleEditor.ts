import type { ScheduleTransition } from "./facilityDoctorScheduleScreen";

import type { Mode } from "./facilityDoctorScheduleScreen";

export type FacilityDoctorScheduleEditorProps = {
  practiceId: string;
  mode: Mode;
  onSelectMode?: (mode: Mode) => void;
  transition?: ScheduleTransition;
};
