"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/return-path";
import { authSchema, type AuthValues } from "@/lib/schemas";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

function nextPath() {
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  const [reveal, setReveal] = useState(false);
  const signingUp = mode === "sign-up";

  const form = useForm<AuthValues>({
    resolver: zodResolver(useMemo(() => authSchema(mode), [mode])),
    defaultValues: { name: "", email: "", password: "" },
  });

  function switchMode(next: "sign-in" | "sign-up") {
    setMode(next);
    form.clearErrors();
    setError(null);
  }

  async function onSubmit(values: AuthValues) {
    setError(null);
    const callbackURL = nextPath();
    const result = signingUp
      ? await authClient.signUp.email({ name: values.name, email: values.email, password: values.password, callbackURL })
      : await authClient.signIn.email({ email: values.email, password: values.password, callbackURL });
    if (result.error) {
      setError(result.error.message ?? "Could not sign in.");
      return;
    }
    window.location.assign(callbackURL);
  }

  async function google() {
    setGooglePending(true);
    setError(null);
    const result = await authClient.signIn.social({ provider: "google", callbackURL: nextPath() });
    if (result.error) {
      setGooglePending(false);
      setError(result.error.message ?? "Google sign-in did not start.");
    }
  }

  const submitting = form.formState.isSubmitting;
  const busy = submitting || googlePending;

  const seg = (active: boolean) =>
    "h-full flex-1 rounded-md text-[13px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring " +
    (active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-display");

  return (
    <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Mark className="size-8" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-display">Khata</span>
        </div>
        <ThemeToggle className="bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-display" />
      </div>

      <div className="mx-auto my-auto w-full max-w-sm py-10">
        <h1 className="display text-[28px] sm:text-[32px]">{signingUp ? "Create your khata" : "Welcome back"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{signingUp ? "A private NPR ledger, with friends and settle-up built in." : "Sign in to see your entries, splits and settlements."}</p>

        <div className="mt-8 flex h-10 items-center rounded-xl bg-card p-1 shadow-card" role="group" aria-label="Mode">
          <button type="button" aria-pressed={!signingUp} className={seg(!signingUp)} onClick={() => switchMode("sign-in")}>
            Sign in
          </button>
          <button type="button" aria-pressed={signingUp} className={seg(signingUp)} onClick={() => switchMode("sign-up")}>
            Create account
          </button>
        </div>

        {googleEnabled ? (
          <>
            <Button type="button" variant="outline" className="mt-4 w-full gap-2.5 bg-card shadow-card" disabled={busy} onClick={() => void google()}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
              </svg>
              {googlePending ? "Redirecting" : "Continue with Google"}
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

        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            {signingUp ? (
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ) : null}

            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input type={reveal ? "text" : "password"} autoComplete={signingUp ? "new-password" : "current-password"} className="pr-11" {...field} value={field.value ?? ""} />
                  </FormControl>
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
                <FormDescription>{signingUp ? "At least 8 characters. Stored hashed, never in plain text." : undefined}</FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="mt-1 w-full" disabled={busy}>
              {submitting ? "Checking" : signingUp ? "Create account" : "Sign in"}
            </Button>
          </form>
        </Form>
      </div>

      <p className="text-center text-xs text-disabled">Private by default. Your ledger is only visible to you.</p>
    </main>
  );
}