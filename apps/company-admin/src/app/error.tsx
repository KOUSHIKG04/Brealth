"use client";

import { useEffect } from "react";
import { RouteErrorState } from "@startup/web-ui/components/route-error-state";
import { reportError } from "@startup/data-access";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      source: "route-boundary",
      digest: error.digest,
    });
  }, [error]);
  return (
    <RouteErrorState
      onRetry={retry}
      message="The review service may be temporarily unavailable. Check your connection and try again."
      reference={error.digest}
    />
  );
}
