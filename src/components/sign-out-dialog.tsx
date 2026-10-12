"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Signing out is one tap from the top bar on a phone and it cannot be undone from here, so it
 * asks first. The trigger is deliberately out of the header's icon row — an icon that looks
 * like its neighbours and drops the session on a graze is the exact thing this guards against.
 *
 * `Dialog` renders as a bottom sheet under `sm` and a centred card above it, which is where a
 * thumb already is on the device this was written for.
 */
export function SignOutDialog({
  open,
  onOpenChange,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign out?</DialogTitle>
          <DialogDescription>
            Khata clears its cached data on this device, and unsubscribes it from notifications. You will need your password to sign back in.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-11 sm:h-10" />}>Stay signed in</DialogClose>
          <Button variant="destructive" className="h-11 sm:h-10" onClick={onSignOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
