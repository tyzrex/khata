"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { Plus, Search, Send, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { InviteDialog, type InviteActions } from "@/components/invite-dialog";
import { PageHeader } from "@/components/page-header";
import { FriendDetail } from "@/components/splits/friend-detail";
import { accountNote, friendEntries, friendPosition, type FriendEntry } from "@/components/splits/friend-entries";
import { SETTLED, type Settlement } from "@/components/splits/ledger-math";
import { BalanceStrip, EmptyNote, PersonAvatar, SplitCard, SplitCardHead } from "@/components/splits-ui";
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

/** Show a search box once the list is long enough to need one. */
const SEARCH_FROM = 7;

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
  // On a wide screen /friends still shows a friend beside the list; phones show only the list there.
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  /** Phones show one pane at a time: the list, or the friend picked from it. */
  const showDetail = selectedId != null;
  const [query, setQuery] = useState("");

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

  const owedTotal = entries.reduce((total, entry) => total + Math.max(entry.net, 0), 0);
  const oweTotal = entries.reduce((total, entry) => total + Math.max(-entry.net, 0), 0);
  // The headline third cell used to be "Friends · 3 · 0 on Khata". Whether a friend
  // has their own account is already shown next to their name in the detail pane, and
  // as a headline it was a number nobody could act on. This one answers the only
  // question this page raises: is there anything to settle?
  const toSettle = entries.filter((entry) => Math.abs(entry.net) >= SETTLED).length;
  const needle = query.trim().toLowerCase();
  const visible = needle ? entries.filter((entry) => entry.friend.name.toLowerCase().includes(needle)) : entries;

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
    try {
      const id = entry.directId ?? (await inviteActions.ensureDirect(entry.friend.id));
      onAddExpense(id);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not start an expense with that friend.");
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
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Splits"
        title="Friends"
        description="Split one-to-one without making a group. Invite a friend and you both see the same expenses."
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
              owedHint={plural(entries.filter((entry) => entry.net >= SETTLED).length, "from", "friend")}
              oweHint={plural(entries.filter((entry) => entry.net <= -SETTLED).length, "to", "friend")}
              third={{
                label: "To settle",
                value: toSettle,
                hint: toSettle === 0 ? "Everyone is square" : "with an open balance",
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start 2xl:gap-4">
            <SplitCard className={cn("lg:sticky lg:top-6", showDetail && "hidden lg:block")}>
              <SplitCardHead title="Everyone" hint={`${entries.length} ${entries.length === 1 ? "friend" : "friends"} · who owes you first`} />
              {entries.length >= SEARCH_FROM ? (
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a friend" aria-label="Find a friend" className="h-10 pl-9" />
                </div>
              ) : null}
              <ul className="-mx-2 mt-2 flex flex-col">
                {visible.map((entry) => (
                  <FriendRow key={`${entry.own ? "own" : "joined"}:${entry.id}`} entry={entry} active={entry.id === selected?.id} />
                ))}
                {visible.length === 0 ? <EmptyNote>No friend matches “{query.trim()}”.</EmptyNote> : null}
              </ul>
            </SplitCard>

            {selected ? (
              <div className={showDetail ? "min-w-0" : "hidden min-w-0 lg:block"}>
                <FriendDetail
                  key={`${selected.own ? "own" : "joined"}:${selected.id}`}
                  entry={selected}
                  onSettle={onSettle}
                  onAddExpense={() => void expenseWith(selected)}
                  onEditExpense={onEditExpense}
                  onEditSettlement={onEditSettlement}
                  onRename={() => startEdit(selected.friend)}
                  onInvite={() => setInvite({ person: selected.friend, email: "" })}
                  onRemove={() => setRemoving(selected.friend)}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
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
                        <Input autoFocus maxLength={80} required {...field} />
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
                          <Input type="email" autoComplete="email" placeholder="friend@example.com" {...field} />
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
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving" : editing === "new" && email.trim() ? "Add and invite" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>They leave your friends list. If they are part of shared expenses, Khata keeps those and tells you why it cannot remove them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
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
              <span className="block text-sm font-semibold text-display">
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
  const position = friendPosition(entry.net);
  return (
    <li>
      <Link
        href={`/friends/${encodeURIComponent(entry.id)}`}
        scroll={false}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "lg:bg-accent" : "hover:bg-secondary",
        )}
      >
        <PersonAvatar name={entry.friend.name} tone={active ? "brand" : "neutral"} linked={!entry.own || entry.friend.linkedUserId != null} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm text-display", active ? "font-semibold" : "font-medium")}>{entry.friend.name}</span>
          <span className="mt-0.5 block truncate text-xs">
            <span className={cn("font-medium", position.tone)}>{position.text}</span>
            {Math.abs(entry.net) < SETTLED ? <span className="text-disabled"> · {accountNote(entry)}</span> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
