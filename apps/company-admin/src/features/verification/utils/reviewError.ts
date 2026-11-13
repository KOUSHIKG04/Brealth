import { userErrorMessage } from "@startup/contracts";

export function reviewErrorMessage(cause: unknown, fallback: string): string {
  // Handles Error instances and plain Supabase RPC error objects alike.
  return userErrorMessage(cause, fallback);
}
