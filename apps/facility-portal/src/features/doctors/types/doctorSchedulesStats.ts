export type DoctorSchedulesStatsProps = {
  scheduledShifts: number;
  departments: number;
  scheduleSummary: {
    total: number;
    available: number;
    surgery: number | null;
    emergency: number | null;
  };
};
