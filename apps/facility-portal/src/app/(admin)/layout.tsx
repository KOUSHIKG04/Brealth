import { LiveFacilityUpdates } from "@/features/dashboard";
import { LogoutButton } from "@/features/auth";
import { Suspense, type ReactNode } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { requireApprovedFacility } from "@/server/auth/facilityAccess";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireApprovedFacility();
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return (
    <Suspense fallback={<p role="status" className="text-muted-foreground p-6 text-sm">Loading facility portal…</p>}>
      <AdminLayout
      facilityName={access.facilities[0]?.facilityName ?? "Facility"}
      userName={user?.email ?? "Facility account"}
      logoutAction={<LogoutButton />}
    >
      <LiveFacilityUpdates
        facilityIds={access.facilities.map((facility) => facility.facilityId)}
      />
      {children}
      </AdminLayout>
    </Suspense>
  );
}
