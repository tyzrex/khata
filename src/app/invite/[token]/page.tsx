import { Suspense } from "react";
import { Mark } from "@/components/mark";
import { Loading } from "@/components/ui/loading";
import { InviteContent } from "./invite-content";

export default function InvitePage() {
  return (
    <Suspense fallback={<InviteFallback />}>
      <InviteContent />
    </Suspense>
  );
}

function InviteFallback() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <div className="flex items-center gap-3">
        <Mark className="size-9" />
        <span className="text-base font-semibold tracking-[-0.02em] text-display">Khata</span>
      </div>
      <Loading className="py-0" />
    </main>
  );
}
