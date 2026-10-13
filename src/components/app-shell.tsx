"use client";

import { Activity, ArrowLeftRight, BookOpen, HandCoins, House, LogOut, Menu, Plus, RefreshCw, Scale, Settings, Tags, Users, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Mark } from "@/components/mark";
import { NotificationsBell } from "@/components/notifications-bell";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useDateFormat } from "@/components/use-date-style";

export const views = [
  { id: "overview", href: "/", label: "Dashboard", short: "Home", icon: House, mobile: true, group: "Money" },
  { id: "ledger", href: "/ledger", label: "Ledger", short: "Ledger", icon: BookOpen, mobile: true, group: "Money" },
  { id: "categories", href: "/categories", label: "Categories", short: "Categories", icon: Tags, mobile: false, group: "Money" },
  { id: "accounts", href: "/accounts", label: "Accounts", short: "Accounts", icon: Wallet, mobile: false, group: "Money" },
  { id: "sync", href: "/sync", label: "Import and export", short: "Sync", icon: RefreshCw, mobile: false, group: "Money" },
  { id: "friends", href: "/friends", label: "Friends", short: "Friends", icon: Users, mobile: true, group: "Splits" },
  { id: "groups", href: "/groups", label: "Groups", short: "Groups", icon: UsersRound, mobile: true, group: "Splits" },
  { id: "balances", href: "/balances", label: "Balances", short: "Balances", icon: Scale, mobile: false, group: "Splits" },
  { id: "activity", href: "/activity", label: "Activity", short: "Activity", icon: Activity, mobile: false, group: "Splits" },
  { id: "settings", href: "/settings", label: "Settings", short: "Settings", icon: Settings, mobile: false, group: "Account" },
] as const satisfies readonly { id: string; href: string; label: string; short: string; icon: LucideIcon; mobile: boolean; group: string }[];

export type ViewId = (typeof views)[number]["id"];

/** The section a path belongs to: `/groups/abc` is still Groups. */
export function viewForPath(pathname: string): ViewId {
  const match = views.find((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return match?.id ?? "overview";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function AppShell({
  user,
  today,
  onAdd,
  onSplit,
  onSignOut,
  children,
}: {
  user: { name: string; email: string };
  today: string;
  onAdd: () => void;
  onSplit: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const view = viewForPath(usePathname());
  const groups = ["Money", "Splits", "Account"] as const;
  const dates = useDateFormat();

  /** From the desktop sidebar and the phone's More sheet: ask, then sign out. */
  function confirmSignOut() {
    setSignOutOpen(true);
    setMenuOpen(false);
  }

  function signOut() {
    setSignOutOpen(false);
    onSignOut();
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[2160px] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen-ui p-3 lg:block 2xl:p-4">
        <div className="flex h-full flex-col rounded-3xl bg-card shadow-card">
          <div className="flex items-center gap-3 px-5 pt-5">
            <Mark className="size-9 shrink-0" />
            <div className="min-w-0 leading-none">
              <p className="text-[17px] font-semibold tracking-[-0.03em] text-display">Khata</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Money, shared</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 px-4">
            <Button type="button" className="w-full justify-start gap-3 px-4" onClick={onAdd}>
              <Plus className="size-4" />
              Add entry
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start gap-3 px-4" onClick={onSplit}>
              <HandCoins className="size-4" />
              Split expense
            </Button>
          </div>

          <nav className="scroll-quiet scroll-fade mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3" aria-label="Sections">
            {groups.map((group) => (
              <div key={group}>
                <p className="px-3 pb-1.5 text-[13px] font-medium text-disabled">{group}</p>
                <ul className="grid gap-0.5">
                  {views
                    .filter((item) => item.group === group)
                    .map((item) => {
                      const active = view === item.id;
                      const Icon = item.icon;
                      return (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={
                              active
                                ? "flex h-10 w-full items-center gap-3 rounded-xl bg-accent px-3 text-[14px] font-semibold tracking-[-0.01em] text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                : "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14px] font-medium tracking-[-0.01em] text-muted-foreground transition-colors duration-200 outline-none hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring"
                            }
                          >
                            <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="m-3 mt-0 grid gap-2.5 rounded-2xl bg-secondary p-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-brand-foreground" aria-hidden>
                {initials(user.name)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold text-display">{user.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle className="size-9 bg-card" />
              <NotificationsBell variant="outline" size="icon-sm" align="start" side="top" className="bg-card" />
              <Button type="button" variant="outline" className="h-10 flex-1 justify-start gap-2 bg-card px-3" onClick={confirmSignOut}>
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md lg:hidden">
          <div className="gutter-safe flex items-center justify-between gap-2 pt-4 pb-3 [--gutter:1rem] sm:[--gutter:1.25rem] md:[--gutter:2rem]">
            <div className="flex min-w-0 items-center gap-3">
              <Mark className="size-10 shrink-0" />
              <div className="min-w-0 leading-tight">
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-display">Khata</p>
                <p className="truncate text-[13px] text-muted-foreground">{today ? dates.long(today) : user.name}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <ThemeToggle className="size-10 bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-display" />
              <NotificationsBell variant="outline" size="icon" align="end" side="bottom" className="size-10 bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-display" />
              <Button type="button" variant="outline" size="icon" className="size-10 bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-display" aria-label="Menu" onClick={() => setMenuOpen(true)}>
                <Menu className="size-5" />
              </Button>
            </div>
          </div>
        </header>

        <main className="gutter-safe w-full pt-4 pb-28 [--gutter:1rem] sm:[--gutter:1.25rem] md:pt-6 md:[--gutter:2rem] lg:pt-7 lg:pr-7 lg:pb-14 lg:pl-4 2xl:pt-8 2xl:pr-9 2xl:pl-6">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Sections"
      >
        <ul className="gutter-safe grid grid-cols-5 [--gutter:0.5rem]">
          {views
            .filter((item) => item.mobile)
            .slice(0, 2)
            .map((item) => {
              const active = view === item.id;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "flex h-[4.25rem] w-full flex-col items-center justify-center gap-1.5 text-[13px] font-semibold text-accent-foreground outline-none"
                        : "group flex h-[4.25rem] w-full flex-col items-center justify-center gap-1.5 text-[13px] font-medium text-muted-foreground outline-none"
                    }
                  >
                    <span className={active ? "flex h-8 w-14 items-center justify-center rounded-xl bg-accent" : "flex h-8 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-secondary group-focus-visible:bg-secondary"}>
                      <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                    </span>
                    {item.short}
                  </Link>
                </li>
              );
            })}
          {/*
            The one raised element in the bar, so it is built like a floating action
            button rather than a nav item:

            - `-translate-y-6` lifts it clear of the nav's top edge. The nav is z-40 and
              the sticky header z-30, so it still paints above content scrolling under.
            - `ring-4 ring-card` is the notch: a card-coloured ring that hides the nav's
              border and background where the circle crosses them, which is what makes
              the circle read as floating instead of cropped.
            - The coloured shadow is brand-tinted rather than the neutral `--elevation-lift`
              so the button lights the surface it sits on, in either theme.
            - The `after:` sheen is a light source at the top of the circle. At 10% white it
              is felt rather than seen, and it keeps the fill from reading as flat.
          */}
          <li className="flex items-center justify-center">
            <button
              type="button"
              aria-label="Quick actions"
              onClick={() => setActionsOpen(true)}
              className="group relative flex size-16 -translate-y-6 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_10px_24px_-8px_color-mix(in_oklab,var(--brand)_65%,transparent)] ring-4 ring-card outline-none transition duration-200 ease-out after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:bg-linear-to-b after:from-white/15 after:to-transparent hover:-translate-y-7 hover:shadow-[0_14px_30px_-8px_color-mix(in_oklab,var(--brand)_70%,transparent)] active:translate-y-6 active:scale-95 focus-visible:ring-4 focus-visible:ring-ring/40"
            >
              <Plus className="relative size-7 transition-transform duration-300 ease-out group-hover:rotate-90 group-active:rotate-180" strokeWidth={2.25} />
            </button>
          </li>
          {views
            .filter((item) => item.mobile)
            .slice(2, 4)
            .map((item) => {
              const active = view === item.id;
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "flex h-[4.25rem] w-full flex-col items-center justify-center gap-1.5 text-[13px] font-semibold text-accent-foreground outline-none"
                        : "group flex h-[4.25rem] w-full flex-col items-center justify-center gap-1.5 text-[13px] font-medium text-muted-foreground outline-none"
                    }
                  >
                    <span className={active ? "flex h-8 w-14 items-center justify-center rounded-xl bg-accent" : "flex h-8 w-14 items-center justify-center rounded-xl transition-colors group-hover:bg-secondary group-focus-visible:bg-secondary"}>
                      <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                    </span>
                    {item.short}
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Menu</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 rounded-2xl bg-secondary p-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground" aria-hidden>
              {initials(user.name)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-semibold text-display">{user.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Button
              type="button"
              className="h-12 justify-start gap-3 px-4"
              onClick={() => {
                setMenuOpen(false);
                onAdd();
              }}
            >
              <ArrowLeftRight className="size-5" />
              Add entry
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start gap-3 px-4"
              onClick={() => {
                setMenuOpen(false);
                onSplit();
              }}
            >
              <HandCoins className="size-5" />
              Split expense
            </Button>
          </div>

          <div className="grid gap-2">
            {views
              .filter((item) => !item.mobile)
              .map((item) => (
                <Button key={item.id} variant="outline" className="h-12 justify-start gap-3 px-4" render={<Link href={item.href} onClick={() => setMenuOpen(false)} />} nativeButton={false}>
                  <item.icon className="size-5" />
                  {item.label}
                </Button>
              ))}
          </div>

          <Button type="button" variant="outline" className="h-12 justify-start gap-3 px-4" onClick={confirmSignOut}>
            <LogOut className="size-5" />
            Sign out
          </Button>
        </DialogContent>
      </Dialog>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} onSignOut={signOut} />

      {/*
        A drawer, not a dialog: it opens from a button near the bottom of the screen,
        so swiping down to dismiss is the gesture the thumb is already there for.
        `showSwipeHandle` advertises it.
      */}
      <Drawer open={actionsOpen} onOpenChange={setActionsOpen} showSwipeHandle>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>Quick actions</DrawerTitle>
          </DrawerHeader>
          <div className="grid gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              className="h-12 justify-start gap-3 px-4"
              onClick={() => {
                setActionsOpen(false);
                onAdd();
              }}
            >
              <ArrowLeftRight className="size-5" />
              Add entry
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start gap-3 px-4"
              onClick={() => {
                setActionsOpen(false);
                onSplit();
              }}
            >
              <HandCoins className="size-5" />
              Split expense
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
