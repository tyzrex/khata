"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";
import { buildSplits, ShareInputError, type SplitMode } from "@/lib/split";
import type { TransactionDto } from "@/lib/types";

type Expense = ShareBook["expenses"][number];

type Row = { personId: string; included: boolean; amount: string; weight: string };

const modes: { id: SplitMode; label: string }[] = [
  { id: "equal", label: "Equal" },
  { id: "exact", label: "Exact" },
  { id: "shares", label: "Shares" },
  { id: "percent", label: "Percent" },
];

function rowsFor(people: ShareBook["people"], expense?: Expense, memberIds?: string[]): Row[] {
  return people.map((person) => {
    const split = expense?.splits.find((item) => item.personId === person.id);
    const included = expense ? Boolean(split) : memberIds ? memberIds.includes(person.id) : person.isSelf;
    return {
      personId: person.id,
      included,
      amount: split ? String(split.amount) : "",
      weight: split?.weight != null ? String(split.weight) : person.isSelf ? "1" : "1",
    };
  });
}

export function ShareExpenseDialog({
  open,
  today,
  book,
  transactions,
  expense,
  groupId,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  today: string;
  book: ShareBook;
  transactions: TransactionDto[];
  expense?: Expense;
  groupId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: unknown, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const sessionKey = `${open ? "open" : "closed"}:${expense?.id ?? "new"}:${groupId ?? ""}:${today}`;
  const [session, setSession] = useState(sessionKey);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.date || today);
  const [paidById, setPaidById] = useState(expense?.paidById ?? book.self.id);
  const [chosenGroup, setChosenGroup] = useState(expense?.groupId ?? groupId ?? "none");
  const [mode, setMode] = useState<SplitMode>(expense?.splitMode ?? "equal");
  const [note, setNote] = useState(expense?.note ?? "");
  const [rows, setRows] = useState<Row[]>(() => rowsFor(book.people, expense, groupId ? book.groups.find((group) => group.id === groupId)?.members.map((member) => member.id) : undefined));
  const [linked, setLinked] = useState<string[]>(expense?.transactionIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      const members = groupId ? book.groups.find((group) => group.id === groupId)?.members.map((member) => member.id) : undefined;
      setDescription(expense?.description ?? "");
      setAmount(expense ? String(expense.amount) : "");
      setDate(expense?.date || today);
      setPaidById(expense?.paidById ?? book.self.id);
      setChosenGroup(expense?.groupId ?? groupId ?? "none");
      setMode(expense?.splitMode ?? "equal");
      setNote(expense?.note ?? "");
      setRows(rowsFor(book.people, expense, members));
      setLinked(expense?.transactionIds ?? []);
      setError(null);
      setPending(false);
    }
  }

  const included = rows.filter((row) => row.included);
  let preview: { personId: string; amount: number }[] = [];
  let previewError: string | null = null;
  try {
    preview = buildSplits({
      mode,
      total: Number(amount),
      paidById,
      participants: included.map((row) => ({
        personId: row.personId,
        amount: row.amount === "" ? undefined : Number(row.amount),
        weight: row.weight === "" ? undefined : Number(row.weight),
      })),
    });
  } catch (caught) {
    previewError = amount.trim() && caught instanceof ShareInputError ? caught.message : null;
  }

  function applyGroup(next: string) {
    setChosenGroup(next);
    if (next === "none") return;
    const members = new Set(book.groups.find((group) => group.id === next)?.members.map((member) => member.id) ?? []);
    setRows((current) => current.map((row) => ({ ...row, included: members.has(row.personId) })));
    if (!members.has(paidById)) {
      const self = book.groups.find((group) => group.id === next)?.members.find((member) => member.isSelf);
      if (self) setPaidById(self.id);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSave(
        {
          description,
          date,
          amount: Number(amount),
          paidById,
          groupId: chosenGroup === "none" ? null : chosenGroup,
          splitMode: mode,
          note,
          participants: included.map((row) => ({
            personId: row.personId,
            amount: row.amount === "" ? undefined : Number(row.amount),
            weight: row.weight === "" ? undefined : Number(row.weight),
          })),
          transactionIds: linked,
        },
        expense?.id,
      );
      toast.success(expense ? "Shared expense updated" : "Shared expense added");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that expense.");
    } finally {
      setPending(false);
    }
  }

  const bankLines = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const peopleItems = Object.fromEntries(book.people.map((person) => [person.id, person.name]));
  const groupItems = { none: "No group", ...Object.fromEntries(book.groups.map((group) => [group.id, group.name])) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit shared expense" : "Shared expense"}</DialogTitle>
          <DialogDescription>The bank ledger stays separate. Linking a line only marks that it paid this split.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="share-desc">Description</FieldLabel>
              <Input id="share-desc" required value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="share-amount">Amount</FieldLabel>
                <Input id="share-amount" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
              </Field>
              <Field>
                <FieldLabel htmlFor="share-date">Date</FieldLabel>
                <Input id="share-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="share-payer">Paid by</FieldLabel>
                <Select items={peopleItems} value={paidById} onValueChange={(value) => value && setPaidById(value)}>
                  <SelectTrigger id="share-payer" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {book.people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="share-group">Group</FieldLabel>
                <Select items={groupItems} value={chosenGroup} onValueChange={(value) => value && applyGroup(value)}>
                  <SelectTrigger id="share-group" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No group</SelectItem>
                    {book.groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel>Split</FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={[mode]}
                onValueChange={(value) => {
                  const next = value.find((item) => item !== mode);
                  if (next === "equal" || next === "exact" || next === "shares" || next === "percent") setMode(next);
                }}
              >
                {modes.map((item) => (
                  <ToggleGroupItem key={item.id} value={item.id}>
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>People</FieldLabel>
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {rows.map((row) => {
                  const person = book.people.find((item) => item.id === row.personId);
                  return (
                    <label key={row.personId} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={row.included}
                        onChange={(event) => setRows((current) => current.map((item) => (item.personId === row.personId ? { ...item, included: event.target.checked } : item)))}
                      />
                      <span className="min-w-0 flex-1 truncate">{person?.name}</span>
                      {row.included && mode === "exact" ? (
                        <Input
                          aria-label={`${person?.name} amount`}
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(event) => setRows((current) => current.map((item) => (item.personId === row.personId ? { ...item, amount: event.target.value } : item)))}
                          className="h-8 w-24"
                        />
                      ) : null}
                      {row.included && (mode === "shares" || mode === "percent") ? (
                        <Input
                          aria-label={`${person?.name} ${mode}`}
                          inputMode="decimal"
                          value={row.weight}
                          onChange={(event) => setRows((current) => current.map((item) => (item.personId === row.personId ? { ...item, weight: event.target.value } : item)))}
                          className="h-8 w-20"
                        />
                      ) : null}
                    </label>
                  );
                })}
              </div>
              {previewError ? <FieldError>{previewError}</FieldError> : null}
              {preview.length ? (
                <FieldDescription>
                  {preview.map((split) => `${book.people.find((person) => person.id === split.personId)?.name} ${formatNpr(split.amount)}`).join(" · ")}
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="share-note">Note</FieldLabel>
              <Textarea id="share-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
            </Field>
            {bankLines.length ? (
              <Field>
                <FieldLabel>Bank lines</FieldLabel>
                <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                  {bankLines.map((transaction) => (
                    <label key={transaction.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={linked.includes(transaction.id)}
                        onChange={(event) =>
                          setLinked((current) => (event.target.checked ? [...current, transaction.id] : current.filter((id) => id !== transaction.id)))
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {transaction.date} · {transaction.merchant}
                      </span>
                      <span className="figure text-xs">{formatNpr(transaction.amount)}</span>
                    </label>
                  ))}
                </div>
              </Field>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter className="mt-5 sm:justify-between">
            {expense ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  void onDelete(expense.id)
                    .then(() => {
                      toast.success("Shared expense removed");
                      onOpenChange(false);
                    })
                    .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not remove that expense."));
                }}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending || preview.length === 0}>
              {pending ? "Saving" : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
