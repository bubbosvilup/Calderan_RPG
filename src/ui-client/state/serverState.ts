import { useCallback } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { mutationKeys, queryKeys } from "../api/queryKeys";
import { fetchSession, isActiveSession, stateFromError } from "../api/session";
import type { SessionPayload } from "../api/types";

/**
 * Server state. The session payload in the TanStack cache is the ONLY copy of authoritative data in the browser (funds, characters,
 * offers, confirmations, location...). Components read it through these hooks and never mirror it into local state.
 */

/** The session read model. Polls once a second only while the server reports a busy session that this page is not itself waiting on. */
export function useSessionQuery(options: { readonly pollWhileBusy?: boolean } = {}) {
  const poll = options.pollWhileBusy ?? true;
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => fetchSession(signal),
    refetchInterval: query => (poll && query.state.data && query.state.data.status !== "idle" && query.state.data.status !== "closed" ? 1000 : false),
  });
}

/**
 * Applies the authoritative state a mutation response carried, or refetches when it carried none. In-flight session reads are cancelled
 * first (and awaited, so their revert cannot land after the newer state).
 */
export async function applyServerState(client: QueryClient, state: SessionPayload | null): Promise<void> {
  await client.cancelQueries({ queryKey: queryKeys.session });
  if (state) client.setQueryData(queryKeys.session, state);
  else await client.invalidateQueries({ queryKey: queryKeys.session });
  void client.invalidateQueries({ queryKey: queryKeys.saveStatus });
}

export function useApplyServerState() {
  const client = useQueryClient();
  return useCallback((state: SessionPayload | null) => applyServerState(client, state), [client]);
}

/**
 * The revision this page currently renders, read at click time from the cache (never from a stale closure). Every state-changing request
 * sends it; the engine refuses the request as stale when the campaign moved on.
 */
export function renderedRevision(client: QueryClient): number {
  const data = client.getQueryData<SessionPayload>(queryKeys.session);
  if (!isActiveSession(data)) throw new ApiError("stale", "The campaign is not loaded yet. Wait a moment and try again.");
  return data.revision;
}

/**
 * One state-changing click (accept an offer, confirm, promote, keep track, save, open a campaign). Whatever the outcome, the screen ends on
 * the server's state: success applies the returned state, a refusal applies the fresh state it carries, a network failure refetches.
 */
export function useServerAction<Variables, Result extends { readonly state: SessionPayload | null }>(name: string, run: (variables: Variables) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation<Result, Error, Variables>({
    mutationKey: mutationKeys.action(name),
    mutationFn: run,
    onSuccess: result => applyServerState(client, result.state),
    onError: error => applyServerState(client, stateFromError(error)),
  });
}

/** A server action guarded by the rendered revision (`expected_revision`): the engine refuses it as stale when the campaign moved on. */
export function useSessionAction<Variables, Result extends { readonly state: SessionPayload | null }>(name: string, run: (variables: Variables, revision: number) => Promise<Result>) {
  const client = useQueryClient();
  return useServerAction<Variables, Result>(name, variables => run(variables, renderedRevision(client)));
}

/** True while a turn or any other state-changing request from this page is in flight (one at a time, like the server). */
export function useRequestInFlight(): boolean {
  return useIsMutating({ mutationKey: mutationKeys.turn }) + useIsMutating({ mutationKey: mutationKeys.anyAction }) > 0;
}

/** A player-safe message for any thrown value (ApiError carries one; anything else gets generic copy, never its own text). */
export const errorMessage = (error: unknown, fallback = "That did not work. Nothing changed."): string => (error instanceof ApiError ? error.message : fallback);
