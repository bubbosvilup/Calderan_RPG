import { createHash } from "node:crypto";
import type { CampaignCharacter, CampaignCommand, CampaignSnapshot, NameSource } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context/context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";
import { linkedParticipant, materializeProvisional, nameSourceOf } from "./provisional-people.js";
import { createFactSource, nameFilter, readScene, type NarratedPerson } from "./narration-facts/index.js";
import { asksName } from "./identity-request.js";
import { claimsReservedHandle } from "./canonical-name-reservation.js";

/**
 * Block 12 (KPG-1): [ Keep track ], the player's explicit, deterministic action that makes ONE provisional person of the current scene a persistent
 * ordinary campaign character, the SAME identity the scene already showed. It is the only generic persistence act besides the person Actual Offer
 * Accept, and like Accept it is a UI action with its own ref- and revision-guarded entry point (GameSession.keepTrack), never a turn outcome:
 *
 *   provisional person (scene reading + session scene participants) ──[ Keep track ] (opaque token + expected_revision)──▶ ONE register_character
 *
 * What it is NOT: no fuzzy matching, no name merge, no importance inference, no embedding or model call; narration, a spoken name, repeated
 * appearances or the player's words never reach it. It adds the person to no household, makes nobody NPC+, sets no legal status, ownership,
 * relationship or inventory, and copies only the identity facts narration established (materializeProvisional `identity_only`).
 *
 * The browser holds an opaque token per person (campaign-bound hash of the scene ref and the location); the server recomputes the list and resolves
 * the token, so the client never supplies a name, an id or a payload.
 */
export type KeepBlock = "ambiguous_name" | "same_name_persistent" | "canonical_name" | "offer_subject";
export interface TrackablePerson {
  readonly token: string;
  /** Scene reference (`narrated:<name|noun>` or the linked `scene_npc_<n>` participant id): the ephemeral_ref the character will record. Server only. */
  readonly ref: string;
  /** Player-facing label, distinguished when two people share one ("Guard (2)"). */
  readonly label: string;
  readonly name?: string;
  readonly name_source?: NameSource;
  readonly captive: boolean;
  readonly location_id: string;
  /** The narrated person the scene reading established (absent for a participant narration never described). */
  readonly person: NarratedPerson;
  readonly participant_id?: string;
  /** Present and visible, but the action is refused (fail closed) for this reason. */
  readonly blocked?: KeepBlock;
}

/** Opaque, campaign-bound token: the same scene person at the same place in the same campaign always gets the same token; nothing else does. */
export function keepToken(campaign_id: string, ref: string, location_id: string): string {
  return createHash("sha256").update(`keep-track\0${campaign_id}\0${ref}\0${location_id}`).digest("hex").slice(0, 24);
}

/** The persistent (not retired) character already materialized from this token's person, by Keep track or by an earlier Accept (idempotency). */
export function keptCharacter(snapshot: DeepReadonly<CampaignSnapshot>, token: string): string | undefined {
  return snapshot.characters.find(c => !c.retirement && c.origin_snapshot?.ephemeral_ref && keepToken(snapshot.campaign_id, c.origin_snapshot.ephemeral_ref, c.origin_snapshot.location_id) === token)?.id;
}

const CAPTIVE_ROLE = "narrated captive; legal status unestablished";
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const nounOf = (p: EphemeralSceneParticipant) => (p.descriptor?.split(/\s+/).at(-1) ?? (p.role === "person" ? p.display_name : "")).toLowerCase() || undefined;

export interface TrackableInput {
  readonly recent: readonly RecentExchange[];
  readonly context: TurnContext;
  readonly world: WorldStore;
  readonly snapshot: DeepReadonly<CampaignSnapshot>;
  readonly participants: readonly EphemeralSceneParticipant[];
}
/**
 * The provisional people of the current scene, deterministic and read-only: (1) named narrated people who are present and not persistent, (2) unnamed
 * narrated captives only when exactly one scene participant is that person, (3) the remaining present scene participants. An unnamed description that no
 * single participant anchors is never listed (one noun can cover several people). Fail-closed reasons are reported, not hidden.
 */
export function trackablePeople(i: TrackableInput): readonly TrackablePerson[] {
  const location = i.context.primary.scene.player_location?.id;
  if (!location) return [];
  const snapshot = i.snapshot;
  const readOptions = { campaign_names: new Set(snapshot.characters.filter(c => !c.retirement).flatMap(c => c.profile.name ? [c.profile.name.toLowerCase()] : [])), rpg_speech: true, asks_name: asksName };
  const reading = readScene(i.recent, i.context, i.world, readOptions);
  const here = i.participants.filter(p => p.location_id === location && !p.departed);
  const used = new Set<string>();
  const out: Omit<TrackablePerson, "token" | "label" | "blocked">[] = [];
  for (const p of reading.persons) {
    if (p.character_id || !p.present) continue;
    const participant = linkedParticipant(p, here);
    if (!p.name && !participant) continue; // an unanchored description: fail closed
    if (participant) used.add(participant.id);
    out.push({ ref: participant?.id ?? p.ref, ...(p.name ? { name: p.name } : participant?.established_name ? { name: participant.established_name } : {}), ...(nameSourceOf(p) ? { name_source: nameSourceOf(p)! } : {}),
      captive: p.captive || participant?.role === "slave", location_id: location, person: p, ...(participant ? { participant_id: participant.id } : {}) });
  }
  for (const p of here) {
    if (used.has(p.id)) continue;
    const noun = nounOf(p);
    const person: NarratedPerson = { ref: p.id, ...(p.established_name ? { name: p.established_name } : {}), ...(noun ? { noun } : {}), label: p.established_name ?? `the ${p.display_name.toLowerCase()}`,
      units: [], in_latest: false, captive: p.role === "slave", present: true, introductions: [], keys: [] };
    out.push({ ref: p.id, ...(p.established_name ? { name: p.established_name } : {}), captive: p.role === "slave", location_id: location, person, participant_id: p.id });
  }
  const offered = new Set((snapshot.trade_offers ?? []).filter(o => o.status === "active" && o.subject.kind === "person")
    .flatMap(o => o.subject.kind === "person" ? o.subject.plan.flatMap(c => c.kind === "register_character" && c.character.origin_snapshot?.ephemeral_ref ? [c.character.origin_snapshot.ephemeral_ref] : []) : []));
  const persistentNames = new Set(snapshot.characters.filter(c => c.id !== "nicco" && !c.retirement && c.profile.name).map(c => c.profile.name!.toLowerCase()));
  // Reserved canonical names and aliases, the same rule as name establishment, over the identity facts of every narration of the scene.
  const source = createFactSource({ movers: [], context: i.context, names_ok: nameFilter(i.world), player_input: i.recent.at(-1)?.player ?? "", asks_name: asksName });
  const identity = i.recent.flatMap(e => e.narration ? source.of(e.narration).identity : []);
  const display = out.map(o => o.name ?? capital(o.person.label.replace(/^the\s+/i, "")));
  return out.map((o, k) => {
    const sameLabel = display.filter(d => d === display[k]).length > 1;
    const descriptor = i.participants.find(p => p.id === o.participant_id)?.descriptor;
    const label = !sameLabel ? display[k]! : descriptor && display.filter((d, j) => d === display[k] && i.participants.find(p => p.id === out[j]!.participant_id)?.descriptor === descriptor).length === 1
      ? `${display[k]} (${descriptor})` : `${display[k]} (${display.slice(0, k + 1).filter(d => d === display[k]).length})`;
    const name = o.name?.toLowerCase();
    const blocked: KeepBlock | undefined = offered.has(o.ref) ? "offer_subject"
      : name && out.filter(x => x.name?.toLowerCase() === name).length > 1 ? "ambiguous_name"
      : o.name && claimsReservedHandle(i.world, identity, o.name) ? "canonical_name" // a reserved canonical name or alias
      : name && persistentNames.has(name) ? "same_name_persistent" : undefined;
    return { ...o, token: keepToken(snapshot.campaign_id, o.ref, o.location_id), label, ...(blocked ? { blocked } : {}) };
  });
}

/**
 * THE Keep track plan: one `register_character` for this person, built by the single materialization builder. An ordinary campaign character (origin
 * `created`, trigger `player_kept`): current location, active, the established identity facts, the scene ref as provenance. A captive keeps the neutral
 * provenance role "narrated captive; legal status unestablished" (no legal record), so a later person offer for them binds to this SAME id.
 */
export function keepTrackCommand(person: TrackablePerson, snapshot: DeepReadonly<CampaignSnapshot>, nameOf: (id: string) => string): { readonly command: CampaignCommand; readonly character: CampaignCharacter } {
  const character = materializeProvisional({ person: person.person, label: person.name ?? person.person.label, name_of: nameOf, location_id: person.location_id, trigger: "player_kept",
    base_revision: snapshot.revision, world_minute: snapshot.runtime.scene.world_time.world_minute, ephemeral_ref: person.ref, identity_only: true,
    ...(person.captive ? { role: CAPTIVE_ROLE } : {}), ...(person.name && person.name_source ? { name_source: person.name_source } : {}) });
  // A name narration never gave the participant (only the participant registry carried it) still names the same record.
  const named = person.name && !character.profile.name ? { ...character, profile: { ...character.profile, name: person.name } } : character;
  return { command: { kind: "register_character", character: named }, character: named };
}

export const KEEP_MESSAGES: Readonly<Record<KeepBlock | "unknown_person" | "stale" | "rejected" | "already_kept", string>> = {
  unknown_person: "That person is no longer in the scene. Nothing changed.",
  stale: "The campaign changed since this list was shown. Check the scene and try again.",
  rejected: "That person could not be kept. The campaign is unchanged.",
  already_kept: "That person is already kept.",
  ambiguous_name: "Two people here share that name, so it is unclear who to keep. Nothing changed.",
  same_name_persistent: "Someone with that name is already a known character. Names are not identity, so nothing was merged or created.",
  canonical_name: "That name belongs to a known figure of the world. Nothing was created.",
  offer_subject: "This person is the subject of the open offer. Accepting it already keeps them.",
};
