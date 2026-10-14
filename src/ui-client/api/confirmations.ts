import { requestJson } from "./client";
import { sessionStateFrom } from "./session";

/** Pending confirmations: confirm or cancel by opaque ref and rendered revision only. The engine resolves and commits; both are idempotent per ref. */
export async function resolveConfirmation(request: { readonly action: "confirm" | "cancel"; readonly ref: string; readonly expectedRevision: number }) {
  return { state: sessionStateFrom(await requestJson<unknown>(`/confirmation/${request.action}`, { method: "POST", body: { ref: request.ref, expected_revision: request.expectedRevision } })) };
}
