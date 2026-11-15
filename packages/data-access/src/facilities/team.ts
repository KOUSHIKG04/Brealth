import {
  createInvitationSchema,
  facilityTeamSchema,
  memberInvitationPreviewSchema,
  myFacilityRoleSchema,
  uuidSchema,
  type CreateInvitationInput,
} from "@startup/contracts";
import type { AppSupabaseClient } from "../client/createSupabaseClient";

function rpcError(error: { message: string }) {
  return Object.assign(new Error(error.message), error);
}

/** The signed-in portal user's role at each facility. */
export async function listMyFacilityRoles(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("list_my_facility_roles");
  if (error) {
    // Before the team migration every portal member was an owner.
    if (error.code === "PGRST202") return null;
    throw rpcError(error);
  }
  return myFacilityRoleSchema.array().parse(data);
}

export async function listFacilityTeam(
  client: AppSupabaseClient,
  facilityId: string
) {
  const { data, error } = await client.rpc("list_facility_team", {
    p_facility_id: uuidSchema.parse(facilityId),
  });
  if (error) throw rpcError(error);
  return facilityTeamSchema.parse(data);
}

/** Creates an invitation; the token is returned only once, for the link. */
export async function createMemberInvitation(
  client: AppSupabaseClient,
  input: CreateInvitationInput
) {
  const value = createInvitationSchema.parse(input);
  const { data, error } = await client.rpc("create_member_invitation", {
    p_facility_id: value.facilityId,
    p_role: value.role,
    p_email: value.email,
    p_doctor_practice_ids: value.doctorPracticeIds,
  });
  if (error) throw rpcError(error);
  return data as { id: string; token: string; expires_at: string };
}

export async function revokeMemberInvitation(
  client: AppSupabaseClient,
  invitationId: string
) {
  const { error } = await client.rpc("revoke_member_invitation", {
    p_invitation_id: uuidSchema.parse(invitationId),
  });
  if (error) throw rpcError(error);
}

export async function getMemberInvitation(
  client: AppSupabaseClient,
  token: string
) {
  const { data, error } = await client.rpc("get_member_invitation", {
    p_token: token,
  });
  if (error) throw rpcError(error);
  return memberInvitationPreviewSchema.parse(data);
}

export async function acceptMemberInvitation(
  client: AppSupabaseClient,
  token: string
) {
  const { data, error } = await client.rpc("accept_member_invitation", {
    p_token: token,
  });
  if (error) throw rpcError(error);
  return data as {
    organization_id: string;
    facility_id: string | null;
    role: string;
  };
}

export async function updateFacilityMember(
  client: AppSupabaseClient,
  input: {
    memberId: string;
    role?: "facility_admin" | "receptionist";
    active?: boolean;
    doctorPracticeIds?: string[];
  }
) {
  const { error } = await client.rpc("update_facility_member", {
    p_member_id: uuidSchema.parse(input.memberId),
    p_role: input.role ?? null,
    p_active: input.active ?? null,
    p_doctor_practice_ids: input.doctorPracticeIds
      ? input.doctorPracticeIds.map((id) => uuidSchema.parse(id))
      : null,
  });
  if (error) throw rpcError(error);
}
