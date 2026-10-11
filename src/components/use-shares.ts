"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import type { ShareBook } from "@/db/shares";
import {
  // Aliased because the public surface below reuses these names for its own wrappers,
  // and a hoisted local declaration would otherwise shadow the request and recurse.
  deleteExpense as requestDeleteExpense,
  deleteGroup as requestDeleteGroup,
  deletePerson as requestDeletePerson,
  deleteSettlement as requestDeleteSettlement,
  patchGroup,
  patchPerson,
  postDirect,
  postExpense,
  postGroup,
  postInvite,
  postLeaveGroup,
  postPerson,
  postSettlement,
  sharesKey,
  sharesQuery,
} from "@/components/shares-query";

function isSignedOut(error: unknown) {
  return (error as { status?: number } | null)?.status === 401;
}

/**
 * The share book (friends, groups, balances), seeded from the server render and owned by
 * React Query afterwards.
 *
 * Every write invalidates the single book read, because balances are derived from the whole
 * book: a person's share of an expense, a group's net and the "who owes whom" list are all
 * recomputed server-side from the same rows, so there is no cheaper correct update to make
 * here. The returned surface is unchanged, so the splits screens and dialogs are untouched.
 */
export function useShares(initial: ShareBook) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: book, error, refetch } = useQuery({ ...sharesQuery, initialData: initial });

  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const signedOut = isSignedOut(error);
  useEffect(() => {
    if (signedOut) router.push("/login");
  }, [signedOut, router]);

  /** Every write to the book ends the same way: invalidate the one read it changed. */
  const invalidateBook = async () => {
    await queryClient.invalidateQueries({ queryKey: sharesKey });
  };

  const createPersonMutation = useMutation({ mutationFn: postPerson, onSuccess: invalidateBook });
  const renamePersonMutation = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => patchPerson(id, name), onSuccess: invalidateBook });
  const deletePersonMutation = useMutation({ mutationFn: requestDeletePerson, onSuccess: invalidateBook });
  const createGroupMutation = useMutation({ mutationFn: ({ name, memberIds }: { name: string; memberIds: string[] }) => postGroup(name, memberIds), onSuccess: invalidateBook });
  const updateGroupMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; memberIds?: string[] } }) => patchGroup(id, input),
    onSuccess: invalidateBook,
  });
  const deleteGroupMutation = useMutation({ mutationFn: requestDeleteGroup, onSuccess: invalidateBook });
  const leaveGroupMutation = useMutation({ mutationFn: postLeaveGroup, onSuccess: invalidateBook });
  const ensureDirectMutation = useMutation({ mutationFn: postDirect, onSuccess: invalidateBook });
  const createInviteMutation = useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: { email?: string; personId?: string } }) => postInvite(groupId, input),
    onSuccess: invalidateBook,
  });
  const saveExpenseMutation = useMutation({
    mutationFn: ({ input, id }: { input: unknown; id?: string }) => postExpense(input, id),
    onSuccess: invalidateBook,
  });
  const deleteExpenseMutation = useMutation({ mutationFn: requestDeleteExpense, onSuccess: invalidateBook });
  const saveSettlementMutation = useMutation({
    mutationFn: ({ input, id }: { input: unknown; id?: string }) => postSettlement(input, id),
    onSuccess: invalidateBook,
  });
  const deleteSettlementMutation = useMutation({ mutationFn: requestDeleteSettlement, onSuccess: invalidateBook });

  async function createPerson(name: string) {
    await createPersonMutation.mutateAsync(name);
  }

  async function renamePerson(id: string, name: string) {
    await renamePersonMutation.mutateAsync({ id, name });
  }

  async function deletePerson(id: string) {
    await deletePersonMutation.mutateAsync(id);
  }

  async function createGroup(name: string, memberIds: string[]) {
    await createGroupMutation.mutateAsync({ name, memberIds });
  }

  async function updateGroup(id: string, input: { name?: string; memberIds?: string[] }) {
    await updateGroupMutation.mutateAsync({ id, input });
  }

  async function deleteGroup(id: string) {
    await deleteGroupMutation.mutateAsync(id);
  }

  async function leaveGroup(id: string) {
    await leaveGroupMutation.mutateAsync(id);
  }

  async function addFriend(name: string) {
    const body = (await createPersonMutation.mutateAsync(name)) as { person?: { id: string } } | undefined;
    return body?.person?.id ?? null;
  }

  async function addGroup(name: string, memberIds: string[]) {
    const body = (await createGroupMutation.mutateAsync({ name, memberIds })) as { id?: string } | undefined;
    return body?.id ?? null;
  }

  async function ensureDirect(personId: string) {
    const body = (await ensureDirectMutation.mutateAsync(personId)) as { id?: string } | undefined;
    if (!body?.id) throw new Error("Could not open a shared book with that friend.");
    return body.id;
  }

  async function createInvite(groupId: string, input: { email?: string; personId?: string }) {
    const body = (await createInviteMutation.mutateAsync({ groupId, input })) as { url: string; emailSent?: boolean } | undefined;
    if (!body?.url) throw new Error("Could not create that invite.");
    return { url: body.url, emailSent: Boolean(body.emailSent) };
  }

  async function saveExpense(input: unknown, id?: string) {
    await saveExpenseMutation.mutateAsync({ input, id });
  }

  async function deleteExpense(id: string) {
    await deleteExpenseMutation.mutateAsync(id);
  }

  async function saveSettlement(input: unknown, id?: string) {
    await saveSettlementMutation.mutateAsync({ input, id });
  }

  async function deleteSettlement(id: string) {
    await deleteSettlementMutation.mutateAsync(id);
  }

  return {
    book,
    reload,
    createPerson,
    renamePerson,
    deletePerson,
    createGroup,
    updateGroup,
    deleteGroup,
    leaveGroup,
    addFriend,
    addGroup,
    ensureDirect,
    createInvite,
    saveExpense,
    deleteExpense,
    saveSettlement,
    deleteSettlement,
  };
}