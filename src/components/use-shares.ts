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
      throw new Error("Passcode required.");
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
      throw new Error("Passcode required.");
    }
    if (!response.ok && response.status !== 204) {
      const body = await readBody(response);
      throw new Error(body?.error ?? "Could not save that.");
    }
    await load();
  }

  return {
    book,
    status,
    error,
    reload: load,
    createPerson: (name: string) => send("/api/people", "POST", { name }),
    renamePerson: (id: string, name: string) => send(`/api/people/${id}`, "PATCH", { name }),
    deletePerson: (id: string) => send(`/api/people/${id}`, "DELETE"),
    createGroup: (name: string, memberIds: string[]) => send("/api/groups", "POST", { name, memberIds }),
    updateGroup: (id: string, input: { name?: string; memberIds?: string[] }) => send(`/api/groups/${id}`, "PATCH", input),
    deleteGroup: (id: string) => send(`/api/groups/${id}`, "DELETE"),
    saveExpense: (input: unknown, id?: string) => send(id ? `/api/shared-expenses/${id}` : "/api/shared-expenses", id ? "PATCH" : "POST", input),
    deleteExpense: (id: string) => send(`/api/shared-expenses/${id}`, "DELETE"),
    saveSettlement: (input: unknown) => send("/api/settlements", "POST", input),
    deleteSettlement: (id: string) => send(`/api/settlements/${id}`, "DELETE"),
  };
}
