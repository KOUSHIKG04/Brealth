"use client";

import type { LiveFacilityUpdatesProps } from "../types/liveFacilityUpdates";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import {
  reportError,
  subscribeAppChanges,
  type AppLiveChange,
} from "@startup/data-access";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function useLiveFacilityUpdates({
  facilityIds,
}: LiveFacilityUpdatesProps) {
  const scope = [...facilityIds].sort().join(":");
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  // True only during a sustained outage; brief drops recover silently.
  const [outage, setOutage] = useState(false);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);
  useEffect(() => {
    if (!scope) return;
    let active = true,
      queued = false,
      catchUp = false;
    const outages = new Set<string>();
    const changes = new Map<string, AppLiveChange>();
    const refresh = (change?: AppLiveChange) => {
      if (!active) return;
      if (change) changes.set(`${change.topic}:${change.kind}`, change);
      else catchUp = true;
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!active) return;
        const all = catchUp;
        const kinds = new Set(
          [...changes.values()].map((change) => change.kind)
        );
        if (all || kinds.has("beds"))
          void queryClient.invalidateQueries(
            { queryKey: ["facility-live-beds"] },
            { cancelRefetch: false }
          );
        if (
          all ||
          kinds.has("schedule") ||
          kinds.has("profile") ||
          kinds.has("appointments")
        ) {
          void queryClient.invalidateQueries(
            { queryKey: ["schedule-adjustments"] },
            { cancelRefetch: false }
          );
          void queryClient.invalidateQueries(
            { queryKey: ["facility-schedule-change-requests"] },
            { cancelRefetch: false }
          );
          void queryClient.invalidateQueries(
            { queryKey: ["facility-practice-schedule"] },
            { cancelRefetch: false }
          );
          void queryClient.invalidateQueries(
            { queryKey: ["facility-recovery-policy"] },
            { cancelRefetch: false }
          );
          void queryClient.invalidateQueries(
            { queryKey: ["appointment-billing"] },
            { cancelRefetch: false }
          );
          void queryClient.invalidateQueries(
            { queryKey: ["portal-transactions"] },
            { cancelRefetch: false }
          );
          void queryClient.invalidateQueries(
            { queryKey: ["portal-reschedule-options"] },
            { cancelRefetch: false }
          );
          void queryClient.invalidateQueries(
            { queryKey: ["doctors", "directory"] },
            { cancelRefetch: false }
          );
        }
        // Bed Management updates its lightweight query, without reloading the page.
        if (
          (all ||
            kinds.has("appointments") ||
            kinds.has("beds") ||
            kinds.has("schedule") ||
            kinds.has("profile")) &&
          [
            "/",
            "/dashboard",
            "/appointments",
            "/doctor-schedules",
            "/transactions",
          ].includes(path.current)
        )
          router.refresh();
        changes.clear();
        catchUp = false;
      });
    };
    const cleanup = subscribeAppChanges(
      createBrowserSupabaseClient(),
      { facilityIds: scope.split(":") },
      {
        onChange: refresh,
        onConnected: () => refresh(),
        onStatus: (status, topic) => {
          if (status === "down") outages.add(topic);
          else outages.delete(topic);
          if (active) setOutage(outages.size > 0);
        },
        onError: () => {
          // Only lasting outages while the browser is online are worth a report.
          if (onlineManager.isOnline())
            reportError(new Error("Live updates unavailable"), {
              source: "realtime",
            });
        },
      }
    );
    return () => {
      active = false;
      setOutage(false);
      cleanup();
    };
  }, [scope, queryClient, router]);
  return { outage };
}
