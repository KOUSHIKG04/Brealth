import type { RealtimeChannel } from "@supabase/supabase-js";
import { uuidSchema } from "@startup/contracts";
import type { AppSupabaseClient } from "../client/createSupabaseClient";

export type AppChangeKind =
  | "appointments"
  | "notifications"
  | "beds"
  | "ambulance"
  | "tracking"
  | "schedule"
  | "directory"
  | "profile"
  | "clinical";

export type AppLiveChange = { kind: AppChangeKind; topic: string };

/**
 * live: subscribed. reconnecting: a drop the client is recovering from on its
 * own (backgrounding, network switch, token rejoin). down: still disconnected
 * after the outage delay; only this state deserves user-facing feedback.
 */
export type LiveConnectionStatus = "live" | "reconnecting" | "down";

type Listener = {
  onChange: (change: AppLiveChange) => void;
  onConnected?: (topic: string) => void;
  /** Once per sustained outage; brief drops and reconnects never call it. */
  onError?: () => void;
  onStatus?: (status: LiveConnectionStatus, topic: string) => void;
};

type Entry = {
  listeners: Set<Listener>;
  channel?: RealtimeChannel;
  connected: boolean;
  status: LiveConnectionStatus;
  outageTimer?: ReturnType<typeof setTimeout>;
};

/**
 * A drop becomes an outage after initial + confirm milliseconds without a
 * reconnect. The confirm window is scheduled only after the initial timer
 * fires, so it always runs after any app suspension: resuming from the
 * background gives Realtime time to rejoin instead of reporting an outage.
 */
export const liveOutageDelays = { initial: 35_000, confirm: 10_000 };

function setStatus(entry: Entry, topic: string, status: LiveConnectionStatus) {
  if (entry.status === status) return;
  entry.status = status;
  for (const target of entry.listeners) target.onStatus?.(status, topic);
  if (status === "down")
    for (const target of entry.listeners) target.onError?.();
}

function clearOutage(entry: Entry) {
  if (entry.outageTimer !== undefined) clearTimeout(entry.outageTimer);
  entry.outageTimer = undefined;
}

function markDisconnected(entry: Entry, topic: string) {
  entry.connected = false;
  if (entry.status === "live") setStatus(entry, topic, "reconnecting");
  if (entry.outageTimer !== undefined || entry.status === "down") return;
  entry.outageTimer = setTimeout(() => {
    entry.outageTimer = setTimeout(() => {
      entry.outageTimer = undefined;
      if (!entry.connected && entry.listeners.size)
        setStatus(entry, topic, "down");
    }, liveOutageDelays.confirm);
  }, liveOutageDelays.initial);
}

const clients = new WeakMap<AppSupabaseClient, Map<string, Entry>>();

const closing = new WeakMap<AppSupabaseClient, Map<string, Promise<void>>>();

const kinds = new Set<AppChangeKind>([
  "appointments",
  "notifications",
  "beds",
  "ambulance",
  "tracking",
  "schedule",
  "directory",
  "profile",
  "clinical",
]);

/** Reuse one private channel per topic/client, including overlapping screen subscribers. */
export function subscribeAppChanges(
  client: AppSupabaseClient,
  scope: { identityId?: string; facilityIds?: string[]; directory?: boolean },
  listener: Listener
) {
  const topics = new Set<string>();
  if (scope.identityId)
    topics.add(`identity-events:${uuidSchema.parse(scope.identityId)}`);
  for (const id of scope.facilityIds ?? [])
    topics.add(`facility-events:${uuidSchema.parse(id)}`);
  if (scope.directory) topics.add("directory-events");
  let entries = clients.get(client);
  if (!entries) {
    entries = new Map();
    clients.set(client, entries);
  }
  let closingTopics = closing.get(client);
  if (!closingTopics) {
    closingTopics = new Map();
    closing.set(client, closingTopics);
  }
  const attached: [string, Entry][] = [];
  for (const topic of topics) {
    let entry = entries.get(topic);
    if (!entry) {
      entry = {
        listeners: new Set(),
        connected: false,
        status: "reconnecting",
      };
      entries.set(topic, entry);
      const current = entry;
      void Promise.resolve(closingTopics.get(topic))
        .then(() => client.realtime.setAuth())
        .then(() => {
          if (!current.listeners.size) return;
          current.channel = client
            .channel(topic, { config: { private: true } })
            .on("broadcast", { event: "app_changed" }, (event) => {
              const kind = event.payload?.kind as AppChangeKind;
              if (!kinds.has(kind)) return;
              for (const target of current.listeners)
                target.onChange({ kind, topic });
            })
            .subscribe((status) => {
              if (status === "SUBSCRIBED") {
                current.connected = true;
                clearOutage(current);
                setStatus(current, topic, "live");
                for (const target of current.listeners)
                  target.onConnected?.(topic);
              } else if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
              )
                // Realtime rejoins by itself; only a lasting drop is an outage.
                markDisconnected(current, topic);
            });
        })
        .catch(() => markDisconnected(current, topic));
    }
    entry.listeners.add(listener);
    attached.push([topic, entry]);
    if (entry.connected)
      queueMicrotask(() => {
        if (entry?.listeners.has(listener)) listener.onConnected?.(topic);
      });
    else if (entry.status === "down") {
      // A late subscriber learns about an outage that is already in progress.
      const current = entry;
      queueMicrotask(() => {
        if (current.listeners.has(listener)) {
          listener.onStatus?.("down", topic);
          listener.onError?.();
        }
      });
    }
  }
  return () => {
    for (const [topic, entry] of attached) {
      entry.listeners.delete(listener);
      if (!entry.listeners.size) {
        clearOutage(entry);
        entries!.delete(topic);
        if (entry.channel) {
          entry.connected = false;
          const removed = client
            .removeChannel(entry.channel)
            .then(() => undefined)
            .catch(() => undefined);
          closingTopics!.set(topic, removed);
          void removed.then(() => {
            if (closingTopics!.get(topic) === removed)
              closingTopics!.delete(topic);
          });
        }
      }
    }
  };
}
