import { GATES } from "./language/gates.js";
import { QUOTED_SPAN_SOURCE, exactNamePattern } from "./language/text.js";

/**
 * Consolidation block 5A — the UNCOMMITTED-PENDING-CONFIRMATION guard.
 *
 * While the player's proposal is awaiting confirmation the act has NOT happened. The Narrator may mention the proposal, voice emotion, hope, hesitation or
 * doubt, but must not narrate the act as completed ("Maren is now free", "the papers are signed", "no longer a slave"). Deterministic and structural: it only
 * looks for completion wording bound to the pending subject (by name, or by pronoun when exactly one subject is pending). A hit goes through the ordinary
 * bounded revise / redact path; it never changes state. After the player confirms, the proposal is no longer pending and completion narration is allowed.
 *
 * Negation, questions, conditionals and hopes are exempt (the shared denial gate). Physically unchaining someone is not a legal act and is never a hit.
 */
export interface PendingSubject { readonly kind: string; readonly name: string }
export interface PendingClaim { readonly kind: "manumission"; readonly subject: string; readonly sentence: string; readonly correction: string }

const COMPLETED = [
  /\b(?:is|was|are|were|now|finally|at last|becomes?|became|truly|officially|legally)\s+(?:\w+\s+){0,2}?(?:free|freed|liberated|manumitted|emancipated)\b(?!\s+to\b)(?!\s+(?:from|of)\s+(?:the |those |these |her |his |their )?(?:chains?|shackles?|cage|bonds?|ropes?|collar|cuffs?|manacles?|restraints?|fetters?|irons?))/i,
  /\bno longer\s+(?:a |an |his |her |their |nicco's )?(?:slave|property|owned|enslaved|bound|chattel|possession)\b/i,
  /\b(?:frees|freed|liberates|liberated|manumit\w*|emancipat\w*)\b(?!\s+(?:\w+\s+){0,2}?from\s+(?:the |those |these |her |his |their )?(?:chains?|shackles?|cage|bonds?|ropes?|collar|cuffs?|manacles?|restraints?|fetters?|irons?))/i,
  /\b(?:grants?|granted|gives?|gave|given|restores?|restored|won|wins|gains?|gained)\s+(?:\w+\s+){0,2}?(?:her|his|their)\s+freedom\b/i,
  /\bfreedom\b[^.!?]{0,30}\b(?:is|was)\s+(?:hers|his|theirs|granted|given|restored|won)\b/i,
  /\b(?:papers?|writ|document|deed|manumission)\b[^.!?]{0,40}\b(?:signed|sealed|stamped|executed|drawn up|written|witnessed|completed)\b/i,
  /\ba\s+free\s+(?:woman|man|person|girl|boy|elf|dwarf|halfling|orc)\b/i,
];
/** First-person claims inside the SUBJECT's own dialogue ("I am free now"). Second-person speech ("You are free") is the player's own words and is not a claim. */
const SELF_CLAIM = /\b(?:i(?:'m| am)(?: now| finally| truly)? (?:free|no longer (?:a |an )?(?:slave|property|owned))|you(?:'ve| have) (?:freed|set) me|i(?:'ve| have) been (?:freed|set free)|my freedom (?:is|was) (?:granted|given|won))\b/i;
const quotes = (s: string) => [...s.matchAll(/"([^"\n]*)"|“([^”\n]*)”/g)].map(m => m[1] ?? m[2]!);
const outside = (s: string) => s.replace(new RegExp(QUOTED_SPAN_SOURCE, "g"), " ");
/** "no longer a slave" is itself the completion wording, so it must not count as a negation cue. */
const NO_LONGER = /\bno longer\b/gi;
const PRONOUN = /\b(?:she|he|they|her|him|them|hers|his|their)\b/i;

export function pendingClaims(sentences: readonly string[], subjects: readonly PendingSubject[]): PendingClaim[] {
  const manumission = subjects.filter(s => s.kind === "manumission");
  if (!manumission.length) return [];
  const claims: PendingClaim[] = [];
  const correction = (name: string) => `${name} is NOT freed: the player's request is only a PROPOSAL awaiting the player's own confirmation in the interface. ${name} is still legally enslaved and held by Nicco; nothing has been signed or granted. Narrate reactions, hesitation or hope without completing the act.`;
  for (const sentence of sentences) {
    const plain = outside(sentence);
    const named = manumission.filter(s => exactNamePattern([s.name, ...s.name.split(/\s+/).filter(t => t.length > 2)], "i").test(sentence));
    const linked = named.length ? named : manumission.length === 1 && PRONOUN.test(plain) ? manumission : [];
    if (linked.length && COMPLETED.some(p => p.test(plain)) && !GATES.audit_denied.test(plain.replace(NO_LONGER, " "))) {
      for (const s of linked) claims.push({ kind: "manumission", subject: s.name, sentence, correction: correction(s.name) });
      continue;
    }
    // The subject speaking about themselves: only when the sentence names them, or they are the sole pending subject.
    const speaker = named.length === 1 ? named : manumission.length === 1 ? manumission : [];
    if (speaker.length === 1 && quotes(sentence).some(q => SELF_CLAIM.test(q) && !GATES.audit_denied.test(q))) claims.push({ kind: "manumission", subject: speaker[0]!.name, sentence, correction: correction(speaker[0]!.name) });
  }
  return claims;
}
