import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { buildPromotedCharacter } from "../campaign/promotion.js";
import type { TurnContext } from "./context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";
import { establishedFacts, linkedParticipant, readScene } from "./narrated-captives.js";

/**
 * Persistence Pass 1.2 — name-driven persistence. The character-persistence model is intentionally narrow:
 *
 *   narrator-created person ──(a proper name is securely established)──▶ campaign character ──(joins household)──▶ NPC+ (future)
 *
 * plus one functional exception handled by person-transactions.ts: an unnamed person the player acquires. Nothing else promotes:
 * not dialogue, length, wounds, healing, gifts, money, witnessing, rumors, emotional weight, repetition, occupations or descriptions.
 * There is no importance score and no controller decision; this runs deterministically on DELIVERED narration at turn finalization,
 * and its commands commit atomically with the turn. Unresolvable cases do nothing.
 *
 * - Promotion: a named person first named in this exchange, present in the scene (acts, speaks, self-introduced or introduced by
 *   narration's own voice), not a present persistent character and not plausibly a canon person (readScene: RPG speech, actor-bound
 *   canon collisions). The profile holds only established facts; a
 *   name alone is enough. Two different people given the same name in one exchange are both skipped.
 * - Late naming: a present persistent character WITHOUT a name who introduces themselves by name ("My name is Maren") gets that name
 *   on the same record (set_profile). Its ID, origin snapshot, legal state, household and relationships are untouched.
 * - Hardening H1: on a turn where Nicco changes location, a person first named in that narration may be at the origin (left
 *   behind, calling after him) or at the arrival; the narration cannot say which. Promotion is skipped (`location_changed`) rather
 *   than creating a durable character in a possibly wrong place. Late naming is unaffected (it changes no location).
 */
export interface IdentityResolution {
  readonly commands: readonly CampaignCommand[];
  readonly promoted: readonly { readonly character_id: string; readonly name: string; readonly participant_id?: string }[];
  readonly named: readonly { readonly character_id: string; readonly name: string; readonly evidence: string }[];
  readonly skipped: readonly { readonly name: string; readonly reason: "not_in_scene" | "duplicate_name" | "location_changed" }[];
}
export function establishNames(recent: readonly RecentExchange[], context: TurnContext, world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>,
  participants: readonly EphemeralSceneParticipant[], baseRevision: number, options: { readonly location_changed?: boolean } = {}): IdentityResolution {
  const location = context.primary.scene.player_location?.id;
  if (!location) return { commands: [], promoted: [], named: [], skipped: [] };
  const reading = readScene(recent, context, world, { campaign_names: new Set(snapshot.characters.flatMap(c => c.profile.name ? [c.profile.name.toLowerCase()] : [])), rpg_speech: true });
  const nameOf = (id: string) => context.characters.find(c => c.id === id)?.profile.name ?? id;
  const commands: CampaignCommand[] = [], promoted: IdentityResolution["promoted"][number][] = [], named: IdentityResolution["named"][number][] = [], skipped: IdentityResolution["skipped"][number][] = [];
  for (const n of reading.namings.filter(x => x.exchange === reading.latest)) {
    const c = snapshot.characters.find(x => x.id === n.character_id);
    if (!c || c.profile.name) continue;
    commands.push({ kind: "set_profile", character_id: c.id, profile: { ...structuredClone(c.profile) as typeof c.profile & object, name: n.name } as Extract<CampaignCommand, { kind: "set_profile" }>["profile"] });
    named.push({ character_id: c.id, name: n.name, evidence: n.evidence });
  }
  const fresh = reading.persons.filter(p => p.name && !p.character_id && p.introductions.some(i => i.exchange === reading.latest));
  for (const p of fresh) {
    if (fresh.filter(x => x.name === p.name).length > 1) { skipped.push({ name: p.name!, reason: "duplicate_name" }); continue; }
    if (!p.present) { skipped.push({ name: p.name!, reason: "not_in_scene" }); continue; }
    if (options.location_changed) { skipped.push({ name: p.name!, reason: "location_changed" }); continue; }
    const participant = linkedParticipant(p, participants);
    const facts = establishedFacts(p, undefined, nameOf);
    const character = buildPromotedCharacter({ label: p.name!, established: { ...facts.established, ...(p.captive ? { role: "held captive (narrated)" } : {}) }, evidence: facts.evidence,
      location_id: location, trigger: "name_established", promoted_revision: baseRevision + 1, world_minute: snapshot.runtime.scene.world_time.world_minute, ephemeral_ref: participant?.id ?? p.ref });
    commands.push({ kind: "register_character", character });
    promoted.push({ character_id: character.id, name: p.name!, ...(participant ? { participant_id: participant.id } : {}) });
  }
  return { commands, promoted, named, skipped };
}
