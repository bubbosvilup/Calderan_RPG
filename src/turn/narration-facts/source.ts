import { type NarrationFactScope, extractNarrationFacts } from "./extract.js";
import type { NarrationFacts } from "./types.js";

/**
 * One extraction per candidate text. Authorization and audit both ask the SAME source, so they read the very same facts (the same object)
 * for the draft; a reconciliation revision is a different text and gets its own single extraction.
 */
export interface NarrationFactSource {
  readonly scope: NarrationFactScope;
  of(narration: string): NarrationFacts;
}

export function createFactSource(scope: NarrationFactScope): NarrationFactSource {
  const memo = new Map<string, NarrationFacts>();
  return { scope, of: narration => { let facts = memo.get(narration); if (!facts) { facts = extractNarrationFacts(narration, scope); memo.set(narration, facts); } return facts; } };
}
