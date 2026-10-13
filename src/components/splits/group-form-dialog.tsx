"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { Check, Search, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { PersonAvatar } from "@/components/splits-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { ShareBook } from "@/db/shares";
import { groupFormSchema, type GroupFormValues } from "@/lib/schemas";
import { toast } from "@/lib/status";

type Group = ShareBook["groups"][number];

function fromGroup(group: Group | null, selfId: string): GroupFormValues {
  return { name: group?.name ?? "", memberIds: group ? group.members.map((member) => member.id) : [selfId] };
}

/** Create or edit a group you own: a name and who is in it, picked as chips. */
export function GroupFormDialog({
  book,
  open,
  group,
  onOpenChange,
  onCreate,
  onUpdate,
  onDelete,
}: {
  book: ShareBook;
  open: boolean;
  /** Present when editing. */
  group: Group | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, memberIds: string[]) => Promise<void>;
  onUpdate: (id: string, input: { name?: string; memberIds?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const sessionKey = `${open ? "open" : "closed"}:${group?.id ?? "new"}`;
  const [session, setSession] = useState(sessionKey);
  const [defaults, setDefaults] = useState<GroupFormValues>(() => fromGroup(group, book.self.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults(fromGroup(group, book.self.id));
      setError(null);
      setConfirmDelete(false);
      setMemberQuery("");
    }
  }

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaults);
  }, [open, defaults, form]);

  const picked = useWatch({ control: form.control, name: "memberIds" }) ?? [];

  async function submit(values: GroupFormValues) {
    setPending(true);
    setError(null);
    try {
      if (group) await onUpdate(group.id, { name: values.name, memberIds: values.memberIds });
      else await onCreate(values.name, values.memberIds);
      toast.success(group ? "Group updated" : "Group added");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that group.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      await onDelete(id);
      toast.success("Group removed");
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove that group.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? "Edit group" : "New group"}</DialogTitle>
          <DialogDescription>{group ? "Update the name or members. Members with expense history must stay in the group." : "Give your shared plans a name, then choose who’s splitting with you. You can invite members after creating the group."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group name</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" maxLength={80} placeholder="e.g. Pokhara trip, Our flat" disabled={pending} autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="memberIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Members <span className="font-normal text-muted-foreground">· {picked.length} selected</span>
                    </FormLabel>
                    <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Find a friend" aria-label="Find group members" className="pl-9" /></div>
                    <ul className="max-h-64 overflow-y-auto rounded-xl border border-border p-1" aria-label="Members">
                      {book.people.filter((person) => (person.isSelf ? "You" : person.name).toLowerCase().includes(memberQuery.trim().toLowerCase())).map((person) => {
                        const on = picked.includes(person.id);
                        return (
                          <li key={person.id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              disabled={pending}
                              onClick={() => field.onChange(on ? picked.filter((item) => item !== person.id) : [...picked, person.id])}
                              className={cn(
                                "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                                on ? "bg-accent/60 text-accent-foreground" : "text-foreground hover:bg-secondary",
                              )}
                            >
                              <PersonAvatar name={person.name} size="sm" tone={on ? "brand" : "neutral"} linked={person.linkedUserId != null && !person.isSelf} />
                              <span className="min-w-0 flex-1 truncate text-left">{person.isSelf ? "You" : person.name}</span>
                              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md", on ? "bg-primary text-primary-foreground" : "border border-input")} aria-hidden>{on ? <Check className="size-3.5" /> : null}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {memberQuery && !book.people.some((person) => (person.isSelf ? "You" : person.name).toLowerCase().includes(memberQuery.trim().toLowerCase())) ? <p className="text-sm text-muted-foreground">No friends match this name.</p> : null}
                    {book.people.filter((person) => !person.isSelf).length === 0 ? <p className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground"><UsersRound className="mt-0.5 size-4 shrink-0" aria-hidden />Add friends from the Friends page, or create your group and invite them with a link.</p> : null}
                    <FormMessage>{error}</FormMessage>
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="mt-5 sm:justify-between">
              {group ? (
                confirmDelete ? (
                  <span className="flex items-center gap-2">
                    <Button type="button" variant="destructive" disabled={pending} onClick={() => void remove(group.id)}>
                      Yes, delete it
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button type="button" variant="ghost" className="hover:text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>
                    Delete group
                  </Button>
                )
              ) : (
                <span />
              )}
              <span className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : group ? "Save changes" : "Create group"}</Button></span>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
