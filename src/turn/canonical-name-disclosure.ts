import type { TurnContext } from "./context-builder.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { projectNarratorFocus } from "./narrator-focus.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { escapeRegExp } from "./language/text.js";

/** A social opportunity and one unambiguous current partner, never a roster-wide identity grant. */
export function canonicalNameDisclosure(context: TurnContext, input: string, recent: readonly RecentExchange[], foreground: ReadonlySet<string>) {
  if (!/\b(?:my name(?:'s| is)|i(?:'m| am) Nicco|introduce yourself|your name|what (?:are you called|should I call you))\b/i.test(input)) return undefined;
  const gate = narratorIdentityGate(context);
  const partners = context.primary.scene.present_characters.filter(c => c.id !== "nicco" && foreground.has(c.id));
  if (partners.length !== 1) return undefined;
  const person = partners[0]!, identity = gate?.identities.get(person.id);
  if (!identity || identity.player_known_name || "confidential_encounter" in person) return undefined;
  const name = gate?.selfDisclosureName(person.id);
  return name ? { internal_id: person.id, ref: identity.ref, canonical_name: name } : undefined;
}

/** Evidence-only parser: a supplied canonical self-introduction, immediately attributed by a unique observable descriptor.
 * No output rewriting, name mentions, inferred introductions or roster-wide discovery. Ambiguity grants nothing. */
export function establishedCanonicalDisclosure(context: TurnContext, input: string, recent: readonly RecentExchange[], delivered: string, scene: SceneParticipantPlan) {
  const focus = projectNarratorFocus(context, input, recent, { candidates: [], runtime: [] }, scene);
  const capability = canonicalNameDisclosure(context, input, recent, focus.foreground);
  if (!capability) return undefined;
  const name = escapeRegExp(capability.canonical_name);
  const intro = new RegExp(`^(?:["“])?(?:I'm|I’m|I am|My name is|My name's|Call me)\\s+${name}(?:[.!,"”]|$)`, "i");
  const paragraphs = delivered.split(/\n\s*\n/).map(p => p.trim());
  for (let i = 1; i < paragraphs.length; i++) {
    if (!intro.test(paragraphs[i]!)) continue;
    const beat = paragraphs[i - 1]!;
    if (!beat.startsWith("*") || !beat.endsWith("*")) continue;
    const subject = beat.slice(1, -1).split(/\b(?:says|replies|answers|introduces|nods|smiles|shrugs)\b/i)[0]!.trim();
    if (!/^the\s/i.test(subject) || /\b(?:Nicco|and|or|NPC\d+)\b/i.test(subject)) continue;
    const attribution = projectNarratorFocus(context, `I address ${subject}`, [], { candidates: [], runtime: [] });
    if (attribution.foreground.size === 1 && attribution.foreground.has(capability.internal_id)) return capability.internal_id;
  }
  return undefined;
}
