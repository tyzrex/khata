import { importTransactions } from "@/db/ledger";
import { beginRequest, jsonError } from "@/lib/http";
import { readSampleWeek } from "@/lib/sample-week";

export async function POST() {
  await beginRequest();
  try {
    const result = await importTransactions(readSampleWeek());
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
