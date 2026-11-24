import { useState, useSyncExternalStore, type ReactNode } from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  MutationCache,
  onlineManager,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { shouldRetryRequest } from "@startup/contracts";
import { reportError } from "@startup/data-access";
import { OfflineBanner } from "@startup/mobile-ui";

// Queries and mutations pause while offline and resume on reconnect.
// An unknown state (null) at startup counts as online.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false))
);

function useIsOnline() {
  return useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () =>
    onlineManager.isOnline()
  );
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
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
          queries: {
            staleTime: 30_000,
            retry: shouldRetryRequest,
          },
        },
      })
  );
  const online = useIsOnline();

  return (
    <QueryClientProvider client={client}>
      {children}
      <OfflineBanner visible={!online} theme="doctor" />
    </QueryClientProvider>
  );
}
