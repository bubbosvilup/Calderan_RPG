/**
 * Consolidation block 5A — PENDING CONFIRMATIONS: interaction metadata, NOT gameplay state.
 *
 * A pending confirmation is a server-owned record of "a semantic interpretation of the player's words that must not directly commit an
 * irreversible act; the player confirms it explicitly in the interface". It is
 *   - never part of CampaignState (creating, cancelling or invalidating one does not change the semantic revision; confirming one commits
 *     through the ordinary `prepare/commit` and bumps the revision exactly like any other authoritative change),
 *   - written in the SAME save file as the snapshot it belongs to (top-level `interaction_metadata`, save schema 6), so state and record
 *     become durable together,
 *   - bounded only for TERMINAL records (the newest PENDING_TERMINAL_LIMIT); an ACTIVE record is never pruned,
 *   - tolerant on load: a malformed, unknown-kind, duplicate or impossible record is dropped, never makes a save unloadable.
 *
 * The browser never sends a payload, a character ID or a name: only the opaque `ref` and the revision it rendered.
 */
import { pendingEquivalenceKey, type PendingPayload } from "../types/pending-confirmation.js";
export { pendingEquivalenceKey, type PendingPayload };
export const PENDING_TERMINAL_LIMIT = 32;
/** Hard ceiling on active records accepted from a file (a hostile or corrupt save cannot make the list unbounded). */
export const PENDING_ACTIVE_PARSE_LIMIT = 256;
/** Creation ceiling: past this no new card is created (the interpretation is simply not offered). */
export const PENDING_ACTIVE_CREATE_LIMIT = 64;
export const PENDING_REF = /^[0-9a-f]{24}$/;
export type PendingStatus = "pending" | "confirmed" | "cancelled" | "invalidated";
export interface PendingProvenance {
  /** Where the interpretation came from: the player's words in a turn, a human operator invoking an explicit repair (Block 5B; never a scanner or a model), or a test harness. */
  readonly source: "player_text" | "operator" | "test";
  /** The logical turn that produced it (idempotency identity), when there was one. */
  readonly turn_key?: string;
  readonly turn_id?: string;
}
export interface PendingConfirmation {
  readonly ref: string;
  readonly kind: string;
  /** The entity the act is about, by ID (never by name: a rename does not break the binding). */
  readonly subject_id: string;
  /** Who authors the act (the confirming actor). */
  readonly actor_id: string;
  /** Server-owned parameters of the deterministic command; validated by the kind's own handler. */
  readonly payload: PendingPayload;
  readonly provenance: PendingProvenance;
  readonly created_revision: number;
  readonly status: PendingStatus;
  /** Terminal records only: a stable machine code (`player_confirmed`, `player_cancelled`, `subject_no_longer_enslaved`, ...). */
  readonly terminal_reason?: string;
  /** Confirmed only: the revision the confirming commit produced. */
  readonly resolved_revision?: number;
}
export interface InteractionMetadataBlock { readonly authority: "interaction_metadata"; readonly pending_confirmations: readonly PendingConfirmation[] }

const KIND = /^[a-z][a-z0-9_]{1,40}$/, REASON = /^[a-z][a-z0-9_]{0,59}$/, ID = /^[a-z0-9][a-z0-9_.:-]{0,119}$/, KEY = /^[a-z][a-z0-9_]{0,39}$/, TURN_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const isRevision = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Structural check of a payload (flat, bounded scalars). The kind's handler validates the meaning. */
export function validPayload(input: unknown): input is PendingPayload {
  if (!plainObject(input)) return false;
  const entries = Object.entries(input);
  if (entries.length > 8) return false;
  return entries.every(([k, v]) => KEY.test(k) && (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 120 && !/[\u0000-\u001f]/.test(v))));
}
/** Structural parse of one record; undefined when unusable. `known_kind` is the caller's registry (an unknown kind cannot be confirmed, so it is dropped). */
export function parsePendingConfirmation(input: unknown, saved_revision: number, known_kind: (kind: string) => boolean): PendingConfirmation | undefined {
  if (!plainObject(input)) return undefined;
  const allowed = ["ref", "kind", "subject_id", "actor_id", "payload", "provenance", "created_revision", "status", "terminal_reason", "resolved_revision"];
  if (Object.keys(input).some(k => !allowed.includes(k))) return undefined;
  const r = input;
  if (typeof r.ref !== "string" || !PENDING_REF.test(r.ref) || typeof r.kind !== "string" || !KIND.test(r.kind) || !known_kind(r.kind)) return undefined;
  if (typeof r.subject_id !== "string" || !ID.test(r.subject_id) || typeof r.actor_id !== "string" || !ID.test(r.actor_id) || !validPayload(r.payload)) return undefined;
  const p = r.provenance;
  if (!plainObject(p) || Object.keys(p).some(k => !["source", "turn_key", "turn_id"].includes(k)) || (p.source !== "player_text" && p.source !== "operator" && p.source !== "test")) return undefined;
  if (p.turn_key !== undefined && (typeof p.turn_key !== "string" || !TURN_KEY.test(p.turn_key))) return undefined;
  if (p.turn_id !== undefined && (typeof p.turn_id !== "string" || !p.turn_id || p.turn_id.length > 200)) return undefined;
  // A record is created at a revision the saved state has reached: it was written with that state.
  if (!isRevision(r.created_revision) || r.created_revision > saved_revision) return undefined;
  const status = r.status;
  if (status !== "pending" && status !== "confirmed" && status !== "cancelled" && status !== "invalidated") return undefined;
  const provenance: PendingProvenance = { source: p.source, ...(p.turn_key ? { turn_key: p.turn_key as string } : {}), ...(p.turn_id ? { turn_id: p.turn_id as string } : {}) };
  const base = { ref: r.ref, kind: r.kind, subject_id: r.subject_id, actor_id: r.actor_id, payload: { ...r.payload } as PendingPayload, provenance, created_revision: r.created_revision };
  if (status === "pending") {
    if (r.terminal_reason !== undefined || r.resolved_revision !== undefined) return undefined;
    return { ...base, status };
  }
  if (typeof r.terminal_reason !== "string" || !REASON.test(r.terminal_reason)) return undefined;
  if (status === "confirmed") {
    // The confirming commit is in the same file as this record, so it cannot be ahead of the saved state, nor before the record's creation.
    if (!isRevision(r.resolved_revision) || r.resolved_revision > saved_revision || r.resolved_revision < r.created_revision) return undefined;
    return { ...base, status, terminal_reason: r.terminal_reason, resolved_revision: r.resolved_revision };
  }
  if (r.resolved_revision !== undefined) return undefined;
  return { ...base, status, terminal_reason: r.terminal_reason };
}
/** Keeps every active record and the newest `limit` terminal records, preserving order. */
export function boundTerminal(records: readonly PendingConfirmation[], limit = PENDING_TERMINAL_LIMIT): readonly PendingConfirmation[] {
  const terminal = records.filter(r => r.status !== "pending");
  const drop = new Set(terminal.slice(0, Math.max(0, terminal.length - limit)));
  return records.filter(r => !drop.has(r));
}
/**
 * Tolerant block parse: unknown shape → undefined; bad records, duplicate refs (the first wins), impossible states and unknown kinds are dropped;
 * at most PENDING_ACTIVE_PARSE_LIMIT active records and the newest PENDING_TERMINAL_LIMIT terminal records are kept.
 */
export function parseInteractionMetadata(input: unknown, saved_revision: number, known_kind: (kind: string) => boolean): InteractionMetadataBlock | undefined {
  if (input === undefined) return undefined;
  try {
    if (!plainObject(input) || input.authority !== "interaction_metadata" || Object.keys(input).some(k => !["authority", "pending_confirmations"].includes(k))) return undefined;
    if (!Array.isArray(input.pending_confirmations)) return undefined;
    const seen = new Set<string>(), records: PendingConfirmation[] = [];
    let active = 0;
    for (const raw of input.pending_confirmations as unknown[]) {
      const record = parsePendingConfirmation(raw, saved_revision, known_kind);
      if (!record || seen.has(record.ref)) continue;
      if (record.status === "pending" && ++active > PENDING_ACTIVE_PARSE_LIMIT) continue;
      seen.add(record.ref); records.push(record);
    }
    return { authority: "interaction_metadata", pending_confirmations: boundTerminal(records) };
  } catch { return undefined; }
}
