/**
 * Hardening H1: canonical text primitives for the deterministic language layer. Pure, dependency-free, no I/O.
 *
 * Quote semantics (general case): a quoted span is straight "…" or curly “…” on one line. Text inside a quoted span is dialogue,
 * never narrator prose, so callers that read actions from narration blank or skip it. Callers with deliberately different quote
 * semantics (length-capped capture groups in narrated-captives.ts and prompt-builder.ts) keep their own patterns and say so.
 */

/** Escape a literal string (a name, an item term) for use inside a RegExp. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One quoted span: straight or curly double quotes, never crossing a line break. Source only; build a fresh RegExp per use. */
export const QUOTED_SPAN_SOURCE = "\"[^\"\\n]*\"|“[^”\\n]*”";

/** [start, end) offsets of every quoted span, in order. */
export function quotedSpans(text: string): [number, number][] {
  return [...text.matchAll(new RegExp(QUOTED_SPAN_SOURCE, "g"))].map(m => [m.index, m.index + m[0].length]);
}

/** Quoted dialogue replaced by spaces (same length): the narration outside dialogue, with offsets preserved. */
export const blankQuotes = (text: string): string => text.replace(new RegExp(QUOTED_SPAN_SOURCE, "g"), m => " ".repeat(m.length));

/**
 * Sentence splitting that keeps quoted dialogue intact: a boundary is `.`, `!` or `?` followed by whitespace (or the end) outside a
 * quote, or a line break. The Unicode ellipsis (`…`) is deliberately NOT a boundary: it marks a trailing-off or pause inside one
 * utterance ("I worked in… in the mines"); the removed promotion-local splitter split there and produced fragment claims (H1 fix).
 * A typed ASCII "..." followed by whitespace still ends a sentence (its last "." is a full stop) — unchanged from before H1.
 */
export function sentencesOf(text: string): string[] {
  const out: string[] = []; let start = 0, inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\"" || ch === "“" || ch === "”") inQuote = ch === "“" ? true : ch === "”" ? false : !inQuote;
    if (!inQuote && (/[.!?]/.test(ch) && /\s/.test(text[i + 1] ?? " ") || ch === "\n")) { const s = text.slice(start, i + 1).trim(); if (s) out.push(s); start = i + 1; }
  }
  const tail = text.slice(start).trim(); if (tail) out.push(tail);
  return out;
}

/**
 * Whole-word, exact match of any of `terms` (escaped literally). Empty `terms` yields a pattern that never matches, so a caller
 * with nobody to look for can never match by accident. Case-sensitive unless flags say otherwise.
 */
export function exactNamePattern(terms: readonly string[], flags = ""): RegExp {
  return new RegExp(`\\b(?:${terms.map(escapeRegExp).join("|") || "(?!)"})\\b`, flags);
}
