import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Mark } from "@/components/mark";
import { googleAuthEnabled } from "@/lib/auth";
import { readPageSession } from "@/lib/session";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginGate />
    </Suspense>
  );
}

async function LoginGate() {
  const session = await readPageSession();
  if (session) redirect("/");
  return <LoginForm googleEnabled={googleAuthEnabled()} />;
}

function LoginFallback() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Mark className="size-10" />
      <p className="mt-6 text-sm text-muted-foreground">Opening Khata</p>
    </main>
  );
}
