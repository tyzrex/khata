"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/balances-card";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/status";
import { canInstallHere, useInstallPrompt, useInstallState } from "@/lib/pwa-install";

/**
 * Installing Khata. Chrome and Android offer an install prompt the app has to hold onto before
 * it will show; iOS Safari never fires one and installs from the Share sheet instead, so it gets
 * instructions rather than a button. Nothing here appears once the app is already installed.
 */
export function InstallCard() {
  const { canPrompt, needsManualSteps, installed } = useInstallState();
  const install = useInstallPrompt();
  const [busy, setBusy] = useState(false);

  if (installed) {
    return (
      <Card title="Khata is installed" hint="Running from your home screen" aside={<Smartphone className="size-4 text-muted-foreground" aria-hidden />}>
        <p className="text-sm leading-6 text-muted-foreground">
          Open Khata like any other app. It keeps working offline, and shared activity reaches you even when the tab is closed.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Install Khata" hint="Add it to your home screen and open it like an app" aside={<Download className="size-4 text-muted-foreground" aria-hidden />}>
      <div className="flex flex-col gap-4">
        {canPrompt ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void install().then((outcome) => {
                    setBusy(false);
                    if (outcome === "dismissed") toast.info("No problem. You can install Khata any time.");
                  });
                }}
              >
                <Download />
                {busy ? "Installing" : "Install Khata"}
              </Button>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Once installed, Khata opens without browser bars, starts even when you are offline, and can tell you when someone shares an expense or settles up with you.
            </p>
          </>
        ) : needsManualSteps ? (
          <>
            <div className="rounded-2xl bg-secondary p-3 text-[13px] leading-5 text-muted-foreground">
              <p className="font-medium text-display">On this browser, install from the Share sheet</p>
              <p className="mt-1.5">
                Tap <Share className="mx-0.5 inline size-3.5 align-[-2px]" aria-hidden /> <span className="font-medium text-display">Share</span>, then{" "}
                <span className="font-medium text-display">Add to Home Screen</span>. Khata then opens full screen with no browser bars.
              </p>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Installed, Khata starts even when you are offline and can tell you when someone shares an expense or settles up with you.
            </p>
          </>
        ) : canInstallHere() ? (
          <p className="text-sm leading-6 text-muted-foreground">
            This browser has not offered an install yet. Chrome usually offers it after you have been here a little while — the button appears as soon as it does.
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Installing needs a production build served over HTTPS. In development Khata keeps its service worker off, so browsers will not offer to install it. Try a preview deployment.
          </p>
        )}
      </div>
    </Card>
  );
}