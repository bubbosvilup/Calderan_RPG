import type { TurnContext } from "./context-builder.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { projectNarratorFocus } from "./narrator-focus.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { escapeRegExp } from "./language/text.js";
import type { PlayerIntent } from "./player-intent.js";
import { INACTIVE_EXPIRY_TURNS, castingOptions } from "./scene-participants.js";
import { rpgDialogue } from "./rpg-dialogue.js";
import { narratedSpeakerPartner } from "./foreground-binding.js";
import { compatible, headNoun, canonicalInteractionTargets, type CastingOptions } from "./canonical-interaction-targets.js";
import { SPEAKER_NOUNS } from "./narrated-captives.js";
import { participatesInScene } from "./scene-participation.js";
import { NAME_REQUEST, SELF_INTRODUCTION } from "./identity-request.js";

/** Reuse existing address/reference/focus projection; never pick an arbitrary member of a candidate set. */
function disclosureTarget(context: TurnContext, input: string, recent: readonly RecentExchange[], foreground: ReadonlySet<string>, intent?: PlayerIntent, scene?: SceneParticipantPlan) {
  const gate = narratorIdentityGate(context);
  const present = new Set(context.primary.scene.present_characters.filter(c => c.id !== "nicco").map(c => c.id));
  const choose = (ids: readonly string[]) => {
    const candidates = [...new Set(ids.filter(id => id !== "nicco"))];
    return candidates.length === 1 && present.has(candidates[0]!) && gate?.identities.has(candidates[0]!) ? candidates[0] : undefined;
  };
  const recentPartner = () => {
    const location = context.primary.scene.player_location?.id;
    for (const exchange of recent.filter(e => e.status === "finalized" && (!e.location_id || e.location_id === location)).slice(-INACTIVE_EXPIRY_TURNS).reverse()) {
      const prior = projectNarratorFocus(context, exchange.player, [], { candidates: [], runtime: [] }).foreground;
      if (prior.size) return choose([...prior]);
      if (/\b(?:walk\w*|go(?:es|ing)?|move\w*|return\w*|join\w*|turn\w*|look\w*|focus\w*|wait\w*)\b/i.test(exchange.player)) return undefined;
    }
    return undefined;
  };
  if (scene?.addressed.length) {
    const addressed = choose(scene.addressed);
    if (addressed) return addressed;
    // Existing participant planning can retain a generic temporary "Man" for a descriptor that also resolves
    // uniquely to a canonical NPC. Its automatic "you" continuation is weaker than that explicit descriptor.
    const shadow = scene.addressed.length === 1 && scene.participants.find(p => p.id === scene.addressed[0]);
    const partner = recentPartner();
    const latest = recent.filter(e => e.status === "finalized").at(-1);
    const latestTarget = latest ? projectNarratorFocus(context, latest.player, [], { candidates: [], runtime: [] }).foreground : new Set<string>();
    if (!(shadow && shadow.role === "person" && !shadow.descriptor && shadow.created_turn === scene.turn - 1
      && partner && latestTarget.size === 1 && latestTarget.has(partner) && foreground.has(partner)
      && !/\b(?:the|that|this|same)\s+(?:man|woman|person)\b/i.test(input))) return undefined;
    return partner;
  }
  const references = intent?.resolved_references?.flatMap(ref => ref.ids).filter(id => context.characters.some(c => c.id === id && id !== "nicco")) ?? [];
  if (references.length) return choose(references);
  const current = projectNarratorFocus(context, input, [], { candidates: [], runtime: [] }).foreground;
  if (current.size) return choose([...current]);
  if (scene?.focus) return choose([scene.focus]);
  const lastExchange = recent.filter(e => e.status === "finalized").at(-1);
  if (scene?.participants.some(p => p.created_turn === scene.turn - 1)
    && (!lastExchange || projectNarratorFocus(context, lastExchange.player, [], { candidates: [], runtime: [] }).foreground.size !== 1)) return undefined;
  if (foreground.size === 1) return choose([...foreground]);
  // Foreground can contain several inspected/active actors. The most recent explicit partner is more specific.
  const partner = recentPartner();
  if (partner) return partner;
  if (foreground.size || scene?.participants.length || context.characters.some(c => c.id !== "nicco" && !gate?.identities.has(c.id))) return undefined;
  return choose([...present]);
}

/** A social opportunity and one resolved partner, never a roster-wide identity grant. */
export function canonicalNameDisclosure(context: TurnContext, input: string, recent: readonly RecentExchange[], foreground: ReadonlySet<string>, intent?: PlayerIntent, scene?: SceneParticipantPlan) {
  if (!NAME_REQUEST.test(input) && !SELF_INTRODUCTION.test(input)) return undefined;
  const gate = narratorIdentityGate(context);
  const target = disclosureTarget(context, input, recent, foreground, intent, scene);
  const person = context.primary.scene.present_characters.find(c => c.id === target);
  if (!person) return undefined;
  const identity = gate?.identities.get(person.id);
  if (!identity || identity.player_known_name || "confidential_encounter" in person) return undefined;
  const name = gate?.selfDisclosureName(person.id);
  return name ? { internal_id: person.id, ref: identity.ref, canonical_name: name } : undefined;
}

/** Leading observable subject only, never the rest of an action or an entire multi-sentence paragraph. */
function observableSubject(text: string): string | undefined {
  const match = text.trim().match(new RegExp(`^(?:the|a|an|another|that|this)\\s+(?:[a-z][a-z',-]*\\s+){0,4}?(?:${SPEAKER_NOUNS})\\b`, "i"));
  if (!match || /^another\b/i.test(match[0]) || /^\s+(?:and|or)\b/i.test(text.trim().slice(match[0].length))) return undefined;
  return match[0];
}

/** Conservative evidence guard for engine-only attribution. Unknown explicit people and plural/opposite pronouns fail closed. */
export function noCompetingSpeaker(context: TurnContext, narration: readonly string[], target: string, casting: CastingOptions = {}, bound = false): boolean {
  const identity = narratorIdentityGate(context)!.identities.get(target)!;
  // For the engine-bound conversation partner a bare definite reference nobody else fits ("The man leans back") is that partner; a different explicit person still fails.
  const isTarget = (phrase: string) => { const resolved = canonicalInteractionTargets(context, `I address ${phrase}`, casting); return resolved.size === 1 ? resolved.has(target) : bound && resolved.size === 0 && compatible(context, target, headNoun(phrase)); };
  for (const block of narration) for (const sentence of block.split(/(?<=[.!?])\s+|;\s*|,\s*(?:while|whereas)\s+/)) {
    if (/\bNPC\d+\b/.test(sentence)) return false;
    const explicit = canonicalInteractionTargets(context, sentence, casting);
    // A mention of another canonical person in an attribution/action block could introduce another speaker.
    if ([...explicit].some(id => id !== target)) return false;
    if (context.characters.some(c => c.id !== target && c.id !== "nicco" && participatesInScene(sentence, [c.profile.name ?? c.id, ...(c.profile.aliases ?? [])]))) return false;
    for (const event of sentence.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:says|asks|replies|answers|speaks|introduces|whispers|mutters)\b/g)) {
      if (!/^(?:He|She)$/.test(event[1]!) && !canonicalInteractionTargets(context, event[1]!, casting).has(target)) return false;
    }
    for (const event of sentence.matchAll(new RegExp(`\\b((?:the|a|an|another|that|this)\\s+(?:[a-z][a-z',-]*\\s+){0,4}?(?:${SPEAKER_NOUNS}))\\s+(?:says|asks|replies|answers|speaks|introduces|whispers|mutters)\\b`, "gi"))) {
      if (!isTarget(event[1]!)) return false;
    }
    const subject = observableSubject(sentence);
    if (subject) {
      if (!isTarget(subject)) return false;
    } else if (new RegExp(`^(?:the|a|an|another|that|this)\\s+(?:[a-z][a-z',-]*\\s+){0,4}?(?:${SPEAKER_NOUNS})\\b`, "i").test(sentence.trim())) return false;
    if (/^\s*(?:they|their)\b/i.test(sentence)) return false;
    if (/^\s*(?:she|her)\b/i.test(sentence) && /\bman\b/.test(identity.observable_label)) return false;
    if (/^\s*(?:he|his)\b/i.test(sentence) && /\bwoman\b/.test(identity.observable_label)) return false;
    if (/^\s*(?:Nicco|I|you)\b/i.test(sentence) && /\b(?:says?|asks?|replies?|answers?|speaks?|introduces?)\b/i.test(sentence)) return false;
  }
  return true;
}

/**
 * The objective canonical conversation partner of this turn, or undefined: the one canonical actor the planner bound as the current
 * addressee (explicit selection or continuation) or, when nobody was selected this turn, the partner the previous exchange recorded
 * (explicit selection or narrated surfacing, foreground-binding.ts) at this location.
 */
export function boundPartner(context: TurnContext, recent: readonly RecentExchange[], scene: SceneParticipantPlan): string | undefined {
  const here = context.primary.scene.player_location?.id, last = recent.filter(e => e.status === "finalized").at(-1);
  const gate = narratorIdentityGate(context);
  if (scene.focus && scene.addressed.length === 1 && scene.addressed[0] === scene.focus && scene.canonical_location_id === here && gate?.identities.has(scene.focus)) return scene.focus;
  if (!scene.focus && !scene.addressed.length && last?.conversation_partner_id && last.location_id === here && gate?.identities.has(last.conversation_partner_id)) return last.conversation_partner_id;
  return undefined;
}

/** Evidence-only parser: a supplied canonical self-introduction in an attributed RPG speech segment.
 * No output rewriting, name mentions, inferred introductions or roster-wide discovery. Ambiguity grants nothing. */
export function establishedCanonicalDisclosure(context: TurnContext, input: string, recent: readonly RecentExchange[], delivered: string, scene: SceneParticipantPlan, intent: PlayerIntent = { candidates: [], runtime: [] }) {
  const focus = projectNarratorFocus(context, input, recent, intent, scene);
  let capability = canonicalNameDisclosure(context, input, recent, focus.foreground, intent, scene);
  // Nobody was bound before this turn (several people were shown): the narration's own speaker, resolved only among the people just shown, may be the answering canonical actor.
  const last = recent.filter(e => e.status === "finalized").at(-1), inferred = !capability && !scene.focus && NAME_REQUEST.test(input) && last?.location_id === context.primary.scene.player_location?.id
    ? narratedSpeakerPartner(context, last?.narration, delivered) : undefined;
  if (inferred) { const gate = narratorIdentityGate(context), identity = gate?.identities.get(inferred), canonical_name = gate?.selfDisclosureName(inferred);
    if (identity && !identity.player_known_name && canonical_name) capability = { internal_id: inferred, ref: identity.ref, canonical_name }; }
  if (!capability) return undefined;
  const name = escapeRegExp(capability.canonical_name);
  const intro = new RegExp(`^(?:["“])?(?:I'm|I’m|I am|My name is|My name's|Call me)\\s+${name}[.!]?(?:["”])?$`, "i");
  const bareName = new RegExp(`^(?:["“])?${name}[.!]?(?:["”])?$`, "i");
  const spoken = rpgDialogue(delivered);
  if (!spoken?.length) return undefined;
  const starred = (text: string) => [...text.matchAll(/(?<!\\)\*([\s\S]*?)(?<!\\)\*/g)].map(m => m[1]!);
  // Who speaks a line is decided by the narration that comes BEFORE it; a bystander described after the name was given does not compete for it.
  const lines = delivered.split(/\n+/).map(p => p.trim()).filter(Boolean), nameAt = lines.findIndex(l => !l.startsWith("*") && (NAME_REQUEST.test(input) ? l.split(/(?<=[.!?])\s+/) : [l]).some(x => intro.test(x.replace(/^["“]|["”]$/g, "")) || bareName.test(x.replace(/^["“]|["”]$/g, ""))));
  const narration = nameAt >= 0 ? starred(lines.slice(0, nameAt).join("\n")) : starred(delivered);
  const casting = castingOptions(context, scene.participants, recent);
  const safeBound = (inferred === capability.internal_id && noCompetingSpeaker(context, narration, capability.internal_id, casting, true)) || (boundPartner(context, recent, scene) === capability.internal_id && noCompetingSpeaker(context, narration, capability.internal_id, casting, true));
  // Answering a direct name question, the name may be one whole sentence of a longer line ("Korvin. What are you after?"); still never a name inside a sentence.
  const asked = NAME_REQUEST.test(input), sentenceOf = (segment: string) => asked ? segment.split(/(?<=[.!?])\s+/) : [segment];
  if (safeBound && spoken.some(segment => intro.test(segment) || bareName.test(segment) || sentenceOf(segment).some(x => intro.test(x) || bareName.test(x)))) return capability.internal_id;
  const paragraphs = delivered.split(/\n+/).map(p => p.trim()).filter(Boolean);
  for (let i = 1; i < paragraphs.length; i++) {
    if (!intro.test(paragraphs[i]!) && !(NAME_REQUEST.test(input) && bareName.test(paragraphs[i]!))) continue;
    const beat = paragraphs[i - 1]!;
    if (!beat.startsWith("*") || !beat.endsWith("*")) continue;
    if (!noCompetingSpeaker(context, [beat.slice(1, -1)], capability.internal_id, casting)) continue;
    const subject = observableSubject(beat.slice(1, -1));
    if (!subject || !/^the\s/i.test(subject) || /\b(?:Nicco|and|or)\b/i.test(subject) || /\bNPC\d+\b/i.test(beat)) continue;
    const attribution = projectNarratorFocus(context, `I address ${subject}`, [], { candidates: [], runtime: [] });
    if (attribution.foreground.size === 1 && attribution.foreground.has(capability.internal_id)) return capability.internal_id;
  }
  return undefined;
}
