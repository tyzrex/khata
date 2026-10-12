"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * One client per browser tab, created lazily on first use.
 *
 * Held in state rather than a module variable: a module-level client is shared by every
 * request during a server render, which lets one person's data leak into another's.
 * `useState` gives every render pass its own, and keeps one across re-renders.
 *
 * Each query sets its own `staleTime` and `refetchInterval`; this is only the
 * floor for the rest of the app.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Never retry a 401: the session is gone and the shell is already
              // redirecting to sign in. Retrying just delays that.
              const status = (error as { status?: number } | null)?.status;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
