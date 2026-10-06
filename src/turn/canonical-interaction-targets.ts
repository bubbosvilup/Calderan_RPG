import type { TurnContext } from "./context-builder.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { escapeRegExp } from "./language/text.js";

/**
 * Canonical NPC casting (Ephemeral Duplication fix). Evidence for "this engaged person IS an eligible canonical actor" comes only
 * from that actor's authored appearance, segmented into traits ("a hooked nose" is one trait, not two words). A strong match needs
 * STRONG_TRAITS distinct traits, compatible sex and role, and no second eligible candidate with even two traits. One or two generic
 * traits ("the blonde woman", "the man with scarred hands") never cast a canonical actor through these paths.
 */
export const STRONG_TRAITS = 3;
/** Body-part and apparel heads: a trait matches on its distinctive modifier ("hooked"), never on "nose" or "eyes" alone. */
const GENERIC = new Set(["a", "an", "the", "of", "and", "with", "her", "his", "their", "its", "very", "slightly", "somewhat", "more", "than", "like", "look", "looks",
  "appearance", "approximately", "about", "man", "woman", "person", "hair", "haired", "eyes", "eye", "hands", "hand", "nose", "face", "skin", "clothes", "clothing",
  "build", "frame", "body", "cm", "she", "he", "they", "who", "that", "which", "in", "on", "at", "for", "from"]);
const FEMALE = /^(?:woman|girl|lady|lass|matron|mistress)$/, MALE = /^(?:man|boy|lad|gentleman)$/;
const PERSON_HEADS = "woman|man|girl|boy|lady|lass|lad|gentleman|matron|person|figure|stranger";
/** Role heads and the authored-summary vocabulary that makes a canonical actor compatible with them. Unknown roles fail closed. */
const ROLE_HEADS: Readonly<Record<string, RegExp>> = {
  seller: /\b(?:slaver|seller|merchant|trader|vendor|dealer|broker|proprietor|shop\w*|pawn\w*|innkeeper)\b/i,
  slaver: /\bslaver\b/i, dealer: /\b(?:slaver|dealer|broker|trader)\b/i, broker: /\b(?:broker|slaver|intermediary)\b/i,
  merchant: /\b(?:merchant|trader|seller|proprietor|shop\w*)\b/i, trader: /\b(?:trader|merchant|slaver|seller)\b/i, vendor: /\b(?:vendor|seller|merchant)\b/i,
  shopkeeper: /\b(?:proprietor|shop\w*|merchant)\b/i, innkeeper: /\b(?:innkeeper|proprietor)\b/i, smith: /\bsmith\b/i,
  guard: /\b(?:guard|watch|sergeant|captain|commander)\b/i, clerk: /\b(?:clerk|registrar|scribe)\b/i, priest: /\b(?:priest|cleric|zealot)\b/i, priestess: /\b(?:priest|cleric|sister)\b/i,
};
const HEADS = `${PERSON_HEADS}|${Object.keys(ROLE_HEADS).join("|")}`;
const LEGACY_VERBS = "look\\w* (?:at|towards?)|inspect\\w*|examin\\w*|approach\\w*|address\\w*|speak\\w* to|talk\\w* to";
/** The engagement verbs the participant planner already uses to create a person, plus "over to". */
const ENGAGE_VERBS = `${LEGACY_VERBS}|(?:walk|go|head|wander|stroll)\\w* (?:up|over|across) to|turn\\w*(?: back)? to|call\\w*(?: out)? to|wave\\w* (?:at|to)|point\\w* at|greet\\w*|hail\\w*|ask\\w*|stop\\w*|tap\\w*|nudge\\w*|face\\w*|follow\\w*|flag\\w* down`;
const ENGAGE = new RegExp(`\\b(?:${ENGAGE_VERBS})\\s+(the|that|this|a|an|another|some|one)?\\s*([^*.!?\\n"“”]{1,120})`, "gi");

const words = (text: string) => (text.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []).flatMap(w => w.includes("-") ? [w, ...w.split("-")] : [w]);
const same = (a: string, b: string) => a === b || `${a}e` === b || `${b}e` === a || `${a}s` === b || `${b}s` === a || `${a}ed` === b || `${b}ed` === a;
/** Authored appearance → traits: comma/and/with/semicolon-separated phrases, each with its distinctive words. */
function traits(appearance: string): string[][] {
  return appearance.split(/[,;.]|\band\b|\bwith\b|\bwhich\b/i).map(s => words(s).filter(w => w.length > 2 && !GENERIC.has(w))).filter(t => t.length > 0);
}
/** Number of the actor's appearance traits the mention evidences. */
export function traitMatches(appearance: string, mention: string): number {
  const said = words(mention).filter(w => !GENERIC.has(w));
  return traits(appearance).filter(t => t.some(w => said.some(s => same(s, w)))).length;
}
/** The person head noun a phrase names ("the short, compact seller with…" → seller), or undefined. */
function headNoun(phrase: string): string | undefined {
  return phrase.toLowerCase().match(new RegExp(`\\b(${HEADS})\\b`))?.[1];
}
function compatible(context: TurnContext, id: string, head: string | undefined): boolean {
  const c = context.characters.find(x => x.id === id) as { pronoun?: string } | undefined;
  const pronoun = c?.pronoun;
  if (head && FEMALE.test(head) && pronoun !== "she") return false;
  if (head && MALE.test(head) && pronoun !== "he") return false;
  if (!head || new RegExp(`^(?:${PERSON_HEADS})$`).test(head)) return true;
  const summary = context.primary.scene.present_characters.find(p => p.id === id)?.summary ?? "";
  return !!ROLE_HEADS[head]?.test(summary);
}
/**
 * The single eligible canonical actor this observable mention strongly and uniquely evidences, else undefined (fail safe).
 * Eligible = present in the authoritative scene (TurnContext); no world-wide search, no new location authority.
 */
export function strongCanonicalMatch(context: TurnContext, mention: string, head = headNoun(mention)): string | undefined {
  const gate = narratorIdentityGate(context);
  const scored = context.characters.filter(c => c.id !== "nicco" && gate?.identities.has(c.id) && compatible(context, c.id, head))
    .map(c => ({ id: c.id, n: traitMatches(gate!.identities.get(c.id)!.observable_appearance ?? "", mention) }));
  const strong = scored.filter(s => s.n >= STRONG_TRAITS);
  return strong.length === 1 && scored.filter(s => s.n >= 2).length === 1 ? strong[0]!.id : undefined;
}
/** The one sentence of `narration` that introduces or names a person with this head noun; several (or none) → undefined. */
function narratedMention(narration: string, head: string): string | undefined {
  const sentences = narration.replace(/[*_]/g, "").split(/(?<=[.!?])\s+|\n+/)
    .filter(s => new RegExp(`\\b(?:a|an|the|one|that|this)\\s+(?:[a-z][a-z,'-]*\\s+){0,6}?${escapeRegExp(head)}\\b`, "i").test(s));
  return sentences.length === 1 ? sentences[0] : undefined;
}
export interface CastingOptions {
  /** Latest finalized narration of the current scene: the person a definite reference ("the seller") points back to. */
  readonly narration?: string;
  /** Head nouns already owned by an established temporary participant or promoted person: never re-cast as canonical. */
  readonly owned?: ReadonlySet<string>;
}

/** Explicit present canonical references only; never inferred from importance or prior conversation. */
export function canonicalInteractionTargets(context: TurnContext, text: string, options: CastingOptions = {}): ReadonlySet<string> {
  const gate = narratorIdentityGate(context);
  const canonical = context.characters.filter(c => c.id !== "nicco" && gate?.identities.has(c.id));
  const foundTargets = new Set(canonical.filter(c => {
    const identity = gate!.identities.get(c.id)!;
    return [c.id, c.profile.name, ...(c.profile.aliases ?? []), identity.ref,
      // A generic human label is not a unique identity.
      ...(identity.observable_label.includes(":") ? [identity.observable_label] : [])]
      .some(n => n && new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(n)}(?![\\p{L}\\p{N}_])`, "iu").test(text));
  }).map(c => c.id));
  for (const m of text.matchAll(/\b(?:look\w* (?:at|towards?)|inspect\w*|examin\w*|approach\w*|address\w*|speak\w* to|talk\w* to)\s+(?:the |that |a )?([^*.!?\n]{1,100})/gi)) {
    const terms = (m[1]!.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => !/^(?:the|a|an|man|woman|person|seller|slaver|with|in|and|his|her|to|at|of)$/.test(w));
    const found = canonical.filter(c => {
      const appearance = (gate!.identities.get(c.id)!.observable_appearance ?? "").toLowerCase();
      return terms.length > 0 && terms.every(t => new RegExp(`\\b${escapeRegExp(t)}(?:e)?\\b`).test(appearance));
    });
    if (found.length === 1) foundTargets.add(found[0]!.id);
  }
  // Casting fix: an engaged person described strongly enough by the player, or a definite reference to the one person the
  // previous scene narration described strongly, is that eligible canonical actor rather than a new duplicate.
  for (const m of text.matchAll(ENGAGE)) {
    const article = (m[1] ?? "").toLowerCase(), phrase = m[2]!, head = headNoun(phrase);
    if (!head || ["another", "some", "one"].includes(article)) continue;
    const direct = strongCanonicalMatch(context, phrase, head);
    if (direct) { foundTargets.add(direct); continue; }
    if (!["the", "that", "this"].includes(article) || !options.narration || options.owned?.has(head)) continue;
    const mention = narratedMention(options.narration, head);
    if (!mention) continue;
    // The player's own descriptive words must belong to that narrated person ("the woman with the fan" ⊆ the fan woman's sentence).
    const reference = phrase.split(/\s+(?:and|then|to)\s+(?=(?:ask|say|tell|greet|nod|smile|bow|offer|point|wave|look|wait|hand|give|introduce|speak|talk)\w*\b)/i)[0]!;
    const said = words(reference).filter(w => w.length > 2 && !w.includes("-") && !GENERIC.has(w) && w !== head);
    if (!said.every(w => words(mention).some(x => same(w, x)))) continue;
    const linked = strongCanonicalMatch(context, mention, head);
    if (linked) foundTargets.add(linked);
  }
  return foundTargets;
}
