"use client";

import { cn } from "cn";
import { usePathname } from "next/navigation";
import { viewForPath } from "@/components/app-shell";

/** One placeholder block. Pulses only when the person has not asked for reduced motion. */
export function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-xl bg-secondary motion-safe:animate-pulse", className)} />;
}

function Card({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6", className)}>{children}</div>;
}

function Header() {
  return (
    <div className="flex flex-col gap-3 border-b border-input/70 pb-5 lg:pb-6">
      <Bone className="h-3 w-24" />
      <Bone className="h-8 w-48 sm:h-9" />
      <Bone className="h-3.5 w-full max-w-sm" />
    </div>
  );
}

/** Varied line lengths so the placeholder reads as a list, not a barcode. */
const ROW_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5"];

function Rows({ count = 6 }: { count?: number }) {
  return (
    <ul className="mt-2 flex flex-col">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="flex items-center gap-3 py-3">
          <Bone className="size-9 shrink-0 rounded-full" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Bone className={cn("h-3.5", ROW_WIDTHS[index % ROW_WIDTHS.length])} />
            <Bone className="h-3 w-1/3" />
          </span>
          <Bone className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}

/**
 * The dashboard's real shape, section for section, so nothing jumps when the numbers
 * arrive: masthead, hero beside the stats, cash flow beside the donut, three equal
 * cards, then recent beside top merchants.
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3 2xl:gap-4">
      <div className="mb-2 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-3">
          <Bone className="h-3 w-28" />
          <Bone className="h-9 w-44" />
        </div>
        <Bone className="h-10 w-64 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        <div className="flex flex-col gap-3 rounded-3xl bg-brand p-5 sm:p-6 xl:col-span-4 2xl:col-span-3 2xl:p-7">
          <Bone className="h-3 w-24 opacity-60" />
          <Bone className="h-8 w-32" />
          <Bone className="h-2.5 w-28 opacity-60" />
          <Bone className="h-8 w-full" />
          <div className="mt-auto pt-4">
            <Bone className="h-3 w-40 opacity-60" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:col-span-8 2xl:col-span-9">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} className="flex flex-col gap-3">
              <Bone className="h-3 w-20" />
              <Bone className="h-7 w-24" />
              <Bone className="h-2.5 w-16" />
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        <Card className="flex flex-col gap-4 xl:col-span-8">
          <Bone className="h-4 w-32" />
          <Bone className="h-56 w-full rounded-2xl sm:h-64" />
          <div className="grid grid-cols-2 gap-4 border-t border-input/70 pt-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className="flex flex-col gap-2">
                <Bone className="h-3 w-16" />
                <Bone className="h-6 w-20" />
              </span>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col items-center gap-5 xl:col-span-4">
          <Bone className="h-4 w-28 self-start" />
          <Bone className="size-40 rounded-full" />
          <Bone className="h-3 w-full" />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="flex flex-col gap-4 xl:col-span-4">
            <Bone className="h-4 w-28" />
            <Rows count={index === 0 ? 4 : 3} />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 2xl:gap-4">
        <Card className="xl:col-span-7">
          <Bone className="h-4 w-36" />
          <Rows count={5} />
        </Card>
        <Card className="xl:col-span-5">
          <Bone className="h-4 w-28" />
          <Rows count={4} />
        </Card>
      </div>
    </div>
  );
}

function LedgerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Header />
      <div className="flex flex-col gap-3">
        <Card className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} className="flex flex-col gap-2">
              <Bone className="h-3 w-16" />
              <Bone className="h-6 w-24" />
            </span>
          ))}
        </Card>
        <Card>
          <Bone className="h-10 w-full" />
        </Card>
        <Card>
          <Rows count={8} />
        </Card>
      </div>
    </div>
  );
}

function SplitsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Header />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] 2xl:gap-4">
        <Card>
          <Bone className="h-4 w-28" />
          <Rows count={5} />
        </Card>
        <Card className="hidden flex-col gap-4 lg:flex">
          <div className="flex items-center gap-4">
            <Bone className="size-14 rounded-2xl" />
            <span className="flex flex-col gap-2">
              <Bone className="h-5 w-40" />
              <Bone className="h-3 w-24" />
            </span>
          </div>
          <Bone className="h-24 w-full rounded-2xl" />
          <Rows count={4} />
        </Card>
      </div>
    </div>
  );
}

function PlainSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Header />
      <Card>
        <Rows count={5} />
      </Card>
    </div>
  );
}

/**
 * The shell's own chrome — sidebar, phone header, bottom nav — drawn while the
 * session is read, with the page's skeleton inside. The real shell replaces this
 * wholesale, so it has to match the shell's grid or the whole page jumps on arrival.
 */
export function ShellSkeleton() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[2160px] lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen-ui p-3 lg:block 2xl:p-4" aria-hidden>
        <div className="flex h-full flex-col rounded-3xl bg-card shadow-card">
          <div className="flex items-center gap-3 px-5 pt-5">
            <Bone className="size-9 shrink-0 rounded-full" />
            <span className="flex min-w-0 flex-col gap-1.5">
              <Bone className="h-3.5 w-20" />
              <Bone className="h-2.5 w-28" />
            </span>
          </div>
          <div className="mt-5 grid gap-2 px-4">
            <Bone className="h-10 w-full" />
            <Bone className="h-10 w-full" />
          </div>
          <nav className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-3">
            {["Money", "Splits", "Account"].map((group) => (
              <div key={group}>
                <Bone className="mb-1.5 h-2.5 w-12" />
                <ul className="grid gap-0.5">
                  {Array.from({ length: 3 }, (_, index) => (
                    <li key={index} className="flex h-10 items-center gap-3 rounded-xl px-3">
                      <Bone className="size-[18px] shrink-0 rounded-lg" />
                      <Bone className="h-3 w-20" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="m-3 mt-0 flex items-center gap-2.5 rounded-2xl bg-secondary p-2.5">
            <Bone className="size-9 shrink-0 rounded-full" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Bone className="h-3 w-20" />
              <Bone className="h-2.5 w-28" />
            </span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md lg:hidden">
          <div className="gutter-safe flex items-center justify-between gap-3 pt-5 pb-3">
            <div className="flex min-w-0 items-center gap-3">
              <Bone className="size-9 shrink-0 rounded-full" />
              <span className="flex min-w-0 flex-col gap-1.5">
                <Bone className="h-3.5 w-16" />
                <Bone className="h-2.5 w-24" />
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Bone className="size-10 rounded-xl" />
              <Bone className="size-10 rounded-xl" />
              <Bone className="size-10 rounded-xl" />
            </div>
          </div>
        </header>
        <main className="gutter-safe w-full pt-4 pb-28 lg:pt-7 lg:pr-7 lg:pb-14 lg:pl-4 2xl:pt-8 2xl:pr-9 2xl:pl-6">
          <RouteSkeleton />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-hidden
      >
        <ul className="gutter-safe grid grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="flex h-16 flex-col items-center justify-center gap-1">
              <Bone className="size-5 rounded-lg" />
              <Bone className="h-2.5 w-8" />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** What the page will look like, drawn while its data streams in. Picked by path so it matches what comes next. */
export function RouteSkeleton() {
  const view = viewForPath(usePathname());
  const body =
    view === "overview" ? <DashboardSkeleton /> : view === "ledger" ? <LedgerSkeleton /> : view === "friends" || view === "groups" || view === "balances" ? <SplitsSkeleton /> : <PlainSkeleton />;
  return (
    <div role="status" aria-label="Loading">
      {body}
    </div>
  );
}