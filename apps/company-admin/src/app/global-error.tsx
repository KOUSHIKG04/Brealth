"use client";

import { useEffect } from "react";
import { RouteErrorState } from "@startup/web-ui/components/route-error-state";
import { reportError } from "@startup/data-access";
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      source: "root-boundary",
      digest: error.digest,
    });
  }, [error]);
  // Replaces the root layout, so it renders its own document.
  return (
    <html lang="en">
      <body>
        <RouteErrorState
          onRetry={retry}
          message="The review service may be temporarily unavailable. Check your connection and try again."
          reference={error.digest}
        />
      </body>
    </html>
  );
}
