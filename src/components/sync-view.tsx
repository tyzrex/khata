"use client";

import { useState, type ReactNode } from "react";
import { toast } from "@/lib/status";
import { CircleAlert, CircleCheck, Download, FileJson, Sparkles, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ImportResult } from "@/lib/types";

const schema = `{
  "externalId": "nabil-tea-95",
  "date": "2026-10-06",
  "type": "expense",
  "amount": 95,
  "currency": "NPR",
  "category": "Food",
  "merchant": "Lawa Chiya Ghar",
  "account": "Nabil",
  "note": "",
  "source": "gmail"
}`;

/** Files larger than this are almost certainly not a ledger export; refuse before reading them into memory. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function Card({ title, hint, icon, children, className }: { title: string; hint: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.015em] text-display">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold text-display">
      <span className="flex size-5 items-center justify-center rounded-md bg-secondary text-[11px] text-muted-foreground tabular-nums" aria-hidden>
        {n}
      </span>
      {children}
    </p>
  );
}

export function SyncView({
  onImport,
  onSample,
  accounts,
}: {
  onImport: (payload: unknown) => Promise<ImportResult>;
  onSample: () => Promise<ImportResult>;
  /** The book's own account names, listed in the import schema note. */
  accounts: string[];
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function run(action: () => Promise<ImportResult>, success: string) {
    setPending(true);
    setError(null);
    try {
      const next = await action();
      setResult(next);
      if (next.invalid?.length) toast.message(`${next.created} new, ${next.updated} updated, ${next.invalid.length} skipped`);
      else toast.success(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("That file is over 5 MB. Split it into smaller imports.");
      return;
    }
    const text = await file.text();
    const payload = JSON.parse(text) as unknown;
    await run(() => onImport(payload), "File imported");
  }

  function readFile(file: File | undefined) {
    void onFile(file).catch((caught: unknown) => {
      setError(caught instanceof SyntaxError ? "That file is not valid JSON." : caught instanceof Error ? caught.message : "That file is not JSON.");
    });
  }

  async function download() {
    setError(null);
    setExporting(true);
    try {
      const response = await fetch("/api/export").catch(() => null);
      if (!response) {
        setError("Could not reach the server. Check your connection and try again.");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Export failed.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "khata-export.json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="rise flex flex-col gap-6">
      <PageHeader eyebrow="Import and export" title="Sync" description="Import bank lines, export the whole book, or load the sample week." />

      {error ? (
        <p role="alert" className="flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {result ? (
        <div role="status" className="rounded-2xl bg-credit/10 px-4 py-3 text-sm text-credit">
          <p className="flex items-center gap-2.5 font-medium">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {result.created} new, {result.updated} already in the ledger
            {result.invalid?.length ? `, ${result.invalid.length} skipped` : ""}.
          </p>
          {result.invalid?.length ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-6.5 text-xs text-muted-foreground">
              {result.invalid.map((item) => (
                <li key={`${item.index}-${item.message}`}>
                  Row {item.index + 1}: {item.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-3 lg:grid-cols-5 2xl:gap-4">
        <Card title="Import" hint="Add bank lines from a JSON file or a paste" icon={<Upload className="size-4" />} className="lg:col-span-3">
          <Step n={1}>Drop or choose a file</Step>
          <label
            className={`mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-200 has-focus-visible:border-brand-tint ${dragging ? "border-brand-tint bg-accent/50" : "border-input hover:border-brand-tint"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              readFile(event.dataTransfer.files?.[0]);
            }}
          >
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                readFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <FileJson className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold text-display">{pending ? "Importing…" : "Choose a JSON file"}</span>
            <span className="text-xs text-muted-foreground">or drag it here · up to 5 MB</span>
          </label>

          <div className="mt-5">
            <Step n={2}>Or paste JSON</Step>
            <Textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={5} className="figure mt-2 text-xs" placeholder='Paste { "transactions": [ ... ] } or a bare array' aria-label="JSON to import" />
            <Button
              type="button"
              variant="secondary"
              className="mt-2 w-full sm:w-auto"
              disabled={pending || !paste.trim()}
              onClick={() => {
                try {
                  const payload = JSON.parse(paste) as unknown;
                  void run(() => onImport(payload), "Pasted JSON imported");
                } catch {
                  setError("That paste is not valid JSON.");
                }
              }}
            >
              {pending ? "Importing…" : "Import pasted JSON"}
            </Button>
          </div>
        </Card>

        <div className="grid gap-3 lg:col-span-2 2xl:gap-4">
          <Card title="Export" hint="Every entry in this account, as one JSON file" icon={<Download className="size-4" />}>
            <Button type="button" className="w-full" disabled={exporting} onClick={() => void download()}>
              <Download />
              {exporting ? "Preparing…" : "Download JSON"}
            </Button>
          </Card>

          <Card title="Sample week" hint="Fill the book with a week of example lines" icon={<Sparkles className="size-4" />}>
            <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={() => void run(onSample, "Sample week loaded")}>
              {pending ? "Loading…" : "Load sample week"}
            </Button>
          </Card>

          <section className="rounded-3xl bg-accent p-4 text-xs leading-5 text-accent-foreground/85 sm:p-5 2xl:p-6">
            <h2 className="text-[13px] font-semibold text-accent-foreground">Automate it</h2>
            <p className="mt-1.5">
              A daily routine can POST bank lines to <code className="figure rounded-md bg-card/60 px-1 text-foreground">/api/import</code>. Rows that share an{" "}
              <code className="figure rounded-md bg-card/60 px-1 text-foreground">externalId</code> update in place, inside this account. This import does not create friend splits; link a bank credit from Settle up
              when it matches a payment between people.
            </p>
            <p className="mt-2">
              The request needs this account&apos;s session: send the <code className="figure rounded-md bg-card/60 px-1 text-foreground">better-auth.session_token</code> cookie, or{" "}
              <code className="figure rounded-md bg-card/60 px-1 text-foreground">Authorization: Bearer</code> with that same token. Treat it like a password.
            </p>
          </section>
        </div>
      </div>

      <details className="group rounded-3xl bg-card p-4 shadow-card sm:p-5 2xl:p-6">
        <summary className="flex list-none items-center justify-between text-[15px] [&::-webkit-details-marker]:hidden font-semibold tracking-[-0.015em] text-display outline-none focus-visible:underline">
          Import schema
          <span className="text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <pre className="figure mt-4 overflow-x-auto rounded-xl bg-secondary p-4 text-xs leading-5">{schema}</pre>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Accounts: {accounts.join(", ") || "none yet"}. Types: expense, income, transfer. Currency is NPR. An account the file names that you do not have yet is added for you. The body may be a bare array or an object with a transactions field.
        </p>
      </details>
    </div>
  );
}
