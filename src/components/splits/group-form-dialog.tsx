"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { Check } from "lucide-react";
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

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults(fromGroup(group, book.self.id));
      setError(null);
      setConfirmDelete(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? "Edit group" : "New group"}</DialogTitle>
          <DialogDescription>Pick who splits in it. People can join later, and past expenses stay if someone leaves.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" maxLength={80} placeholder="Pokhara trip" autoFocus {...field} />
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
                      Who&apos;s in <span className="font-normal text-muted-foreground">· {picked.length} picked</span>
                    </FormLabel>
                    <ul className="flex max-h-64 flex-wrap gap-2 overflow-y-auto" aria-label="Members">
                      {book.people.map((person) => {
                        const on = picked.includes(person.id);
                        return (
                          <li key={person.id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => field.onChange(on ? picked.filter((item) => item !== person.id) : [...picked, person.id])}
                              className={cn(
                                "flex h-9 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                on ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-display",
                              )}
                            >
                              <PersonAvatar name={person.name} size="sm" tone={on ? "brand" : "neutral"} linked={person.linkedUserId != null && !person.isSelf} />
                              {person.isSelf ? "You" : person.name}
                              {on ? <Check className="size-3.5" aria-hidden /> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
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
              <Button type="submit" disabled={pending}>
                {pending ? "Saving" : "Save group"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
