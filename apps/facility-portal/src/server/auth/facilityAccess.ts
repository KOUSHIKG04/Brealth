import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import {
  listMyFacilityRoles,
  listMyInventoryFacilities,
} from "@startup/data-access";
import {
  canUsePortalArea,
  highestFacilityRole,
  type PortalArea,
} from "@startup/contracts";

async function readFacilityAccess<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await read();
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "";
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(
        message
      );
      if (attempt === 0 && transient) continue;
      if (!transient) throw error;
      throw new Error(
        "The facility service could not be reached. Please try again.",
        { cause: error }
      );
    }
  }
  throw new Error(
    "The facility service could not be reached. Please try again."
  );
}

export const getFacilityAccess = cache(async () => {
  if (!getSupabaseConfig()) redirect("/login");

  const client = await createClient();
  const { data: claims, error: authError } = await client.auth.getClaims();
  if (authError || !claims) redirect("/login");

  let facilities: Awaited<ReturnType<typeof listMyInventoryFacilities>>;
  try {
    facilities = await readFacilityAccess(() =>
      listMyInventoryFacilities(client)
    );
  } catch (error) {
    // A newly confirmed facility account has no Clinzo identity until it
    // registers its first facility. The registration RPC creates both.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42501" &&
      "message" in error &&
      error.message === "Portal membership setup is incomplete"
    ) {
      return { approved: false, facilities: [] };
    }
    throw error instanceof Error
      ? error
      : new Error("Could not verify facility access. Please try again.");
  }
  if (facilities.length === 0) return { approved: false, facilities };

  const cases = await Promise.all(
    facilities.map(async (facility) => {
      const data = await readFacilityAccess(async () => {
        const result = await client.rpc("get_my_verification_case", {
          p_subject_type: "facility",
          p_subject_id: facility.facilityId,
        });
        if (result.error) throw result.error;
        return result.data;
      });
      return data as { status?: string } | null;
    })
  );

  return {
    approved: cases.some((item) => item?.status === "verified"),
    facilities,
  };
});

export async function requireApprovedFacility() {
  const access = await getFacilityAccess();
  if (!access.approved) redirect("/facility-verification");
  return access;
}

/**
 * The signed-in user's facility roles and highest role. Before the team
 * migration every portal member is an owner, so that is the fallback.
 */
export const getFacilityRoles = cache(async () => {
  const client = await createClient();
  const roles = await readFacilityAccess(() => listMyFacilityRoles(client));
  return {
    roles: roles ?? [],
    role: roles ? highestFacilityRole(roles) : ("owner" as const),
  };
});

/** Redirects roles that cannot use a portal area (receptionists, mostly). */
export async function requirePortalArea(area: PortalArea) {
  const access = await requireApprovedFacility();
  const { role, roles } = await getFacilityRoles();
  if (!canUsePortalArea(role, area)) redirect("/appointments");
  return { ...access, role, roles };
}
