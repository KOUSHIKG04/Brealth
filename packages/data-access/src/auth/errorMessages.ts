// Only stable provider codes and client error classes select user-facing copy.
// Arbitrary provider/database messages must never become authentication UI text.
export function getAuthErrorMessage(error: unknown, fallback: string): string {
  const details =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; name?: unknown; status?: unknown })
      : null;

  switch (details?.code) {
    case "invalid_credentials":
      return "Could not sign in. Check your details and try again.";
    case "otp_expired":
      return "This code is invalid or has expired. Request a new code.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "email_not_confirmed":
      return "Confirm your email, then sign in again.";
    case "phone_not_confirmed":
      return "Verify your phone number, then try again.";
    case "weak_password":
      return "Choose a stronger password and try again.";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "Your session has expired. Sign in again.";
    case "request_timeout":
      return "The request timed out. Please try again.";
  }

  if (details?.status === 429) {
    return "Too many attempts. Wait a few minutes and try again.";
  }

  if (details?.name === "AuthRetryableFetchError") {
    return "Could not connect. Check your connection and try again.";
  }

  return fallback;
}
