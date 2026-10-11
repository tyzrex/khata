"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/balances-card";
import { Button } from "@/components/ui/button";
import { claimPushSubscription, disableCurrentBrowserPush, enablePushNotifications, getCurrentPushSubscription } from "@/lib/push-client";
import { toast } from "@/lib/status";
import { cn } from "cn";

type Preferences = { expenseActivity: boolean; settlementActivity: boolean; showAmounts: boolean };

type PushState = {
  loading: boolean;
  supported: boolean;
  configured: boolean;
  publicKey: string | null;
  /** This browser holds a local subscription. */
  enabled: boolean;
  /** Khata's copy of that subscription is attached to the signed-in account. */
  registered: boolean;
  permission: NotificationPermission | null;
  preferences: Preferences;
};

const DEFAULTS: Preferences = { expenseActivity: true, settlementActivity: true, showAmounts: false };

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

function pushSupported() {
  return process.env.NODE_ENV === "production" && typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function NotificationsCard() {
  const [state, setState] = useState<PushState>({ loading: true, supported: false, configured: false, publicKey: null, enabled: false, registered: false, permission: null, preferences: DEFAULTS });
  const [busy, setBusy] = useState<string | null>(null);

const load = useCallback(async (): Promise<PushState> => {
    if (!pushSupported()) {
      return { loading: false, supported: false, configured: false, publicKey: null, enabled: false, registered: false, permission: null, preferences: DEFAULTS };
    }
    // Read the local subscription first so the server can say whether this
    // account actually owns that endpoint, not just whether the browser has one.
    let endpoint: string | null = null;
    try {
      endpoint = (await getCurrentPushSubscription())?.endpoint ?? null;
    } catch {
      endpoint = null;
    }
    const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : "";
    const response = await fetch(`/api/push${query}`);
    if (!response.ok) throw new Error(await readError(response, "Notification settings could not be loaded."));
    const body = (await response.json()) as { configured: boolean; publicKey: string | null; preferences: Preferences; registered: boolean };
    return {
      loading: false,
      supported: true,
      configured: body.configured,
      publicKey: body.publicKey,
      enabled: endpoint !== null,
      registered: body.registered,
      permission: Notification.permission,
      preferences: body.preferences,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (next) => {
        if (!cancelled) setState(next);
      },
      () => {
        if (!cancelled) setState((current) => ({ ...current, loading: false }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function enable() {
    if (!state.publicKey) {
      toast.error("Khata's notification service is not configured yet.");
      return;
    }
    setBusy("enable");
    try {
      await enablePushNotifications(state.publicKey);
      setState((current) => ({ ...current, enabled: true, registered: true, permission: Notification.permission }));
      toast.success("Notifications are on for this browser.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Notifications could not be enabled.");
    } finally {
      setBusy(null);
    }
  }
  async function disable() {
    setBusy("disable");
    try {
      await disableCurrentBrowserPush();
      setState((current) => ({ ...current, enabled: false, registered: false, permission: typeof Notification !== "undefined" ? Notification.permission : current.permission }));
      toast.success("Notifications are off for this browser.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Notifications could not be disabled.");
    } finally {
      setBusy(null);
    }
  }

  async function claim() {
    setBusy("claim");
    try {
      const subscription = await getCurrentPushSubscription();
      if (!subscription) throw new Error("This browser has no notification subscription to claim. Enable notifications first.");
      await claimPushSubscription(subscription);
      setState((current) => ({ ...current, enabled: true, registered: true }));
      toast.success("This browser is registered for notifications.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "This browser could not be registered.");
    } finally {
      setBusy(null);
    }
  }

  async function togglePreference(key: keyof Preferences) {
    const previous = state.preferences;
    const next = { ...previous, [key]: !previous[key] };
    setState((current) => ({ ...current, preferences: next }));
    try {
      const response = await fetch("/api/push/preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [key]: next[key] }) });
      if (!response.ok) throw new Error(await readError(response, "Preferences could not be saved."));
      const body = (await response.json()) as { preferences: Preferences };
      setState((current) => ({ ...current, preferences: body.preferences }));
    } catch (caught) {
      setState((current) => ({ ...current, preferences: previous }));
      toast.error(caught instanceof Error ? caught.message : "Preferences could not be saved.");
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response, "The test notification could not be sent."));
      toast.success("Test sent. It should arrive in a few seconds.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The test notification could not be sent.");
    } finally {
      setBusy(null);
    }
  }

  const working = busy !== null;
  const denied = state.permission === "denied";

  return (
    <Card
      title="Notifications"
      hint="Hear when someone shares an expense or settles up with you"
      aside={state.enabled ? <Bell className="size-4 text-muted-foreground" aria-hidden /> : <BellOff className="size-4 text-muted-foreground" aria-hidden />}
    >
      <div className="flex flex-col gap-4">
        {state.loading ? (
          <p className="label py-2">Loading notifications</p>
        ) : !state.supported ? (
          <div className="rounded-2xl bg-secondary p-3 text-xs leading-5 text-muted-foreground">
            Notifications need a production build served over HTTPS. In development Khata keeps its service worker off, so this browser cannot subscribe yet. Deploy a preview, or run{" "}
            <code className="font-mono">bun run build && bun run start</code> locally to try them.
          </div>
        ) : !state.configured ? (
          <div className="rounded-2xl bg-secondary p-3 text-xs leading-5 text-muted-foreground">
            Khata&apos;s notification service is not configured on this deployment. An operator needs to set the VAPID keys before anyone here can turn notifications on.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {state.enabled ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void disable()}>
                    {busy === "disable" ? <Loader2 className="animate-spin" /> : <BellOff />}
                    Turn off
                  </Button>
                  {state.registered ? (
                    <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => void sendTest()}>
                      {busy === "test" ? <Loader2 className="animate-spin" /> : null}
                      Send a test
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button type="button" size="sm" disabled={working || denied} onClick={() => void enable()}>
                  {busy === "enable" ? <Loader2 className="animate-spin" /> : <Bell />}
                  Turn on notifications
                </Button>
              )}
              {state.enabled && !state.registered ? (
                <Button type="button" variant="secondary" size="sm" disabled={working} onClick={() => void claim()}>
                  {busy === "claim" ? <Loader2 className="animate-spin" /> : null}
                  Register this browser
                </Button>
              ) : null}
            </div>

            {denied ? (
              <div className="rounded-2xl bg-destructive/10 p-3 text-xs leading-5 text-destructive">
                Your browser is blocking notifications for this site. Allow them in the address bar or your device settings, then turn them on again.
              </div>
            ) : null}

            {state.enabled && !state.registered ? (
              <div className="rounded-2xl bg-secondary p-3 text-xs leading-5 text-muted-foreground">
                This browser is subscribed, but the subscription is not attached to this account. Register it so shared activity can reach you.
              </div>
            ) : null}

            <div className="divide-y divide-border">
              <Switch
                title="Shared expenses"
                hint="When someone adds or edits an expense you are part of."
                checked={state.preferences.expenseActivity}
                disabled={working}
                onChange={() => void togglePreference("expenseActivity")}
              />
              <Switch
                title="Settlements"
                hint="When someone records a payment to you or from you."
                checked={state.preferences.settlementActivity}
                disabled={working}
                onChange={() => void togglePreference("settlementActivity")}
              />
              <Switch
                title="Show amounts"
                hint="Include the amount in the notification. Off by default, so a lock screen does not show what you owe."
                checked={state.preferences.showAmounts}
                disabled={working}
                onChange={() => void togglePreference("showAmounts")}
              />
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Notifications are per browser, so turn them on on each device you use. Only shared activity reaches you, and Khata never sends anything to a browser you turn off here.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

/** A labelled on/off row. Preferences apply to the account, so they stay editable even with no browser subscribed. */
function Switch({ title, hint, checked, disabled, onChange }: { title: string; hint: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-display">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-40",
          checked ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-card transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

