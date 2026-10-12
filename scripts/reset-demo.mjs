/**
 * Wipe every row and leave exactly two connected accounts behind.
 *
 * This is destructive by design and only ever meant for a database you are
 * personally testing against — there is no confirmation prompt and no undo. The
 * two accounts are created through Better Auth over HTTP rather than written
 * straight into the tables, so the password hash, the session rows and anything
 * else the library derives are exactly what a real sign-up produces. The link
 * between them is made by walking the real invite flow, which is the thing worth
 * testing: a shared expense only notifies the other account if the person in the
 * sender's book is actually tied to it.
 *
 *   bun run db:reset-demo -- <origin>
 *
 * The origin has to be the one the app is served on, and the server has to be
 * running against the same DATABASE_URL — it is the one writing these rows.
 */

import { Client } from "pg";

const origin = process.argv[2] ?? "http://localhost:3847";
const password = process.env.DEMO_PASSWORD ?? "Demo@12345";
const accounts = [
  { email: "sulavbaral58@gmail.com", name: "Sulav" },
  { email: "lilsulavcoc@gmail.com", name: "Coc" },
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/** Every table the app owns. Listed rather than discovered, so a future table is a deliberate addition. */
const TABLES = [
  "notifications",
  "notification_preferences",
  "push_subscriptions",
  "shared_expense_revisions",
  "shared_splits",
  "expense_transactions",
  "settlements",
  "shared_expenses",
  "group_invites",
  "group_user_access",
  "group_members",
  "groups",
  "people",
  "transactions",
  "categories",
  "accounts",
  "api_keys",
  "account",
  "session",
  "verification",
  "user",
];

async function truncate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // One statement so the foreign keys hold across the whole wipe rather than
    // failing halfway through on the second table.
    await client.query(`TRUNCATE ${TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`);
    console.log(`cleared ${TABLES.length} tables`);
  } finally {
    await client.end();
  }
}

/** Sign up (or sign in, if the row survived some earlier run) and keep the cookie jar. */
async function signIn({ email, name }, jar) {
  const headers = { "content-type": "application/json", origin, host: new URL(origin).host };
  const attempt = async (path, body) => {
    const response = await fetch(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${path} for ${email} answered ${response.status}: ${await response.text()}`);
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const [key, value] = pair.split("=");
      jar.set(key, value);
    }
  };
  await attempt("/api/auth/sign-in/email", { email, password }).catch(() => attempt("/api/auth/sign-up/email", { email, password, name }));
  console.log(`signed in ${email}`);
}

async function api(jar, path, init = {}) {
  const cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: { "content-type": "application/json", origin, host: new URL(origin).host, cookie, ...init.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} answered ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  await truncate();

  const [first, second] = accounts.map(() => new Map());
  for (const [index, account] of accounts.entries()) await signIn(account, index === 0 ? first : second);

  // A two-person book, then an invite addressed by email — the path that used to
  // leave a second, unlinked person row behind and silence every notification.
  const person = await api(first, "/api/people", { method: "POST", body: JSON.stringify({ name: accounts[1].name }) });
  const direct = await api(first, `/api/people/${person.person.id}/direct`, { method: "POST" });
  const invite = await api(first, `/api/groups/${direct.id}/invite`, { method: "POST", body: JSON.stringify({ email: accounts[1].email }) });
  await api(second, `/api/invite/${invite.url.split("/").pop()}/accept`, { method: "POST" });

  const book = await api(first, "/api/shares");
  const names = book.people.filter((row) => !row.isSelf).map((row) => `${row.name}${row.linkedUserId ? " (linked)" : " (NOT LINKED)"}`);
  console.log(`connected: ${accounts[0].email} ↔ ${accounts[1].email}`);
  console.log(`people in the first account's book: ${names.join(", ")}`);
  console.log("\nsign in at", origin, "with either address and the password above.");
}

await main();