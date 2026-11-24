"use client";

import { Button } from "./ui/button";

export type RouteErrorStateProps = {
  onRetry: () => void;
  title?: string;
  message?: string;
  /** Next.js error digest; lets support match the server log entry. */
  reference?: string;
};

/** Recoverable error screen for route and root error boundaries. */
export function RouteErrorState({
  onRetry,
  title = "This page could not be loaded",
  message = "The service may be temporarily unavailable. Check your connection and try again.",
  reference,
}: RouteErrorStateProps) {
  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6">
      <section role="alert" className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        {reference ? (
          <p className="text-muted-foreground text-xs">
            Reference: <span className="font-mono select-all">{reference}</span>
          </p>
        ) : null}
        <Button onClick={onRetry}>Try again</Button>
      </section>
    </main>
  );
}
