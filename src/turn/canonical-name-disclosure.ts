import type { TurnContext } from "./context-builder.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { projectNarratorFocus } from "./narrator-focus.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { escapeRegExp } from "./language/text.js";
import type { PlayerIntent } from "./player-intent.js";
import { INACTIVE_EXPIRY_TURNS } from "./scene-participants.js";

const NAME_REQUEST = /\b(?:who am i (?:speaking|talking) (?:with|to)|who are you|your name|introduce yourself|what (?:are you called|should i call you))\b/i;
const SELF_INTRODUCTION = /\b(?:my name(?:['’]s| is)|(?:name['’]s|i(?:['’]m| am))\s+Nicco)\b/i;

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

/** Evidence-only parser: a supplied canonical self-introduction, immediately attributed by a unique observable descriptor.
 * No output rewriting, name mentions, inferred introductions or roster-wide discovery. Ambiguity grants nothing. */
export function establishedCanonicalDisclosure(context: TurnContext, input: string, recent: readonly RecentExchange[], delivered: string, scene: SceneParticipantPlan, intent: PlayerIntent = { candidates: [], runtime: [] }) {
  const focus = projectNarratorFocus(context, input, recent, intent, scene);
  const capability = canonicalNameDisclosure(context, input, recent, focus.foreground, intent, scene);
  if (!capability) return undefined;
  const name = escapeRegExp(capability.canonical_name);
  const intro = new RegExp(`^(?:["“])?(?:I'm|I’m|I am|My name is|My name's|Call me)\\s+${name}(?:[.!,"”]|$)`, "i");
  const bareName = new RegExp(`^(?:["“])?${name}[.!]?(?:["”])?$`, "i");
  const paragraphs = delivered.split(/\n+/).map(p => p.trim()).filter(Boolean);
  for (let i = 1; i < paragraphs.length; i++) {
    if (!intro.test(paragraphs[i]!) && !(NAME_REQUEST.test(input) && bareName.test(paragraphs[i]!))) continue;
    const beat = paragraphs[i - 1]!;
    if (!beat.startsWith("*") || !beat.endsWith("*")) continue;
    const subject = beat.slice(1, -1).split(/\b(?:says|replies|answers|introduces|nods|smiles|shrugs|gives|casts|looks|watches|scratches|studies|regards|tilts|meets|turns|offers|takes|leans)\b/i)[0]!.trim();
    if (!/^the\s/i.test(subject) || /\b(?:Nicco|and|or|NPC\d+)\b/i.test(subject)) continue;
    const attribution = projectNarratorFocus(context, `I address ${subject}`, [], { candidates: [], runtime: [] });
    if (attribution.foreground.size === 1 && attribution.foreground.has(capability.internal_id)) return capability.internal_id;
  }
  return undefined;
}
