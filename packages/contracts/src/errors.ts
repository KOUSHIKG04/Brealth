// Client-safe error classification shared by every app and server boundary.
// Backend errors arrive as PostgREST/Postgres errors ({ code, message }),
// Auth errors, Edge Function responses or fetch failures.

/** Stable code of an error-like value (SQLSTATE, PostgREST or custom). */
export function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null || !("code" in cause))
    return undefined;
  const code = (cause as { code: unknown }).code;
  return code === undefined || code === null || code === ""
    ? undefined
    : String(code);
}

function errorText(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null && "message" in cause)
    return String((cause as { message: unknown }).message ?? "");
  return typeof cause === "string" ? cause : "";
}

const networkPattern =
  /network request failed|failed to fetch|networkerror|load failed|network connection was lost|internet connection appears to be offline|fetcherror/i;

/** Connectivity failure: offline, DNS, dropped connection. */
export function isNetworkError(cause: unknown) {
  return (
    (cause instanceof Error && cause.name === "NetworkError") ||
    networkPattern.test(errorText(cause))
  );
}

/** The request was abandoned after the client timeout. */
export function isTimeoutError(cause: unknown) {
  return (
    errorCode(cause) === "TIMEOUT" ||
    errorCode(cause) === "57014" ||
    (cause instanceof Error && cause.name === "TimeoutError")
  );
}

// Codes raised deliberately by our SQL/RPCs with copy written for users.
const userFacingCodes = new Set([
  "P0001", // RAISE EXCEPTION default
  "22023", // invalid parameter value: validation messages
  "23514", // booking/state guards
  "42501", // access checks
  "PT409", // changed elsewhere (optimistic version)
  "PT410", // newly conflicting schedule
]);

// Expected outcomes the user can act on; they are not application faults.
const expectedCodes = new Set([
  ...userFacingCodes,
  "23505", // duplicate
  "PGRST116", // no row
  "PGRST301", // expired/invalid JWT
  "invalid_credentials",
  "otp_expired",
  "over_request_rate_limit",
  "over_sms_send_rate_limit",
]);

/** Expected, user-actionable outcome: show it, but do not report or retry. */
export function isExpectedError(cause: unknown) {
  const code = errorCode(cause);
  return (
    isNetworkError(cause) ||
    isTimeoutError(cause) ||
    (code !== undefined && expectedCodes.has(code))
  );
}

/** Query retry policy: retry transient failures once, never user outcomes. */
export function shouldRetryRequest(failureCount: number, cause: unknown) {
  if (failureCount >= 1) return false;
  if (isNetworkError(cause) || isTimeoutError(cause)) return true;
  return !isExpectedError(cause);
}

// Database/driver internals that must never reach users.
// Coded Postgres faults (for example "could not serialize") already fall back
// because their codes are not user-facing; this catches uncoded leaks.
const internalPattern =
  /violates|constraint "|relation "|column "|syntax error|function .*does not exist|permission denied for|duplicate key|null value in|invalid input syntax|pgrst|jwt|postgres|sqlstate|edge function|non-2xx|undefined is not|cannot read propert|is not a function/i;

/**
 * Safe, readable copy for any failure. Messages written for users (our RPC
 * validation codes and plain app errors) pass through; database internals,
 * provider text and unknown codes fall back to the caller's copy.
 */
export function userErrorMessage(cause: unknown, fallback: string) {
  const code = errorCode(cause);
  if (isTimeoutError(cause))
    return "This is taking longer than usual. Check your connection and try again.";
  if (isNetworkError(cause))
    return "Could not reach the server. Check your connection and try again.";
  if (code === "PT409")
    return "This was changed somewhere else. Review the latest details and try again.";
  if (code === "23505") return "This already exists.";
  if (code === "PGRST116") return "This item is no longer available.";
  if (code === "PGRST301") return "Your session expired. Sign in again.";
  if (code === "42501" && !errorText(cause))
    return "You do not have permission to do this.";
  const message = errorText(cause).trim();
  if (!message || message.length > 300 || internalPattern.test(message))
    return fallback;
  if (code === undefined || userFacingCodes.has(code)) return message;
  return fallback;
}
