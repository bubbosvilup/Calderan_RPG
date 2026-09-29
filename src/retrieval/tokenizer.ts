/** Punctuation (including apostrophes, hyphens and underscores) separates tokens.
 * Unicode letters/marks/numbers survive; no accent folding or stemming. */
export function tokenize(text: string): readonly string[] {
  return Object.freeze(text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []);
}
