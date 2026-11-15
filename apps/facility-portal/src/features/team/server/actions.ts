"use server";

import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createInvitationSchema,
  userErrorMessage,
  uuidSchema,
  type CreateInvitationInput,
} from "@startup/contracts";
import {
  acceptMemberInvitation,
  createMemberInvitation,
  listFacilityTeam,
  listMyFacilityDoctors,
  revokeMemberInvitation,
  updateFacilityMember,
} from "@startup/data-access";
import { createClient } from "@/lib/supabase/server";
import { requirePortalArea } from "@/server/auth/facilityAccess";

function failure(error: unknown, fallback: string) {
  return { ok: false as const, error: userErrorMessage(error, fallback) };
}

export async function loadFacilityTeam(facilityId: string) {
  try {
    uuidSchema.parse(facilityId);
    await requirePortalArea("team");
    const client = await createClient();
    const [team, doctors] = await Promise.all([
      listFacilityTeam(client, facilityId),
      listMyFacilityDoctors(client),
    ]);
    return { ok: true as const, team, doctors };
  } catch (error) {
    unstable_rethrow(error);
    return failure(error, "Could not load the team.");
  }
}

/** Returns the one-time token; the screen builds the shareable link. */
export async function inviteFacilityMember(input: CreateInvitationInput) {
  try {
    const value = createInvitationSchema.parse(input);
    await requirePortalArea("team");
    const client = await createClient();
    const invitation = await createMemberInvitation(client, value);
    revalidatePath("/team");
    return { ok: true as const, ...invitation };
  } catch (error) {
    unstable_rethrow(error);
    return failure(error, "Could not create the invitation.");
  }
}

export async function revokeFacilityInvitation(invitationId: string) {
  try {
    uuidSchema.parse(invitationId);
    await requirePortalArea("team");
    const client = await createClient();
    await revokeMemberInvitation(client, invitationId);
    revalidatePath("/team");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return failure(error, "Could not revoke the invitation.");
  }
}

export async function updateTeamMember(input: {
  memberId: string;
  role?: "facility_admin" | "receptionist";
  active?: boolean;
  doctorPracticeIds?: string[];
}) {
  try {
    uuidSchema.parse(input.memberId);
    await requirePortalArea("team");
    const client = await createClient();
    await updateFacilityMember(client, input);
    revalidatePath("/team");
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return failure(error, "Could not update this member.");
  }
}

/** Accepts an invitation for the signed-in user, then opens the portal. */
export async function acceptFacilityInvitation(token: string) {
  let role: string;
  try {
    const client = await createClient();
    role = (await acceptMemberInvitation(client, token)).role;
  } catch (error) {
    unstable_rethrow(error);
    return failure(error, "Could not accept this invitation.");
  }
  redirect(role === "receptionist" ? "/appointments" : "/dashboard");
}
