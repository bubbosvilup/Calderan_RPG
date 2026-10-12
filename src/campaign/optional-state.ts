import type { CampaignSnapshot, CampaignItem, CharacterPortraitRecord, ItemSprite, MannerismLearning, PremiumReflection } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";

/**
 * Consolidation block 7: optional-state partitions.
 *
 * Optional enrichment and media bookkeeping is NOT gameplay truth. It lives in two side stores next to the campaign save and never drives the semantic
 * campaign revision:
 *
 *   LEARNING store  premium_reflections (journal, scheduling, validated soft-promoted notes) and mannerism_learning (observations, candidates, journal).
 *   MEDIA store     items[].sprite (pending / ready / failed) and the portrait Gallery (versions, generation metadata, reference).
 *
 * The explicit, player-authoritative portrait SELECTIONS (avatar / full body) and the promoted mannerisms (`premium_characters[].mannerisms`) stay authoritative.
 *
 * In memory the `CampaignSnapshot` is a composed view (all fields present, so readers and validators are unchanged). The partition below decides what is
 * persisted where and what counts as an authoritative change: `corePartition` is the projection a semantic revision is computed from.
 */
export const OPTIONAL_STORE_NAMES = ["learning", "media"] as const;
export type OptionalStoreName = typeof OPTIONAL_STORE_NAMES[number];

export interface PortraitSelection { character_id: string; avatar_version_id?: string; full_body_version_id?: string }
export interface LearningStateData { premium_reflections: PremiumReflection[]; mannerism_learning?: MannerismLearning }
export interface MediaPortraitData { character_id: string; versions: CharacterPortraitRecord["versions"]; reference?: CharacterPortraitRecord["reference"] }
export interface MediaStateData { item_sprites: { item_id: string; sprite: ItemSprite }[]; portraits: MediaPortraitData[] }
export interface OptionalStateData { learning: LearningStateData; media: MediaStateData }

type Loose = Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);

/** Fields of a persisted snapshot that belong to a store (removed once that store's marker is present). */
const LEARNING_FIELDS = ["premium_reflections", "mannerism_learning"] as const;

/** The data each store holds, taken from a composed snapshot. Deterministic; never mutates the input. */
export function extractOptionalState(snapshot: DeepReadonly<CampaignSnapshot>): OptionalStateData {
  const item_sprites: MediaStateData["item_sprites"] = [];
  for (const item of snapshot.items) if (item.sprite) item_sprites.push({ item_id: item.id, sprite: clone(item.sprite) as ItemSprite });
  const portraits: MediaPortraitData[] = (snapshot.portraits ?? []).map(record => ({ character_id: record.character_id, versions: clone(record.versions) as MediaPortraitData["versions"],
    ...(record.reference ? { reference: clone(record.reference) as NonNullable<MediaPortraitData["reference"]> } : {}) }))
    .filter(record => record.versions.length > 0 || record.reference !== undefined);
  return { learning: { premium_reflections: clone(snapshot.premium_reflections) as PremiumReflection[], ...(snapshot.mannerism_learning ? { mannerism_learning: clone(snapshot.mannerism_learning) as MannerismLearning } : {}) },
    media: { item_sprites, portraits } };
}

/** The explicit player selections, one per character that holds a role. */
export function portraitSelections(snapshot: DeepReadonly<Pick<CampaignSnapshot, "portraits">>): PortraitSelection[] {
  const out: PortraitSelection[] = [];
  for (const record of snapshot.portraits ?? []) {
    if (record.avatar_version_id === undefined && record.full_body_version_id === undefined) continue;
    out.push({ character_id: record.character_id, ...(record.avatar_version_id !== undefined ? { avatar_version_id: record.avatar_version_id } : {}),
      ...(record.full_body_version_id !== undefined ? { full_body_version_id: record.full_body_version_id } : {}) });
  }
  return out;
}

/**
 * The authoritative projection of a composed snapshot: everything except optional enrichment/media. A change that leaves this projection equal is an
 * OPTIONAL change and never bumps the semantic revision. Shallow where possible (only items and the portraits array are rebuilt).
 */
export function corePartition(snapshot: DeepReadonly<CampaignSnapshot>): Loose {
  const { premium_reflections: _r, mannerism_learning: _m, portraits: _p, items, ...rest } = snapshot as unknown as Loose & { items: readonly CampaignItem[] };
  void _r; void _m; void _p;
  return { ...rest, items: items.map(item => { if (!("sprite" in item)) return item; const { sprite: _s, ...core } = item; void _s; return core; }), portrait_selections: portraitSelections(snapshot) };
}

export interface OptionalStateMigrated { readonly learning: boolean; readonly media: boolean }
/**
 * The snapshot as persisted (schema 8). A migrated store's fields are REMOVED (the side store is their only authority); an unmigrated store's fields stay
 * in the snapshot (the snapshot is their authority until the marker is persisted).
 */
export function toPersistedSnapshot(snapshot: DeepReadonly<CampaignSnapshot>, migrated: OptionalStateMigrated): Loose {
  const draft = clone(snapshot) as unknown as Loose & { items: Loose[]; portraits?: CharacterPortraitRecord[] };
  draft.schema_version = 8;
  if (migrated.learning) for (const field of LEARNING_FIELDS) delete draft[field];
  if (migrated.media) {
    for (const item of draft.items) delete item.sprite;
    delete draft.portraits;
    const selections = portraitSelections(snapshot);
    if (selections.length) draft.portrait_selections = selections;
  }
  return draft;
}

export interface MergeOptions {
  /** Core-only decode (campaign listings): migrated stores contribute empty enrichment instead of being read. */
  readonly core_only?: boolean;
  /** The snapshot revision, used to reject enrichment that postdates it (an older slot loaded next to a newer store). */
  readonly revision?: number;
}
export interface OptionalSides { readonly learning?: LearningStateData; readonly media?: MediaStateData; readonly learning_bound_revision?: number; readonly media_bound_revision?: number }

/**
 * Rebuilds the composed (schema 7 shaped) snapshot from a persisted one. For a migrated store the side store is the authority and the snapshot's own copy is
 * ignored (a stray copy never merges); for an unmigrated store the snapshot's fields are the authority.
 */
export function fromPersistedSnapshot(persisted: unknown, migrated: OptionalStateMigrated, sides: OptionalSides, options: MergeOptions = {}): Loose {
  const draft = clone(persisted) as Loose & { items?: Loose[]; portraits?: CharacterPortraitRecord[]; portrait_selections?: PortraitSelection[]; revision?: number };
  const selections = draft.portrait_selections ?? [];
  delete draft.portrait_selections;
  const revision = options.revision ?? (typeof draft.revision === "number" ? draft.revision : Number.MAX_SAFE_INTEGER);
  if (migrated.learning) {
    for (const field of LEARNING_FIELDS) delete draft[field];
    const learning = options.core_only ? { premium_reflections: [] } as LearningStateData : clampLearning(sides.learning ?? { premium_reflections: [] }, revision, sides.learning_bound_revision);
    draft.premium_reflections = clone(learning.premium_reflections);
    if (learning.mannerism_learning) draft.mannerism_learning = clone(learning.mannerism_learning);
  }
  if (migrated.media) {
    const media = options.core_only ? { item_sprites: [], portraits: [] } as MediaStateData : sides.media ?? { item_sprites: [], portraits: [] };
    const sprites = new Map(media.item_sprites.map(entry => [entry.item_id, entry.sprite]));
    for (const item of draft.items ?? []) { delete item.sprite; const sprite = typeof item.id === "string" ? sprites.get(item.id) : undefined; if (sprite) item.sprite = clone(sprite); }
    const known = new Set([...((draft as unknown as { characters?: { id: string }[] }).characters ?? []).map(c => c.id), ...((draft as unknown as { player_characters?: { character_id: string }[] }).player_characters ?? []).map(p => p.character_id)]);
    const chosen = new Map(selections.map(s => [s.character_id, s]));
    const records: CharacterPortraitRecord[] = [];
    for (const portrait of media.portraits) {
      if (!known.has(portrait.character_id)) continue;
      const selection = chosen.get(portrait.character_id); chosen.delete(portrait.character_id);
      records.push({ character_id: portrait.character_id, ...(selection?.avatar_version_id !== undefined ? { avatar_version_id: selection.avatar_version_id } : {}),
        ...(selection?.full_body_version_id !== undefined ? { full_body_version_id: selection.full_body_version_id } : {}), versions: clone(portrait.versions) as CharacterPortraitRecord["versions"],
        ...(portrait.reference ? { reference: clone(portrait.reference) as NonNullable<CharacterPortraitRecord["reference"]> } : {}) });
    }
    // An authoritative selection whose gallery entry is missing is KEPT as a selection (degraded rendering), never dropped and never replaced.
    for (const selection of chosen.values()) records.push({ character_id: selection.character_id, ...(selection.avatar_version_id !== undefined ? { avatar_version_id: selection.avatar_version_id } : {}),
      ...(selection.full_body_version_id !== undefined ? { full_body_version_id: selection.full_body_version_id } : {}), versions: [] });
    if (records.length) draft.portraits = records;
  }
  draft.schema_version = 7;
  return draft;
}

/**
 * A learning store may be NEWER than the snapshot it is loaded beside (an older slot or backup, next to the current store). Reflection notes that postdate the
 * snapshot are dropped (they cite evidence the snapshot never had) and the derived mannerism evidence is reset; nothing else is touched.
 */
export function clampLearning(learning: LearningStateData, revision: number, boundRevision: number | undefined): LearningStateData {
  if (boundRevision === undefined || boundRevision <= revision) return learning;
  const premium_reflections = learning.premium_reflections.map(record => ({ ...clone(record), notes: record.notes.filter(note => note.created_revision <= revision && note.updated_revision <= revision
      && (!note.structured || note.structured.source_revision <= revision)), last_reflected_revision: Math.min(record.last_reflected_revision, revision) }))
    .filter(record => record.notes.length > 0);
  return { premium_reflections };
}
