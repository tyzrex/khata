"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNTS, type TxType } from "@/lib/constants";
import type { CategoryDto, TransactionDto } from "@/lib/types";

type Draft = {
  date: string;
  type: TxType;
  amount: string;
  category: string;
  merchant: string;
  account: string;
  note: string;
};

function categoryFor(type: TxType, current: string) {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfer";
  if (current === "Income" || current === "Transfer") return "Food";
  return current || "Food";
}

function fromTransaction(transaction: TransactionDto): Draft {
  return {
    date: transaction.date,
    type: transaction.type,
    amount: String(transaction.amount),
    category: transaction.category,
    merchant: transaction.merchant,
    account: transaction.account,
    note: transaction.note,
  };
}

function blank(today: string): Draft {
  return {
    date: today,
    type: "expense",
    amount: "",
    category: "Food",
    merchant: "",
    account: "Nabil",
    note: "",
  };
}

export function TransactionDialog({
  open,
  today,
  categories,
  transaction,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  today: string;
  categories: CategoryDto[];
  transaction?: TransactionDto;
  onOpenChange: (open: boolean) => void;
  onSave: (input: unknown, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const sessionKey = `${open ? "open" : "closed"}:${transaction?.id ?? "new"}:${today}`;
  const [session, setSession] = useState(sessionKey);
  const [draft, setDraft] = useState<Draft>(() => (transaction ? fromTransaction(transaction) : blank(today)));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDraft(transaction ? fromTransaction(transaction) : blank(today));
      setError(null);
      setConfirmingDelete(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!draft.merchant.trim()) {
      setError("Add a merchant or description.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave(
        {
          date: draft.date,
          type: draft.type,
          amount,
          currency: "NPR",
          category: draft.category,
          merchant: draft.merchant.trim(),
          account: draft.account,
          note: draft.note.trim(),
        },
        transaction?.id,
      );
      toast.success(transaction ? "Entry updated" : "Entry added");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that entry.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!transaction) return;
    setPending(true);
    try {
      await onDelete(transaction.id);
      toast.success("Entry removed");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove that entry.");
    } finally {
      setPending(false);
    }
  }

  const names = categories.some((category) => category.name === draft.category)
    ? categories
    : [...categories, { id: "draft", name: draft.category, kind: "any" as const, color: "#6f675e", sortOrder: 999 }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{transaction ? "Edit entry" : "New entry"}</DialogTitle>
          <DialogDescription>Amounts are in Nepalese rupees.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input id="tx-date" type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tx-type">Type</Label>
              <Select
                items={{ expense: "Expense", income: "Income", transfer: "Transfer" }}
                value={draft.type}
                onValueChange={(value) => {
                  if (value !== "expense" && value !== "income" && value !== "transfer") return;
                  setDraft((current) => ({ ...current, type: value, category: categoryFor(value, current.category) }));
                }}
              >
                <SelectTrigger id="tx-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-amount">Amount</Label>
            <Input
              id="tx-amount"
              inputMode="decimal"
              placeholder="0"
              required
              value={draft.amount}
              onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
              className="h-10"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-merchant">Merchant</Label>
            <Input
              id="tx-merchant"
              placeholder="Lawa Chiya Ghar"
              required
              value={draft.merchant}
              onChange={(event) => setDraft({ ...draft, merchant: event.target.value })}
              className="h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tx-category">Category</Label>
              <Select
                items={Object.fromEntries(names.map((category) => [category.name, category.name]))}
                value={draft.category}
                onValueChange={(value) => value && setDraft({ ...draft, category: value })}
              >
                <SelectTrigger id="tx-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {names.map((category) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tx-account">Account</Label>
              <Select items={Object.fromEntries(ACCOUNTS.map((account) => [account, account]))} value={draft.account} onValueChange={(value) => value && setDraft({ ...draft, account: value })}>
                <SelectTrigger id="tx-account" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNTS.map((account) => (
                    <SelectItem key={account} value={account}>
                      {account}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-note">Note</Label>
            <Textarea id="tx-note" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} rows={3} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="sm:justify-between">
            {transaction ? (
              confirmingDelete ? (
                <Button type="button" variant="destructive" disabled={pending} onClick={() => void remove()}>
                  Confirm delete
                </Button>
              ) : (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmingDelete(true)}>
                  Delete
                </Button>
              )
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending} className="h-10 px-4">
              {pending ? "Saving" : "Save entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
