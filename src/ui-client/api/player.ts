import { ApiError, isRecord, requestJson } from "./client";
import { sessionStateFrom } from "./session";

/**
 * The player's profile write (`POST /api/player-character`). The patch holds only what changed: omitted = unchanged, `null` = clear a saved
 * value, a string/number/list = set. The engine bounds, validates and commits it atomically; a refusal names the offending field.
 */
export type ProfilePatch = Readonly<Record<string, string | number | readonly string[] | null>>;

export async function saveProfile(request: { readonly patch: ProfilePatch; readonly expectedRevision: number }) {
  const body = await requestJson<Record<string, unknown>>("/player-character", { method: "POST", body: { expected_revision: request.expectedRevision, patch: request.patch } });
  return { state: sessionStateFrom(body), changed: body.changed === true };
}

/** The field a refused profile save points at, when the server named one. */
export const refusedField = (error: unknown): string | null => {
  const body = error instanceof ApiError ? error.body : undefined;
  return isRecord(body) && typeof body.field === "string" ? body.field : null;
};
