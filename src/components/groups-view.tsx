"use client";

import { cn } from "cn";
import { ChevronRight, Plus, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InviteDialog, type InviteActions } from "@/components/invite-dialog";
import { PageHeader } from "@/components/page-header";
import { GroupDetail, groupViewOf, type GroupView } from "@/components/splits/group-detail";
import { DirectoryControls, DirectoryEmpty, type DirectoryFilter, type DirectorySort } from "@/components/splits/directory-controls";
import { GroupFormDialog } from "@/components/splits/group-form-dialog";
import { hasOpenBalance, SETTLED, type Expense, type Settlement } from "@/components/splits/ledger-math";
import { BalanceStrip, GroupTile, NetStack, SplitCard, SplitCardHead } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import type { BalanceScope, ShareBook } from "@/db/shares";

type Debt = BalanceScope["youOwe"][number];
type Group = ShareBook["groups"][number];

const sum = (debts: Debt[]) => debts.reduce((total, debt) => total + debt.amount, 0);
const groupIsOpen = (group: GroupView) => hasOpenBalance(group.balances);

function inGroups(count: number) {
  return count === 0 ? "In no group" : `In ${count} ${count === 1 ? "group" : "groups"}`;
}

const groupHref = (id: string) => `/groups/${encodeURIComponent(id)}`;

export function GroupsView({
  book,
  onSettle,
  onAddExpense,
  onEditExpense,
  onEditSettlement,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onLeaveGroup,
  onFriends,
  inviteActions,
  selectedId,
  onSelect,
}: {
  book: ShareBook;
  /** The group in the URL (`/groups/:id`), or null on the list. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSettle: (debt: Debt, groupId: string) => void;
  onAddExpense: (groupId: string) => void;
  onEditExpense: (expense: Expense) => void;
  onEditSettlement: (settlement: Settlement) => void;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
  onUpdateGroup: (id: string, input: { name?: string; memberIds?: string[] }) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onLeaveGroup: (id: string) => Promise<void>;
  /** Cross-link to the sibling page. Friends had one; Groups did not, so the pair was a one-way door. */
  onFriends: () => void;
  inviteActions: InviteActions;
}) {
  const groups: GroupView[] = [
    ...book.groups.filter((group) => group.kind === "group").map((group) => groupViewOf(book, { kind: "owned", group })),
    ...book.joinedGroups.filter((group) => group.kind === "group").map((group) => groupViewOf(book, { kind: "joined", group })),
  ];
  const showDetail = selectedId != null;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [sort, setSort] = useState<DirectorySort>("balance");
  const [form, setForm] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null });
  const [inviteFor, setInviteFor] = useState<string | null>(null);

  const owedTotal = groups.reduce((total, group) => total + sum(group.balances.youAreOwed), 0);
  const oweTotal = groups.reduce((total, group) => total + sum(group.balances.youOwe), 0);
  const openGroups = groups.filter(groupIsOpen).length;
  const latest = (group: GroupView) => [...group.expenses, ...group.settlements].reduce((date, item) => item.date > date ? item.date : date, "");
  const needle = query.trim().toLowerCase();
  const balanceSize = (group: GroupView) => Math.max(sum(group.balances.youOwe), sum(group.balances.youAreOwed));
  const visible = groups.filter((group) => (!needle || group.name.toLowerCase().includes(needle) || group.members.some((member) => member.name.toLowerCase().includes(needle))) && (filter === "all" || (filter === "open" ? groupIsOpen(group) : !groupIsOpen(group)))).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "recent" ? latest(b).localeCompare(latest(a)) || a.name.localeCompare(b.name) : balanceSize(b) - balanceSize(a) || a.name.localeCompare(b.name));
  const selected = selectedId ? groups.find((group) => group.id === selectedId) : visible[0];
  const ownedSelected = selected?.entry.kind === "owned" ? selected.entry.group : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={null}
        title="Groups"
        className={showDetail ? "hidden lg:flex" : undefined}
        description="Trips, home, and everything in between. Share the costs, keep the good company."
        actions={
          <>
            <Button type="button" variant="outline" className="bg-card shadow-card" onClick={onFriends}>
              <UserRound />
              Friends
            </Button>
            <Button type="button" onClick={() => setForm({ open: true, group: null })}>
              <Plus />
              New group
            </Button>
          </>
        }
      />

      {groups.length === 0 ? (
        <SplitCard className="flex flex-col items-center gap-5 py-12 text-center sm:py-16">
          <UsersRound className="size-10 text-interactive" strokeWidth={1.5} aria-hidden />
          <div className="max-w-md">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-display">Good company. Shared expenses.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Start a group for your next trip, your flat, or everyday plans. Add expenses, see everyone’s share, and settle up in one place.</p>
          </div>
          <Button type="button" onClick={() => setForm({ open: true, group: null })}>
            <Plus />
              Create your first group
          </Button>
        </SplitCard>
      ) : (
        <div className="flex flex-col gap-3 2xl:gap-4">
          <div className={showDetail ? "hidden lg:block" : undefined}>
            <BalanceStrip
              owed={owedTotal}
              owe={oweTotal}
              owedHint={inGroups(groups.filter((group) => sum(group.balances.youAreOwed) >= SETTLED).length)}
              oweHint={inGroups(groups.filter((group) => sum(group.balances.youOwe) >= SETTLED).length)}
              third={{ label: "To settle", value: openGroups, hint: openGroups ? `of ${groups.length} ${groups.length === 1 ? "group" : "groups"}` : "All settled" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)] lg:items-start">
            <SplitCard className={cn("lg:sticky lg:top-6", showDetail && "hidden lg:block")}>
              <SplitCardHead title="Your groups" hint={`${groups.length} ${groups.length === 1 ? "group" : "groups"}`}>
                <Button type="button" variant="outline" size="icon-sm" aria-label="New group" onClick={() => setForm({ open: true, group: null })}><Plus /></Button>
              </SplitCardHead>
              <DirectoryControls noun="groups" query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} counts={{ all: groups.length, open: openGroups, settled: groups.length - openGroups }} />
              <ul aria-label="Groups" className="-mx-2 mt-2 flex flex-col lg:max-h-[60vh] lg:overflow-y-auto">
                {visible.map((group) => (
                  <GroupRow key={group.id} group={group} active={group.id === selected?.id} />
                ))}
              </ul>
              {visible.length === 0 ? <DirectoryEmpty noun="groups" onReset={() => { setQuery(""); setFilter("all"); }} /> : null}
            </SplitCard>

            {selected ? (
            <div className={showDetail ? "min-w-0" : "hidden min-w-0 lg:block"}>
              <GroupDetail
                key={selected.id}
                group={selected}
                backHref="/groups"
                onSettle={onSettle}
                onAddExpense={() => onAddExpense(selected.id)}
                onEditExpense={onEditExpense}
                onEditSettlement={onEditSettlement}
                onInvite={ownedSelected ? () => setInviteFor(selected.id) : undefined}
                onEdit={ownedSelected ? () => setForm({ open: true, group: ownedSelected }) : undefined}
                onLeaveGroup={
                  selected.entry.kind === "joined"
                    ? async () => {
                        await onLeaveGroup(selected.id);
                        onSelect(null);
                      }
                    : undefined
                }
              />
            </div>
            ) : selectedId ? <SplitCard><h2 className="text-lg font-semibold">Group unavailable</h2><p className="mt-2 text-sm text-muted-foreground">This group was removed or you no longer have access.</p><Button variant="outline" className="mt-4" onClick={() => onSelect(null)}>All groups</Button></SplitCard> : <SplitCard className="hidden lg:block"><p className="py-12 text-center text-sm text-muted-foreground">Choose a group to see expenses and balances.</p></SplitCard>}
          </div>
        </div>
      )}

      <GroupFormDialog
        book={book}
        open={form.open}
        group={form.group}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        onCreate={onCreateGroup}
        onUpdate={onUpdateGroup}
        onDelete={async (id) => {
          await onDeleteGroup(id);
          onSelect(null);
        }}
      />

      {inviteFor ? <InviteDialog book={book} open onOpenChange={(next) => !next && setInviteFor(null)} groupId={inviteFor} actions={inviteActions} /> : null}
    </div>
  );
}

function GroupRow({ group, active }: { group: GroupView; active: boolean }) {
  const offsetting = Math.abs(group.net) < SETTLED && groupIsOpen(group);
  return (
    <li>
      <Link
        href={groupHref(group.id)}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-2 py-3.5 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "lg:bg-accent" : "hover:bg-secondary",
        )}
      >
        <GroupTile name={group.name} active={active} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-[15px] text-display", active ? "font-semibold" : "font-medium")}>{group.name}</span>
            {group.entry.kind === "joined" ? <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Joined</span> : null}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{group.members.length} members · {group.expenses.length} {group.expenses.length === 1 ? "expense" : "expenses"}</span>
        </span>
        {offsetting ? <span className="shrink-0 text-xs font-medium text-warning">To settle</span> : <NetStack value={group.net} owesLabel="you are owed" />}
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
      </Link>
    </li>
  );
}
