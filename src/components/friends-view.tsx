"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { ChevronRight, Plus, Send, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { InviteDialog, type InviteActions } from "@/components/invite-dialog";
import { PageHeader } from "@/components/page-header";
import { FriendDetail } from "@/components/splits/friend-detail";
import { accountNote, friendBalanceTotals, friendEntries, friendHasOpenBalance, type FriendEntry } from "@/components/splits/friend-entries";
import { DirectoryControls, DirectoryEmpty, type DirectoryFilter, type DirectorySort } from "@/components/splits/directory-controls";
import { SETTLED, type Settlement } from "@/components/splits/ledger-math";
import { BalanceStrip, NetStack, PersonAvatar, SplitCard, SplitCardHead } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BalanceScope, ShareBook } from "@/db/shares";
import { toast } from "@/lib/status";

type Person = ShareBook["people"][number];
type Debt = BalanceScope["youOwe"][number];
type Expense = ShareBook["expenses"][number];

const friendFormSchema = z.object({
  name: z.string().trim().min(1, "Give them a name").max(80, "Name is limited to 80 characters"),
  email: z.union([z.literal(""), z.email("Enter a valid email address")]),
});

type FriendFormValues = z.infer<typeof friendFormSchema>;

function friendDefaults(target: Person | "new"): FriendFormValues {
  return { name: target === "new" ? "" : target.name, email: "" };
}

/** "from 3 friends", or "Nobody" when the count is zero. */
function plural(count: number, preposition: string, noun: string) {
  return count === 0 ? "Nobody" : `${preposition} ${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function FriendsView({
  book,
  onSettle,
  onAddExpense,
  onEditExpense,
  onEditSettlement,
  onGroups,
  addFriend,
  onRenamePerson,
  onDeletePerson,
  inviteActions,
  selectedId,
  onSelect,
}: {
  book: ShareBook;
  /** The friend in the URL (`/friends/:id`): a person id, or the id of a direct book someone else owns. Null on the list. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSettle: (debt: Debt, groupId?: string) => void;
  onAddExpense: (groupId: string | null) => void;
  onEditExpense: (expense: Expense) => void;
  onEditSettlement: (settlement: Settlement) => void;
  onGroups: () => void;
  addFriend: (name: string) => Promise<string | null>;
  onRenamePerson: (id: string, name: string) => Promise<void>;
  onDeletePerson: (id: string) => Promise<void>;
  inviteActions: InviteActions;
}) {
  const entries = friendEntries(book);
  /** Phones show one pane at a time: the list, or the friend picked from it. */
  const showDetail = selectedId != null;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [sort, setSort] = useState<DirectorySort>("balance");
  const [startingExpense, setStartingExpense] = useState(false);

  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<{ person: Person; email: string } | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);

  // The dialog is keyed on who is being edited, so reopening it for someone else
  // (or for a new friend) starts from their values instead of the last one's.
  const editingKey = editing === null ? "closed" : editing === "new" ? "open:new" : `open:${editing.id}`;
  const [session, setSession] = useState(editingKey);
  const [defaults, setDefaults] = useState<FriendFormValues>(() => friendDefaults("new"));

  if (session !== editingKey) {
    setSession(editingKey);
    if (editing !== null) {
      setDefaults(friendDefaults(editing));
      setError(null);
    }
  }

  const form = useForm<FriendFormValues>({
    resolver: zodResolver(friendFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (editing === null) return;
    form.reset(defaults);
  }, [editing, defaults, form]);

  const email = useWatch({ control: form.control, name: "email" });

  const owedTotal = entries.reduce((total, entry) => total + friendBalanceTotals(entry).owed, 0);
  const oweTotal = entries.reduce((total, entry) => total + friendBalanceTotals(entry).owe, 0);
  const toSettle = entries.filter(friendHasOpenBalance).length;
  const needle = query.trim().toLowerCase();
  const latest = (entry: FriendEntry) => [...entry.expenses, ...entry.settlements].reduce((date, item) => item.date > date ? item.date : date, "");
  const balanceSize = (entry: FriendEntry) => Math.max(friendBalanceTotals(entry).owed, friendBalanceTotals(entry).owe);
  const visible = entries.filter((entry) => (!needle || entry.friend.name.toLowerCase().includes(needle)) && (filter === "all" || (filter === "open" ? friendHasOpenBalance(entry) : !friendHasOpenBalance(entry)))).sort((a, b) => sort === "name" ? a.friend.name.localeCompare(b.friend.name) : sort === "recent" ? latest(b).localeCompare(latest(a)) || a.friend.name.localeCompare(b.friend.name) : balanceSize(b) - balanceSize(a) || a.friend.name.localeCompare(b.friend.name));
  const selected = selectedId ? entries.find((entry) => entry.id === selectedId) : visible[0];
  function resetDirectory() { setQuery(""); setFilter("all"); }

  function startEdit(target: Person | "new") {
    setEditing(target);
    setError(null);
  }

  async function submit(values: FriendFormValues) {
    if (!editing) return;
    setPending(true);
    setError(null);
    try {
      if (editing === "new") {
        const id = await addFriend(values.name);
        toast.success("Friend added");
        setEditing(null);
        if (id) {
          onSelect(id);
          if (values.email) setInvite({ person: { id, name: values.name, isSelf: false, linkedUserId: null }, email: values.email });
        }
      } else {
        await onRenamePerson(editing.id, values.name);
        toast.success("Name updated");
        setEditing(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that.");
    } finally {
      setPending(false);
    }
  }

  async function expenseWith(entry: FriendEntry) {
    if (startingExpense) return;
    setStartingExpense(true);
    try {
      const id = entry.directId ?? (await inviteActions.ensureDirect(entry.friend.id));
      onAddExpense(id);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not start an expense with that friend.");
    } finally {
      setStartingExpense(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setPending(true);
    try {
      await onDeletePerson(removing.id);
      toast.success(`${removing.name} removed`);
      onSelect(null);
      setRemoving(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove that friend.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={null}
        title="Friends"
        className={showDetail ? "hidden lg:flex" : undefined}
        description="Every shared expense. Every friend. See where you stand and settle up."
        actions={
          <>
            <Button type="button" variant="outline" className="bg-card shadow-card" onClick={onGroups}>
              <UsersRound />
              Groups
            </Button>
            <Button type="button" onClick={() => startEdit("new")}>
              <Plus />
              Add friend
            </Button>
          </>
        }
      />

      {entries.length === 0 ? (
        <FirstSteps onAdd={() => startEdit("new")} />
      ) : (
        <div className="flex flex-col gap-3 2xl:gap-4">
          <div className={showDetail ? "hidden lg:block" : undefined}>
            <BalanceStrip
              owed={owedTotal}
              owe={oweTotal}
              owedHint={plural(entries.filter((entry) => friendBalanceTotals(entry).owed >= SETTLED).length, "from", "friend")}
              oweHint={plural(entries.filter((entry) => friendBalanceTotals(entry).owe >= SETTLED).length, "to", "friend")}
              third={{
                label: "To settle",
                value: toSettle,
                hint: toSettle === 0 ? "Everyone is square" : "with an open balance",
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)] lg:items-start">
            <SplitCard className={cn("lg:sticky lg:top-6", showDetail && "hidden lg:block")}>
              <SplitCardHead title="Your friends" hint={`${entries.length} ${entries.length === 1 ? "friend" : "friends"}`}>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Add friend" onClick={() => startEdit("new")}><UserPlus /></Button>
              </SplitCardHead>
              <DirectoryControls noun="friends" query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} counts={{ all: entries.length, open: toSettle, settled: entries.length - toSettle }} />
              <ul aria-label="Friends" className="-mx-2 mt-2 flex flex-col lg:max-h-[60vh] lg:overflow-y-auto">
                {visible.map((entry) => (
                  <FriendRow key={`${entry.own ? "own" : "joined"}:${entry.id}`} entry={entry} active={entry.id === selected?.id} />
                ))}
              </ul>
              {visible.length === 0 ? <DirectoryEmpty noun="friends" onReset={resetDirectory} /> : null}
            </SplitCard>

            {selected ? (
              <div className={showDetail ? "min-w-0" : "hidden min-w-0 lg:block"}>
                <FriendDetail
                  key={`${selected.own ? "own" : "joined"}:${selected.id}`}
                  entry={selected}
                  onSettle={onSettle}
                  onAddExpense={() => void expenseWith(selected)}
                  addingExpense={startingExpense}
                  onEditExpense={onEditExpense}
                  onEditSettlement={onEditSettlement}
                  onRename={() => startEdit(selected.friend)}
                  onInvite={() => setInvite({ person: selected.friend, email: "" })}
                  onRemove={() => setRemoving(selected.friend)}
                />
              </div>
            ) : selectedId ? <SplitCard><h2 className="text-lg font-semibold">Friend unavailable</h2><p className="mt-2 text-sm text-muted-foreground">This friend is no longer in your book.</p><Button variant="outline" className="mt-4" onClick={() => onSelect(null)}>All friends</Button></SplitCard> : <SplitCard className="hidden lg:block"><p className="py-12 text-center text-sm text-muted-foreground">Choose a friend to see your shared expenses.</p></SplitCard>}
          </div>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(next) => !pending && !next && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add friend" : "Rename"}</DialogTitle>
            {editing === "new" ? <DialogDescription>A name is enough to start splitting. Add an email to invite them to Khata.</DialogDescription> : null}
          </DialogHeader>
          <Form {...form}>
            <form noValidate onSubmit={form.handleSubmit(submit)}>
              <FieldGroup>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input autoFocus autoComplete="name" placeholder="Your friend’s name" disabled={pending} maxLength={80} required {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {editing === "new" ? (
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (optional)</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="email" placeholder="friend@example.com" disabled={pending} {...field} />
                        </FormControl>
                        <FormDescription>With an email, the next step creates and emails their invite.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                {error ? <FieldError>{error}</FieldError> : null}
              </FieldGroup>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" disabled={pending} onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : editing === "new" ? email.trim() ? "Add and invite" : "Add friend" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(next) => !pending && !next && setRemoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>They leave your friends list. If they are part of shared expenses, Khata keeps those and tells you why it cannot remove them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setRemoving(null)}>
              Keep
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => void confirmRemove()}>
              {pending ? "Removing" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {invite ? (
        <InviteDialog book={book} open onOpenChange={(next) => !next && setInvite(null)} person={invite.person} initialEmail={invite.email} actions={inviteActions} />
      ) : null}
    </div>
  );
}

function FirstSteps({ onAdd }: { onAdd: () => void }) {
  const steps = [
    { icon: UserPlus, title: "Add a friend", body: "Just a name is enough. Add an email to invite them straight away." },
    { icon: Send, title: "Invite them", body: "Send a link by WhatsApp or email. They join with their own account, no group needed." },
    { icon: UsersRound, title: "Split and settle", body: "Split equally, by exact amounts, shares or percent, then settle up when you pay." },
  ];
  return (
    <SplitCard className="flex flex-col gap-6 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-display">Split with the people you spend with</h2>
        <p className="mt-1 text-sm text-muted-foreground">Three steps, and both of you see the same balance.</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-2xl bg-secondary p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-accent-foreground shadow-card" aria-hidden>
              <step.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-display">
                <span className="mr-1.5 text-muted-foreground tabular-nums">{index + 1}.</span>
                {step.title}
              </span>
              <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button type="button" className="w-fit" onClick={onAdd}>
        <Plus />
        Add your first friend
      </Button>
    </SplitCard>
  );
}

function FriendRow({ entry, active }: { entry: FriendEntry; active: boolean }) {
  const offsetting = Math.abs(entry.net) < SETTLED && friendHasOpenBalance(entry);
  return (
    <li>
      <Link
        href={`/friends/${encodeURIComponent(entry.id)}`}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-2 py-3.5 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "lg:bg-accent" : "hover:bg-secondary",
        )}
      >
        <PersonAvatar name={entry.friend.name} tone={active ? "brand" : "neutral"} linked={!entry.own || entry.friend.linkedUserId != null} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[15px] text-display", active ? "font-semibold" : "font-medium")}>{entry.friend.name}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{accountNote(entry)}</span>
        </span>
        {offsetting ? <span className="shrink-0 text-xs font-medium text-warning">To settle</span> : <NetStack value={entry.net} />}
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
      </Link>
    </li>
  );
}
