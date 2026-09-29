export interface RecentExchange { readonly player: string; readonly narration: string; readonly status: "finalized" | "state_failed" }
/** Ephemeral session continuity. Failed/partial exchanges are never replayed as facts. */
export class RecentConversation {
  #entries: RecentExchange[] = [];
  constructor(readonly max_turns = 4, readonly max_characters = 8000) {
    if (!Number.isSafeInteger(max_turns) || max_turns < 1 || max_turns > 20 || !Number.isSafeInteger(max_characters) || max_characters < 1 || max_characters > 20_000) throw new Error("Invalid recent-conversation bounds");
  }
  add(entry: RecentExchange): void {
    if (entry.player.length + entry.narration.length > this.max_characters) return;
    this.#entries.push(Object.freeze({ ...entry }));
    while (this.#entries.length > this.max_turns || JSON.stringify(this.#entries).length > this.max_characters) this.#entries.shift();
  }
  entries(): readonly RecentExchange[] { return Object.freeze([...this.#entries]); }
  forPrompt(): readonly RecentExchange[] { return this.entries().filter(e => e.status === "finalized"); }
}
