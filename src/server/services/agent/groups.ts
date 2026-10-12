import { accountOf } from "@/db/agent";
import { createGroup, getShareBook, updateGroup } from "@/db/shares";
import { AgentInputError, normalizeName } from "@/server/agent/match";
import { peopleFor } from "@/server/agent/people";
import { findGroup, matchPersonIn } from "@/server/agent/plan";
import { groupViews, expenseViews } from "@/server/agent/views";
import { ForbiddenError, RequestError, ValidationError } from "@/server/errors";
import type { Rendered } from "@/server/services/agent/balances";

/**
 * Groups, addressed by id or by name.
 *
 * Two rules are enforced here rather than in the repository, because both are
 * about how a *person* asked rather than about what is stored: a name that
 * clashes is a 409 pointing at the existing group, and only the owner may rename
 * or re-member one.
 */

export type GroupPatch = {
  name?: string;
  addMembers?: string[];
  removeMembers?: string[];
  createMissing?: boolean;
};

export async function listGroups(userId: string): Promise<Rendered<unknown>> {
  const groups = groupViews(await getShareBook(userId));
  return {
    data: { groups },
    message: groups.length ? `${groups.map((group) => `${group.summary} (${group.members.join(", ")})`).join(". ")}.` : "No groups yet. Create one with POST /api/v1/groups.",
  };
}

/** Creates a group you own. You are always a member. */
export async function createNewGroup(userId: string, input: { name: string; members: string[]; createMissing?: boolean }): Promise<Rendered<unknown>> {
  const { name, members, createMissing } = input;
  const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
  const clash = book.groups.find((group) => group.kind === "group" && normalizeName(group.name) === normalizeName(name));
  if (clash) throw new RequestError(`You already have a group called "${clash.name}" (id ${clash.id}). Add members with PATCH /api/v1/groups/${clash.id}.`, 409);
  const { ids, created } = await peopleFor(userId, book, members, { createMissing: Boolean(createMissing), accountName: account.name });
  const id = await createGroup(userId, name, [...new Set([book.self.id, ...ids])]);
  const after = groupViews(await getShareBook(userId)).find((group) => group.id === id)!;
  const added = created.length ? ` Added new friends: ${created.map((person) => person.name).join(", ")}.` : "";
  return { data: { group: after }, message: `Created "${name}" with ${after.members.join(", ")}.${added}`, status: 201 };
}

/** `reference` is a group id or a group name (URL-encoded). */
export async function readGroup(userId: string, reference: string): Promise<Rendered<unknown>> {
  const book = await getShareBook(userId);
  const scope = findGroup(book, reference);
  const group = groupViews(book).find((entry) => entry.id === scope.groupId);
  if (!group) throw new RequestError("That is a friend's direct book, not a group. Use GET /api/v1/friends.", 404);
  const recentExpenses = expenseViews(book).filter((expense) => expense.groupId === group.id).slice(0, 20);
  return {
    data: { group, recentExpenses },
    message: `${group.summary}. Members: ${group.members.join(", ")}.${group.balances.length ? ` ${group.balances.join(". ")}.` : ""}`,
  };
}

/** Rename a group you own, or add and remove members by name. */
export async function editGroup(userId: string, reference: string, patch: GroupPatch): Promise<Rendered<unknown>> {
  const [book, account] = await Promise.all([getShareBook(userId), accountOf(userId)]);
  const scope = findGroup(book, reference);
  if (scope.kind !== "group") throw new AgentInputError("A friend's direct book cannot be renamed or given other members.");
  if (!scope.owned) throw new ForbiddenError(`Only ${scope.ownerName}, who owns "${scope.groupName}", can change its name or members.`);

  const { addMembers = [], removeMembers = [], createMissing, name } = patch;
  const { ids: added, created } = await peopleFor(userId, book, addMembers, { createMissing: Boolean(createMissing), accountName: account.name });
  const removed = removeMembers.map((member) => matchPersonIn(scope, member, account.name));
  const memberIds = [...new Set([...scope.members.map((member) => member.id), ...added])].filter((id) => !removed.includes(id));
  if (!memberIds.length) throw new ValidationError("A group needs at least one member.");

  const membersChanged = addMembers.length > 0 || removeMembers.length > 0;
  await updateGroup(userId, scope.groupId!, { ...(name ? { name } : {}), ...(membersChanged ? { memberIds } : {}) });

  const after = groupViews(await getShareBook(userId)).find((group) => group.id === scope.groupId)!;
  const parts = [
    name && name !== scope.groupName ? `Renamed "${scope.groupName}" to "${name}"` : "",
    membersChanged ? `Members are now ${after.members.join(", ")}` : "",
    created.length ? `Added new friends: ${created.map((person) => person.name).join(", ")}` : "",
  ].filter(Boolean);
  return { data: { group: after }, message: `${parts.join(". ") || "No changes"}.` };
}