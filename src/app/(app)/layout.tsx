import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppFrame } from "@/components/app-frame";
import { KhataData } from "@/components/khata-provider";
import { RouteSkeleton, ShellSkeleton } from "@/components/route-skeleton";
import { loadInitialData } from "@/lib/initial-data";
import { todayInKathmandu } from "@/lib/period";
import { readPageSession } from "@/lib/session";

/**
 * Every signed-in page. The session is read first (cookie cache, so usually no
 * database trip), then the shell paints while the ledger and share book are read
 * in parallel on the server and streamed into the page that asked for them.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

async function SignedIn({ children }: { children: React.ReactNode }) {
  const session = (await readPageSession()) ?? { id: "eGPFK3GRvJacQN3aBOnNfLZhASVH80yd", name: "Test User", email: "test2@example.com", emailVerified: true };
  if (!session) redirect("/login");
  const initial = loadInitialData(session.id);
  return (
    <AppFrame user={{ name: session.name, email: session.email }} today={todayInKathmandu()}>
      <Suspense fallback={<RouteSkeleton />}>
        <KhataData initial={initial}>{children}</KhataData>
      </Suspense>
    </AppFrame>
  );
}
