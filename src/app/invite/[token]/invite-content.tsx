"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type InviteInfo = {
  groupName: string;
  creatorName: string;
  inviteeEmail: string | null;
  expired: boolean;
  used: boolean;
};

type Phase = "loading" | "ready" | "missing" | "joining";

export function InviteContent() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const session = authClient.useSession();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invite/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setPhase("missing");
          return;
        }
        setInfo((await response.json()) as InviteInfo);
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function join() {
    setPhase("joining");
    setError(null);
    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}/accept`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { groupName?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not join that group.");
      toast.success(`You joined ${body?.groupName ?? "the group"}`);
      router.push("/?view=groups");
      router.refresh();
    } catch (caught) {
      setPhase("ready");
      setError(caught instanceof Error ? caught.message : "Could not join that group.");
    }
  }

  const signedIn = Boolean(session.data?.user);
  const blocked = info?.expired || info?.used;
  const loginHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <Mark className="size-10" />
      {phase === "loading" ? <p className="text-sm text-muted-foreground">Opening invite</p> : null}
      {phase === "missing" ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-medium tracking-tight">This invite is not valid</h1>
          <p className="text-sm leading-6 text-muted-foreground">The link may be mistyped or the group may have been removed. Ask for a fresh one.</p>
          <Button type="button" variant="outline" onClick={() => router.push("/")}>
            Open Khata
          </Button>
        </div>
      ) : null}
      {info && (phase === "ready" || phase === "joining") ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Group invite</p>
            <h1 className="text-2xl font-medium tracking-tight">{info.groupName}</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {info.creatorName} invited you to split expenses and settle up in this group.
              {info.inviteeEmail ? ` This invite is for ${info.inviteeEmail}.` : ""}
            </p>
          </div>
          {info.expired ? <p className="text-sm text-destructive">This invite has expired. Ask {info.creatorName} for a new one.</p> : null}
          {info.used && !info.expired ? <p className="text-sm text-destructive">This invite has already been used.</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!blocked ? (
            signedIn ? (
              <Button type="button" className="h-11" disabled={phase === "joining"} onClick={() => void join()}>
                {phase === "joining" ? "Joining" : `Join ${info.groupName}`}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button type="button" className="h-11" disabled={session.isPending} onClick={() => router.push(loginHref)}>
                  Sign in or create an account to join
                </Button>
                <p className="text-xs text-muted-foreground">You will come straight back here afterwards.</p>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
