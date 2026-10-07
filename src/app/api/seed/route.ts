import { importTransactions } from "@/db/ledger";
import { seedSampleBook } from "@/db/shares";
import { beginRequest, jsonError } from "@/lib/http";
import { readSampleWeek } from "@/lib/sample-week";

export async function POST() {
  await beginRequest();
  try {
    const result = await importTransactions(readSampleWeek());
    await seedSampleBook();
    return Response.json({ ...result, shares: "seeded" });
  } catch (error) {
    return jsonError(error);
  }
}
