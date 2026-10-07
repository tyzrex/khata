import { summarizeLedger } from "@/db/ledger";
import { beginRequest, jsonError } from "@/lib/http";

export async function GET() {
  await beginRequest();
  try {
    return Response.json(await summarizeLedger());
  } catch (error) {
    return jsonError(error);
  }
}
