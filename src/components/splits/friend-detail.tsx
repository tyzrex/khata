"use client";

import { cn } from "cn";
import { ArrowLeft, ChevronRight, HandCoins, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DetailTabs } from "@/components/splits/detail-tabs";
import { ExpenseFeed } from "@/components/splits/expense-feed";
import { accountNote, settleDebt, type BookRow, type FriendEntry } from "@/components/splits/friend-entries";
import { feedOf, SETTLED, type Expense, type Settlement } from "@/components/splits/ledger-math";
import { EmptyNote, NetStack, PersonAvatar, SplitCard, SplitCardHead } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BalanceScope } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = BalanceScope["youOwe"][number];

export function FriendDetail({
  entry,
  onSettle,
  onAddExpense,
  addingExpense = false,
  onEditExpense,
  onEditSettlement,
  onRename,
  onInvite,
  onRemove,
}: {
  entry: FriendEntry;
  onSettle: (debt: Debt, groupId?: string) => void;
  onAddExpense: () => void;
  addingExpense?: boolean;
  onEditExpense: (expense: Expense) => void;
  onEditSettlement: (settlement: Settlement) => void;
  onRename: () => void;
  onInvite: () => void;
  onRemove: () => void;
}) {
  const { friend, rows } = entry;
  const [tab, setTab] = useState<"expenses" | "balances">("expenses");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const open = rows.filter((row) => Math.abs(row.net) >= SETTLED);
  const only = open.length === 1 ? open[0]! : null;
  const feed = feedOf(entry.expenses, entry.settlements);
  const first = friend.name.split(" ")[0] ?? friend.name;
  const settled = open.length === 0 && Math.abs(entry.net) < SETTLED;
  const offsetting = !settled && Math.abs(entry.net) < SETTLED;
  const owed = entry.net > 0;
  const needle = query.trim().toLowerCase();
  const visibleFeed = feed.filter((item) => (type === "all" || item.kind === type) && (!needle || (item.kind === "expense" ? `${item.expense.description} ${item.expense.note ?? ""} ${item.expense.paidByName} ${item.expense.groupName ?? ""}` : `${item.settlement.fromName} ${item.settlement.toName} ${item.settlement.note ?? ""}`).toLowerCase().includes(needle)));

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <SplitCard className="@container overflow-hidden p-0 sm:p-0 2xl:p-0">
        <div className="p-4 sm:p-5 2xl:p-6">
          <Link
            href="/friends"
            className="-ml-2 mb-2 flex h-11 w-fit items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All friends
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <PersonAvatar name={friend.name} size="lg" tone="accent" linked={!entry.own || friend.linkedUserId != null} />
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold tracking-[-0.02em] text-display sm:text-2xl">{friend.name}</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{accountNote(entry)}</p>
              </div>
            </div>
            {entry.own ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button type="button" variant="outline" size="icon-sm" aria-label={`Rename ${friend.name}`} title="Rename" onClick={onRename}>
                  <Pencil className="size-4" />
                </Button>
                <Button type="button" variant="outline" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${friend.name}`} title="Remove" onClick={onRemove}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={cn("flex flex-col gap-4 border-t border-border px-4 py-5 sm:px-5 @min-[640px]:flex-row @min-[640px]:items-end @min-[640px]:justify-between 2xl:px-6", settled ? "bg-secondary/50" : owed ? "bg-credit/6" : "bg-warning/6")}>
          <div className="min-w-0">
            <p className={cn("text-[13px] font-medium", settled ? "text-muted-foreground" : owed ? "text-credit" : "text-warning")}>
              {settled ? `You and ${first} are settled up` : offsetting ? "Payments still to settle" : owed ? `${first} owes you` : `You owe ${first}`}
            </p>
            {settled ? (
              <p className="display mt-1 text-[28px] leading-none text-display sm:text-[32px]">All square</p>
            ) : offsetting ? <p className="display mt-1 text-[28px] leading-none sm:text-[32px]">Balances in {open.length} books</p> : (
              <p className={cn("figure mt-1 text-[32px] leading-none sm:text-[40px]", owed ? "text-credit" : "text-warning")}>{formatNpr(Math.abs(entry.net))}</p>
            )}
            {open.length > 1 ? <p className="mt-1.5 text-[13px] text-muted-foreground">Across {open.length} books. Settle each one below.</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 @min-[640px]:flex @min-[640px]:flex-wrap">
            <Button type="button" disabled={addingExpense} onClick={onAddExpense}>
              <Plus />
              {addingExpense ? "Opening…" : "Add expense"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="bg-card"
              disabled={open.length === 0}
              title={open.length > 1 ? "Settle each book below" : undefined}
              onClick={() => only ? onSettle(settleDebt(entry, only.net), only.id ?? undefined) : setTab("balances")}
            >
              <HandCoins />
              Settle up
            </Button>
            {entry.own && !friend.linkedUserId ? (
              <Button type="button" variant="outline" className="col-span-2 bg-card" onClick={onInvite}>
                <Send />
                Invite to Khata
              </Button>
            ) : null}
          </div>
        </div>
      </SplitCard>

      <SplitCard className="overflow-hidden p-0 sm:p-0 2xl:p-0">
        <DetailTabs label={`${friend.name} views`} value={tab} onChange={setTab} tabs={[{ id: "expenses", label: "Activity", count: feed.length }, { id: "balances", label: "Balances", count: open.length }]}>
        {tab === "balances" ? <div className="p-4 sm:p-5 2xl:p-6">
          <SplitCardHead title="Where it comes from" hint={`Your balance with ${first} in each book`} />
          {rows.length === 0 ? (
            <EmptyNote>Nothing shared yet. Add an expense{entry.own && !friend.linkedUserId ? `, or invite ${first} so they see it too` : ""}.</EmptyNote>
          ) : (
            <ul className="-mx-2 mt-2 flex flex-col">
              {rows.map((row) => (
                <BookLine key={row.id ?? "outside"} row={row} onSettle={() => onSettle(settleDebt(entry, row.net), row.id ?? undefined)} />
              ))}
            </ul>
          )}
        </div> : null}

        {tab === "expenses" ? <div className="p-4 sm:p-5 2xl:p-6">
          <SplitCardHead title="Shared expenses" hint={feed.length ? "What you lent and borrowed, newest first" : "Nothing yet"} />
          {feed.length > 0 ? <div className="mt-4 mb-4 flex flex-wrap gap-2 border-b border-border pb-4">
            <div className="relative w-full min-w-0 sm:flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" aria-label="Search this friend's activity" placeholder="Search expenses or payments" value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-9" /></div>
            <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter friend activity by type" className="h-11 rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="all">All activity</option><option value="expense">Expenses only</option><option value="settlement">Payments only</option></select>
          </div> : null}
          {feed.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center"><p className="text-sm font-medium text-display">Your shared story starts here</p><p className="max-w-xs text-sm leading-6 text-muted-foreground">Add your first expense with {first}. Khata keeps track of who paid and what you each owe.</p><Button type="button" variant="outline" disabled={addingExpense} onClick={onAddExpense}><Plus />Add expense</Button></div>
          ) : visibleFeed.length === 0 ? <div className="py-10 text-center"><p className="text-sm text-muted-foreground">No activity matches these filters.</p><Button variant="link" className="mt-2" onClick={() => { setQuery(""); setType("all"); }}>Clear filters</Button></div> : (
            <ExpenseFeed
              items={visibleFeed}
              selfId={entry.selfId}
              withId={friend.id}
              hideGroup={entry.own ? undefined : friend.name}
              onEditExpense={onEditExpense}
              onEditSettlement={onEditSettlement}
            />
          )}
        </div> : null}
        </DetailTabs>
      </SplitCard>
    </div>
  );
}

/** One book shared with this friend. A real group links through to its own tab. */
function BookLine({ row, onSettle }: { row: BookRow; onSettle: () => void }) {
  const openBalance = Math.abs(row.net) >= SETTLED;
  const label = (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-medium text-display">{row.name}</span>
      <span className="mt-0.5 block text-[13px] text-muted-foreground">{row.direct ? "Direct" : row.id ? "Group" : "Not in a group"}</span>
    </span>
  );
  const linkable = row.id != null && !row.direct;
  return (
    <li className="flex items-center gap-2 px-2 py-1.5">
      {linkable ? (
        <Link
          href={`/groups/${encodeURIComponent(row.id!)}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1.5 pr-1 transition-colors outline-none hover:text-interactive focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
          <NetStack value={row.net} />
          <ChevronRight className="size-4 shrink-0 text-disabled" aria-hidden />
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
          {label}
          <NetStack value={row.net} />
        </span>
      )}
      {openBalance ? (
        <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={onSettle}>
          Settle
        </Button>
      ) : null}
    </li>
  );
}
