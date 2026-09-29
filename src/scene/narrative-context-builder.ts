import { characterPortrayal } from "../world/character-contract.js";
import type { BaseEntity } from "../types/entities.js";
import type { NarrativeCharacter, NarrativeContext, NarrativeLocation, NarrativeLocationSummary } from "../types/narrative.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { RuntimeState } from "../world/runtime-state.js";
import type { WorldStore } from "../world/world-store.js";
import { buildSceneRam } from "./scene-ram-builder.js";

/** Character counts, not tokens. Oversized primary context fails, never truncates. */
export const NARRATIVE_CONTEXT_LIMITS = Object.freeze({
  name: 200, summary: 600, content: 2000,
  feature_description: 400, trait: 200,
  features: 24, traits: 24, ancestors: 16, present_characters: 24,
  total_text_characters: 16000,
});

export class NarrativeContextError extends Error {
  constructor(
    public readonly field: string,
    public readonly entityId: string | undefined,
    reason: string,
  ) {
    super(`${field}${entityId === undefined ? "" : ` [${entityId}]`}: ${reason}`);
    this.name = "NarrativeContextError";
  }
}

/** Synchronous primary projection. No chunk selection, retrieval, or epistemic inference. */
export function buildNarrativeContext(world: WorldStore, runtime: RuntimeState): NarrativeContext {
  const ram = buildSceneRam(world, runtime);
  let textSize = 0;
  const text = (value: string, limit: number, field: string, entityId: string): string => {
    if (value.length > limit) throw new NarrativeContextError(field, entityId, `text exceeds ${limit} characters; content is not truncated`);
    textSize += value.length;
    if (textSize > NARRATIVE_CONTEXT_LIMITS.total_text_characters) throw new NarrativeContextError(field, entityId, "primary context exceeds total text budget; content is not truncated");
    return value;
  };
  const count = (size: number, limit: number, field: string, entityId?: string): void => {
    if (size > limit) throw new NarrativeContextError(field, entityId, `count exceeds ${limit}; entries are not silently dropped`);
  };
  const visible = (entity: DeepReadonly<BaseEntity>, field: string): boolean => {
    if (!entity.knowledge) throw new NarrativeContextError(`${field}.knowledge`, entity.id, "unclassified primary-scene entity requires an explicit knowledge policy");
    return entity.knowledge.visibility.narrator;
  };
  const summary = (entity: DeepReadonly<BaseEntity>, field: string): NarrativeLocationSummary => Object.freeze({
    id: text(entity.id, NARRATIVE_CONTEXT_LIMITS.name, `${field}.id`, entity.id),
    name: text(entity.name, NARRATIVE_CONTEXT_LIMITS.name, `${field}.name`, entity.id),
    display_name: text(entity.display_name, NARRATIVE_CONTEXT_LIMITS.name, `${field}.display_name`, entity.id),
    summary: text(entity.summary, NARRATIVE_CONTEXT_LIMITS.summary, `${field}.summary`, entity.id),
    secret: !entity.knowledge!.visibility.player,
  });

  let playerLocation: NarrativeLocation | null = null;
  const current = ram.current_location;
  if (visible(current, "scene.player_location")) {
    count(current.features.length, NARRATIVE_CONTEXT_LIMITS.features, "scene.player_location.features", current.id);
    playerLocation = Object.freeze({
      ...summary(current, "scene.player_location"),
      content: text(current.content, NARRATIVE_CONTEXT_LIMITS.content, "scene.player_location.content", current.id),
      features: Object.freeze(current.features.map((feature, i) => Object.freeze({
        name: text(feature.name, NARRATIVE_CONTEXT_LIMITS.name, `scene.player_location.features[${i}].name`, current.id),
        description: text(feature.description, NARRATIVE_CONTEXT_LIMITS.feature_description, `scene.player_location.features[${i}].description`, current.id),
      }))),
    });
  }

  const ancestry: NarrativeLocationSummary[] = [];
  for (const ancestor of ram.location_ancestry) {
    if (visible(ancestor, "scene.location_ancestry")) {
      count(ancestry.length + 1, NARRATIVE_CONTEXT_LIMITS.ancestors, "scene.location_ancestry");
      ancestry.push(summary(ancestor, `scene.location_ancestry[${ancestry.length}]`));
    }
  }

  const characters: NarrativeCharacter[] = [];
  for (const id of ram.present_characters) {
    const npc = world.getEntity(id);
    if (!npc || npc.type !== "character" || npc.role !== "npc" || id === "nicco") throw new NarrativeContextError("scene.present_characters", id, "expected a present NPC");
    if (!visible(npc, "scene.present_characters")) continue;
    count(characters.length + 1, NARRATIVE_CONTEXT_LIMITS.present_characters, "scene.present_characters");
    const field = `scene.present_characters[${characters.length}]`;
    count(npc.traits.length, NARRATIVE_CONTEXT_LIMITS.traits, `${field}.traits`, npc.id);
    const portrayal = characterPortrayal(npc);
    if (portrayal) text(JSON.stringify(portrayal), 6000, `${field}.portrayal`, npc.id);
    characters.push(Object.freeze({
      ...summary(npc, field),
      ...(npc.appearance ? { appearance: text(npc.appearance, 800, `${field}.appearance`, npc.id) } : {}),
      ...(portrayal ? { portrayal } : {}),
      content: text(npc.content, NARRATIVE_CONTEXT_LIMITS.content, `${field}.content`, npc.id),
      traits: Object.freeze(npc.traits.map((trait, i) => text(trait, NARRATIVE_CONTEXT_LIMITS.trait, `${field}.traits[${i}]`, npc.id))),
    }));
  }
  return Object.freeze({
    runtime_revision: runtime.revision,
    scene: Object.freeze({
      player_location: playerLocation,
      location_ancestry: Object.freeze(ancestry),
      world_time: Object.freeze({ world_minute: ram.world_time.world_minute }),
      player_resources: Object.freeze({ mana: runtime.getPlayerMana() }),
      present_characters: Object.freeze(characters),
    }),
  });
}
