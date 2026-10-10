"use client";

import { useParams, useRouter } from "next/navigation";
import { Link as LinkIcon, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/status";
import { Mark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { authClient } from "@/lib/auth-client";

type InviteInfo = {
  groupName: string;
  direct: boolean;
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
      const body = (await response.json().catch(() => null)) as { groupId?: string; groupName?: string; direct?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not join that group.");
      toast.success(body?.direct ? `You and ${body.groupName ?? "your friend"} are connected` : `You joined ${body?.groupName ?? "the group"}`);
      const section = body?.direct ? "/friends" : "/groups";
      router.push(body?.groupId ? `${section}/${encodeURIComponent(body.groupId)}` : section);
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Mark className="size-8" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-display">Khata</span>
        </div>

        <section className="rounded-3xl bg-card p-5 shadow-card sm:p-6">
          {phase === "loading" ? <Loading className="py-6" /> : null}

          {phase === "missing" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden>
                <LinkIcon className="size-5" />
              </span>
              <h1 className="display text-2xl">This invite is not valid</h1>
              <p className="text-sm leading-6 text-muted-foreground">The link may be mistyped, or the group may have been removed. Ask for a fresh one.</p>
              <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => router.push("/")}>
                Open Khata
              </Button>
            </div>
          ) : null}

          {info && (phase === "ready" || phase === "joining") ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground" aria-hidden>
                  {info.direct ? <UserPlus className="size-6" /> : <Users className="size-6" />}
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{info.direct ? "Friend invite from" : `${info.creatorName} invited you to`}</p>
                  <h1 className="display mt-1 text-2xl sm:text-[28px]">{info.groupName}</h1>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {info.direct ? `${info.creatorName} wants to split expenses and settle up with you.` : "Split expenses and settle up with everyone in this group."}
                </p>
                {info.inviteeEmail ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">For {info.inviteeEmail}</span>
                  </span>
                ) : null}
              </div>

              {info.expired ? <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">This invite has expired. Ask {info.creatorName} for a new one.</p> : null}
              {info.used && !info.expired ? <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">This invite has already been used.</p> : null}
              {error ? (
                <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              {!blocked ? (
                signedIn ? (
                  <Button type="button" className="w-full" disabled={phase === "joining"} onClick={() => void join()}>
                    {phase === "joining" ? "Joining" : info.direct ? `Connect with ${info.groupName}` : `Join ${info.groupName}`}
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button type="button" className="w-full" disabled={session.isPending} onClick={() => router.push(loginHref)}>
                      Sign in to join
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">New here? You can create an account on the next screen, then come straight back.</p>
                  </div>
                )
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => router.push("/")}>
                  Open Khata
                </Button>
              )}

              <p className="flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-credit" aria-hidden />
                Joining shares only {info.direct ? "the expenses between the two of you" : "this group's expenses"}. Your personal ledger stays private.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
