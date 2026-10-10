"use client";

import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import { PersonAvatar } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import type { BalanceScope } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = BalanceScope["youOwe"][number];

/**
 * One payment that clears part of the tab: payer, arrow, receiver, amount. You are
 * named "You" and coloured by direction, so the cards read as instructions.
 */
export function PaymentCard({ debt, selfId, onSettle }: { debt: Debt; selfId: string; onSettle?: () => void }) {
  const youPay = debt.fromId === selfId;
  const youGet = debt.toId === selfId;
  const from = youPay ? "You" : debt.fromName;
  const to = youGet ? "you" : debt.toName;
  return (
    <li className={cn("flex flex-col gap-3 rounded-2xl p-3 sm:p-4", youPay ? "bg-warning/8" : youGet ? "bg-credit/8" : "bg-secondary")}>
      <div className="flex items-center gap-2">
        <PersonAvatar name={debt.fromName} size="sm" tone={youPay ? "brand" : "neutral"} />
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <PersonAvatar name={debt.toName} size="sm" tone={youGet ? "brand" : "neutral"} />
        <span className={cn("figure ml-auto text-base", youPay ? "text-warning" : youGet ? "text-credit" : "text-display")}>{formatNpr(debt.amount)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] leading-5 text-muted-foreground">
          <span className="font-semibold text-display">{from}</span> {youPay ? "pay" : "pays"} <span className="font-semibold text-display">{to}</span>
        </p>
        {onSettle && (youPay || youGet) ? (
          <Button type="button" variant="outline" size="xs" className="shrink-0 bg-card" onClick={onSettle}>
            {youPay ? "Pay" : "Record"}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
