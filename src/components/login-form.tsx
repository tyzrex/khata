"use client";

import { useEffect, useState } from "react";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function nextPath() {
  const value = new URLSearchParams(window.location.search).get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function LoginForm() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/status")
      .then((response) => response.json())
      .then((body: { authenticated?: boolean }) => {
        if (body.authenticated) window.location.replace(nextPath());
      })
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Could not unlock the ledger.");
        return;
      }
      window.location.replace(nextPath());
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <Mark className="size-10" />
      <h1 className="figure mt-6 text-4xl">Unlock Khata</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">This ledger is gated by the server passcode. It is not an account.</p>
      <form className="mt-8 grid gap-3" onSubmit={submit}>
        <Label htmlFor="passcode">Passcode</Label>
        <Input id="passcode" type="password" autoComplete="current-password" value={passcode} onChange={(event) => setPasscode(event.target.value)} className="h-11" required />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? "Checking" : "Open the ledger"}
        </Button>
      </form>
    </main>
  );
}
