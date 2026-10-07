"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Panel, sumAmounts } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { formatEntryDate, formatNpr } from "@/lib/format";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function GroupsView({
  book,
  onSettle,
  onAddExpense,
  onEditExpense,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
}: {
  book: ShareBook;
  onSettle: (debt: BalanceScope["youOwe"][number], groupId: string) => void;
  onAddExpense: (groupId: string) => void;
  onEditExpense: (expense: ShareBook["expenses"][number]) => void;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
  onUpdateGroup: (id: string, input: { name?: string; memberIds?: string[] }) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(book.groups[0]?.id ?? "");
  const selected = book.groups.find((group) => group.id === selectedId) ?? book.groups[0];
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([book.self.id]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function start(group?: ShareBook["groups"][number]) {
    setEditingId(group?.id ?? null);
    setName(group?.name ?? "");
    setMembers(group ? group.members.map((member) => member.id) : [book.self.id]);
    setError(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (editingId) await onUpdateGroup(editingId, { name, memberIds: members });
      else await onCreateGroup(name, members);
      toast.success(editingId ? "Group updated" : "Group added");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that group.");
    } finally {
      setPending(false);
    }
  }

  const expenses = selected ? book.expenses.filter((expense) => expense.groupId === selected.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground">Shared expenses stay with the group. Settling here does not move the bank ledger.</p>
        </div>
        <Button type="button" onClick={() => start()}>
          New group
        </Button>
      </div>

      {book.groups.length === 0 || !selected ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No groups yet</EmptyTitle>
            <EmptyDescription>Start one for a trip, a flat, or the people you ride with.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => start()}>
              New group
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex flex-col rounded-lg border border-border bg-card">
            {book.groups.map((group) => {
              const active = group.id === selected.id;
              const owe = sumAmounts(group.balances.youOwe);
              const owed = sumAmounts(group.balances.youAreOwed);
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedId(group.id)}
                  className={active ? "border-b border-border bg-muted/60 px-4 py-3 text-left last:border-b-0" : "border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"}
                >
                  <p className="text-sm font-medium">{group.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {group.members.length} people
                    {owe ? ` · owe ${formatNpr(owe)}` : ""}
                    {owed ? ` · owed ${formatNpr(owed)}` : ""}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {selected.members.map((member) => (
                  <span key={member.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-xs">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(member.name)}</AvatarFallback>
                    </Avatar>
                    {member.name}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => start(selected)}>
                  Edit
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onAddExpense(selected.id)}>
                  Add expense
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="You owe" meta={formatNpr(sumAmounts(selected.balances.youOwe))}>
                {selected.balances.youOwe.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">Nothing to pay in this group.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {selected.balances.youOwe.map((debt) => (
                      <li key={debt.toId} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <span>{debt.toName}</span>
                        <span className="flex items-center gap-3">
                          <span className="figure">{formatNpr(debt.amount)}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => onSettle(debt, selected.id)}>
                            Settle
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="You are owed" meta={formatNpr(sumAmounts(selected.balances.youAreOwed))}>
                {selected.balances.youAreOwed.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">Nobody owes you here.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {selected.balances.youAreOwed.map((debt) => (
                      <li key={debt.fromId} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <span>{debt.fromName}</span>
                        <span className="flex items-center gap-3">
                          <span className="figure text-credit">{formatNpr(debt.amount)}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => onSettle(debt, selected.id)}>
                            Settle
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Expenses">
              {expenses.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No shared expenses in this group.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {expenses.map((expense) => (
                    <li key={expense.id}>
                      <button type="button" className="flex w-full items-start gap-3 py-3 text-left" onClick={() => onEditExpense(expense)}>
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatEntryDate(expense.date)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{expense.description}</span>
                          <span className="text-xs text-muted-foreground">
                            {expense.paidByName} paid · {expense.splitMode}
                          </span>
                        </span>
                        <span className="figure text-sm">{formatNpr(expense.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
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
                <Input id="group-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Biker Gang" />
              </Field>
              <Field>
                <FieldLabel>Members</FieldLabel>
                <div className="flex flex-col gap-2">
                  {book.people.map((person) => (
                    <label key={person.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={members.includes(person.id)}
                        onChange={(event) =>
                          setMembers((current) => (event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)))
                        }
                      />
                      {person.name}
                    </label>
                  ))}
                </div>
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
            <DialogFooter className="mt-5 sm:justify-between">
              {editingId ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    void onDeleteGroup(editingId)
                      .then(() => {
                        toast.success("Group removed");
                        setOpen(false);
                      })
                      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not remove that group."));
                  }}
                >
                  Delete group
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={pending || members.length === 0}>
                {pending ? "Saving" : "Save group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
