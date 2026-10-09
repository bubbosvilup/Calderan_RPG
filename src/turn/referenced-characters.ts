import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { compareIds } from "../world/provenance.js";

/**
 * Permanent Inventory V1, absent-character grounding (Controller only). Known characters who are NOT present but are named in this
 * turn's player input or final narration ("Lord Pellan's signet ring"), so the controller can target them by stable ID (e.g. as an
 * item owner) instead of being unable to name them. This is ID grounding, never knowledge injection:
 *  - output is exactly { id, name }: no biography, location, relationships, inventory, secrets or profile;
 *  - candidates are publicly identifiable characters only: authored characters visible to narrator AND player, and campaign
 *    characters with an established name; narrator-only (secret) characters never resolve;
 *  - matching is deterministic: a full name/alias, or a distinctive single name token (titles excluded), as a capitalized word;
 *  - ambiguity never guesses: a phrase that fits more than one character maps to none of them.
 */
export interface ReferencedCharacter { readonly id: string; readonly name: string }
export const REFERENCED_CHARACTER_LIMIT = 8;
const TITLES = new Set(["lord", "lady", "sir", "dame", "duke", "duchess", "master", "mistress", "captain", "brother", "sister", "father", "mother", "the", "of", "high", "old", "young", "king", "queen", "prince", "princess", "emperor", "general"]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function referencedCharacters(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, presentIds: Iterable<string>, ...texts: readonly string[]): readonly ReferencedCharacter[] {
  const present = new Set(["nicco", ...presentIds]);
  const candidates: { id: string; name: string; names: string[] }[] = [];
  for (const e of world.getEntitiesByType("character")) {
    if (e.role !== "npc" || !e.knowledge?.visibility.narrator || !e.knowledge.visibility.player) continue;
    candidates.push({ id: e.id, name: e.name, names: [e.name, ...e.aliases] });
  }
  for (const c of snapshot.characters) {
    if (c.origin.kind !== "created" || !c.profile.name || candidates.some(x => x.id === c.id)) continue;
    candidates.push({ id: c.id, name: c.profile.name, names: [c.profile.name, ...(c.profile.aliases ?? [])] });
  }
  // Phrase -> every character it could denote (full names/aliases, and distinctive single tokens). Built over ALL candidates,
  // present ones included, so "Brenna" stays ambiguous if another Brenna exists even when one of them is present.
  const phrases = new Map<string, Set<string>>();
  const add = (phrase: string, id: string) => { const key = phrase.trim(); if (key.length < 3) return; (phrases.get(key) ?? phrases.set(key, new Set()).get(key)!).add(id); };
  for (const c of candidates) for (const n of c.names) {
    add(n, c.id);
    for (const t of n.split(/[\s_]+/)) if (/^[A-Z][\p{L}'’-]{2,}$/u.test(t) && !TITLES.has(t.toLowerCase())) add(t, c.id);
  }
  const text = texts.join("\n"), found = new Set<string>();
  for (const [phrase, ids] of phrases) {
    if (ids.size !== 1) continue; // ambiguous: never guess
    const id = [...ids][0]!;
    if (present.has(id) || found.has(id)) continue;
    if (new RegExp(`(?<![\\p{L}\\p{N}_])${esc(phrase)}(?:['’]s)?(?![\\p{L}\\p{N}_])`, "u").test(text)) found.add(id);
  }
  const byId = new Map(candidates.map(c => [c.id, c.name]));
  return Object.freeze([...found].sort(compareIds).slice(0, REFERENCED_CHARACTER_LIMIT).map(id => Object.freeze({ id, name: byId.get(id)! })));
}
