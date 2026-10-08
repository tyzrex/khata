"use client";

import { Pencil, Plus, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/status";
import { PageHeader } from "@/components/page-header";
import { sumAmounts } from "@/components/panel";
import { InviteDialog, type InviteActions } from "@/components/invite-dialog";
import {
  AvatarStack,
  BackButton,
  BalanceStrip,
  EmptyNote,
  GroupTile,
  HistoryList,
  NetStack,
  PersonAvatar,
  SETTLED,
  SplitCard,
  SplitCardHead,
  historyOf,
  netWords,
} from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BalanceScope, JoinedGroup, ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";

type Debt = BalanceScope["youOwe"][number];
type Expense = ShareBook["expenses"][number];

type AllGroup = { kind: "owned"; group: ShareBook["groups"][number] } | { kind: "joined"; group: JoinedGroup };

/** Everything the list and the detail need about one group, worked out once. */
type GroupView = {
  entry: AllGroup;
  id: string;
  name: string;
  selfId: string;
  members: ShareBook["people"];
  balances: BalanceScope;
  net: number;
  expenses: Expense[];
  settlements: ShareBook["settlements"];
  total: number;
  yourShare: number;
};

function inGroups(count: number) {
  return count === 0 ? "In no group" : `In ${count} ${count === 1 ? "group" : "groups"}`;
}

function viewOf(book: ShareBook, entry: AllGroup): GroupView {
  const { group } = entry;
  const selfId = entry.kind === "owned" ? book.self.id : entry.group.self.id;
  const expenses = entry.kind === "owned" ? book.expenses.filter((expense) => expense.groupId === group.id) : entry.group.expenses;
  const settlements = entry.kind === "owned" ? book.settlements.filter((settlement) => settlement.groupId === group.id) : entry.group.settlements;
  return {
    entry,
    id: group.id,
    name: group.name,
    selfId,
    members: group.members,
    balances: group.balances,
    net: sumAmounts(group.balances.youAreOwed) - sumAmounts(group.balances.youOwe),
    expenses,
    settlements,
    total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    yourShare: expenses.reduce((sum, expense) => sum + (expense.splits.find((split) => split.personId === selfId)?.amount ?? 0), 0),
  };
}

export function GroupsView({
  book,
  onSettle,
  onAddExpense,
  onEditExpense,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  inviteActions,
}: {
  book: ShareBook;
  onSettle: (debt: Debt, groupId: string) => void;
  onAddExpense: (groupId: string) => void;
  onEditExpense: (expense: Expense) => void;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
  onUpdateGroup: (id: string, input: { name?: string; memberIds?: string[] }) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  inviteActions: InviteActions;
}) {
  const groups: GroupView[] = [
    ...book.groups.filter((g) => g.kind === "group").map((g) => viewOf(book, { kind: "owned", group: g })),
    ...book.joinedGroups.filter((g) => g.kind === "group").map((g) => viewOf(book, { kind: "joined", group: g })),
  ];
  const [selectedId, setSelectedId] = useState(groups[0]?.id ?? "");
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];
  const ownedSelected = selected?.entry.kind === "owned" ? selected.entry.group : null;
  /** Phones show one pane at a time: the list, or the group picked from it. */
  const [showDetail, setShowDetail] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([book.self.id]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invite, setInvite] = useState<{ groupId: string } | null>(null);

  const owedTotal = groups.reduce((total, group) => total + sumAmounts(group.balances.youAreOwed), 0);
  const oweTotal = groups.reduce((total, group) => total + sumAmounts(group.balances.youOwe), 0);
  const openGroups = groups.filter((group) => Math.abs(group.net) >= SETTLED).length;

  function start(group?: ShareBook["groups"][number]) {
    setEditingId(group?.id ?? null);
    setName(group?.name ?? "");
    setMembers(group ? group.members.map((member) => member.id) : [book.self.id]);
    setError(null);
    setConfirmDelete(false);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (editingId) await onUpdateGroup(editingId, { name: name.trim(), memberIds: members });
      else await onCreateGroup(name.trim(), members);
      toast.success(editingId ? "Group updated" : "Group added");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that group.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      await onDeleteGroup(id);
      toast.success("Group removed");
      setOpen(false);
      setShowDetail(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove that group.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Splits"
        title="Groups"
        description="Trips, flats and rides. Shared expenses stay with the group, and settling here does not move the bank ledger."
        actions={
          <Button type="button" onClick={() => start()}>
            <Plus />
            New group
          </Button>
        }
      />

      {groups.length === 0 || !selected ? (
        <SplitCard className="flex flex-col items-start gap-4 sm:p-6">
          <GroupTile name="+" size="lg" />
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-display">No groups yet</h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Start one for a trip, a flat, or the people you ride with. Everyone sees the same balances once they join.</p>
          </div>
          <Button type="button" onClick={() => start()}>
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
              owedHint={inGroups(groups.filter((group) => sumAmounts(group.balances.youAreOwed) >= SETTLED).length)}
              oweHint={inGroups(groups.filter((group) => sumAmounts(group.balances.youOwe) >= SETTLED).length)}
              third={{ label: "Groups", value: groups.length, hint: openGroups ? `${openGroups} with open balances` : "All settled" }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start 2xl:gap-4">
            <SplitCard className={showDetail ? "hidden lg:block" : undefined}>
              <SplitCardHead title="Your groups" hint={`${groups.length} ${groups.length === 1 ? "group" : "groups"}`} />
              <ul className="-mx-2 mt-2 flex flex-col">
                {groups.map((group) => {
                  const active = group.id === selected.id;
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                          setSelectedId(group.id);
                          setShowDetail(true);
                        }}
                        className={
                          "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                          (active ? "lg:bg-accent" : "hover:bg-secondary")
                        }
                      >
                        <GroupTile name={group.name} active={active} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className={active ? "truncate text-sm font-semibold text-display" : "truncate text-sm font-medium text-display"}>{group.name}</span>
                            {group.entry.kind === "joined" ? <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Joined</span> : null}
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            <AvatarStack names={group.members.map((member) => member.name)} max={4} />
                            <span className="text-xs text-muted-foreground">{group.members.length}</span>
                          </span>
                        </span>
                        <NetStack value={group.net} owesLabel="you are owed" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SplitCard>

            <div className={showDetail ? "min-w-0" : "hidden min-w-0 lg:block"}>
              <GroupDetail
                key={selected.id}
                group={selected}
                onBack={() => setShowDetail(false)}
                onSettle={onSettle}
                onAddExpense={() => onAddExpense(selected.id)}
                onEditExpense={onEditExpense}
                onInvite={() => setInvite({ groupId: selected.id })}
                onEdit={ownedSelected ? () => start(ownedSelected) : undefined}
              />
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit group" : "New group"}</DialogTitle>
            <DialogDescription>Members can be added later. Past expenses stay even if someone leaves.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="group-name">Name</FieldLabel>
                <Input id="group-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Pokhara trip" />
              </Field>
              <Field>
                <FieldLabel>
                  Members <span className="font-normal text-muted-foreground">· {members.length} picked</span>
                </FieldLabel>
                <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl bg-secondary p-1">
                  {book.people.map((person) => {
                    const checked = members.includes(person.id);
                    return (
                      <li key={person.id}>
                        <label className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${checked ? "bg-card shadow-card" : "hover:bg-card/60"}`}>
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={checked}
                            onChange={(event) => setMembers((current) => (event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)))}
                          />
                          <PersonAvatar name={person.name} size="sm" linked={person.linkedUserId != null} />
                          <span className="min-w-0 flex-1 truncate font-medium text-display">{person.isSelf ? `${person.name} (you)` : person.name}</span>
                          {person.linkedUserId && !person.isSelf ? <span className="text-xs text-muted-foreground">On Khata</span> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
            <DialogFooter className="mt-5 sm:justify-between">
              {editingId ? (
                confirmDelete ? (
                  <span className="flex items-center gap-2">
                    <Button type="button" variant="destructive" disabled={pending} onClick={() => void remove(editingId)}>
                      Yes, delete it
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" className="hover:text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
                    Delete group
                  </Button>
                )
              ) : (
                <span />
              )}
              <Button type="submit" disabled={pending || members.length === 0 || !name.trim()}>
                {pending ? "Saving" : "Save group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {invite ? <InviteDialog book={book} open onOpenChange={(next) => !next && setInvite(null)} groupId={invite.groupId} actions={inviteActions} /> : null}
    </div>
  );
}

function GroupDetail({
  group,
  onBack,
  onSettle,
  onAddExpense,
  onEditExpense,
  onInvite,
  onEdit,
}: {
  group: GroupView;
  onBack: () => void;
  onSettle: (debt: Debt, groupId: string) => void;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onInvite: () => void;
  /** Only for groups you own. */
  onEdit?: () => void;
}) {
  const words = netWords(group.net);
  const history = historyOf(group.expenses, group.settlements);
  const { youOwe, youAreOwed, others } = group.balances;
  const owned = group.entry.kind === "owned";

  return (
    <div className="flex min-w-0 flex-col gap-3 2xl:gap-4">
      <SplitCard>
        <BackButton label="All groups" onClick={onBack} />
        <div className="flex items-start justify-between gap-3 max-lg:mt-2">
          <div className="flex min-w-0 items-center gap-4">
            <GroupTile name={group.name} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-display">{group.name}</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {group.members.length} people · {owned ? "You manage this group" : `Owned by ${(group.entry.group as JoinedGroup).ownerName}`}
              </p>
            </div>
          </div>
          {onEdit ? (
            <Button type="button" variant="outline" size="icon-sm" aria-label={`Edit ${group.name}`} title="Edit group" onClick={onEdit}>
              <Pencil className="size-4" />
            </Button>
          ) : null}
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Members">
          {group.members.map((member) => (
            <li key={member.id} className="flex items-center gap-1.5 rounded-lg bg-secondary py-1 pr-2.5 pl-1 text-xs font-medium text-foreground">
              <PersonAvatar name={member.name} size="sm" tone={member.isSelf ? "brand" : "neutral"} linked={member.linkedUserId != null && !member.isSelf} />
              {member.id === group.selfId ? "You" : member.name}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className={`text-xs font-medium ${words.tone}`}>{group.net > SETTLED ? "You are owed" : group.net < -SETTLED ? "You owe" : "You are settled up"}</p>
              <p className={`figure mt-1 text-[28px] leading-none ${Math.abs(group.net) < SETTLED ? "text-display" : words.tone}`}>{formatNpr(Math.abs(group.net))}</p>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>
                Group spend <span className="figure text-display">{formatNpr(group.total)}</span>
              </p>
              <p className="mt-0.5">
                Your share <span className="figure text-display">{formatNpr(group.yourShare)}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onAddExpense}>
              <Plus />
              Add expense
            </Button>
            {owned ? (
              <Button type="button" variant="outline" className="bg-card" onClick={onInvite}>
                <Send />
                Invite
              </Button>
            ) : null}
          </div>
        </div>
      </SplitCard>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] 2xl:items-start 2xl:gap-4">
        <SplitCard>
          <SplitCardHead title="Balances" hint="Simplified so the fewest payments settle it" />
          {youOwe.length + youAreOwed.length === 0 ? (
            <EmptyNote>Nothing open for you here.</EmptyNote>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {youOwe.map((debt) => (
                <DebtRow key={`owe-${debt.toId}`} name={debt.toName} value={-debt.amount} onSettle={() => onSettle(debt, group.id)} />
              ))}
              {youAreOwed.map((debt) => (
                <DebtRow key={`owed-${debt.fromId}`} name={debt.fromName} value={debt.amount} onSettle={() => onSettle(debt, group.id)} />
              ))}
            </ul>
          )}
          {others.length ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="label">Between others</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {others.map((debt) => (
                  <li key={`${debt.fromId}-${debt.toId}`} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {debt.fromName} → {debt.toName}
                    </span>
                    <span className="figure shrink-0 text-display">{formatNpr(debt.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SplitCard>

        <SplitCard>
          <SplitCardHead title="Activity" hint={history.length ? `${group.expenses.length} ${group.expenses.length === 1 ? "expense" : "expenses"} · ${group.settlements.length} ${group.settlements.length === 1 ? "payment" : "payments"}` : "Nothing yet"} />
          {history.length === 0 ? (
            <EmptyNote>No shared expenses yet. Add the first one and everyone sees it.</EmptyNote>
          ) : (
            <HistoryList items={history} selfId={group.selfId} hideGroup={group.name} onEditExpense={onEditExpense} />
          )}
        </SplitCard>
      </div>
    </div>
  );
}

function DebtRow({ name, value, onSettle }: { name: string; value: number; onSettle: () => void }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <PersonAvatar name={name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-display">{name}</span>
      <NetStack value={value} />
      <Button type="button" variant="outline" size="xs" onClick={onSettle}>
        Settle
      </Button>
    </li>
  );
}
