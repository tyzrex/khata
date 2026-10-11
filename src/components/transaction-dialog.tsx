"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "@/lib/status";
import { DatePicker } from "@/components/date-picker";
import { ResponsiveOverlay } from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON } from "@/components/segmented";
import { CURRENCIES, currencySymbol, type TxType } from "@/lib/constants";
import { formatNpr, formatRate } from "@/lib/format";
import { transactionDraftSchema, type TransactionDraft, type TransactionEntry } from "@/lib/schemas";
import type { AccountDto, CategoryDto, TransactionDto } from "@/lib/types";

const TYPES: { id: TxType; label: string }[] = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
];

const MERCHANT_LABEL: Record<TxType, string> = { expense: "Merchant", income: "From", transfer: "Description" };
const MERCHANT_PLACEHOLDER: Record<TxType, string> = { expense: "Lawa Chiya Ghar", income: "Employer", transfer: "Moving to savings" };

function categoryFor(type: TxType, current: string) {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfer";
  if (current === "Income" || current === "Transfer") return "Food";
  return current || "Food";
}

/** The amount box holds what was typed, so a dollar entry opens as its dollars, not as its NPR value. */
function fromTransaction(transaction: TransactionDto): TransactionDraft {
  return {
    date: transaction.date,
    type: transaction.type,
    currency: transaction.currency,
    amount: String(transaction.foreignAmount ?? transaction.amount),
    fxRate: transaction.fxRate == null ? "" : String(transaction.fxRate),
    category: transaction.category,
    merchant: transaction.merchant,
    account: transaction.account,
    note: transaction.note,
  };
}

function blank(today: string, account: string): TransactionDraft {
  return {
    date: today,
    type: "expense",
    currency: "NPR",
    amount: "",
    fxRate: "",
    category: "Food",
    merchant: "",
    account,
    note: "",
  };
}

const CURRENCY_OPTIONS: Record<string, string> = Object.fromEntries(CURRENCIES.map((currency) => [currency.code, `${currency.code} — ${currency.name}`]));

export function TransactionDialog({
  open,
  today,
  accounts,
  categories,
  transaction,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  today: string;
  accounts: AccountDto[];
  categories: CategoryDto[];
  transaction?: TransactionDto;
  onOpenChange: (open: boolean) => void;
  onSave: (input: unknown, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const sessionKey = `${open ? "open" : "closed"}:${transaction?.id ?? "new"}:${today}`;
  const [session, setSession] = useState(sessionKey);
  // A brand-new book has no accounts until the snapshot seeds them, so fall back to a
  // placeholder the schema accepts rather than hardcoding a bank that may not exist.
  const firstAccount = accounts[0]?.name ?? "";
  const [defaults, setDefaults] = useState<TransactionDraft>(() => (transaction ? fromTransaction(transaction) : blank(today, firstAccount)));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults(transaction ? fromTransaction(transaction) : blank(today, firstAccount));
      setError(null);
      setConfirmingDelete(false);
    }
  }

  const form = useForm<TransactionDraft, unknown, TransactionEntry>({
    resolver: zodResolver(transactionDraftSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaults);
  }, [open, defaults, form]);

  const type = useWatch({ control: form.control, name: "type" });
  const category = useWatch({ control: form.control, name: "category" });
  const accountValue = useWatch({ control: form.control, name: "account" });
  const currency = useWatch({ control: form.control, name: "currency" });
  const amountText = useWatch({ control: form.control, name: "amount" });
  const rateText = useWatch({ control: form.control, name: "fxRate" });

  const foreign = currency.trim().toUpperCase() !== "NPR";
  const rate = Number(rateText);
  // Shown live so the converted figure is never a surprise on save.
  const preview = foreign && Number(amountText) > 0 && rate > 0 ? Math.round(Number(amountText) * rate * 100) / 100 : null;

  async function submit(values: TransactionEntry) {
    setPending(true);
    setError(null);
    try {
      await onSave(values, transaction?.id);
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

  const names = categories.some((item) => item.name === category)
    ? categories
    : [...categories, { id: "draft", name: category, kind: "any" as const, color: "#7c828a", sortOrder: 999 }];

  // An entry can name an account that was deleted or predates the table, so keep its
  // value in the list rather than opening on an empty select.
  const accountNames = accounts.some((account) => account.name === accountValue) ? accounts.map((account) => account.name) : [...accounts.map((account) => account.name), accountValue].filter(Boolean);

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-md"
      title={<span className="text-lg">{transaction ? "Edit entry" : "New entry"}</span>}
      description={
        <>
          {foreign ? `Saved as NPR, kept as ${currency.trim().toUpperCase()}.` : "Amounts are in Nepalese rupees."}
          <span className="max-sm:hidden"> Press Ctrl or ⌘ + Enter to save.</span>
        </>
      }
      footer={
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
          <Button type="submit" form="tx-entry-form" disabled={pending} className="max-sm:w-full">
            {pending ? "Saving" : transaction ? "Save changes" : "Add entry"}
          </Button>
        </DialogFooter>
      }
    >
      <Form {...form}>
          <form
            id="tx-entry-form"
            className="grid gap-3.5"
            noValidate
            onSubmit={form.handleSubmit(submit)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }
            }}
          >
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <div className={SEGMENT} role="radiogroup" aria-label="Type">
                  {TYPES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={field.value === item.id}
                      className={field.value === item.id ? SEGMENT_ON : SEGMENT_OFF}
                      onClick={() => {
                        field.onChange(item.id);
                        form.setValue("category", categoryFor(item.id, form.getValues("category")));
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-baseline gap-2 rounded-xl border border-input bg-card px-4 py-3 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {type === "income" ? "+" : "−"}
                      {foreign ? currencySymbol(currency) : "NPR"}
                    </span>
                    <span className="sr-only">Amount</span>
                    <FormControl>
                      <input
                        {...field}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        autoFocus={!transaction}
                        onChange={(event) => field.onChange(event.target.value.replace(/[^\d.,]/g, "").replace(/,/g, ""))}
                        className={`figure w-full min-w-0 bg-transparent text-3xl outline-none placeholder:text-disabled ${type === "income" ? "text-credit" : "text-display"}`}
                      />
                    </FormControl>
                  </label>
                  {preview === null ? null : <p className="mt-1.5 text-xs leading-5 text-muted-foreground">= {formatNpr(preview)} at {formatRate(rate)} per {currency.trim().toUpperCase()}</p>}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={foreign ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select
                      items={{ ...CURRENCY_OPTIONS, ...(CURRENCY_OPTIONS[field.value] ? {} : { [field.value]: field.value }) }}
                      value={field.value}
                      onValueChange={(value) => value && field.onChange(value)}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {[...CURRENCIES.map((item) => item.code), ...(CURRENCY_OPTIONS[field.value] ? [] : [field.value])].map((code) => (
                          <SelectItem key={code} value={code}>
                            {CURRENCY_OPTIONS[code] ?? code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {foreign ? (
                <FormField
                  control={form.control}
                  name="fxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate to NPR</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="134.25"
                          onChange={(event) => field.onChange(event.target.value.replace(/[^\d.]/g, ""))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>

            <FormField
              control={form.control}
              name="merchant"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{MERCHANT_LABEL[type]}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" placeholder={MERCHANT_PLACEHOLDER[type]} {...field} />
                  </FormControl>
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
                    <DatePicker value={field.value} onChange={field.onChange} className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="account"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account</FormLabel>
                    <Select items={Object.fromEntries(accountNames.map((account) => [account, account]))} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accountNames.map((account) => (
                          <SelectItem key={account} value={account}>
                            {account}
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
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select items={Object.fromEntries(names.map((item) => [item.name, item.name]))} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: names.find((item) => item.name === field.value)?.color ?? "#7c828a" }} aria-hidden />
                            <SelectValue />
                          </span>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {names.map((item) => (
                          <SelectItem key={item.id} value={item.name}>
                            {item.name}
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
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Note <span className="font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
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
          </form>
        </Form>
    </ResponsiveOverlay>
  );
}