import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, TradeOfferRecord } from "../src/campaign/types.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { activeTradeOffer, tradeTermsDigest } from "../src/campaign/trade.js";
import { authorizeTradeProposals, reframeOwnItemPurchase } from "../src/turn/commerce/trade-authorization.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";
import { AUCTION, readPrices, type PriceContext } from "../src/turn/commerce/trade-price.js";
// The single low-level numeric helper is all that remains of the price grammar; these are test-side conveniences over it.
const goldAmounts = (sentence: string, ctx?: PriceContext): number[] => readPrices(sentence, ctx).statements.map(x => x.amount);
const statedGold = (quote: string, subjects?: readonly string[]): number[] => goldAmounts(quote, { concrete: true, ...(subjects ? { subjects } : {}) });
const pricesInText = (text: string): number[] => { const parts = text.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean); return parts.flatMap((t, i) => goldAmounts(t, { concrete: true, prev: parts[i - 1], next: parts[i + 1] })); };
const unsupportedCurrency = (text: string): boolean => readPrices(text).unsupported === "currency";
const fractionalPrice = (text: string): boolean => readPrices(text).unsupported === "fraction";
import { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Consolidation block 2: commerce integrity (TRD-1b SELL transfer, TRD-3/4 shared price grammar, TRD-5 offer identity, TRD-10 pending-offer narration). Offline. */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", NICCO = "nicco";
const korvin = { kind: "character", character_id: "korvin" } as const;
const anonymous = { kind: "anonymous", label: "the passing peddler" } as const;
let serial = 0;
const sword: CampaignCommand = { kind: "create_item", name: "Old Rusty Sword", description: "A pitted blade.", visual_description: "an old rusty sword", category: "weapon", owner_id: NICCO, position: { kind: "carried", character_id: NICCO } };
function market(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `consolidation2_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin"), ...extra] });
  return c;
}
const snap = (c: CampaignState) => c.exportSnapshot();
const offers = (c: CampaignState) => (snap(c).trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
const standing = (c: CampaignState) => activeTradeOffer(offers(c));
const gold = (c: CampaignState) => snap(c).funds.find(f => f.character_id === NICCO)!.gold;
const itemId = (c: CampaignState) => snap(c).items.find(i => i.name === "Old Rusty Sword")!.id;
const item = (c: CampaignState) => snap(c).items.find(i => i.name === "Old Rusty Sword");
const sell = (id: string, price = 5, counterparty: CampaignCommand extends never ? never : typeof korvin | typeof anonymous = korvin): CampaignCommand => ({ kind: "propose_trade_offer", direction: "sell", price_gold: price, counterparty, subject: { kind: "items", item_ids: [id] } });
const buy = (price: number, name = "Halberd", description = "A halberd."): CampaignCommand => ({ kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty: korvin, subject: { kind: "goods", lines: [{ name, description, visual_description: description.toLowerCase() }] } });
const run = (c: CampaignState, commands: CampaignCommand[]) => c.commit(c.prepare({ expected_revision: c.revision, commands }));
const accept = (c: CampaignState, id = standing(c)!.id) => run(c, [{ kind: "accept_trade_offer", offer_id: id }]);
const reasonOf = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof Error ? e.message : String(e); } assert.fail("expected a rejection"); };
const state = (c: CampaignState) => JSON.stringify(snap(c));

// ----------------------------------------------------------------------------------------------------------------------------- SELL (TRD-1b)
test("S1-S6: selling an owned, carried item transfers the SAME item to the buyer, credits gold once and accepts the offer in one revision", () => {
  const c = market([sword]); const id = itemId(c); run(c, [sell(id)]);
  const before = item(c)!, rev = c.revision;
  assert.deepEqual([before.owner_id, before.position], [NICCO, { kind: "carried", character_id: NICCO }], "before: owned and carried by the player");
  accept(c);
  const after = item(c)!;
  assert.equal(c.revision, rev + 1, "one revision");
  assert.equal(after.id, id, "S2: identity survives"); assert.equal(snap(c).items.filter(i => i.id === id).length, 1);
  assert.equal(gold(c), 505, "S3: credited exactly once");
  assert.notEqual(after.owner_id, NICCO, "S4: no longer player-owned"); assert.equal(after.owner_id, "korvin");
  assert.deepEqual(after.position, { kind: "carried", character_id: "korvin" }, "S5: not carried or equipped by the player");
  assert.equal(after.acquisition?.from_character_id, NICCO);
  const done = offers(c).at(-1)!;
  assert.deepEqual([done.status, done.resolved_revision, done.settlement?.revision, done.settlement?.removed_item_ids, done.settlement?.custody], ["accepted", rev + 1, rev + 1, [id], { kind: "character", character_id: "korvin" }], "S6");
});
test("S1b: an equipped item is sold: its slot is freed and the item leaves the player's custody", () => {
  const c = market([sword]);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "place_item", item_id: itemId(c), position: { kind: "equipped", character_id: NICCO, slot: "main_hand", mode: "held" } }] });
  assert.equal(item(c)!.position.kind, "equipped");
  run(c, [sell(itemId(c))]); accept(c);
  assert.equal(item(c)!.position.kind, "carried"); assert.equal((item(c)!.position as { character_id: string }).character_id, "korvin");
  assert.equal(snap(c).characters.find(x => x.id === NICCO)?.current.empty_slots?.includes("main_hand") ?? true, true);
});
test("S1c: an anonymous counterparty gets no invented character: the item goes to generic external custody (unknown position, no owner)", () => {
  const c = market([sword]); const id = itemId(c); run(c, [sell(id, 7, anonymous)]);
  const characters = snap(c).characters.length; accept(c);
  assert.deepEqual([item(c)!.position, item(c)!.owner_id, item(c)!.id], [{ kind: "unknown" }, null, id]);
  assert.equal(snap(c).characters.length, characters, "no merchant character is created");
  assert.deepEqual(offers(c).at(-1)!.settlement?.custody, { kind: "external" });
  assert.equal(gold(c), 507);
});
test("S7: a second Accept of the same offer is refused and changes nothing", () => {
  const c = market([sword]); run(c, [sell(itemId(c))]); const offer = standing(c)!.id; accept(c);
  const after = state(c);
  assert.match(reasonOf(() => accept(c, offer)), /offer_accepted/);
  assert.equal(state(c), after); assert.equal(gold(c), 505);
});
function restoredWith(c: CampaignState, edit: (raw: { items: { id: string; owner_id?: string | null; position: unknown }[] }) => void): CampaignState {
  const raw = JSON.parse(JSON.stringify(snap(c))); edit(raw); return CampaignState.restore(world, raw);
}
test("S8: ownership lost between proposal and Accept: item_not_owned, zero mutation", () => {
  const c = market([sword]); const id = itemId(c); run(c, [sell(id)]);
  const lost = restoredWith(c, raw => { raw.items.find(i => i.id === id)!.owner_id = "korvin"; }), before = state(lost);
  assert.match(reasonOf(() => accept(lost)), /item_not_owned/);
  assert.equal(state(lost), before); assert.equal(gold(lost), 500);
});
test("S9: possession lost between proposal and Accept: item unavailable, zero mutation", () => {
  const c = market([sword]); const id = itemId(c); run(c, [sell(id)]);
  const lost = restoredWith(c, raw => { raw.items.find(i => i.id === id)!.position = { kind: "carried", character_id: "korvin" }; }), before = state(lost);
  assert.match(reasonOf(() => accept(lost)), /item_unavailable|offer_invalid/);
  assert.equal(state(lost), before); assert.equal(gold(lost), 500);
});
test("S9b: the item removed from the world before Accept: zero mutation", () => {
  const c = market([sword]); const id = itemId(c); run(c, [sell(id)]);
  const lost = restoredWith(c, raw => { raw.items = raw.items.filter(i => i.id !== id); }), before = state(lost);
  assert.match(reasonOf(() => accept(lost)), /item_unavailable|offer_invalid/);
  assert.equal(state(lost), before);
});
test("S9c: the counterparty leaves the scene before Accept: counterparty_gone, zero mutation", () => {
  const c = market([sword]); run(c, [sell(itemId(c))]);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_square" } }] });
  const before = state(c);
  assert.match(reasonOf(() => accept(c, offers(c).at(-1)!.id)), /offer_invalidated|scene_changed/);
  assert.equal(state(c), before); assert.equal(gold(c), 500);
});
test("S10: a stale expected_revision on Accept is refused with zero mutation", () => {
  const c = market([sword]); run(c, [sell(itemId(c))]); const before = state(c);
  assert.throws(() => c.prepare({ expected_revision: c.revision - 1, commands: [{ kind: "accept_trade_offer", offer_id: standing(c)!.id }] }));
  assert.equal(state(c), before);
});
test("S11: the sale survives save/load and the sold item can no longer be sold by the player (not held, not owned)", () => {
  const c = market([sword]); const id = itemId(c); run(c, [sell(id)]); accept(c);
  const again = CampaignState.restore(world, JSON.parse(JSON.stringify(snap(c))));
  assert.equal(again.exportSnapshot().items.find(i => i.id === id)!.owner_id, "korvin");
  assert.match(reasonOf(() => run(again, [sell(id)])), /item_not_held_by_player/);
});

// ----------------------------------------------------------------------------------------------------------------------------- shared price grammar (TRD-3/TRD-4)
const concrete = (s: string, subjects?: string[]) => goldAmounts(s, { concrete: true, ...(subjects ? { subjects } : {}) });
test("P1-P6: realistic price forms are read by the one shared grammar", () => {
  assert.deepEqual(goldAmounts("It is 300 gold."), [300]);                      // P1
  assert.deepEqual(goldAmounts("Take it for 300g."), [300]);                    // P2
  assert.deepEqual(goldAmounts("Three hundred gold, no less."), [300]);         // P3
  assert.deepEqual(pricesInText("Three hundred for her."), [300]);              // P4 (scoped: an already resolved concrete offer)
  assert.deepEqual(pricesInText("\"I'll go two-sixty.\""), [260]);              // P5
  assert.deepEqual(concrete("Two hundred and sixty."), [260]);                  // P6
  assert.deepEqual(concrete("I'll take 260."), [260]);
  assert.deepEqual(concrete("Fifteen gold for the halberd."), [15]);
  assert.deepEqual(concrete("The halberd is fifteen.", ["halberd"]), [15], "'the halberd is fifteen' when the subject is named");
  assert.deepEqual(concrete("The halberd is fifteen."), [], "...and not when the subject is unknown");
  assert.deepEqual(statedGold("Fifteen gold for the halberd."), [15]);
});
test("P4b: scoped forms need a concrete-offer context; a bare number is never globally a price", () => {
  assert.deepEqual(goldAmounts("Three hundred for her."), []);
  assert.deepEqual(goldAmounts("Two-sixty."), []);
  assert.deepEqual(readPrices("Three hundred for her.", { concrete: true }).statements.map(s => [s.amount, s.currency, s.form]), [[300, "gold", "addressed"]]);
});
test("P7-P9, P14: ages, durations, quantities and ambiguous bare numbers are not prices", () => {
  for (const text of ["She's twenty-two.", "She is twenty-two years old.", "Give me ten minutes.", "I have three swords.", "I'll take three swords.", "Wait for ten minutes.", "It happened in 1191.", "Number 42, Mill Lane."])
    assert.deepEqual(concrete(text), [], text);                                  // P7 P8 P9
  assert.deepEqual(pricesInText("How old is she? Twenty-two."), [], "an age answer");
  assert.deepEqual(goldAmounts("Twenty-two."), [], "P14 ambiguous bare number outside a concrete offer");
});
test("P10-P11: material and descriptive words are not currencies", () => {
  assert.equal(unsupportedCurrency("A silver locket for ten gold."), false);
  assert.equal(unsupportedCurrency("The silver-haired woman, twenty gold."), false);
  assert.deepEqual(concrete("A silver locket for ten gold."), [10]);
  assert.deepEqual(concrete("The silver-haired woman for twenty gold."), [20]);
  assert.deepEqual(concrete("A copper kettle, fifteen gold."), [15]);
});
test("P12-P13: real unsupported money (other currency, fractions) is reported and never converted", () => {
  for (const text of ["Ten silver.", "Five copper pieces for the lamp.", "Three marks for it.", "A silver coin.", "Two and a half gold.", "2.5 gold for it.", "Half a gold."]) {
    const r = readPrices(text, { concrete: true });
    assert.deepEqual([r.statements.length, !!r.unsupported], [0, true], text);
  }
  assert.equal(readPrices("Ten silver.").unsupported, "currency"); assert.equal(readPrices("Two and a half gold.").unsupported, "fraction");
  assert.equal(fractionalPrice("a half-hour later"), false);
});
test("P10b/P12b: authorization uses the same grammar: 'silver locket for ten gold' is authorized, 'ten silver' is not", () => {
  const c = market(), projected = snap(c), context = buildTurnContext(world, projected);
  const offerFor = (name: string, price: number): CampaignCommand => buy(price, name);
  const ok = authorizeTradeProposals([{ command: offerFor("Silver Locket", 10), quote: "A silver locket for ten gold." }], 'Korvin dangles the chain. "A silver locket for ten gold."', context, projected, world);
  assert.equal(ok[0]!.authorized, true, JSON.stringify(ok[0]!.evidence));
  const no = authorizeTradeProposals([{ command: offerFor("Silver Locket", 10), quote: "A silver locket for ten silver." }], 'Korvin dangles the chain. "A silver locket for ten silver."', context, projected, world);
  assert.deepEqual([no[0]!.authorized, no[0]!.code], [false, "unsupported_currency"]);
  const frac = authorizeTradeProposals([{ command: offerFor("Halberd", 2), quote: "Two and a half gold for the halberd." }], 'Korvin shrugs. "Two and a half gold for the halberd."', context, projected, world);
  assert.equal(frac[0]!.authorized, false);
});
test("P15: the evidence of a price is recorded as amount, currency, span and form", () => {
  const [s] = readPrices('"Fifteen gold for the halberd."', { concrete: true }).statements;
  assert.deepEqual([s!.amount, s!.currency, s!.form], [15, "gold", "gold_unit"]); assert.match(s!.span, /fifteen gold/i);
});
test("A1: auction wording never becomes an offer (bid, lot, high bid, bidding increments)", () => {
  for (const text of ["I bid fifteen gold.", "Lot 12, opening at fifteen gold.", "The current high bid is fifteen gold.", "Bidding goes up in increments of five gold.", "Going once, fifteen gold."]) assert.equal(AUCTION.test(text), true, text);
  const c = market(), projected = snap(c), context = buildTurnContext(world, projected);
  for (const quote of ["The current high bid is fifteen gold for the halberd.", "Bidding on the halberd opens at fifteen gold."]) {
    const r = authorizeTradeProposals([{ command: buy(15), quote }], `Korvin calls out. "${quote}"`, context, projected, world);
    assert.deepEqual([r[0]!.authorized, r[0]!.code], [false, "auction_bid_not_offer"], quote);
  }
});

// ----------------------------------------------------------------------------------------------------------------------------- offer identity (TRD-5)
test("O1-O2: the same terms keep the same offer however the prose or the cosmetic description changes", () => {
  const c = market(); run(c, [buy(15)]); const first = standing(c)!; const rev = c.revision;
  run(c, [buy(15)]); run(c, [buy(15, "the halberd", "A fine halberd, as I said, with a long ash haft.")]); run(c, [buy(15, "Halberd ", "A wholly different description.")]);
  assert.deepEqual(offers(c).map(o => [o.id, o.status]), [[first.id, "active"]], "one offer, never superseded");
  assert.deepEqual(standing(c)!.subject, first.subject, "the standing offer is untouched");
  assert.equal(c.revision, rev, "an identical re-proposal changes nothing, not even the revision");
  assert.equal(tradeTermsDigest(buy(15) as never), tradeTermsDigest(buy(15, "THE HALBERD", "x") as never));
});
test("O3-O4: a real change of price or subject supersedes", () => {
  const c = market(); run(c, [buy(15)]); run(c, [buy(12)]);
  assert.deepEqual(offers(c).map(o => [o.price_gold, o.status]), [[15, "superseded"], [12, "active"]]);
  run(c, [buy(12, "Crossbow")]);
  assert.deepEqual(offers(c).map(o => o.status), ["superseded", "superseded", "active"]);
  const d = market([sword]); run(d, [sell(itemId(d), 5)]); run(d, [sell(itemId(d), 5)]);
  assert.equal(offers(d).length, 1, "same sell terms: same offer");
  run(d, [sell(itemId(d), 8)]); assert.deepEqual(offers(d).map(o => o.status), ["superseded", "active"]);
});

// ----------------------------------------------------------------------------------------------------------------------------- narration authority (TRD-10)
function scripted(c: CampaignState) {
  const script = { narration: "", commands: [] as CampaignCommand[], evidence: [] as string[] };
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { const text = script.narration; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator, { async propose() { return { commands: [...script.commands], ...(script.evidence.length ? { evidence: [...script.evidence] } : {}), ...metadata }; } }, { service, search: new HybridSearch(service) });
  return async (input: string, narration: string, commands: CampaignCommand[] = [], evidence: string[] = []): Promise<TurnResult> => {
    Object.assign(script, { narration, commands, evidence });
    const events = await collect(coordinator.runTurn({ campaign: c, player_input: input }));
    const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
    return (last as { type: "turn_completed"; result: TurnResult }).result;
  };
}
const HALBERD = 'Korvin lifts a halberd from the weapon rack and sets it on the counter. "Fifteen gold for the halberd."';
test("N1: with a goods offer pending, narrated payment or hand-over is not delivered as fact", async () => {
  const c = market(), step = scripted(c);
  await step("Price?", HALBERD, [buy(15)], ["Fifteen gold for the halberd."]);
  assert.equal(standing(c)!.price_gold, 15);
  for (const claim of ["Nicco hands Korvin fifteen gold and takes the halberd.", "Korvin counts out the coins, pockets them and passes the halberd to Nicco.", "The deal is struck, and the halberd now belongs to Nicco.", "He fishes in a pouch at his belt, pulls out a single gold coin, and drops it into Nicco's outstretched palm.", "The short man's fingers close around the coins as they land, and the gold disappears into a pouch at his belt. The transaction is closed."]) {
    const r = await step("*nods*", `Korvin waits behind the counter. ${claim}`);
    const issues = r.narration_reconciliation?.issues ?? [];
    assert.ok(issues.some(i => i.kind === "asserts_uncommitted_purchase"), `${claim} -> ${JSON.stringify(issues.map(i => i.kind))}`);
    assert.doesNotMatch(r.narration, /hands Korvin fifteen gold|pockets them|now belongs to Nicco|single gold coin|disappears into a pouch|transaction is closed/i, claim);
    assert.equal(gold(c), 500); assert.equal(snap(c).items.some(i => i.name === "Halberd"), false);
  }
});
test("N1b: with no offer pending the same sentence is not policed by this guard (ordinary fiction)", async () => {
  const c = market(), step = scripted(c);
  const r = await step("*looks around*", "Korvin shrugs. A boy hands the cook a bucket of water.");
  assert.ok(!(r.narration_reconciliation?.issues ?? []).some(i => i.kind === "asserts_uncommitted_purchase"));
});
test("N2-N3: a verbal 'deal' never settles; only the explicit Accept does (and only once)", async () => {
  const c = market(), step = scripted(c);
  await step("Price?", HALBERD, [buy(15)], ["Fifteen gold for the halberd."]);
  for (const input of ["Deal.", "Done.", "Fine.", "I pay him.", "*hands over the gold*"]) {
    await step(input, "Korvin watches him, waiting.", [{ kind: "create_item", name: "Halberd", description: "A halberd.", visual_description: "a halberd", category: "weapon", position: { kind: "carried", character_id: NICCO } }], ["Korvin watches him."]);
    assert.deepEqual([gold(c), standing(c)?.price_gold, snap(c).items.some(i => i.name === "Halberd")], [500, 15, false], input);
  }
  accept(c);
  assert.deepEqual([gold(c), snap(c).items.filter(i => i.name === "Halberd").length], [485, 1]);
});

// ----------------------------------------------------------------------------------------------------------------------------- live-certification regressions (scenario B)
test("L1: reframeOwnItemPurchase turns a BUY of the player's own tracked item into the SELL of that item only when the player says he is selling", () => {
  const c = market([sword]), projected = snap(c), id = itemId(c), cmd = buy(1, "Rusty Sword");
  const reframed = reframeOwnItemPurchase(cmd, projected, "I want to sell my old rusty sword to Korvin. How many gold pieces will he pay me?");
  assert.deepEqual([reframed.kind === "propose_trade_offer" && reframed.direction, reframed.kind === "propose_trade_offer" && reframed.subject, reframed.kind === "propose_trade_offer" && reframed.price_gold], ["sell", { kind: "items", item_ids: [id] }, 1]);
  assert.equal(reframeOwnItemPurchase(cmd, projected, "*shows the sword*"), cmd, "no sell cue: untouched");
  assert.equal((reframeOwnItemPurchase(buy(15), projected, "I want to sell my sword and buy a halberd.") as { direction: string }).direction, "buy", "unrelated goods stay a BUY");
  const narration = 'Korvin turns the Old Rusty Sword over. "You want the metal, it\'s one gold."', context = buildTurnContext(world, projected);
  const right = authorizeTradeProposals([{ command: reframed, quote: "You want the metal, it's one gold." }], narration, context, projected, world);
  assert.equal(right[0]!.authorized, true, JSON.stringify(right[0]!.evidence));
  const second = market([sword]), two = snap(second);
  assert.equal(authorizeTradeProposals([{ command: buy(15, "Old Rusty Sword"), quote: "Fifteen gold for the Old Rusty Sword." }], 'Korvin shows a twin blade. "Fifteen gold for the Old Rusty Sword."', buildTurnContext(world, two), two, world)[0]!.authorized, true,
    "buying a second copy of something one holds is a legitimate BUY");
});
test("L2: while a SELL offer pends, narrated put-down/transfer of the offered item cannot move it (the offer is the only settlement)", async () => {
  const c = market([sword]), step = scripted(c), id = itemId(c);
  const first = await step("*shows the sword*", 'Korvin turns the Old Rusty Sword over in his hands. "Five gold for it, no more."', [sell(id, 5)], ["Five gold for it, no more."]);
  assert.equal(standing(c)?.price_gold, 5, JSON.stringify([offers(c), first.narration, first.narration_reconciliation?.issues, first.person_transactions, first.authorized_commands.map(x => x.kind)]));
  const r = await step("*waits*", "Korvin sets the Old Rusty Sword down behind him on a shelf and waits.", [{ kind: "place_item", item_id: id, position: { kind: "stored", location_id: MARKET } }], ["Korvin sets the Old Rusty Sword down behind him on a shelf and waits."]);
  assert.ok(r.authorization.every(a => !a.authorized), JSON.stringify(r.authorization.map(a => [a.command.kind, a.code])));
  assert.deepEqual([item(c)!.owner_id, item(c)!.position, standing(c)?.price_gold], [NICCO, { kind: "carried", character_id: NICCO }, 5]);
});
test("L3: the live-certification mis-encoding (BUY of the player's own item) becomes a SELL of exactly that item when the player says he is selling, else nothing", async () => {
  const quote = "You want the metal, it's one gold.", narration = `Korvin turns the Old Rusty Sword over in his hands. "${quote}"`;
  const a = market([sword]), stepA = scripted(a), id = itemId(a);
  const ok = await stepA("I want to sell my old rusty sword to Korvin. How many gold pieces will he pay me?", narration, [buy(1, "Rusty Sword")], [quote]);
  assert.deepEqual(ok.authorization.map(x => [x.command.kind, (x.command as { direction?: string }).direction, x.authorized]), [["propose_trade_offer", "sell", true]]);
  assert.deepEqual([standing(a)!.direction, standing(a)!.subject, standing(a)!.price_gold], ["sell", { kind: "items", item_ids: [id] }, 1]);
  assert.equal(gold(a), 500);
  const b = market([sword]), stepB = scripted(b);
  const no = await stepB("*shows the sword*", narration, [buy(1, "Rusty Sword")], [quote]);
  assert.deepEqual([no.authorization.map(x => x.authorized), standing(b)?.direction], [[true], "buy"], "no sell cue: not reframed (the BUY card is shown to the player, who accepts or declines; residual debt)");
  const c = market([sword]), stepC = scripted(c);
  const other = await stepC("I want to sell my sword and buy a halberd.", HALBERD, [buy(15)], ["Fifteen gold for the halberd."]);
  assert.deepEqual([other.authorization.map(x => x.authorized), standing(c)?.direction], [[true], "buy"], "unrelated goods stay a BUY even when the player is also selling");
});
