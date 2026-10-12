/**
 * Block 5A: the neutral vocabulary shared by the turn pipeline (which only PROPOSES) and persistence/app (which stores and confirms). Types and one pure
 * function; no behavior of either side lives here.
 */
export type PendingPayload = Readonly<Record<string, string | number | boolean>>;
/** The stable identity of "the same interpretation": kind + subject + payload (key order irrelevant). */
export function pendingEquivalenceKey(kind: string, subject_id: string, payload: PendingPayload): string {
  return JSON.stringify([kind, subject_id, Object.keys(payload).sort().map(k => [k, payload[k]])]);
}
