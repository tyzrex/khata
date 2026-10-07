import { Suspense } from "react";
import { Mark } from "@/components/mark";
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
      <Mark className="size-10" />
      <p className="text-sm text-muted-foreground">Opening invite</p>
    </main>
  );
}
