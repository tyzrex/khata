"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { ShareBook } from "@/db/shares";
import { formatEntryDate, formatNpr } from "@/lib/format";

type Item =
  | { kind: "expense"; date: string; id: string; expense: ShareBook["expenses"][number] }
  | { kind: "settlement"; date: string; id: string; settlement: ShareBook["settlements"][number] };

export function ActivityView({
  book,
  onEditExpense,
  onDeleteSettlement,
}: {
  book: ShareBook;
  onEditExpense: (expense: ShareBook["expenses"][number]) => void;
  onDeleteSettlement: (id: string) => Promise<void>;
}) {
  const items: Item[] = [
    ...book.expenses.map((expense) => ({ kind: "expense" as const, date: expense.date, id: expense.id, expense })),
    ...book.settlements.map((settlement) => ({ kind: "settlement" as const, date: settlement.date, id: settlement.id, settlement })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === "settlement" ? -1 : 1));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">Shared expenses and the payments that settled them. Bank imports are not listed here.</p>
      </div>
      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No shared history</EmptyTitle>
            <EmptyDescription>Add a shared expense from a group, or record a settlement.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="rounded-lg border border-border bg-card px-4">
          {items.map((item) =>
            item.kind === "expense" ? (
              <li key={item.id} className="border-b border-border last:border-b-0">
                <button type="button" className="flex w-full items-start gap-3 py-3 text-left" onClick={() => onEditExpense(item.expense)}>
                  <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">{formatEntryDate(item.expense.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm">{item.expense.description}</span>
                      <Badge variant="outline">{item.expense.splitMode}</Badge>
                      {item.expense.groupName ? <Badge variant="secondary">{item.expense.groupName}</Badge> : null}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{item.expense.paidByName} paid</span>
                  </span>
                  <span className="figure text-sm">{formatNpr(item.expense.amount)}</span>
                </button>
              </li>
            ) : (
              <li key={item.id} className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
                <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">{formatEntryDate(item.settlement.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      {item.settlement.fromName} paid {item.settlement.toName}
                    </span>
                    <Badge variant="outline">Settlement</Badge>
                    {item.settlement.groupName ? <Badge variant="secondary">{item.settlement.groupName}</Badge> : null}
                  </span>
                  {item.settlement.transaction ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Bank · {item.settlement.transaction.merchant} {formatNpr(item.settlement.transaction.amount)}
                      {item.settlement.transaction.amount !== item.settlement.amount
                        ? ` · ${formatNpr(Math.abs(item.settlement.transaction.amount - item.settlement.amount))} apart`
                        : ""}
                    </span>
                  ) : null}
                  {item.settlement.note ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.settlement.note}</span> : null}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="figure text-sm text-credit">{formatNpr(item.settlement.amount)}</span>
                  <Button type="button" variant="ghost" size="xs" onClick={() => void onDeleteSettlement(item.settlement.id)}>
                    Remove
                  </Button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
