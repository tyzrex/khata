import type { NextRequest } from "next/server";
import { accountOf } from "@/db/agent";
import { getShareBook } from "@/db/shares";
import { friendBalances } from "@/lib/agent/plan";
import { peopleFor } from "@/lib/agent/people";
import { agentError, fail, ok, spendWrite, zodMessage } from "@/lib/agent/respond";
import { friendInput } from "@/lib/agent/schemas";
import { readJson } from "@/lib/http";
import { requireAgentUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const friends = friendBalances(await getShareBook(userId));
    const open = friends.filter((friend) => Math.abs(friend.net) >= 0.005);
    return ok(
      { friends },
      friends.length ? `${friends.length} ${friends.length === 1 ? "friend" : "friends"}. ${open.length ? open.map((friend) => friend.summary).join(". ") + "." : "Everyone is settled up."}` : "No friends yet. Add one with POST /api/v1/friends.",
    );
  } catch (error) {
    return agentError(error);
  }
}

/** Adds friends by name. A name that already exists is returned as is, so retrying is safe. */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const parsed = friendInput.safeParse(await readJson(request));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const names = [...(parsed.data.name ? [parsed.data.name] : []), ...(parsed.data.names ?? [])];
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
    return ok({ friends }, `${parts.join(". ") || "Nothing to add"}.`, created.length ? 201 : 200);
  } catch (error) {
    return agentError(error);
  }
}
