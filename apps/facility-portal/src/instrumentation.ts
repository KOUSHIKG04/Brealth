import type { Instrumentation } from "next";
import { scrubSensitiveText } from "@startup/data-access";

// One structured, scrubbed log line per server error. The digest matches the
// reference shown on the error screen, so support can find the entry.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      app: "facility-portal",
      digest,
      message: scrubSensitiveText(message).slice(0, 500),
      method: request.method,
      path: scrubSensitiveText(request.path.split("?")[0]),
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
    })
  );
};
