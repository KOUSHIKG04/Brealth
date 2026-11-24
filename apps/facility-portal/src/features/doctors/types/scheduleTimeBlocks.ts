import type { DoctorTimeBlock } from "@startup/contracts";

export type ScheduleTimeBlocksProps = {
  initialBlocks: DoctorTimeBlock[];
  end: string;
  pending: boolean;
  onChange: (blocks: DoctorTimeBlock[]) => void;
};
