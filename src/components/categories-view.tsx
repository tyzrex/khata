"use client";

import { Check, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useState } from "react";
import { toast } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON } from "@/components/segmented";
import { CATEGORY_KINDS, SWATCHES, type CategoryKind } from "@/lib/constants";
import type { CategoryDto } from "@/lib/types";

type Draft = { name: string; kind: CategoryKind; color: string };

const blank: Draft = { name: "", kind: "expense", color: SWATCHES[0] };

const KIND_LABEL: Record<CategoryKind, string> = { expense: "Expense", income: "Income", transfer: "Transfer", any: "Any" };
const KIND_HINT: Record<CategoryKind, string> = {
  expense: "Money going out",
  income: "Money coming in",
  transfer: "Moves between your own accounts",
  any: "Used for any kind of entry",
};

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
  const [confirming, setConfirming] = useState<string | null>(null);

  function start(category?: CategoryDto) {
    setEditing(category ?? null);
    setDraft(category ? { name: category.name, kind: category.kind, color: category.color } : blank);
    setError(null);
    setConfirming(null);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Give the category a name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave({ ...draft, name: draft.name.trim() }, editing?.id);
      toast.success(editing ? "Category updated" : "Category added");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that category.");
    } finally {
      setPending(false);
    }
  }

  async function remove(category: CategoryDto) {
    setConfirming(null);
    try {
      await onDelete(category.id);
      toast.success(`${category.name} removed`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove that category.");
    }
  }

  const sections = CATEGORY_KINDS.map((kind) => ({ kind, items: categories.filter((category) => category.kind === kind) })).filter((section) => section.items.length > 0);

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader
        eyebrow="Ledger names"
        title="Categories"
        description="Names for the bank ledger. Renaming one updates every entry that uses it."
        actions={
          <Button type="button" onClick={() => start()}>
            <Plus />
            Add category
          </Button>
        }
      />

      {categories.length === 0 ? (
        <section className="flex flex-col items-center rounded-3xl bg-card px-6 py-16 text-center shadow-card">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Tags className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-[15px] font-semibold tracking-[-0.015em] text-display">No categories yet</h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Add a few so every entry has somewhere to go.</p>
          <Button type="button" className="mt-5" onClick={() => start()}>
            <Plus />
            Add category
          </Button>
        </section>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2 2xl:gap-4">
          {sections.map((section) => (
            <section key={section.kind} className="rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.015em] text-display">{KIND_LABEL[section.kind]}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{KIND_HINT[section.kind]}</p>
                </div>
                <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">{section.items.length}</span>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {section.items.map((category) => (
                  <li key={category.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${category.color} 16%, transparent)` }} aria-hidden>
                      <span className="size-3 rounded-full" style={{ background: category.color }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-display">{category.name}</span>
                    {confirming === category.id ? (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Button type="button" variant="outline" size="xs" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                        <Button type="button" variant="destructive" size="xs" onClick={() => void remove(category)}>
                          Delete
                        </Button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button type="button" variant="outline" size="icon-xs" aria-label={`Edit ${category.name}`} title="Edit" onClick={() => start(category)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          className="hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Delete ${category.name}`}
                          title="Delete"
                          onClick={() => setConfirming(category.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>Renaming a category updates the entries that already use it.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5" aria-hidden>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${draft.color} 18%, transparent)` }}>
                <span className="size-3 rounded-full" style={{ background: draft.color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-display">{draft.name.trim() || "Category name"}</span>
                <span className="block text-xs text-muted-foreground">{KIND_LABEL[draft.kind]}</span>
              </span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" required autoFocus maxLength={40} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label id="cat-kind">Kind</Label>
              <div className={SEGMENT} role="radiogroup" aria-labelledby="cat-kind">
                {CATEGORY_KINDS.map((kind) => (
                  <button key={kind} type="button" role="radio" aria-checked={draft.kind === kind} className={draft.kind === kind ? SEGMENT_ON : SEGMENT_OFF} onClick={() => setDraft({ ...draft, kind })}>
                    {KIND_LABEL[kind]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label id="cat-color">Color</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="cat-color">
                {SWATCHES.map((color) => {
                  const on = draft.color === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-label={`Color ${color}`}
                      aria-checked={on}
                      className={`flex size-9 items-center justify-center rounded-lg text-white transition-transform duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover ${on ? "ring-2 ring-primary ring-offset-2 ring-offset-popover" : "hover:scale-105"}`}
                      style={{ background: color }}
                      onClick={() => setDraft({ ...draft, color })}
                    >
                      {on ? <Check className="size-4" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending} className="max-sm:w-full">
                {pending ? "Saving" : "Save category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
