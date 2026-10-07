import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "@/db/client";
import { importTransactions } from "@/db/ledger";
import { seedSampleBook } from "@/db/shares";

if (!process.env.DATABASE_URL && process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

async function main() {
  const userId = process.env.SEED_USER_ID;
  if (!userId) {
    console.error("SEED_USER_ID env var is required. Set it to the user.id of the account to seed.");
    process.exit(1);
  }

  const file = path.join(process.cwd(), "seed", "week-of-2026-10-05.json");
  const payload = JSON.parse(readFileSync(file, "utf8"));
  const result = await importTransactions(userId, payload);
  await seedSampleBook(userId);
  console.log(JSON.stringify({ ...result, shares: "seeded" }, null, 2));
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
