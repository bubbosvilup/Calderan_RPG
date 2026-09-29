import type { CampaignSnapshot } from "../campaign/types.js";
import { characterView, itemView } from "../campaign/projections.js";
import { buildNarrativeContext } from "../scene/narrative-context-builder.js";
import { RuntimeState } from "../world/runtime-state.js";
import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import { TurnError } from "./turn-types.js";

export function buildTurnContext(world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>) {
  if (snapshot.dataset_id !== world.datasetId) throw new TurnError("context_invalid");
  // Detached compatibility projection; never replay commands into the authoritative campaign.
  const runtime = new RuntimeState(world, structuredClone(snapshot.runtime.scene), snapshot.runtime.mana);
  runtime.applySceneDelta({ character_movements: snapshot.runtime.npc_locations.map(n => ({ ...n })) });
  const projected = buildNarrativeContext(world, runtime);
  // Stronger player-output policy: omit narrator-only secrets from this first playable slice.
  const primary = { runtime_revision: snapshot.revision, scene: { ...projected.scene,
    player_location: projected.scene.player_location?.secret ? null : projected.scene.player_location,
    location_ancestry: projected.scene.location_ancestry.filter(e => !e.secret),
    present_characters: projected.scene.present_characters.filter(e => !e.secret),
  } };
  // Current production canon may have no authored player/NPC records yet. Runtime still projects player location/mana.
  const present = [...(world.getEntity("nicco")?.type === "character" ? ["nicco"] : []), ...primary.scene.present_characters.map(c => c.id), ...snapshot.characters.filter(c => c.origin.kind === "created" && c.current.current_location === snapshot.runtime.scene.player_location && c.current.status !== "dead").map(c => c.id)];
  const visibleItem = (id: string) => { const item = snapshot.items.find(i => i.id === id)!; return item.origin.kind === "created" || !!world.getEntity(item.origin.canonical_entity_id)?.knowledge?.visibility.player && !!world.getEntity(item.origin.canonical_entity_id)?.knowledge?.visibility.narrator; };
  const items = snapshot.items.filter(i => (i.position.kind === "carried" || i.position.kind === "equipped") && present.includes(i.position.character_id) && visibleItem(i.id)).map(i => itemView(snapshot, world, i.id));
  const facts = snapshot.facts.filter(f => snapshot.knowledge.some(k => k.character_id === "nicco" && k.fact_id === f.id)).flatMap(f => {
    if (f.content.kind === "campaign") return [{ id: f.id, statement: f.content.statement }];
    const owner = world.getEntity(f.content.entity_id), chunk = f.content.chunk_id ? world.getChunk(f.content.chunk_id) : undefined;
    const policy = chunk?.knowledge ?? owner?.knowledge;
    return policy?.visibility.player && policy.visibility.narrator ? [{ id: f.id, statement: chunk?.content ?? owner!.content }] : [];
  });
  const knowledge = snapshot.knowledge.filter(k => present.includes(k.character_id) && facts.some(f => f.id === k.fact_id));
  // Authored home locality (canonical characters only): the basis for local:<location> awareness. Presence alone is not residency.
  const home = (id: string) => { const e = world.getEntity(id); return e?.type === "character" && (e.base_location ?? e.location) ? [e.base_location ?? e.location!, ...world.getAncestors((e.base_location ?? e.location)!).map(a => a.id)] : []; };
  const characters = present.map(id => ({ ...characterView(snapshot, world, id), locality: home(id),
    canonical_awareness: world.listEntities().filter(e => e.knowledge?.visibility.player && e.knowledge.visibility.narrator && e.knowledge.known_by.includes(id)).map(e => e.id).slice(0, 24),
  }));
  const events = snapshot.scheduled_events.filter(e => e.participants?.includes("nicco") && e.status === "scheduled");
  // Narrator-facing truth about the player character (canonical baseline + current household roles); never NPC knowledge.
  const player = world.getEntity("nicco");
  const player_profile = player?.type === "character" && player.role === "player" && player.knowledge?.visibility.narrator ? {
    name: player.name, content: player.content,
    households: snapshot.households.flatMap(h => h.members.filter(m => m.character_id === "nicco" && m.status !== "former_member").map(m => ({ name: h.name ?? h.id, status: m.status, ...(m.role ? { role: m.role } : {}) }))),
  } : null;
  const result = { primary, characters, items, facts, knowledge, scheduled_events: events, player_profile };
  if (present.length > 24 || items.length > 48 || facts.length > 32 || knowledge.length > 96 || events.length > 16 || JSON.stringify(result).length > 32_000) throw new TurnError("context_too_large");
  return result;
}
export type TurnContext = ReturnType<typeof buildTurnContext>;
