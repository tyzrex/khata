"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Dialog on wide screens, bottom drawer on phones. A phone has no hover and a
 * short viewport, so a centred modal puts its footer under the keyboard; the
 * drawer scrolls its own body and keeps the actions in reach.
 *
 * Which one renders is decided in JS, not with a `max-sm:hidden` pair, so the
 * form inside is only ever mounted once.
 */
function useIsWide(query = "(min-width: 640px)") {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);

  return wide;
}

export function ResponsiveOverlay({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** The scrollable body: the form. */
  children: ReactNode;
  /** Sticky actions, pinned to the bottom of the drawer. */
  footer?: ReactNode;
  /** Width of the centred dialog. Ignored by the drawer, which spans the screen. */
  className?: string;
}) {
  const wide = useIsWide();

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={className}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          {footer}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        {/*
          `pb-[calc(0.75rem+env(safe-area-inset-bottom))]` is load-bearing. The drawer's
          popup runs to the bottom edge of the screen and the viewport is
          viewport-fit=cover, so without it the action sat flush against the edge — and
          under the home indicator on any notched phone. `bg-popover` matches the drawer
          it sits in; `bg-card` made the footer darker than the body above it.
        */}
        {footer ? <div className="mt-auto shrink-0 border-t border-border bg-popover px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div> : null}
      </DrawerContent>
    </Drawer>
  );
}