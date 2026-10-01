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
