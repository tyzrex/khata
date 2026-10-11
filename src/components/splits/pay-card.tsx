"use client";

import { cn } from "cn";
import { PersonAvatar } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import type { BalanceScope } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = BalanceScope["youOwe"][number];

/**
 * One payment that clears part of the tab. This used to draw the payer and receiver
 * as avatars with an arrow, then repeat the same fact underneath as "Sameer pays
 * Anita" — two renderings of one sentence, stacked. It is now a single row: the
 * payer avatar, the sentence, the amount, and the action. You are named "You" and
 * coloured by direction, so the cards read as instructions.
 */
export function PaymentCard({ debt, selfId, onSettle }: { debt: Debt; selfId: string; onSettle?: () => void }) {
  const youPay = debt.fromId === selfId;
  const youGet = debt.toId === selfId;
  const from = youPay ? "You" : debt.fromName;
  const to = youGet ? "you" : debt.toName;
  const tone = youPay ? "text-warning" : youGet ? "text-credit" : "text-display";
  return (
    <li className={cn("flex items-center gap-3 rounded-2xl p-3 sm:p-4", youPay ? "bg-warning/8" : youGet ? "bg-credit/8" : "bg-secondary")}>
      <PersonAvatar name={debt.fromName} size="sm" tone={youPay ? "brand" : "neutral"} />
      <p className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted-foreground">
        <span className="font-semibold text-display">{from}</span> {youPay ? "pay" : "pays"} <span className="font-semibold text-display">{to}</span>
      </p>
      <span className={cn("figure shrink-0 text-base", tone)}>{formatNpr(debt.amount)}</span>
      {onSettle && (youPay || youGet) ? (
        <Button type="button" variant="outline" size="xs" className="shrink-0 bg-card" onClick={onSettle}>
          {youPay ? "Pay" : "Record"}
        </Button>
      ) : null}
    </li>
  );
}
