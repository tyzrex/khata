"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "@/lib/status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteSchema, type InviteValues } from "@/lib/schemas";
import type { ShareBook } from "@/db/shares";

type Person = ShareBook["people"][number];

export type InviteActions = {
  ensureDirect: (personId: string) => Promise<string>;
  createGroup: (name: string, memberIds: string[]) => Promise<string | null>;
  updateGroup: (id: string, input: { name?: string; memberIds?: string[] }) => Promise<void>;
  createInvite: (groupId: string, input: { email?: string; personId?: string }) => Promise<{ url: string; emailSent: boolean }>;
};

const NEW_GROUP = "__new__";
const DIRECT = "__direct__";

/**
 * Invite someone to a group. Two entry points:
 * - from a group: `groupId` is fixed, the person is optional (a new member, or a name already in the group)
 * - from a friend: `person` is fixed, the group is chosen (or created) and the friend is added to it first
 *
 * Mount with a `key` that changes per opening so the form state resets.
 */
export function InviteDialog({
  book,
  open,
  onOpenChange,
  groupId,
  person,
  initialEmail = "",
  actions,
}: {
  book: ShareBook;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId?: string;
  person?: Person;
  initialEmail?: string;
  actions: InviteActions;
}) {
  const owned = book.groups.filter((group) => group.kind === "group");
  const startChoice = groupId ?? (person ? DIRECT : (owned[0]?.id ?? NEW_GROUP));
  const [creating, setCreating] = useState(startChoice === NEW_GROUP);
  const [link, setLink] = useState<{ url: string; emailSent: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Only the "new group name" field changes the rules, so the schema is swapped rather than
  // carrying a "creating" flag through the values.
  const resolver = useMemo(() => zodResolver(inviteSchema(creating ? "creating-group" : "not-creating-group")), [creating]);
  const form = useForm<InviteValues>({
    resolver,
    defaultValues: {
      choice: startChoice,
      newName: person ? `${person.name} & you` : "",
      email: initialEmail,
      pickedPerson: "none",
    },
  });

  const choice = useWatch({ control: form.control, name: "choice" });
  const newName = useWatch({ control: form.control, name: "newName" });
  const email = useWatch({ control: form.control, name: "email" });

  const group = owned.find((item) => item.id === choice);
  const placeholders = !person && group ? group.members.filter((member) => !member.isSelf && !member.linkedUserId) : [];
  const direct = choice === DIRECT;

  async function submit(values: InviteValues) {
    setPending(true);
    setError(null);
    try {
      let target = values.choice;
      if (direct) {
        if (!person) throw new Error("Pick a group.");
        target = await actions.ensureDirect(person.id);
      } else if (creating) {
        const name = values.newName.trim();
        if (!name) throw new Error("Give the group a name.");
        const id = await actions.createGroup(name, person ? [book.self.id, person.id] : [book.self.id]);
        if (!id) throw new Error("The group was created but could not be found. Reload and try again.");
        target = id;
      } else if (person && group && !group.members.some((member) => member.id === person.id)) {
        await actions.updateGroup(group.id, { memberIds: [...group.members.map((member) => member.id), person.id] });
      }
      const personId = person ? person.id : values.pickedPerson === "none" ? undefined : values.pickedPerson;
      const result = await actions.createInvite(target, { email: values.email.trim() || undefined, personId });
      setLink(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create that invite.");
    } finally {
      setPending(false);
    }
  }

  const groupLabel = direct ? "our shared expenses" : group?.name ?? (creating ? newName || "the new group" : "the group");
  const shareText = link ? `Join "${groupLabel}" on Khata so we can split expenses: ${link.url}` : "";

  function copy() {
    if (!link) return;
    navigator.clipboard
      .writeText(link.url)
      .then(() => {
        setCopied(true);
        toast.success("Link copied");
      })
      .catch(() => toast.error("Could not copy. Select the link and copy it by hand."));
  }

  /** The phone's own share sheet, where the browser has one (installed PWA, mobile Safari and Chrome). */
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  function share() {
    if (!link) return;
    navigator.share({ title: "Join me on Khata", text: shareText }).catch(() => {
      // Closing the share sheet rejects too; nothing to report.
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? `Invite ${person.name}` : `Invite to ${group?.name ?? "a group"}`}</DialogTitle>
          <DialogDescription>
            They join with their own account, see what you share and can add expenses and settle up too. Links last 7 days.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="flex flex-col gap-4">
            {link.emailSent ? (
              <p className="flex items-center gap-2 rounded-xl bg-credit/10 px-3 py-2.5 text-[13px] font-medium text-credit">
                <Check className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0">An email with this link is on its way to {email}.</span>
              </p>
            ) : null}
            <div className="rounded-xl bg-secondary p-1.5 pl-3.5">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-[13px] text-display" title={link.url}>
                  {link.url}
                </p>
                <Button type="button" size="sm" className="shrink-0" onClick={copy} aria-label="Copy invite link">
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{email.trim() ? `Only ${email.trim()} can accept it. The link lasts 7 days.` : "Anyone with this link can join for the next 7 days."}</p>
            <div className={canShare ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
              {canShare ? (
                <Button type="button" variant="outline" onClick={share}>
                  <Share2 />
                  Share
                </Button>
              ) : null}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <MessageCircle />
                WhatsApp
              </a>
            </div>
            <Button type="button" variant="ghost" className="self-center" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form className="grid gap-5" noValidate onSubmit={form.handleSubmit(submit)}>
              {groupId ? null : (
                <FormField
                  control={form.control}
                  name="choice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group</FormLabel>
                      <Select
                        items={{ ...(person ? { [DIRECT]: "Just us, no group" } : {}), ...Object.fromEntries(owned.map((item) => [item.id, item.name])), [NEW_GROUP]: "New group" }}
                        value={field.value}
                        onValueChange={(value) => {
                          if (!value) return;
                          setCreating(value === NEW_GROUP);
                          field.onChange(value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {person ? <SelectItem value={DIRECT}>Just us, no group</SelectItem> : null}
                          {owned.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={NEW_GROUP}>New group</SelectItem>
                        </SelectContent>
                      </Select>
                      {person && group && !group.members.some((member) => member.id === person.id) ? (
                        <FormDescription>
                          {person.name} will be added to {group.name} first.
                        </FormDescription>
                      ) : null}
                    </FormItem>
                  )}
                />
              )}

              {creating ? (
                <FormField
                  control={form.control}
                  name="newName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New group name</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" placeholder="Trip, flat, rides" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="friend@example.com" {...field} />
                    </FormControl>
                    <FormDescription>With an email, only that address can accept and we send the link for you. Without one, anyone with the link can join.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {placeholders.length ? (
                <FormField
                  control={form.control}
                  name="pickedPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Is this someone already in the group?</FormLabel>
                      <Select items={{ none: "A new member", ...Object.fromEntries(placeholders.map((item) => [item.id, item.name])) }} value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">A new member</SelectItem>
                          {placeholders.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Pick a name to keep their past shares and balances when they join.</FormDescription>
                    </FormItem>
                  )}
                />
              ) : null}

              {error ? (
                <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? "Creating" : email.trim() ? "Create link and email it" : "Create invite link"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}