import { type NarrationFactScope, extractInputCommerceFacts, extractNarrationFacts, extractQuoteCommerceFacts } from "./extract.js";
import type { CommerceFact, NarrationFacts } from "./types.js";

/**
 * One extraction per candidate text. Authorization and audit both ask the SAME source, so they read the very same facts (the same object)
 * for the draft; a reconciliation revision is a different text and gets its own single extraction.
 */
export interface NarrationFactSource {
  readonly scope: NarrationFactScope;
  of(narration: string): NarrationFacts;
  /** The commerce facts of the player's own input (every figure there is a player counter). Memoized per text. */
  input(text: string): readonly CommerceFact[];
  /** The commerce facts of a verbatim quote of a candidate text, read against the goods words the quote is about. Memoized per (quote, words). */
  quote(quote: string, subjects: readonly string[]): readonly CommerceFact[];
}

export function createFactSource(scope: NarrationFactScope): NarrationFactSource {
  const memo = new Map<string, NarrationFacts>();
  const typed = new Map<string, readonly CommerceFact[]>(), quoted = new Map<string, readonly CommerceFact[]>();
  return { scope, of: narration => { let facts = memo.get(narration); if (!facts) { facts = extractNarrationFacts(narration, scope); memo.set(narration, facts); } return facts; },
    quote: (quote, subjects) => { const key = `${subjects.join("|")}\u0000${quote}`; let facts = quoted.get(key); if (!facts) { facts = extractQuoteCommerceFacts(quote, scope, subjects); quoted.set(key, facts); } return facts; },
    input: text => { let facts = typed.get(text); if (!facts) { facts = extractInputCommerceFacts(text); typed.set(text, facts); } return facts; } };
}
