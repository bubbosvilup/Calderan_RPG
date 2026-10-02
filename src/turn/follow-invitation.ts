import { GATES } from "./language/gates.js";
import { escapeRegExp as esc } from "./language/text.js";
import type { MovableCharacter } from "./character-movement.js";

/**
 * NPC+ Pass 9 — consent-preserving household following. An invitation is NOT movement: it only changes what the narrator is told
 * about an invited active NPC+ Nicco is leaving behind. Instead of "X stays there" (which narrators mirrored as a refusal in 5 of 6
 * live invitations), the invited NPC+ gets a neutral choice; the narration still decides, and only completed narrated following can
 * become movement evidence (character-movement.ts), a proposal and an authorized commit.
 *
 * Detection is deterministic and narrow: a player sentence containing an explicit come-along phrase, not vetoed by the shared
 * `invitation_not_offered` gate (negated, conditional, imagined, remembered, other-day, threatening or coercive). A modal request
 * ("would you come with me?") is an invitation. "If you like / if you want" is consent phrasing, not a condition on the world.
 */
const INVITE = /\b(?:come (?:with|along|and|back|up|down|too)|join (?:me|us)|follow me|accompany me|walk (?:\w+ )?with me|keep me company|take my arm)\b/i;
const GROUP = /\b(?:anyone|anybody|everyone|everybody|all of you|both of you|either of you|you all|whoever)\b/i;
const CONSENT = /\bif (?:you|she|he|they) (?:like|want|wish|prefer|feel up to it|'d like|would like|are up to it)\b/gi;

/**
 * IDs of `eligible` (active NPC+ Nicco is leaving behind) explicitly invited to come along by the player's own words this turn.
 * `others`: names of other people present, so "Gerome, come with me" never reaches a different, sole eligible NPC+.
 */
export function invitedFollowers(player_input: string, eligible: readonly MovableCharacter[], others: readonly string[] = []): readonly string[] {
  if (!eligible.length) return [];
  const named = (s: string) => eligible.filter(m => m.names.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(s))).map(m => m.id);
  const sentences = player_input.replace(/[*"“”]/g, " ").split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const sentence of sentences) {
    if (!INVITE.test(sentence) || GATES.invitation_not_offered.test(sentence.replace(CONSENT, " "))) continue;
    const here = named(sentence);
    // An unnamed "come with me" reaches the single eligible NPC+ only when the sentence names no other present person ("Gerome, come").
    const addressesOther = others.some(n => new RegExp(`\\b${esc(n)}\\b`, "i").test(sentence));
    const who = here.length ? here : GROUP.test(sentence) ? eligible.map(m => m.id) : addressesOther ? [] : eligible.length === 1 ? [eligible[0]!.id] : named(player_input);
    for (const id of who) out.add(id);
  }
  return [...out];
}

/**
 * The left-behind note. Non-invited people keep the pre-Pass-9 text byte for byte; invited active NPC+ get a neutral choice that
 * asserts neither staying nor following. Nicco never brings or carries anyone by this note.
 */
export function leftBehindNotes(left: readonly MovableCharacter[], invited: readonly string[], from: string, to: string): readonly string[] {
  if (!left.length) return [];
  const staying = left.filter(m => !invited.includes(m.id)).map(m => m.names[0]!), asked = left.filter(m => invited.includes(m.id)).map(m => m.names[0]!);
  const notes: string[] = [];
  if (staying.length) notes.push(`Nicco leaves ${from}. ${staying.join(", ")} stay${staying.length === 1 ? "s" : ""} there: do not have Nicco bring or carry them. Someone comes along only if they themselves clearly follow him, narrated explicitly.`);
  // Pass 10: the arrival-scene state lists an invited NPC+ as "away" and the narrator has to treat unlisted people as nonexistent, so live
  // GLM drafts misplaced them ("was not there to hear the invitation"). The note therefore states the PRE-TURN fact (they were with Nicco in
  // the origin when he spoke) separately from the choice; "away" is explained as relative to the arrival only. It still decides nothing.
  if (asked.length) notes.push(`Nicco leaves ${from} for ${to}. ${asked.join(", ")} ${asked.length === 1 ? "was" : "were"} invited to come along and ${asked.length === 1 ? "decides" : "each decide"} freely whether to follow him: do not assume either choice. Before this turn ${asked.join(", ")} ${asked.length === 1 ? "was" : "were"} in ${from} with Nicco and present when he spoke; an "away" or unlisted label for them above only means they are not in ${to} at this moment. If someone follows, they arrive in ${to} after Nicco: narrate that completed choice explicitly; if someone stays, narrate that instead. Do not have Nicco bring or carry anyone.`);
  return notes;
}
