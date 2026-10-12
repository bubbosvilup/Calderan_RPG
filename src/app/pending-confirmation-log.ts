import { createHash } from "node:crypto";
import { boundTerminal, pendingEquivalenceKey, PENDING_ACTIVE_CREATE_LIMIT, PENDING_TERMINAL_LIMIT, type InteractionMetadataBlock, type PendingConfirmation, type PendingPayload, type PendingProvenance, type PendingStatus } from "../persistence/pending-confirmations.js";

export interface NewPendingConfirmation {
  readonly campaign_id: string; readonly kind: string; readonly subject_id: string; readonly actor_id: string; readonly payload: PendingPayload;
  readonly provenance: PendingProvenance; readonly created_revision: number;
}
/**
 * The session's pending-confirmation records. Pure bookkeeping, like the turn-receipt log: it holds records, answers lookups and says whether the
 * durable copy is behind (`unsaved`). Exporting for a save is synchronous so the block written with a snapshot is exactly the list at that moment.
 * Active records are never pruned; only the newest PENDING_TERMINAL_LIMIT terminal records are kept.
 */
export class PendingConfirmationLog {
  #records: PendingConfirmation[] = [];
  #version = 0; #saved = 0;
  constructor(initial: readonly PendingConfirmation[] = [], readonly terminal_limit = PENDING_TERMINAL_LIMIT) { this.#records = [...boundTerminal(initial, terminal_limit)]; }
  get size(): number { return this.#records.length; }
  list(): readonly PendingConfirmation[] { return [...this.#records]; }
  active(): readonly PendingConfirmation[] { return this.#records.filter(r => r.status === "pending"); }
  find(ref: string): PendingConfirmation | undefined { return this.#records.find(r => r.ref === ref); }
  /** An ACTIVE record that already stands for this exact interpretation. */
  findActiveEquivalent(kind: string, subject_id: string, payload: PendingPayload): PendingConfirmation | undefined {
    const key = pendingEquivalenceKey(kind, subject_id, payload);
    return this.active().find(r => pendingEquivalenceKey(r.kind, r.subject_id, r.payload) === key);
  }
  /** Creates an active record; undefined when the active ceiling is reached (the interpretation is then simply not offered). */
  create(input: NewPendingConfirmation): PendingConfirmation | undefined {
    if (this.active().length >= PENDING_ACTIVE_CREATE_LIMIT) return undefined;
    let ref = "", n = 0;
    do { ref = createHash("sha256").update(`${input.campaign_id}|${input.kind}|${input.subject_id}|${input.created_revision}|${input.provenance.turn_key ?? ""}|${n++}`).digest("hex").slice(0, 24); } while (this.find(ref));
    const record: PendingConfirmation = { ref, kind: input.kind, subject_id: input.subject_id, actor_id: input.actor_id, payload: { ...input.payload }, provenance: { ...input.provenance },
      created_revision: input.created_revision, status: "pending" };
    this.#records.push(record); this.#version++;
    return record;
  }
  /** pending → terminal, exactly once. Anything else (unknown ref, already terminal) changes nothing and returns undefined. */
  resolve(ref: string, status: Exclude<PendingStatus, "pending">, terminal_reason: string, resolved_revision?: number): PendingConfirmation | undefined {
    const i = this.#records.findIndex(r => r.ref === ref);
    const current = this.#records[i];
    if (!current || current.status !== "pending") return undefined;
    const next: PendingConfirmation = { ...current, status, terminal_reason, ...(status === "confirmed" && resolved_revision !== undefined ? { resolved_revision } : {}) };
    this.#records[i] = next;
    this.#records = [...boundTerminal(this.#records, this.terminal_limit)];
    this.#version++;
    return next;
  }
  /** Records not yet in a successful save (creating or ending one changes no revision, so autosave needs this to notice them). */
  get unsaved(): boolean { return this.#version !== this.#saved; }
  export(): { readonly block: InteractionMetadataBlock | undefined; readonly token: number } {
    return { block: this.#records.length ? { authority: "interaction_metadata", pending_confirmations: this.#records.map(r => ({ ...r })) } : undefined, token: this.#version };
  }
  /** Called after a save exported with `token` succeeded: only changes made before that export are now durable. */
  saved(token: number): void { if (token > this.#saved) this.#saved = token; }
}
