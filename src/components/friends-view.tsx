"use client";

import { Pencil, Plus, Search, Send, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { InviteDialog, type InviteActions } from "@/components/invite-dialog";
import { PageHeader } from "@/components/page-header";
import {
  BackButton,
  BalanceStrip,
  EmptyNote,
  HistoryList,
  NetStack,
  PersonAvatar,
  SETTLED,
  SplitCard,
  SplitCardHead,
  historyOf,
  netWords,
} from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BalanceScope, JoinedGroup, ShareBook } from "@/db/shares";
import { formatNpr } from "@/lib/format";
import { toast } from "@/lib/status";

type Person = ShareBook["people"][number];
type Debt = BalanceScope["youOwe"][number];
type Expense = ShareBook["expenses"][number];
type Settlement = ShareBook["settlements"][number];

/** One line per shared book with this friend: a group, the direct book, or entries outside any group. */
type BookRow = { id: string | null; name: string; direct: boolean; net: number };

/**
 * A friend as seen from your side. `own` friends live in your book. Friends who
 * invited you live in their book: you reach them through the direct group they own.
 */
type Entry = {
  key: string;
  friend: Person;
  selfId: string;
  own: boolean;
  net: number;
  directId: string | null;
  rows: BookRow[];
  expenses: Expense[];
  settlements: Settlement[];
};

/** Show a search box once the list is long enough to need one. */
const SEARCH_FROM = 7;

/** Positive: they owe you. Negative: you owe them. */
function netWith(scope: BalanceScope, friendId: string) {
  const owed = scope.youAreOwed.filter((debt) => debt.fromId === friendId).reduce((total, debt) => total + debt.amount, 0);
  const owe = scope.youOwe.filter((debt) => debt.toId === friendId).reduce((total, debt) => total + debt.amount, 0);
  return owed - owe;
}

function settleDebt(entry: Entry, net: number): Debt {
  return net > 0
    ? { fromId: entry.friend.id, toId: entry.selfId, fromName: entry.friend.name, toName: "You", amount: net }
    : { fromId: entry.selfId, toId: entry.friend.id, fromName: "You", toName: entry.friend.name, amount: -net };
}

function ownEntry(book: ShareBook, friend: Person): Entry {
  const net = netWith(book.overall, friend.id);
  const rows: BookRow[] = book.groups
    .filter((group) => group.members.some((member) => member.id === friend.id))
    .map((group) => ({ id: group.id, name: group.kind === "direct" ? "Direct" : group.name, direct: group.kind === "direct", net: netWith(group.balances, friend.id) }));
  const outside = net - rows.reduce((total, row) => total + row.net, 0);
  if (Math.abs(outside) >= SETTLED) rows.push({ id: null, name: "Outside groups", direct: false, net: outside });
  return {
    key: `own:${friend.id}`,
    friend,
    selfId: book.self.id,
    own: true,
    net,
    directId: book.groups.find((group) => group.kind === "direct" && group.members.some((member) => member.id === friend.id))?.id ?? null,
    rows,
    expenses: book.expenses.filter((expense) => expense.paidById === friend.id || expense.splits.some((split) => split.personId === friend.id)),
    settlements: book.settlements.filter((settlement) => settlement.fromPersonId === friend.id || settlement.toPersonId === friend.id),
  };
}

function joinedEntry(group: JoinedGroup): Entry | null {
  const friend = group.members.find((member) => !member.isSelf);
  if (!friend) return null;
  const net = netWith(group.balances, friend.id);
  return {
    key: `joined:${group.id}`,
    friend: { ...friend, name: group.name },
    selfId: group.self.id,
    own: false,
    net,
    directId: group.id,
    rows: [{ id: group.id, name: "Direct", direct: true, net }],
    expenses: group.expenses,
    settlements: group.settlements,
  };
}

function statusOf(entry: Entry) {
  if (!entry.own) return "Invited you";
  return entry.friend.linkedUserId ? "On Khata" : "Not invited yet";
}

/** "from 3 friends", or "Nobody" when the count is zero. */
function plural(count: number, preposition: string, noun: string) {
  return count === 0 ? "Nobody" : `${preposition} ${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** Open balances first, largest first; settled friends after, by name. */
function byBalance(a: Entry, b: Entry) {
  const open = Number(Math.abs(b.net) >= SETTLED) - Number(Math.abs(a.net) >= SETTLED);
  return open || Math.abs(b.net) - Math.abs(a.net) || a.friend.name.localeCompare(b.friend.name);
}

export function FriendsView({
  book,
  onSettle,
  onAddExpense,
  onEditExpense,
  onGroups,
  addFriend,
  onRenamePerson,
  onDeletePerson,
  inviteActions,
}: {
  book: ShareBook;
  onSettle: (debt: Debt, groupId?: string) => void;
  onAddExpense: (groupId: string | null) => void;
  onEditExpense: (expense: Expense) => void;
  onGroups: () => void;
  addFriend: (name: string) => Promise<string | null>;
  onRenamePerson: (id: string, name: string) => Promise<void>;
  onDeletePerson: (id: string) => Promise<void>;
  inviteActions: InviteActions;
}) {
  const entries: Entry[] = [
    ...book.people.filter((person) => !person.isSelf).map((friend) => ownEntry(book, friend)),
    ...book.joinedGroups.filter((group) => group.kind === "direct").map(joinedEntry).filter((entry): entry is Entry => entry !== null),
  ].sort(byBalance);
  const [selectedKey, setSelectedKey] = useState(entries[0]?.key ?? "");
  const selected = entries.find((entry) => entry.key === selectedKey) ?? entries[0];
  /** Phones show one pane at a time: the list, or the friend picked from it. */
  const [showDetail, setShowDetail] = useState(false);
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<{ person: Person; email: string } | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);

  const owedTotal = entries.reduce((total, entry) => total + Math.max(entry.net, 0), 0);
  const oweTotal = entries.reduce((total, entry) => total + Math.max(-entry.net, 0), 0);
  const onKhata = entries.filter((entry) => !entry.own || entry.friend.linkedUserId).length;
  const needle = query.trim().toLowerCase();
  const visible = needle ? entries.filter((entry) => entry.friend.name.toLowerCase().includes(needle)) : entries;

  function startEdit(target: Person | "new") {
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    setEmail("");
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setPending(true);
    setError(null);
    try {
      if (editing === "new") {
        const id = await addFriend(name.trim());
        toast.success("Friend added");
        setEditing(null);
        if (id) {
          setSelectedKey(`own:${id}`);
          setShowDetail(true);
          if (email.trim()) setInvite({ person: { id, name: name.trim(), isSelf: false, linkedUserId: null }, email: email.trim() });
        }
      } else {
        await onRenamePerson(editing.id, name.trim());
        toast.success("Name updated");
        setEditing(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that.");
    } finally {
      setPending(false);
    }
  }

  async function expenseWith(entry: Entry) {
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
      setSelectedKey("");
      setShowDetail(false);
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
              third={{ label: "Friends", value: entries.length, hint: `${onKhata} on Khata` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start 2xl:gap-4">
            <SplitCard className={showDetail ? "hidden lg:block" : undefined}>
              <SplitCardHead title="Everyone" hint={`${entries.length} ${entries.length === 1 ? "friend" : "friends"} · biggest balances first`} />
              {entries.length >= SEARCH_FROM ? (
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a friend" aria-label="Find a friend" className="h-10 pl-9" />
                </div>
              ) : null}
              <ul className="-mx-2 mt-2 flex flex-col">
                {visible.map((entry) => {
                  const active = entry.key === selected?.key;
                  return (
                    <li key={entry.key}>
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => {
                          setSelectedKey(entry.key);
                          setShowDetail(true);
                        }}
                        className={
                          "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                          (active ? "lg:bg-accent" : "hover:bg-secondary")
                        }
                      >
                        <PersonAvatar name={entry.friend.name} tone={active ? "brand" : "neutral"} linked={!entry.own || entry.friend.linkedUserId != null} />
                        <span className="min-w-0 flex-1">
                          <span className={active ? "block truncate text-sm font-semibold text-display" : "block truncate text-sm font-medium text-display"}>{entry.friend.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{statusOf(entry)}</span>
                        </span>
                        <NetStack value={entry.net} />
                      </button>
                    </li>
                  );
                })}
                {visible.length === 0 ? <EmptyNote>No friend matches “{query.trim()}”.</EmptyNote> : null}
              </ul>
            </SplitCard>

            {selected ? (
              <div className={showDetail ? "min-w-0" : "hidden min-w-0 lg:block"}>
                <FriendDetail
                  key={selected.key}
                  entry={selected}
                  onBack={() => setShowDetail(false)}
                  onSettle={onSettle}
                  onAddExpense={() => void expenseWith(selected)}
                  onEditExpense={onEditExpense}
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
          <form onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="friend-name">Name</FieldLabel>
                <Input id="friend-name" required autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              {editing === "new" ? (
                <Field>
                  <FieldLabel htmlFor="friend-email">Email (optional)</FieldLabel>
                  <Input id="friend-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="friend@example.com" />
                  <FieldDescription>With an email, the next step creates and emails their invite.</FieldDescription>
                </Field>
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
            <DialogFooter className="mt-5">
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Saving" : editing === "new" && email.trim() ? "Add and invite" : "Save"}
              </Button>
            </DialogFooter>
          </form>
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

function FriendDetail({
  entry,
  onBack,
  onSettle,
  onAddExpense,
  onEditExpense,
  onRename,
  onInvite,
  onRemove,
}: {
  entry: Entry;
  onBack: () => void;
  onSettle: (debt: Debt, groupId?: string) => void;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onRename: () => void;
  onInvite: () => void;
  onRemove: () => void;
}) {
  const { friend, rows } = entry;
  const open = rows.filter((row) => Math.abs(row.net) >= SETTLED);
  const only = open.length === 1 ? open[0]! : null;
  const words = netWords(entry.net);
  const history = historyOf(entry.expenses, entry.settlements);
  const first = friend.name.split(" ")[0];

  return (
    <div className="flex min-w-0 flex-col gap-3 2xl:gap-4">
      <SplitCard>
        <BackButton label="All friends" onClick={onBack} />
        <div className="flex items-start justify-between gap-3 max-lg:mt-2">
          <div className="flex min-w-0 items-center gap-4">
            <PersonAvatar name={friend.name} size="lg" tone="accent" linked={!entry.own || friend.linkedUserId != null} />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-display">{friend.name}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{!entry.own ? "Invited you to Khata" : friend.linkedUserId ? "On Khata" : "Not on Khata yet"}</p>
            </div>
          </div>
          {entry.own ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button type="button" variant="outline" size="icon-sm" aria-label={`Rename ${friend.name}`} title="Rename" onClick={onRename}>
                <Pencil className="size-4" />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${friend.name}`} title="Remove" onClick={onRemove}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className={`text-xs font-medium ${words.tone}`}>{entry.net > SETTLED ? `${first} owes you` : entry.net < -SETTLED ? `You owe ${first}` : "All settled up"}</p>
            <p className={`figure mt-1 text-[28px] leading-none ${Math.abs(entry.net) < SETTLED ? "text-display" : words.tone}`}>{formatNpr(Math.abs(entry.net))}</p>
            {open.length > 1 ? <p className="mt-1.5 text-xs text-muted-foreground">Across {open.length} books. Settle each one below.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {only ? (
              <Button type="button" onClick={() => onSettle(settleDebt(entry, only.net), only.id ?? undefined)}>
                Settle up
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="bg-card" onClick={onAddExpense}>
              <Plus />
              Add expense
            </Button>
            {entry.own && !friend.linkedUserId ? (
              <Button type="button" variant="outline" className="bg-card" onClick={onInvite}>
                <Send />
                Invite
              </Button>
            ) : null}
          </div>
        </div>
      </SplitCard>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] 2xl:items-start 2xl:gap-4">
        <SplitCard>
          <SplitCardHead title="Where you stand" hint="Balance in each book you share" />
          {rows.length === 0 ? (
            <EmptyNote>Nothing shared yet. Add an expense, or invite {first} so they see it too.</EmptyNote>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {rows.map((row) => (
                <li key={row.id ?? "outside"} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-display">{row.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{row.direct ? "Just the two of you" : row.id ? "Group" : "Not in a group"}</span>
                  </span>
                  <NetStack value={row.net} />
                  {Math.abs(row.net) >= SETTLED ? (
                    <Button type="button" variant="outline" size="xs" onClick={() => onSettle(settleDebt(entry, row.net), row.id ?? undefined)}>
                      Settle
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SplitCard>

        <SplitCard>
          <SplitCardHead title="Activity" hint={history.length ? `${history.length} ${history.length === 1 ? "entry" : "entries"}, newest first` : "Nothing yet"} />
          {history.length === 0 ? (
            <EmptyNote>No shared expenses or payments yet.</EmptyNote>
          ) : (
            <HistoryList items={history} selfId={entry.selfId} withId={friend.id} hideGroup={friend.name} onEditExpense={onEditExpense} />
          )}
        </SplitCard>
      </div>
    </div>
  );
}
