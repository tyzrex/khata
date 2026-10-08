"use client";

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/status";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ShareBook } from "@/db/shares";
import { useDateFormat } from "@/components/use-date-style";
import { formatNpr } from "@/lib/format";
import type { TransactionDto } from "@/lib/types";

export type SettleDraft = {
  fromId: string;
  toId: string;
  amount: string;
  groupId: string;
};

export function SettleDialog({
  open,
  today,
  book,
  transactions,
  draft,
  groupLocked = false,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  today: string;
  book: ShareBook;
  transactions: TransactionDto[];
  draft: SettleDraft;
  groupLocked?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: unknown) => Promise<void>;
}) {
  const sessionKey = `${open ? "open" : "closed"}:${draft.fromId}:${draft.toId}:${draft.amount}:${draft.groupId}`;
  const [session, setSession] = useState(sessionKey);
  const [fromId, setFromId] = useState(draft.fromId);
  const [toId, setToId] = useState(draft.toId);
  const [amount, setAmount] = useState(draft.amount);
  const [date, setDate] = useState(today);
  const [groupId, setGroupId] = useState(draft.groupId || "none");
  const [note, setNote] = useState("");
  const [transactionId, setTransactionId] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setFromId(draft.fromId);
      setToId(draft.toId);
      setAmount(draft.amount);
      setDate(today);
      setGroupId(draft.groupId || "none");
      setNote("");
      setTransactionId("none");
      setError(null);
      setPending(false);
    }
  }

  const dates = useDateFormat();
  const bank = transactions.find((transaction) => transaction.id === transactionId);
  const value = Number(amount);
  const gap = bank && value > 0 && bank.amount !== value;
  const scope = groupId === "none" ? book.overall : book.groups.find((group) => group.id === groupId)?.balances;
  const openDebt = scope ? [...scope.youOwe, ...scope.youAreOwed, ...scope.others].find((debt) => debt.fromId === fromId && debt.toId === toId) : undefined;
  const reverse = scope ? [...scope.youOwe, ...scope.youAreOwed, ...scope.others].find((debt) => debt.fromId === toId && debt.toId === fromId) : undefined;
  const nameOf = (id: string) => book.people.find((person) => person.id === id)?.name ?? "Someone";
  const problem = fromId === toId ? "Pick two different people." : amount.trim() && !(value > 0) ? "Enter an amount above zero." : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSave({
        fromPersonId: fromId,
        toPersonId: toId,
        amount: Number(amount),
        date,
        groupId: groupId === "none" ? null : groupId,
        note,
        transactionId: transactionId === "none" ? null : transactionId,
      });
      toast.success("Settlement recorded");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record that settlement.");
    } finally {
      setPending(false);
    }
  }

  const lines = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const peopleItems = Object.fromEntries(book.people.map((person) => [person.id, person.name]));
  const groupItems = { ...(groupLocked ? {} : { none: "Outside a group" }), ...Object.fromEntries(book.groups.map((group) => [group.id, group.kind === "direct" ? `${group.name} (direct)` : group.name])) };
  const bankItems = {
    none: "None",
    ...Object.fromEntries(lines.map((transaction) => [transaction.id, `${transaction.merchant} · ${formatNpr(transaction.amount)} · ${dates.entry(transaction.date)}`])),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settle up</DialogTitle>
          <DialogDescription>Record money that changed hands. A linked bank line stays in your personal ledger.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <Field>
                <FieldLabel>Who paid</FieldLabel>
                <Select items={peopleItems} value={fromId} onValueChange={(value) => value && setFromId(value)}>
                  <SelectTrigger className="w-full" aria-label="Who paid">
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="mb-0.5"
                aria-label="Swap who paid and who received"
                title="Swap"
                onClick={() => {
                  setFromId(toId);
                  setToId(fromId);
                }}
              >
                <ArrowLeftRight className="size-4" />
              </Button>
              <Field>
                <FieldLabel>Who received</FieldLabel>
                <Select items={peopleItems} value={toId} onValueChange={(value) => value && setToId(value)}>
                  <SelectTrigger className="w-full" aria-label="Who received">
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
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
              <Field>
                <FieldLabel htmlFor="settle-amount">Amount</FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xs font-semibold text-muted-foreground">NPR</span>
                  <Input id="settle-amount" inputMode="decimal" autoComplete="off" required className="figure pl-13 text-base" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="settle-date">Date</FieldLabel>
                <DatePicker id="settle-date" value={date} onChange={setDate} />
              </Field>
            </div>
            {openDebt || reverse ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2.5 text-xs">
                <span className="text-muted-foreground">
                  {openDebt ? (
                    <>
                      {nameOf(fromId)} owes {nameOf(toId)} <span className="figure text-display">{formatNpr(openDebt.amount)}</span>
                    </>
                  ) : (
                    <>
                      {nameOf(toId)} owes {nameOf(fromId)}, not the other way. Swap?
                    </>
                  )}
                </span>
                {openDebt ? (
                  value === openDebt.amount ? (
                    <span className="font-semibold text-credit">Settles it in full</span>
                  ) : (
                    <Button type="button" variant="secondary" size="xs" className="h-7 text-xs" onClick={() => setAmount(String(openDebt.amount))}>
                      Use full amount
                    </Button>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="h-7 text-xs"
                    onClick={() => {
                      setFromId(toId);
                      setToId(fromId);
                    }}
                  >
                    Swap
                  </Button>
                )}
              </div>
            ) : null}
            <Field>
              <FieldLabel>Group</FieldLabel>
              <Select items={groupItems} value={groupId} onValueChange={(value) => value && setGroupId(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupLocked ? null : <SelectItem value="none">Outside a group</SelectItem>}
                  {book.groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.kind === "direct" ? `${group.name} (direct)` : group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Inside a group, this changes that group. Outside, only the overall book.</FieldDescription>
            </Field>
            {groupLocked ? null : (
              <Field>
                <FieldLabel>Bank line</FieldLabel>
                <Select items={bankItems} value={transactionId} onValueChange={(value) => value && setTransactionId(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {lines.map((transaction) => (
                      <SelectItem key={transaction.id} value={transaction.id}>
                        <span className="flex w-full min-w-0 items-center justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {transaction.merchant} <span className="deva text-xs text-muted-foreground">· {dates.entry(transaction.date)}</span>
                          </span>
                          <span className="figure shrink-0 text-xs">{formatNpr(transaction.amount)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {gap && bank ? (
                  <FieldDescription>
                    The bank line is {formatNpr(bank.amount)}. This settlement is {formatNpr(Number(amount))}. The difference stays on the bank line.
                  </FieldDescription>
                ) : null}
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="settle-note">Note</FieldLabel>
              <Textarea id="settle-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Optional" />
            </Field>
            {problem ? <FieldError>{problem}</FieldError> : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || problem != null || !(value > 0)}>
              {pending ? "Saving" : value > 0 ? `Record ${formatNpr(value)}` : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
