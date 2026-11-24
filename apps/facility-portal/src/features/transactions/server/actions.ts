"use server";

import { listPortalAppointmentTransactions } from "@startup/data-access";
import { portalTransactionCursorSchema } from "@startup/contracts";
import { requireApprovedFacility } from "@/server/auth/facilityAccess";
import { createClient } from "@/lib/supabase/server";

export async function loadPortalTransactions(cursor: unknown = null) {
  await requireApprovedFacility();
  const parsed =
    cursor === null ? undefined : portalTransactionCursorSchema.parse(cursor);
  return listPortalAppointmentTransactions(await createClient(), parsed);
}
