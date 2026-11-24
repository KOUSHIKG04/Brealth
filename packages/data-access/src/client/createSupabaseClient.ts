import {
  createClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import type { Database } from "../generated/database.types";
import { createTimeoutFetch } from "./timeoutFetch";

// Apps supply public configuration and platform-specific session storage. // Never pass database URLs or service-role/secret keys to client applications.
export function createSupabaseClient(
  url: string,
  publishableKey: string,
  options?: SupabaseClientOptions<"public">
) {
  if (!url || !publishableKey) {
    throw new Error("Supabase URL and publishable key are required");
  }
  // Every request gets a deadline unless the app supplies its own fetch.
  return createClient<Database>(url, publishableKey, {
    ...options,
    global: {
      ...options?.global,
      fetch: options?.global?.fetch ?? createTimeoutFetch(),
    },
  });
}

export type AppSupabaseClient = ReturnType<typeof createSupabaseClient>;
