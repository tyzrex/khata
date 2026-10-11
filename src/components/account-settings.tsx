"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LogOut, Monitor, ShieldAlert, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "@/lib/status";
import { authClient } from "@/lib/auth-client";
import { unsubscribePushLocally } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { SessionDto } from "@/db/profile";

const nameSchema = z.object({ name: z.string().trim().min(1, "Tell us what to call you").max(80, "That name is too long") });
const emailSchema = z.object({ newEmail: z.email("Enter a valid email address").max(200, "That address is too long") });
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Use at least 8 characters").max(128),
    confirm: z.string(),
  })
  .refine((values) => values.confirm === values.newPassword, { path: ["confirm"], message: "The two passwords do not match" });

type NameValues = z.infer<typeof nameSchema>;
type EmailValues = z.infer<typeof emailSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

function errorMessage(error: { message?: string } | null | undefined, fallback: string) {
  return error?.message ?? fallback;
}

/** A short, human label for a session, from whatever the browser sent. */
function describe(userAgent: string | null, ipAddress: string | null) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "A browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  const Icon = /iPhone|iPad|iPod|Android|Mobile/.test(ua) ? Smartphone : Monitor;
  return { label: os ? `${browser} on ${os}` : browser, Icon, where: ipAddress };
}

export function AccountSettings({
  user,
  hasPassword,
  onSignOut,
}: {
  user: { name: string; email: string; emailVerified?: boolean };
  /** null until the server has answered. */
  hasPassword: boolean | null;
  onSignOut: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();

  const loadSessions = useCallback(async () => {
    const response = await fetch("/api/sessions");
    if (!response.ok) throw new Error("Sessions could not be loaded.");
    return ((await response.json()) as { sessions: SessionDto[] }).sessions;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSessions().then(
      (list) => {
        if (cancelled) return;
        setSessions(list);
        setSessionsError(null);
      },
      (caught: unknown) => !cancelled && setSessionsError(caught instanceof Error ? caught.message : "Sessions could not be loaded."),
    );
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const nameForm = useForm<NameValues>({ resolver: zodResolver(nameSchema), defaultValues: { name: user.name } });
  const emailForm = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { newEmail: user.email } });
  const passwordForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });

  async function saveName(values: NameValues) {
    setBusy("name");
    const { error } = await authClient.updateUser({ name: values.name });
    setBusy(null);
    if (error) {
      nameForm.setError("name", { message: errorMessage(error, "Your name could not be changed.") });
      return;
    }
    nameForm.reset(values);
    // The shell's avatar and name are rendered on the server from the session, so a
    // refresh is what gets the new name into the nav and the user card.
    router.refresh();
    toast.success("Name updated");
  }

  async function saveEmail(values: EmailValues) {
    setBusy("email");
    const { error } = await authClient.changeEmail({ newEmail: values.newEmail });
    setBusy(null);
    if (error) {
      emailForm.setError("newEmail", { message: errorMessage(error, "That address could not be changed.") });
      return;
    }
    emailForm.reset({ newEmail: values.newEmail });
    toast.success("Check your new address for a confirmation link");
  }

  async function savePassword(values: PasswordValues) {
    setBusy("password");
    const { error } = await authClient.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    setBusy(null);
    if (error) {
      const message = errorMessage(error, "Your password could not be changed.");
      const field = /password is incorrect|invalid password/i.test(message) ? "currentPassword" : "newPassword";
      passwordForm.setError(field, { message });
      return;
    }
    passwordForm.reset({ currentPassword: "", newPassword: "", confirm: "" });
    toast.success("Password changed");
  }

  async function revokeSession(id: string) {
    setBusy(`revoke:${id}`);
    const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) {
      toast.error("That session could not be signed out.");
      return;
    }
    setSessions((current) => current.filter((item) => item.id !== id));
  }

  async function revokeOthers() {
    setBusy("revoke-others");
    const response = await fetch("/api/sessions/revoke-others", { method: "POST" });
    setBusy(null);
    if (!response.ok) {
      toast.error("The other sessions could not be signed out.");
      return;
    }
    setSessions(await loadSessions());
    toast.success("Signed out everywhere else");
  }

  async function removeAccount() {
    setBusy("delete");
    setDeleteError(null);
    const { data, error } = hasPassword ? await authClient.deleteUser({ password: deletePassword }) : await authClient.deleteUser({});
    setBusy(null);
    if (error) {
      setDeleteError(errorMessage(error, "The account could not be deleted."));
      return;
    }
    // `sendDeleteAccountVerification` short-circuits the immediate delete, so this
    // always answers 200 with a link rather than removing anything. Say so plainly,
    // otherwise a correct password looks like a silent no-op.
    if (data?.message !== "User deleted") {
      setDeleting(false);
      setDeletePassword("");
      toast.success("Check your email for a link to finish deleting your account");
      return;
    }
    // Same treatment as signing out: leave nothing cached on the device.
    navigator.serviceWorker?.controller?.postMessage({ type: "khata:sign-out" });
    // The account is gone, so there is nothing left to authenticate against: clear the
    // browser's own subscription instead, or this device keeps a subscription that no
    // server row backs. Best effort only — the redirect must not wait on it.
    void unsubscribePushLocally().catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const others = sessions.filter((item) => !item.current).length;

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:gap-4">
      <section className="rounded-3xl bg-card p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
            <Monitor className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-display">Your details</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">How you show up to friends you split with.</p>
          </div>
        </div>

        <Form {...nameForm}>
          <form className="mt-4 grid gap-4" noValidate onSubmit={nameForm.handleSubmit(saveName)}>
            <FormField
              control={nameForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={busy === "name" || !nameForm.formState.isDirty}>
                {busy === "name" ? "Saving" : "Save name"}
              </Button>
              <Button type="button" variant="ghost" size="xs" className="min-h-0 px-2 text-xs" onClick={onSignOut}>
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </div>
          </form>
        </Form>

        <hr className="my-5 border-border" />

        <Form {...emailForm}>
          <form className="grid gap-4" noValidate onSubmit={emailForm.handleSubmit(saveEmail)}>
            <FormField
              control={emailForm.control}
              name="newEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" spellCheck={false} {...field} />
                  </FormControl>
                  <FormDescription>
                    You sign in at {user.email}. Changing this sends a confirmation link to the new address; nothing moves until it is clicked.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" size="sm" className="justify-self-start" disabled={busy === "email" || !emailForm.formState.isDirty}>
              {busy === "email" ? "Sending" : "Change email"}
            </Button>
          </form>
        </Form>
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-display">Password</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {hasPassword === false
                ? "You sign in with Google, so there is no password to change here."
                : hasPassword === null
                  ? "Checking how you sign in."
                  : "Stored hashed, never in plain text."}
            </p>
          </div>
        </div>

        {hasPassword === false ? (
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onSignOut}>
            <LogOut />
            Sign out
          </Button>
        ) : (
          <Form {...passwordForm}>
            <form className="mt-4 grid gap-4" noValidate onSubmit={passwordForm.handleSubmit(savePassword)}>
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input type={showPassword ? "text" : "password"} autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type={showPassword ? "text" : "password"} autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormDescription>At least 8 characters.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repeat new password</FormLabel>
                    <FormControl>
                      <Input type={showPassword ? "text" : "password"} autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" disabled={busy === "password"}>
                  {busy === "password" ? "Changing" : "Change password"}
                </Button>
                <Button type="button" variant="ghost" size="xs" className="min-h-0 px-2 text-xs" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? "Hide" : "Show"} passwords
                </Button>
              </div>
            </form>
          </Form>
        )}
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-card sm:p-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
              <ShieldAlert className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-display">Signed-in devices</h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Anything signed in as you can read and change your ledger. Sign out what you do not recognise.</p>
            </div>
          </div>
          {others > 0 ? (
            <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={busy === "revoke-others"} onClick={() => void revokeOthers()}>
              {busy === "revoke-others" ? "Signing out" : "Sign out everywhere else"}
            </Button>
          ) : null}
        </div>

        {sessionsError ? <p className="mt-4 text-sm text-destructive">{sessionsError}</p> : null}

        <ul className="mt-4 divide-y divide-border">
          {sessions.length === 0 && !sessionsError ? (
            <li className="py-3 text-sm text-muted-foreground">Loading your sessions…</li>
          ) : null}
          {sessions.map((item) => {
            const { label, Icon, where } = describe(item.userAgent, item.ipAddress);
            const busyKey = `revoke:${item.id}`;
            return (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-display">
                    {label}
                    {item.current ? <span className="ml-2 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">This device</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {where ? `${where} · ` : ""}
                    signed in {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {item.current ? null : (
                  <Button type="button" variant="ghost" size="xs" className="min-h-0 shrink-0 px-2 text-xs" disabled={busy === busyKey} onClick={() => void revokeSession(item.id)}>
                    {busy === busyKey ? "…" : "Sign out"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-card sm:p-6 lg:col-span-2">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive" aria-hidden>
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-display">Delete this account</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Removes your entries, friends, groups, splits, settlements and API keys. Nothing can be recovered afterwards.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="mt-4"
          onClick={() => {
            setDeletePassword("");
            setDeleteError(null);
            setDeleting(true);
          }}
        >
          Delete account
        </Button>
      </section>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your Khata account?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <ul className="grid gap-1.5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <li>Every entry in your personal ledger</li>
              <li>Your friends, groups, splits and settlements</li>
              <li>Every API key, revoked and gone</li>
              <li>Your account and its sessions</li>
            </ul>
            <p className="text-sm leading-6 text-muted-foreground">
              {hasPassword === false
                ? `You sign in with Google, so there is no password to check. We will email a link to ${user.email}.`
                : "Confirm your password, then we will email a link."}{" "}
              Nothing is deleted until you open that link, and the link works once.
            </p>
            {hasPassword ? (
              <div className="grid gap-1.5">
                <label htmlFor="delete-password" className="label">
                  Your password
                </label>
                <input
                  id="delete-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-xl border border-input bg-card px-4 text-sm text-foreground transition-colors duration-200 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 aria-invalid:border-destructive"
                />
              </div>
            ) : null}
            {deleteError ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
                {deleteError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleting(false)}>
                Keep my account
              </Button>
              <Button type="button" variant="destructive" disabled={busy === "delete" || (hasPassword === true && !deletePassword)} onClick={() => void removeAccount()}>
                {busy === "delete" ? "Sending" : hasPassword === false ? "Email me a link" : "Send me a link"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}