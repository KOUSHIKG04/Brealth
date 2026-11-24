import { TeamScreen } from "@/features/team";
import { requirePortalArea } from "@/server/auth/facilityAccess";
import { facilityRoleRank } from "@startup/contracts";

export default async function TeamPage() {
  const { roles } = await requirePortalArea("team");
  // Facilities where the user is a facility admin or higher.
  const facilities = roles
    .filter(
      (item) => facilityRoleRank[item.role] >= facilityRoleRank.facility_admin
    )
    .map((item) => ({
      facilityId: item.facility_id,
      facilityName: item.facility_name,
      role: item.role,
    }));
  return <TeamScreen facilities={facilities} />;
}
