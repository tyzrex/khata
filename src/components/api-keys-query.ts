"use client";

import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/lib/api-client";
import type { AgentScope } from "@/lib/agent-permissions";

/** Personal API keys: one list, mutated in place and refetched after each change. */
export const apiKeysKey = ["api-keys"] as const;
export const agentActivityQuery = queryOptions({
  queryKey: ["agent-activity"],
  queryFn: () => requestJson<{ operations: { id: string; agentName: string; tool: string; status: string; replayed: boolean; createdAt: string }[] }>("/api/keys/activity").then((body) => body.operations),
  staleTime: 30_000,
});

export type ApiKey = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; scopes: AgentScope[]; expiresAt: string | null };

export const apiKeysQuery = queryOptions({
  queryKey: apiKeysKey,
  queryFn: () => requestJson<{ keys: ApiKey[] }>("/api/keys").then((body) => body.keys),
  /** Keys change only when this card changes them, and it invalidates directly. */
  staleTime: 60_000,
});

/** The full token is in the response once and never again, so it rides with the created key. */
export function postApiKey(name: string, scopes: AgentScope[] = ["read", "write"], expiresInDays: number | null = null) {
  return requestJson<{ key: ApiKey; token: string }>("/api/keys", { method: "POST", json: { name, scopes, expiresInDays } });
}

export function deleteApiKey(id: string) {
  return requestJson<void>(`/api/keys/${id}`, { method: "DELETE" });
}
