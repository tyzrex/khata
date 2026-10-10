import { createPerson, type ShareBook } from "@/db/shares";
import { findNamed, isSelfWord, matchPerson, normalizeName } from "@/lib/agent/match";

/**
 * Resolve names in your own book, creating friends for names nobody has when
 * `createMissing` is set. A near miss ("Sam" when "Sameer" exists) still creates
 * a new friend only if asked; without the flag the error suggests the close name.
 */
export async function peopleFor(userId: string, book: ShareBook, names: string[], opts: { createMissing: boolean; accountName?: string }) {
  const ids: string[] = [];
  const created: { id: string; name: string }[] = [];
  for (const name of names) {
    if (isSelfWord(name)) {
      ids.push(book.self.id);
      continue;
    }
    const known = findNamed(name, [...book.people, ...created], "person");
    if (known) {
      ids.push(known.id);
      continue;
    }
    if (!opts.createMissing) {
      ids.push(matchPerson(name, book.people, book.self.id, { accountName: opts.accountName }).id);
      continue;
    }
    if (opts.accountName && normalizeName(name) === normalizeName(opts.accountName)) {
      ids.push(book.self.id);
      continue;
    }
    const person = await createPerson(userId, name.trim());
    ids.push(person.id);
    created.push({ id: person.id, name: person.name });
  }
  return { ids: [...new Set(ids)], created };
}
