"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/balances-card";
import { DEFAULT_PUSH_PREFERENCES, patchPushPreferences, postPushTest, pushSettingsKey, pushSettingsQuery, type PushPreferences } from "@/components/push-query";
import { Button } from "@/components/ui/button";
import { claimPushSubscription, disableCurrentBrowserPush, enablePushNotifications, getCurrentPushSubscription } from "@/lib/push-client";
import { toast } from "@/lib/status";
import { cn } from "cn";

export function NotificationsCard() {
  const queryClient = useQueryClient();
  const { data, isPending: loading, error } = useQuery(pushSettingsQuery);
  const [busy, setBusy] = useState<string | null>(null);

  const preferences = data?.preferences ?? DEFAULT_PUSH_PREFERENCES;

  /** Subscribing, unsubscribing and registering all change what this browser holds, so the
   *  settings read is the thing that has to be re-taken after each of them. */
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: pushSettingsKey });
  }

  const savePreferences = useMutation({
    mutationFn: patchPushPreferences,
    onSuccess: refresh,
  });

  const sendTest = useMutation({ mutationFn: postPushTest });

  async function enable() {
    if (!data?.publicKey) {
      toast.error("Khata's notification service is not configured yet.");
      return;
    }
    setBusy("enable");
    try {
      await enablePushNotifications(data.publicKey);
      await refresh();
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
      await refresh();
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
      await refresh();
      toast.success("This browser is registered for notifications.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "This browser could not be registered.");
    } finally {
      setBusy(null);
    }
  }

  /** Applied optimistically so the switch never lags the click, and rolled back if the write
   *  fails — otherwise the panel would quietly disagree with the server. */
  async function togglePreference(key: keyof PushPreferences) {
    if (!data) return;
    const previous = data.preferences;
    const next = { ...previous, [key]: !previous[key] };
    queryClient.setQueryData(pushSettingsKey, { ...data, preferences: next });
    try {
      await savePreferences.mutateAsync({ [key]: next[key] });
    } catch (caught) {
      queryClient.setQueryData(pushSettingsKey, { ...data, preferences: previous });
      toast.error(caught instanceof Error ? caught.message : "Preferences could not be saved.");
    }
  }

  async function runTest() {
    try {
      await sendTest.mutateAsync();
      toast.success("Test sent. It should arrive in a few seconds.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The test notification could not be sent.");
    }
  }

  const working = busy !== null || sendTest.isPending;
  const denied = data?.permission === "denied";

  return (
    <Card
      title="Notifications"
      hint="Hear when someone shares an expense or settles up with you"
      aside={data?.enabled ? <Bell className="size-4 text-muted-foreground" aria-hidden /> : <BellOff className="size-4 text-muted-foreground" aria-hidden />}
    >
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="label py-2">Loading notifications</p>
        ) : error ? (
          <div className="rounded-2xl bg-destructive/10 p-3 text-[13px] leading-5 text-destructive">
            {error instanceof Error ? error.message : "Notification settings could not be loaded."}
          </div>
        ) : !data?.supported ? (
          <div className="rounded-2xl bg-secondary p-3 text-[13px] leading-5 text-muted-foreground">
            {/* The reason is worth more than "unsupported": on iPhone it is the one thing
                that has to change, and it is not a setting the person can reach. */}
            {data?.blockedReason ?? "Notifications need a production build served over HTTPS. In development Khata keeps its service worker off, so this browser cannot subscribe yet."}
          </div>
        ) : !data?.configured ? (
          <div className="rounded-2xl bg-secondary p-3 text-[13px] leading-5 text-muted-foreground">
            Khata&apos;s notification service is not configured on this deployment. An operator needs to set the VAPID keys before anyone here can turn notifications on.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {data?.enabled ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void disable()}>
                    {busy === "disable" ? <Loader2 className="animate-spin" /> : <BellOff />}
                    Turn off
                  </Button>
                  {data?.registered ? (
                    <Button type="button" variant="ghost" size="sm" disabled={working} onClick={() => void runTest()}>
                      {sendTest.isPending ? <Loader2 className="animate-spin" /> : null}
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
              {data?.enabled && !data?.registered ? (
                <Button type="button" variant="secondary" size="sm" disabled={working} onClick={() => void claim()}>
                  {busy === "claim" ? <Loader2 className="animate-spin" /> : null}
                  Register this browser
                </Button>
              ) : null}
            </div>

            {denied ? (
              <div className="rounded-2xl bg-destructive/10 p-3 text-[13px] leading-5 text-destructive">
                Your browser is blocking notifications for this site. Allow them in the address bar or your device settings, then turn them on again.
              </div>
            ) : null}

            {data?.enabled && !data?.registered ? (
              <div className="rounded-2xl bg-secondary p-3 text-[13px] leading-5 text-muted-foreground">
                This browser is subscribed, but the subscription is not attached to this account. Register it so shared activity can reach you.
              </div>
            ) : null}

            <div className="divide-y divide-border">
              <Switch
                title="Shared expenses"
                hint="When someone adds or edits an expense you are part of."
                checked={preferences.expenseActivity}
                disabled={working}
                onChange={() => void togglePreference("expenseActivity")}
              />
              <Switch
                title="Settlements"
                hint="When someone records a payment to you or from you."
                checked={preferences.settlementActivity}
                disabled={working}
                onChange={() => void togglePreference("settlementActivity")}
              />
              <Switch
                title="Show amounts"
                hint="Include the amount in the notification. Off by default, so a lock screen does not show what you owe."
                checked={preferences.showAmounts}
                disabled={working}
                onChange={() => void togglePreference("showAmounts")}
              />
            </div>

            <p className="text-[13px] leading-5 text-muted-foreground">
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
        <p className="text-[15px] font-semibold text-display">{title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{hint}</p>
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

