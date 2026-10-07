"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/return-path";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function nextPath() {
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.66Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.46 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.14 15.23 0 12 0 7.31 0 3.25 2.69 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending("email");
    setError(null);
    const callbackURL = nextPath();
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password, callbackURL })
        : await authClient.signIn.email({ email, password, callbackURL });
    setPending(null);
    if (result.error) {
      setError(result.error.message ?? "Could not sign in.");
      return;
    }
    window.location.assign(callbackURL);
  }

  async function google() {
    setPending("google");
    setError(null);
    const result = await authClient.signIn.social({ provider: "google", callbackURL: nextPath() });
    if (result.error) {
      setPending(null);
      setError(result.error.message ?? "Google sign-in did not start.");
    }
  }

  const signingUp = mode === "sign-up";

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Mark className="size-10" />
      <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">Khata</p>
      <h1 className="figure mt-2 text-4xl">{signingUp ? "Open an account" : "Welcome back"}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        A private NPR ledger. Sign in to see your entries, splits, and settlements.
      </p>

      <div className="mt-8 flex rounded-lg bg-muted p-1 text-sm">
        <button
          type="button"
          className={mode === "sign-in" ? "h-9 flex-1 rounded-md bg-background font-medium shadow-sm" : "h-9 flex-1 rounded-md text-muted-foreground"}
          onClick={() => {
            setMode("sign-in");
            setError(null);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "sign-up" ? "h-9 flex-1 rounded-md bg-background font-medium shadow-sm" : "h-9 flex-1 rounded-md text-muted-foreground"}
          onClick={() => {
            setMode("sign-up");
            setError(null);
          }}
        >
          Create account
        </button>
      </div>

      {googleEnabled ? (
        <Button type="button" variant="outline" className="mt-4 h-11 w-full" disabled={pending !== null} onClick={() => void google()}>
          <GoogleMark />
          {pending === "google" ? "Redirecting" : "Continue with Google"}
        </Button>
      ) : (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Google sign-in appears after <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are set.
        </p>
      )}

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="grid gap-3" onSubmit={submit}>
        {signingUp ? (
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="h-11" required />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11"
            required
          />
        </div>
        {signingUp ? <p className="text-xs text-muted-foreground">At least 8 characters. This password stays in your database, hashed.</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="h-11" disabled={pending !== null}>
          {pending === "email" ? "Checking" : signingUp ? "Create account" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
