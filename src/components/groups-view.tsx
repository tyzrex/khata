"use client";

import { cn } from "cn";
import { Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { InviteDialog, type InviteActions } from "@/components/invite-dialog";
import { PageHeader } from "@/components/page-header";
import { GroupDetail, groupViewOf, positionWords, type GroupView } from "@/components/splits/group-detail";
import { GroupFormDialog } from "@/components/splits/group-form-dialog";
import { SETTLED, type Expense, type Settlement } from "@/components/splits/ledger-math";
import { AvatarStack, BalanceStrip, GroupTile, SplitCard, SplitCardHead } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import type { BalanceScope, ShareBook } from "@/db/shares";

type Debt = BalanceScope["youOwe"][number];
type Group = ShareBook["groups"][number];

const sum = (debts: Debt[]) => debts.reduce((total, debt) => total + debt.amount, 0);

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
  // On a wide screen /groups still shows a group beside the list; phones show only the list there.
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];
  const showDetail = selectedId != null;
  const [form, setForm] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null });
  const [inviteFor, setInviteFor] = useState<string | null>(null);

  const owedTotal = groups.reduce((total, group) => total + sum(group.balances.youAreOwed), 0);
  const oweTotal = groups.reduce((total, group) => total + sum(group.balances.youOwe), 0);
  const openGroups = groups.filter((group) => Math.abs(group.net) >= SETTLED).length;
  const ownedSelected = selected?.entry.kind === "owned" ? selected.entry.group : null;

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Splits"
        title="Groups"
        description="Trips, flats and rides. Everyone in a group sees the same tab, and settling here never moves your bank ledger."
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

      {groups.length === 0 || !selected ? (
        <SplitCard className="flex flex-col items-start gap-4 sm:p-6">
          <GroupTile name="+" size="lg" />
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-display">No groups yet</h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Start one for a trip, a flat, or the people you ride with. Add an expense, and Khata works out who owes whom.</p>
          </div>
          <Button type="button" onClick={() => setForm({ open: true, group: null })}>
            <Plus />
            New group
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
              third={{ label: "Groups", value: groups.length, hint: openGroups ? `${openGroups} with open balances` : "All settled" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start 2xl:gap-4">
            <SplitCard className={cn("lg:sticky lg:top-6", showDetail && "hidden lg:block")}>
              <SplitCardHead title="Your groups" hint={`${groups.length} ${groups.length === 1 ? "group" : "groups"}`} />
              <ul className="-mx-2 mt-2 flex flex-col">
                {groups.map((group) => (
                  <GroupRow key={group.id} group={group} active={group.id === selected.id} />
                ))}
              </ul>
            </SplitCard>

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
  const position = positionWords(group.net);
  return (
    <li>
      <Link
        href={groupHref(group.id)}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "lg:bg-accent" : "hover:bg-secondary",
        )}
      >
        <GroupTile name={group.name} active={active} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("truncate text-[15px] text-display", active ? "font-semibold" : "font-medium")}>{group.name}</span>
            {group.entry.kind === "joined" ? <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Joined</span> : null}
          </span>
          <span className={cn("mt-0.5 block truncate text-[13px] font-medium", position.tone)}>{position.text}</span>
        </span>
        <AvatarStack names={group.members.map((member) => member.name)} max={3} />
      </Link>
    </li>
  );
}
