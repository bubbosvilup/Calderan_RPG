import type { CampaignCommand } from "../../campaign/types.js";
import type { TurnContext } from "../context/context-builder.js";
import { resolveItemPhrase, type RefItem, type ResolveEnv } from "./item-resolution.js";

/**
 * Explicit item intent (Pre-Property Debt Zero Pass). A conservative, closed grammar over the PLAYER'S OWN words that recognises a
 * pickup ("I pick up the sword", "*takes the sword*", "I pick it up") or a put-down ("I put the sword down on the floor", "*drops the
 * knife*") of ONE tracked item, resolved through the shared item-reference resolver.
 *
 * An intent only says what the player attempted and which tracked item is meant. It never mutates state and never proves success:
 * narration decides the outcome, the Controller proposes, authorization decides. `try`, `reach for`, `look at`, `touch`, questions,
 * wishes and conditionals are never a completed-action intent (a `try` is reported as an attempt and authorizes nothing by itself).
 *
 * Grammar (after removing markdown stars, a leading "I"/"Nicco"/"he", and light adverbs; one clause at a time):
 *   pickup := (pick up | pick <obj> up | take | grab | lift | retrieve | snatch | pocket | scoop | collect | gather) <obj> [from the floor|ground]
 *   drop   := (put | set | lay | place) <obj> down | (put | set | lay | place) down <obj> | (drop | discard | toss) <obj> | leave <obj> here
 *           | (put | set | lay | place) <obj> on the floor|ground
 *   <obj>  := a noun phrase, or the pronoun it/them (resolved only when exactly one candidate exists)
 * "take <obj> from <person>" is a transfer, not a pickup, and is ignored here.
 */
export type ItemIntent =
  | { readonly kind: "pickup" | "drop"; readonly status: "bound"; readonly item_id: string; readonly command: Extract<CampaignCommand, { kind: "place_item" }> }
  | { readonly kind: "pickup" | "drop"; readonly status: "ambiguous"; readonly ids: readonly string[] }
  | { readonly kind: "pickup" | "drop"; readonly status: "absent" }
  | { readonly kind: "pickup" | "drop"; readonly status: "attempt" };

const NOT_COMPLETED = /\b(?:try|tries|trying|tried|attempt\w*|reach\w*\s+(?:for|toward\w*)|look\w*\s+at|touch\w*|think\w*\s+(?:about|of)|consider\w*|want\w*\s+to|wish\w*|wonder\w*|would|could|should|might|maybe|if\b|can\s+i|may\s+i|do\s+not|don't|won't|refuse\w*|decline\w*|about\s+to|plan\w*\s+to|intend\w*)\b/i;
const PICKUP = /^(?:pick(?:s|ed)?\s+up|pick(?:s|ed)?\b(?=.*\bup\b)|take[s]?|grab(?:s|bed)?|lift(?:s|ed)?|retrieve[s]?|snatch(?:es)?|pocket(?:s|ed)?|scoop(?:s|ed)?|collect(?:s|ed)?|gather(?:s|ed)?)\b\s*(.*)$/i;
const DROP_DOWN = /^(?:put|set|lay|place)s?\b\s*(.*)$/i;
const DROP_VERB = /^(?:drop|discard|toss)(?:s|ped|ed)?\b\s*(.*)$/i;
const LEAVE = /^leave[s]?\b\s*(.*)$/i;
const FLOOR = "(?:the\\s+)?(?:floor|ground|earth|dirt|rug)";
const PRONOUN = /^(?:it|them|that|this)$/i;

function objectPhrase(rest: string): string {
  return rest.replace(/^(?:up|down)\b\s*/i, "").replace(/\b(?:back|again|away)\b/gi, " ").replace(/\b(?:up|down)\b.*$/i, "").replace(/\b(?:from|off|on|onto|here|there|at|in|into|by|and|then|with|to)\b.*$/i, "").replace(/[.,!;]+$/g, "").replace(/\s+/g, " ").trim();
}
function clauses(input: string): string[] {
  return input.replace(/[*_`]/g, " ").replace(/\s+/g, " ").trim().split(/[.!;]+\s*|\s+(?:and then|then)\s+/).map(s => s.trim()).filter(Boolean);
}
const strip = (c: string) => c.replace(/^(?:i|nicco|he)\s+/i, "").replace(/^(?:quickly|carefully|slowly|calmly|gently|deliberately)\s+/i, "").replace(/^(?:i|nicco|he)\s+/i, "");

export function resolveItemIntent(input: string, context: TurnContext, actor = "nicco"): ItemIntent | undefined {
  const found: { kind: "pickup" | "drop"; phrase: string; attempt: boolean }[] = [];
  for (const raw of clauses(input)) {
    if (/\?\s*$/.test(raw) || /\?/.test(raw)) continue;
    const attempt = NOT_COMPLETED.test(raw);
    const clause = strip(raw.replace(/\b(?:i|he|nicco)\s+(?:try|tries|tried|attempt\w*|want\w*|plan\w*|intend\w*)\s+to\s+/i, ""));
    let m: RegExpMatchArray | null, kind: "pickup" | "drop" | undefined, phrase = "";
    if ((m = clause.match(PICKUP))) {
      // A pickup from a person ("takes the sword from Brenna") is a transfer: ignored here.
      const from = clause.match(/\bfrom\s+(?!the\s+(?:floor|ground|table|shelf|desk|bed|chair|rug|hearth|bench)\b)/i);
      if (from) continue;
      const pickBefore = clause.match(/^pick(?:s|ed)?\s+(.+?)\s+up\b/i);
      kind = "pickup"; phrase = objectPhrase(pickBefore ? pickBefore[1]! : m[1]!);
    } else if ((m = clause.match(DROP_DOWN)) && (/\bdown\b/i.test(clause) || new RegExp(`\\b(?:on|onto)\\s+${FLOOR}\\b`, "i").test(clause))) {
      kind = "drop"; phrase = objectPhrase(m[1]!);
    } else if ((m = clause.match(DROP_VERB))) { kind = "drop"; phrase = objectPhrase(m[1]!); }
    else if ((m = clause.match(LEAVE)) && /\b(?:here|behind|there)\s*$/i.test(clause)) { kind = "drop"; phrase = objectPhrase(m[1]!); }
    if (kind) found.push({ kind, phrase, attempt });
  }
  // One item action per turn input. Two different acts, or the same act on several phrases, is not a bound intent.
  if (found.length !== 1) return undefined;
  const { kind, phrase, attempt } = found[0]!;
  if (attempt) return { kind, status: "attempt" };
  const itemsHere = (context.items_here ?? []) as readonly RefItem[];
  const held = (context.items as readonly RefItem[]).filter(i => i.position.kind === "carried" && i.position.character_id === actor);
  const pool = kind === "pickup" ? itemsHere : held;
  const people = new Map<string, string>(); for (const c of context.characters) for (const n of [c.id, c.profile.name].filter((x): x is string => !!x)) { people.set(n.toLowerCase(), c.id); for (const t of n.toLowerCase().split(/[\s_]+/).filter(t => t.length > 2)) if (!people.has(t)) people.set(t, c.id); }
  const env: ResolveEnv = { people, actor };
  if (!phrase || PRONOUN.test(phrase)) {
    if (pool.length === 1) return bound(kind, pool[0]!.id, actor, context);
    return pool.length ? { kind, status: "ambiguous", ids: pool.map(i => i.id) } : { kind, status: "absent" };
  }
  const r = resolveItemPhrase(phrase, pool, env);
  if (r.status === "unique") return bound(kind, r.id, actor, context);
  if (r.status === "ambiguous") return { kind, status: "ambiguous", ids: r.ids };
  return { kind, status: "absent" };
}
function bound(kind: "pickup" | "drop", item_id: string, actor: string, context: TurnContext): ItemIntent {
  const here = context.primary.scene.player_location?.id;
  const command: Extract<CampaignCommand, { kind: "place_item" }> = kind === "pickup" ? { kind: "place_item", item_id, position: { kind: "carried", character_id: actor } } : { kind: "place_item", item_id, position: { kind: "stored", location_id: here ?? "" } };
  return { kind, status: "bound", item_id, command };
}
