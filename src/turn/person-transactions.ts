import type { CampaignCommand, CampaignSnapshot, TransferDocumentation } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { TurnContext } from "./context-builder.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { WorldStore } from "../world/world-store.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";
import { buildPromotedCharacter } from "../campaign/promotion.js";
import { establishedFacts, linkedParticipant, readScene, refersTo, type NarratedPerson, type SceneReading } from "./narrated-captives.js";
import { GATES } from "./language/gates.js";
import { CARDINAL_WORD_ALTERNATION, numberWordValue } from "./language/numbers.js";
import { escapeRegExp as esc, exactNamePattern } from "./language/text.js";

/**
 * Household Pass 1: deterministic resolution of player-authored person transactions (purchase, manumission).
 *
 * A purchase completes an offer the seller already made in authoritative narration: the player's explicit acceptance or payment
 * is a player-controlled act, like movement through an established connection. It is therefore resolved and prevalidated BEFORE
 * narration (the narrator is told the authoritative outcome), and committed atomically at turn finalization with everything else.
 * Required evidence: an unhedged acceptance/payment act in the player's input; exactly one resolvable subject who is present,
 * legally enslaved and held by a present seller other than Nicco; one established price (the player's stated amount, else the
 * most recent price in the seller's latest narration); and Nicco's tracked funds covering it. Papers are read from that latest
 * narration: documented, undocumented, or unestablished — clean papers are never assumed.
 * Manumission: an unhedged, explicitly legal act of freeing a present person Nicco legally holds. Unchaining is not manumission.
 * Promotion Pass 1.1: with `options.world`, the subject may also be a narrator-invented captive of the current scene (narrated-captives.ts);
 * the purchase then promotes them to a persistent created character inside the same proposal (see purchaseEphemeral).
 */
export interface TradeResolution {
  readonly commands: readonly CampaignCommand[];
  readonly notes: readonly string[];
  readonly diagnostics: readonly { readonly kind: "purchase" | "manumission"; readonly status: "resolved" | "blocked" | "ambiguous" | "no_offer"; readonly detail: Readonly<Record<string, unknown>> }[];
  /** Promotion Pass 1.1: the narrated person this purchase promotes (applied only if the whole proposal validates and commits). */
  readonly promotion?: { readonly character_id: string; readonly ref: string; readonly participant_id?: string };
}
export interface TradeOptions { readonly world?: WorldStore; readonly participants?: readonly EphemeralSceneParticipant[] }
const HEDGE = GATES.transaction_hedge;
const ACCEPT = /\b(?:done|deal|agreed|sold|i'?ll take (?:her|him|them)|i take (?:her|him|them)|i'?ll buy (?:her|him|them)|pays?(?!\s+(?:(?:him|her|them)\s+)?(?:a\s+)?(?:visit|attention|respects?|heed|mind|back|homage|tribute)\b)(?:\s+(?:up|him|her|them|the \w+))?|paid|hands? over the (?:gold|coins?)|gives? (?:him|her|them) the (?:gold|coins?)|counts? out the (?:gold|coins?))\b/i;
/** H1: cardinals from the canonical table (thirteen, fourteen… were missing here); bare "hundred" is this parser's own extension. */
const NUM = `(\\d{1,6}|${CARDINAL_WORD_ALTERNATION}|hundred)`;
const value = (s: string) => /^\d+$/.test(s) ? Number(s) : s.toLowerCase() === "hundred" ? 100 : numberWordValue(s);
const DOCUMENTED = /\b(?:papers? included|with (?:the |full |clean )?papers|clean transfer|(?:his|her|the seller's|my) seal|no liens|bill of sale|deed of (?:sale|transfer)|transfer papers)\b/i;
const UNDOCUMENTED = /\b(?:no papers|without (?:any )?papers|no listing|unlisted|unpapered|off the books|papers? (?:are )?(?:missing|lost|burned))\b/i;
const FREE = /\b(?:i (?:hereby )?(?:free|manumit) you|you(?:'re| are) (?:now )?a free (?:woman|man|person)|you(?:'re| are) no longer (?:a |my )?(?:slave|property)|grants? (?:her|him|them|you|[A-Z][a-z]+) (?:her|his|their|your) freedom|manumi\w+|you(?:'re| are) (?:now )?free(?! to\b)(?!\s+(?:from|of) (?:the |those |these )?(?:chains?|cage|shackles?|irons?)))\b/i;

function sentences(text: string): string[] { return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean); }

export function resolvePersonTransactions(input: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, recent: readonly RecentExchange[], baseRevision: number, options: TradeOptions = {}): TradeResolution {
  const commands: CampaignCommand[] = [], notes: string[] = [], diagnostics: TradeResolution["diagnostics"][number][] = [];
  const present = new Set(context.characters.map(c => c.id));
  const name = (id: string) => id === "nicco" ? "Nicco" : context.characters.find(c => c.id === id)?.profile.name ?? id;
  const legal = (id: string) => snapshot.legal_statuses.find(l => l.character_id === id);
  const named = (text: string, id: string) => { const n = name(id); return exactNamePattern([n, ...n.split(/\s+/).filter(t => t.length > 2)], "i").test(text); };
  const pick = (ids: readonly string[]) => { const byName = ids.filter(id => named(input, id)); return byName.length === 1 ? byName[0] : byName.length === 0 && ids.length === 1 ? ids[0] : undefined; };
  const txId = (subject: string) => `campaign_transaction_r${baseRevision}_${subject.replace(/^campaign_character_/, "")}`.slice(0, 120);
  const clauses = sentences(input.replace(/\*/g, " . "));

  // ---------------------------------------------------------------- purchase
  const acceptance = clauses.find(c => ACCEPT.test(c) && !HEDGE.test(c));
  let promotion: TradeResolution["promotion"];
  if (acceptance) {
    const candidates = [...present].filter(id => { const l = legal(id); return l?.status === "enslaved" && l.holder_id !== "nicco" && !!l.holder_id && present.has(l.holder_id); });
    // Narrator-created captives of the current scene (and present persistent people not yet legally held, e.g. promoted by name)
    // compete with Pass 1 candidates for the one subject.
    // Only narrator-created people promoted while narrated as captives; never canon or other characters without a legal record.
    const unheld = new Set(context.characters.filter(c => c.id !== "nicco" && !legal(c.id) && /\bcaptive\b/.test(c.established_origin?.role ?? "")).map(c => c.id));
    const reading = options.world ? readScene(recent, context, options.world, { unheld, campaign_names: new Set(snapshot.characters.flatMap(c => c.profile.name ? [c.profile.name.toLowerCase()] : [])) }) : undefined;
    const target = reading ? resolveTarget(input, candidates, reading, named, latestOf(recent)) : undefined;
    const subject = target ? (target.kind === "persistent" ? target.id : undefined) : pick(candidates);
    if (target?.kind === "narrated" && reading) {
      promotion = purchaseNarrated(target.person, reading, { input, context, snapshot, baseRevision, acceptance, participants: options.participants ?? [], latest: latestOf(recent), commands, notes, diagnostics, name, txId });
    }
    else if (target?.kind === "ambiguous" || target?.kind === "changed") {
      const labels = target.labels;
      diagnostics.push({ kind: "purchase", status: target.kind === "changed" ? "blocked" : "ambiguous", detail: { candidates: labels, acceptance, ...(target.kind === "changed" ? { reason: "subject_changed" } : {}) } });
      notes.push(target.kind === "changed" ? `The person Nicco names is not the one the seller just priced (${labels.join(" / ")}): no purchase happens this turn; nobody pays and no ownership changes.`
        : `It is unclear which person Nicco means to buy (${labels.join(", ")}): no purchase happens this turn; nobody pays and no ownership changes.`);
    }
    else if (!candidates.length) { /* acceptance of something else (goods, a deal): no person transaction */ }
    else if (!subject) { diagnostics.push({ kind: "purchase", status: "ambiguous", detail: { candidates, acceptance } }); notes.push(`It is unclear which person Nicco means to buy (${candidates.map(name).join(", ")}): no purchase happens this turn; nobody pays and no ownership changes.`); }
    else {
      const seller = legal(subject)!.holder_id!;
      const latest = recent.at(-1)?.narration ?? "";
      const stated = [...input.matchAll(new RegExp(`\\b${NUM}\\s+gold\\b|\\bfor ${NUM}\\b`, "gi"))].map(m => value(m[1] ?? m[2]!)).filter((n): n is number => n !== undefined);
      // Seller's latest offer: amounts followed by "gold", or a quote that is only a number ("Five."); the most recent one counts.
      const offered = [...latest.matchAll(new RegExp(`\\b${NUM}\\s+gold\\b|["“]\\s*${NUM}\\s*(?:gold)?\\s*[.!]?\\s*["”]|["“]\\s*${NUM}\\s*\\.`, "gi"))].map(m => value(m[1] ?? m[2] ?? m[3]!)).filter((n): n is number => n !== undefined);
      const price = stated.length ? (new Set(stated).size === 1 ? stated[0] : undefined) : offered.at(-1);
      if (price === undefined) { diagnostics.push({ kind: "purchase", status: "no_offer", detail: { subject, seller, stated, offered } }); notes.push(`No single agreed price for ${name(subject)} is established: no purchase happens this turn; nobody pays and ${name(subject)} stays legally held by ${name(seller)}.`); }
      else {
        const gold = snapshot.funds.find(f => f.character_id === "nicco")?.gold;
        const papers: TransferDocumentation = UNDOCUMENTED.test(latest) ? "undocumented" : DOCUMENTED.test(latest) ? "documented" : "unestablished";
        // Prefer the sentence describing the chain of title (chain, forfeiture, liens, seal) over a bare mention of papers.
        const said = sentences(latest.replace(/["“”]/g, ""));
        const provenance = (said.find(s => /\b(?:chain|forfeit\w*|liens?|seal|listing)\b/i.test(s)) ?? said.find(s => /\bpapers?\b/i.test(s)))?.slice(0, 200);
        if (gold === undefined || gold < price) {
          diagnostics.push({ kind: "purchase", status: "blocked", detail: { subject, seller, price, gold: gold ?? null, reason: "insufficient_funds" } });
          notes.push(`Nicco tries to buy ${name(subject)} for ${price} gold but has only ${gold ?? 0}: the purchase cannot complete. Do not narrate payment or any transfer; ${name(subject)} stays legally held by ${name(seller)}.`);
        } else {
          commands.push({ kind: "transfer_person", transaction_id: txId(subject), transaction_kind: "sale", character_id: subject, from_holder_id: seller, to_holder_id: "nicco",
            payment: { payer_id: "nicco", payee_id: seller, gold: price }, documentation: papers, ...(provenance ? { note: provenance } : {}) });
          diagnostics.push({ kind: "purchase", status: "resolved", detail: { subject, seller, price, papers, acceptance, price_source: stated.length ? "player" : "seller_latest_narration" } });
          notes.push(`Purchase completes now (already validated, authoritative): Nicco pays ${name(seller)} ${price} gold and becomes ${name(subject)}'s legal holder. Transfer papers: ${papers === "documented" ? "documented" : papers === "undocumented" ? "none — an unpapered transfer" : "not established either way"}. Legal ownership is not consent: ${name(subject)} has not chosen to join any household, and their feelings are unchanged by the sale.`);
        }
      }
    }
  }
  // ---------------------------------------------------------------- manumission
  const freeing = clauses.find(c => FREE.test(c) && !/\b(?:if|maybe|perhaps|would|could|might|not yet|someday|one day|when)\b|\?/i.test(c));
  if (freeing) {
    const held = [...present].filter(id => { const l = legal(id); return l?.status === "enslaved" && l.holder_id === "nicco"; });
    const subject = pick(held);
    if (!held.length) { /* nobody Nicco legally holds is present */ }
    else if (!subject) { diagnostics.push({ kind: "manumission", status: "ambiguous", detail: { held, freeing } }); notes.push(`It is unclear whom Nicco means to free (${held.map(name).join(", ")}): no legal status changes this turn.`); }
    else {
      const papers: TransferDocumentation = /\b(?:papers?|writ|document|signed|sealed)\b/i.test(input) ? "documented" : "unestablished";
      commands.push({ kind: "manumit", transaction_id: txId(subject), character_id: subject, by_holder_id: "nicco", documentation: papers });
      diagnostics.push({ kind: "manumission", status: "resolved", detail: { subject, freeing, papers } });
      notes.push(`Manumission (authoritative): ${name(subject)} is now legally free. This changes legal status only: household membership, residence and feelings are unchanged, and ${name(subject)} may stay or leave by their own choice.`);
    }
  }
  return { commands, notes, diagnostics, ...(promotion ? { promotion } : {}) };
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
    ...reading.captives.map(c => ({ key: c.ref, label: c.label, target: { kind: "narrated" as const, person: c }, refers: (t: string) => refersTo(c, t), inLatest: c.in_latest, unnamed: !c.name })),
  ];
  const labelOf = (cs: readonly Cand[]) => cs.map(c => c.target.kind === "persistent" ? c.key : c.label);
  const byInput = cands.filter(c => c.refers(input));
  // Price talk of the latest exchange: the narration's, and the player's own request ("How much for the girl?").
  const priceTexts = [...reading.units.filter(u => u.exchange === reading.latest && PRICE_TALK.test(u.text)).map(u => u.text), ...(PRICE_TALK.test(latest?.player ?? "") ? [latest!.player] : []),
    // The current input counts only with a stated amount ("for five gold"): "he pays the price instantly" (a mana cost) is not a trade.
    ...(new RegExp(`\\b${NUM}\\s+gold\\b|\\bfor ${NUM}\\b`, "i").test(input) ? [input] : [])];
  const byOffer = cands.filter(c => priceTexts.some(t => c.refers(t)));
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

/** Past costs and group prices are not an offer for one person. */
const NOT_AN_OFFER = new RegExp(`\\b(?:paid|cost me|charged me|was for)\\s+${NUM}|\\bfor (?:the lot|both|all|them all|the (?:two|three|four|five) of them)\\b|\\beach\\b`, "i");
/** Seller authority over a narrated person: ownership, or an explicit offer of that person for sale. Mere presence or description never counts. */
const AUTHORITY = new RegExp([
  `\\b(?:she|he|they)(?:'s|’s| is| are)\\s+(?:yours|mine)\\b`, `\\byours for\\b`, `\\btake (?:her|him|them)(?: off my hands| for)\\b`, `\\bi own (?:her|him|them|this one)\\b`,
  `\\b(?:my|our) (?:stock|property|merchandise|goods|slave|lot)\\b`, `\\bi paid \\w+ for (?:her|him|them)\\b`, `\\b(?:bought|picked) (?:her|him|them)(?: off| up)?\\b`,
  `\\bi'?ll sell (?:her|him|them)\\b`, `\\b${NUM}\\s+(?:gold\\s+)?for (?:her|him|them|the (?!lot\\b)\\w+)\\b`, `\\b(?:her|him|them) for ${NUM}\\b`,
].join("|"), "i");
interface PurchaseScope {
  readonly input: string; readonly context: TurnContext; readonly snapshot: DeepReadonly<CampaignSnapshot>; readonly baseRevision: number; readonly acceptance: string;
  readonly participants: readonly EphemeralSceneParticipant[]; readonly latest: RecentExchange | undefined;
  readonly commands: CampaignCommand[]; readonly notes: string[]; readonly diagnostics: TradeResolution["diagnostics"][number][];
  readonly name: (id: string) => string; readonly txId: (subject: string) => string;
}
/**
 * A seller is (a) a present persistent character, (b) a narrator-created person with an established proper name (promoted by the
 * ordinary name rule inside the same proposal), or (c) an ANONYMOUS narrator-created speaker ("the whittler"). An anonymous seller is
 * never made a character: the sale records a counterparty snapshot as transaction provenance instead (Pass 1.2).
 */
type Seller = { readonly key: string; readonly keys: readonly string[]; readonly label: string } & ({ readonly kind: "persistent"; readonly id: string } | { readonly kind: "named"; readonly person: NarratedPerson } | { readonly kind: "anonymous" });
/**
 * Purchase of a narrated captive as ONE proposal. When the subject is not yet a campaign character it is promoted (minimum durable
 * character, established facts and an origin snapshot only): by name when a proper name is established, otherwise under the unnamed
 * acquisition exception. A persistent or named seller becomes the legal holder first and then sells; an anonymous seller sells
 * directly, preserved only as provenance. The coordinator prevalidates the whole proposal before narration; any failure drops all of
 * it, so nobody is promoted without a completed purchase. Nothing here changes relationships or household membership or frees anyone.
 */
function purchaseNarrated(subjectPerson: NarratedPerson, reading: SceneReading, s: PurchaseScope): TradeResolution["promotion"] {
  const { context, snapshot, notes, diagnostics } = s;
  const label = subjectPerson.label;
  const block = (status: "blocked" | "no_offer", reason: string, note: string, detail: Record<string, unknown> = {}) => {
    diagnostics.push({ kind: "purchase", status, detail: { subject_ref: subjectPerson.ref, label, reason, ...detail } }); notes.push(note); return undefined;
  };
  const location = context.primary.scene.player_location?.id;
  if (!location) return block("blocked", "no_location", `No purchase happens this turn: the scene has no established place.`);
  const enslaved = new Set(snapshot.legal_statuses.filter(l => l.status === "enslaved").map(l => l.character_id));
  const personKeys = new Set(reading.persons.flatMap(p => p.keys));
  const anonymousKeys = [...new Set(reading.units.map(u => u.speaker).filter((k): k is string => !!k && /^other:[a-z-]+$/.test(k) && !personKeys.has(k)))];
  const sellers: Seller[] = [
    ...context.characters.map(c => c.id).filter(id => id !== "nicco" && !enslaved.has(id) && id !== subjectPerson.character_id).map(id => ({ kind: "persistent" as const, id, key: id, keys: [id], label: s.name(id) })),
    ...reading.persons.filter(p => p.name && p.present && !p.captive && !p.character_id && p.ref !== subjectPerson.ref).map(p => ({ kind: "named" as const, person: p, key: p.keys[0]!, keys: p.keys, label: p.label })),
    ...anonymousKeys.filter(k => !subjectPerson.keys.includes(k)).map(k => ({ kind: "anonymous" as const, key: k, keys: [k], label: `the ${k.slice(6)}` })),
  ];
  const latestUnits = reading.units.filter(u => u.exchange === reading.latest);
  // Per sentence: "Five. She's a burden I paid four for." offers five; the past cost in the next sentence is not an offer.
  const amounts = (text: string) => sentences(text).filter(t => !NOT_AN_OFFER.test(t)).flatMap(t => [...t.matchAll(new RegExp(`\\b${NUM}\\s+gold\\b|^\\s*${NUM}\\s*(?:gold)?\\s*[.,!]`, "gi"))].map(m => value(m[1] ?? m[2]!))).filter((n): n is number => n !== undefined);
  const otherCaptive = (text: string) => reading.captives.some(c => c.ref !== subjectPerson.ref && c.name && refersTo(c, text));
  const priceRequest = /\b(?:price|how much|sell)\b/i.test(s.latest?.player ?? "") || latestUnits.some(u => /\b(?:price|how much)\b/i.test(u.text) && refersTo(subjectPerson, u.text));
  const authorities = sellers.flatMap(seller => {
    const by = (u: { speaker?: string }) => !!u.speaker && seller.keys.includes(u.speaker);
    const own = reading.units.filter(u => by(u) && !otherCaptive(u.text));
    const offerUnits = latestUnits.filter(u => by(u) && !otherCaptive(u.text) && amounts(u.text).length);
    const offered = offerUnits.flatMap(u => amounts(u.text));
    const claim = own.filter(u => AUTHORITY.test(u.text)).at(-1); // the most recent claim is the basis recorded
    const offerForSubject = offered.length > 0 && (priceRequest || latestUnits.some(u => by(u) && refersTo(subjectPerson, u.text)));
    return claim || offerForSubject ? [{ seller, offered, basis: claim ? claim.text.slice(0, 200) : "sale offer in reply to a price request", offer: offerUnits.at(-1)?.text.slice(0, 200) }] : [];
  });
  if (authorities.length !== 1) return block("blocked", authorities.length ? "seller_ambiguous" : "seller_authority_unestablished",
    `No purchase happens this turn: nobody present has established the right to sell ${label}. Nobody pays, and ${label} stays exactly as before.`, { sellers: authorities.map(a => a.seller.label) });
  const { seller, offered, basis, offer } = authorities[0]!;
  const stated = [...s.input.matchAll(new RegExp(`\\b${NUM}\\s+gold\\b|\\bfor ${NUM}\\b`, "gi"))].map(m => value(m[1] ?? m[2]!)).filter((n): n is number => n !== undefined);
  const price = stated.length ? (new Set(stated).size === 1 ? stated[0] : undefined) : offered.at(-1);
  if (price === undefined) return block("no_offer", "no_price", `No single agreed price for ${label} is established: no purchase happens this turn; nobody pays and ${label} stays with ${seller.label}.`, { seller: seller.label });
  const gold = snapshot.funds.find(f => f.character_id === "nicco")?.gold;
  if (gold === undefined || gold < price) return block("blocked", "insufficient_funds", `Nicco tries to buy ${label} for ${price} gold but has only ${gold ?? 0}: the purchase cannot complete. Do not narrate payment or any transfer; ${label} stays with ${seller.label}.`, { seller: seller.label, price, gold: gold ?? null });
  // Papers and provenance: only what the seller said in the offer narration. Never assume clean papers.
  const said = latestUnits.filter(u => !!u.speaker && seller.keys.includes(u.speaker)).map(u => u.text).join(" ");
  const papers: TransferDocumentation = UNDOCUMENTED.test(said) ? "undocumented" : DOCUMENTED.test(said) ? "documented" : "unestablished";
  const saidSentences = sentences(said);
  const provenance = (saidSentences.find(t => /\b(?:chain|forfeit\w*|liens?|seal|listing)\b/i.test(t)) ?? saidSentences.find(t => /\bpapers?\b/i.test(t)))?.slice(0, 200);
  const minute = snapshot.runtime.scene.world_time.world_minute;
  // Subject: already persistent (e.g. promoted by name on an earlier turn), or promoted now.
  const participant = subjectPerson.character_id ? undefined : linkedParticipant(subjectPerson, s.participants);
  let subjectId = subjectPerson.character_id;
  if (!subjectId) {
    const facts = establishedFacts(subjectPerson, seller.key, s.name);
    const character = buildPromotedCharacter({ label, established: { ...facts.established, role: `enslaved; offered for sale by ${seller.label}` }, evidence: facts.evidence, location_id: location,
      trigger: subjectPerson.name ? "name_established" : "purchase_unnamed_subject", promoted_revision: s.baseRevision + 1, world_minute: minute, ephemeral_ref: participant?.id ?? subjectPerson.ref });
    s.commands.push({ kind: "register_character", character });
    subjectId = character.id;
  }
  const sale = { kind: "transfer_person" as const, transaction_id: s.txId(subjectId), transaction_kind: "sale" as const, character_id: subjectId, to_holder_id: "nicco", documentation: papers, ...(provenance ? { note: provenance } : {}) };
  if (seller.kind === "anonymous") {
    s.commands.push({ ...sale, from_counterparty: { label: seller.label, location_id: location, authority_evidence: [...new Set([basis, ...(offer ? [offer] : [])])].slice(0, 4) }, payment: { payer_id: "nicco", gold: price } });
  } else {
    let holder = seller.kind === "persistent" ? seller.id : undefined;
    if (seller.kind === "named") { // the ordinary name rule: a named narrator-created seller is a campaign character, never anonymous
      const facts = establishedFacts(seller.person, undefined, s.name);
      const character = buildPromotedCharacter({ label: seller.label, established: facts.established, evidence: facts.evidence, location_id: location, trigger: "name_established", promoted_revision: s.baseRevision + 1, world_minute: minute, ephemeral_ref: seller.person.ref });
      s.commands.push({ kind: "register_character", character }); holder = character.id;
    }
    s.commands.push({ kind: "set_legal_status", character_id: subjectId, status: "enslaved", holder_id: holder!, note: `Held for sale by ${seller.label}: ${basis}`.slice(0, 300) },
      { ...sale, from_holder_id: holder!, payment: { payer_id: "nicco", payee_id: holder!, gold: price } });
  }
  diagnostics.push({ kind: "purchase", status: "resolved", detail: { subject: subjectId, subject_ref: subjectPerson.ref, promoted: !subjectPerson.character_id, seller: seller.label, seller_kind: seller.kind, seller_basis: basis, price, papers, acceptance: s.acceptance, price_source: stated.length ? "player" : "seller_latest_narration", ...(participant ? { scene_participant: participant.id } : {}) } });
  notes.push(`Purchase completes now (already validated, authoritative): Nicco pays ${seller.label} ${price} gold and becomes ${label}'s legal holder. ${label} is the same person already in this scene; keep every established detail. Transfer papers: ${papers === "documented" ? "documented" : papers === "undocumented" ? "none — an unpapered transfer" : "not established either way"}. Legal ownership is not consent: ${label} has not chosen to join any household, and their feelings are unchanged by the sale.`);
  return subjectPerson.character_id ? undefined : { character_id: subjectId, ref: subjectPerson.ref, ...(participant ? { participant_id: participant.id } : {}) };
}
