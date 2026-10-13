import type { WorldStore } from "../../world/world-store.js";
import type { TurnContext } from "../context-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import { type NarrationFactScope, extractInputCommerceFacts, extractNarrationFacts, extractQuoteCommerceFacts } from "./extract.js";
import { type ReadOptions, type SceneReading, readScene } from "./scene-identity.js";
import type { CommerceFact, NarrationFacts } from "./types.js";

/**
 * One extraction per candidate text. Authorization and audit both ask the SAME source, so they read the very same facts (the same object)
 * for the draft; a reconciliation revision is a different text and gets its own single extraction.
 */
export interface NarrationFactSource {
  readonly scope: NarrationFactScope;
  of(narration: string): NarrationFacts;
  /** The commerce facts of the player's own input (every figure there is a player counter). Memoized per text. */
  input(text: string): readonly CommerceFact[];
  /** The commerce facts of a verbatim quote of a candidate text, read against the goods words the quote is about. Memoized per (quote, words). */
  quote(quote: string, subjects: readonly string[]): readonly CommerceFact[];
  /**
   * The SCENE reading (Block 11) of the current scene's exchanges: narrated people, captives, name introductions and late namings, built on the same
   * dialogue units and identity forms as `of()`. Person offers, name establishment, the partner identity guard and the audit's negotiation check all
   * read this one reading; it is memoized per (exchanges, people of `context`, options). The player's name question comes from the scope.
   */
  scene(recent: readonly RecentExchange[], context: TurnContext, world: WorldStore, options?: ReadOptions): SceneReading;
}

const sceneKey = (recent: readonly RecentExchange[], context: TurnContext, options: ReadOptions) => JSON.stringify([
  recent.map(e => [e.player, e.narration, e.status, e.location_id ?? null, e.conversation_partner_id ?? null]), context.primary.scene.player_location?.id ?? null,
  context.characters.map(c => [c.id, c.profile.name ?? null, c.profile.sex ?? null, "unnamed_label" in c ? c.unnamed_label ?? null : null, "pronoun" in c ? c.pronoun ?? null : null, c.established_origin?.descriptor ?? null]),
  [...options.unheld ?? []].sort(), [...options.campaign_names ?? []].sort(), !!options.rpg_speech]);

export function createFactSource(scope: NarrationFactScope): NarrationFactSource {
  const memo = new Map<string, NarrationFacts>();
  const typed = new Map<string, readonly CommerceFact[]>(), quoted = new Map<string, readonly CommerceFact[]>(), scenes = new Map<string, SceneReading>();
  return { scope, of: narration => { let facts = memo.get(narration); if (!facts) { facts = extractNarrationFacts(narration, scope); memo.set(narration, facts); } return facts; },
    quote: (quote, subjects) => { const key = `${subjects.join("|")}\u0000${quote}`; let facts = quoted.get(key); if (!facts) { facts = extractQuoteCommerceFacts(quote, scope, subjects); quoted.set(key, facts); } return facts; },
    input: text => { let facts = typed.get(text); if (!facts) { facts = extractInputCommerceFacts(text); typed.set(text, facts); } return facts; },
    scene: (recent, context, world, options = {}) => {
      const key = sceneKey(recent, context, options);
      let reading = scenes.get(key);
      if (!reading) { reading = readScene(recent, context, world, { ...(scope.asks_name ? { asks_name: scope.asks_name } : {}), ...options }); scenes.set(key, reading); }
      return reading;
    } };
}
