import { WORLD_DAY_MINUTES } from "../world/runtime-domain.js";
import { DAYPART_LABELS, daypartStart } from "./temporal-grounding.js";

/**
 * Temporal Action Resolver V1. Nicco's own explicit, present request to let time pass — wait, sleep, nap or rest — with an exact
 * duration ("for 5 hours", "for at least 5 hours", "half an hour") or a target ("until night", "until 3 pm", "until tomorrow
 * morning"), resolved deterministically against the authoritative clock into elapsed minutes. It never decides that anything else
 * happens and has no NLP beyond this small grammar:
 *
 * - The clause must be Nicco's action now: no other subject, no modal, plan, hypothetical or instruction anywhere in the input.
 * - Vague amounts ("a while", "a few hours") and vague targets ("until he arrives", "until later") are unsupported: no time.
 * - "At least N" is exactly N: the engine never invents elapsed time beyond the player's explicit minimum.
 * - Targets are the strictly next occurrence (never zero): a daypart's start from temporal-grounding.ts, noon 12:00, the next 00:00
 *   for midnight, a clock time; "tomorrow X" is X on the next world day.
 * - One temporal clause per input; a duration and a target together must agree. Anything else is unsupported, not guessed.
 * - Matched but out of range (zero, over 1440 minutes, an impossible clock time) is `invalid`: the turn is rejected atomically.
 */
export type TemporalVerb = "wait" | "sleep" | "nap" | "rest";
export type TemporalAction =
  | { readonly kind: "advance"; readonly action: TemporalVerb; readonly mode: "duration" | "target"; readonly minutes: number; readonly minimum?: true; readonly target?: string }
  | { readonly kind: "invalid"; readonly reason: "duration_out_of_range" | "invalid_clock_time" | "target_out_of_range" };

/** The existing deterministic limit of one player time request (P11). */
export const MAX_TEMPORAL_ADVANCE_MINUTES = WORLD_DAY_MINUTES;

const NUMBERS: Readonly<Record<string, number>> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const VERBS: readonly (readonly [TemporalVerb, string])[] = [
  ["wait", "waits?|waiting"],
  ["sleep", "sleeps?|sleeping|go(?:es)? (?:back )?to sleep|gets? some sleep"],
  ["nap", "naps?|napping|takes? a nap"],
  ["rest", "rests?|resting"],
];
const SUBJECT = "(?:(?:i|he|nicco)\\s+)?(?:(?:then|just|quietly|finally|simply|slowly|also)\\s+)*";
const PLACE = "(?:\\s+(?:on|in|at|by|beside|near|under|against|next to)\\s+(?:the|a|an|his|her|my|their)\\s+[a-z'-]+(?:\\s+[a-z'-]+){0,2}?)?";
const AMOUNT = `(?:(?<digits>\\d+)|(?<word>${Object.keys(NUMBERS).join("|")}))\\s+(?<unit>minutes?|mins?|hours?|hrs?)|(?<half>half an hour)`;
const DURATION = `(?:for\\s+)?(?:(?<least>at\\s*least)\\s+)?(?:${AMOUNT})`;
const CLAUSE = new RegExp(`^${SUBJECT}(?<verb>${VERBS.map(([, v]) => v).join("|")})${PLACE}(?:\\s+${DURATION})?(?:\\s+until\\s+(?<target>.+?))?${PLACE}$`, "i");
const MENTION = /\b(?:wait(?:s|ing)?|sleep(?:s|ing)?|asleep|naps?|napping|rest(?:s|ing)?)\b/i;
/** Anything making the request hypothetical, future, planned, attempted, instructed or conditional. */
const NOT_NOW = /\b(?:will|would|should|could|might|may|can|cannot|must|shall|maybe|perhaps|probably|if|unless|whether|when|once|plans?|planning|intends?|wants?|wishes|hopes?|needs?|try|tries|trying|tried|attempts?|going to|gonna|about to|ready to|decides?|considers?|thinks?|tell|tells|told|ask|asks|asked|orders?|lets?|later|tonight)\b|['’](?:ll|d)\b/i;
/** First words that name someone else as the actor. */
const OTHER_SUBJECT = /^(?:she|her|they|them|we|you|it|everyone|someone|somebody|nobody|the|a|an|this|that|his)\b/i;
const CAPITALIZED_OK = /^(?:i|he|nicco|wait|waits|sleep|sleeps|nap|naps|rest|rests|go|goes|get|gets|take|takes|lie|lies)$/i;

const clausesOf = (text: string) => text.split(/,\s*(?:and\s+then\s+|and\s+|then\s+)?|;\s*|\s+(?:and then|then|and)\s+/i).map(c => c.trim().replace(/[.!…]+$/, "").trim()).filter(Boolean);

function clockMinute(text: string): number | "invalid" | undefined {
  const m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m || (!m[2] && !m[3])) return undefined; // "until 3" names no clock time
  const hour = Number(m[1]), minute = Number(m[2] ?? 0), meridiem = m[3]?.toLowerCase().replace(/\./g, "");
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return "invalid";
  return (meridiem ? (hour % 12) + (meridiem === "pm" ? 12 : 0) : hour) * 60 + minute;
}
/** Minute-of-day of a named target; midnight is the 00:00 boundary, noon 12:00, dayparts their authoritative start. */
function targetMinute(text: string): number | "invalid" | undefined {
  const t = text.toLowerCase().replace(/^the\s+/, "").trim();
  if (t === "midnight") return 0;
  if (t === "noon") return 12 * 60;
  const label = DAYPART_LABELS.find(l => l.toLowerCase() === t && l !== "Midnight");
  return label ? daypartStart(label) : clockMinute(t);
}
function resolveTarget(text: string, now: number): number | "invalid" | undefined {
  const tomorrow = text.match(/^tomorrow\s+(.+)$/i);
  if (tomorrow && /^(?:the\s+)?midnight$/i.test(tomorrow[1]!.trim())) return undefined; // ambiguous: tonight's 00:00 or the next
  const minute = targetMinute(tomorrow ? tomorrow[1]! : text);
  if (minute === undefined || minute === "invalid") return minute;
  const day = Math.floor(now / WORLD_DAY_MINUTES), of = now - day * WORLD_DAY_MINUTES;
  return tomorrow ? (day + 1) * WORLD_DAY_MINUTES + minute - now : ((minute - of) % WORLD_DAY_MINUTES + WORLD_DAY_MINUTES) % WORLD_DAY_MINUTES || WORLD_DAY_MINUTES;
}

/**
 * Nicco's explicit temporal action in the player's input, if any. `others` are names of other present people (an input whose first
 * word names one of them is not Nicco's action). Speech is ignored: quoted spans, and, when the input has *action* segments, every
 * unstarred part.
 */
export function parseTemporalAction(input: string, worldMinute: number, others: readonly string[] = []): TemporalAction | undefined {
  const starred = [...input.matchAll(/\*([^*]+)\*/g)].map(m => m[1]!.trim());
  const text = (starred.length ? starred.join(". ") : input).replace(/"[^"]*"|“[^”]*”/g, " ").replace(/\s+/g, " ").trim();
  if (!text || !MENTION.test(text) || NOT_NOW.test(text)) return undefined;
  const parts = clausesOf(text);
  if (parts.filter(c => MENTION.test(c)).length !== 1) return undefined; // several temporal clauses: not summed, not guessed
  const first = parts[0]!, firstWord = first.split(/\s+/)[0]!;
  const names = new Set(others.flatMap(n => n.toLowerCase().split(/\s+/)));
  if (OTHER_SUBJECT.test(first) || names.has(firstWord.toLowerCase()) || (/^[A-Z]/.test(firstWord) && !CAPITALIZED_OK.test(firstWord))) return undefined;
  // A bare first clause whose second word is a verb form ("korvin drinks …") has its own subject.
  if (!/^(?:i|he|nicco)$/i.test(firstWord) && !MENTION.test(first) && /^\S+\s+[a-z]+s\b/i.test(first) && !/^\S+s\b/i.test(first)) return undefined;
  const clause = parts.find(c => MENTION.test(c))!;
  const m = clause.match(CLAUSE);
  if (!m?.groups) return undefined;
  const g = m.groups;
  const action = VERBS.find(([, v]) => new RegExp(`^(?:${v})$`, "i").test(g.verb!))![0];
  if (g.word?.toLowerCase() === "a" && /^min/i.test(g.unit!) && !/\bfor\b/i.test(clause)) return undefined; // "wait a minute" is an interjection
  const hasDuration = !!(g.digits || g.word || g.half);
  if (!hasDuration && !g.target) return undefined;
  let duration: number | undefined;
  if (hasDuration) {
    duration = g.half ? 30 : (g.digits ? Number(g.digits) : NUMBERS[g.word!.toLowerCase()]!) * (/^h/i.test(g.unit!) ? 60 : 1);
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > MAX_TEMPORAL_ADVANCE_MINUTES) return { kind: "invalid", reason: "duration_out_of_range" };
  }
  let target: number | undefined;
  if (g.target) {
    const resolved = resolveTarget(g.target, worldMinute);
    if (resolved === undefined) return undefined;
    if (resolved === "invalid") return { kind: "invalid", reason: "invalid_clock_time" };
    if (resolved < 1 || resolved > MAX_TEMPORAL_ADVANCE_MINUTES) return { kind: "invalid", reason: "target_out_of_range" };
    target = resolved;
  }
  if (duration !== undefined && target !== undefined && duration !== target) return undefined; // conflicting constraints
  const minutes = target ?? duration!;
  return { kind: "advance", action, mode: target !== undefined ? "target" : "duration", minutes, ...(g.least ? { minimum: true as const } : {}), ...(g.target ? { target: g.target.trim().toLowerCase() } : {}) };
}
