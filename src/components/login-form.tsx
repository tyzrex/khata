"use client";

import { ArrowRightLeft, BookOpen, Eye, EyeOff, Smartphone, Users } from "lucide-react";
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

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [reveal, setReveal] = useState(false);

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

  const seg = (active: boolean) =>
    "h-full flex-1 rounded-md text-[13px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring " +
    (active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-display");

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-10 text-brand-foreground lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <span className="rounded-full ring-2 ring-white/40">
            <Mark className="block size-9" />
          </span>
          <span className="text-base font-semibold tracking-[-0.02em]">Khata</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] xl:text-[40px]">Your money and your splits, in one calm book.</h2>
          <ul className="mt-10 grid gap-5 text-sm">
            {[
              { icon: BookOpen, title: "A ledger for bank and cash", text: "Every rupee in and out, in AD or BS dates." },
              { icon: Users, title: "Split with friends and groups", text: "Equal, exact, shares or percent. Everyone sees the same numbers." },
              { icon: ArrowRightLeft, title: "Settle up in fewer payments", text: "Balances simplify themselves, and each payment links to your bank line." },
              { icon: Smartphone, title: "Installs like an app", text: "Add it to your home screen and it opens straight to your book." },
            ].map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/12" aria-hidden>
                  <item.icon className="size-4" />
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="mt-0.5 block leading-5 opacity-75">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-60">Private by default. Your ledger is only visible to you.</p>
      </aside>

      <div className="relative flex min-h-dvh flex-col px-5 py-6 sm:px-8 lg:min-h-0 lg:justify-center lg:px-12">
        <div className="flex items-center justify-between lg:absolute lg:inset-x-12 lg:top-8 lg:justify-end">
          <div className="flex items-center gap-2.5 lg:hidden">
            <Mark className="size-8" />
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-display">Khata</span>
          </div>
          <ThemeToggle className="bg-card shadow-card" />
        </div>

        <div className="mx-auto my-auto w-full max-w-sm py-10 lg:my-0 lg:py-0">
          <h1 className="display text-[28px] sm:text-[32px]">{signingUp ? "Create your khata" : "Welcome back"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{signingUp ? "A private NPR ledger, with friends and settle-up built in." : "Sign in to see your entries, splits and settlements."}</p>

          <div className="mt-8 flex h-10 items-center rounded-xl bg-card p-1 shadow-card" role="group" aria-label="Mode">
            <button
              type="button"
              aria-pressed={!signingUp}
              className={seg(!signingUp)}
              onClick={() => {
                setMode("sign-in");
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={signingUp}
              className={seg(signingUp)}
              onClick={() => {
                setMode("sign-up");
                setError(null);
              }}
            >
              Create account
            </button>
          </div>

          {googleEnabled ? (
            <>
              <Button type="button" variant="outline" className="mt-4 w-full gap-2.5 bg-card shadow-card" disabled={pending !== null} onClick={() => void google()}>
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
                  <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
                  <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
                  <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
                </svg>
                {pending === "google" ? "Redirecting" : "Continue with Google"}
              </Button>
              <div className="my-6 flex items-center gap-3 text-xs text-disabled" aria-hidden>
                <span className="h-px flex-1 bg-input" />
                or with email
                <span className="h-px flex-1 bg-input" />
              </div>
            </>
          ) : (
            <>
              {process.env.NODE_ENV === "development" ? (
                <p className="mt-4 text-xs leading-5 text-disabled">
                  Google sign-in appears after <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are set.
                </p>
              ) : null}
              <div className="h-6" />
            </>
          )}

          <form className="grid gap-4" onSubmit={submit}>
            {signingUp ? (
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={reveal ? "text" : "password"}
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  minLength={8}
                  className="pr-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-1 my-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-display focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={reveal ? "Hide password" : "Show password"}
                  aria-pressed={reveal}
                  onClick={() => setReveal((value) => !value)}
                >
                  {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {signingUp ? <p className="text-xs text-muted-foreground">At least 8 characters. Stored hashed, never in plain text.</p> : null}
            </div>
            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="mt-1 w-full" disabled={pending !== null}>
              {pending === "email" ? "Checking" : signingUp ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
