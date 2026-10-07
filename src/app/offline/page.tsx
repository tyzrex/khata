import Link from "next/link";
import { Mark } from "@/components/mark";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <Mark className="size-10" />
      <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">Offline</p>
      <h1 className="figure mt-2 text-4xl">Khata is here. The network is not.</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        The ledger lives in Postgres, so balances need a connection. This shell stays on the phone so the app can open
        while you are offline.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Try again
      </Link>
    </main>
  );
}
