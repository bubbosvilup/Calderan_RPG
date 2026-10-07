import { isDeepStrictEqual } from "node:util";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { CampaignSnapshot, CharacterAppearance } from "./types.js";

/**
 * Permanent Appearance V1: one read-only contract for what a character permanently looks like, shared by the narrator context, the
 * player character projection, the Household appearance editor and (later) a deterministic portrait prompt builder.
 *
 *   baseline prose (canonical authored appearance, promotion-origin observations) — immutable evidence, never parsed
 *   + CharacterProfile.appearance — the one editable campaign layer, field by field
 *   = ResolvedPermanentAppearance
 *
 * Canon and origin carry appearance only as prose, so every structured value comes from the profile; an absent profile field means
 * "no campaign value established", never "empty" or "delete canon". A profile description overrides the baseline prose; otherwise
 * the baseline prose is the effective description. Conditions, presentation, clothing, location and behavior are current state and
 * are never read here.
 */
export const PERMANENT_APPEARANCE_FIELDS = ["height_cm", "weight_kg", "build", "skin", "hair_color", "hair_texture", "hair_description", "eyes", "scars", "distinguishing_marks", "distinctive_traits", "description"] as const;
export type PermanentAppearanceField = (typeof PERMANENT_APPEARANCE_FIELDS)[number];
type Value = number | string | readonly string[];
export interface ResolvedPermanentAppearance {
  /** Campaign profile values (flattened), only the fields that are established. Scars are their descriptions, in order. */
  readonly values: Readonly<Partial<Record<PermanentAppearanceField, Value>>>;
  /** Established baseline prose with its source, kept verbatim. */
  readonly baseline: readonly { readonly source: "canonical" | "origin"; readonly text: string }[];
  /** Override description, else the baseline prose. */
  readonly description: readonly string[];
  /** Read-only identity context (never edited here): authored or established species, sex and age. */
  readonly identity: { readonly species?: string; readonly sex?: string; readonly age?: string };
}

/** Flatten a stored appearance into editor/resolver fields. */
export function appearanceValues(a: DeepReadonly<CharacterAppearance> | undefined): Partial<Record<PermanentAppearanceField, Value>> {
  if (!a) return {};
  const out: Partial<Record<PermanentAppearanceField, Value>> = {};
  if (a.height_cm !== undefined) out.height_cm = a.height_cm;
  if (a.weight_kg !== undefined) out.weight_kg = a.weight_kg;
  for (const k of ["build", "skin", "eyes", "description"] as const) if (a[k] !== undefined) out[k] = a[k]!;
  if (a.hair?.color !== undefined) out.hair_color = a.hair.color;
  if (a.hair?.texture !== undefined) out.hair_texture = a.hair.texture;
  if (a.hair?.description !== undefined) out.hair_description = a.hair.description;
  if (a.scars?.length) out.scars = a.scars.map(s => s.location ? `${s.description} (${s.location})` : s.description);
  if (a.distinguishing_marks?.length) out.distinguishing_marks = [...a.distinguishing_marks];
  if (a.distinctive_traits?.length) out.distinctive_traits = [...a.distinctive_traits];
  return out;
}

/**
 * Resolve a character's permanent appearance. `canonical`: include the authored canonical prose (callers decide public access).
 * `overrides`: include campaign profile values (callers decide whether they are known to the reader). Promotion copied the origin
 * observations into the profile description ("; "-joined); that copy is the origin baseline, not a campaign override.
 */
export function resolvePermanentAppearance(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>, characterId: string,
  options: { readonly canonical?: boolean; readonly overrides?: boolean } = {}): ResolvedPermanentAppearance {
  const record = snapshot.characters.find(c => c.id === characterId);
  const canonicalId = record?.origin.kind === "canonical" ? record.origin.canonical_entity_id : record ? undefined : characterId;
  const entity = canonicalId ? world.getEntity(canonicalId) : undefined;
  const canonical = entity?.type === "character" ? entity : undefined;
  const origin = record?.origin_snapshot;
  const baseline = [
    ...(options.canonical && canonical?.appearance ? [{ source: "canonical" as const, text: canonical.appearance }] : []),
    ...(origin?.established.appearance ?? []).map(text => ({ source: "origin" as const, text })),
  ];
  const values = options.overrides ? overridesOf(record) : {};
  const description = typeof values.description === "string" ? [values.description] : [...new Set(baseline.map(b => b.text))];
  // Established origin first, then profile values (under the same `overrides` rule), then authored canon (under `canonical`).
  const profile = options.overrides ? record?.profile : undefined, authored = options.canonical ? canonical : undefined;
  const species = origin?.established.species ?? profile?.species ?? authored?.species ?? undefined;
  const sex = origin?.established.sex ?? profile?.sex ?? authored?.sex ?? undefined;
  const age = origin?.established.age ?? profile?.age;
  const ageText = age ? age.kind === "exact" ? `${age.years} years` : age.description : authored?.age_band ?? undefined;
  const identity = { ...(species ? { species } : {}), ...(sex ? { sex } : {}), ...(ageText ? { age: ageText } : {}) };
  const freeze = (v: unknown): void => { if (v && typeof v === "object") { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } };
  const result: ResolvedPermanentAppearance = { values, baseline, description, identity };
  freeze(result);
  return result;
}
/** The campaign override values of a record (the promotion-time copy of origin observations is not an override). */
function overridesOf(record: DeepReadonly<CampaignSnapshot["characters"][number]> | undefined): Partial<Record<PermanentAppearanceField, Value>> {
  const values = appearanceValues(record?.profile.appearance);
  const copied = record?.origin_snapshot?.established.appearance?.join("; ");
  if (copied !== undefined && values.description === copied) delete values.description;
  return values;
}
export const isOverridden = (resolved: ResolvedPermanentAppearance, field: PermanentAppearanceField) => resolved.values[field] !== undefined;
export const hasOverrides = (resolved: ResolvedPermanentAppearance) => Object.keys(resolved.values).length > 0;

const LABELS: Readonly<Record<PermanentAppearanceField, string>> = { height_cm: "Height", weight_kg: "Weight", build: "Build", skin: "Skin", hair_color: "Hair color",
  hair_texture: "Hair texture", hair_description: "Hair", eyes: "Eyes", scars: "Scars", distinguishing_marks: "Distinguishing marks", distinctive_traits: "Distinctive traits", description: "Description" };
export const appearanceLabel = (field: PermanentAppearanceField) => LABELS[field];
/** Human-readable lines (structured values first, then the effective description). No value is invented. */
export function appearanceLines(resolved: ResolvedPermanentAppearance): string[] {
  const v = resolved.values, show = (f: PermanentAppearanceField) => { const x = v[f]; return x === undefined ? undefined : f === "height_cm" ? `${x} cm` : f === "weight_kg" ? `${x} kg` : Array.isArray(x) ? x.join("; ") : String(x); };
  const structured = PERMANENT_APPEARANCE_FIELDS.filter(f => f !== "description" && v[f] !== undefined).map(f => `${LABELS[f]}: ${show(f)}`);
  return [...(structured.length ? [structured.join(" · ")] : []), ...resolved.description];
}
/** Compact narrator form: established values plus the effective description. */
export function narratorAppearance(resolved: ResolvedPermanentAppearance): Readonly<Record<string, Value>> {
  return Object.freeze({ ...resolved.values, ...(resolved.description.length ? { description: resolved.description.join(" ") } : {}) });
}

// ------------------------------------------------------------------------------------------------ narrow patch
/**
 * Patch semantics (V1): an omitted field is unchanged; `null` clears that profile override (the baseline applies again); a value sets
 * it. Text is trimmed and must be nonempty (whitespace-only is rejected: clearing is explicit `null`). Height/weight are whole
 * centimetres/kilograms in range. Lists (scars, marks, traits) are arrays of distinct nonempty lines; a scar line is its description.
 * A scar's stored location is kept only while the scars field is not edited.
 */
export const APPEARANCE_LIMITS = Object.freeze({ text: 200, description: 2000, items: 12, height_cm: [30, 300] as const, weight_kg: [1, 500] as const });
export type AppearancePatch = Partial<Record<PermanentAppearanceField, number | string | readonly string[] | null>>;
export type PatchResult = { readonly ok: true; readonly appearance: CharacterAppearance | undefined; readonly changed: boolean } | { readonly ok: false; readonly field?: string; readonly reason: string };
export function applyAppearancePatch(current: DeepReadonly<CharacterAppearance> | undefined, patch: unknown): PatchResult {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.getPrototypeOf(patch) !== Object.prototype) return { ok: false, reason: "Expected an appearance patch object." };
  const keys = Object.keys(patch);
  if (!keys.length) return { ok: false, reason: "Nothing to change." };
  const next = structuredClone(current ?? {}) as CharacterAppearance;
  for (const key of keys) {
    if (!(PERMANENT_APPEARANCE_FIELDS as readonly string[]).includes(key)) return { ok: false, field: key, reason: "This field cannot be edited." };
    const field = key as PermanentAppearanceField, raw = (patch as Record<string, unknown>)[key];
    let value: number | string | string[] | undefined;
    if (raw === null) value = undefined;
    else if (field === "height_cm" || field === "weight_kg") {
      const [min, max] = APPEARANCE_LIMITS[field];
      if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < min || raw > max) return { ok: false, field, reason: `Enter a whole number from ${min} to ${max}.` };
      value = raw;
    } else if (field === "scars" || field === "distinguishing_marks" || field === "distinctive_traits") {
      if (!Array.isArray(raw) || !raw.length || raw.length > APPEARANCE_LIMITS.items) return { ok: false, field, reason: `Enter 1 to ${APPEARANCE_LIMITS.items} lines, or clear the field.` };
      const items = raw.map(x => typeof x === "string" ? x.trim() : "");
      if (items.some(x => !x || x.length > APPEARANCE_LIMITS.text)) return { ok: false, field, reason: `Each line must be 1 to ${APPEARANCE_LIMITS.text} characters.` };
      if (new Set(items.map(x => x.toLowerCase())).size !== items.length) return { ok: false, field, reason: "Lines must not repeat." };
      value = items;
    } else {
      const limit = field === "description" ? APPEARANCE_LIMITS.description : APPEARANCE_LIMITS.text;
      if (typeof raw !== "string" || !raw.trim() || raw.trim().length > limit) return { ok: false, field, reason: `Enter 1 to ${limit} characters, or clear the field.` };
      value = raw.trim().replace(/\s+/g, " ");
    }
    set(next, field, value);
  }
  const appearance = Object.keys(next).length ? next : undefined;
  return { ok: true, appearance, changed: !isDeepStrictEqual(appearance ?? {}, structuredClone(current ?? {})) };
}
function set(a: CharacterAppearance, field: PermanentAppearanceField, value: number | string | string[] | undefined): void {
  const assign = <K extends keyof CharacterAppearance>(k: K, v: CharacterAppearance[K] | undefined) => { if (v === undefined) delete a[k]; else a[k] = v; };
  if (field === "hair_color" || field === "hair_texture" || field === "hair_description") {
    const hair = { ...a.hair }, k = field.slice(5) as "color" | "texture" | "description";
    if (value === undefined) delete hair[k]; else hair[k] = value as string;
    assign("hair", Object.keys(hair).length ? hair : undefined);
  } else if (field === "scars") assign("scars", (value as string[] | undefined)?.map(description => ({ description })));
  else if (field === "height_cm" || field === "weight_kg") assign(field, value as number | undefined);
  else assign(field, value as never);
}
