import type { CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { boundPartner, noCompetingSpeaker } from "./canonical-name-disclosure.js";
import { castingOptions } from "./scene-participants.js";
import { NAME_REQUEST, SELF_INTRODUCTION } from "./identity-request.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { narratedSpeakerPartner } from "./foreground-binding.js";
import { nameFilter, readScene } from "./narrated-captives.js";
import { asksName } from "./narrated-captives.js";

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
  readonly player_input: string; readonly delivered: string; readonly scene: SceneParticipantPlan }): PartnerNameConflict | undefined {
  if (!NAME_REQUEST.test(i.player_input) && !SELF_INTRODUCTION.test(i.player_input)) return undefined;
  const last = i.finalized.filter(e => e.status === "finalized").at(-1), here = i.snapshot.runtime.scene.player_location;
  const partner = boundPartner(i.context, i.finalized, i.scene) ?? (!i.scene.focus && last?.location_id === here ? narratedSpeakerPartner(i.context, last?.narration, i.delivered) : undefined);
  if (!partner) return undefined;
  const beats = [...i.delivered.matchAll(/(?<!\\)\*([\s\S]*?)(?<!\\)\*/g)].map(m => m[1]!);
  if (!noCompetingSpeaker(i.context, beats, partner, castingOptions(i.context, i.scene.participants, i.finalized), true)) return undefined;
  const canonical_name = narratorIdentityGate(i.context)?.selfDisclosureName(partner);
  const location_id = i.snapshot.runtime.scene.player_location;
  const reading = readScene([...i.finalized, { player: i.player_input, narration: i.delivered, status: "finalized", ...(location_id ? { location_id } : {}) }], i.context, i.world,
    { campaign_names: new Set(i.snapshot.characters.flatMap(c => c.profile.name ? [c.profile.name.toLowerCase()] : [])), rpg_speech: true });
  // Only the actor's OWN self-introduction in this exchange: a name another person presents ("That's Brenna") is never the partner's.
  const own = reading.persons.filter(p => p.name && !p.character_id && p.name !== canonical_name
    && p.introductions.some(x => x.exchange === reading.latest) && p.introductions.filter(x => x.exchange === reading.latest).every(x => x.kind === "self"));
  const names = own.map(p => p.name!), evidence = own.flatMap(p => p.introductions.filter(x => x.exchange === reading.latest).map(x => x.evidence));
  // An explicit name question answered by a line that OPENS with a personal name ("Marden. What are you after?") is the same self-introduction.
  const ok = nameFilter(i.world), known = new Set(i.context.characters.flatMap(c => [c.profile.name, ...(c.profile.aliases ?? [])].filter((n): n is string => !!n).flatMap(n => n.toLowerCase().split(/\s+/))));
  // Speech is whatever lies outside the starred narration. noCompetingSpeaker already established that no other person is its speaker.
  const speech = i.delivered.replace(/(?<!\\)\*[\s\S]*?(?<!\\)\*/g, "\n").split(/\n/).map(l => l.trim()).filter(Boolean).join(" ");
  const NAME = "([A-Z][a-z]{2,})";
  const spoken = [speech.match(new RegExp(`(?:^|["“\\s])(?:I'm|I’m|I am|My name is|My name's|Name's|Name is|Call me)\\s+${NAME}\\b`))?.[1],
    asksName(i.player_input) ? speech.match(new RegExp(`^["“]?${NAME}[.,!]`))?.[1] : undefined];
  // Another person attributed in the narration ("the thin man beside him says:", "A second man steps forward") means the speech is not provably the partner's.
  const other = beats.some(b => /:\s*$|\b(?:another|second|other|companion|stranger|bystander)\s+(?:man|woman|boy|girl|youth|person|figure)\b|\b(?:beside|next to|behind)\s+(?:him|her)\s+(?:says?|speaks?|asks?|answers?|replies|interjects?|adds?|calls?)\b/i.test(b));
  if (!other) for (const opening of spoken) if (opening && opening !== canonical_name && ok(opening) && !known.has(opening.toLowerCase()) && !names.includes(opening)) { names.push(opening); evidence.push(opening); }
  return names.length ? { partner_id: partner, ...(canonical_name ? { canonical_name } : {}), names, evidence } : undefined;
}
