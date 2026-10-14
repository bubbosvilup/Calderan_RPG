import { requestJson } from "./client";
import { sessionStateFrom } from "./session";

/**
 * Actual Offer: the browser sends only the opaque offer ref and the revision it rendered. Price, subject, parties and settlement are decided
 * and revalidated by the engine; a stale, superseded or settled offer is refused with no change.
 */
export async function acceptOffer(request: { readonly ref: string; readonly expectedRevision: number }) {
  return { state: sessionStateFrom(await requestJson<unknown>("/trade/accept", { method: "POST", body: { ref: request.ref, expected_revision: request.expectedRevision } })) };
}
