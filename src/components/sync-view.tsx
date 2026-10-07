"use client";

import { useState } from "react";
import { toast } from "sonner";
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

export function SyncView({
  passcodeRequired,
  onImport,
  onSample,
}: {
  passcodeRequired: boolean;
  onImport: (payload: unknown) => Promise<ImportResult>;
  onSample: () => Promise<ImportResult>;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState(false);

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
    const text = await file.text();
    const payload = JSON.parse(text) as unknown;
    await run(() => onImport(payload), "File imported");
  }

  async function download() {
    const response = await fetch("/api/export");
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
  }

  return (
    <div className="rise max-w-2xl">
      <h1 className="text-lg font-medium tracking-tight">Sync</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        A daily routine can POST bank lines to <code className="text-foreground">/api/import</code>. Rows that share an{" "}
        <code className="text-foreground">externalId</code> update in place. This import does not create friend splits. Link a
        bank credit from Settle up when it matches a payment between people.
      </p>
      {passcodeRequired ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This ledger is private. Send <code className="text-foreground">Authorization: Bearer &lt;APP_PASSCODE&gt;</code> with
          the import.
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button type="button" variant="outline" className="h-11 px-4" disabled={pending} onClick={() => void run(onSample, "Sample week loaded")}>
          Load sample week
        </Button>
        <Button type="button" className="h-11 px-4" onClick={() => void download()}>
          Download JSON
        </Button>
      </div>

      <label className="mt-6 block cursor-pointer rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void onFile(file).catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : "That file is not JSON.");
            });
            event.target.value = "";
          }}
        />
        Choose a JSON file to import
      </label>

      <div className="mt-4 grid gap-2">
        <Textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={5} placeholder='Paste { "transactions": [ ... ] } or a bare array' />
        <Button
          type="button"
          variant="secondary"
          className="h-10"
          disabled={pending || !paste.trim()}
          onClick={() => {
            try {
              const payload = JSON.parse(paste) as unknown;
              void run(() => onImport(payload), "Pasted JSON imported");
            } catch {
              setError("That paste is not JSON.");
            }
          }}
        >
          Import pasted JSON
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {result ? (
        <p className="mt-4 text-sm">
          {result.created} new, {result.updated} already in the ledger
          {result.invalid?.length ? `, ${result.invalid.length} skipped` : ""}.
        </p>
      ) : null}
      {result?.invalid?.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {result.invalid.map((item) => (
            <li key={`${item.index}-${item.message}`}>
              Row {item.index + 1}: {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm">Import schema</summary>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-4 text-xs leading-5">{schema}</pre>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Accounts: Nabil, NIMB, Sanima, Splitwise, Other. Types: expense, income, transfer. Currency is NPR. The body may
          be a bare array or an object with a transactions field.
        </p>
      </details>
    </div>
  );
}
