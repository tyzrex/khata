import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { NotFoundError } from "@/db/shares";
import { ShareInputError } from "@/lib/split";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = "UnauthorizedError";
  }
}

export async function beginRequest() {
  await connection();
}

export function badRequest(message: string, details?: unknown) {
  return Response.json(details === undefined ? { error: message } : { error: message, details }, { status: 400 });
}

export function shareError(error: unknown) {
  if (error instanceof ShareInputError) return badRequest(error.message);
  if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 });
  return jsonError(error);
}

export function jsonError(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "";
  if (!process.env.DATABASE_URL || message.includes("DATABASE_URL is not set")) {
    return Response.json(
      {
        error: "DATABASE_URL is not set. Add the Neon pooled connection string, then restart.",
      },
      { status: 503 },
    );
  }
  if (/ECONNREFUSED|ENOTFOUND|password authentication|timeout|relation ["']?\w+["']? does not exist|does not exist/i.test(message)) {
    return Response.json(
      {
        error: "Postgres is unreachable, or the Khata tables are missing. Check DATABASE_URL and run npm run db:migrate.",
      },
      { status: 503 },
    );
  }
  return Response.json({ error: "The ledger could not be read just now." }, { status: 500 });
}
