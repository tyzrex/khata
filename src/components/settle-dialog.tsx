"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ShareBook } from "@/db/shares";
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
  onOpenChange,
  onSave,
}: {
  open: boolean;
  today: string;
  book: ShareBook;
  transactions: TransactionDto[];
  draft: SettleDraft;
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

  const bank = transactions.find((transaction) => transaction.id === transactionId);
  const gap = bank && Number(amount) > 0 && bank.amount !== Number(amount);

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
  const groupItems = { none: "Outside a group", ...Object.fromEntries(book.groups.map((group) => [group.id, group.name])) };
  const bankItems = {
    none: "None",
    ...Object.fromEntries(lines.map((transaction) => [transaction.id, `${transaction.merchant} · ${formatNpr(transaction.amount)}`])),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle up</DialogTitle>
          <DialogDescription>Record a payment between two people. The bank line, if you link one, stays in the personal ledger.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>From</FieldLabel>
                <Select items={peopleItems} value={fromId} onValueChange={(value) => value && setFromId(value)}>
                  <SelectTrigger className="w-full">
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
                <FieldLabel>To</FieldLabel>
                <Select items={peopleItems} value={toId} onValueChange={(value) => value && setToId(value)}>
                  <SelectTrigger className="w-full">
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="settle-amount">Amount</FieldLabel>
                <Input id="settle-amount" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="settle-date">Date</FieldLabel>
                <Input id="settle-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Group</FieldLabel>
              <Select items={groupItems} value={groupId} onValueChange={(value) => value && setGroupId(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Outside a group</SelectItem>
                  {book.groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>A payment inside a group changes that group. A payment outside it only changes the overall book.</FieldDescription>
            </Field>
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
                      {transaction.merchant} · {formatNpr(transaction.amount)}
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
            <Field>
              <FieldLabel htmlFor="settle-note">Note</FieldLabel>
              <Textarea id="settle-note" value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
