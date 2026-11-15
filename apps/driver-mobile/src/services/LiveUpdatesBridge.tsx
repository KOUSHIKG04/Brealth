import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import {
  reportError,
  subscribeAppChanges,
  type AppChangeKind,
} from "@startup/data-access";
import { OfflineBanner } from "@startup/mobile-ui";
import { mobileSession, supabase } from "./supabase";

const queryKeys: Partial<Record<AppChangeKind, string[]>> = {
  notifications: ["my-notifications"],
  ambulance: ["driver-fleet", "driver-offers", "my-driver-trips"],
  profile: [
    "driver-registration-application",
    "my-driver-verification",
    "my-driver-profile",
    "driver-fleet",
    "driver-offers",
    "my-driver-trips",
  ],
};

export function LiveUpdatesBridge({ identityId }: { identityId?: string }) {
  const queryClient = useQueryClient();
  // True only during a sustained outage; brief drops recover silently.
  const [outage, setOutage] = useState(false);
  useEffect(() => {
    if (!supabase || !identityId) return;
    let active = true;
    let queued = false;
    let catchUp = false;
    let sessionRefreshing = false;
    let sessionAgain = false;
    const outages = new Set<string>();
    const pending = new Set<AppChangeKind>();
    const refresh = (kind?: AppChangeKind) => {
      if (!active) return;
      if (kind) pending.add(kind);
      else catchUp = true;
      if (AppState.currentState !== "active" || queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!active || AppState.currentState !== "active") return;
        const refreshProfile = catchUp || pending.has("profile");
        if (catchUp)
          void queryClient.invalidateQueries({}, { cancelRefetch: true });
        else {
          const affected = new Set(
            [...pending].flatMap((change) => queryKeys[change] ?? [])
          );
          for (const key of affected)
            void queryClient.invalidateQueries(
              { queryKey: [key] },
              { cancelRefetch: true }
            );
        }
        pending.clear();
        catchUp = false;
        if (refreshProfile) {
          sessionAgain = true;
          if (!sessionRefreshing) {
            sessionRefreshing = true;
            void (async () => {
              try {
                while (
                  active &&
                  sessionAgain &&
                  AppState.currentState === "active"
                ) {
                  sessionAgain = false;
                  await mobileSession.refresh();
                }
              } finally {
                sessionRefreshing = false;
              }
            })();
          }
        }
      });
    };
    const cleanup = subscribeAppChanges(
      supabase,
      { identityId, directory: false },
      {
        onChange: (change) => refresh(change.kind),
        onConnected: () => refresh(),
        onStatus: (status, topic) => {
          if (status === "down") outages.add(topic);
          else outages.delete(topic);
          if (active) setOutage(outages.size > 0);
        },
        onError: () => {
          // Only lasting outages while the device is online are worth a report.
          if (onlineManager.isOnline())
            reportError(new Error("Live updates unavailable"), {
              source: "realtime",
            });
        },
      }
    );
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      active = false;
      setOutage(false);
      cleanup();
      appState.remove();
    };
  }, [identityId, queryClient]);
  // Offline devices already see the offline banner; this covers realtime only.
  return (
    <OfflineBanner
      visible={outage && onlineManager.isOnline()}
      theme="driver"
      message="Live updates are paused. Pull down to refresh; they resume automatically."
    />
  );
}
