// Structured, scrubbed failure logs for Edge Functions. Supabase keeps
// console output in the function logs; one JSON line per failure makes it
// searchable by function, stage and request without exposing personal data.

type LogContext = Record<string, string | number | boolean | null | undefined>;

const sensitivePatterns: [RegExp, string][] = [
  [/([?&](?:key|api_key|apikey|token|signature)=)[^&\s"]+/gi, "$1[redacted]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]"],
  [/\b(bearer|basic)\s+\S+/gi, "$1 [redacted]"],
  [/\+?\d[\d\s().-]{7,}\d/g, "[number]"],
];

function scrub(text: string) {
  return sensitivePatterns
    .reduce(
      (value, [pattern, replacement]) => value.replace(pattern, replacement),
      text
    )
    .slice(0, 500);
}

/** Request correlation id from the platform, else a fresh one. */
export function requestId(request: Request) {
  return (
    request.headers.get("sb-request-id") ??
    request.headers.get("x-request-id") ??
    crypto.randomUUID()
  );
}

/** Logs one failure. Never throws, so it is safe inside catch blocks. */
export function logFailure(
  fn: string,
  stage: string,
  error: unknown,
  context: LogContext = {},
  level: "error" | "warn" = "error"
) {
  try {
    const entry = {
      level,
      fn,
      stage,
      error_name: error instanceof Error ? error.name : typeof error,
      message: scrub(error instanceof Error ? error.message : String(error)),
      ...context,
      at: new Date().toISOString(),
    };
    (level === "warn" ? console.warn : console.error)(JSON.stringify(entry));
  } catch {
    // Logging must never change a function's response.
  }
}
