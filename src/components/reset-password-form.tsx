"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { forgotPasswordSchema, resetPasswordSchema, type ForgotPasswordValues, type ResetPasswordValues } from "@/lib/reset-schemas";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

function Shell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/login" className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Mark className="size-8" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-display">Khata</span>
        </Link>
        <ThemeToggle className="bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-display" />
      </div>

      <div className="mx-auto my-auto w-full max-w-sm py-10">
        <h1 className="display text-[28px] sm:text-[32px]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{intro}</p>
        <div className="mt-8 grid gap-4">{children}</div>
      </div>

      <p className="text-center text-[13px] text-disabled">
        <Link href="/login" className="text-interactive underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}

function Reveal({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="absolute inset-y-0 right-1 my-auto flex size-10 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-display focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={revealed ? "Hide password" : "Show password"}
      aria-pressed={revealed}
      onClick={onToggle}
    >
      {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * One route, two jobs. Without a token it asks for the address to send the link to;
 * with one it asks for the new password. The email link lands back here, because
 * Better Auth sends the token through the `redirectTo` callback rather than showing
 * its own page — so the wording and the styling stay Khata's.
 */
export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const request = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const reset = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  async function ask(values: ForgotPasswordValues) {
    setError(null);
    const result = await authClient.requestPasswordReset({ email: values.email, redirectTo: "/reset-password" });
    if (result.error) {
      setError(result.error.message ?? "That link could not be sent.");
      return;
    }
    // The server answers the same way for an address that exists and one that does not,
    // so this must not claim the account was found — only that the request was taken.
    setSentTo(values.email);
  }

  async function save(values: ResetPasswordValues) {
    setError(null);
    const result = await authClient.resetPassword({ newPassword: values.password, token: token ?? undefined });
    if (result.error) {
      setError(result.error.message ?? "That password could not be saved.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Shell title="Password changed" intro="Your new password is saved. Anything already signed in stays signed in.">
        <Button className="w-full" render={<Link href="/login" />} nativeButton={false}>
          Sign in
        </Button>
      </Shell>
    );
  }

  if (sentTo) {
    return (
      <Shell title="Check your inbox" intro={`If ${sentTo} has a Khata account, a reset link is on its way. It expires in an hour and works once.`}>
        <Button variant="outline" className="w-full gap-2 bg-card" onClick={() => setSentTo(null)}>
          <ArrowLeft className="size-4" />
          Use a different email
        </Button>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Nothing arrived? Check spam, then try again. Only email-and-password accounts can reset this way; a Google-only account has no password to reset.
        </p>
      </Shell>
    );
  }

  if (invalid) {
    return (
      <Shell title="That link has expired" intro="Reset links work once and last an hour. Ask for a fresh one.">
        <Button className="w-full" render={<Link href="/reset-password" />} nativeButton={false}>
          Request a new link
        </Button>
      </Shell>
    );
  }

  if (token) {
    return (
      <Shell title="Choose a new password" intro="Pick something you have not used here before.">
        <Form {...reset}>
          <form className="grid gap-4" noValidate onSubmit={reset.handleSubmit(save)}>
            <FormField
              control={reset.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input type={revealed ? "text" : "password"} autoComplete="new-password" className="pr-11" autoFocus {...field} />
                    </FormControl>
                    <Reveal revealed={revealed} onToggle={() => setRevealed((value) => !value)} />
                  </div>
                  <FormDescription>At least 8 characters.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={reset.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repeat new password</FormLabel>
                  <FormControl>
                    <Input type={revealed ? "text" : "password"} autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <ErrorNote message={error} />
            <Button type="submit" className="mt-1 w-full" disabled={reset.formState.isSubmitting}>
              {reset.formState.isSubmitting ? "Saving" : "Save password"}
            </Button>
          </form>
        </Form>
      </Shell>
    );
  }

  return (
    <Shell title="Forgot your password?" intro="Tell us the address on your account and we will email you a link to choose a new one.">
      <Form {...request}>
        <form className="grid gap-4" noValidate onSubmit={request.handleSubmit(ask)}>
          <FormField
            control={request.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <ErrorNote message={error} />
          <Button type="submit" className="mt-1 w-full" disabled={request.formState.isSubmitting}>
            {request.formState.isSubmitting ? "Sending" : "Email me a link"}
          </Button>
        </form>
      </Form>
    </Shell>
  );
}
