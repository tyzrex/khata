import type { NextRequest } from "next/server";
import { listAccountNames } from "@/db/accounts";
import { transactionsByExternalId } from "@/db/agent";
import { createTransaction, importTransactions, listCategories, listTransactions } from "@/db/ledger";
import { listOfRows, toLedgerRow } from "@/lib/agent/ledger-input";
import { AgentInputError } from "@/lib/agent/match";
import { agentError, fail, ok, spendWrite, zodMessage } from "@/lib/agent/respond";
import { transactionInput, transactionQuery } from "@/lib/agent/schemas";
import { transactionSentence, transactionTotals } from "@/lib/agent/views";
import { readJson } from "@/lib/http";
import { todayInKathmandu } from "@/lib/period";
import { requireAgentUserId } from "@/lib/session";
import type { TransactionDto } from "@/lib/types";

/** Most rows one request may send. Larger backfills go through /api/import. */
const MAX_ROWS = 100;

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const parsed = transactionQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { limit, ...filters } = parsed.data;
    const all = await listTransactions(userId, filters);
    const totals = transactionTotals(all);
    const rows = all.slice(0, limit);
    const shown = rows.length < all.length ? ` Showing the newest ${rows.length}.` : "";
    return ok(
      { transactions: rows, totals, truncated: rows.length < all.length },
      `${totals.count} ${totals.count === 1 ? "transaction" : "transactions"}: spent NPR ${totals.spent.toLocaleString("en-IN")}, credited NPR ${totals.credited.toLocaleString("en-IN")}.${shown}`,
    );
  } catch (error) {
    return agentError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const { rows, single } = listOfRows(await readJson(request));
    if (rows.length === 0) return fail("Send at least one transaction.");
    if (rows.length > MAX_ROWS) return fail(`Send at most ${MAX_ROWS} transactions per request.`);

    const today = todayInKathmandu();
    const schema = transactionInput(today);
    const categoryNames = (await listCategories(userId)).map((category) => category.name);
    const accountNames = await listAccountNames(userId);
    const invalid: { index: number; error: string; candidates?: string[] }[] = [];
    const ready: { index: number; row: ReturnType<typeof toLedgerRow> }[] = [];
    rows.forEach((raw, index) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return void invalid.push({ index, error: zodMessage(parsed.error) });
      try {
        ready.push({ index, row: toLedgerRow(parsed.data, categoryNames, accountNames) });
      } catch (error) {
        if (!(error instanceof AgentInputError)) throw error;
        invalid.push({ index, error: error.message, ...(error.candidates.length ? { candidates: error.candidates } : {}) });
      }
    });
    if (single && invalid[0]) return fail(invalid[0].error, 400, invalid[0].candidates ? { candidates: invalid[0].candidates } : {});
    if (!ready.length) return fail("None of those transactions could be saved.", 400, { details: invalid });

    const keyed = ready.filter((item) => item.row.externalId);
    const saved: TransactionDto[] = [];
    let updated = 0;
    if (keyed.length) {
      const result = await importTransactions(userId, {
        transactions: keyed.map(({ row }) => ({ ...row, externalId: row.externalId!, source: "agent" })),
      });
      updated = result.updated;
      saved.push(...(await transactionsByExternalId(userId, keyed.map((item) => item.row.externalId!))));
    }
    for (const { row } of ready.filter((item) => !item.row.externalId)) {
      saved.push(await createTransaction(userId, row));
    }

    const created = saved.length - updated;
    const message =
      single && saved[0]
        ? `${updated ? "Updated" : "Saved"}: ${transactionSentence(saved[0])}.`
        : `Saved ${saved.length} ${saved.length === 1 ? "transaction" : "transactions"} (${created} new, ${updated} updated)${invalid.length ? `; ${invalid.length} skipped` : ""}.`;
    return ok({ transactions: saved, created, updated, invalid }, message, 201);
  } catch (error) {
    return agentError(error);
  }
}
