"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/status";
import { DatePicker } from "@/components/date-picker";
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
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON } from "@/components/segmented";
import { ACCOUNTS, type TxType } from "@/lib/constants";
import type { CategoryDto, TransactionDto } from "@/lib/types";

const TYPES: { id: TxType; label: string }[] = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
];

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
    : [...categories, { id: "draft", name: draft.category, kind: "any" as const, color: "#7c828a", sortOrder: 999 }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{transaction ? "Edit entry" : "New entry"}</DialogTitle>
          <DialogDescription>
            Amounts are in Nepalese rupees.<span className="max-sm:hidden"> Press Ctrl or ⌘ + Enter to save.</span>
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3.5"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.requestSubmit();
            }
          }}
        >
          <div className={SEGMENT} role="radiogroup" aria-label="Type">
            {TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                role="radio"
                aria-checked={draft.type === type.id}
                className={draft.type === type.id ? SEGMENT_ON : SEGMENT_OFF}
                onClick={() => setDraft((current) => ({ ...current, type: type.id, category: categoryFor(type.id, current.category) }))}
              >
                {type.label}
              </button>
            ))}
          </div>

          <label htmlFor="tx-amount" className="flex items-baseline gap-2 rounded-xl bg-secondary px-4 py-3 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/30">
            <span className="text-sm font-semibold text-muted-foreground">{draft.type === "expense" ? "−NPR" : "+NPR"}</span>
            <span className="sr-only">Amount</span>
            <input
              id="tx-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              required
              autoFocus={!transaction}
              value={draft.amount}
              onChange={(event) => setDraft({ ...draft, amount: event.target.value.replace(/[^\d.,]/g, "").replace(/,/g, "") })}
              className={`figure w-full min-w-0 bg-transparent text-3xl outline-none placeholder:text-disabled ${draft.type === "expense" ? "text-display" : "text-credit"}`}
            />
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="tx-merchant">{draft.type === "income" ? "From" : draft.type === "transfer" ? "Description" : "Merchant"}</Label>
            <Input
              id="tx-merchant"
              placeholder={draft.type === "income" ? "Employer" : "Lawa Chiya Ghar"}
              required
              maxLength={120}
              value={draft.merchant}
              onChange={(event) => setDraft({ ...draft, merchant: event.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-date">Date</Label>
            <DatePicker id="tx-date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="grid gap-1.5">
              <Label htmlFor="tx-category">Category</Label>
              <Select
                items={Object.fromEntries(names.map((category) => [category.name, category.name]))}
                value={draft.category}
                onValueChange={(value) => value && setDraft({ ...draft, category: value })}
              >
                <SelectTrigger id="tx-category" className="w-full">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: names.find((category) => category.name === draft.category)?.color ?? "#7c828a" }} aria-hidden />
                    <SelectValue />
                  </span>
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
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-note">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="tx-note" maxLength={500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} rows={2} />
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="mt-1 gap-2 max-sm:flex-col-reverse sm:justify-between">
            {transaction ? (
              confirmingDelete ? (
                <span className="flex gap-2 max-sm:w-full">
                  <Button type="button" variant="outline" className="max-sm:flex-1" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                    Keep
                  </Button>
                  <Button type="button" variant="destructive" className="max-sm:flex-1" disabled={pending} onClick={() => void remove()}>
                    <Trash2 />
                    Confirm delete
                  </Button>
                </span>
              ) : (
                <Button type="button" variant="outline" className="hover:bg-destructive/10 hover:text-destructive max-sm:w-full" disabled={pending} onClick={() => setConfirmingDelete(true)}>
                  <Trash2 />
                  Delete
                </Button>
              )
            ) : (
              <span className="max-sm:hidden" />
            )}
            <Button type="submit" disabled={pending} className="max-sm:w-full">
              {pending ? "Saving" : transaction ? "Save changes" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
