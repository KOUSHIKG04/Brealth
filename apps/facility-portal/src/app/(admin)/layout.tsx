import { LiveFacilityUpdates } from "@/features/dashboard";
import { LogoutButton } from "@/features/auth";
import { Suspense, type ReactNode } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import {
  getFacilityRoles,
  requireApprovedFacility,
} from "@/server/auth/facilityAccess";
import { createClient } from "@/lib/supabase/server";
import {
  canUsePortalArea,
  facilityRoleLabels,
  portalAreaMinimumRank,
  type PortalArea,
} from "@startup/contracts";

export const dynamic = "force-dynamic";

export default async function AdminRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireApprovedFacility();
  const client = await createClient();
  // Each role sees only its areas; routes and the database enforce the same.
  const [
    {
      data: { user },
    },
    { role },
  ] = await Promise.all([client.auth.getUser(), getFacilityRoles()]);
  const allowedAreas = (
    Object.keys(portalAreaMinimumRank) as PortalArea[]
  ).filter((area) => canUsePortalArea(role, area));
  return (
    <Suspense
      fallback={
        <p role="status" className="text-muted-foreground p-6 text-sm">
          Loading facility portal…
        </p>
      }
    >
      <AdminLayout
        facilityName={access.facilities[0]?.facilityName ?? "Facility"}
        userName={user?.email ?? "Facility account"}
        logoutAction={<LogoutButton />}
        allowedAreas={allowedAreas}
        roleLabel={role ? facilityRoleLabels[role] : undefined}
      >
        <LiveFacilityUpdates
          facilityIds={access.facilities.map((facility) => facility.facilityId)}
        />
        {children}
      </AdminLayout>
    </Suspense>
  );
}
