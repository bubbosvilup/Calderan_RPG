import type { CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import type { TurnContext } from "../context/context-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { boundPartner, noCompetingSpeaker } from "./canonical-name-disclosure.js";
import { castingOptions } from "./scene-participants.js";
import { compatible, headNoun } from "./canonical-interaction-targets.js";
import { NAME_REQUEST, SELF_INTRODUCTION, asksName } from "./identity-request.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { narratedSpeakerPartner } from "./foreground-binding.js";
import { type NarrationFactSource, createFactSource, nameFilter, speechTags } from "../narration-facts/index.js";

/**
 * Post-narration identity protection (P0 identity hotfix). The Narrator is told who the current conversation partner objectively is, but
 * the engine must stay correct even when the model ignores that: a canonical partner who "introduces themselves" under a different
 * personal name is still that canonical actor. Policy implemented: REJECT the conflicting name. No character, alias or participant is
 * created for it, the actor's player-known name stays unknown, and the audit asks for one bounded revision so the delivered text does not
 * show the player an invented identity (see the `canonical_name_conflict` audit issue). Nothing is rewritten by the engine itself.
 *
 * Scope is deliberately narrow: only a direct name request (or self-introduction) answered while a canonical partner is bound, and only
 * when every narrated speaker attribution is consistent with that partner. A different explicit speaker ("the thin man beside him says
 * I'm Erdan"), a true new person ("A second man steps forward. I'm Erdan.") and an ambiguous addressee all fall through to the ordinary
 * rules, which may create or bind exactly one person for that name.
 *
 * Block 11: the names are read from the shared NarrationFacts (the scene reading and the delivered narration's `self_introduction` and
 * `reference` facts); this guard keeps only its policy (which partner, which names conflict) and no name grammar of its own.
 */
export interface PartnerNameConflict {
  readonly partner_id: string;
  /** The actor's own public name, when it may truthfully introduce itself; otherwise undefined (it should simply not give a name). */
  readonly canonical_name?: string;
  /** Personal names the delivered narration gave as the partner's own self-introduction, none of which is the canonical name. */
  readonly names: readonly string[];
  readonly evidence: readonly string[];
}
export function partnerNameConflict(i: { readonly context: TurnContext; readonly world: WorldStore; readonly snapshot: DeepReadonly<CampaignSnapshot>; readonly finalized: readonly RecentExchange[];
  readonly player_input: string; readonly delivered: string; readonly scene: SceneParticipantPlan; readonly facts?: NarrationFactSource }): PartnerNameConflict | undefined {
  if (!NAME_REQUEST.test(i.player_input) && !SELF_INTRODUCTION.test(i.player_input)) return undefined;
  const last = i.finalized.filter(e => e.status === "finalized").at(-1), here = i.snapshot.runtime.scene.player_location;
  const partner = boundPartner(i.context, i.finalized, i.scene) ?? (!i.scene.focus && last?.location_id === here ? narratedSpeakerPartner(i.context, last?.narration, i.delivered) : undefined);
  if (!partner) return undefined;
  const beats = [...i.delivered.matchAll(/(?<!\\)\*([\s\S]*?)(?<!\\)\*/g)].map(m => m[1]!);
  if (!noCompetingSpeaker(i.context, beats, partner, castingOptions(i.context, i.scene.participants, i.finalized), true)) return undefined;
  const canonical_name = narratorIdentityGate(i.context)?.selfDisclosureName(partner);
  const location_id = i.snapshot.runtime.scene.player_location;
  const source = i.facts ?? createFactSource({ movers: [], context: i.context, names_ok: nameFilter(i.world), player_input: i.player_input, asks_name: asksName });
  const reading = source.scene([...i.finalized, { player: i.player_input, narration: i.delivered, status: "finalized", ...(location_id ? { location_id } : {}) }], i.context, i.world,
    { campaign_names: new Set(i.snapshot.characters.filter(c => !c.retirement).flatMap(c => c.profile.name ? [c.profile.name.toLowerCase()] : [])), rpg_speech: true });
  // Who the partner may be: the partner itself, or a scene-local description the partner fits ("other:man" for Korvin, never "other:woman").
  const fits = (key: string) => key === partner || (key.startsWith("other:") && compatible(i.context, partner, headNoun(key.slice(6))));
  // Only the actor's OWN self-introduction in this exchange: a name another person presents ("That's Brenna") is never the partner's, and
  // neither is a narrated person whose speaker keys the partner cannot be (REPO-12).
  const own = reading.persons.filter(p => p.name && !p.character_id && p.name !== canonical_name && p.keys.every(fits)
    && p.introductions.some(x => x.exchange === reading.latest) && p.introductions.filter(x => x.exchange === reading.latest).every(x => x.kind === "self"));
  const names = own.map(p => p.name!), evidence = own.flatMap(p => p.introductions.filter(x => x.exchange === reading.latest).map(x => x.evidence));
  const ok = nameFilter(i.world), known = new Set(i.context.characters.flatMap(c => [c.profile.name, ...(c.profile.aliases ?? [])].filter((n): n is string => !!n).flatMap(n => n.toLowerCase().split(/\s+/))));
  // Spoken self-introductions of the delivered narration that may be the PARTNER's own. The fact subject is the speaker NarrationFacts
  // attributed the line to: a line whose speaker is another present character, or a described person the partner cannot be ("The woman
  // lifts her head. \"My name is Brenna,\" she whispers." with Korvin as the partner), is that person's self-introduction, never a rename
  // of the partner (REPO-12). An unattributed line, a description the partner fits ("The man leans back") and an ambiguous speaker the
  // partner may be all still count. Answering a name question, the OPENING spoken line may also be (or begin with) the bare name
  // ("Marden. What are you after?").
  const identity = source.of(i.delivered).identity, asked = asksName(i.player_input);
  const mayBePartner = (s: { readonly entity_id?: string; readonly candidates: readonly string[] }) => s.entity_id ? fits(s.entity_id) : !s.candidates.length || s.candidates.some(fits);
  const opening = identity.find(f => f.kind === "speaker_attribution")?.source_text;
  const spoken = identity.flatMap(f => f.kind === "self_introduction" && f.voice === "speech" && mayBePartner(f.subject)
    && (f.form === "bare_name" || f.form === "name_first" ? asked && f.source_text === opening : true) ? [f.name] : []);
  // Another person in the narration ("A second man steps forward", a beat that hands the line to someone "beside him", a beat ending in "says:")
  // means the speech is not provably the partner's.
  const other = identity.some(f => f.kind === "reference" && f.introduces_new)
    || beats.some(b => /:\s*$/.test(b) || speechTags(b, "(?:beside|next to|behind)\\s+(?:him|her)").length > 0);
  if (!other) for (const name of spoken) if (name !== canonical_name && ok(name) && !known.has(name.toLowerCase()) && !names.includes(name)) { names.push(name); evidence.push(name); }
  return names.length ? { partner_id: partner, ...(canonical_name ? { canonical_name } : {}), names, evidence } : undefined;
}
