/**
 * Consolidation block 4 (REV-2) — terminal TURN RECEIPTS: idempotency metadata, NOT gameplay state.
 *
 * A receipt says "the logical turn identified by `turn_key` reached this terminal result". It lets a retried request (lost HTTP response,
 * reconnect, restart) be answered from the stored result instead of running the turn again. It is
 *   - bounded (the newest TURN_RECEIPT_LIMIT per campaign; older ones fall off, never an unbounded ledger),
 *   - never part of CampaignState (recording one does not change the semantic revision),
 *   - written in the SAME save file as the campaign snapshot (one atomic rename), so state and receipt become durable together,
 *   - tolerant on load: a malformed receipt is dropped, never makes a save unloadable.
 */
export const TURN_RECEIPT_LIMIT = 32;
export const TURN_KEY = /^[A-Za-z0-9_-]{8,64}$/;
export interface TurnReceiptError { readonly code: string; readonly provider_code?: string; readonly turn_state_changed: boolean }
export interface TurnReceipt {
  readonly turn_key: string;
  /** sha256 of the request (message text + expected revision): the same key with another fingerprint is a conflict, never a replay. */
  readonly fingerprint: string;
  /** The campaign revision the request was based on (its expected revision, or the revision the turn started from). */
  readonly base_revision: number;
  readonly status: "committed" | "failed";
  readonly turn_id: string;
  /** committed only: the revision the turn's single commit produced. */
  readonly committed_revision?: number;
  /** failed only: the stable terminal result that is replayed. */
  readonly error?: TurnReceiptError;
}
export interface TurnReceiptBlock { readonly authority: "idempotency_metadata"; readonly receipts: readonly TurnReceipt[] }

const isRevision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
/** Structural parse of one receipt; undefined when unusable. */
function parseReceipt(input: unknown, saved_revision: number): TurnReceipt | undefined {
  const r = input as Record<string, unknown> | null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return undefined;
  const allowed = ["turn_key", "fingerprint", "base_revision", "status", "turn_id", "committed_revision", "error"];
  if (Object.keys(r).some(k => !allowed.includes(k))) return undefined;
  if (typeof r.turn_key !== "string" || !TURN_KEY.test(r.turn_key) || typeof r.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(r.fingerprint)) return undefined;
  if (!isRevision(r.base_revision) || typeof r.turn_id !== "string" || !r.turn_id || r.turn_id.length > 200) return undefined;
  if (r.status === "committed") {
    // A receipt can never claim a revision the saved state has not reached: it was written with that state.
    if (!isRevision(r.committed_revision) || r.committed_revision > saved_revision || r.error !== undefined) return undefined;
    return { turn_key: r.turn_key, fingerprint: r.fingerprint, base_revision: r.base_revision, status: "committed", turn_id: r.turn_id, committed_revision: r.committed_revision };
  }
  if (r.status === "failed") {
    const e = r.error as Record<string, unknown> | null;
    if (r.committed_revision !== undefined || !e || typeof e !== "object" || Array.isArray(e) || Object.keys(e).some(k => !["code", "provider_code", "turn_state_changed"].includes(k))) return undefined;
    if (typeof e.code !== "string" || !/^[a-z_]{1,60}$/.test(e.code) || typeof e.turn_state_changed !== "boolean" || (e.provider_code !== undefined && (typeof e.provider_code !== "string" || !/^[a-z_]{1,60}$/.test(e.provider_code)))) return undefined;
    return { turn_key: r.turn_key, fingerprint: r.fingerprint, base_revision: r.base_revision, status: "failed", turn_id: r.turn_id,
      error: { code: e.code, ...(e.provider_code ? { provider_code: e.provider_code as string } : {}), turn_state_changed: e.turn_state_changed } };
  }
  return undefined;
}
/** Tolerant block parse: unknown shape → undefined; bad receipts and duplicate keys dropped; at most the newest TURN_RECEIPT_LIMIT kept. */
export function parseTurnReceipts(input: unknown, saved_revision: number): TurnReceiptBlock | undefined {
  if (input === undefined) return undefined;
  try {
    const b = input as Record<string, unknown> | null;
    if (!b || typeof b !== "object" || Array.isArray(b) || b.authority !== "idempotency_metadata" || !Array.isArray(b.receipts) || Object.keys(b).some(k => !["authority", "receipts"].includes(k))) return undefined;
    const seen = new Set<string>(), receipts: TurnReceipt[] = [];
    for (const raw of b.receipts as unknown[]) {
      const receipt = parseReceipt(raw, saved_revision);
      if (receipt && !seen.has(receipt.turn_key)) { seen.add(receipt.turn_key); receipts.push(receipt); }
    }
    return { authority: "idempotency_metadata", receipts: receipts.slice(-TURN_RECEIPT_LIMIT) };
  } catch { return undefined; }
}
