import type { CampaignProposal, CampaignSnapshot } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { MANNERISM_ACTIONS, MANNERISM_TRIGGERS } from "./mannerism-concepts.js";
import {STORED_REFLECTION_SCHEMA,schemaMatches} from './reflection-proposal-schema.js';

export class CampaignValidationError extends Error {
  constructor(readonly field: string, reason: string) { super(`${field}: ${reason}`); this.name = "CampaignValidationError"; }
}
export function fail(field: string, reason: string): never { throw new CampaignValidationError(field, reason); }
type Parser = (input: unknown, path: string) => unknown;
type Rule = Parser | { optional: Parser };
const optional = (parser: Parser): Rule => ({ optional: parser });
const object = (rules: Record<string, Rule>): Parser => (input, path) => {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail(path, "expected a plain data object");
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !Object.hasOwn(rules, key)) fail(path, "unknown field");
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!("value" in descriptor)) fail(`${path}.${key}`, "accessors are forbidden");
    const rule = rules[key]!;
    result[key] = (typeof rule === "function" ? rule : rule.optional)(descriptor.value, `${path}.${key}`);
  }
  for (const [key, rule] of Object.entries(rules)) if (typeof rule === "function" && !Object.hasOwn(result, key)) fail(`${path}.${key}`, "required field");
  // Fixed schema order makes equivalent object property order a no-op.
  return Object.fromEntries(Object.keys(rules).filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]));
};
const list = (parser: Parser, max = 256): Parser => (input, path) => {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > max) fail(path, "expected a bounded plain array");
  for (const key of Reflect.ownKeys(input)) if (key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) fail(path, "unknown array field");
  return Array.from({ length: input.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !("value" in d)) fail(path, "array holes/accessors are forbidden");
    return parser(d.value, `${path}[${i}]`);
  });
};
const text: Parser = (input, path) => {
  if (typeof input !== "string" || !input.trim() || input.length > 8000) fail(path, "expected nonempty text, at most 8000 characters");
  return input;
};
export function validateId(input: unknown, path = "id"): string {
  if (typeof input !== "string" || input.length > 120 || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(input)) fail(path, "expected bounded lowercase snake_case ID");
  return input;
}
const id: Parser = validateId;
const integer = (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): Parser => (input, path) => {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < min || input > max) fail(path, "integer outside permitted range");
  return input === 0 ? 0 : input;
};
const measurement: Parser = (input, path) => {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0 || input > Number.MAX_SAFE_INTEGER) fail(path, "expected a finite positive measurement");
  return input;
};
const choice = (...values: readonly string[]): Parser => (input, path) => {
  if (typeof input !== "string" || !values.includes(input)) fail(path, "invalid enum value"); return input;
};
const nullable = (parser: Parser): Parser => (input, path) => input === null ? null : parser(input, path);
const distinct = (parser: Parser): Parser => (input, path) => {
  const values = list(parser)(input, path) as unknown[];
  if (new Set(values).size !== values.length) fail(path, "duplicate value"); return values;
};
const tagged = (variants: Record<string, Parser>, discriminant = "kind"): Parser => (input, path) => {
  if (!input || typeof input !== "object") fail(path, "expected tagged data object");
  const d = Object.getOwnPropertyDescriptor(input, discriminant);
  if (!d || !("value" in d) || typeof d.value !== "string" || !Object.hasOwn(variants, d.value)) fail(path, "invalid kind");
  return variants[d.value]!(input, path);
};
const origin = tagged({ canonical: object({ kind: choice("canonical"), canonical_entity_id: id }), created: object({ kind: choice("created") }) });
const appearance = object({ height_cm: optional(measurement), weight_kg: optional(measurement), build: optional(text),
  hair: optional(object({ color: optional(text), texture: optional(text), description: optional(text) })), eyes: optional(text), skin: optional(text),
  scars: optional(list(object({ location: optional(text), description: text }))), distinguishing_marks: optional(distinct(text)), distinctive_traits: optional(distinct(text)), description: optional(text) });
const profile = object({ name: optional(text), aliases: optional(distinct(text)), age: optional(tagged({ exact: object({ kind: choice("exact"), years: integer(0) }), approximate: object({ kind: choice("approximate"), description: text }) })),
  sex: optional(text), gender: optional(text), species: optional(text), appearance: optional(appearance), voice: optional(text),
  name_source: optional(choice("self_disclosed", "narrator_introduced", "introduced_by_other")) });
const current = object({ current_location: optional(id), status: optional(choice("active", "inactive", "dead")), conditions: optional(distinct(text)), presentation: optional(text), empty_slots: optional(distinct(id)) });
const position = tagged({ unknown: object({ kind: choice("unknown") }), carried: object({ kind: choice("carried"), character_id: id }),
  equipped: object({ kind: choice("equipped"), character_id: id, slot: id, mode: choice("worn", "held") }), stored: object({ kind: choice("stored"), location_id: id }) });
const acquisition = object({ acquired_at: optional(integer()), acquisition_kind: optional(choice("gift", "purchase", "loot", "found", "created")), from_character_id: optional(id), event_id: optional(id) });
const provenance = object({ learned_at: optional(integer()), source_character_id: optional(id), source_event_id: optional(id), acquisition_kind: optional(choice("witnessed", "told", "inferred", "rumor")) });
const target = object({ kind: choice("canonical", "character", "item", "event"), id });
const goalStatus = choice("active", "completed", "abandoned", "failed"), eventStatus = choice("scheduled", "triggered", "completed", "cancelled");
const claim = object({ text, source: choice("narration", "seller", "self", "other"), by: optional(text) });
// Portrait Image Generation V1: derived-media metadata. File names are store-generated tokens, never paths.
const pattern = (re: RegExp, what: string): Parser => (input, path) => { if (typeof input !== "string" || !re.test(input)) fail(path, `expected ${what}`); return input; };
const portraitMedia = choice("image/png", "image/jpeg", "image/webp");
const isoTime = pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, "an ISO UTC timestamp");
const promptText: Parser = (input, path) => { if (typeof input !== "string" || !input.trim() || input.length > 4000) fail(path, "expected a prompt of at most 4000 characters"); return input; };
const costUsd: Parser = (input, path) => { if (typeof input !== "number" || !Number.isFinite(input) || input < 0 || input > 1000) fail(path, "expected a non-negative cost"); return input; };
const portraitVersion = object({ version_id: id, prompt_version: pattern(/^[a-z0-9-]{1,40}$/, "a prompt version"), prompt_fingerprint: pattern(/^[0-9a-f]{16}$/, "a 16-hex fingerprint"),
  model: pattern(/^[a-z0-9][a-z0-9._:/-]{0,159}$/i, "a model slug"), created_at: isoTime, media_type: portraitMedia,
  asset_file: pattern(/^portrait_[a-z0-9_]{1,80}\.(?:png|jpg|webp)$/, "a portrait asset file name"), cost_usd: optional(costUsd), reference_used: optional((input: unknown, path: string) => { if (input !== true) fail(path, "expected true"); return input; }),
  // Image generation v1 (optional, additive; absent on older versions).
  kind: optional(choice("avatar", "fullbody")), pose: optional(pattern(/^[a-z][a-z0-9_]{0,39}$/, "a pose id")), prompt: optional(promptText),
  seed: optional(integer(0)), provider_seed: optional(integer(0)), provider: optional(pattern(/^[a-z0-9][a-z0-9._-]{0,59}$/i, "a provider slug")),
  style_id: optional(pattern(/^[a-z0-9][a-z0-9._:/-]{0,159}$/i, "a style adapter id")), width: optional(integer(64, 8192)), height: optional(integer(64, 8192)), billable_units: optional(costUsd) });
const portraitReference = object({ media_type: portraitMedia, asset_file: pattern(/^reference_[a-z0-9_]{1,80}\.(?:png|jpg|webp)$/, "a reference asset file name"), uploaded_at: isoTime });
/**
 * Portrait Gallery V2 record. V1 saves carry `active_version_id` (the portrait they display): it decodes as `avatar_version_id` and is
 * never emitted again. Full Body is never derived from it. A record naming both legacy and V2 avatars must agree.
 */
const portraitRecordFields = object({ character_id: id, active_version_id: optional(id), avatar_version_id: optional(id), full_body_version_id: optional(id),
  versions: list(portraitVersion, 64), reference: optional(portraitReference) });
const portraitRecord: Parser = (input, path) => {
  const { active_version_id: legacy, ...record } = portraitRecordFields(input, path) as Record<string, unknown> & { active_version_id?: string; avatar_version_id?: string };
  if (legacy !== undefined && record.avatar_version_id !== undefined && legacy !== record.avatar_version_id) fail(`${path}.active_version_id`, "conflicts with avatar_version_id");
  const avatar = record.avatar_version_id ?? legacy;
  const { character_id, full_body_version_id, versions, reference } = record;
  return { character_id, ...(avatar !== undefined ? { avatar_version_id: avatar } : {}), ...(full_body_version_id !== undefined ? { full_body_version_id } : {}), versions, ...(reference !== undefined ? { reference } : {}) };
};
const originSnapshot = object({ source: choice("narrator_ephemeral"), trigger: choice("name_established", "purchase_unnamed_subject", "recruitment", "custody", "rescue"),
  promoted_revision: integer(1), promoted_world_minute: integer(), location_id: id, label: text, ephemeral_ref: optional(text),
  established: object({ name: optional(text), sex: optional(text), age: optional(tagged({ exact: object({ kind: choice("exact"), years: integer(0) }), approximate: object({ kind: choice("approximate"), description: text }) })),
    species: optional(text), role: optional(text), descriptor: optional(text), appearance: optional(list(text, 24)), condition: optional(list(text, 24)), background: optional(list(claim, 12)) }),
  evidence: list(text, 12) });
const characterRecord = object({ id, origin, profile, current, origin_snapshot: optional(originSnapshot) });
const itemCategory = choice("weapon", "armor", "clothing", "tool", "consumable", "document", "valuable", "material", "miscellaneous");
const sprite = tagged({ none: object({ status: choice("none") }), pending: object({ status: choice("pending") }),
  failed: object({ status: choice("failed"), error_code: text }),
  ready: object({ status: choice("ready"), asset_ref: text, generated_from_visual_description: text }) }, "status");
const itemRecord = object({ id, origin, name: optional(text), description: optional(text), visual_description: optional(text), sprite: optional(sprite), owner_id: optional(nullable(id)), position, acquisition: optional(acquisition),
  category: optional(itemCategory), created_revision: optional(integer(1)) });
const membershipRecord = object({ character_id: id, status: choice("guest", "member", "former_member"), joined_at: optional(integer()), role: optional(text) });
const factRecord = object({ id, content: tagged({ campaign: object({ kind: choice("campaign"), statement: text, truth: choice("true", "false", "unknown") }), canonical: object({ kind: choice("canonical"), entity_id: id, chunk_id: optional(text) }) }) });
const knowledgeRecord = object({ character_id: id, fact_id: id, status: choice("knows", "believes", "suspects", "heard_rumor"), provenance: optional(provenance) });
const level = choice("none", "low", "moderate", "high");
const dimensions = object({ trust: optional(level), wariness: optional(level), affection: optional(level), protectiveness: optional(level), respect: optional(level), fear: optional(level), hostility: optional(level), romance: optional(level) });
const relationshipRecord = object({ from_character_id: id, to_character_id: id, trust: optional(integer(-100, 100)), dimensions: optional(dimensions), seed_context: optional(text) });
// Household Pass 1 records.
const documentation = choice("documented", "undocumented", "unestablished");
const gold = integer(0, 1_000_000_000);
const fundsRecord = object({ character_id: id, gold });
const legalRecord = object({ character_id: id, status: choice("free", "enslaved"), holder_id: optional(id), transfer: optional(object({ documentation, from_holder_id: optional(id), transaction_id: optional(id), note: optional(text) })) });
const counterparty = object({ label: text, description: optional(text), location_id: id, authority_evidence: list(text, 4) });
const transactionRecord = object({ id, kind: choice("sale", "gift", "assignment", "manumission"), subject_id: id, from_holder_id: optional(id), from_counterparty: optional(counterparty), to_holder_id: optional(id), payer_id: optional(id), payee_id: optional(id), gold: optional(gold), documentation, world_minute: integer(), revision: integer(0) });
const boolean = (input: unknown, path: string) => { if (typeof input !== "boolean") fail(path, "expected boolean"); return input; };
const ruleRecord = object({ id, text, created_revision: integer(0), active: boolean });
// NPC+ Pass 1 record (snapshot schema 2).
// NPC+ Pass 2: structured development entries (a closed tagged union) with bounded retention.
const stamp = { revision: integer(0), world_minute: integer() };
const lifecycle = object({ kind: choice("joined_household", "left_household", "rejoined_household", "migrated_member"), household_id: id, ...stamp });
const dimension = choice("trust", "wariness", "affection", "protectiveness", "respect", "fear", "hostility", "romance");
const legalState = choice("free", "enslaved", "unestablished");
const contractField = choice("personality", "voice", "moral_boundary", "social_style");
const conditionEntry = object({ kind: choice("condition_added", "condition_removed"), condition: text, ...stamp });
const premiumHistory = tagged({ joined_household: lifecycle, left_household: lifecycle, rejoined_household: lifecycle, migrated_member: lifecycle,
  relationship_changed: object({ kind: choice("relationship_changed"), actor_id: id, other_id: id, dimension, from: level, to: level, ...stamp }),
  condition_added: conditionEntry, condition_removed: conditionEntry,
  legal_status_changed: object({ kind: choice("legal_status_changed"), from: legalState, to: legalState, holder_id: optional(id), ...stamp }),
  person_transaction: object({ kind: choice("person_transaction"), transaction_id: id, transaction_kind: choice("sale", "gift", "assignment", "manumission"), ...stamp }),
  household_rule_added: object({ kind: choice("household_rule_added"), household_id: id, rule_id: id, ...stamp }),
  moved: object({ kind: choice("moved"), from: optional(id), to: optional(id), ...stamp }),
  contract_established: object({ kind: choice("contract_established"), field: contractField, ...stamp }) });
/** NPC+ Pass 3 roll-up bounds: row tables are capped; evicted rows are counted in `other_*`. */
export const PREMIUM_ROLLUP_LIMITS = Object.freeze({ relationships: 24, conditions: 12 });
const count = integer(0, 1_000_000_000);
const rollupRecord = object({ first_revision: integer(0), last_revision: integer(0), entries: count,
  lifecycle: object({ joined: count, left: count, rejoined: count, migrated: count }),
  relationships: list(object({ actor_id: id, other_id: id, dimension, raises: count, lowers: count, first_revision: integer(0), last_revision: integer(0) }), PREMIUM_ROLLUP_LIMITS.relationships),
  other_relationship_changes: count,
  conditions: list(object({ condition: text, added: count, removed: count, last_revision: integer(0) }), PREMIUM_ROLLUP_LIMITS.conditions),
  other_condition_changes: count, legal_changes: count, transactions: object({ sale: count, gift: count, assignment: count, manumission: count }),
  moves: count, rules_added: count, contracts: count });
/** NPC+ Pass 2 retention: the newest this many developments are kept per character (older ones are dropped at write time). */
export const PREMIUM_DEVELOPMENT_RETENTION = 16;
/** NPC+ Pass 6 reflection caps per kind, and text bounds. */
export const REFLECTION_LIMITS = Object.freeze({ stance: 4, signature_pattern: 4, shared_motif: 4, emerging_role: 3, unresolved_tension: 3, text: 200, label: 32, evidence_refs: 8 });
const reflectionKind = choice("stance", "signature_pattern", "shared_motif", "emerging_role", "unresolved_tension");
// Stored provenance follows the same plain-data rules as the rest of a campaign.
// Inspect descriptors before schema matching so getters never execute on restore.
const reflectionData = (input: unknown, path: string, depth = 0): unknown => {
  if (depth > 4) fail(path, 'reflection nesting limit');
  if (Array.isArray(input)) return list((value, field) => reflectionData(value, field, depth + 1), 8)(input, path);
  if (input && typeof input === 'object') {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail(path, 'expected plain reflection data');
    const keys = Reflect.ownKeys(input);
    if (keys.length > 12) fail(path, 'reflection object limit');
    const entries = keys.map(key => {
      if (typeof key !== 'string') fail(path, 'unknown reflection field');
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (!('value' in descriptor)) fail(path, 'reflection accessors are forbidden');
      return [key, reflectionData(descriptor.value, `${path}.${key}`, depth + 1)] as const;
    });
    return Object.fromEntries(entries);
  }
  if (typeof input === 'string' || Number.isSafeInteger(input)) return input;
  fail(path, 'invalid reflection data');
};
const structuredReflectionProposal: Parser = (input, path) => {
  const proposal = reflectionData(input, path);
  if (!schemaMatches(STORED_REFLECTION_SCHEMA.properties!.proposals!.items!, proposal)) fail(path, 'invalid structured reflection proposal');
  return proposal;
};
const reflectionNote = object({ id, kind: reflectionKind, label: id, text, evidence_refs: distinct(text), confidence: choice("low", "medium", "high"), created_revision: integer(0), updated_revision: integer(0),
  structured:optional(object({format_version:integer(1,1),semantic_version:choice('V2.3-CVC-E1'),source_revision:integer(0),proposal:structuredReflectionProposal})) });
const reflectionRecord = object({ character_id: id, notes: list(reflectionNote, 18), last_reflected_revision: integer(0) });
const mannerismRecord = object({ epistemic_state: optional(choice("emergent", "observed", "established")), known_by_character_ids: optional(list(id, 64)), id, canonical_key: id, text, source: choice("seeded", "emergent", "user"), created_revision: integer(0), user_edited: boolean,
  requires_item_id: optional(id), requires_entity_id: optional(id) });
const premiumRecord = object({ character_id: id,
  mannerisms: optional(list(mannerismRecord, 4)),
  stable: object({ personality_contract: optional(text), voice_contract: optional(text), moral_boundaries: optional(distinct(text)), baseline_social_style: optional(text),
    contract_evidence: optional(list(object({ field: contractField, revision: integer(0), quote: text }), 64)) }),
  dynamic: object({ recent_developments: list(premiumHistory, PREMIUM_DEVELOPMENT_RETENTION), long_term: optional(rollupRecord), private_memory_refs: optional(distinct(id)) }),
  metadata: object({ created_revision: integer(0), last_updated_revision: integer(0), active_household_member: boolean,
    initial_mannerism: optional(choice("seeded", "candidate", "seed_pool_exhausted")) }) });
const mannerismEvidence = object({ sequence: integer(1), revision: integer(0), event_id: text, narration_hash: text, span_start: integer(0), span_end: integer(1) });
const mannerismCandidate = object({ id, character_id: id, canonical_key: id, text, action: choice(...MANNERISM_ACTIONS), trigger: choice(...MANNERISM_TRIGGERS), requires_item_id: optional(id), requires_entity_id: optional(id),
  evidence: list(mannerismEvidence, 5), first_observed_sequence: integer(1), last_observed_sequence: integer(1) });
const mannerismLearning = object({ sequence: integer(1), processed_sequence: integer(0), last_turn_id: text,
  journal: list(object({ sequence: integer(1), revision: integer(0), event_id: text, narration_hash: text, narration_length: integer(1, 20000), character_ids: distinct(id),
    available_items: list(object({ character_id: id, item_id: id, worn: boolean }), 256) }), 16), candidates: list(mannerismCandidate, 800000) });
const variants: Record<string, Parser> = {};
function command(kind: string, fields: Record<string, Rule>) { variants[kind] = object({ kind: choice(kind), ...fields }); }
command("register_character", { character: characterRecord });
command("set_profile", { character_id: id, profile });
command("set_condition", { character_id: id, conditions: distinct(text), presentation: optional(text), status: optional(choice("active", "inactive", "dead")) });
command("move_character", { character_id: id, location_id: id });
command("leave_scene", { character_id: id });
command("set_slot_knowledge", { character_id: id, slot: id, state: choice("empty", "unknown") });
command("register_item", { item: itemRecord });
// Item Domain V1: no id field exists, so a proposer cannot choose one (unknown keys are rejected).
command("create_item", { name: text, description: text, visual_description: text, category: optional(itemCategory), owner_id: optional(nullable(id)), position });
command("enrich_item_visual", { item_id: id, visual_description: text });
command("set_item_sprite", { item_id: id, sprite });
command("place_item", { item_id: id, position });
command("transfer_item", { item_id: id, mode: choice("gift", "handoff", "lend", "return", "steal", "reclaim", "take"), position, acquisition: optional(acquisition) });
command("create_household", { id, name: optional(text) });
command("set_membership", { household_id: id, membership: membershipRecord });
command("create_fact", { fact: factRecord });
command("set_knowledge", { knowledge: knowledgeRecord });
command("seed_relationship", { relationship: relationshipRecord });
command("set_trust", { from_character_id: id, to_character_id: id, trust: integer(-100, 100) });
command("create_goal", { id, character_id: id, description: text, target: optional(target) });
command("set_goal_status", { goal_id: id, status: goalStatus });
command("schedule_event", { id, title: text, description: optional(text), scheduled_world_minute: integer(), participants: optional(distinct(id)) });
command("set_event_status", { event_id: id, status: eventStatus });
command("reschedule_event", { event_id: id, scheduled_world_minute: integer() });
command("set_funds", { character_id: id, gold });
command("set_price_index", { character_id: id, percent: integer(-90, 90) });
command("record_portrait_batch", { character_id: id, versions: list(portraitVersion, 3), avatar_version_id: optional(id) });
command("set_portrait_avatar", { character_id: id, version_id: id });
command("set_portrait_full_body", { character_id: id, version_id: nullable(id) });
command("delete_portrait_version", { character_id: id, version_id: id });
command("set_portrait_reference", { character_id: id, reference: nullable(portraitReference) });
// Player Character Profile V1: shape here; tighter content bounds (lengths, list sizes, control characters) in player-character.ts.
const playerProfile = object({ character_id: id, sex: optional(text), species: optional(text), apparent_age: optional(text), appearance });
command("set_player_character_profile", { profile: playerProfile });
command("set_legal_status", { character_id: id, status: choice("free", "enslaved"), holder_id: optional(id), documentation: optional(documentation), note: optional(text) });
command("transfer_person", { transaction_id: id, transaction_kind: choice("sale", "gift", "assignment"), character_id: id, from_holder_id: optional(id), from_counterparty: optional(counterparty), to_holder_id: id, payment: optional(object({ payer_id: id, payee_id: optional(id), gold })), documentation, note: optional(text) });
command("manumit", { transaction_id: id, character_id: id, by_holder_id: id, documentation, note: optional(text) });
command("join_household", { household_id: id, character_id: id });
command("leave_household", { household_id: id, character_id: id });
command("add_household_rule", { household_id: id, text });
command("set_household_rule_active", { household_id: id, rule_id: id, active: (input: unknown, path: string) => { if (typeof input !== "boolean") fail(path, "expected boolean"); return input; } });
command("adjust_relationship", { from_character_id: id, to_character_id: id, dimension: choice("trust", "wariness", "affection", "protectiveness", "respect", "fear", "hostility", "romance"), direction: choice("raise", "lower") });
command("establish_character_contract", { character_id: id, field: choice("personality", "voice", "moral_boundary", "social_style"), text, quote: text });
command("record_reflection", { character_id: id, notes: list(reflectionNote, 18), reflected_revision: integer(0) });
command("runtime_delta", { delta: object({ expected_revision: optional(integer(0)), player_location: optional(id), character_movements: optional(list(object({ character_id: id, current_location: optional(id), off_scene: optional((input: unknown, path: string) => { if (input !== true) fail(path, "expected true"); return input; }) }))), time_advance_minutes: optional(integer(0)), mana_delta: optional(integer()) }) });
const proposal = object({ expected_revision: integer(0), commands: list(tagged(variants), 128) });
/** Parse unknown input without invoking data accessors; cross-domain checks follow in preparation. */
export function parseCampaignProposal(input: unknown): CampaignProposal { return proposal(input, "proposal") as CampaignProposal; }
const snapshot = object({ schema_version: integer(6, 6), campaign_id: id, dataset_id: text, revision: integer(0), next_item_sequence: integer(1, 99_999_999), mannerism_learning: optional(mannerismLearning),
  player_characters: list(playerProfile, 8),
  price_indices: optional(list(object({ character_id: id, percent: integer(-90, 90) }), 100000)),
  portraits: optional(list(portraitRecord, 100000)),
  runtime: object({ scene: object({ player_location: id, world_time: object({ world_minute: integer() }) }),
    npc_locations: list(object({ character_id: id, current_location: optional(id), off_scene: optional(object({ last_known_location: id, since_revision: integer(0) })) }), 100000), mana: object({ current: integer(0), max: integer(0) }) }),
  characters: list(characterRecord, 100000), items: list(itemRecord, 100000),
  households: list(object({ id, name: optional(text), members: list(membershipRecord, 100000), rules: optional(list(ruleRecord, 1000)) }), 100000),
  facts: list(factRecord, 100000), knowledge: list(knowledgeRecord, 100000), relationships: list(relationshipRecord, 100000),
  goals: list(object({ id, character_id: id, description: text, status: goalStatus, created_at: integer(), target: optional(target) }), 100000),
  funds: list(fundsRecord, 100000), legal_statuses: list(legalRecord, 100000), transactions: list(transactionRecord, 100000),
  premium_characters: list(premiumRecord, 100000),
  premium_reflections: list(reflectionRecord, 100000),
  scheduled_events: list(object({ id, title: text, description: optional(text), scheduled_world_minute: integer(), status: eventStatus, participants: optional(distinct(id)) }), 100000) });
/** Direct DTO validation using exactly the same record schemas as commands. */
export function parseCampaignSnapshot(input: unknown): CampaignSnapshot { return snapshot(input, "snapshot") as CampaignSnapshot; }
/** Small shared plain-data primitives for the persistence envelope. */
export const dataSchema = { object, optional, text, integer, choice, list };
export function freezeSnapshot<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freezeSnapshot(child); Object.freeze(value); }
  return value as DeepReadonly<T>;
}
