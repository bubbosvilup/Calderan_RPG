import { escapeRegExp } from "../language/text.js";
import type { TurnContext } from "../context/context-builder.js";
import type { WorldStore } from "../../world/world-store.js";

/**
 * B1 (CTX-1 part C): internal reference shapes in DELIVERED narration. Log only: nothing is redacted, revised or failed on a hit; the turn trace
 * records which shapes appeared so a leak is visible in diagnostics instead of silent.
 * - opaque prompt refs: NPC<n> (canonical identities), P<n> (scene participants, private canon), F<n> (campaign facts), R<n> (retrieved canon);
 * - scene-local keys: `narrated:<x>`, `other:<x>`;
 * - raw engine ids: snake_case tokens ("mistress_elara", "campaign_character_r3_woman"), and the exact lowercase id of a known character.
 */
const OPAQUE = /(?<![\p{L}\p{N}_])(?:NPC|P|F|R)\d+(?![\p{L}\p{N}_])/gu;
const SCENE_KEY = /(?<![\p{L}\p{N}_])(?:narrated|other):[\p{L}\p{N}_-]+/gu;
const SNAKE = /(?<![\p{L}\p{N}_])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\p{L}\p{N}_])/gu;
export interface LeakedRef { readonly kind: "opaque_ref" | "scene_key" | "raw_id"; readonly text: string }
export function leakedRefs(delivered: string, ids: readonly string[] = []): readonly LeakedRef[] {
  const out: LeakedRef[] = [], seen = new Set<string>();
  const add = (kind: LeakedRef["kind"], text: string) => { if (!seen.has(text)) { seen.add(text); out.push({ kind, text }); } };
  for (const m of delivered.matchAll(OPAQUE)) add("opaque_ref", m[0]);
  for (const m of delivered.matchAll(SCENE_KEY)) add("scene_key", m[0]);
  for (const m of delivered.matchAll(SNAKE)) add("raw_id", m[0]);
  const plain = [...new Set(ids.filter(id => /^[a-z][a-z0-9]*$/.test(id)))].sort((a, b) => b.length - a.length);
  if (plain.length) for (const m of delivered.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${plain.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`, "gu"))) add("raw_id", m[0]);
  return out.slice(0, 12);
}
/** The turn-trace field: `leaked_refs` only when a shape appeared, over the ids of the context's characters and every canonical character. */
export function leakedRefDiagnostic(delivered: string, context: TurnContext, world: WorldStore): { leaked_refs?: readonly LeakedRef[] } {
  const leaked = leakedRefs(delivered, [...context.characters.map(c => c.id), ...world.getEntitiesByType("character").map(e => e.id)]);
  return leaked.length ? { leaked_refs: leaked } : {};
}
