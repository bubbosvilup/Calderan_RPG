import type { TurnContext } from "./context/context-builder.js";
import { compatible, headNoun, surfacedCanonicalMatch, strongCanonicalMatch, traitMatches } from "./canonical-interaction-targets.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { rpgNarration } from "./rpg-dialogue.js";
import { sentencesOf } from "./language/text.js";

/**
 * Foreground canonical binding (P0 identity hotfix). Objective identity is the engine's; the label the player knows is a separate fact.
 *
 * Two upstream paths bind a canonical NPC as the current foreground interaction partner BEFORE the next Narrator call:
 *   1. the player's explicit selection (canonical-interaction-targets.ts: a name, a descriptor, "goes to the tall man with a tonsure"),
 *      resolved by the participant planner; and
 *   2. NARRATED SURFACING (this module): the Narrator was handed the present canonical actors' authored appearance as background labels,
 *      and its delivered narration then foregrounds exactly one of them. The engine verifies that against the authored traits with the
 *      same strong, exclusive rule used for definite references (at least STRONG_TRAITS distinct traits, compatible sex and role, no
 *      second eligible candidate with even two). The binding is the engine's verification of a supplied canonical actor, never the prose
 *      alone: it is scoped to canonical actors present in the authoritative scene, fails closed on any ambiguity, and background people
 *      are never canon-cast.
 *
 * Retrieval stays information; this selection becomes the objective actor identity of the scene's conversation partner. The binding is
 * session-local continuity (scene participants and the recent exchange), never a campaign mutation: the player's knowledge of the name
 * is a separate fact that changes only through a legitimate disclosure.
 */
export function narratedForegroundCanonical(context: TurnContext, delivered: string): string | undefined {
  // Several established people shown together ("two sellers along the lane") leave the player's partner unchosen: nobody is bound.
  if (surfacedCanonicals(context, delivered).length > 1) return undefined;
  const spans = rpgNarration(delivered);
  const text = (spans.length ? spans.join(" ") : delivered.replace(/["“”][^"“”]*["“”]/g, " ")).replace(/[*_]/g, "");
  const found = new Set<string>();
  const sentences = sentencesOf(text);
  // One sentence, or two adjacent ones (an appearance is often spread over two): a window evidencing two different actors binds nobody.
  for (let i = 0; i < sentences.length; i++) for (const window of [sentences[i]!, sentences.slice(i, i + 2).join(" ")]) {
    const id = strongCanonicalMatch(context, window);
    if (id) found.add(id);
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * Canonical actors the previous narration put in front of the player: a single sentence whose description fits exactly ONE present canonical
 * actor (exclusive rule), so two sellers surfaced together are both candidates but neither is the player's chosen partner yet.
 */
export function surfacedCanonicals(context: TurnContext, narration: string | undefined): readonly string[] {
  return [...surfacedSentences(context, narration).keys()];
}
/** The sentences of the narration that introduced each surfaced canonical actor (their antecedents for later definite references). */
function surfacedSentences(context: TurnContext, narration: string | undefined): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, string[]>();
  if (!narration) return found;
  const spans = rpgNarration(narration), text = (spans.length ? spans.join(" ") : narration.replace(/["“”][^"“”]*["“”]/g, " ")).replace(/[*_]/g, "");
  for (const sentence of sentencesOf(text)) { const id = surfacedCanonicalMatch(context, sentence); if (id) found.set(id, [...(found.get(id) ?? []), sentence]); }
  return found;
}
const content = (text: string) => new Set(text.toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !/^(?:with|that|this|from|they|their|there|were|have|then|them|into|over|while|where|which|about|some|more|than|only|just|like|man|woman|person|seems|appears)$/.test(w)));
/**
 * Who answers when the player asked a name without choosing between several surfaced people: the delivered narration's own definite
 * reference ("The man with the damaged hands straightens on his stool"), resolved ONLY among the people the previous narration surfaced
 * (sex/role compatible and at least one authored trait). Anything else, or two different resolutions, binds nobody.
 */
export function narratedSpeakerPartner(context: TurnContext, previous: string | undefined, delivered: string): string | undefined {
  const antecedents = surfacedSentences(context, previous), surfaced = [...antecedents.keys()], gate = narratorIdentityGate(context);
  if (!surfaced.length || !gate) return undefined;
  const resolved = new Set<string>();
  // Only the narration that opens the reply names who speaks; what is described after the first spoken line (a bystander) does not.
  const lead = delivered.split(/\n+/).map(l => l.trim()).filter(Boolean), firstSpeech = lead.findIndex(l => !l.startsWith("*")), opening = (firstSpeech >= 0 ? lead.slice(0, firstSpeech) : lead).join("\n");
  for (const span of rpgNarration(opening)) for (const sentence of sentencesOf(span.replace(/[*_]/g, ""))) {
    const head = headNoun(sentence);
    if (!head || !/^(?:the|a|an|that|this)\s/i.test(sentence.trim())) continue;
    // Evidence: authored traits, or words the reference shares with the sentence that introduced this person ("the man on the stool").
    const reference = content(sentence.split(/\s+/).slice(0, 8).join(" "));
    const fits = surfaced.filter(id => compatible(context, id, head)).map(id => ({ id, n: traitMatches(gate.identities.get(id)?.observable_appearance ?? "", sentence)
      + [...reference].filter(w => (antecedents.get(id) ?? []).some(a => content(a).has(w))).length })).filter(f => f.n >= 1);
    const top = Math.max(0, ...fits.map(f => f.n)), best = fits.filter(f => f.n === top);
    if (best.length === 1) resolved.add(best[0]!.id);
  }
  return resolved.size === 1 ? [...resolved][0] : undefined;
}
