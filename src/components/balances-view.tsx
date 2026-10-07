"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Panel, sumAmounts } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

function DebtList({
  debts,
  empty,
  onSettle,
}: {
  debts: BalanceScope["youOwe"];
  empty: string;
  onSettle: (debt: BalanceScope["youOwe"][number]) => void;
}) {
  if (debts.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {debts.map((debt) => {
        const other = debt.fromName === "You" ? debt.toName : debt.fromName;
        return (
          <li key={`${debt.fromId}-${debt.toId}`} className="flex items-center gap-3 py-3">
            <Avatar size="sm">
              <AvatarFallback>{initials(other)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{other}</p>
            </div>
            <p className="figure text-sm">{formatNpr(debt.amount)}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => onSettle(debt)}>
              Settle
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function BalancesView({
  book,
  onSettle,
  onCreatePerson,
  onRenamePerson,
  onDeletePerson,
}: {
  book: ShareBook;
  onSettle: (debt: BalanceScope["youOwe"][number], groupId?: string) => void;
  onCreatePerson: (name: string) => Promise<void>;
  onRenamePerson: (id: string, name: string) => Promise<void>;
  onDeletePerson: (id: string) => Promise<void>;
}) {
  const [personOpen, setPersonOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const owe = sumAmounts(book.overall.youOwe);
  const owed = sumAmounts(book.overall.youAreOwed);

  function start(person?: ShareBook["people"][number]) {
    setEditingId(person?.id ?? null);
    setName(person?.name ?? "");
    setError(null);
    setPersonOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (editingId) await onRenamePerson(editingId, name);
      else await onCreatePerson(name);
      toast.success(editingId ? "Name updated" : "Person added");
      setPersonOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that person.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium tracking-tight">Balances</h1>
          <p className="text-sm text-muted-foreground">Who owes whom, across every group and any expense outside one.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => start()}>
            Add person
          </Button>
          <Button type="button" onClick={() => onSettle({ fromId: book.self.id, toId: book.people.find((person) => !person.isSelf)?.id ?? book.self.id, fromName: book.self.name, toName: "", amount: 0 })}>
            Settle up
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="You owe" meta={formatNpr(owe)}>
          <DebtList debts={book.overall.youOwe} empty="You do not owe anyone." onSettle={(debt) => onSettle(debt)} />
        </Panel>
        <Panel title="You are owed" meta={formatNpr(owed)}>
          <DebtList debts={book.overall.youAreOwed} empty="Nobody owes you." onSettle={(debt) => onSettle(debt)} />
        </Panel>
      </div>

      {book.overall.others.length ? (
        <Panel title="Between others">
          <ul className="divide-y divide-border">
            {book.overall.others.map((debt) => (
              <li key={`${debt.fromId}-${debt.toId}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  {debt.fromName} {debt.fromName === "You" ? "owe" : "owes"} {debt.toName}
                </span>
                <span className="figure">{formatNpr(debt.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {book.overall.simplified.length ? (
        <Panel title="Simplified">
          <ul className="divide-y divide-border">
            {book.overall.simplified.map((debt) => (
              <li key={`${debt.fromId}-${debt.toId}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  {debt.fromName} {debt.fromName === "You" ? "pay" : "pays"} {debt.toName}
                </span>
                <span className="figure">{formatNpr(debt.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="pb-3 text-xs text-muted-foreground">Fewest payments that clear the same nets. The lists above keep each friendship intact.</p>
        </Panel>
      ) : null}

      <Panel title="People" action={<Button type="button" variant="ghost" size="sm" onClick={() => start()}>Add</Button>}>
        {book.people.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No one here yet</EmptyTitle>
              <EmptyDescription>Add the people you split with.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {book.people.map((person) => (
              <li key={person.id} className="flex items-center gap-3 py-3">
                <Avatar size="sm">
                  <AvatarFallback>{initials(person.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{person.name}</p>
                  <p className="text-xs text-muted-foreground">{person.isSelf ? "You" : "Friend"}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => start(person)}>
                  Rename
                </Button>
                {person.isSelf ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void onDeletePerson(person.id).catch((caught: unknown) => {
                        toast.error(caught instanceof Error ? caught.message : "Could not remove that person.");
                      });
                    }}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={personOpen} onOpenChange={setPersonOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Rename" : "Add person"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="person-name">Name</FieldLabel>
                <Input id="person-name" required value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
            <DialogFooter className="mt-5">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
