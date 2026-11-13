"use client";

import {
  isServer,
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { shouldRetryRequest } from "@startup/contracts";
import { reportError } from "@startup/data-access";

function createQueryClient() {
  return new QueryClient({
    // Screens show their own feedback; caches only report unexpected faults.
    queryCache: new QueryCache({
      onError: (error, query) =>
        reportError(error, {
          source: "query",
          query: String(query.queryKey[0]),
        }),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        reportError(error, {
          source: "mutation",
          mutation: String(mutation.options.mutationKey?.[0] ?? "unnamed"),
        }),
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetryRequest },
    },
  });
}

let browserClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) return createQueryClient();

  browserClient ??= createQueryClient();
  return browserClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}
