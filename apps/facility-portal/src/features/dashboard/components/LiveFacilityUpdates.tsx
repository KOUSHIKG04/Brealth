"use client";

import { useLiveFacilityUpdates } from "../hooks/useLiveFacilityUpdates";

import type { LiveFacilityUpdatesProps } from "../types/liveFacilityUpdates";

/** Quiet, self-clearing notice shown only during a sustained realtime outage. */
export function LiveFacilityUpdates({ facilityIds }: LiveFacilityUpdatesProps) {
  const { outage } = useLiveFacilityUpdates({ facilityIds });
  if (!outage) return null;
  return (
    <p
      role="status"
      className="bg-background text-muted-foreground fixed right-4 bottom-4 z-50 max-w-xs rounded-md border px-3 py-2 text-sm shadow-sm"
    >
      Live updates are paused. Refresh the page for the latest; they resume
      automatically.
    </p>
  );
}
