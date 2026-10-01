/**
 * Promotion Pass 1.1: `location_id` records the player location after the exchange (scene scoping for deterministic resolvers). It
 * is session metadata, never replayed to the narrator: forPrompt() strips it.
 */
export interface RecentExchange { readonly player: string; readonly narration: string; readonly status: "finalized" | "state_failed"; readonly location_id?: string }
/**
 * Runtime Continuity Repair 1: production window is 12 completed exchanges under a serialized-size budget. Eviction removes the
 * oldest complete exchanges first; an exchange is never cut and order never changes. Only player input and delivered (audited)
 * narration are stored: drafts, rejected revisions, audit output and controller debug never enter this history.
 */
export const RECENT_CONVERSATION_TURNS = 12;
/** Serialized budget (JSON of the retained exchanges). 12 ordinary turns (~1,200 characters each) fit; verbose ones evict early. */
export const RECENT_CONVERSATION_CHARACTERS = 16_000;
/** Ephemeral session continuity. Failed/partial exchanges are never replayed as facts. */
export class RecentConversation {
  #entries: RecentExchange[] = [];
  constructor(readonly max_turns = RECENT_CONVERSATION_TURNS, readonly max_characters = RECENT_CONVERSATION_CHARACTERS) {
    if (!Number.isSafeInteger(max_turns) || max_turns < 1 || max_turns > 20 || !Number.isSafeInteger(max_characters) || max_characters < 1 || max_characters > 20_000) throw new Error("Invalid recent-conversation bounds");
  }
  add(entry: RecentExchange): void {
    const record = Object.freeze({ player: entry.player, narration: entry.narration, status: entry.status, ...(entry.location_id ? { location_id: entry.location_id } : {}) });
    if (JSON.stringify([record]).length > this.max_characters) return;
    this.#entries.push(record);
    // The turn limit counts completed (finalized) exchanges only; a failed turn never takes a completed turn's place.
    const completed = () => this.#entries.filter(e => e.status === "finalized").length;
    while (completed() > this.max_turns || this.#entries.length > 2 * this.max_turns || this.serializedLength() > this.max_characters) this.#entries.shift();
  }
  entries(): readonly RecentExchange[] { return Object.freeze([...this.#entries]); }
  forPrompt(): readonly RecentExchange[] { return this.finalized().map(e => Object.freeze({ player: e.player, narration: e.narration, status: e.status })); }
  /** Finalized exchanges with their scene location (Promotion Pass 1.1 resolvers); never rendered into prompts. */
  finalized(): readonly RecentExchange[] { return this.entries().filter(e => e.status === "finalized"); }
  serializedLength(): number { return JSON.stringify(this.#entries).length; }
}
