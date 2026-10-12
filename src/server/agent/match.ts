/**
 * Pure helpers that turn what a person or a bot typed ("sameer", "Rs 1,200",
 * "yesterday", "nabil bank") into the exact values the ledger stores. Nothing
 * here touches the database, so it is unit tested directly.
 */

export type Named = { id: string; name: string };

/** A mistake the caller can fix. `candidates` lists names worth offering back. */
export class AgentInputError extends Error {
  constructor(
    message: string,
    readonly candidates: string[] = [],
    readonly status = 400,
  ) {
    super(message);
    this.name = "AgentInputError";
  }
}

/** Words that mean the signed-in person. */
const SELF_WORDS = new Set(["me", "i", "you", "myself", "self", "yourself", "my self", "mine"]);

/** Lowercase, strip Latin accents and punctuation, collapse spaces. Devanagari marks are kept. */
export function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

export function isSelfWord(value: string) {
  return SELF_WORDS.has(normalizeName(value));
}

function distance(a: string, b: string) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/** Names that look like what was typed, best first. */
export function suggest(query: string, names: string[], max = 5) {
  const wanted = normalizeName(query);
  if (!wanted) return [];
  const scored = names
    .map((name) => {
      const plain = normalizeName(name);
      const words = plain.split(" ");
      let score = Number.POSITIVE_INFINITY;
      if (plain.startsWith(wanted) || words.some((word) => word.startsWith(wanted)) || wanted.startsWith(plain)) score = 0;
      else if (plain.includes(wanted)) score = 1;
      else {
        const near = Math.min(distance(wanted, plain), ...words.map((word) => distance(wanted, word)));
        if (near <= Math.max(1, Math.floor(wanted.length / 3))) score = 1 + near;
      }
      return { name, score };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return [...new Set(scored.map((entry) => entry.name))].slice(0, max);
}

function listOf(names: string[]) {
  return names.map((name) => `"${name}"`).join(", ");
}

/**
 * Find one item by id or name, or null when nothing fits. Exact names win, then a
 * unique first-name match ("Sameer" for "Sameer Shrestha"). Two equally good
 * matches throw, since guessing would move money between the wrong people.
 */
export function findNamed<T extends Named>(query: string, items: T[], noun: string, where = ""): T | null {
  const typed = query.trim();
  const byId = items.find((item) => item.id === typed);
  if (byId) return byId;
  const wanted = normalizeName(typed);
  if (!wanted) return null;
  const exact = items.filter((item) => normalizeName(item.name) === wanted);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) {
    throw new AgentInputError(`"${typed}" matches more than one ${noun}${where}. Use the id instead.`, exact.map((item) => `${item.name} (${item.id})`));
  }
  if (!wanted.includes(" ")) {
    const first = items.filter((item) => normalizeName(item.name).split(" ")[0] === wanted);
    if (first.length === 1) return first[0]!;
    if (first.length > 1) {
      throw new AgentInputError(`"${typed}" matches more than one ${noun}${where}: ${listOf(first.map((item) => item.name))}. Use the full name.`, first.map((item) => item.name));
    }
  }
  return null;
}

/** Like findNamed, but a miss is an error that suggests close names. Looser matches are only ever suggested. */
export function matchNamed<T extends Named>(query: string, items: T[], noun: string, where = ""): T {
  const typed = query.trim();
  if (!typed) throw new AgentInputError(`Give a ${noun} name.`, items.map((item) => item.name).slice(0, 10));
  const hit = findNamed(typed, items, noun, where);
  if (hit) return hit;
  const close = suggest(typed, items.map((item) => item.name));
  if (close.length) throw new AgentInputError(`No ${noun} named "${typed}"${where}. Did you mean ${listOf(close)}?`, close);
  const known = items.map((item) => item.name).slice(0, 15);
  throw new AgentInputError(known.length ? `No ${noun} named "${typed}"${where}. Known: ${listOf(known)}.` : `No ${noun} named "${typed}"${where}, and there are none yet.`, known);
}

/**
 * Resolve a person. "me", "I", "you" and the account's own name mean the signed-in
 * person; the account name only counts when no friend has that exact name.
 */
export function matchPerson<T extends Named>(query: string, people: T[], selfId: string, opts: { accountName?: string; where?: string } = {}): T {
  const self = people.find((person) => person.id === selfId);
  if (self && isSelfWord(query)) return self;
  const others = people.filter((person) => person.id !== selfId);
  const wanted = normalizeName(query);
  if (self && opts.accountName && wanted === normalizeName(opts.accountName) && !others.some((person) => normalizeName(person.name) === wanted)) {
    return self;
  }
  return matchNamed(query, people, "person", opts.where);
}

/** "1,200", "Rs. 1200", "NPR 1,200.50", 1200 → 1200. Anything else → NaN. */
export function parseAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const cleaned = value
    .trim()
    .replace(/^(npr|rs\.?|रु\.?)\s*/i, "")
    .replace(/\s*(npr|rs\.?)$/i, "")
    .replace(/[,\s_]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function shiftDay(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

/** "today", "yesterday", "tomorrow" or YYYY-MM-DD; empty means today (Kathmandu). Other text is returned for the schema to reject. */
export function resolveDate(value: unknown, today: string): unknown {
  if (value == null || value === "") return today;
  if (typeof value !== "string") return value;
  const word = value.trim().toLowerCase();
  if (word === "today") return today;
  if (word === "yesterday") return shiftDay(today, -1);
  if (word === "tomorrow") return shiftDay(today, 1);
  return value.trim();
}

/**
 * Case-insensitive account match against the signed-in person's own accounts,
 * also accepting "Nabil Bank" for Nabil. Empty falls back to the first account,
 * since a book always has at least one. An unknown name is a mistake worth
 * reporting rather than silently creating an account.
 */
export function resolveAccount(value: string | undefined | null, existing: string[]): string {
  const fallback = existing[0];
  if (existing.length === 0) throw new AgentInputError("This book has no accounts yet. Add one in Khata first.", []);
  const typed = value?.trim() ?? "";
  if (!typed) return fallback!;
  const wanted = typed.toLowerCase();
  const exact = existing.find((account) => account.toLowerCase() === wanted);
  if (exact) return exact;
  const loose = existing.filter((account) => wanted.includes(account.toLowerCase()) || account.toLowerCase().includes(wanted));
  if (loose.length === 1) return loose[0]!;
  throw new AgentInputError(`Unknown account "${typed}". Use one of: ${existing.join(", ")}.`, [...existing]);
}

/** Existing category with the same name in any case, else the typed name (a new category is created). */
export function resolveCategory(value: string | undefined | null, type: "expense" | "income" | "transfer", existing: string[]) {
  const typed = value?.trim() ?? "";
  if (!typed) return type === "income" ? "Income" : type === "transfer" ? "Transfer" : "Other";
  const wanted = normalizeName(typed);
  return existing.find((name) => normalizeName(name) === wanted) ?? typed;
}
