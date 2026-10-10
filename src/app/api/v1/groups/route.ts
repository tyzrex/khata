import type { NextRequest } from "next/server";
import { accountOf } from "@/db/agent";
import { createGroup, getShareBook } from "@/db/shares";
import { normalizeName } from "@/lib/agent/match";
import { peopleFor } from "@/lib/agent/people";
import { agentError, fail, ok, spendWrite, zodMessage } from "@/lib/agent/respond";
import { groupInput } from "@/lib/agent/schemas";
import { groupViews } from "@/lib/agent/views";
import { readJson } from "@/lib/http";
import { requireAgentUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const groups = groupViews(await getShareBook(userId));
    return ok({ groups }, groups.length ? groups.map((group) => `${group.summary} (${group.members.join(", ")})`).join(". ") + "." : "No groups yet. Create one with POST /api/v1/groups.");
  } catch (error) {
    return agentError(error);
  }
}

/** Creates a group you own. You are always a member. */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const parsed = groupInput.safeParse(await readJson(request));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const { name, members, createMissing } = parsed.data;
    const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
    const clash = book.groups.find((group) => group.kind === "group" && normalizeName(group.name) === normalizeName(name));
    if (clash) return fail(`You already have a group called "${clash.name}" (id ${clash.id}). Add members with PATCH /api/v1/groups/${clash.id}.`, 409);
    const { ids, created } = await peopleFor(userId, book, members, { createMissing, accountName: account.name });
    const memberIds = [...new Set([book.self.id, ...ids])];
    const id = await createGroup(userId, name, memberIds);
    const after = groupViews(await getShareBook(userId)).find((group) => group.id === id)!;
    const added = created.length ? ` Added new friends: ${created.map((person) => person.name).join(", ")}.` : "";
    return ok({ group: after }, `Created "${name}" with ${after.members.join(", ")}.${added}`, 201);
  } catch (error) {
    return agentError(error);
  }
}
