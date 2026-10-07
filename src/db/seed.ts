import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { getPool } from "@/db/client";
import { importTransactions } from "@/db/ledger";
import { seedSampleBook } from "@/db/shares";

config({ path: ".env" });
config({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL && process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

async function main() {
  const file = path.join(process.cwd(), "seed", "week-of-2026-10-05.json");
  const payload = JSON.parse(readFileSync(file, "utf8"));
  const result = await importTransactions(payload);
  await seedSampleBook();
  console.log(JSON.stringify({ ...result, shares: "seeded" }, null, 2));
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
