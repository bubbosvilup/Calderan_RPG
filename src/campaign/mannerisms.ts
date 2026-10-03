import type { CampaignSnapshot, CharacterMannerism, MannerismDefinition, PremiumCharacterState } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { dataSchema, fail, validateId } from "./validation.js";
import { characterView } from "./projections.js";
import { compareIds } from "../world/provenance.js";
import { MANNERISM_SEEDS, reviewMannerismSeeds, type MannerismSeed } from "./mannerism-seeds.js";

export const MANNERISM_LIMITS = Object.freeze({ slots: 4, text: 160 });
/** Pass 2 supplies candidates only AFTER evidence and semantic duplicate review; no detector/thresholds in Pass 1. */
export interface ValidatedMannerismCandidate extends MannerismDefinition { semantic_duplicate_check: "passed" }
export interface MannerismObservation { character_id: string; text: string; evidence_ref: string; revision: number }
export type MannerismUserChange =
  | { kind: "add"; expected_revision: number; character_id: string; definition: MannerismDefinition }
  | { kind: "edit"; expected_revision: number; character_id: string; id: string; definition: MannerismDefinition }
  | { kind: "delete"; expected_revision: number; character_id: string; id: string };
const { object, text, integer, optional, choice } = dataSchema;
const definition = object({ canonical_key: validateId, text, requires_item_id: optional(validateId), requires_entity_id: optional(validateId) });
const base = { expected_revision: integer(0), character_id: validateId };
const parsers = { add: object({ kind: choice("add"), ...base, definition }), edit: object({ kind: choice("edit"), ...base, id: validateId, definition }), delete: object({ kind: choice("delete"), ...base, id: validateId }) };
export function parseMannerismUserChange(input: unknown, kind?: MannerismUserChange["kind"]): MannerismUserChange {
  if (kind !== undefined) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.hasOwn(input, "kind")) fail("mannerism", "expected manual input without kind");
    // Preserve descriptors until strict parsing: adding the tag must never invoke an input getter.
    input = Object.create(Object.getPrototypeOf(input), { ...Object.getOwnPropertyDescriptors(input), kind: { value: kind, enumerable: true } });
  }
  const d = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "kind") : undefined;
  if (!d || !("value" in d) || typeof d.value !== "string" || !Object.hasOwn(parsers, d.value)) fail("mannerism", "invalid manual change");
  return parsers[d.value as keyof typeof parsers](input, "mannerism") as MannerismUserChange;
}
/** Authoritative equivalent of the global registry. Includes inactive NPC+; it is never copied into narrator context. */
export function mannerismOwners(s: DeepReadonly<Pick<CampaignSnapshot, "premium_characters">>): ReadonlyMap<string, string> {
  return new Map(s.premium_characters.flatMap(p => (p.mannerisms ?? []).map(m => [m.canonical_key, p.character_id] as const)));
}
const forbiddenInference = /\b(?:personality|morality|values?|distrust\w*|protective|vulnerability|affection|psycholog\w*|loyal\w*|motiv\w*|ideolog\w*|abandonment|sexual\w*|sex|kink\w*|consent\w*|willing\w*|attract\w*|submiss\w*|dominan\w*|dominat\w*|availability|arous\w*|desire\w*|seduc\w*|fetish\w*|romance|romantic|trusts?|fears?|believes?|feels?)\b/i;
const unsupportedHistory = /\b(?:gift|mother|father|sister|brother|family|scar\w*|injur\w*|wound\w*|illness|profession|occupation|guild|prayer|rosary|childhood|past|used to|always been)\b/i;
const objectWords = /\b(?:doll|ring|jewel\w*|bracelet|necklace|weapon\w*|sword|knife|book\w*|tool\w*|pet|uniform|sleeve\w*|clothes|clothing)\b/gi;
const observable = /\b(?:gaze|glances?|looks?|eyes?|brows?|eyebrows?|lips?|mouth|jaw|nose|cheeks?|head|chin|ear|shoulders?|hands?|palms?|fingers?|fingertips?|thumb|knuckles?|wrist|elbows?|feet|foot|heel|toe|posture|nods?|shakes?|blinks?|shrugs?|pauses?|silence|still|stops?|beats?|speaks?|voice|word|sentence|cadence|vowel|syllable|phrase|steps?|wave|breathes?|sigh|leans?|grips?|clasps?|clutches?|smooths?|taps?)\b/i;
export function validateMannerismDefinition(d: DeepReadonly<MannerismDefinition>): void {
  validateId(d.canonical_key, "mannerism.canonical_key");
  if (!d.text.trim() || d.text !== d.text.trim() || d.text.length > MANNERISM_LIMITS.text || /[\r\n\x00-\x1f]/.test(d.text)) fail("mannerism.text", "one short observable cue required");
  if (forbiddenInference.test(d.text) || unsupportedHistory.test(d.text) || !observable.test(d.text)) fail("mannerism.text", "unsupported inference or non-observable cue");
  if ([...d.text.matchAll(objectWords)].length && !d.requires_item_id) fail("mannerism.requires_item_id", "object-dependent cue needs a registered item prerequisite");
  if (d.requires_item_id) validateId(d.requires_item_id);
  if (d.requires_entity_id) validateId(d.requires_entity_id);
  const seed = MANNERISM_SEEDS.find(s => s.text.toLowerCase() === d.text.toLowerCase());
  if (seed && seed.canonical_key !== d.canonical_key) fail("mannerism.canonical_key", "curated wording must retain its concept key");
}
/** Check activation, not historical storage: losing access suppresses the cue without deleting or fabricating anything. */
export function mannerismAvailable(d: DeepReadonly<MannerismDefinition>, character_id: string, s: DeepReadonly<CampaignSnapshot>, world: WorldStore): boolean {
  const entity = world.getEntity(character_id), overlay = s.characters.find(c => c.id === character_id);
  const constraints = `${entity?.type === "character" ? entity.traits.join(" ") : ""} ${overlay?.profile.voice ?? ""}`;
  if (/silent|does not speak|cannot speak|mute/i.test(constraints) && /\b(?:speaks?|speaking|voice|word|sentence|reply|replying|saying|stating|spoken|question|answer|answering|quoting|repeating|restarts?|restarting|explanation|clarifying|disagreeing|refusing|refusal|request|greeting|farewell|agreement)\b/i.test(d.text)) return false;
  if (characterView(s, world, character_id).current.status === "dead") return false;
  if (d.requires_item_id) {
    const item = s.items.find(i => i.id === d.requires_item_id);
    if (!item || item.owner_id !== character_id || !(item.position.kind === "carried" || item.position.kind === "equipped") || item.position.character_id !== character_id) return false;
    if (item.origin.kind === "canonical") {
      const visibility = world.getEntity(item.id)?.knowledge?.visibility;
      if (!visibility?.narrator || !visibility.player) return false;
    }
    const name = item.name ?? (item.origin.kind === "canonical" ? world.getEntity(item.id)?.name : "") ?? "";
    if ([...d.text.matchAll(objectWords)].some(w => !name.toLowerCase().includes(w[0].toLowerCase()))) return false;
  }
  if (d.requires_entity_id) {
    const required = world.getEntity(d.requires_entity_id);
    if (!required || !required.knowledge?.visibility.narrator || !required.knowledge.visibility.player) return false;
    const location = characterView(s, world, character_id).current.current_location;
    if (required.type === "location") { if (location !== required.id) return false; }
    else if (required.type === "character") { if (!location || characterView(s, world, required.id).current.current_location !== location) return false; }
    else return false; // items use registered possession above; no inferred access to arbitrary lore/entities.
  }
  return true;
}
function assertFree(s: DeepReadonly<CampaignSnapshot>, d: DeepReadonly<MannerismDefinition>, exceptId?: string): void {
  for (const p of s.premium_characters) for (const m of p.mannerisms ?? []) if (m.id !== exceptId && (m.canonical_key === d.canonical_key || m.text.toLowerCase() === d.text.toLowerCase())) fail("mannerism.canonical_key", "concept already owned in this campaign");
}
/** Stable pseudo-random ordering. Campaign identity varies casts; preparation retries/replays never consume randomness. */
function seedRank(campaignId: string, characterId: string, key: string): number {
  let hash = 2166136261;
  for (const ch of `${campaignId}\0${characterId}\0${key}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
function entry(d: MannerismDefinition, s: CampaignSnapshot, revision: number, source: CharacterMannerism["source"]): CharacterMannerism {
  const ordinal = s.premium_characters.reduce((n, p) => n + (p.mannerisms ?? []).length, 0);
  return { ...d, id: `mannerism_r${revision}_n${ordinal}`, source, created_revision: revision, user_edited: false };
}
/** Promotion seam. Candidate supplied only by future validated promotion tooling; no candidate acquisition runs here. */
export function assignInitialMannerism(s: CampaignSnapshot, world: WorldStore, p: PremiumCharacterState, options: { candidate?: ValidatedMannerismCandidate; seeds?: readonly Readonly<MannerismSeed>[] } = {}): void {
  if (p.metadata.initial_mannerism !== undefined || (p.mannerisms ?? []).length) return;
  const owners = mannerismOwners(s), available = (d: MannerismDefinition) => !owners.has(d.canonical_key) && mannerismAvailable(d, p.character_id, s, world);
  const candidate = options.candidate;
  if (candidate) {
    const { semantic_duplicate_check, ...d } = candidate;
    validateMannerismDefinition(d);
    if (semantic_duplicate_check !== "passed") fail("mannerism", "candidate needs semantic duplicate review");
    if (available(d)) { assertFree(s, d); p.mannerisms = [entry(d, s, s.revision + 1, "emergent")]; p.metadata.initial_mannerism = "candidate"; return; }
  }
  const seeds = options.seeds ?? MANNERISM_SEEDS, review = reviewMannerismSeeds(seeds);
  if (review.rejected_unsafe_seeds.length || review.duplicate_canonical_keys.length) fail("mannerism.seeds", "unsafe seed library");
  const seed = [...seeds].filter(available).sort((a, b) => seedRank(s.campaign_id, p.character_id, a.canonical_key) - seedRank(s.campaign_id, p.character_id, b.canonical_key) || compareIds(a.canonical_key, b.canonical_key))[0];
  if (!seed) { p.mannerisms = []; p.metadata.initial_mannerism = "seed_pool_exhausted"; return; }
  const { category: _category, ...d } = seed;
  validateMannerismDefinition(d); assertFree(s, d);
  p.mannerisms = [entry(d, s, s.revision + 1, "seeded")]; p.metadata.initial_mannerism = "seeded";
}
/** Manual authority only. Not a CampaignCommand and absent from controller/reflection schemas. */
export function applyMannerismUserChange(s: CampaignSnapshot, world: WorldStore, change: MannerismUserChange): void {
  const p = s.premium_characters.find(p => p.character_id === change.character_id);
  if (!p) fail("mannerism.character_id", "only an NPC+ owns mannerisms");
  const rows = p.mannerisms ?? [], existing = change.kind === "add" ? undefined : rows.find(m => m.id === change.id);
  if (change.kind !== "add" && !existing) fail("mannerism.id", "unknown mannerism");
  if (change.kind === "delete") p.mannerisms = rows.filter(m => m !== existing);
  else {
    const d = change.definition; validateMannerismDefinition(d); assertFree(s, d, existing?.id);
    if (!mannerismAvailable(d, p.character_id, s, world)) fail("mannerism.prerequisite", "unavailable or contradicted prerequisite");
    if (change.kind === "add") {
      if (rows.length >= MANNERISM_LIMITS.slots) fail("mannerism.slots", "maximum four; no automatic replacement");
      p.mannerisms = [...rows, entry(d, s, s.revision + 1, "user")];
    } else p.mannerisms = rows.map(m => m === existing ? { ...d, id: m.id, source: m.source, created_revision: m.created_revision, user_edited: true } : m);
  }
  p.metadata.last_updated_revision = s.revision + 1;
}
export function validateMannerismRegistry(s: CampaignSnapshot): void {
  const keys = new Set<string>(), ids = new Set<string>(), texts = new Set<string>();
  for (const p of s.premium_characters) for (const m of p.mannerisms ?? []) {
    validateMannerismDefinition(m);
    if ((p.mannerisms ?? []).length > MANNERISM_LIMITS.slots || keys.has(m.canonical_key) || ids.has(m.id) || texts.has(m.text.toLowerCase())) fail("mannerisms", "duplicate ownership or full slots");
    keys.add(m.canonical_key); ids.add(m.id); texts.add(m.text.toLowerCase());
    if (m.created_revision < p.metadata.created_revision || m.created_revision > p.metadata.last_updated_revision || m.created_revision > s.revision) fail("mannerism.created_revision", "invalid creation revision");
    if (m.source === "seeded" && !m.user_edited) {
      const seed = MANNERISM_SEEDS.find(d => d.canonical_key === m.canonical_key);
      if (!seed || seed.text !== m.text || m.requires_item_id || m.requires_entity_id) fail("mannerism", "unmodified seed must match the curated concept");
    }
  }
}
