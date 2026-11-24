import { isExpectedError } from "@startup/contracts";

/** Low-cardinality, non-personal details attached to a report. */
export type ErrorContext = Record<
  string,
  string | number | boolean | null | undefined
>;

type ErrorReporter = (error: unknown, context: ErrorContext) => void;

let reporter: ErrorReporter | null = null;

/**
 * Installs the app's monitoring sink (for example PostHog). Without a sink,
 * reports are dropped, so nothing leaves the device unless an app opts in.
 */
export function setErrorReporter(next: ErrorReporter | null) {
  reporter = next;
}

/**
 * Reports an unexpected failure. Expected outcomes (validation, conflicts,
 * offline, timeouts) are skipped: they are user feedback, not faults.
 * Never throws, so it is safe inside catch blocks and effects.
 */
export function reportError(error: unknown, context: ErrorContext = {}) {
  if (!reporter || isExpectedError(error)) return;
  try {
    reporter(error, context);
  } catch {
    // Monitoring must never break the app.
  }
}

const sensitivePatterns: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]"],
  [/\b(bearer|apikey|authorization)\s*[:=]?\s*\S+/gi, "$1 [redacted]"],
  [/\+?\d[\d\s().-]{7,}\d/g, "[number]"],
];

/** Removes emails, phone-like numbers and credentials from free text. */
export function scrubSensitiveText(text: string) {
  return sensitivePatterns.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text
  );
}

/** Deep copy of event data with every string scrubbed (depth-limited). */
export function scrubEventData<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubSensitiveText(value) as T;
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((item) => scrubEventData(item, depth + 1)) as T;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      scrubEventData(item, depth + 1),
    ])
  ) as T;
}
