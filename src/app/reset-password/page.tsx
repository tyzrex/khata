import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Mark } from "@/components/mark";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { readPageSession } from "@/lib/session";

type Props = { searchParams: Promise<{ token?: string | string[]; error?: string | string[] }> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ResetPasswordPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<ResetFallback />}>
      <Gate searchParams={searchParams} />
    </Suspense>
  );
}

async function Gate({ searchParams }: Props) {
  // Someone who is already signed in has no reason to be here, and landing on a
  // stale link should not quietly change the password of the open session.
  const session = await readPageSession();
  if (session) redirect("/");

  const params = await searchParams;
  return <ResetPasswordForm token={first(params.token) ?? null} invalid={Boolean(first(params.error))} />;
}

function ResetFallback() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <Mark className="size-10" />
      <p className="text-sm text-muted-foreground">Opening Khata</p>
    </main>
  );
}
