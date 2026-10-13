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
import { SHARED_CATEGORIES } from "@/lib/constants";
import { formatNpr } from "@/lib/format";
import { shareExpenseSchema, splitParticipantSchema, type ShareExpenseValues } from "@/lib/schemas";
import { buildSplits, ShareInputError, type SplitMode } from "@/lib/split";
import { validateExpenseItems } from "@/lib/itemized-split";
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

const splitModeLabel: Record<string, string> = Object.fromEntries(modes.map((mode) => [mode.id, mode.label]));
const auditDate = new Intl.DateTimeFormat("en-NP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kathmandu",
});

function formatAuditDate(value: string) {
  return auditDate.format(new Date(value));
}

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

/**
 * `duplicate` seeds the same fields as editing but as a *new* expense: today's date,
 * no linked bank lines. Authorship, version and revision history are not copied
 * because they are never on the draft — they come from the caller.
 */
function draftFor(book: ShareBook, today: string, expense?: Expense, groupId?: string | null, duplicate = false): ShareExpenseDraft {
  const members = groupId ? book.groups.find((group) => group.id === groupId)?.members.map((member) => member.id) : undefined;
  return {
    description: expense?.description ?? "",
    amount: expense ? String(expense.amount) : "",
    date: expense?.date && !duplicate ? expense.date : today,
    paidById: expense?.paidById ?? book.self.id,
    groupId: expense?.groupId ?? groupId ?? "none",
    splitMode: expense?.splitMode ?? "equal",
    category: (expense?.category ?? "") as ShareExpenseDraft["category"],
    note: expense?.note ?? "",
    participants: rowsFor(book.people, expense, members),
    transactionIds: duplicate ? [] : (expense?.transactionIds ?? []),
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
  const [duplicate, setDuplicate] = useState(false);
  const sessionKey = `${open ? "open" : "closed"}:${expense?.id ?? "new"}:${duplicate ? ":dup" : ""}:${groupId ?? ""}:${today}`;
  const [session, setSession] = useState(sessionKey);
  const [defaults, setDefaults] = useState<ShareExpenseDraft>(() => draftFor(book, today, expense, groupId, duplicate));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults(draftFor(book, today, expense, groupId, duplicate));
      setError(null);
      setPending(false);
      setConfirmDelete(false);
      setDuplicate(false);
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
  let replacesItems = false;
  if (expense?.items?.length && !previewError) {
    try { validateExpenseItems(expense.items, total, preview); } catch { replacesItems = true; }
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
      const editing = Boolean(expense) && !duplicate;
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
          category: values.category === "" ? null : values.category,
          ...(expense?.items?.length ? { items: replacesItems ? null : expense.items } : {}),
          ...(editing ? { version: expense!.version } : {}),
        },
        editing ? expense!.id : undefined,
      );
      toast.success(editing ? "Shared expense updated" : "Shared expense added");
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
            confirmDelete ? (
              <span className="flex gap-2 max-sm:w-full">
                <Button
                  type="button"
                  variant="destructive"
                  className="max-sm:flex-1"
                  disabled={pending}
                  onClick={() => {
                    setPending(true);
                    setError(null);
                    void onDelete(expense.id)
                      .then(() => {
                        toast.success("Shared expense removed");
                        onOpenChange(false);
                      })
                      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not remove that expense."))
                      .finally(() => setPending(false));
                  }}
                >
                  {pending ? "Deleting" : "Yes, delete"}
                </Button>
                <Button type="button" variant="ghost" className="max-sm:flex-1" disabled={pending} onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <>
                <Button type="button" variant="ghost" className="max-sm:flex-1" disabled={pending} onClick={() => setConfirmDelete(true)}>
                  Delete expense
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="max-sm:w-full"
                  disabled={pending}
                  title="Start a new expense with the same people, amounts and split"
                  onClick={() => {
                    // Re-seed from the same row but as a new one: today's date, no linked
                    // bank lines, and no version so the save path creates rather than updates.
                    setDefaults(draftFor(book, today, expense, groupId, true));
                    setDuplicate(true);
                    setConfirmDelete(false);
                  }}
                >
                  Duplicate
                </Button>
              </>
            )
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
                        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[13px] font-semibold text-muted-foreground">NPR</span>
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
                        className="grid w-full grid-cols-4 rounded-xl bg-secondary p-0.5"
                        value={[field.value]}
                        onValueChange={(value) => {
                          const next = value.find((item) => item !== field.value);
                          if (next === "equal" || next === "exact" || next === "shares" || next === "percent") field.onChange(next);
                        }}
                      >
                        {modes.map((item) => (
                          <ToggleGroupItem key={item.id} value={item.id} className="h-10 w-full rounded-md px-2">
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
                          <Button type="button" variant="ghost" size="xs" className="px-3" onClick={() => setAll(true)}>
                            Everyone
                          </Button>
                          <Button type="button" variant="ghost" size="xs" className="px-3" onClick={() => setAll(false)}>
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
                                  className="size-5"
                                  checked={row.included}
                                  onChange={(event) => field.onChange(rows.map((item) => (item.personId === row.personId ? { ...item, included: event.target.checked } : item)))}
                                />
                                <PersonMark name={person?.name ?? "?"} tone={person?.isSelf ? "brand" : "neutral"} className="size-7 text-[11px]" />
                                <span className="min-w-0 truncate font-medium text-display">{name}</span>
                                {row.personId === paidById ? <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">Paid</span> : null}
                              </label>
                              {row.included && mode === "exact" ? (
                                <Input
                                  aria-label={`${name} amount`}
                                  inputMode="decimal"
                                  autoComplete="off"
                                  placeholder="0"
                                  value={row.amount}
                                  onChange={(event) => field.onChange(rows.map((item) => (item.personId === row.personId ? { ...item, amount: event.target.value } : item)))}
                                  className="figure h-10 w-24 rounded-lg bg-card text-right text-sm"
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
                                    className="figure h-10 w-20 rounded-lg bg-card pr-6 text-right text-sm"
                                  />
                                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[13px] text-muted-foreground">{mode === "percent" ? "%" : "×"}</span>
                                </span>
                              ) : null}
                              {mode !== "exact" ? <span className="figure w-20 shrink-0 text-right text-[13px] text-display">{row.included && share != null ? formatNpr(share) : "—"}</span> : null}
                            </div>
                          );
                        })}
                      </div>
                      {tally && total > 0 ? (
                        <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium ${Math.abs(tally.left) < 0.005 ? "bg-credit/10 text-credit" : "bg-warning/10 text-warning"}`} role="status">
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
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value || "none"} onValueChange={(next) => field.onChange(next === "none" ? "" : next)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {SHARED_CATEGORIES.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                              className="size-5"
                              checked={linked.includes(transaction.id)}
                              onChange={(event) =>
                                field.onChange(event.target.checked ? [...linked, transaction.id] : linked.filter((id) => id !== transaction.id))
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="text-display">{transaction.merchant}</span> <span className="deva text-[13px] text-muted-foreground">· {dates.entry(transaction.date)}</span>
                            </span>
                            <span className="figure text-[13px]">{formatNpr(transaction.amount)}</span>
                          </label>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              {expense ? (
                <>
                {expense.items?.length ? (
                  <section aria-label="Receipt item breakdown" className="rounded-xl bg-secondary/70 px-3 py-3 text-[13px]">
                    <h3 className="font-semibold text-foreground">Receipt breakdown</h3>
                    <ul className="mt-2 divide-y divide-border">{expense.items.map((item, index) => <li key={index} className="py-2">
                      <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 break-words font-medium">{item.description}</span><span className="figure shrink-0">{formatNpr(item.amount)}</span></div>
                      <p className="mt-1 leading-5 text-muted-foreground">{item.splits.filter((share) => share.amount > 0).map((share) => `${book.people.find((person) => person.id === share.personId)?.name ?? "Someone"} ${formatNpr(share.amount)}`).join(" · ")}</p>
                    </li>)}</ul>
                    {replacesItems ? <p className="mt-2 text-warning" role="status">Saving these changed shares will replace the receipt breakdown with a total-only split. To change individual items, use your AI tool.</p> : <p className="mt-2 text-muted-foreground">The item breakdown is kept when you edit the description, date or notes.</p>}
                  </section>
                ) : null}
                <section aria-labelledby="expense-audit-title" className="rounded-xl bg-secondary/70 px-3 py-2.5 text-[13px] text-muted-foreground">
                  <h3 id="expense-audit-title" className="font-semibold text-foreground">History</h3>
                  <p className="mt-1">
                    Added by {expense.createdByName ?? "Someone"} · {formatAuditDate(expense.createdAt)}
                  </p>
                  {expense.revisions.length > 0 ? (
                    <p className="mt-0.5">
                      Last edited by {expense.updatedByName ?? "Someone"} · {formatAuditDate(expense.updatedAt)}
                    </p>
                  ) : null}
                  <details className="mt-2">
                    <summary className="w-fit cursor-pointer rounded-sm font-medium text-interactive outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {expense.revisions.length} {expense.revisions.length === 1 ? "revision" : "revisions"}
                    </summary>
                    {expense.revisions.length > 0 ? (
                      <ol className="mt-2 divide-y divide-border">
                        {[...expense.revisions]
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .map((revision) => (
                            <li key={`${revision.version}-${revision.createdAt}`} className="py-2 first:pt-0 last:pb-0">
                              <p className="font-medium text-foreground">
                                {revision.actorName} {revision.action} it · {formatAuditDate(revision.createdAt)}
                              </p>
                              <p className="mt-1 leading-5">
                                Before: {revision.snapshot.description} · {formatNpr(revision.snapshot.amount)} · paid by {revision.snapshot.paidByName} · {splitModeLabel[revision.snapshot.splitMode] ?? revision.snapshot.splitMode}
                              </p>
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p className="mt-2">No earlier versions.</p>
                    )}
                  </details>
                </section>
                </>
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
          </form>
      </Form>
    </ResponsiveOverlay>
  );
}
