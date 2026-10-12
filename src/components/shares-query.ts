"use client";

import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "@/lib/api-client";
import { IDEMPOTENCY_HEADER, submitOnce } from "@/lib/submit-once";
import type { ShareBook } from "@/db/shares";

/**
 * The share book's cache contract: one resource, one key.
 *
 * Everything a person can change in a shared book — people, groups, invites, expenses,
 * settlements, leaving — is a write against this single read, so every mutation invalidates
 * this key rather than trying to patch a copy. Balances are derived, never stored, so a local
 * edit would have to recompute the same debt matrix the server does; refetching the one read
 * is both simpler and impossible to get wrong.
 */
export const sharesKey = ["shares"] as const;

export const sharesQuery = queryOptions({
  queryKey: sharesKey,
  queryFn: () => requestJson<ShareBook>("/api/shares"),
  /**
   * The book is read behind the server render and re-read after every write. Short enough
   * that a stale balance is corrected quickly, long enough to collapse the bursts a dialog
   * produces (save expense, then re-open, then save again) into one request.
   */
  staleTime: 15_000,
});

type PersonResponse = { person?: { id: string } };
type GroupResponse = { id?: string };
type InviteResponse = { url: string; emailSent?: boolean };

export function postPerson(name: string) {
  return requestJson<PersonResponse>("/api/people", { method: "POST", json: { name } });
}

export function patchPerson(id: string, name: string) {
  return requestJson<unknown>(`/api/people/${id}`, { method: "PATCH", json: { name } });
}

export function deletePerson(id: string) {
  return requestJson<unknown>(`/api/people/${id}`, { method: "DELETE" });
}

export function postGroup(name: string, memberIds: string[]) {
  return requestJson<GroupResponse>("/api/groups", { method: "POST", json: { name, memberIds } });
}

export function patchGroup(id: string, input: { name?: string; memberIds?: string[] }) {
  return requestJson<unknown>(`/api/groups/${id}`, { method: "PATCH", json: input });
}

export function deleteGroup(id: string) {
  return requestJson<unknown>(`/api/groups/${id}`, { method: "DELETE" });
}

export function postLeaveGroup(id: string) {
  return requestJson<unknown>(`/api/groups/${id}/leave`, { method: "POST" });
}

export function postDirect(personId: string) {
  return requestJson<GroupResponse>(`/api/people/${personId}/direct`, { method: "POST" });
}

export function postInvite(groupId: string, input: { email?: string; personId?: string }) {
  return requestJson<InviteResponse>(`/api/groups/${groupId}/invite`, { method: "POST", json: input });
}

export function postExpense(input: unknown, id?: string) {
  if (id) return requestJson<unknown>(`/api/shared-expenses/${id}`, { method: "PATCH", json: input });
  return submitOnce("expense", input, (key) => requestJson<unknown>("/api/shared-expenses", { method: "POST", json: input, headers: { [IDEMPOTENCY_HEADER]: key } }));
}

export function deleteExpense(id: string) {
  return requestJson<void>(`/api/shared-expenses/${id}`, { method: "DELETE" });
}

export function postSettlement(input: unknown, id?: string) {
  if (id) return requestJson<unknown>(`/api/settlements/${id}`, { method: "PATCH", json: input });
  return submitOnce("settlement", input, (key) => requestJson<unknown>("/api/settlements", { method: "POST", json: input, headers: { [IDEMPOTENCY_HEADER]: key } }));
}

export function deleteSettlement(id: string) {
  return requestJson<void>(`/api/settlements/${id}`, { method: "DELETE" });
}