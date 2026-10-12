"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON } from "@/components/segmented";
import { CATEGORY_KINDS, SWATCHES, type CategoryKind } from "@/lib/constants";
import { categoryFormSchema, type CategoryFormValues } from "@/lib/schemas";
import type { CategoryDto } from "@/lib/types";

const blank: CategoryFormValues = { name: "", kind: "expense", color: SWATCHES[0] };

function fromCategory(category: CategoryDto): CategoryFormValues {
  return { name: category.name, kind: category.kind, color: category.color };
}

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const sessionKey = `${open ? "open" : "closed"}:${editing?.id ?? "new"}`;
  const [session, setSession] = useState(sessionKey);
  const [defaults, setDefaults] = useState<CategoryFormValues>(blank);

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (open) {
      setDefaults(editing ? fromCategory(editing) : blank);
      setError(null);
      setConfirming(null);
    }
  }

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaults);
  }, [open, defaults, form]);

  const name = useWatch({ control: form.control, name: "name" });
  const kind = useWatch({ control: form.control, name: "kind" });
  const color = useWatch({ control: form.control, name: "color" });

  function start(category?: CategoryDto) {
    setEditing(category ?? null);
    setDefaults(category ? fromCategory(category) : blank);
    setError(null);
    setConfirming(null);
    setOpen(true);
  }

  async function submit(values: CategoryFormValues) {
    setPending(true);
    setError(null);
    try {
      await onSave({ ...values }, editing?.id);
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
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{KIND_HINT[section.kind]}</p>
                </div>
                <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground tabular-nums">{section.items.length}</span>
              </div>
              <ul className="mt-3 divide-y divide-border">
                {section.items.map((category) => (
                  <li key={category.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${category.color} 16%, transparent)` }} aria-hidden>
                      <span className="size-3 rounded-full" style={{ background: category.color }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-display">{category.name}</span>
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
                        <Button type="button" variant="outline" size="icon-sm" aria-label={`Edit ${category.name}`} title="Edit" onClick={() => start(category)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
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
          <Form {...form}>
            <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
              <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5" aria-hidden>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
                  <span className="size-3 rounded-full" style={{ background: color }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-display">{name.trim() || "Category name"}</span>
                  <span className="block text-[13px] text-muted-foreground">{KIND_LABEL[kind]}</span>
                </span>
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" maxLength={40} autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel id="cat-kind">Kind</FormLabel>
                    <div className={SEGMENT} role="radiogroup" aria-labelledby="cat-kind">
                      {CATEGORY_KINDS.map((option) => (
                        <button key={option} type="button" role="radio" aria-checked={field.value === option} className={field.value === option ? SEGMENT_ON : SEGMENT_OFF} onClick={() => field.onChange(option)}>
                          {KIND_LABEL[option]}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem className="gap-1.5">
                    <FormLabel id="cat-color">Color</FormLabel>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="cat-color">
                      {SWATCHES.map((swatch) => {
                        const on = field.value === swatch;
                        return (
                          <button
                            key={swatch}
                            type="button"
                            role="radio"
                            aria-label={`Color ${swatch}`}
                            aria-checked={on}
                            className={`flex size-9 items-center justify-center rounded-lg text-white transition-transform duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover ${on ? "ring-2 ring-primary ring-offset-2 ring-offset-popover" : "hover:scale-105"}`}
                            style={{ background: swatch }}
                            onClick={() => field.onChange(swatch)}
                          >
                            {on ? <Check className="size-4" aria-hidden /> : null}
                          </button>
                        );
                      })}
                    </div>
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
                <Button type="submit" disabled={pending} className="max-sm:w-full">
                  {pending ? "Saving" : "Save category"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
