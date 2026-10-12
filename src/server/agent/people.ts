import { createPerson, type ShareBook } from "@/db/shares";
import { AgentInputError, findNamed, isSelfWord, matchPerson, normalizeName } from "@/server/agent/match";

/**
 * Resolve names in your own book, creating friends for names nobody has when
 * `createMissing` is set. A near miss ("Sam" when "Sameer" exists) still creates
 * a new friend only if asked; without the flag the error suggests the close name.
 *
 * Referring to someone by first name ("Anita" for "Anita Rai") is fine when the
 * name only has to find an existing person. It is not fine when the caller is
 * *adding* people: the same words could as easily mean a second Anita, and
 * answering "already in your friends" would swallow her and attach every later
 * expense to the wrong person. So when `exactOnly` is set (adding friends), only an
 * exact name (or an id) counts as already known; a first-name hit asks the caller to choose.
 */
export async function peopleFor(userId: string, book: ShareBook, names: string[], opts: { createMissing: boolean; accountName?: string; exactOnly?: boolean }) {
  const ids: string[] = [];
  const created: { id: string; name: string }[] = [];
  for (const name of names) {
    if (isSelfWord(name)) {
      ids.push(book.self.id);
      continue;
    }
    const known = findNamed(name, [...book.people, ...created], "person");
    if (known) {
      if (opts.exactOnly && known.id !== name.trim() && normalizeName(known.name) !== normalizeName(name)) {
        throw new AgentInputError(
          `"${name.trim()}" could be your existing friend "${known.name}", or someone new. Use "${known.name}" for them, or give the new person's full name (for example "${name.trim()} ..." with a surname) so they are not mixed up.`,
          [known.name],
        );
      }
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
