import { createHash } from "node:crypto";
import { TURN_KEY, TURN_RECEIPT_LIMIT, type TurnReceipt, type TurnReceiptBlock } from "../persistence/turn-receipts.js";

/** Block 4 (REV-2): the request fingerprint — what "the same request" means for a turn_key. The key itself is never inferred from text. */
export function turnFingerprint(text: string, expected_revision: number | undefined): string {
  return createHash("sha256").update(JSON.stringify([text, expected_revision ?? null])).digest("hex");
}
export const validTurnKey = (key: unknown): key is string => typeof key === "string" && TURN_KEY.test(key);

/**
 * The session's bounded terminal-receipt window. Pure bookkeeping: it holds receipts, answers lookups and says whether the durable copy is
 * behind (`pending`). Exporting for a save is synchronous so the block written with a snapshot is exactly the window at the snapshot's moment.
 */
export class TurnReceiptLog {
  #receipts: TurnReceipt[] = [];
  #version = 0; #saved = 0;
  constructor(initial: readonly TurnReceipt[] = [], readonly limit = TURN_RECEIPT_LIMIT) { this.#receipts = initial.slice(-limit); }
  get size(): number { return this.#receipts.length; }
  find(turn_key: string): TurnReceipt | undefined { return this.#receipts.find(r => r.turn_key === turn_key); }
  /** Idempotent per key: the first terminal result of a key is the result forever (within the window). */
  record(receipt: TurnReceipt): void {
    if (this.find(receipt.turn_key)) return;
    this.#receipts.push(receipt);
    while (this.#receipts.length > this.limit) this.#receipts.shift();
    this.#version++;
  }
  /** Receipts not yet in a successful save (a failed turn changes no revision, so autosave needs this to notice them). */
  get pending(): boolean { return this.#version !== this.#saved; }
  export(): { readonly block: TurnReceiptBlock | undefined; readonly token: number } {
    return { block: this.#receipts.length ? { authority: "idempotency_metadata", receipts: [...this.#receipts] } : undefined, token: this.#version };
  }
  /** Called after a save that was exported with `token` succeeded: only receipts recorded before that export are now durable. */
  saved(token: number): void { if (token > this.#saved) this.#saved = token; }
}
