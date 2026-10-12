"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "@/lib/status";
import { accountFormSchema, type AccountFormValues } from "@/lib/schemas";
import type { AccountDto } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/** What each account currently holds, so the list is a summary and not just names. */
type Usage = { count: number };

export function AccountsView({
  accounts,
  usage,
  onSave,
  onDelete,
}: {
  accounts: AccountDto[];
  /** Entry count per account name, keyed by name. */
  usage: Record<string, Usage>;
  onSave: (name: string, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sessionKey = `${open}:${editing?.id ?? "new"}`;
  const [session, setSession] = useState(sessionKey);
  const [defaults, setDefaults] = useState<AccountFormValues>({ name: "" });

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults({ name: editing?.name ?? "" });
      setError(null);
      setConfirming(null);
    }
  }

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaults);
  }, [open, defaults, form]);

  function start(account?: AccountDto) {
    setEditing(account ?? null);
    setError(null);
    setOpen(true);
  }

  async function submit(values: AccountFormValues) {
    setPending(true);
    setError(null);
    try {
      await onSave(values.name, editing?.id);
      toast.success(editing ? "Account renamed" : "Account added");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that account.");
    } finally {
      setPending(false);
    }
  }

  async function remove(account: AccountDto) {
    setConfirming(null);
    setPending(true);
    try {
      await onDelete(account.id);
      toast.success(`${account.name} removed`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove that account.");
    } finally {
      setPending(false);
    }
  }

  const max = Math.max(1, ...accounts.map((account) => usage[account.name]?.count ?? 0));
  const used = accounts.filter((account) => (usage[account.name]?.count ?? 0) > 0).length;

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Ledger names"
        title="Accounts"
        description="Where your money sits. Every entry picks one, and renaming an account updates the entries that use it."
        actions={
          <Button type="button" onClick={() => start()}>
            <Plus />
            Add account
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <Empty className="rounded-3xl bg-card shadow-card">
          <EmptyHeader>
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Wallet className="size-5" aria-hidden />
            </span>
            <EmptyTitle>No accounts yet</EmptyTitle>
            <EmptyDescription>Add a bank, a wallet or cash so every entry has somewhere to go.</EmptyDescription>
          </EmptyHeader>
          <Button type="button" className="mx-auto mt-5" onClick={() => start()}>
            <Plus />
            Add account
          </Button>
        </Empty>
      ) : (
        <section className="rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.015em] text-display">Your accounts</h2>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground tabular-nums">
              {used} of {accounts.length} in use
            </span>
          </div>

          <ul className="mt-3 divide-y divide-border">
            {accounts.map((account) => {
              const count = usage[account.name]?.count ?? 0;
              const busy = confirming === account.id;
              return (
                <li key={account.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
                    <Wallet className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-display">{account.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-brand-tint" style={{ width: `${(count / max) * 100}%` }} />
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                        {count === 0 ? "no entries" : `${count} ${count === 1 ? "entry" : "entries"}`}
                      </span>
                    </div>
                  </div>
                  {busy ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button type="button" variant="outline" size="xs" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                      <Button type="button" variant="destructive" size="xs" disabled={pending} onClick={() => void remove(account)}>
                        Delete
                      </Button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Rename ${account.name}`} title="Rename" onClick={() => start(account)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete ${account.name}`}
                        title="Delete"
                        disabled={count > 0}
                        onClick={() => setConfirming(account.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-[13px] text-muted-foreground">
            An account can only be deleted while no entries use it. Move or remove those entries first.
          </p>
        </section>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Rename account" : "New account"}</DialogTitle>
            <DialogDescription>Renaming rewrites every entry that already uses it.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input autoFocus autoComplete="off" placeholder="Nabil, Cash wallet…" {...field} />
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
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving" : editing ? "Rename" : "Add account"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}