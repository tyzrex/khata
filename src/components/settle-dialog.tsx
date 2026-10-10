"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "@/lib/status";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { ShareBook } from "@/db/shares";
import { useDateFormat } from "@/components/use-date-style";
import { formatNpr } from "@/lib/format";
import { settleSchema, type SettleValues } from "@/lib/schemas";
import type { TransactionDto } from "@/lib/types";

export type SettleDraft = {
  fromId: string;
  toId: string;
  amount: string;
  groupId: string;
};

type SettleFormValues = {
  fromPersonId: string;
  toPersonId: string;
  /** Held as text so the input can filter digits; the schema parses it on the way out. */
  amount: string;
  date: string;
  groupId: string;
  note: string;
  transactionId: string;
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
  const [defaults, setDefaults] = useState<SettleFormValues>(() => ({
    fromPersonId: draft.fromId,
    toPersonId: draft.toId,
    amount: draft.amount,
    date: today,
    groupId: draft.groupId || "none",
    note: "",
    transactionId: "none",
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults({
        fromPersonId: draft.fromId,
        toPersonId: draft.toId,
        amount: draft.amount,
        date: today,
        groupId: draft.groupId || "none",
        note: "",
        transactionId: "none",
      });
      setError(null);
      setPending(false);
    }
  }

  const form = useForm<SettleFormValues, unknown, SettleValues>({
    resolver: zodResolver(settleSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaults);
  }, [open, defaults, form]);

  const dates = useDateFormat();
  const fromId = useWatch({ control: form.control, name: "fromPersonId" });
  const toId = useWatch({ control: form.control, name: "toPersonId" });
  const amount = useWatch({ control: form.control, name: "amount" });
  const transactionId = useWatch({ control: form.control, name: "transactionId" });

  const bank = transactions.find((transaction) => transaction.id === transactionId);
  const value = Number(amount);
  const gap = bank && value > 0 && bank.amount !== value;
  const groupId = useWatch({ control: form.control, name: "groupId" });
  const scope = groupId === "none" ? book.overall : book.groups.find((group) => group.id === groupId)?.balances;
  const openDebt = scope ? [...scope.youOwe, ...scope.youAreOwed, ...scope.others].find((debt) => debt.fromId === fromId && debt.toId === toId) : undefined;
  const reverse = scope ? [...scope.youOwe, ...scope.youAreOwed, ...scope.others].find((debt) => debt.fromId === toId && debt.toId === fromId) : undefined;
  const nameOf = (id: string) => book.people.find((person) => person.id === id)?.name ?? "Someone";

  function swap() {
    form.setValue("fromPersonId", toId);
    form.setValue("toPersonId", fromId);
  }

  async function submit(values: SettleValues) {
    setPending(true);
    setError(null);
    try {
      await onSave({
        fromPersonId: values.fromPersonId,
        toPersonId: values.toPersonId,
        amount: values.amount,
        date: values.date,
        groupId: values.groupId === "none" ? null : values.groupId,
        note: values.note,
        transactionId: values.transactionId === "none" ? null : values.transactionId,
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
        <Form {...form}>
          <form className="grid gap-5" noValidate onSubmit={form.handleSubmit(submit)}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <FormField
                control={form.control}
                name="fromPersonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who paid</FormLabel>
                    <Select items={peopleItems} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {book.people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <Button type="button" variant="outline" size="icon" className="mb-0.5" aria-label="Swap who paid and who received" title="Swap" onClick={swap}>
                <ArrowLeftRight className="size-4" />
              </Button>
              <FormField
                control={form.control}
                name="toPersonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who received</FormLabel>
                    <Select items={peopleItems} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {book.people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xs font-semibold text-muted-foreground">NPR</span>
                      <FormControl>
                        <Input inputMode="decimal" autoComplete="off" className="figure pl-13 text-base" {...field} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                    <Button type="button" variant="secondary" size="xs" className="h-7 text-xs" onClick={() => form.setValue("amount", String(openDebt.amount), { shouldValidate: true })}>
                      Use full amount
                    </Button>
                  )
                ) : (
                  <Button type="button" variant="secondary" size="xs" className="h-7 text-xs" onClick={swap}>
                    Swap
                  </Button>
                )}
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="groupId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group</FormLabel>
                  <Select items={groupItems} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {groupLocked ? null : <SelectItem value="none">Outside a group</SelectItem>}
                      {book.groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.kind === "direct" ? `${group.name} (direct)` : group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Inside a group, this changes that group. Outside, only the overall book.</FormDescription>
                </FormItem>
              )}
            />

            {groupLocked ? null : (
              <FormField
                control={form.control}
                name="transactionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank line</FormLabel>
                    <Select items={bankItems} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
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
                      <FormDescription>
                        The bank line is {formatNpr(bank.amount)}. This settlement is {formatNpr(value)}. The difference stays on the bank line.
                      </FormDescription>
                    ) : null}
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving" : value > 0 ? `Record ${formatNpr(value)}` : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}