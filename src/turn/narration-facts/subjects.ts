import type { FactAmbiguity, FactEntityRef } from "./types.js";

/** Someone narration can refer to: a stable id, the names the prose may use, a declared sex (never inferred), and whether they are away from the scene. */
export interface Referent { readonly id: string; readonly names: readonly string[]; readonly sex?: "female" | "male"; readonly entrant?: true }

const wantedSex = (pronoun: string): "female" | "male" | undefined => /^(?:her|she|hers)$/i.test(pronoun) ? "female" : /^(?:him|he|his)$/i.test(pronoun) ? "male" : undefined;

/** The ambiguity a candidate list implies. */
export const ambiguityOf = (ids: readonly string[]): FactAmbiguity => ids.length === 1 ? "none" : ids.length === 0 ? "unresolved" : "ambiguous";

/** A name resolves only when exactly one referent answers to it. */
export function nameRef(pool: readonly Referent[], token: string): FactEntityRef {
  const hits = [...new Set(pool.filter(m => m.names.some(n => n.toLowerCase() === token.toLowerCase())).map(m => m.id))];
  return { surface: token, ...(hits.length === 1 ? { entity_id: hits[0]! } : {}), resolution: hits.length ? "name" : "unresolved", candidates: hits };
}
/** A pronoun resolves only when exactly one referent is compatible with it (two women: "she" resolves to nobody). */
export function pronounRef(pool: readonly Referent[], token: string): FactEntityRef {
  const want = wantedSex(token);
  if (!want) return { surface: token, resolution: "unresolved", candidates: [] };
  const fits = pool.filter(m => !m.sex || m.sex === want).map(m => m.id);
  return { surface: token, ...(fits.length === 1 ? { entity_id: fits[0]! } : {}), resolution: fits.length ? "pronoun" : "unresolved", candidates: fits };
}
/** The bounded antecedent (see movement.ts `boundedAntecedent`) when it is compatible with the pronoun. */
export function antecedentRef(token: string, antecedent: Referent): FactEntityRef {
  return { surface: token, entity_id: antecedent.id, resolution: "antecedent", candidates: [antecedent.id] };
}
export const unresolvedRef = (surface: string, candidates: readonly string[] = []): FactEntityRef => ({ surface, resolution: "unresolved", candidates });
export const playerRef = (surface: string): FactEntityRef => ({ surface, entity_id: "nicco", resolution: "player", candidates: ["nicco"] });

/** Ambiguity of a resolved reference. */
export const refAmbiguity = (ref: FactEntityRef): FactAmbiguity => ref.entity_id ? "none" : ref.candidates.length > 1 ? "ambiguous" : "unresolved";
