import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { TurnContext } from "./context-builder.js";
import { escapeRegExp } from "./language/text.js";
import type { NarrativeKnowledgeAccess } from "./narrative-authority.js";

export interface NarratorIdentity {
  readonly internal_id: string;
  readonly ref: string;
  readonly player_known_name: string | null;
  readonly observable_label: string;
  readonly observable_appearance: string | null;
  readonly player_known_aliases: readonly string[];
  readonly player_known_affiliations: readonly string[];
}
export interface NarratorIdentityGate {
  readonly identities: ReadonlyMap<string, NarratorIdentity>;
  /** Input projection only. NEVER applied to generated output, campaign truth or controller evidence. */
  mask(text: string): string;
  knowledge(access: NarrativeKnowledgeAccess): NarrativeKnowledgeAccess;
  /** Controlled public-name disclosure only; never serialized with ordinary identity fields. */
  selfDisclosureName(id: string): string | undefined;
}
const gates = new WeakMap<object, NarratorIdentityGate>();
/** Metadata kept outside TurnContext serialization: raw engine/controller context stays byte-compatible. */
export function registerNarratorIdentities(context: object, world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>): void {
  const known = new Set(snapshot.knowledge.filter(k => k.character_id === "nicco" && k.status === "knows").map(k => k.fact_id));
  const identities = new Map<string, NarratorIdentity>(), substitutions = new Map<string, string>();
  const idSubstitutions = new Map<string, string>();
  const characters = world.getEntitiesByType("character").filter(c => c.role === "npc");
  for (const [index, npc] of characters.entries()) {
    const knowsName = snapshot.facts.some(f => known.has(f.id) && f.content.kind === "canonical" && f.content.entity_id === npc.id && f.content.chunk_id === undefined);
    const label = `the unfamiliar ${npc.sex === "male" ? "man" : npc.sex === "female" ? "woman" : "person"} [NPC${index + 1}]`;
    idSubstitutions.set(npc.id, `NPC${index + 1}`);
    identities.set(npc.id, Object.freeze({ internal_id: npc.id, ref: `NPC${index + 1}`, player_known_name: knowsName ? npc.name : null, observable_label: label,
      observable_appearance: npc.appearance ?? null, player_known_aliases: [], player_known_affiliations: [] }));
    if (!knowsName) for (const name of [npc.name, npc.display_name]) if (name && name !== npc.id) substitutions.set(name, label);
    // Learning a name is not blanket disclosure of aliases, titles, affiliations or history.
    for (const alias of npc.aliases) if (alias && alias !== npc.name && alias !== npc.id) substitutions.set(alias, knowsName ? npc.name : label);
  }
  const names = [...substitutions.keys()].sort((a, b) => b.length - a.length);
  const nameLookup = new Map([...substitutions].map(([name, label]) => [name.toLowerCase(), label]));
  const pattern = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`, "giu") : undefined;
  // Also cover embedded name-derived handles/fact IDs. This map never enters narrator serialization.
  const ids = [...idSubstitutions.keys()].sort((a, b) => b.length - a.length);
  const idPattern = ids.length ? new RegExp(ids.map(escapeRegExp).join("|"), "g") : undefined;
  const mask = (text: string) => {
    const opaque = idPattern ? text.replace(idPattern, match => idSubstitutions.get(match)!) : text;
    return pattern ? opaque.replace(pattern, match => nameLookup.get(match.toLowerCase())!) : opaque;
  };
  gates.set(context, { identities, mask, selfDisclosureName: id => {
    const npc = characters.find(c => c.id === id);
    return npc?.knowledge?.visibility.narrator && npc.knowledge.visibility.player ? npc.name : undefined;
  }, knowledge: access => ({ ...access,
    facts: access.facts.map(f => ({ ...f, id: mask(f.id), text: mask(f.text), ...(f.holders ? { holders: f.holders.map(mask) } : {}) })),
    characters: access.characters.map(c => ({ ...c, character_id: mask(c.character_id), name: mask(c.name) })),
  }) });
}
export const narratorIdentityGate = (context: TurnContext): NarratorIdentityGate | undefined => gates.get(context);
