/**
 * Hardening H1: one canonical source for English number words. Bounded on purpose: zero..nineteen, the tens to ninety, and
 * hyphenated or spaced compounds below one hundred ("thirty-two"). Callers with phrase-level extras ("a dozen", "a hundred",
 * "half a", bare "hundred") keep those as explicit local extensions on top of this table.
 */
export const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"] as const;
export const TENS: Readonly<Record<string, number>> = Object.freeze({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });

/** Single-token cardinals one..nineteen plus the tens, as a regex alternation (no zero: never a count or a price). */
export const CARDINAL_WORD_ALTERNATION = [...NUMBER_WORDS.slice(1), ...Object.keys(TENS)].join("|");

/** Value of a number word or compound below one hundred; undefined for anything else (digits included). */
export function numberWordValue(token: string): number | undefined {
  const t = token.toLowerCase();
  const i = (NUMBER_WORDS as readonly string[]).indexOf(t); if (i >= 0) return i;
  const [tens, unit] = t.split(/[- ]/);
  if (!tens || TENS[tens] === undefined) return undefined;
  if (!unit) return TENS[tens];
  const u = (NUMBER_WORDS as readonly string[]).indexOf(unit);
  return u > 0 && u < 10 ? TENS[tens]! + u : undefined;
}

/** Number words below one hundred, or one to three digits ("Thirty-two", "19"). */
export function numberValue(token: string): number | undefined {
  return /^\d{1,3}$/.test(token) ? Number(token) : numberWordValue(token);
}

/**
 * Money-grade number phrases (Historical Replay certification): "four hundred", "four hundred and fifty", "a hundred", "two thousand
 * five hundred", "1,200", "thirty-two". The value range is bounded to the whole-gold funds domain. Unlike numberWordValue this
 * understands "hundred" and "thousand" as multipliers, so a price is never silently read as only its last word ("four hundred gold"
 * was previously read as 100). One capture-free pattern source; callers wrap it in their own group.
 */
const PHRASE_TOKEN = `(?:${CARDINAL_WORD_ALTERNATION}|hundred|thousand)`;
export const NUMBER_PHRASE_SOURCE = `(?:\\d{1,3}(?:,\\d{3})+|\\d{1,9}|(?:(?:a|an)\\s+(?=hundred|thousand)\\b)?${PHRASE_TOKEN}(?:(?:[\\s-]+and[\\s-]+|[\\s-]+)${PHRASE_TOKEN})*)`;
/** Value of a number phrase matched by NUMBER_PHRASE_SOURCE; undefined when the words do not form a valid cardinal. */
export function numberPhraseValue(phrase: string): number | undefined {
  const text = phrase.trim().toLowerCase();
  if (/^\d[\d,]*$/.test(text)) return Number(text.replace(/,/g, ""));
  let total = 0, current = 0, seen = false, last: "unit" | "teen" | "tens" | "hundred" | "thousand" | undefined;
  for (const token of text.split(/[\s-]+/)) {
    if (token === "and" || token === "a" || token === "an") continue;
    if (token === "hundred") { if (last === "hundred") return undefined; current = (current || 1) * 100; last = "hundred"; seen = true; continue; }
    if (token === "thousand") { if (last === "thousand") return undefined; total += (current || 1) * 1000; current = 0; last = "thousand"; seen = true; continue; }
    const v = numberWordValue(token);
    if (v === undefined || v === 0) return undefined;
    const kind = v < 10 ? "unit" : v < 20 ? "teen" : "tens";
    // Grammar: a unit or teen may not follow another unit, teen or tens group in the same order ("five five", "twenty ten").
    if (last === "unit" || last === "teen" || (last === "tens" && kind !== "unit")) return undefined;
    current += v; last = kind; seen = true;
  }
  return seen ? total + current : undefined;
}
