import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Mark } from "@/components/mark";
import { googleAuthEnabled } from "@/lib/auth";
import { safeNext } from "@/lib/return-path";
import { readPageSession } from "@/lib/session";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default function LoginPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginGate searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginGate({ searchParams }: Props) {
  const session = await readPageSession();
  if (session) {
    const { next } = await searchParams;
    redirect(safeNext(Array.isArray(next) ? next[0] : next));
  }
  return <LoginForm googleEnabled={googleAuthEnabled()} />;
}

function LoginFallback() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <Mark className="size-10" />
      <p className="text-sm text-muted-foreground">Opening Khata</p>
    </main>
  );
}
