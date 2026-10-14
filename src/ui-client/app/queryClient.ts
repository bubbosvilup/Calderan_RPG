import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";

/**
 * The one QueryClient. Reads retry only when the server did not answer (a refused request is an answer); mutations never retry here
 * (the turn path retries itself with the same turn key, every other action is one explicit click). Returning to the tab refreshes the
 * session, which is cheap and keeps a second tab honest.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) => error instanceof ApiError && error.kind === "network" && failures < 3,
        refetchOnWindowFocus: true,
        staleTime: 1000,
      },
      mutations: { retry: false },
    },
  });
}
