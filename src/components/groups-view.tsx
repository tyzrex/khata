"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Panel, sumAmounts } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BalanceScope, JoinedGroup, ShareBook } from "@/db/shares";
import { formatEntryDate, formatNpr } from "@/lib/format";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

type AllGroup =
  | { kind: "owned"; group: ShareBook["groups"][number] }
  | { kind: "joined"; group: JoinedGroup };

export function GroupsView({
  book,
  onSettle,
  onAddExpense,
  onEditExpense,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onCreateInvite,
}: {
  book: ShareBook;
  onSettle: (debt: BalanceScope["youOwe"][number], groupId: string) => void;
  onAddExpense: (groupId: string) => void;
  onEditExpense: (expense: ShareBook["expenses"][number]) => void;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
  onUpdateGroup: (id: string, input: { name?: string; memberIds?: string[] }) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onCreateInvite: (groupId: string, input: { email?: string; personId?: string }) => Promise<{ url: string; emailSent: boolean }>;
}) {
  const allGroups: AllGroup[] = [
    ...book.groups.map((g) => ({ kind: "owned" as const, group: g })),
    ...book.joinedGroups.map((g) => ({ kind: "joined" as const, group: g })),
  ];
  const [selectedId, setSelectedId] = useState(allGroups[0]?.group.id ?? "");
  const selectedEntry = allGroups.find((a) => a.group.id === selectedId) ?? allGroups[0];
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([book.self.id]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerson, setInvitePerson] = useState("none");
  const [inviteLink, setInviteLink] = useState<{ url: string; emailSent: boolean } | null>(null);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  function start(group?: ShareBook["groups"][number]) {
    setEditingId(group?.id ?? null);
    setName(group?.name ?? "");
    setMembers(group ? group.members.map((member) => member.id) : [book.self.id]);
    setError(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (editingId) await onUpdateGroup(editingId, { name, memberIds: members });
      else await onCreateGroup(name, members);
      toast.success(editingId ? "Group updated" : "Group added");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that group.");
    } finally {
      setPending(false);
    }
  }

  function openInvite(groupId: string) {
    setInviteGroupId(groupId);
    setInviteEmail("");
    setInvitePerson("none");
    setInviteLink(null);
    setInviteError(null);
    setInviteOpen(true);
  }

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteGroupId) return;
    setInvitePending(true);
    setInviteError(null);
    try {
      const result = await onCreateInvite(inviteGroupId, {
        email: inviteEmail.trim() || undefined,
        personId: invitePerson === "none" ? undefined : invitePerson,
      });
      setInviteLink(result);
    } catch (caught) {
      setInviteError(caught instanceof Error ? caught.message : "Could not create invite link.");
    } finally {
      setInvitePending(false);
    }
  }

  function copyInviteLink() {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink.url).then(() => toast.success("Copied to clipboard")).catch(() => toast.error("Could not copy"));
    }
  }

  const inviteGroup = book.groups.find((group) => group.id === inviteGroupId);
  const invitePlaceholders = inviteGroup ? inviteGroup.members.filter((member) => !member.isSelf && !member.linkedUserId) : [];

  const groupExpenses =
    selectedEntry?.kind === "owned"
      ? book.expenses.filter((expense) => expense.groupId === selectedEntry.group.id)
      : selectedEntry?.kind === "joined"
        ? selectedEntry.group.expenses
        : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground">Shared expenses stay with the group. Settling here does not move the bank ledger.</p>
        </div>
        <Button type="button" onClick={() => start()}>
          New group
        </Button>
      </div>

      {allGroups.length === 0 || !selectedEntry ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No groups yet</EmptyTitle>
            <EmptyDescription>Start one for a trip, a flat, or the people you ride with.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => start()}>
              New group
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex flex-col rounded-lg border border-border bg-card">
            {allGroups.map((entry) => {
              const active = entry.group.id === selectedEntry.group.id;
              const owe = sumAmounts(entry.group.balances.youOwe);
              const owed = sumAmounts(entry.group.balances.youAreOwed);
              return (
                <button
                  key={entry.group.id}
                  type="button"
                  onClick={() => setSelectedId(entry.group.id)}
                  className={active ? "border-b border-border bg-muted/60 px-4 py-3 text-left last:border-b-0" : "border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/40"}
                >
                  <p className="text-sm font-medium">{entry.group.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.group.members.length} people
                    {owe ? ` · owe ${formatNpr(owe)}` : ""}
                    {owed ? ` · owed ${formatNpr(owed)}` : ""}
                    {entry.kind === "joined" ? ` · joined` : ""}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {selectedEntry.group.members.map((member) => (
                  <span key={member.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-xs">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(member.name)}</AvatarFallback>
                    </Avatar>
                    {member.name}
                    {member.linkedUserId ? <span className="size-1.5 rounded-full bg-primary" title="Has a Khata account" /> : null}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                {selectedEntry.kind === "owned" ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => openInvite(selectedEntry.group.id)}>
                      Invite
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => start(selectedEntry.group)}>
                      Edit
                    </Button>
                  </>
                ) : (
                  <span className="self-center text-xs text-muted-foreground">Owned by {selectedEntry.group.ownerName}</span>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => onAddExpense(selectedEntry.group.id)}>
                  Add expense
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="You owe" meta={formatNpr(sumAmounts(selectedEntry.group.balances.youOwe))}>
                {selectedEntry.group.balances.youOwe.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">Nothing to pay in this group.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {selectedEntry.group.balances.youOwe.map((debt) => (
                      <li key={debt.toId} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <span>{debt.toName}</span>
                        <span className="flex items-center gap-3">
                          <span className="figure">{formatNpr(debt.amount)}</span>
                                                      <Button type="button" variant="outline" size="sm" onClick={() => onSettle(debt, selectedEntry.group.id)}>
                              Settle
                            </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="You are owed" meta={formatNpr(sumAmounts(selectedEntry.group.balances.youAreOwed))}>
                {selectedEntry.group.balances.youAreOwed.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">Nobody owes you here.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {selectedEntry.group.balances.youAreOwed.map((debt) => (
                      <li key={debt.fromId} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <span>{debt.fromName}</span>
                        <span className="flex items-center gap-3">
                          <span className="figure text-credit">{formatNpr(debt.amount)}</span>
                                                      <Button type="button" variant="outline" size="sm" onClick={() => onSettle(debt, selectedEntry.group.id)}>
                              Settle
                            </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Expenses">
              {groupExpenses.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No shared expenses in this group.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {groupExpenses.map((expense) => (
                    <li key={expense.id}>
                      <button type="button" className="flex w-full items-start gap-3 py-3 text-left" onClick={() => onEditExpense(expense)}>
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatEntryDate(expense.date)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{expense.description}</span>
                          <span className="text-xs text-muted-foreground">
                            {expense.paidByName} paid · {expense.splitMode}
                          </span>
                        </span>
                        <span className="figure text-sm">{formatNpr(expense.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* Create/Edit group dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit group" : "New group"}</DialogTitle>
            <DialogDescription>Members can be added later. Past expenses stay even if someone leaves.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="group-name">Name</FieldLabel>
                <Input id="group-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Biker Gang" />
              </Field>
              <Field>
                <FieldLabel>Members</FieldLabel>
                <div className="flex flex-col gap-2">
                  {book.people.map((person) => (
                    <label key={person.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={members.includes(person.id)}
                        onChange={(event) =>
                          setMembers((current) => (event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)))
                        }
                      />
                      {person.name}
                      {person.linkedUserId ? <span className="text-xs text-muted-foreground">has account</span> : null}
                    </label>
                  ))}
                </div>
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
            <DialogFooter className="mt-5 sm:justify-between">
              {editingId ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    void onDeleteGroup(editingId)
                      .then(() => {
                        toast.success("Group removed");
                        setOpen(false);
                      })
                      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not remove that group."));
                  }}
                >
                  Delete group
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={pending || members.length === 0}>
                {pending ? "Saving" : "Save group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite to {inviteGroup?.name ?? "group"}</DialogTitle>
            <DialogDescription>
              Friends join with their own account and see this group&apos;s expenses and balances. Links last 7 days.
            </DialogDescription>
          </DialogHeader>
          {inviteLink ? (
            <div className="flex flex-col gap-4">
              {inviteLink.emailSent ? <p className="text-sm text-muted-foreground">An email with this link is on its way to {inviteEmail}.</p> : null}
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                <p className="mb-1 text-xs text-muted-foreground">Invite link</p>
                <p className="break-all text-sm">{inviteLink.url}</p>
              </div>
              <Button type="button" onClick={copyInviteLink} className="w-full">
                Copy link
              </Button>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => void submitInvite(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="invite-email">Email (optional)</FieldLabel>
                  <Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="friend@example.com" />
                  <FieldDescription>With an email, only that address can accept. Without one, the link works for anyone who has it.</FieldDescription>
                </Field>
                {invitePlaceholders.length ? (
                  <Field>
                    <FieldLabel>This is someone already in the group</FieldLabel>
                    <Select
                      items={{ none: "A new member", ...Object.fromEntries(invitePlaceholders.map((person) => [person.id, person.name])) }}
                      value={invitePerson}
                      onValueChange={(value) => value && setInvitePerson(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">A new member</SelectItem>
                        {invitePlaceholders.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>Pick a name to keep their past shares and balances when they join.</FieldDescription>
                  </Field>
                ) : null}
                {inviteError ? <FieldError>{inviteError}</FieldError> : null}
              </FieldGroup>
              <DialogFooter className="mt-5">
                <Button type="submit" disabled={invitePending} className="w-full">
                  {invitePending ? "Creating" : inviteEmail.trim() ? "Create link and email it" : "Create invite link"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
