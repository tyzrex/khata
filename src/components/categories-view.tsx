"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_KINDS, SWATCHES, type CategoryKind } from "@/lib/constants";
import type { CategoryDto } from "@/lib/types";

type Draft = { name: string; kind: CategoryKind; color: string };

const blank: Draft = { name: "", kind: "expense", color: SWATCHES[0] };

export function CategoriesView({
  categories,
  onSave,
  onDelete,
}: {
  categories: CategoryDto[];
  onSave: (input: unknown, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function start(category?: CategoryDto) {
    setEditing(category ?? null);
    setDraft(category ? { name: category.name, kind: category.kind, color: category.color } : blank);
    setError(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSave(draft, editing?.id);
      toast.success(editing ? "Category updated" : "Category added");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that category.");
    } finally {
      setPending(false);
    }
  }

  async function remove(category: CategoryDto) {
    try {
      await onDelete(category.id);
      toast.success(`${category.name} removed`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove that category.");
    }
  }

  return (
    <div className="rise">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">Names for the bank ledger.</p>
        </div>
        <Button type="button" className="h-10 px-4" onClick={() => start()}>
          Add category
        </Button>
      </div>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-3 py-3">
            <span className="size-3 rounded-full" style={{ background: category.color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{category.name}</span>
              <span className="text-xs capitalize text-muted-foreground">{category.kind}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => start(category)}>
              Edit
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void remove(category)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{editing ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>Renaming a category updates the entries that already use it.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-10" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-kind">Kind</Label>
              <Select
                items={Object.fromEntries(CATEGORY_KINDS.map((kind) => [kind, kind]))}
                value={draft.kind}
                onValueChange={(value) => value && setDraft({ ...draft, kind: value as CategoryKind })}
              >
                <SelectTrigger id="cat-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    className={draft.color === color ? "size-7 rounded-full ring-2 ring-foreground ring-offset-2 ring-offset-popover" : "size-7 rounded-full"}
                    style={{ background: color }}
                    onClick={() => setDraft({ ...draft, color })}
                  />
                ))}
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending} className="h-10 px-4">
                {pending ? "Saving" : "Save category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
