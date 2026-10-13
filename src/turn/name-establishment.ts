import type { CampaignCommand, CampaignSnapshot, NameSource } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { linkedParticipant, nameSourceOf, type ProvisionalPerson } from "./provisional-people.js";
import type { TurnContext } from "./context/context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";
import { classifyBackgroundClaim } from "./background-grounding.js";
import { createFactSource, establishedFacts, nameFilter, readScene, type NarrationFactSource } from "./narration-facts/index.js";
import { asksName } from "./identity-request.js";
import type { PartnerNameConflict } from "./partner-identity-guard.js";
import { claimsReservedHandle } from "./canonical-name-reservation.js";

/**
 * Name establishment (Block 5B, AUTH-2). The old model persisted a narrator-introduced person as a CampaignCharacter the moment a proper name was
 * securely established. That made narration alone an irreversible identity authority, so it is REMOVED:
 *
 *   narrator-introduced person ──(name established)──▶ still PROVISIONAL (scene-local, never a CampaignCharacter)
 *   provisional person ──(an action with explicit authority that needs a durable person, e.g. person Actual Offer Accept)──▶ persistent
 *
 * What remains here, deterministic and on DELIVERED narration only:
 * - Provisional reading: a named person first named in this exchange, present in the scene, not a persistent character and not plausibly canon, is
 *   reported as a `ProvisionalPerson` (diagnostic and continuity; nothing commits). Two different people given the same name in one exchange are both skipped.
 * - Late naming: a present PERSISTENT character WITHOUT a name who introduces themselves by name ("My name is Maren") gets that name on the same record
 *   (set_profile). Its ID, origin snapshot, legal state, household and relationships are untouched. Naming an existing identity is not new persistence.
 * - Reserved canonical handles (REPO-12): neither path ever gives a non-canonical person an exact canonical name or alias (`canonical_name_reserved`).
 * - Hardening H1 / ID-1 / canonical-partner skips are unchanged (they now prevent a misleading provisional reading, not a durable fork).
 */
export interface IdentityResolution {
  readonly commands: readonly CampaignCommand[];
  /** AUTH-2: people narration introduced by name who are present and not persistent. They stay PROVISIONAL: no command, no CampaignCharacter. */
  readonly provisional: readonly ProvisionalPerson[];
  readonly named: readonly { readonly character_id: string; readonly name: string; readonly evidence: string }[];
  readonly skipped: readonly { readonly name: string; readonly reason: "not_in_scene" | "duplicate_name" | "location_changed" | "canonical_partner_conflict" | "persistent_identity_elsewhere" | "canonical_name_reserved" }[];
}
export function establishNames(recent: readonly RecentExchange[], context: TurnContext, world: WorldStore, snapshot: DeepReadonly<CampaignSnapshot>,
  participants: readonly EphemeralSceneParticipant[], baseRevision: number, options: { readonly location_changed?: boolean; readonly partner_conflict?: PartnerNameConflict; readonly facts?: NarrationFactSource } = {}): IdentityResolution {
  const location = context.primary.scene.player_location?.id;
  if (!location) return { commands: [], provisional: [], named: [], skipped: [] };
  const readOptions = { campaign_names: new Set(snapshot.characters.filter(c => !c.retirement).flatMap(c => c.profile.name ? [c.profile.name.toLowerCase()] : [])), rpg_speech: true, asks_name: asksName };
  // The ONE scene reading of the turn (NarrationFacts) when the turn's source is available; the same pure reading otherwise.
  const reading = options.facts ? options.facts.scene(recent, context, world, readOptions) : readScene(recent, context, world, readOptions);
    const nameOf = (id: string) => context.characters.find(c => c.id === id)?.profile.name ?? id;
  // Reserved canonical handles (REPO-12), read from the latest narration's identity facts (canonical-name-reservation.ts).
  const latest = recent.at(-1), source = options.facts ?? createFactSource({ movers: [], context, names_ok: nameFilter(world), player_input: latest?.player ?? "", asks_name: asksName });
  const identity = latest?.narration ? source.of(latest.narration).identity : [];
  const reserved = (name: string, self?: string) => claimsReservedHandle(world, identity, name, self);
  const commands: CampaignCommand[] = [], provisional: ProvisionalPerson[] = [], named: IdentityResolution["named"][number][] = [], skipped: IdentityResolution["skipped"][number][] = [];
  for (const n of reading.namings.filter(x => x.exchange === reading.latest)) {
    const c = snapshot.characters.find(x => x.id === n.character_id);
    if (!c || c.profile.name) continue;
    // Canonical names and aliases are reserved identity handles: a non-canonical person never takes one (the record stays unnamed; nothing
    // merges, is renamed or is created). A canonical-origin record's own canonical name is not a collision.
    if (reserved(n.name, c.id)) { skipped.push({ name: n.name, reason: "canonical_name_reserved" }); continue; }
    // Late naming is always the character's own self-introduction (readScene namings come only from `self` introductions).
    commands.push({ kind: "set_profile", character_id: c.id, profile: { ...structuredClone(c.profile) as typeof c.profile & object, name: n.name, name_source: "self_disclosed" } as Extract<CampaignCommand, { kind: "set_profile" }>["profile"] });
    named.push({ character_id: c.id, name: n.name, evidence: n.evidence });
  }
  const fresh = reading.persons.filter(p => p.name && !p.character_id && p.introductions.some(i => i.exchange === reading.latest));
  for (const p of fresh) {
    // Foreground canonical binding: the bound canonical partner's own "self-introduction" under another name never creates a person.
    if (options.partner_conflict?.names.includes(p.name!)) { skipped.push({ name: p.name!, reason: "canonical_partner_conflict" }); continue; }
    // The same reserved-handle rule before materialization: a provisional person never carries a canonical name or alias.
    if (reserved(p.name!)) { skipped.push({ name: p.name!, reason: "canonical_name_reserved" }); continue; }
    if (fresh.filter(x => x.name === p.name).length > 1) { skipped.push({ name: p.name!, reason: "duplicate_name" }); continue; }
    // Block 3 (ID-1): a name that already belongs to a living person the player holds, or a household member, who is elsewhere is that person's identity,
    // never a second record here (the fork). Other same-named people elsewhere stay distinct characters (names are not identity). Nothing is created.
    const bound = new Set([...snapshot.legal_statuses.filter(l => l.status === "enslaved" && l.holder_id === "nicco").map(l => l.character_id), ...snapshot.households.flatMap(h => h.members.filter(m => m.status === "member").map(m => m.character_id))]);
    if (snapshot.characters.some(x => x.id !== "nicco" && bound.has(x.id) && x.origin.kind === "created" && x.current.status !== "dead" && x.profile.name?.toLowerCase() === p.name!.toLowerCase() && x.current.current_location !== location)) { skipped.push({ name: p.name!, reason: "persistent_identity_elsewhere" }); continue; }
    if (!p.present) { skipped.push({ name: p.name!, reason: "not_in_scene" }); continue; }
    if (options.location_changed) { skipped.push({ name: p.name!, reason: "location_changed" }); continue; }
    const participant = linkedParticipant(p, participants);
    const facts = establishedFacts(p, undefined, nameOf, text => classifyBackgroundClaim(text, world).status !== "unverified");
    provisional.push({ ref: participant?.id ?? p.ref, label: p.label, name: p.name!, ...(nameSourceOf(p) ? { name_source: nameSourceOf(p)! } : {}), ...(p.noun ? { noun: p.noun } : {}),
      location_id: location, captive: p.captive, established: facts.established, evidence: facts.evidence, ...(participant ? { participant_id: participant.id } : {}) });
  }
  return { commands, provisional, named, skipped };
}
