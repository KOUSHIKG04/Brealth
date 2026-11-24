// Default client deadlines. Uploads and Edge Functions (payments, maps) need
// longer than database reads; realtime uses WebSockets and is unaffected.
export const requestTimeouts = {
  default: 20_000,
  functions: 45_000,
  storage: 120_000,
} as const;

function timeoutFor(url: string) {
  if (url.includes("/storage/v1/")) return requestTimeouts.storage;
  if (url.includes("/functions/v1/")) return requestTimeouts.functions;
  return requestTimeouts.default;
}

/**
 * Wraps fetch with a per-request deadline while honouring a caller's own
 * AbortSignal. A timed-out request rejects with a TimeoutError (code TIMEOUT)
 * that the shared error copy maps to a connection message.
 */
export function createTimeoutFetch(
  baseFetch: typeof fetch = fetch
): typeof fetch {
  return async (input, init = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const controller = new AbortController();
    const callerSignal = init.signal;
    let timedOut = false;
    const forwardAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutFor(url));
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (cause) {
      if (timedOut)
        throw Object.assign(new Error("Request timed out"), {
          name: "TimeoutError",
          code: "TIMEOUT",
        });
      throw cause;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardAbort);
    }
  };
}
