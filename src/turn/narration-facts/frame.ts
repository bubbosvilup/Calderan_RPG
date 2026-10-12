import { QUOTED_SPAN_SOURCE, sentencesOf } from "../language/text.js";
import type { FactSpan } from "./types.js";

/**
 * The narration split once into sentences with their offsets, so every fact can point back at the exact words it read.
 *
 * Two views of each sentence:
 * - `sentences[i]`: the words exactly as sentencesOf yields them (what audit redaction and evidence quotes use).
 * - `prose(i)`: NARRATOR PROSE, same length: quoted dialogue is blanked and the asterisks of the narrator's RPG format are markup, not
 *   words ("*Maren follows him down.*" reads as "Maren follows him down."). Text outside asterisks is deliberately NOT treated as
 *   speech: a narrator that forgets the asterisks must not hide a movement from the audit.
 */
export interface NarrationFrame {
  readonly narration: string; readonly sentences: readonly string[]; readonly starts: readonly number[];
  prose(index: number): string;
  /** The quoted words inside sentence `index`, without their quotation marks. */
  speech(index: number): readonly string[];
}

export function frameOf(narration: string): NarrationFrame {
  const sentences = sentencesOf(narration), starts: number[] = [];
  let at = 0;
  for (const s of sentences) { const i = narration.indexOf(s, at); starts.push(i < 0 ? at : i); at = (i < 0 ? at : i) + s.length; }
  const quote = () => new RegExp(QUOTED_SPAN_SOURCE, "g");
  return {
    narration, sentences, starts,
    prose: index => (sentences[index] ?? "").replace(quote(), m => " ".repeat(m.length)).replace(/\*/g, " "),
    speech: index => [...(sentences[index] ?? "").matchAll(quote())].map(m => m[0].slice(1, -1).trim()).filter(Boolean),
  };
}

/**
 * Span of `text` inside sentence `index`. When the exact words are not found (a pattern ran on a blanked or trimmed copy) the span is the
 * whole sentence, so `narration.slice(start, end) === text` always holds.
 */
export function spanOf(frame: NarrationFrame, index: number, clause: number, text: string): FactSpan {
  const sentence = frame.sentences[index] ?? "", base = frame.starts[index] ?? 0, at = text ? sentence.indexOf(text) : -1;
  const [start, end] = at < 0 ? [base, base + sentence.length] : [base + at, base + at + text.length];
  return { sentence_index: index, clause_index: clause, start, end, text: frame.narration.slice(start, end) };
}
