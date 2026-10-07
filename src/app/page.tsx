import { Suspense } from "react";
import { redirect } from "next/navigation";
import { KhataApp } from "@/components/khata-app";
import { Mark } from "@/components/mark";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="flex items-center gap-2.5">
        <Mark className="size-7" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="mt-8 flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
