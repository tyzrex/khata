import { Suspense } from "react";
import { redirect } from "next/navigation";
import { KhataApp } from "@/components/khata-app";
import { Mark } from "@/components/mark";
import { Loading } from "@/components/ui/loading";
import { readPageSession } from "@/lib/session";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <SignedInHome />
    </Suspense>
  );
}

async function SignedInHome() {
  const session = await readPageSession();
  if (!session) redirect("/login");
  return <KhataApp user={{ name: session.name, email: session.email }} />;
}

function HomeFallback() {
  return (
    <div className="min-h-dvh px-4 py-6 md:px-8">
      <div className="flex items-center gap-3">
        <Mark className="size-9" />
        <span className="text-base font-semibold tracking-[-0.02em] text-display">Khata</span>
      </div>
      <Loading />
    </div>
  );
}
