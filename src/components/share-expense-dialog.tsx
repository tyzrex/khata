"use client";

import { useState } from "react";
import { toast } from "@/lib/status";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShareBook } from "@/db/shares";
import { PersonMark } from "@/components/balances-card";
import { useDateFormat } from "@/components/use-date-style";
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
  groupLocked = false,
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
  groupLocked?: boolean;
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

  const dates = useDateFormat();
  const included = rows.filter((row) => row.included);
  const total = Number(amount) || 0;
  const sumOf = (pick: (row: Row) => string) => included.reduce((sum, row) => sum + (Number(pick(row)) || 0), 0);
  const tally =
    mode === "exact"
      ? { left: Math.round((total - sumOf((row) => row.amount)) * 100) / 100, unit: "npr" as const }
      : mode === "percent"
        ? { left: Math.round((100 - sumOf((row) => row.weight)) * 100) / 100, unit: "percent" as const }
        : null;
  const setAll = (on: boolean) => setRows((current) => current.map((row) => ({ ...row, included: on || row.personId === paidById })));
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
  const groupItems = { ...(groupLocked ? {} : { none: "No group" }), ...Object.fromEntries(book.groups.map((group) => [group.id, group.kind === "direct" ? `${group.name} (direct)` : group.name])) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit shared expense" : "Shared expense"}</DialogTitle>
          <DialogDescription>
            {groupLocked ? "Everyone in the group sees this expense and the updated balances." : "The bank ledger stays separate. Linking a line only marks that it paid this split."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="share-desc">Description</FieldLabel>
              <Input id="share-desc" required autoComplete="off" placeholder="Dinner, rent, petrol…" value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
              <Field>
                <FieldLabel htmlFor="share-amount">Amount</FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xs font-semibold text-muted-foreground">NPR</span>
                  <Input id="share-amount" inputMode="decimal" autoComplete="off" required className="figure pl-13 text-base" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="share-date">Date</FieldLabel>
                <DatePicker id="share-date" value={date} onChange={setDate} />
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
                    {groupLocked ? null : <SelectItem value="none">No group</SelectItem>}
                    {book.groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.kind === "direct" ? `${group.name} (direct)` : group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel>Split</FieldLabel>
              <ToggleGroup
                variant="default"
                spacing={1}
                className="grid w-full grid-cols-4 rounded-xl bg-secondary p-1"
                value={[mode]}
                onValueChange={(value) => {
                  const next = value.find((item) => item !== mode);
                  if (next === "equal" || next === "exact" || next === "shares" || next === "percent") setMode(next);
                }}
              >
                {modes.map((item) => (
                  <ToggleGroupItem key={item.id} value={item.id} className="h-8 w-full rounded-md px-2">
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>
                  Split between <span className="font-normal text-muted-foreground">· {included.length} of {rows.length}</span>
                </FieldLabel>
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" size="xs" className="min-h-0 px-2 text-xs" onClick={() => setAll(true)}>
                    Everyone
                  </Button>
                  <Button type="button" variant="ghost" size="xs" className="min-h-0 px-2 text-xs" onClick={() => setAll(false)}>
                    Only payer
                  </Button>
                </span>
              </div>
              <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl bg-secondary/70">
                {rows.map((row) => {
                  const person = book.people.find((item) => item.id === row.personId);
                  const share = preview.find((split) => split.personId === row.personId)?.amount;
                  const name = person?.isSelf ? "You" : (person?.name ?? "Someone");
                  return (
                    <div key={row.personId} className={`flex items-center gap-3 px-3 py-2 text-sm transition-opacity ${row.included ? "" : "opacity-55"}`}>
                      <label className="flex min-w-0 flex-1 items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={row.included}
                          onChange={(event) => setRows((current) => current.map((item) => (item.personId === row.personId ? { ...item, included: event.target.checked } : item)))}
                        />
                        <PersonMark name={person?.name ?? "?"} tone={person?.isSelf ? "brand" : "neutral"} className="size-7 text-[10px]" />
                        <span className="min-w-0 truncate font-medium text-display">{name}</span>
                        {row.personId === paidById ? <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">Paid</span> : null}
                      </label>
                      {row.included && mode === "exact" ? (
                        <Input
                          aria-label={`${name} amount`}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0"
                          value={row.amount}
                          onChange={(event) => setRows((current) => current.map((item) => (item.personId === row.personId ? { ...item, amount: event.target.value } : item)))}
                          className="figure h-8 w-24 rounded-lg bg-card text-right text-sm"
                        />
                      ) : null}
                      {row.included && (mode === "shares" || mode === "percent") ? (
                        <span className="relative">
                          <Input
                            aria-label={`${name} ${mode}`}
                            inputMode="decimal"
                            autoComplete="off"
                            value={row.weight}
                            onChange={(event) => setRows((current) => current.map((item) => (item.personId === row.personId ? { ...item, weight: event.target.value } : item)))}
                            className="figure h-8 w-20 rounded-lg bg-card pr-6 text-right text-sm"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">{mode === "percent" ? "%" : "×"}</span>
                        </span>
                      ) : null}
                      {mode !== "exact" ? <span className="figure w-20 shrink-0 text-right text-[13px] text-display">{row.included && share != null ? formatNpr(share) : "—"}</span> : null}
                    </div>
                  );
                })}
              </div>
              {tally && total > 0 ? (
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${Math.abs(tally.left) < 0.005 ? "bg-credit/10 text-credit" : "bg-warning/10 text-warning"}`} role="status">
                  <span>{Math.abs(tally.left) < 0.005 ? "Everything is assigned" : tally.left > 0 ? "Left to assign" : "Assigned too much"}</span>
                  <span className="figure">{Math.abs(tally.left) < 0.005 ? "✓" : tally.unit === "percent" ? `${Math.abs(tally.left)}%` : formatNpr(Math.abs(tally.left))}</span>
                </div>
              ) : null}
              {previewError && !(tally && Math.abs(tally.left) >= 0.005) ? <FieldError>{previewError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="share-note">Note</FieldLabel>
              <Textarea id="share-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Optional" />
            </Field>
            {bankLines.length ? (
              <Field>
                <FieldLabel>
                  Paid from your bank <span className="font-normal text-muted-foreground">· optional</span>
                </FieldLabel>
                <div className="flex max-h-40 flex-col divide-y divide-border overflow-y-auto rounded-xl bg-secondary/70">
                  {bankLines.map((transaction) => (
                    <label key={transaction.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={linked.includes(transaction.id)}
                        onChange={(event) =>
                          setLinked((current) => (event.target.checked ? [...current, transaction.id] : current.filter((id) => id !== transaction.id)))
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-display">{transaction.merchant}</span> <span className="deva text-xs text-muted-foreground">· {dates.entry(transaction.date)}</span>
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
                variant="destructive"
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
            <Button type="submit" disabled={pending || preview.length === 0 || !description.trim()}>
              {pending ? "Saving" : total > 0 ? `Save ${formatNpr(total)}` : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
