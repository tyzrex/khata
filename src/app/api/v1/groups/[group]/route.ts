import type { NextRequest } from "next/server";
import { accountOf } from "@/db/agent";
import { getShareBook, updateGroup } from "@/db/shares";
import { AgentInputError } from "@/lib/agent/match";
import { peopleFor } from "@/lib/agent/people";
import { findGroup, matchPersonIn } from "@/lib/agent/plan";
import { agentError, fail, ok, spendWrite, zodMessage } from "@/lib/agent/respond";
import { groupPatch } from "@/lib/agent/schemas";
import { expenseViews, groupViews } from "@/lib/agent/views";
import { readJson } from "@/lib/http";
import { requireAgentUserId } from "@/lib/session";

/** `group` is an id or a group name (URL-encoded). */
type Context = { params: Promise<{ group: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const ref = decodeURIComponent((await context.params).group);
    const book = await getShareBook(userId);
    const scope = findGroup(book, ref);
    const group = groupViews(book).find((entry) => entry.id === scope.groupId);
    if (!group) return fail("That is a friend's direct book, not a group. Use GET /api/v1/friends.", 404);
    const expenses = expenseViews(book).filter((expense) => expense.groupId === group.id).slice(0, 20);
    return ok({ group, recentExpenses: expenses }, `${group.summary}. Members: ${group.members.join(", ")}.${group.balances.length ? ` ${group.balances.join(". ")}.` : ""}`);
  } catch (error) {
    return agentError(error);
  }
}

/** Rename a group you own, or add and remove members by name. */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const userId = await requireAgentUserId(request);
    const limited = spendWrite(userId);
    if (limited) return limited;
    const ref = decodeURIComponent((await context.params).group);
    const parsed = groupPatch.safeParse(await readJson(request));
    if (!parsed.success) return fail(zodMessage(parsed.error));
    const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
    const scope = findGroup(book, ref);
    if (scope.kind !== "group") throw new AgentInputError("A friend's direct book cannot be renamed or given other members.");
    if (!scope.owned) return fail(`Only ${scope.ownerName}, who owns "${scope.groupName}", can change its name or members.`, 403);

    const { addMembers, removeMembers, createMissing, name } = parsed.data;
    const { ids: added, created } = await peopleFor(userId, book, addMembers, { createMissing, accountName: account.name });
    const removed = removeMembers.map((member) => matchPersonIn(scope, member, account.name));
    const current = scope.members.map((member) => member.id);
    const memberIds = [...new Set([...current, ...added])].filter((id) => !removed.includes(id));
    if (!memberIds.length) return fail("A group needs at least one member.");
    const membersChanged = addMembers.length > 0 || removeMembers.length > 0;
    await updateGroup(userId, scope.groupId!, { ...(name ? { name } : {}), ...(membersChanged ? { memberIds } : {}) });

    const after = groupViews(await getShareBook(userId)).find((group) => group.id === scope.groupId)!;
    const parts = [
      name && name !== scope.groupName ? `Renamed "${scope.groupName}" to "${name}"` : "",
      membersChanged ? `Members are now ${after.members.join(", ")}` : "",
      created.length ? `Added new friends: ${created.map((person) => person.name).join(", ")}` : "",
    ].filter(Boolean);
    return ok({ group: after }, `${parts.join(". ") || "No changes"}.`);
  } catch (error) {
    return agentError(error);
  }
}
