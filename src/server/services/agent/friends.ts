import { accountOf } from "@/db/agent";
import { getShareBook } from "@/db/shares";
import { friendBalances } from "@/server/agent/plan";
import { peopleFor } from "@/server/agent/people";
import type { Rendered } from "@/server/services/agent/balances";

/**
 * Friends, addressed by name.
 *
 * Adding is idempotent by name: an agent that retries a message it thinks failed
 * gets the existing friend back rather than a duplicate, and the reply says
 * which of the names were already there.
 */

export async function listFriends(userId: string): Promise<Rendered<unknown>> {
  const friends = friendBalances(await getShareBook(userId));
  const open = friends.filter((friend) => Math.abs(friend.net) >= 0.005);
  return {
    data: { friends },
    message: friends.length
      ? `${friends.length} ${friends.length === 1 ? "friend" : "friends"}. ${open.length ? `${open.map((friend) => friend.summary).join(". ")}.` : "Everyone is settled up."}`
      : "No friends yet. Add one with POST /api/v1/friends.",
  };
}

export async function addFriends(userId: string, input: { name?: string; names?: string[] }): Promise<Rendered<unknown>> {
  const names = [...(input.name ? [input.name] : []), ...(input.names ?? [])];
  const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
  const { ids, created } = await peopleFor(userId, book, names, { createMissing: true, accountName: account.name });
  const newIds = new Set(created.map((person) => person.id));
  const friends = ids
    .filter((id) => id !== book.self.id)
    .map((id) => {
      const known = book.people.find((person) => person.id === id);
      return { id, name: known?.name ?? created.find((person) => person.id === id)!.name, created: newIds.has(id), onKhata: known?.linkedUserId != null };
    });

  const existing = friends.filter((friend) => !friend.created).map((friend) => friend.name);
  const parts = [created.length ? `Added ${created.map((person) => person.name).join(", ")}` : "", existing.length ? `Already in your friends: ${existing.join(", ")}` : ""].filter(Boolean);
  return { data: { friends }, message: `${parts.join(". ") || "Nothing to add"}.`, status: created.length ? 201 : 200 };
}