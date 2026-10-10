"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "@/lib/status";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveOverlay } from "@/components/responsive-overlay";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShareBook } from "@/db/shares";
import { PersonMark } from "@/components/balances-card";
import { useDateFormat } from "@/components/use-date-style";
import { formatNpr } from "@/lib/format";
import { shareExpenseSchema, splitParticipantSchema, type ShareExpenseValues } from "@/lib/schemas";
import { buildSplits, ShareInputError, type SplitMode } from "@/lib/split";
import type { TransactionDto } from "@/lib/types";

type Expense = ShareBook["expenses"][number];

type Row = { personId: string; included: boolean; amount: string; weight: string };

type ShareExpenseDraft = Omit<z.input<typeof shareExpenseSchema>, "participants"> & { participants: Row[] };

const rowSchema = z.object({ personId: z.string().min(1), included: z.boolean(), amount: z.string(), weight: z.string() });

const participantsField = z
  .array(rowSchema)
  .transform((rows) =>
    rows
      .filter((row) => row.included)
      .map((row): z.input<typeof splitParticipantSchema> => ({
        personId: row.personId,
        amount: row.amount === "" ? undefined : Number(row.amount),
        weight: row.weight === "" ? undefined : Number(row.weight),
      })),
  )
  .pipe(z.array(splitParticipantSchema).min(1, "Pick at least one person"));

const shareExpenseDraftSchema = shareExpenseSchema.extend({ participants: participantsField });

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

function draftFor(book: ShareBook, today: string, expense?: Expense, groupId?: string | null): ShareExpenseDraft {
  const members = groupId ? book.groups.find((group) => group.id === groupId)?.members.map((member) => member.id) : undefined;
  return {
    description: expense?.description ?? "",
    amount: expense ? String(expense.amount) : "",
    date: expense?.date || today,
    paidById: expense?.paidById ?? book.self.id,
    groupId: expense?.groupId ?? groupId ?? "none",
    splitMode: expense?.splitMode ?? "equal",
    note: expense?.note ?? "",
    participants: rowsFor(book.people, expense, members),
    transactionIds: expense?.transactionIds ?? [],
  };
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
  const [defaults, setDefaults] = useState<ShareExpenseDraft>(() => draftFor(book, today, expense, groupId));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults(draftFor(book, today, expense, groupId));
      setError(null);
      setPending(false);
    }
  }

  const form = useForm<ShareExpenseDraft, unknown, ShareExpenseValues>({
    resolver: zodResolver(shareExpenseDraftSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaults);
  }, [open, defaults, form]);

  const description = useWatch({ control: form.control, name: "description" });
  const amount = useWatch({ control: form.control, name: "amount" });
  const paidById = useWatch({ control: form.control, name: "paidById" });
  const mode = useWatch({ control: form.control, name: "splitMode" });
  const rows = useWatch({ control: form.control, name: "participants" });
  const linked = useWatch({ control: form.control, name: "transactionIds" });

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

  function setParticipants(next: Row[]) {
    form.setValue("participants", next, { shouldValidate: true });
  }

  function applyGroup(next: string) {
    form.setValue("groupId", next);
    if (next === "none") return;
    const group = book.groups.find((item) => item.id === next);
    const members = new Set(group?.members.map((member) => member.id) ?? []);
    setParticipants(rows.map((row) => ({ ...row, included: members.has(row.personId) })));
    if (!members.has(paidById)) {
      const self = group?.members.find((member) => member.isSelf);
      if (self) form.setValue("paidById", self.id);
    }
  }

  async function submit(values: ShareExpenseValues) {
    setPending(true);
    setError(null);
    try {
      await onSave(
        {
          description: values.description,
          date: values.date,
          amount: values.amount,
          paidById: values.paidById,
          groupId: values.groupId === "none" ? null : values.groupId,
          splitMode: values.splitMode,
          note: values.note,
          participants: values.participants,
          transactionIds: values.transactionIds,
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
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      className="max-h-[88dvh] overflow-y-auto sm:max-w-lg"
      title={expense ? "Edit shared expense" : "Shared expense"}
      description={groupLocked ? "Everyone in the group sees this expense and the updated balances." : "The bank ledger stays separate. Linking a line only marks that it paid this split."}
      footer={
        <DialogFooter className="mt-3 gap-2 max-sm:flex-col-reverse sm:justify-between">
          {expense ? (
            <Button
              type="button"
              variant="destructive"
              className="max-sm:w-full"
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
            <span className="max-sm:hidden" />
          )}
          <Button type="submit" form="share-expense-form" disabled={pending || preview.length === 0 || !description.trim()} className="max-sm:w-full">
            {pending ? "Saving" : total > 0 ? `Save ${formatNpr(total)}` : "Save expense"}
          </Button>
        </DialogFooter>
      }
    >
      <Form {...form}>
          <form id="share-expense-form" noValidate onSubmit={form.handleSubmit(submit)}>
            <FieldGroup>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input required autoComplete="off" placeholder="Dinner, rent, petrol…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                          <Input inputMode="decimal" autoComplete="off" required className="figure pl-13 text-base" placeholder="0" {...field} />
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
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="paidById"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paid by</FormLabel>
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
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group</FormLabel>
                      <Select items={groupItems} value={field.value} onValueChange={(value) => value && applyGroup(value)}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {groupLocked ? null : <SelectItem value="none">No group</SelectItem>}
                          {book.groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.kind === "direct" ? `${group.name} (direct)` : group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="splitMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Split</FormLabel>
                    <FormControl>
                      <ToggleGroup
                        variant="default"
                        spacing={1}
                        className="grid w-full grid-cols-4 rounded-xl bg-secondary p-1"
                        value={[field.value]}
                        onValueChange={(value) => {
                          const next = value.find((item) => item !== field.value);
                          if (next === "equal" || next === "exact" || next === "shares" || next === "percent") field.onChange(next);
                        }}
                      >
                        {modes.map((item) => (
                          <ToggleGroupItem key={item.id} value={item.id} className="h-8 w-full rounded-md px-2">
                            {item.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="participants"
                render={({ field }) => {
                  const setAll = (on: boolean) => setParticipants(rows.map((row) => ({ ...row, included: on || row.personId === paidById })));
                  return (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2">
                        <FormLabel>
                          Split between <span className="font-normal text-muted-foreground">· {included.length} of {rows.length}</span>
                        </FormLabel>
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
                                  onChange={(event) => field.onChange(rows.map((item) => (item.personId === row.personId ? { ...item, included: event.target.checked } : item)))}
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
                                  onChange={(event) => field.onChange(rows.map((item) => (item.personId === row.personId ? { ...item, amount: event.target.value } : item)))}
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
                                    onChange={(event) => field.onChange(rows.map((item) => (item.personId === row.personId ? { ...item, weight: event.target.value } : item)))}
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
                      <FormMessage />
                    </FormItem>
                    );
                }}
              />
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
              {bankLines.length ? (
                <FormField
                  control={form.control}
                  name="transactionIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Paid from your bank <span className="font-normal text-muted-foreground">· optional</span>
                      </FormLabel>
                      <div className="flex max-h-40 flex-col divide-y divide-border overflow-y-auto rounded-xl bg-secondary/70">
                        {bankLines.map((transaction) => (
                          <label key={transaction.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={linked.includes(transaction.id)}
                              onChange={(event) =>
                                field.onChange(event.target.checked ? [...linked, transaction.id] : linked.filter((id) => id !== transaction.id))
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="text-display">{transaction.merchant}</span> <span className="deva text-xs text-muted-foreground">· {dates.entry(transaction.date)}</span>
                            </span>
                            <span className="figure text-xs">{formatNpr(transaction.amount)}</span>
                          </label>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </form>
      </Form>
    </ResponsiveOverlay>
  );
}
