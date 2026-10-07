import type { NextRequest } from "next/server";
import { importTransactions } from "@/db/ledger";
import { seedSampleBook } from "@/db/shares";
import { shareError } from "@/lib/http";
import { readSampleWeek } from "@/lib/sample-week";
import { requireUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    const result = await importTransactions(userId, readSampleWeek());
    await seedSampleBook(userId);
    return Response.json({ ...result, shares: "seeded" });
  } catch (error) {
    return shareError(error);
  }
}
