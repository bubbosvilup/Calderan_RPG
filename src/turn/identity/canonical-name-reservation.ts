import type { WorldStore } from "../../world/world-store.js";
import { reservedForAnotherIdentity } from "../../world/canonical-names.js";
import type { IdentityFact } from "../narration-facts/index.js";
import { escapeRegExp } from "../language/text.js";

/**
 * Reserved canonical handles, applied to a name narration established (REPO-12 policy decision, see world/canonical-names.ts). One rule, three lanes:
 * name establishment (the provisional reading, and late naming on a persistent record), Keep track (refused), and the person Actual Offer (AUD-1, user
 * decision 2026-10-14: the offer stands, the person is materialized WITHOUT the reserved handle, masked out of every recorded string).
 *
 * A name is checked as itself and as every whole name the identity facts gave it under: "My name is Doran Hale" establishes the token "Doran" but
 * claims the canonical alias "Doran Hale". The handles come from the shared NarrationFacts identity facts, never from the prose.
 */
export function claimedHandles(identity: readonly IdentityFact[], name: string): readonly string[] {
  return [name, ...identity.flatMap(f => f.kind === "self_introduction" && f.name === name && f.full_name ? [f.full_name] : [])];
}
/** True when narration gave `name` as (or as part of) an exact canonical name or alias of an identity other than `self`. */
export function claimsReservedHandle(world: WorldStore, identity: readonly IdentityFact[], name: string, self?: string): boolean {
  return claimedHandles(identity, name).some(handle => reservedForAnotherIdentity(world, handle, self));
}
/**
 * What a person Actual Offer withholds from the record (AUD-1). `handles`: the reserved canonical names or aliases narration claimed FOR this person
 * (their own self-introductions and the name disclosures about them). `spans`: the claim texts themselves ("My name is Doran Hale,"), where the
 * handles are masked. `names`: the person's established name when it is withheld ("Doran" of "Doran Hale") with its whole names; those are masked as
 * words everywhere, since every use of a withheld name denotes this person. A reserved handle voiced in other text (the real Korvin leading the way)
 * is never masked, and lowercase ids and scene refs are never touched.
 */
export interface WithheldNames { readonly handles: readonly string[]; readonly spans: readonly string[]; readonly names: readonly string[] }
export const NOTHING_WITHHELD: WithheldNames = Object.freeze({ handles: [], spans: [], names: [] });
const longestFirst = (xs: Iterable<string>) => [...new Set(xs)].sort((a, b) => b.length - a.length);
export function reservedClaims(world: WorldStore, identity: readonly IdentityFact[], person: { readonly name?: string; readonly keys: readonly string[] }, self?: string): WithheldNames {
  const theirs = (id: string | undefined, name: string) => (!!id && person.keys.includes(id)) || name === person.name;
  const claims = identity.flatMap(f => f.kind === "self_introduction" && theirs(f.subject.entity_id, f.name) ? [{ text: f.source_text, handles: [f.name, ...(f.full_name ? [f.full_name] : [])] }]
    : f.kind === "name_disclosure" && theirs(f.named.entity_id, f.name) ? [{ text: f.source_text, handles: [f.name] }] : []);
  const reserved = claims.flatMap(c => c.handles.filter(h => reservedForAnotherIdentity(world, h, self)).length ? [{ ...c, reserved: c.handles }] : []);
  const name = person.name && claimsReservedHandle(world, identity, person.name, self) ? person.name : undefined;
  if (!reserved.length && !name) return NOTHING_WITHHELD;
  const names = name ? longestFirst([name, ...claimedHandles(identity, name)]) : [];
  return { handles: longestFirst([...reserved.flatMap(c => c.reserved), ...names]), spans: longestFirst(reserved.map(c => c.text)), names };
}
export const mergeWithheld = (...all: readonly WithheldNames[]): WithheldNames => all.every(w => !w.handles.length) ? NOTHING_WITHHELD
  : { handles: longestFirst(all.flatMap(w => w.handles)), spans: longestFirst(all.flatMap(w => w.spans)), names: longestFirst(all.flatMap(w => w.names)) };
export const WITHHELD_NAME = "[name withheld]";
const words = (text: string, handles: readonly string[]) =>
  handles.reduce((t, h) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(h)}(?![\\p{L}\\p{N}])`, "gu"), WITHHELD_NAME), text);
/** Masks the claim spans (inside them, every reserved handle) and the withheld names as exact-case whole words. */
export function maskWithheld(text: string, w: WithheldNames): string {
  const spans = w.spans.reduce((t, span) => t.split(span).join(words(span, w.handles)), text);
  return words(spans, w.names);
}
/** Every string inside a command payload, masked. Identity when nothing is withheld. */
export function maskDeep<T>(value: T, w: WithheldNames): T {
  if (!w.handles.length) return value;
  if (typeof value === "string") return maskWithheld(value, w) as T;
  if (Array.isArray(value)) return value.map(v => maskDeep(v, w)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v, w)])) as T;
  return value;
}
