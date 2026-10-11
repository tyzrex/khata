"use client";

import { cn } from "cn";
import { ArrowLeft, HandCoins, LogOut, Pencil, Plus, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ExpenseFeed } from "@/components/splits/expense-feed";
import { GroupFeedFilterBar, useGroupFeedFilters } from "@/components/splits/group-feed-filters";
import { feedOf, memberLines, SETTLED, totalsFor, type Expense, type Person, type Settlement } from "@/components/splits/ledger-math";
import { toast } from "@/lib/status";
import { PaymentCard } from "@/components/splits/pay-card";
import { EmptyNote, GroupTile, PersonAvatar, SplitCard, SplitCardHead } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import type { BalanceScope, JoinedGroup, ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";
import { applyGroupFilters, describeGroupFeedFilters, hasGroupFeedFilters } from "@/lib/group-filters";

type Debt = BalanceScope["youOwe"][number];

export type GroupEntry = { kind: "owned"; group: ShareBook["groups"][number] } | { kind: "joined"; group: JoinedGroup };

/** Everything the list and the detail need about one group, worked out once. */
export type GroupView = {
  entry: GroupEntry;
  id: string;
  name: string;
  selfId: string;
  members: Person[];
  balances: BalanceScope;
  /** Positive: the group owes you. */
  net: number;
  expenses: Expense[];
  settlements: Settlement[];
};

const sum = (debts: Debt[]) => debts.reduce((total, debt) => total + debt.amount, 0);

export function groupViewOf(book: ShareBook, entry: GroupEntry): GroupView {
  const { group } = entry;
  const owned = entry.kind === "owned";
  return {
    entry,
    id: group.id,
    name: group.name,
    selfId: owned ? book.self.id : entry.group.self.id,
    members: group.members,
    balances: group.balances,
    net: sum(group.balances.youAreOwed) - sum(group.balances.youOwe),
    expenses: owned ? book.expenses.filter((expense) => expense.groupId === group.id) : entry.group.expenses,
    settlements: owned ? book.settlements.filter((settlement) => settlement.groupId === group.id) : entry.group.settlements,
  };
}

/** "you are owed NPR 1,200", "you owe NPR 300", or "settled up". */
export function positionWords(net: number) {
  if (Math.abs(net) < SETTLED) return { text: "settled up", tone: "text-muted-foreground" };
  return net > 0 ? { text: `you are owed ${formatNpr(net)}`, tone: "text-credit" } : { text: `you owe ${formatNpr(-net)}`, tone: "text-warning" };
}

const TABS = [
  { id: "expenses", label: "Expenses" },
  { id: "balances", label: "Balances" },
  { id: "totals", label: "Totals" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** The tab lives in `?tab=` so Back and a shared link land on the same view. The default is left out of the URL. */
function useTab(): [TabId, (next: TabId) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const raw = params.get("tab");
  const tab = TABS.some((item) => item.id === raw) ? (raw as TabId) : "expenses";
  function set(next: TabId) {
    const query = new URLSearchParams(params);
    if (next === "expenses") query.delete("tab");
    else query.set("tab", next);
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }
  return [tab, set];
}

export function GroupDetail({
  group,
  backHref,
  onSettle,
  onAddExpense,
  onEditExpense,
  onEditSettlement,
  onInvite,
  onEdit,
  onLeaveGroup,
}: {
  group: GroupView;
  backHref: string;
  onSettle: (debt: Debt, groupId: string) => void;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onEditSettlement: (settlement: Settlement) => void;
  /** Only for groups you own. */
  onInvite?: () => void;
  onEdit?: () => void;
  /** Only for groups you joined. */
  onLeaveGroup?: () => Promise<void>;
}) {
  const [tab, setTab] = useTab();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const { youOwe, youAreOwed } = group.balances;
  const yourDebts = [...youOwe, ...youAreOwed];
  const owner = group.entry.kind === "owned" ? "You manage this group" : `Owned by ${group.entry.group.ownerName}`;
  const settled = Math.abs(group.net) < SETTLED;

  function settleUp() {
    // One open balance: go straight to paying it. Several: show who, so the person picks.
    if (yourDebts.length === 1) onSettle(yourDebts[0]!, group.id);
    else setTab("balances");
  }

  async function leaveGroup() {
    if (!onLeaveGroup) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await onLeaveGroup();
      toast.success(`Left ${group.name}`);
    } catch (caught) {
      setLeaveError(caught instanceof Error ? caught.message : "Could not leave that group.");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 2xl:gap-4">
      <SplitCard className="overflow-hidden p-0 sm:p-0 2xl:p-0">
        <div className="p-4 sm:p-5 2xl:p-6">
          <Link
            href={backHref}
            className="-ml-2 mb-2 flex h-9 w-fit items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-display focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All groups
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <GroupTile name={group.name} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-display sm:text-2xl">{group.name}</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {group.members.length} {group.members.length === 1 ? "person" : "people"} · {owner}
                </p>
              </div>
            </div>
            {onEdit ? (
              <Button type="button" variant="outline" size="icon-sm" aria-label={`Edit ${group.name}`} title="Edit group" onClick={onEdit}>
                <Pencil className="size-4" />
              </Button>
            ) : onLeaveGroup ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground"
                aria-expanded={confirmingLeave}
                aria-controls="leave-group-confirmation"
                onClick={() => {
                  setConfirmingLeave((current) => !current);
                  setLeaveError(null);
                }}
              >
                <LogOut className="size-4" />
                Leave group
              </Button>
            ) : null}
          </div>

          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Members">
            {group.members.map((member) => (
              <li key={member.id} className="flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-foreground">
                <PersonAvatar name={member.name} size="sm" tone={member.id === group.selfId ? "brand" : "neutral"} linked={member.linkedUserId != null && member.id !== group.selfId} />
                {member.id === group.selfId ? "You" : member.name}
              </li>
            ))}
          </ul>

          {confirmingLeave && onLeaveGroup ? (
            <div id="leave-group-confirmation" className="mt-4 rounded-xl bg-secondary px-3 py-3">
              <p className="text-sm font-semibold text-display">Leave {group.name}?</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {yourDebts.length
                  ? "Settle every open balance first. This keeps money owed to you or by you from becoming inaccessible."
                  : "The group keeps its expense and payment history. You will lose access to the group and its future updates."}
              </p>
              {leaveError ? <p role="alert" className="mt-2 text-xs font-medium text-destructive">{leaveError}</p> : null}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={leaving} onClick={() => setConfirmingLeave(false)}>
                  Keep access
                </Button>
                <Button type="button" variant="destructive" size="sm" disabled={leaving || yourDebts.length > 0} onClick={() => void leaveGroup()}>
                  {leaving ? "Leaving" : yourDebts.length ? "Balance still open" : "Leave group"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={cn("flex flex-col gap-4 border-t border-border px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5 2xl:px-6", settled ? "bg-secondary/50" : group.net > 0 ? "bg-credit/6" : "bg-warning/6")}>
          <div className="min-w-0">
            <p className={cn("text-[13px] font-medium", settled ? "text-muted-foreground" : group.net > 0 ? "text-credit" : "text-warning")}>
              {settled ? "You are settled up" : group.net > 0 ? "You are owed" : "You owe"}
            </p>
            {settled ? (
              <p className="display mt-1 text-[28px] leading-none text-display sm:text-[32px]">All square</p>
            ) : (
              <p className={cn("figure mt-1 text-[32px] leading-none sm:text-[40px]", group.net > 0 ? "text-credit" : "text-warning")}>{formatNpr(Math.abs(group.net))}</p>
            )}
            {!settled && yourDebts.length > 1 ? <p className="mt-1.5 text-xs text-muted-foreground">Across {yourDebts.length} people in this group</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button type="button" onClick={onAddExpense}>
              <Plus />
              Add expense
            </Button>
            <Button type="button" variant="outline" className="bg-card" disabled={yourDebts.length === 0} onClick={settleUp}>
              <HandCoins />
              Settle up
            </Button>
            {onInvite ? (
              <Button type="button" variant="outline" className="col-span-2 bg-card sm:col-span-1" onClick={onInvite}>
                <Send />
                Invite
              </Button>
            ) : null}
          </div>
        </div>

        <div role="tablist" aria-label={`${group.name} views`} className="flex gap-1 border-t border-border px-2 sm:px-3">
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`group-tab-${item.id}`}
                aria-selected={active}
                aria-controls={`group-panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={cn(
                  "relative h-11 flex-1 rounded-t-lg px-3 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:px-4",
                  active ? "text-display after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-display",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </SplitCard>

      <div role="tabpanel" id={`group-panel-${tab}`} aria-labelledby={`group-tab-${tab}`} className="min-w-0">
        {tab === "expenses" ? <ExpensesPanel group={group} onEditExpense={onEditExpense} onEditSettlement={onEditSettlement} onAddExpense={onAddExpense} /> : null}
        {tab === "balances" ? <BalancesPanel group={group} onSettle={onSettle} /> : null}
        {tab === "totals" ? <TotalsPanel group={group} /> : null}
      </div>
    </div>
  );
}

function ExpensesPanel({
  group,
  onEditExpense,
  onEditSettlement,
  onAddExpense,
}: {
  group: GroupView;
  onEditExpense: (expense: Expense) => void;
  onEditSettlement: (settlement: Settlement) => void;
  onAddExpense: () => void;
}) {
  // Only this group's rows exist here, so filtering cannot reach another book.
  const all = feedOf(group.expenses, group.settlements);
  const filters = useGroupFeedFilters();
  const feed = applyGroupFilters(all, filters.value, { members: group.members });
  const filtering = hasGroupFeedFilters(filters.value);
  const summary = describeGroupFeedFilters(filters.value);

  return (
    <SplitCard>
      <SplitCardHead
        title="Expenses"
        hint={
          all.length
            ? filtering
              ? `${feed.length} of ${all.length} · ${summary.join(" · ")}`
              : `${group.expenses.length} ${group.expenses.length === 1 ? "expense" : "expenses"} · ${group.settlements.length} ${group.settlements.length === 1 ? "payment" : "payments"}`
            : "Nothing yet"
        }
      />
      {all.length ? (
        <GroupFeedFilterBar group={group} filters={filters.value} counts={all.length} />
      ) : null}
      {all.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">No shared expenses yet. Add the first one and everyone in the group sees it.</p>
          <Button type="button" variant="outline" size="sm" onClick={onAddExpense}>
            <Plus />
            Add expense
          </Button>
        </div>
      ) : feed.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            Nothing in {group.name} matches {summary.length ? summary.join(", ") : "these filters"}.
          </p>
          {filtering ? (
            <Button type="button" variant="outline" size="sm" onClick={filters.reset}>
              Reset filters
            </Button>
          ) : null}
        </div>
      ) : (
        <ExpenseFeed items={feed} selfId={group.selfId} hideGroup={group.name} onEditExpense={onEditExpense} onEditSettlement={onEditSettlement} />
      )}
    </SplitCard>
  );
}

function BalancesPanel({ group, onSettle }: { group: GroupView; onSettle: (debt: Debt, groupId: string) => void }) {
  const lines = memberLines(group.members, group.expenses, group.settlements).sort((a, b) => b.net - a.net);
  const debtWith = (id: string) => group.balances.youOwe.find((debt) => debt.toId === id) ?? group.balances.youAreOwed.find((debt) => debt.fromId === id);
  const simplified = group.balances.simplified;

  return (
    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] 2xl:items-start 2xl:gap-4">
      <SplitCard>
        <SplitCardHead title="Everyone in the group" hint="What each person paid against their share" />
        <ul className="mt-2 divide-y divide-border">
          {lines.map((line) => {
            const you = line.id === group.selfId;
            const debt = you ? undefined : debtWith(line.id);
            const open = Math.abs(line.net) >= SETTLED;
            return (
              <li key={line.id} className="flex items-center gap-3 py-3">
                <PersonAvatar name={line.name} size="md" tone={you ? "brand" : "neutral"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-display">{you ? "You" : line.name}</span>
                  <span className={cn("block truncate text-xs", !open ? "text-muted-foreground" : line.net > 0 ? "text-credit" : "text-warning")}>
                    {!open ? "settled up" : line.net > 0 ? `${you ? "get" : "gets"} back ${formatNpr(line.net)}` : `${you ? "owe" : "owes"} ${formatNpr(-line.net)}`}
                  </span>
                </span>
                {debt ? (
                  <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={() => onSettle(debt, group.id)}>
                    Settle up
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SplitCard>

      <SplitCard>
        <SplitCardHead title="Simplest way to settle" hint="The fewest payments that square the group" />
        {simplified.length === 0 ? (
          <EmptyNote>Nobody owes anybody here.</EmptyNote>
        ) : (
          <ul className="mt-3 grid gap-2">
            {simplified.map((debt) => (
              <PaymentCard key={`${debt.fromId}-${debt.toId}`} debt={debt} selfId={group.selfId} onSettle={() => onSettle(debt, group.id)} />
            ))}
          </ul>
        )}
      </SplitCard>
    </div>
  );
}

function TotalsPanel({ group }: { group: GroupView }) {
  const totals = totalsFor(group.expenses, group.selfId);
  const lines = memberLines(group.members, group.expenses, group.settlements)
    .filter((line) => line.paid > 0 || line.share > 0)
    .sort((a, b) => b.share - a.share);
  const scale = Math.max(1, ...lines.flatMap((line) => [line.paid, line.share]));

  return (
    <div className="flex flex-col gap-3 2xl:gap-4">
      <section className="grid grid-cols-3 rounded-3xl bg-card shadow-card" aria-label="Group totals">
        <Stat label="Group spend" value={formatNpr(totals.spend)} className="border-r border-border" />
        <Stat label="Your share" value={formatNpr(totals.yourShare)} className="border-r border-border" />
        <Stat label="You paid" value={formatNpr(totals.youPaid)} />
      </section>
      <SplitCard>
        <SplitCardHead title="Who spent what" hint="Paid for the group, and their own share of it" />
        {lines.length === 0 ? (
          <EmptyNote>Totals appear once the group has expenses.</EmptyNote>
        ) : (
          <>
            <p className="mt-3 flex gap-4 text-[11px] font-medium text-muted-foreground" aria-hidden>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" /> Paid
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-soft" /> Share
              </span>
            </p>
            <ul className="mt-3 flex flex-col gap-4">
              {lines.map((line) => (
                <li key={line.id} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:gap-x-3">
                  <span className="truncate sm:row-span-2 text-sm font-medium text-display">{line.id === group.selfId ? "You" : line.name}</span>
                  <Bar value={line.paid} scale={scale} tone="bg-primary" label={`paid ${formatNpr(line.paid)}`} />
                  <Bar value={line.share} scale={scale} tone="bg-chart-soft" label={`share ${formatNpr(line.share)}`} />
                </li>
              ))}
            </ul>
          </>
        )}
      </SplitCard>
    </div>
  );
}

function Bar({ value, scale, tone, label }: { value: number; scale: number; tone: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(value > 0 ? 2 : 0, (value / scale) * 100)}%` }} />
      </span>
      <span className="figure w-28 shrink-0 text-right text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("min-w-0 p-3 sm:p-5", className)}>
      <p className="label truncate">{label}</p>
      <p className="figure mt-2 truncate text-sm text-display sm:text-xl">{value}</p>
    </div>
  );
}
