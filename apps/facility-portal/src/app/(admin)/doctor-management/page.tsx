import { DoctorManagementScreen } from "@/features/doctors";
import { requirePortalArea } from "@/server/auth/facilityAccess";
import { Suspense } from "react";

export default async function DoctorManagementPage() {
  const access = await requirePortalArea("doctorManagement");
  return (
    <Suspense
      fallback={
        <p role="status" className="text-muted-foreground p-6 text-sm">
          Loading doctors…
        </p>
      }
    >
      <DoctorManagementScreen
        facilityIds={access.facilities.map((facility) => facility.facilityId)}
      />
    </Suspense>
  );
}
