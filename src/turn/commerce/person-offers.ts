import type { CampaignCommand, CampaignSnapshot, TransferDocumentation } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { TurnContext } from "../context/context-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { WorldStore } from "../../world/world-store.js";
import { classifyBackgroundClaim } from "../identity/background-grounding.js";
import type { EphemeralSceneParticipant } from "../identity/scene-participants.js";
import { linkedParticipant, materializeProvisional } from "../identity/provisional-people.js";
import { asksName } from "../identity/identity-request.js";
import { NOTHING_WITHHELD, maskDeep, mergeWithheld, reservedClaims, type WithheldNames } from "../identity/canonical-name-reservation.js";
import { NUMBER_PHRASE_SOURCE } from "../language/numbers.js";
import { AUCTION } from "./trade-price.js";
import { CAPTIVE, createFactSource, refersTo, type NarratedPerson, type NarrationFactSource, type NarrationFacts, type NarrationUnit, type SceneReading } from "../narration-facts/index.js";
import { actionableQuote, inSegment, sellerPrices, sellerQuotes, unsupportedMoney } from "./commerce-evidence.js";
import { escapeRegExp as esc, exactNamePattern } from "../language/text.js";

/**
 * Actual Offer V1: deterministic READING of a person offer from delivered narration. This module never settles anything and never changes
 * funds, ownership or legal status. When the seller's delivered narration states a price for one resolvable person, it yields a
 * `propose_trade_offer` command whose stored plan (materialization of a narrated captive, the seller as legal holder, the sale itself) is exactly
 * what the existing person-transaction commands will apply when the PLAYER accepts the offer in the interface. The player's own words ("deal",
 * "*pays*", a counter-price) are never read as acceptance and never set a price: only the seller's stated price counts.
 *
 * Subjects: a present persistent enslaved person held by a present seller; or a narrated captive of the current scene (the NarrationFacts scene reading),
 * who is materialized only when the offer is accepted. Sellers: a present persistent character, a named narrated person, or an anonymous
 * narrated speaker ("the whittler"), recorded as a counterparty snapshot and never made a character.
 */
export interface PersonOfferResolution {
  readonly commands: readonly CampaignCommand[];
  readonly diagnostics: readonly { readonly status: "offered" | "blocked" | "ambiguous" | "no_offer"; readonly detail: Readonly<Record<string, unknown>> }[];
}
export interface OfferOptions { readonly world: WorldStore; readonly participants?: readonly EphemeralSceneParticipant[];
  /** The turn's shared NarrationFacts source (the audit and authorization read the same one). Omitted: one is built here from the context. */
  readonly facts?: NarrationFactSource }
/** What a seller-voiced text STATES as the current price, read from the shared commerce facts of the delivered narration. */
type PriceReader = (text: string) => number[];
const NUM = `(${NUMBER_PHRASE_SOURCE})`;
const DOCUMENTED = /\b(?:papers? included|with (?:the |full |clean )?papers|clean transfer|(?:his|her|the seller's|my) seal|no liens|bill of sale|deed of (?:sale|transfer)|transfer papers)\b/i;
const UNDOCUMENTED = /\b(?:no papers|without (?:any )?papers|no listing|unlisted|unpapered|off the books|papers? (?:are )?(?:missing|lost|burned))\b/i;
function sentences(text: string): string[] { return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean); }
/**
 * `recent` already ends with the CURRENT exchange (player input and delivered narration). Returns at most one offer: a person offer is made only
 * for a subject whose price the seller just stated.
 */
export function resolvePersonOffers(input: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, recent: readonly RecentExchange[], baseRevision: number, options: OfferOptions): PersonOfferResolution {
  const commands: CampaignCommand[] = [], diagnostics: PersonOfferResolution["diagnostics"][number][] = [];
  const present = new Set(context.characters.map(c => c.id));
  const name = (id: string) => id === "nicco" ? "Nicco" : context.characters.find(c => c.id === id)?.profile.name ?? id;
  const legal = (id: string) => snapshot.legal_statuses.find(l => l.character_id === id);
  const named = (text: string, id: string) => { const n = name(id); return exactNamePattern([n, ...n.split(/\s+/).filter(t => t.length > 2)], "i").test(text); };
  const txId = (subject: string) => `campaign_transaction_r${baseRevision}_${subject.replace(/^campaign_character_/, "")}`.slice(0, 120);
  const latestExchange = latestOf(recent);
  const latest = latestExchange?.narration ?? "";
  if (!latest || AUCTION.test(latest) && /\b(?:bids?|bidding|lot)\b/i.test(latest)) return { commands, diagnostics };
  // ONE reading of the delivered narration's prices: the shared commerce facts (a seller-voiced, current, completed quote; never the player's figure).
  const source = options.facts ?? createFactSource({ movers: [], context }), facts = source.of(latest);
  const prices: PriceReader = text => sellerPrices(facts, text);
  const unsupported = (text: string) => unsupportedMoney(facts, text) !== undefined;
  // AUD-1 (decision 2026-10-14): the reserved canonical handles each narrated person claimed, from the identity facts of the scene's narrations.
  const identity = recent.flatMap(e => e.narration ? source.of(e.narration).identity : []);
  const withheld = (p: NarratedPerson) => p.character_id ? NOTHING_WITHHELD : reservedClaims(options.world, identity, p);
  const candidates = [...present].filter(id => { const l = legal(id); return l?.status === "enslaved" && l.holder_id !== "nicco" && !!l.holder_id && present.has(l.holder_id); });
  // Narrator-created captives of the current scene (and present persistent people not yet legally held, e.g. materialized under a name) compete with held persons for the one subject.
  const unheld = new Set(context.characters.filter(c => c.id !== "nicco" && !legal(c.id) && /\bcaptive\b/.test(c.established_origin?.role ?? "")).map(c => c.id));
  const readingOptions = { campaign_names: new Set(snapshot.characters.filter(c => !c.retirement).flatMap(c => c.profile.name ? [c.profile.name.toLowerCase()] : [])), rpg_speech: true, asks_name: asksName };
  // The ONE scene reading (NarrationFacts): who is narrated, who speaks each line (seller binding reads these speakers), who is held.
  let reading: SceneReading | undefined = source.scene(recent, context, options.world, { unheld, ...readingOptions });
  // A person materialized under a name before the narration showed them held has no captive role; when the scene narrates a captive under the very noun the narrator attached to them, they are that captive.
  const nouns = new Set(reading.persons.filter(p => p.captive && !p.name && !p.character_id && p.noun).map(p => p.noun!));
  const late = context.characters.filter(c => c.id !== "nicco" && !unheld.has(c.id) && !legal(c.id) && c.established_origin?.descriptor && nouns.has(c.established_origin.descriptor.toLowerCase())).map(c => c.id);
  if (late.length) reading = source.scene(recent, context, options.world, { unheld: new Set([...unheld, ...late]), ...readingOptions });
  // The seller points at someone the narration only showed as part of a group ("Two women sit inside…", "Three hundred for her."): that person is the subject.
  const pointed = reading.captives.length ? undefined : pointedCaptive(reading, input, prices, facts);
  if (pointed) reading = { ...reading, persons: [...reading.persons, pointed], captives: [pointed] };
  const target = resolveTarget(input, candidates, reading, named, latestExchange);
  if (target?.kind === "narrated") { offerNarrated(target.person, reading, { input, context, snapshot, baseRevision, participants: options.participants ?? [], latest: latestExchange, commands, diagnostics, name, txId, facts, prices, unsupported, withheld,
    keepClaim: (text: string) => classifyBackgroundClaim(text, options.world).status !== "unverified" }); return { commands, diagnostics }; }
  if (target?.kind === "ambiguous" || target?.kind === "changed") { diagnostics.push({ status: target.kind === "changed" ? "blocked" : "ambiguous", detail: { candidates: target.labels, ...(target.kind === "changed" ? { reason: "subject_changed" } : {}) } }); return { commands, diagnostics }; }
  if (!candidates.length) return { commands, diagnostics };
  // Persistent path: a held person whom the seller's latest narration prices. The subject is the resolved target, else the scene's single held person.
  const PRICE_WORDS = new RegExp(`\\b(?:price|how much|sell|for sale|asking|costs?|worth|buy|take (?:her|him|them))\\b|["“]\\s*${NUM}\\s+gold\\b|["“]\\s*${NUM}\\s*[.!](?!\\w)`, "i");
  const talk = PRICE_WORDS.test(latest) || PRICE_WORDS.test(input) || PRICE_WORDS.test(latestExchange?.player ?? "");
  const own = (id: string) => pricedSentences(latest, id, candidates, named, input, prices);
  // Without a sentence naming the person, a quote still prices the one held person when the exchange is price talk ("Sixty gold. She's sound.").
  // ...but only when the exchange is about a person at all: a goods price ("Fifty gold for the crown") never prices the held person.
  const PERSON = /\b(?:woman|girl|man|boy|lass|lad|child|slave|captive|prisoner|worker|elf|beastfolk|she|her|him|them)\b/i;
  const beats = sentences(latest);
  const aboutAPerson = (id: string) => named(input, id) || beats.some((t, i) => prices(t).length && [beats[i - 1], t, beats[i + 1]].some(x => !!x && (named(x, id) || PERSON.test(x))));
  const linesFor = (id: string) => own(id).length ? own(id) : talk && aboutAPerson(id) ? beats.filter(t => prices(t).length) : [];
  const subject = target?.kind === "persistent" ? target.id : candidates.length === 1 ? candidates[0] : undefined;
  const priced = candidates.filter(id => own(id).length);
  const chosen = subject ? (linesFor(subject).length ? subject : undefined) : priced.length === 1 ? priced[0] : undefined;
  if (!chosen) { if (!subject && priced.length > 1) diagnostics.push({ status: "ambiguous", detail: { candidates: priced } }); return { commands, diagnostics }; }
  const sellerId = legal(chosen)!.holder_id!;
  const lines = linesFor(chosen);
  if (lines.some(l => unsupported(l))) { diagnostics.push({ status: "blocked", detail: { subject: chosen, reason: "unsupported_currency" } }); return { commands, diagnostics }; }
  const quote = actionableQuote(lines.flatMap(l => sellerQuotes(facts, l)));
  if (quote.kind === "ambiguous") { diagnostics.push({ status: "ambiguous", detail: { subject: chosen, seller: sellerId, reason: "several_prices", amounts: quote.amounts } }); return { commands, diagnostics }; }
  const price = quote.kind === "quote" ? quote.quote.amount : undefined;
  if (price === undefined || price < 1) { diagnostics.push({ status: "no_offer", detail: { subject: chosen, seller: sellerId } }); return { commands, diagnostics }; }
  const papers: TransferDocumentation = UNDOCUMENTED.test(latest) ? "undocumented" : DOCUMENTED.test(latest) ? "documented" : "unestablished";
  const said = sentences(latest.replace(/["“”]/g, ""));
  const provenance = (said.find(s => /\b(?:chain|forfeit\w*|liens?|seal|listing)\b/i.test(s)) ?? said.find(s => /\bpapers?\b/i.test(s)))?.slice(0, 200);
  const plan: CampaignCommand[] = [{ kind: "transfer_person", transaction_id: txId(chosen), transaction_kind: "sale", character_id: chosen, from_holder_id: sellerId, to_holder_id: "nicco",
    payment: { payer_id: "nicco", payee_id: sellerId, gold: price }, documentation: papers, ...(provenance ? { note: provenance } : {}) }];
  commands.push({ kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty: { kind: "character", character_id: sellerId }, subject: { kind: "person", subject_character_id: chosen, plan }, evidence: (lines.at(-1) ?? "").slice(0, 160) });
  diagnostics.push({ status: "offered", detail: { subject: chosen, seller: sellerId, price, papers } });
  return { commands, diagnostics };
}
/**
 * Whole-gold amounts a seller's sentence states: "five gold", "5 gold", a quote that is only a number ("Five."), and the spoken forms a
 * seller actually uses while bargaining: "Three hundred for her.", "I'll go two-sixty.", "Make it two-sixty.", "Done, then. Two-sixty.".
 * A bare number sentence that the next sentence turns down ("Two hundred. You're a full third off.") repeats the buyer's figure and is no offer.
 */
/** Prices a block of narration states, sentence by sentence (shared grammar: src/turn/commerce/trade-price.ts). */
/** Sentences of the latest narration that state a price and are about this person (their name, or the only held person by pronoun/noun), excluding past costs and group prices. */
function pricedSentences(latest: string, id: string, candidates: readonly string[], named: (text: string, id: string) => boolean, input: string, prices: PriceReader): string[] {
  const only = candidates.length === 1;
  const request = /\b(?:price|how much|sell|buy)\b/i.test(input) && named(input, id);
  return sentences(latest).filter(t => prices(t).length && (named(t, id) || (only && /\b(?:she|her|he|him|them|the (?:girl|woman|man|boy|lass|lad|slave|captive))\b/i.test(t)) || request));
}

/**
 * A person the seller prices by pointing, not by naming: the seller's latest speech states a price "for her/him" (or "that one"), the recent scene
 * narration shows held people (a captivity marker, or a group of captives) and no singular described captive exists. The subject is then the one
 * person of that sex the narration described after the introduction ("The other is broader…", "She sits…"). Nothing here settles or materializes anybody:
 * the offer stores the plan and the player's Accept applies it.
 */
const PERSON_ONE = /\b(?:the|that|this) [a-z-]+(?: [a-z-]+)? one\b|\bgot (?:one|another)\b|\bone right here\b|\b(?:young|younger|old|older|other) one\b/i;
const PERSON_FACTS = /\b(?:twenty|thirty|forty|fifteen|sixteen|seventeen|eighteen|nineteen)[- a-z]*\b|\b\d{2}\b|\bcan read\b|\bhealthy\b|\bsturdy\b|\bknows (?:her|his) work\b|\bdebt[- ]settlement\b|\bno marks\b|\bgood health\b|\bfollow orders\b|\bdoes(?:n't| not) (?:give|cause) trouble\b|\bstrong back\b|\btrade skills\b|\bhaul(?:ing)?\b|\bsound working\b/i;
function pointedCaptive(reading: SceneReading, input: string, prices: PriceReader, facts: NarrationFacts): NarratedPerson | undefined {
  const priced = reading.units.filter(u => u.exchange === reading.latest && u.quoted && !!u.speaker && !u.speaker.startsWith("other:") && prices(u.text).length && !facts.commerce.some(f => f.kind === "price_quote" && f.quote_kind !== "current" && inSegment(f, u.text)));
  const refs = priced.map(u => u.text.match(/\b(?:for|to take|take) (her|him)\b|\b(she|he)(?:'s| is)\b|\b(her|him)\b/i)).filter((m): m is RegExpMatchArray => !!m);
  const sexes = new Set(refs.map(m => /^(?:her|she)$/i.test((m[1] ?? m[2] ?? m[3])!) ? "woman" : "man"));
  // The player's own purchase/price request names the sex ("Sell her to me"); it beats a narration pronoun ("he's" is usually the seller).
  const requestSex = (): "woman" | "man" | undefined => {
    if (!/\b(?:sell|buy|price|how much|cost|take|want)\b/i.test(input)) return undefined;
    const wn = /\b(?:woman|girl|lass|her)\b/i.test(input), mn = /\b(?:man|boy|lad|him)\b/i.test(input);
    return wn !== mn ? (wn ? "woman" : "man") : undefined;
  };
  { const r = requestSex(); if (r && priced.length && !reading.persons.some(p => !!p.name && (p.captive || !!p.character_id))) { sexes.clear(); sexes.add(r); } }
  // No pronoun ("The debt-settlement one. Can read, write some. Twenty-two. Healthy. Twelve hundred gold."): a "the <descriptor> one" pitch of a person
  // (age or skill facts), whose sex is the one the player asked for (their own words, never the narrator's).
  const spoken = reading.units.filter(u => u.exchange === reading.latest && u.quoted && !!u.speaker && !u.speaker.startsWith("other:")).map(u => u.text).join(" ");
  if (!sexes.size && priced.length && (PERSON_ONE.test(spoken) || /\b(?:she|her)\b/i.test(spoken)) && PERSON_FACTS.test(spoken)) {
    const asked = reading.exchanges.slice(-3).map(e => e.player).join(" ");
    // Sex nouns first, else the object pronoun of the request ("sell her to me"); a subject pronoun ("he has") is the seller.
    const nouns = (re: RegExp) => re.test(asked), wn = nouns(/\b(?:woman|women|girl|girls|lass)\b/i), mn = nouns(/\b(?:man|men|boy|boys|lad)\b/i);
    const w = wn || (!mn && /\b(?:her)\b/i.test(asked)), m = mn || (!wn && /\b(?:him)\b/i.test(asked));
    if (w !== m) sexes.add(w ? "woman" : "man");
  }
  // The player's own request is a purchase/price request for a person ("Sell her to me, price?", "how much for the woman"): the seller's reply price is for her.
  // ...but only for an anonymous person: a narrated NAMED person (already materialized, e.g. Maren) is never re-pointed at.
  if (!sexes.size && priced.length && !reading.persons.some(p => !!p.name && (p.captive || !!p.character_id))) {
    const ask = input;
    if (/\b(?:sell|buy|price|how much|cost|take|want)\b/i.test(ask)) {
      const wn = /\b(?:woman|girl|lass|her)\b/i.test(ask), mn = /\b(?:man|boy|lad|him)\b/i.test(ask);
      if (wn !== mn) sexes.add(wn ? "woman" : "man");
    }
  }
  if (sexes.size !== 1) return undefined;
  const noun = [...sexes][0]!;
  const recent = reading.units.filter(u => !u.quoted && u.exchange >= reading.latest - 2);
  // Held evidence: a captivity marker or a plural captive noun in the narration, or the seller's own slave-trade pitch for "the young one" ("fieldwork, kitchen").
  const pitch = /\b(?:young(?:er)?|old(?:er)?|other) one\b|\bfield-?work\b|\bkitchen\b|\blabou?r\b|\bhousework\b|\bno marks\b|\bdebt[- ]settlement\b|\bhousework\b|\bgood health\b|\bfollow orders\b|\bdoes(?:n't| not) (?:give|cause) trouble\b|\bstrong back\b|\btrade skills\b|\bhaul(?:ing)?\b/i.test(reading.units.filter(u => u.quoted && u.exchange >= reading.latest - 2).map(u => u.text).join(" ") + " " + spoken);
  const held = pitch || recent.some(u => CAPTIVE.test(u.text) || /\b(?:two|three|four|several|some|a few)\s+(?:women|men|people|captives|slaves|prisoners|girls|boys)\b/i.test(u.text));
  if (!held) return undefined;
  const mine = noun === "woman" ? /^(?:the other\b|she\b|her\b)|\bthe woman\b|\bthat one\b/i : /^(?:the other\b|he\b|his\b)|\bthe man\b|\bthat one\b/i;
  // The seller's own descriptor ("the young one", "the older one") chooses which narrated person the facts come from.
  const said = priced.map(u => u.text).join(" "), younger = /\byoung(?:er)? one\b/i.test(said), older = /\b(?:old(?:er)?|other) one\b/i.test(said);
  const byDescriptor = younger !== older ? recent.filter(u => younger ? /^one is\b/i.test(u.text.trim()) || /\b(?:young|younger|twenties|teens)\b/i.test(u.text) : /^the other\b/i.test(u.text.trim()) || /\bolder\b/i.test(u.text)) : [];
  const units: NarrationUnit[] = byDescriptor.length ? byDescriptor.filter(u => !/\b(?:passes over|passed over)\b/i.test(u.text)) : recent.filter(u => mine.test(u.text.trim()) && !/^one is\b/i.test(u.text.trim()) && !/\b(?:passes over|passed over)\b/i.test(u.text));
  return { ref: `narrated:${noun}`, noun, label: `the ${noun}`, units, in_latest: true, captive: true, present: true, introductions: [], keys: [`other:${noun}`] };
}

// ------------------------------------------------------------------------------------------------ Narrated subjects (Pass 1.1/1.2)
const latestOf = (recent: readonly RecentExchange[]) => recent.filter(e => e.status === "finalized").at(-1);
type Target = { kind: "persistent"; id: string } | { kind: "narrated"; person: NarratedPerson } | { kind: "ambiguous" | "changed"; labels: string[] };
/** Words that ask for or state a price: the sentences that tell which person an offer is about. */
const PRICE_TALK = new RegExp(`\\b(?:price|how much|sell|for sale|${NUM}\\s+gold)\\b|^\\s*${NUM}\\s*[.,!]`, "i");
/**
 * One exact subject among Pass 1 candidates (enslaved, held by a present seller) and narrated captives (narrator-created, or present
 * persistent people with no legal record yet). Order: the player's own reference (name or description); the person the latest price
 * talk refers to; a single candidate; the single one mentioned in the latest narration. Unnamed descriptions never compete with a
 * named or persistent candidate (they may be the same person). Conflicting player and offer references block the purchase: identity
 * must not change between offer and acceptance.
 */
function resolveTarget(input: string, persistent: readonly string[], reading: SceneReading, named: (text: string, id: string) => boolean, latest: RecentExchange | undefined): Target | undefined {
  type Cand = { key: string; label: string; target: Target; refers: (t: string) => boolean; inLatest: boolean; unnamed: boolean };
  if (!reading.captives.length) return undefined; // nothing narrated: the Pass 1 path decides alone
  const latestText = latest?.narration ?? "";
  const cands: Cand[] = [
    ...persistent.map(id => ({ key: id, label: id, target: { kind: "persistent" as const, id }, refers: (t: string) => named(t, id), inLatest: named(latestText, id), unnamed: false })),
    ...reading.captives.map(c => {
      const alias = aliasOf(c, input, persistent, reading, named);
      return { key: alias?.kind === "persistent" ? alias.id : c.ref, label: c.label, target: alias ?? { kind: "narrated" as const, person: c }, refers: (t: string) => refersTo(c, t), inLatest: c.in_latest, unnamed: !c.name };
    }),
  ];
  const labelOf = (cs: readonly Cand[]) => cs.map(c => c.target.kind === "persistent" ? c.key : c.label);
  // One entry per identity: a description aliased to a persistent candidate is that candidate (H5.1).
  const unique = (cs: readonly Cand[]) => cs.filter((c, i) => cs.findIndex(x => x.key === c.key) === i);
  const byInput = unique(cands.filter(c => c.refers(input)));
  // Price talk of the latest exchange: the narration's, and the player's own request ("How much for the girl?").
  const priceTexts = [...reading.units.filter(u => u.exchange === reading.latest && PRICE_TALK.test(u.text)).map(u => u.text), ...(PRICE_TALK.test(latest?.player ?? "") ? [latest!.player] : []),
    // The current input counts only with a stated amount ("for five gold"): "he pays the price instantly" (a mana cost) is not a trade.
    ...(new RegExp(`\\b${NUM}\\s+gold\\b|\\bfor ${NUM}\\b`, "i").test(input) ? [input] : [])];
  const byOffer = unique(cands.filter(c => priceTexts.some(t => c.refers(t))));
  if (byInput.length > 1) return { kind: "ambiguous", labels: labelOf(byInput) };
  if (byInput.length === 1) {
    if (byOffer.length === 1 && byOffer[0]!.key !== byInput[0]!.key) return { kind: "changed", labels: labelOf([byInput[0]!, byOffer[0]!]) };
    return byInput[0]!.target;
  }
  if (byOffer.length === 1) return byOffer[0]!.target;
  // Without an explicit reference, a narrated person is a subject only while a person trade is live: price talk in the latest
  // narration and a mention of them there. "U got a deal, merchant" about a halberd never reaches back to earlier captives.
  const live = (c: Cand) => c.target.kind === "persistent" || (priceTexts.length > 0 && c.inLatest);
  const pool = (persistent.length || reading.captives.some(c => c.character_id) ? cands.filter(c => !c.unnamed) : cands).filter(live);
  if (!pool.length) return undefined;
  if (pool.length === 1) return pool[0]!.target;
  const inLatest = pool.filter(c => c.inLatest);
  if (inLatest.length === 1) return inLatest[0]!.target;
  return pool.length ? { kind: "ambiguous", labels: labelOf(pool) } : undefined;
}

/**
 * H5.1 transaction-subject stability. An UNNAMED narrated description ("a woman, auburn-haired", "the woman in the cage") beside a
 * persistent purchase candidate is not a new person by default: appearance wording never decides identity, and the narrator may
 * describe the same captive many ways. It becomes a distinct subject only on positive structural evidence:
 *  - a distinctness marker in the scene or the player's words ("another woman", "the other girl", "a second captive"), or
 *  - an established sex (declared profile, authored sex, or narration's own pronouns for that person) that the noun contradicts.
 * Otherwise it is an alias of the one persistent candidate that the scene ties to the trade (named in the scene's narration or the
 * player's words); with no such single candidate it is ambiguous, so a purchase that resolves to it fails closed — never a guessed
 * person, never a newly registered one. Names are not merged here: two named people stay two people.
 */
const FEMALE = /^(?:woman|girl|lass)$/i, MALE = /^(?:man|boy|lad)$/i;
function aliasOf(c: NarratedPerson, input: string, persistent: readonly string[], reading: SceneReading, named: (text: string, id: string) => boolean): Target | undefined {
  if (c.name || c.character_id || !persistent.length || !c.noun) return undefined;
  const marker = new RegExp(`\\b(?:another|other|second|third|different)\\s+(?:[a-z'-]+\\s+){0,2}?${esc(c.noun)}\\b`, "i");
  if ([input, ...reading.exchanges.map(e => e.player), ...reading.units.map(u => u.text)].some(t => marker.test(t))) return undefined;
  const nounSex = FEMALE.test(c.noun) ? "female" : MALE.test(c.noun) ? "male" : undefined;
  const sexOf = (id: string) => {
    const p = reading.people.find(x => x.id === id);
    if (p?.sex) return p.sex;
    const own = reading.units.filter(u => !u.quoted && u.speaker === id).map(u => u.text).join(" ");
    const f = /\b(?:she|her|herself)\b/i.test(own), m = /\b(?:he|him|his|himself)\b/i.test(own);
    return f && !m ? "female" : m && !f ? "male" : undefined;
  };
  const compatible = persistent.filter(id => { const s = sexOf(id); return !nounSex || !s || s === nounSex; });
  if (!compatible.length) return undefined; // established sex makes them different people
  const tied = compatible.filter(id => reading.units.some(u => named(u.text, id)) || reading.exchanges.some(e => named(e.player, id)) || named(input, id));
  return tied.length === 1 ? { kind: "persistent", id: tied[0]! } : { kind: "ambiguous", labels: [c.label, ...compatible] };
}

/** Seller authority over a narrated person: ownership, or an explicit offer of that person for sale. Mere presence or description never counts. */
const AUTHORITY = new RegExp([
  `\\b(?:she|he|they)(?:'s|’s| is| are)\\s+(?:yours|mine)\\b`, `\\byours for\\b`, `\\btake (?:her|him|them)(?: off my hands| for)\\b`, `\\bi own (?:her|him|them|this one)\\b`,
  `\\b(?:my|our) (?:stock|property|merchandise|goods|slave|lot)\\b`, `\\bi paid \\w+ for (?:her|him|them)\\b`, `\\b(?:bought|picked) (?:her|him|them)(?: off| up)?\\b`,
  `\\bi'?ll sell (?:her|him|them)\\b`, `\\b${NUM}\\s+(?:gold\\s+)?for (?:her|him|them|the (?!lot\\b)\\w+)\\b`, `\\b(?:her|him|them) for ${NUM}\\b`,
].join("|"), "i");
interface PurchaseScope {
  readonly input: string; readonly context: TurnContext; readonly snapshot: DeepReadonly<CampaignSnapshot>; readonly baseRevision: number;
  readonly participants: readonly EphemeralSceneParticipant[]; readonly latest: RecentExchange | undefined;
  readonly commands: CampaignCommand[]; readonly diagnostics: PersonOfferResolution["diagnostics"][number][];
  readonly name: (id: string) => string; readonly txId: (subject: string) => string;
  /** Background Grounding V1: rejects unverified named background claims before they become durable. */
  readonly keepClaim?: (text: string) => boolean;
  /** The shared commerce facts of the delivered narration and the readers built on them. */
  readonly facts: NarrationFacts; readonly prices: PriceReader; readonly unsupported: (text: string) => boolean;
  /** The reserved canonical handles narration claimed for a narrated person (AUD-1): the offer stands, the handles are never recorded. */
  readonly withheld: (person: NarratedPerson) => WithheldNames;
}
/** The narration's description of a person whose established name is withheld ("the woman"), else their ordinary label. */
const described = (p: NarratedPerson, w: WithheldNames, fallback: string) => p.name && w.names.includes(p.name) ? (p.noun ? `the ${p.noun}` : fallback) : p.label;
/**
 * A seller is (a) a present persistent character, (b) a narrator-created person with an established proper name (materialized by the
 * ordinary name rule inside the same proposal), or (c) an ANONYMOUS narrator-created speaker ("the whittler"). An anonymous seller is
 * never made a character: the sale records a counterparty snapshot as transaction provenance instead (Pass 1.2).
 */
type Seller = { readonly key: string; readonly keys: readonly string[]; readonly label: string } & ({ readonly kind: "persistent"; readonly id: string } | { readonly kind: "named"; readonly person: NarratedPerson } | { readonly kind: "anonymous" });
/**
 * Offer for a narrated captive as ONE stored plan. When the subject is not yet a campaign character it is materialized (minimum durable
 * character, established facts and an origin snapshot only): by name when a proper name is established, otherwise under the unnamed
 * acquisition exception. A persistent or named seller becomes the legal holder first and then sells; an anonymous seller sells
 * directly, preserved only as provenance. NOTHING is applied here: the plan is stored inside the offer and applied atomically only when the
 * player accepts, so nobody is promoted without a completed purchase. Nothing here changes relationships or household membership or frees anyone.
 */
function offerNarrated(subjectPerson: NarratedPerson, reading: SceneReading, s: PurchaseScope): void {
  const { context, snapshot, diagnostics } = s;
  // A captive who claims another identity's canonical name or alias is still offered, but materialized under the narration's description (AUD-1).
  const subjectHandles = s.withheld(subjectPerson);
  const label = described(subjectPerson, subjectHandles, "the captive");
  const { name: _name, ...nameless } = subjectPerson;
  const subject: NarratedPerson = subjectHandles.handles.length ? { ...nameless, ...(subjectPerson.name && !subjectHandles.names.includes(subjectPerson.name) ? { name: subjectPerson.name } : {}), label, introductions: [] } : subjectPerson;
  const block = (status: "blocked" | "no_offer", reason: string, detail: Record<string, unknown> = {}) => {
    diagnostics.push({ status, detail: { subject_ref: subjectPerson.ref, label, reason, ...detail } }); return undefined;
  };
  const location = context.primary.scene.player_location?.id;
  if (!location) return block("blocked", "no_location");
  const enslaved = new Set(snapshot.legal_statuses.filter(l => l.status === "enslaved").map(l => l.character_id));
  const personKeys = new Set(reading.persons.flatMap(p => p.keys));
  const anonymousKeys = [...new Set(reading.units.map(u => u.speaker).filter((k): k is string => !!k && /^other:[a-z-]+$/.test(k) && !personKeys.has(k)))];
  const sellerHandles = new Map<string, WithheldNames>();
  const sellers: Seller[] = [
    ...context.characters.map(c => c.id).filter(id => id !== "nicco" && !enslaved.has(id) && id !== subjectPerson.character_id).map(id => ({ kind: "persistent" as const, id, key: id, keys: [id], label: s.name(id) })),
    // A named seller whose name is a reserved canonical handle sells as an anonymous counterparty under the narration's description (AUD-1).
    ...reading.persons.filter(p => p.name && p.present && !p.captive && !p.character_id && p.ref !== subjectPerson.ref).map((p): Seller => {
      const handles = s.withheld(p);
      if (handles.handles.length) sellerHandles.set(p.keys[0]!, handles);
      if (!handles.names.length) return { kind: "named" as const, person: p, key: p.keys[0]!, keys: p.keys, label: p.label };
      return { kind: "anonymous" as const, key: p.keys[0]!, keys: p.keys, label: described(p, handles, "the seller") };
    }),
    ...anonymousKeys.filter(k => !subjectPerson.keys.includes(k)).map(k => ({ kind: "anonymous" as const, key: k, keys: [k], label: `the ${k.slice(6)}` })),
  ];
  const latestUnits = reading.units.filter(u => u.exchange === reading.latest);
  // Per sentence: "Five. She's a burden I paid four for." offers five; the past cost in the next sentence is not an offer.
  const amounts = (text: string) => s.prices(text);
  const otherCaptive = (text: string) => reading.captives.some(c => c.ref !== subjectPerson.ref && c.name && refersTo(c, text));
  const priceRequest = /\b(?:price|how much|sell)\b/i.test(s.latest?.player ?? "") || latestUnits.some(u => /\b(?:price|how much)\b/i.test(u.text) && refersTo(subjectPerson, u.text));
  const authorities = sellers.flatMap(seller => {
    const by = (u: { speaker?: string }) => !!u.speaker && seller.keys.includes(u.speaker);
    const own = reading.units.filter(u => by(u) && !otherCaptive(u.text));
    const offerUnits = latestUnits.filter(u => by(u) && !otherCaptive(u.text) && amounts(u.text).length);
    const offered = offerUnits.flatMap(u => amounts(u.text));
    const claim = own.filter(u => AUTHORITY.test(u.text)).at(-1); // the most recent claim is the basis recorded
    // A price voiced about "she"/"her" refers to the scene's only captive ("She's a write-off. Three gold."); with several captives a pronoun names no one.
    const onlyCaptive = reading.captives.length === 1 && reading.captives[0]!.ref === subjectPerson.ref;
    // An offer exists only for a price the seller stated ABOUT this person (or in reply to a price request for them): an unrelated price (goods) is never theirs.
    const forSubject = (u: { speaker?: string; text: string }) => by(u) && (priceRequest || refersTo(subjectPerson, u.text) || (onlyCaptive && /\b(?:she|her|he|him|them)\b/i.test(u.text)) || /\b(?:either one|whichever|any one of them|any of them|either of them)\b/i.test(u.text));
    const aboutSubject = offerUnits.filter(forSubject);
    return aboutSubject.length ? [{ seller, offered: aboutSubject.flatMap(u => sellerQuotes(s.facts, u.text)), basis: claim ? claim.text.slice(0, 200) : "sale offer in reply to a price request", offer: aboutSubject.at(-1)?.text.slice(0, 200) }] : [];
  });
  // Money the engine does not settle (silver, marks, fractions) is a clear refusal, never a silent conversion and never an offer.
  if (!authorities.length && latestUnits.some(u => !!u.speaker && s.unsupported(u.text))) return block("blocked", "unsupported_currency", {});
  if (authorities.length !== 1) return block("blocked", authorities.length ? "seller_ambiguous" : "seller_authority_unestablished", { sellers: authorities.map(a => a.seller.label) });
  const { seller, offered, basis: saidBasis, offer: saidOffer } = authorities[0]!;
  // Every handle withheld from this offer, masked out of each recorded string (plan, counterparty, evidence, notes, diagnostics).
  const handles = mergeWithheld(subjectHandles, sellerHandles.get(seller.key) ?? NOTHING_WITHHELD);
  const basis = maskDeep(saidBasis, handles), offer = maskDeep(saidOffer, handles);
  // Only the seller's stated price counts: the player's own figures are a counteroffer in chat and never set a price.
  const quote = actionableQuote(offered);
  if (quote.kind === "ambiguous") return block("blocked", "several_prices", { seller: seller.label, amounts: quote.amounts });
  const price = quote.kind === "quote" ? quote.quote.amount : undefined;
  if (price === undefined || price < 1) return block("no_offer", "no_price", { seller: seller.label });
  // Papers and provenance: only what the seller said in the offer narration. Never assume clean papers.
  const said = latestUnits.filter(u => !!u.speaker && seller.keys.includes(u.speaker)).map(u => u.text).join(" ");
  const papers: TransferDocumentation = UNDOCUMENTED.test(said) ? "undocumented" : DOCUMENTED.test(said) ? "documented" : "unestablished";
  const saidSentences = sentences(said);
  const provenance = (saidSentences.find(t => /\b(?:chain|forfeit\w*|liens?|seal|listing)\b/i.test(t)) ?? saidSentences.find(t => /\bpapers?\b/i.test(t)))?.slice(0, 200);
  const minute = snapshot.runtime.scene.world_time.world_minute;
  // Subject: already persistent (e.g. materialized under a name on an earlier turn), or materialized now.
  const participant = subjectPerson.character_id ? undefined : linkedParticipant(subjectPerson, s.participants);
  let subjectId = subjectPerson.character_id;
  if (!subjectId) {
    const character = materializeProvisional({ person: subject, label, seller_key: seller.key, name_of: s.name, ...(s.keepClaim ? { keep_claim: s.keepClaim } : {}), role: `enslaved; offered for sale by ${seller.label}`, location_id: location,
      trigger: subject.name ? "name_established" : "purchase_unnamed_subject", base_revision: s.baseRevision, world_minute: minute, ephemeral_ref: participant?.id ?? subjectPerson.ref });
    // One captive, one identity across a negotiation: a later offer for the same narrated person (a counteroffer) reuses the id the earlier,
    // unsettled offer already planned, so supersession never forks the subject.
    const ref = participant?.id ?? subjectPerson.ref, location_id = location;
    const prior = (snapshot.trade_offers ?? []).filter(o => o.status !== "accepted" && o.location_id === location_id && o.subject.kind === "person")
      .flatMap(o => o.subject.kind === "person" ? o.subject.plan : []).find(c => c.kind === "register_character" && c.character.origin_snapshot?.ephemeral_ref === ref);
    const planned = prior?.kind === "register_character" && !snapshot.characters.some(c => c.id === prior.character.id) ? { ...character, id: prior.character.id } : character;
    s.commands.push({ kind: "register_character", character: maskDeep(planned, handles) });
    subjectId = planned.id;
  }
  const sale = { kind: "transfer_person" as const, transaction_id: s.txId(subjectId), transaction_kind: "sale" as const, character_id: subjectId, to_holder_id: "nicco", documentation: papers, ...(provenance ? { note: provenance } : {}) };
  if (seller.kind === "anonymous") {
    s.commands.push({ ...sale, from_counterparty: { label: seller.label, location_id: location, authority_evidence: [...new Set([basis, ...(offer ? [offer] : [])])].slice(0, 4) }, payment: { payer_id: "nicco", gold: price } });
  } else {
    let holder = seller.kind === "persistent" ? seller.id : undefined;
    if (seller.kind === "named") { // the ordinary name rule: a named narrator-created seller is a campaign character, never anonymous
      const character = materializeProvisional({ person: seller.person, label: seller.label, name_of: s.name, ...(s.keepClaim ? { keep_claim: s.keepClaim } : {}), location_id: location, trigger: "name_established", base_revision: s.baseRevision, world_minute: minute, ephemeral_ref: seller.person.ref });
      s.commands.push({ kind: "register_character", character }); holder = character.id;
    }
    s.commands.push({ kind: "set_legal_status", character_id: subjectId, status: "enslaved", holder_id: holder!, note: `Held for sale by ${seller.label}: ${basis}`.slice(0, 300) },
      { ...sale, from_holder_id: holder!, payment: { payer_id: "nicco", payee_id: holder!, gold: price } });
  }
  const own = (c: CampaignCommand) => c;
  const plan = s.commands.splice(0).map(c => maskDeep(own(c), handles));
  const counterparty = seller.kind === "persistent" ? { kind: "character" as const, character_id: seller.id } : { kind: "anonymous" as const, label: seller.label.slice(0, 160) };
  s.commands.push({ kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty, subject: { kind: "person", subject_character_id: subjectId, plan }, evidence: (offer ?? basis).slice(0, 160) });
  diagnostics.push({ status: "offered", detail: { subject: subjectId, subject_ref: subjectPerson.ref, promoted_on_acceptance: !subjectPerson.character_id, seller: seller.label, seller_kind: seller.kind, seller_basis: basis, price, papers, ...(participant ? { scene_participant: participant.id } : {}), ...(handles.handles.length ? { name_withheld: "canonical_name_reserved" } : {}) } });
}
