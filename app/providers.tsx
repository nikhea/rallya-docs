"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * App-wide React Query provider. The anonymous docs assistant uses it for the
 * best-effort thread-metadata sync (see app/docs/thread-meta-sync.tsx and
 * plan/anony_vistor.md). Server state here is analytics-adjacent and
 * non-critical, so retries are modest and staleTime is generous.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Created once per browser session so the client survives re-renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
