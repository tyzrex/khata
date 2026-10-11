"use client";

import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/lib/api-client";
import type { SessionDto } from "@/db/profile";

/** Signed-in sessions, and the one flag the account screen needs beyond the session itself. */
export const sessionsKey = ["sessions"] as const;
export const accountKey = ["account"] as const;

export const sessionsQuery = queryOptions({
  queryKey: sessionsKey,
  queryFn: () => requestJson<{ sessions: SessionDto[] }>("/api/sessions").then((body) => body.sessions),
  /**
   * The session list is the one screen here that is genuinely live: it changes when a person
   * signs in or out elsewhere. A short stale time plus refetch on focus means opening Settings
   * shows the truth without a background poll.
   */
  staleTime: 15_000,
});

export const accountQuery = queryOptions({
  queryKey: accountKey,
  queryFn: () => requestJson<{ hasPassword: boolean }>("/api/account"),
  /** Answered from the session's cookie cache, so it is effectively free. */
  staleTime: 5 * 60_000,
});

export function deleteSession(id: string) {
  return requestJson<void>(`/api/sessions/${id}`, { method: "DELETE" });
}

export function postRevokeOtherSessions() {
  return requestJson<unknown>("/api/sessions/revoke-others", { method: "POST" });
}