import { getShareBook } from "@/db/shares";
import { beginRequest, jsonError } from "@/lib/http";

export async function GET() {
  await beginRequest();
  try {
    return Response.json(await getShareBook());
  } catch (error) {
    return jsonError(error);
  }
}
