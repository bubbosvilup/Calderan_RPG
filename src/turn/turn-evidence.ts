import { transferRecipient } from "../campaign/item-transfer.js";
import type { CharacterMovement } from "./character-movement.js";
import type { CampaignCommand } from "../campaign/types.js";
import { freezeSnapshot } from "../campaign/validation.js";
import type { TurnContext } from "./context-builder.js";
import type { PlayerIntent } from "./player-intent.js";
import { normalizeReference, type ResolvedReference } from "./reference-resolution.js";
import type { PhysicalInteraction } from "./physical-interaction.js";
import { itemTerms } from "./item-reference.js";
import { narratedDepartures, type DepartureEvidence } from "./scene-departure.js";
import { detectHouseholdChoices, type HouseholdChoice } from "./household-evidence.js";
import { escapeRegExp as escape } from "./language/text.js";

export type ConfirmationKind = "accepted_transfer" | "equipped_item" | "heard_fact" | "was_told_fact" | "agreed_event";
export interface NarratorConfirmation { readonly kind: ConfirmationKind; readonly command_indexes: readonly number[]; readonly collective: boolean; readonly source_sentence: string }
export interface NarratorRefusal { readonly command_indexes: readonly number[]; readonly source_sentence: string }
export interface TurnEvidence {
  readonly player_intents: readonly CampaignCommand[];
  readonly runtime_intents: readonly CampaignCommand[];
  readonly narrator_confirmations: readonly NarratorConfirmation[];
  readonly narrator_refusals: readonly NarratorRefusal[];
  readonly resolved_references: readonly ResolvedReference[];
  readonly ambiguous_reference: boolean;
  /** Repair 1: player-initiated physical acts this turn; the only basis for authorizing class-B conditions. */
  readonly physical_interactions?: readonly PhysicalInteraction[];
  /** Location Continuity Pass 1.3: completed movements of campaign characters to a known location narrated this turn. */
  readonly character_movements?: readonly CharacterMovement[];
  /** Runtime Continuity Repair 1: completed departures of present created characters narrated this turn. */
  readonly departures?: readonly DepartureEvidence[];
  /** Household Pass 1: voluntary household choices voiced by the chooser, and the player's explicit rule declarations. */
  readonly household_choices?: readonly HouseholdChoice[];
  readonly rule_declarations?: readonly string[];
}
const uncertain = /\b(not|never|no longer|maybe|perhaps|might|could|would|almost|pretend\w*|imagin\w*|consider\w*|unchanged|instead|inscription|quoted|hypothetical|if|unless)\b/i;
// Actual refusal: explicit refusal words, handing the offer back, or a negated acceptance verb.
// "rather than refusal" and a temporal hedge ("did not reach out immediately") are hesitation, not refusal.
const refusal = /\b(refus\w*|declin\w*|reject\w*)\b|\b(?:returns?|returned|gives?|gave|hands?|handed|pushes?|pushed) (?:them|it|the (?:\w+ ){0,3}(?:clothes|clothing|garments|items|stack|bundle|pile|shirts?|shorts|boots|ring)) back\b|\b(?:returns?|returned) (?:them|it)\b|\bgives? back\b|\b(?:does not|doesn't|did not|didn't|will not|won't|never|makes? no move to|making no move to|made no move to) (?:\w+ )?(?:take|accept|receive|hear|listen|agree|reach)\b/i;
// "accept or decline" is an undecided choice, not a refusal (Phase 1O).
const notRefusal = /\b(?:rather than|instead of|without|not|no|neither) (?:a |any )?(?:refus\w*|declin\w*|reject\w*)\b|\b(?:accept|take)\w* or (?:refus|declin|reject)\w*\b/gi;
// Phase 1O: "She had not heard this before" states prior ignorance (what a successful telling implies); it is not doubt about the telling.
const priorIgnorance = /\bhad(?:n't| not| never)\s+(?:heard|known|realized|been told)\b/gi;
const notEquipping =/\b(?:does not|doesn't|did not|didn't|not|no|never)\b(?: \w+){0,3}? (?:to )?(?:put\w*(?: (?:\w+ )?(?:anything|them|it))? on|wear\w*|dress\w*|chang\w*|equip\w*)\b/gi;
const temporalHedge =/\b(?:immediately|at first|right away|just yet|yet)\b/i;
const actionWords = /\b(refus\w*|declin\w*|reject\w*|return\w*|tak\w*|took|keep\w*|kept|accept\w*|receiv\w*|giv\w*|gave|hear\w*|told|tell\w*|agree\w*|hands?|handed|push\w*|back|ownership|transfer|equip\w*|meeting)\b/i;
const acceptVerb = "takes?|took|accepts?|accepted|receives?|received|gathers?|gathered|snatches?|snatched|picks? up|picked up|collects?|collected|unfolds?";
/**
 * Fronted discourse/manner modifiers stripped before the clause-leading-subject grammar. A CLOSED list: "Without hesitation, Brenna
 * takes the boots" was once missed because only "without a word" was known, so the recipient did not lead the clause. Hedges and
 * evidentials ("perhaps", "apparently", "supposedly") are deliberately absent: they keep disqualifying downstream.
 */
const leadIn = /^(?:without (?:a word|hesitation|a moment's hesitation|pause|delay|comment|ceremony|fuss)|after (?:a|another|the) (?:(?:brief|long|short|silent|tense) )?(?:moment|pause|beat|breath|while)(?: of [^,]+)?|finally|at last|at length|eventually|in the end|carefully|quickly|slowly|gently|simply|silently|wordlessly|hesitantly|cautiously|quietly|calmly|eagerly|reluctantly|gratefully|deftly|smoothly|briskly|gingerly),\s*|^then,?\s+/i;
const adverbs = "(?:(?:carefully|quickly|slowly|finally|gently|then|simply|silently|wordlessly|hesitantly|cautiously) )*";
const trailing = /\s+(?:back|from (?:nicco|you|him)(?:'s|s)?(?: (?:hands?|arms))?|into (?:her|his) (?:arms|hands|grasp|lap)|in (?:her|his) (?:arms|hands|lap)|against (?:her|his) (?:chest|lap|legs)|onto (?:her|his) lap|with (?:both hands|one hand)|without (?:hesitation|comment|a word)(?: on .*)?|(?:all )?at once|one by one|and sets? (?:it|them) .*)$/;
const clean = (s: string) => normalizeReference(s).replace(/[,;:]$/g, "");
const numbers: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
/** Bounded group phrases resolved only against the current same-turn offer. Returns whether the phrase names the whole offered set. */
function groupPhrase(object: string, offeredCount: number, allClothes: boolean): boolean {
  const g = object.replace(/^(?:all|both)(?: of)? /, m => (m.startsWith("both") ? "two " : "")).replace(/^(?:the|those|these) /, "");
  if (/^(?:them|all of them)$/.test(object)) return true;
  const count = g.match(/^(?:all )?(two|three|four|five)(?: of them)?$/) ?? g.match(/^(two|three|four|five) /);
  if (count && numbers[count[1]!] !== offeredCount) return false;
  const rest = g.replace(/^(?:all )?(?:two|three|four|five)(?: of them)?\s*/, "").replace(/^(?:(?:offered|pink|folded|new) )+/, "");
  if (!rest) return !!count;
  if (/^(?:items|things|pieces)$/.test(rest) || /^(?:whole )?(?:stack|bundle|pile)$/.test(rest)) return true;
  if (/^(?:garments|clothes|clothing|cloth|shirts and shorts|(?:stack|bundle|pile) of (?:(?:pink|folded|new) )*(?:clothes|clothing|garments|cloth|fabric))$/.test(rest)) return allClothes;
  return false;
}
/** A small same-turn grammar. It never searches for unrelated events or invents references. */
export function deriveTurnEvidence(intent: PlayerIntent, narration: string, context: TurnContext): TurnEvidence {
  const confirmations: NarratorConfirmation[] = [], refusals: NarratorRefusal[] = [];
  const nonactualFrame = /(?:^|[.!?\n])\s*(?:imagine\b|hypothetically\b|if\b|suppose\b|an? (?:inscription|story|example)\b)/i.test(narration.replace(/\*/g, ""));
  // Parenthetical stage directions ("(accepts the stack) Thanks.") are their own clauses.
  const sentences = nonactualFrame || /```|^\s*[\[{]/.test(narration) ? [] : narration.replace(/"[^"]*"|“[^”]*”|(?<!\w)'[^']*'(?!\w)/g, " ").replace(/\*/g, "").replace(/\(([^()\n]{1,200})\)/g, ". $1 .").split(/[.!?\n]+/).map(s => s.trim().replace(leadIn, "")).filter(Boolean).slice(0, 128);
  const people = context.characters.filter(c => c.id !== "nicco");
  const names = (id: string) => [...new Set([id, context.characters.find(c => c.id === id)?.profile.name].filter((x): x is string => !!x).map(clean))];
  const mention = (sentence: string, id: string) => names(id).some(n => new RegExp(`(?:^|\\W)${escape(n)}(?:$|\\W)`, "i").test(sentence));
  const leads = (sentence: string, id: string) => names(id).some(n => clean(sentence).startsWith(`${n} `) || clean(sentence).startsWith(`${n}, `));
  const recipientFor = (c: CampaignCommand): string | undefined => c.kind === "transfer_item" ? transferRecipient(c) ?? undefined : c.kind === "place_item" && c.position.kind === "equipped" ? c.position.character_id : c.kind === "set_knowledge" ? c.knowledge.character_id : undefined;
  // "her worn boots" names an item a present NPC already owns (state ownership), not some other offered/unoffered item.
  const ownedNouns = new Set(context.items.filter(i => i.owner_id !== "nicco" && people.some(p => p.id === i.owner_id)).map(i => clean(i.name ?? i.id).split(" ").at(-1)!));
  const withoutOwnPossessions = (s: string) => s.replace(/\b(?:her|his) (?:(?:own|old|worn|battered|cracked) )*(\w+)\b/g, (m, noun: string) => ownedNouns.has(noun) ? " " : m);
  let priorActor: string | undefined, lastMentioned: string | undefined;
  const ordinals = new Map<string, Set<string>>();
  const confirmed = new Set<number>();
  let groupDistracted = false;
  const offeredIds = intent.candidates.flatMap(c => c.kind === "transfer_item" ? [c.item_id] : []);
  const equipIntent = intent.candidates.some(c => c.kind === "place_item" || c.kind === "transfer_item" && c.position.kind === "equipped");
  const item = (id: string) => context.items.find(i => i.id === id);
  /** One noun phrase against the offered set: exact name/ID, a unique shirt descriptor, unique shorts, or bounded ordinals. */
  const matchItem = (phrase: string, offered: readonly string[], actor: string): string | undefined => {
    const object = clean(phrase.replace(/^and /, ""));
    const exact = offered.find(id => [id, item(id)?.name].some(n => n && object === clean(n)));
    if (exact) return exact;
    if (/^(cotton|fluffy|pink) shirt$/.test(object)) {
      const matching = offered.filter(id => clean(item(id)?.name ?? "").endsWith(object));
      if (matching.length === 1) return matching[0];
    }
    if (object === "shorts") { const shorts = offered.filter(id => /\bshorts\b/.test(clean(item(id)?.name ?? ""))); if (shorts.length === 1) return shorts[0]; }
    // Bounded clothing ordinals refer to the already-resolved offered set, never arbitrary inventory.
    const shirts = offered.filter(id => /\bshirt\b/.test(clean(item(id)?.name ?? "")));
    if (/^(first|second) shirt$/.test(object) && shirts.length === 2) {
      const seen = ordinals.get(actor) ?? new Set<string>(); seen.add(object); ordinals.set(actor, seen);
      if (seen.size === 2) return "__both_shirts__";
    }
    return undefined;
  };
  // Repair 1 inbound gifts (present character → Nicco). The giver's handover or Nicco's receipt confirms; the giver keeping,
  // withholding or refusing vetoes. Kept separate from the outbound grammar, whose actor is always the recipient NPC.
  const inboundIndexes = intent.candidates.flatMap((c, i) => c.kind === "transfer_item" && transferRecipient(c) === "nicco" ? [i] : []);
  const holderOf = (id: string) => { const it = item(id); return it && (it.position.kind === "carried" || it.position.kind === "equipped") ? it.position.character_id : undefined; };
  // Repair 1.1: head noun or a category word unique to this item in the scene ("footwear" for the only pair of boots).
  const terms = (id: string) => { const it = item(id); return it ? itemTerms(it, context.items) : escape(clean(id)); };
  const itemRef = (s: string, id: string) => new RegExp(`\\b(?:${terms(id)}|them|it|the pair)\\b`, "i").test(s);
  const itemNamed = (s: string, id: string) => new RegExp(`\\b(?:${terms(id)}|the pair)\\b`, "i").test(s);
  const GIVE = "gives?|gave|hands?|handed|passes?|passed|presses?|pressed|shoves?|shoved|tosses?|tossed|places?|placed|puts?|drops?|dropped|slides?|slid|thrusts?";
  const RECEIVE = "takes?|took|accepts?|accepted|receives?|received|catches?|caught|pockets?|pocketed";
  const PASSES = "(?:(?:are|is|were|was|get|gets|got) )?(?:pass(?:es)?|passed|go|goes|went|change hands|changed hands|transfers?|transferred)\\b[^,;]*\\b(?:to|into) (?:nicco|nicco's|his)\\b";
  const TO_NICCO = /\b(?:to (?:nicco|him)\b|into (?:nicco's|nicco|his) (?:hands?|arms|grasp|grip|palms?)|(?:nicco's|his) (?:hands?|grasp|grip)\b|over\b)/;
  // "a smile that doesn't reach her eyes" is an idiom, never a refusal to reach for something.
  const idiom = /\b(?:does not|doesn't|did not|didn't|never|not)\s+(?:quite\s+|fully\s+|ever\s+)?reach(?:es|ed)?\s+(?:her|his|their|the)\s+eyes\b/gi;
  // Retrieving an item ("withdraws a pair of boots from his satchel") is not withholding; withdrawing the offer or the hand is.
  // Repair 1.1: the giver taking the item back is withholding too.
  const withholding = /\b(?:(?:takes?|took|taking|snatch\w*) (?:them|it|the [\w' ]{1,30}?) back|(?:keeps?|kept) (?:them|it|hold of (?:them|it)|the [\w' ]{1,30}?(?:for (?:him|her|them)sel(?:f|ves)|to (?:him|her)self|back|close))(?![\w ]*\b(?:extended|out|outstretched|held out|toward|towards|forward|offered|raised)\b)|withdr(?:aws?|ew|awing|awn) (?:them|it|(?:his|her|their|the) (?:hand|hands|offer|gift|arm))|pulls? (?:\w+ ){0,2}back|pulled (?:\w+ ){0,2}back|tucks? (?:them|it) away|tucked (?:them|it) away|holds? on to|held on to|clutch\w* (?:them|it) (?:close|tight))\b/i;
  // Refusals/contradictions invalidate the affected cooperative intent, never unrelated commands.
  for (const [sentenceIndex, sentence] of sentences.entries()) {
    const explicitActors = people.filter(p => mention(sentence, p.id));
    // Veto-only pronoun fallback source: the single character named in the immediately previous sentence (updated before any early exit).
    const previousMentioned = lastMentioned; lastMentioned = explicitActors.length === 1 ? explicitActors[0]!.id : undefined;
    // A leading hedge adverb is skipped only to find the subject; the sentence itself stays hedged.
    const subject = sentence.replace(/^(?:maybe|perhaps|probably|possibly)\s+/i, "").match(/^(\S+)\s+(.+)$/);
    const subjectless = new RegExp(`^${adverbs}(?:${acceptVerb})\\s`, "i").test(sentence);
    let actor = explicitActors.length === 1 && leads(sentence, explicitActors[0]!.id) ? explicitActors[0]!.id : undefined;
    if (!actor && subject && /^(she|he)$/i.test(subject[1]!)) actor = priorActor ?? (sentenceIndex === 0 && people.length === 1 ? people[0]!.id : undefined);
    if (explicitActors.length > 1) { priorActor = undefined; actor = undefined; }
    if (!actor && subjectless) actor = priorActor ?? (sentenceIndex === 0 && people.length === 1 ? people[0]!.id : undefined);
    if (!actor && /ownership.*unchanged/i.test(sentence)) actor = priorActor;
    if (!actor && explicitActors.length === 1 && names(explicitActors[0]!.id).some(n => clean(sentence).startsWith(`${n}\'s `))) priorActor = explicitActors[0]!.id;
    if (actor) priorActor = actor;
    else if (explicitActors.length && !names(explicitActors[0]!.id).some(n => clean(sentence).startsWith(`${n}\'s `))) priorActor = undefined;
    const distraction = withoutOwnPossessions(clean(sentence));
    if (context.items.some(i => !offeredIds.includes(i.id) && [i.id, i.name].some(n => n && new RegExp(`\\b${escape(clean(n))}\\b`).test(distraction)))) groupDistracted = true;
    const refusing = refusal.test(sentence.replace(notRefusal, " ").replace(idiom, " ")) && !(temporalHedge.test(sentence) && !/\b(refus\w*|declin\w*|reject\w*|back)\b/i.test(sentence.replace(notRefusal, " ")));
    // "does not put anything on" after receipt is the requested carried-not-equipped narration, not doubt about the transfer.
    const ownershipPreserved = intent.candidates.some(c => c.kind === "transfer_item") && intent.candidates.filter(c => c.kind === "transfer_item").every(c => c.mode !== "gift");
    const hedgeSentence = ownershipPreserved ? sentence.replace(/\bownership (?:is |remains? )?unchanged\b/gi, " ") : sentence;
    const hedged = !refusing && uncertain.test(hedgeSentence.replace(notRefusal, " ").replace(idiom, " ").replace(equipIntent ? /$^/ : notEquipping, " ").replace(priorIgnorance, " "));
    // Veto-only pronoun fallback (Phase 1O): "Nicco tells Brenna X. She does not hear him." A leading she/he may resolve to the
    // single character named in the previous sentence, but only to attach refusals/doubt, never confirmations.
    const vetoActor = actor ?? (subject && /^(she|he)$/i.test(subject[1]!) ? previousMentioned : undefined);
    const niccoLedSentence = /^nicco\b/.test(clean(sentence));
    for (const i of inboundIndexes) {
      const c = intent.candidates[i] as Extract<CampaignCommand, { kind: "transfer_item" }>, giver = holderOf(c.item_id);
      if (!giver) continue;
      // "He takes them." after the giver (a woman) offered: the pronoun's gender excludes the giver, and only Nicco remains.
      const giverPronoun = context.characters.find(ch => ch.id === giver)?.pronoun, lead = subject?.[1]?.toLowerCase();
      const pronounNicco = !!giverPronoun && (lead === "he" || lead === "she") && lead !== giverPronoun && people.length === 1;
      const niccoLed = niccoLedSentence || pronounNicco;
      // Repair 1.1: a pronoun whose gender matches the giver, with only Nicco and the giver present, is the giver.
      const pronounGiver = !!giverPronoun && lead === giverPronoun && people.length === 1;
      const s = clean(sentence), byGiver = !pronounNicco && (actor === giver || pronounGiver || vetoActor === giver && (refusing || hedged));
      // Repair 1.1: negated withholding ("does not move to withdraw the offer") is not withholding.
      const w = withholding.exec(sentence);
      const withheld = !!w && !/(?:\b(?:not|never|no|without|nor)\b|n't)\s+(?:\w+\s+){0,4}$/i.test(sentence.slice(0, w.index));
      // A later hedged sentence retracts an established handover only when it concerns the transfer or the item itself.
      // The transfer verb must take the item, Nicco or them/it as its object: "might give any of her charges" is not about the boots.
      const aboutTransfer = itemNamed(sentence, c.item_id) || /\b(?:tak\w*|took|accept\w*|receiv\w*|giv\w*|gave|hand\w*|keep\w*|kept|return\w*|refus\w*|declin\w*|reject\w*|withdr\w*|releas\w*|let(?:s|ting)? go of|part\w* with|push\w*)\b(?:\s+[\w']+){0,2}?\s+(?:them|it|nicco|him)\b/i.test(sentence.replace(idiom, " "));
      if ((refusing || withheld) && (byGiver || niccoLed) || hedged && (byGiver || niccoLed) && confirmed.has(i) && aboutTransfer) { refusals.push({ command_indexes: [i], source_sentence: sentence }); continue; }
      if (refusing || hedged) continue;
      const rest = s.replace(new RegExp(`^(?:${[...names(giver), "she", "he", "nicco"].map(escape).join("|")}),? `), "");
      // A completed handover reaches Nicco ("to Nicco", "into his hands", "hands them over", "gives him the boots"); a gesture
      // "toward Nicco" is still an offer.
      const verbless = rest.replace(new RegExp(`^${adverbs}(?:${GIVE})\\s+`), "");
      const handover = actor === giver && new RegExp(`^${adverbs}(?:${GIVE})\\b`).test(rest) && (TO_NICCO.test(verbless) || /^(?:nicco|him)\b/.test(verbless)) && itemRef(rest, c.item_id);
      const receipt = niccoLed && new RegExp(`^${adverbs}(?:${RECEIVE})\\b`).test(rest) && itemRef(rest, c.item_id);
      // Item-subject handover: "The boots pass into Nicco's hands", "The boots pass from his grip to Nicco's".
      const passes = new RegExp(`^(?:the |a )?(?:[\\w']+ ){0,3}?(?:${terms(c.item_id)}|pair) ${PASSES}`, "i").test(s);
      if (handover || receipt || passes) { confirmations.push({ kind: "accepted_transfer", command_indexes: [i], collective: false, source_sentence: sentence }); confirmed.add(i); }
    }
    const indexes = intent.candidates.flatMap((c, i) => {
      if (inboundIndexes.includes(i)) return [];
      // Nicco's own act ("Nicco hands the boots back to Korvin") is never the recipient's refusal.
      if (niccoLedSentence && refusing) return [];
      const recipient = recipientFor(c);
      return recipient === actor || (refusing || hedged) && !!recipient && recipient === vetoActor || recipient && mention(sentence, recipient) && (refusing || hedged) || c.kind === "schedule_event" && (actor && c.participants?.includes(actor) || /^(everyone|we)\b/i.test(sentence)) ? [i] : [];
    });
    if (refusing) {
      if (indexes.length && actionWords.test(sentence)) refusals.push({ command_indexes: indexes, source_sentence: sentence });
      continue;
    }
    if (hedged) {
      // Hesitation before an explicit acceptance is not refusal; doubt about an already-confirmed action retracts it.
      if (indexes.some(i => confirmed.has(i)) && actionWords.test(sentence)) refusals.push({ command_indexes: indexes, source_sentence: sentence });
      continue;
    }
    // Subject must lead the clause. Mentioning someone in a story/inscription does not suffice.
    const startsAsActor = !!actor && (leads(sentence, actor) || /^(she|he)\s/i.test(sentence) || subjectless);
    const transferIndexes = indexes.filter(i => intent.candidates[i]!.kind === "transfer_item");
    if (startsAsActor && transferIndexes.length) {
      const s = subjectless ? clean(sentence) : clean(sentence).replace(new RegExp(`^(?:${[...names(actor!), "she", "he"].map(escape).join("|")}),? `), "");
      // Phase 1M.1 Stage B forms: "reaches out and takes them", "says, accepting the bundle". Reaching alone is never receipt.
      const verb = s.match(new RegExp(`^${adverbs}(?:(?:reaches?|reached) out and ${adverbs})?(?:${acceptVerb})\\s+(.+)$`))
        ?? s.match(new RegExp(`^(?:says?|said|murmurs?|murmured|nods?|nodded)(?: \\w+)?, (?:accepting|taking|gathering|receiving|collecting) (.+)$`))
        ?? s.match(new RegExp(`^${adverbs}(?:extends?|extended|holds? out|held out|puts? out|stretches? out|stretched out) (?:one hand|a hand|her hands?|his hands?|both hands|both arms|her arms|his arms) to (?:take|accept|receive|collect|gather) (.+)$`))
        ?? s.match(new RegExp(`\\bbefore ${adverbs}(?:taking|accepting|receiving|gathering|collecting|picking up|snatching) (.+)$`));
      if (verb) {
        const offered = transferIndexes.map(i => (intent.candidates[i] as Extract<CampaignCommand, { kind: "transfer_item" }>).item_id);
        const allClothes = offered.every(id => /\b(shirt|shorts|clothes|garments)\b/.test(clean(item(id)?.name ?? id)));
        const strip = (p: string) => { let x = clean(p), prev = ""; while (x !== prev) { prev = x; x = x.replace(trailing, ""); } return x; };
        // Comma-separated clauses: a group phrase, or a list naming offered items; stop at the first participial tail.
        const clauses = verb[1]!.split(/\s*,\s*/).map(strip).filter(Boolean);
        const whole = !groupDistracted && offeredIds.length === transferIndexes.length && !!clauses[0] && groupPhrase(clauses[0], offered.length, allClothes);
        const parts = clauses.flatMap(p => p.split(/\s+and\s+/)).map(strip).filter(Boolean);
        const listed: string[] = [];
        if (!whole) for (const part of parts) {
          const id = matchItem(part, offered, actor!);
          if (!id) { if (context.items.some(i => [i.id, i.name].some(n => n && new RegExp(`\\b${escape(clean(n))}\\b`).test(part)))) listed.length = 0; break; }
          if (id === "__both_shirts__") listed.push(...offered.filter(o => /\bshirt\b/.test(clean(item(o)?.name ?? ""))));
          else listed.push(id);
        }
        const unique = [...new Set(listed)];
        const collective = whole || unique.length > 1 && unique.length === offered.length && offeredIds.length === transferIndexes.length;
        const matched = whole ? transferIndexes : transferIndexes.filter(i => unique.includes((intent.candidates[i] as Extract<CampaignCommand, { kind: "transfer_item" }>).item_id));
        if (matched.length) { confirmations.push({ kind: "accepted_transfer", command_indexes: matched, collective, source_sentence: sentence }); matched.forEach(i => confirmed.add(i)); }
      }
    }
    intent.candidates.forEach((command, index) => {
      const s = clean(sentence);
      if (command.kind === "place_item" && command.position.kind === "equipped") {
        const { character_id, slot } = command.position, item = context.items.find(i => i.id === command.item_id);
        if (names(character_id).some(n => [command.item_id, item?.name].some(label => label && s === `${n} equips ${clean(label)} in ${slot}`))) confirmations.push({ kind: "equipped_item", command_indexes: [index], collective: false, source_sentence: sentence });
      }
      if (command.kind === "set_knowledge") {
        const k = command.knowledge, fact = context.facts.find(f => f.id === k.fact_id);
        if (!fact) return;
        // Explicit communication only: the fact statement itself (or a past-tense "was" variant) addressed to the intent's recipient.
        const statement = clean(fact.statement);
        const C = `(?:the )?(?:${[...new Set([clean(fact.id), statement, statement.replace(/\bis\b/, "was")])].map(escape).join("|")})`;
        const P = `(?:${[...names(k.character_id), ...(intent.candidates.filter(c => c.kind === "set_knowledge").length === 1 ? ["her", "him"] : [])].map(escape).join("|")})`;
        const SRC = "(?:nicco|you)", ADV = "(?:(?:clearly|quietly|softly|plainly|calmly|simply|gently|evenly) )?";
        const told = [
          `^${SRC} ${ADV}(?:tells?|told|informs?|informed) ${P} (?:that )?${C}$`,
          `^${SRC} ${ADV}(?:tells?|told|explains?|explained|mentions?|mentioned) ${C} to ${P}$`,
          `^${SRC} ${ADV}(?:states?|stated|says?|said|explains?|explained|mentions?|mentioned|reports?|reported) to ${P},? that ${C}$`,
          `^${SRC} (?:turns?|turned) to ${P} and (?:tells?|told) (?:her|him|${P}) (?:that )?${C}$`,
          `^${SRC} ${ADV}(?:speaks?|spoke)(?: the words)? ${ADV}to ${P},? (?:(?:telling|informing) (?:her|him|${P}) (?:that )?|(?:stating|explaining|saying|reporting) (?:that )?)${C}$`,
        ].some(f => new RegExp(f).test(s));
        const heard = [`^${P} (?:hears|is told|reacts after hearing)(?: that)? ${C}(?: from nicco)?$`, `^${P} hears ${SRC} (?:say|tell (?:her|him)|state)(?: that)? ${C}$`].some(f => new RegExp(f).test(s));
        if (told || heard) confirmations.push({ kind: told ? "was_told_fact" : "heard_fact", command_indexes: [index], collective: false, source_sentence: sentence });
      }
      if (command.kind === "schedule_event") {
        const minute = command.scheduled_world_minute;
        const uniqueEvent = intent.candidates.filter(c => c.kind === "schedule_event").length === 1;
        const others = (command.participants ?? []).filter(id => id !== "nicco");
        const forms = [`everyone agrees to ${clean(command.title)} at world minute ${minute}`,
          ...(uniqueEvent ? [`we meet at world minute ${minute}`] : []),
          ...(uniqueEvent && others.length === 1 ? names(others[0]!).flatMap(n => [`${n} agrees to meet at minute ${minute}`, `${n} agrees to meet at world minute ${minute}`]) : [])];
        if (forms.includes(s)) confirmations.push({ kind: "agreed_event", command_indexes: [index], collective: false, source_sentence: sentence });
      }
    });
    for (const c of confirmations) for (const i of c.command_indexes) confirmed.add(i);
  }
  return freezeSnapshot({ player_intents: structuredClone(intent.candidates), runtime_intents: structuredClone(intent.runtime), narrator_confirmations: confirmations, narrator_refusals: refusals, resolved_references: intent.resolved_references ?? [], ambiguous_reference: intent.ambiguous_reference ?? false, ...(intent.natural?.physical?.length ? { physical_interactions: structuredClone(intent.natural.physical) } : {}), ...departuresOf(narration, context), ...householdOf(intent, narration, context) }) as TurnEvidence;
}
function departuresOf(narration: string, context: TurnContext): { departures?: DepartureEvidence[] } {
  const found = narratedDepartures(narration, context);
  return found.length ? { departures: structuredClone([...found]) } : {};
}
function householdOf(intent: PlayerIntent, narration: string, context: TurnContext): { household_choices?: HouseholdChoice[]; rule_declarations?: string[] } {
  const choices = detectHouseholdChoices(narration, context), rules = intent.rule_declarations ?? [];
  return { ...(choices.length ? { household_choices: structuredClone([...choices]) } : {}), ...(rules.length ? { rule_declarations: [...rules] } : {}) };
}
