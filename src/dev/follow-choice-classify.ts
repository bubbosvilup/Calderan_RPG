import { escapeRegExp as esc } from "../turn/language/text.js";
/**
 * NPC+ Pass 10 — classify a RAW FIRST DRAFT for one invited NPC+ (evaluation only). FOLLOW needs the production grammar to recognise a
 * completed follow (passed in by the caller); STAY is an explicit decline, remaining or absence claim about that person; AMBIGUOUS is the
 * person mentioned without either; OTHER never mentions them. No required distribution: this only measures what the narrator chose.
 */
export type FollowChoice = "FOLLOW" | "STAY" | "AMBIGUOUS" | "OTHER";
const STAY = /\b(?:does not follow|doesn't follow|did not follow|didn't follow|no (?:footsteps|one|answer|reply)[^.]{0,30}follow|(?:stays|stayed|remains|remained|stay|remain)\b|not (?:there|here|in the room|to hear)|was not (?:there|in)|is away|were away|away from|declines|declined|shakes (?:her|his) head|stays put|chooses not|will not come|won't come|refuses|refused)\b/i;
export function classifyFollowChoice(narration: string, name: string, grammarFollow: boolean): FollowChoice {
  if (grammarFollow) return "FOLLOW";
  const mention = new RegExp(`\\b${esc(name)}\\b`, "i");
  const sentences = narration.split(/(?<=[.!?])\s+/);
  if (sentences.some(s => mention.test(s) && STAY.test(s)) || /\bno footsteps follow|nobody follows|no one follows|no answer follows\b/i.test(narration)) return "STAY";
  return mention.test(narration) ? "AMBIGUOUS" : "OTHER";
}
