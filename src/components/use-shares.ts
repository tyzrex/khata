"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ShareBook } from "@/db/shares";

async function readBody(response: Response) {
  return (await response.json().catch(() => null)) as { error?: string } | null;
}

export function useShares() {
  const router = useRouter();
  const [book, setBook] = useState<ShareBook | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/shares");
    if (response.status === 401) {
      router.push("/login");
      throw new Error("Sign in required.");
    }
    const body = await readBody(response);
    if (!response.ok) throw new Error(body?.error ?? "The share book could not be read.");
    setBook(body as ShareBook);
    setStatus("ready");
    setError(null);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const response = await fetch("/api/shares");
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        const body = await readBody(response);
        if (!response.ok) throw new Error(body?.error ?? "The share book could not be read.");
        if (cancelled) return;
        setBook(body as ShareBook);
        setStatus("ready");
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "The share book could not be read.");
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function send(path: string, method: string, payload?: unknown) {
    const response = await fetch(path, {
      method,
      headers: payload === undefined ? undefined : { "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (response.status === 401) {
      router.push("/login");
      throw new Error("Sign in required.");
    }
    if (!response.ok && response.status !== 204) {
      const body = await readBody(response);
      throw new Error(body?.error ?? "Could not save that.");
    }
    const body = response.status === 204 ? null : await readBody(response);
    await load();
    return body;
  }

  async function sendVoid(path: string, method: string, payload?: unknown) {
    await send(path, method, payload);
  }

  return {
    book,
    status,
    error,
    reload: load,
    createPerson: (name: string) => sendVoid("/api/people", "POST", { name }),
    renamePerson: (id: string, name: string) => sendVoid(`/api/people/${id}`, "PATCH", { name }),
    deletePerson: (id: string) => sendVoid(`/api/people/${id}`, "DELETE"),
    createGroup: (name: string, memberIds: string[]) => sendVoid("/api/groups", "POST", { name, memberIds }),
    updateGroup: (id: string, input: { name?: string; memberIds?: string[] }) => sendVoid(`/api/groups/${id}`, "PATCH", input),
    deleteGroup: (id: string) => sendVoid(`/api/groups/${id}`, "DELETE"),
    addFriend: async (name: string) => {
      const body = (await send("/api/people", "POST", { name })) as { person?: { id: string } } | null;
      return body?.person?.id ?? null;
    },
    addGroup: async (name: string, memberIds: string[]) => {
      const body = (await send("/api/groups", "POST", { name, memberIds })) as { id?: string } | null;
      return body?.id ?? null;
    },
    ensureDirect: async (personId: string) => {
      const body = (await send(`/api/people/${personId}/direct`, "POST")) as { id?: string } | null;
      if (!body?.id) throw new Error("Could not open a shared book with that friend.");
      return body.id;
    },
    createInvite: async (groupId: string, input: { email?: string; personId?: string }) => {
      const response = await fetch(`/api/groups/${groupId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.status === 401) {
        router.push("/login");
        throw new Error("Sign in required.");
      }
      const body = (await readBody(response)) as { error?: string; url?: string; emailSent?: boolean } | null;
      if (!response.ok || !body?.url) throw new Error(body?.error ?? "Could not create that invite.");
      return { url: body.url, emailSent: Boolean(body.emailSent) };
    },
    saveExpense: (input: unknown, id?: string) => sendVoid(id ? `/api/shared-expenses/${id}` : "/api/shared-expenses", id ? "PATCH" : "POST", input),
    deleteExpense: (id: string) => sendVoid(`/api/shared-expenses/${id}`, "DELETE"),
    saveSettlement: (input: unknown) => sendVoid("/api/settlements", "POST", input),
    deleteSettlement: (id: string) => sendVoid(`/api/settlements/${id}`, "DELETE"),
  };
}
