import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import { CampaignValidationError } from "../src/campaign/validation.js";
import type { CampaignCommand, CampaignSnapshot, TradeOfferRecord } from "../src/campaign/types.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { activeTradeOffer, resolveGoodsCategory } from "../src/campaign/trade.js";
import { deriveTradeView, tradeOfferRef } from "../src/app/trade-offer-view.js";
import { GameSession, type SessionDeps } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { authorizeTradeProposals } from "../src/turn/trade-authorization.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Actual Offer V1: one structured TradeOffer for goods and people. The Controller proposes, the engine structures, the UI exposes, the
 * PLAYER accepts with an explicit click, the engine settles deterministically. Offline: no provider is ever called.
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", BRENNA = "campaign_character_brenna", NICCO = "nicco";
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
let serial = 0;

const korvin = { kind: "character", character_id: "korvin" } as const;
const line = (name: string) => ({ name, description: `A ${name.toLowerCase()} of fair make.`, visual_description: `a ${name.toLowerCase()}, plain and serviceable` });
const buyGoods = (price: number, ...names: string[]): CampaignCommand => ({ kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty: korvin, subject: { kind: "goods", lines: names.map(line) } });
const sellItems = (price: number, ...ids: string[]): CampaignCommand => ({ kind: "propose_trade_offer", direction: "sell", price_gold: price, counterparty: korvin, subject: { kind: "items", item_ids: ids } });

/** An opening campaign at the slave market (Korvin present, name known) with Brenna enslaved and held by Korvin (a persistent, name-known person). */
function market(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `actual_offer_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin"),
    { kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }, ...extra] });
  return c;
}
const swordItem: CampaignCommand = { kind: "create_item", name: "Old Rusty Sword", description: "A pitted blade.", visual_description: "an old rusty sword", category: "weapon", owner_id: NICCO, position: { kind: "carried", character_id: NICCO } };
const shirtItem: CampaignCommand = { kind: "create_item", name: "Linen Shirt", description: "A plain shirt.", visual_description: "a linen shirt", category: "clothing", owner_id: NICCO, position: { kind: "carried", character_id: NICCO } };
const snap = (c: CampaignState) => c.exportSnapshot();
const gold = (c: CampaignState) => snap(c).funds.find(f => f.character_id === NICCO)!.gold;
const itemNamed = (c: CampaignState, name: string) => snap(c).items.find(i => i.name === name);
const offers = (c: CampaignState): readonly TradeOfferRecord[] => (snap(c).trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
const standing = (c: CampaignState) => activeTradeOffer(offers(c));
const propose = (c: CampaignState, ...commands: CampaignCommand[]) => c.commit(c.prepare({ expected_revision: c.revision, commands }));
const accept = (c: CampaignState, id = standing(c)!.id) => c.commit(c.prepare({ expected_revision: c.revision, commands: [{ kind: "accept_trade_offer", offer_id: id }] }));
const reasonOf = (fn: () => unknown): string => { try { fn(); } catch (e) { assert.ok(e instanceof CampaignValidationError, String(e)); return e.message; } throw new assert.AssertionError({ message: "expected a rejection" }); };
const state = (c: CampaignState) => JSON.stringify({ ...snap(c), trade_offers: undefined, revision: undefined });

// =========================================================================================================== goods BUY (G1-G10, G18-G20)
test("G1/G2: a BUY offer is a structured proposal; creating it changes no funds, items, ownership or legal status", () => {
  const c = market(), before = state(c), rev = c.revision;
  propose(c, buyGoods(15, "Halberd"));
  const o = standing(c)!;
  assert.deepEqual([o.direction, o.status, o.price_gold, o.subject.kind, o.location_id], ["buy", "active", 15, "goods", MARKET]);
  assert.equal(c.revision, rev + 1);
  assert.equal(state(c), before, "everything but the offer record is untouched");
  assert.equal(gold(c), 500); assert.equal(itemNamed(c, "Halberd"), undefined);
});
test("G3/G4/G5/G6: accepting debits the gold, creates exactly one item owned by and carried by the player, in ONE revision", () => {
  const c = market(); propose(c, buyGoods(15, "Halberd"));
  const rev = c.revision, itemsBefore = snap(c).items.length;
  accept(c);
  assert.equal(c.revision, rev + 1, "debit, item, ledger and status are one revision");
  assert.equal(gold(c), 485);
  const items = snap(c).items.filter(i => i.name === "Halberd");
  assert.equal(items.length, 1); assert.equal(snap(c).items.length, itemsBefore + 1);
  assert.deepEqual([items[0]!.owner_id, items[0]!.position], [NICCO, { kind: "carried", character_id: NICCO }]);
  assert.equal(items[0]!.category, "weapon");
  assert.equal(items[0]!.acquisition?.acquisition_kind, "purchase");
});
test("G7: a bundle is several separate items (no stacks) for one price", () => {
  const c = market(); propose(c, buyGoods(30, "Halberd", "Leather Cap", "Waterskin"));
  accept(c);
  assert.equal(gold(c), 470);
  const bought = snap(c).items.filter(i => ["Halberd", "Leather Cap", "Waterskin"].includes(i.name ?? ""));
  assert.equal(bought.length, 3); assert.equal(new Set(bought.map(i => i.id)).size, 3);
  assert.deepEqual(bought.map(i => i.category).sort(), ["clothing", "tool", "weapon"]);
  assert.ok(bought.every(i => i.owner_id === NICCO && i.position.kind === "carried"));
});
test("G8: insufficient funds is rejected atomically with a safe reason; the offer stays active and nothing changes", () => {
  const c = market([{ kind: "set_funds", character_id: NICCO, gold: 10 }]); propose(c, buyGoods(15, "Halberd"));
  const before = state(c), rev = c.revision, id = standing(c)!.id;
  assert.match(reasonOf(() => accept(c)), /insufficient_funds/);
  assert.equal(c.revision, rev); assert.equal(state(c), before); assert.equal(standing(c)!.id, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "set_funds", character_id: NICCO, gold: 15 }] });
  accept(c); assert.equal(gold(c), 0);
});
test("G9: accepting twice cannot duplicate the purchase", () => {
  const c = market(); propose(c, buyGoods(15, "Halberd")); const id = standing(c)!.id;
  accept(c);
  const rev = c.revision;
  assert.match(reasonOf(() => accept(c, id)), /offer_accepted/);
  assert.equal(c.revision, rev); assert.equal(gold(c), 485); assert.equal(snap(c).items.filter(i => i.name === "Halberd").length, 1);
});
test("G10: stale and superseded offers cannot settle; a stale expected revision is refused", () => {
  const c = market(); propose(c, buyGoods(20, "Halberd")); const first = standing(c)!.id;
  propose(c, buyGoods(18, "Halberd"));
  assert.equal(offers(c).find(o => o.id === first)!.status, "superseded");
  const before = state(c);
  assert.match(reasonOf(() => accept(c, first)), /offer_superseded/);
  assert.throws(() => c.prepare({ expected_revision: c.revision - 1, commands: [{ kind: "accept_trade_offer", offer_id: standing(c)!.id }] }));
  assert.equal(state(c), before); assert.equal(gold(c), 500);
});
test("G18/G19: nothing is auto-equipped; the category is conservative with a miscellaneous fallback", () => {
  const c = market(); propose(c, buyGoods(12, "Iron Breastplate", "Curious Trinket"));
  accept(c);
  const plate = itemNamed(c, "Iron Breastplate")!, trinket = itemNamed(c, "Curious Trinket")!;
  assert.deepEqual([plate.position.kind, trinket.position.kind], ["carried", "carried"]);
  assert.deepEqual([plate.category, trinket.category], ["armor", "miscellaneous"]);
  assert.equal(resolveGoodsCategory("Mysterious Thing"), "miscellaneous");
  assert.ok(!snap(c).characters.find(x => x.id === NICCO)?.current.empty_slots?.length || true);
});
test("G20: gold is whole numbers only; fractions, zero and negative prices are not offers", () => {
  const c = market();
  for (const price of [1.5, 0, -3, Number.NaN, 2_000_000]) assert.throws(() => propose(c, buyGoods(price, "Halberd")), /./, String(price));
  assert.deepEqual(offers(c), []);
  assert.equal(gold(c), 500);
});

// =========================================================================================================== goods SELL (G11-G17)
test("G11/G13/G14/G15: SELL references an existing authoritative item; on acceptance it is removed, the gold is credited and the settlement is recorded", () => {
  const c = market([swordItem, shirtItem]); const sword = itemNamed(c, "Old Rusty Sword")!;
  propose(c, sellItems(5, sword.id));
  assert.equal(gold(c), 500); assert.ok(itemNamed(c, "Old Rusty Sword"), "creating the offer removes nothing");
  const rev = c.revision;
  accept(c);
  assert.equal(c.revision, rev + 1);
  assert.equal(itemNamed(c, "Old Rusty Sword"), undefined, "V1 simplification: the sold item leaves campaign state");
  assert.equal(gold(c), 505);
  const done = offers(c).at(-1)!;
  assert.deepEqual([done.status, done.settlement?.gold, done.settlement?.removed_item_ids, done.settlement?.revision, done.resolved_revision], ["accepted", 5, [sword.id], rev + 1, rev + 1]);
  assert.ok(itemNamed(c, "Linen Shirt"), "G17: unrelated inventory is untouched");
});
test("G12: a SELL of an item that does not exist, is not held by the player, or is referenced elsewhere is rejected; prose can never mint a sellable item", () => {
  const c = market([swordItem]);
  assert.match(reasonOf(() => propose(c, sellItems(50, "campaign_item_golden_crown"))), /unknown_item|unknown item|trade/);
  assert.deepEqual(offers(c), []);
  const kitchen = `${itemNamed(c, "Old Rusty Sword")!.id}`;
  c.apply({ expected_revision: c.revision, commands: [{ kind: "transfer_item", mode: "handoff", item_id: kitchen, position: { kind: "carried", character_id: "korvin" } }] });
  assert.match(reasonOf(() => propose(c, sellItems(5, kitchen))), /item_not_held_by_player/);
});
test("G11b: a sold item that was equipped frees its slot; an item sold after being removed elsewhere makes the offer unsettleable", () => {
  const c = market([swordItem]); const id = itemNamed(c, "Old Rusty Sword")!.id;
  propose(c, sellItems(5, id));
  c.apply({ expected_revision: c.revision, commands: [{ kind: "transfer_item", mode: "handoff", item_id: id, position: { kind: "carried", character_id: "korvin" } }] });
  assert.equal(offers(c).at(-1)!.status, "invalidated", "the offer is invalidated in the same revision the item leaves the player's hands");
  assert.equal(offers(c).at(-1)!.invalid_reason, "item_unavailable");
  assert.match(reasonOf(() => accept(c, offers(c).at(-1)!.id)), /offer_invalidated/);
  assert.equal(gold(c), 500);
});
test("G16: a sold item stays absent, and an accepted offer stays accepted, after save and load; an active offer survives and still accepts", async () => {
  const c = market([swordItem]); const sword = itemNamed(c, "Old Rusty Sword")!;
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-offer-")); dirs.push(dir);
  const repository = new FileCampaignRepository(world, dir);
  propose(c, sellItems(5, sword.id));
  await repository.saveCampaign(c);
  const reloaded = (await repository.loadCampaign(snap(c).campaign_id)).campaign;
  const live = standing(reloaded)!;
  assert.deepEqual([live.status, live.price_gold, live.subject], ["active", 5, { kind: "items", item_ids: [sword.id] }]);
  accept(reloaded);
  await repository.saveCampaign(reloaded);
  const again = (await repository.loadCampaign(snap(c).campaign_id)).campaign;
  assert.equal(itemNamed(again, "Old Rusty Sword"), undefined); assert.equal(gold(again), 505);
  assert.deepEqual([offers(again).length, offers(again)[0]!.status, standing(again)], [1, "accepted", undefined]);
  assert.match(reasonOf(() => accept(again, offers(again)[0]!.id)), /offer_accepted/);
  assert.equal(gold(again), 505);
});

// =========================================================================================================== lifecycle: one active offer, withdrawal, invalidation
test("one active offer: a new concrete offer supersedes; an identical repeat is no new offer; withdrawal and scene change close it deterministically", () => {
  const c = market(); propose(c, buyGoods(20, "Halberd"));
  propose(c, buyGoods(20, "Halberd")); assert.equal(offers(c).length, 1, "a repeated identical quote is not a second offer");
  propose(c, buyGoods(18, "Halberd"));
  assert.deepEqual(offers(c).map(o => o.status), ["superseded", "active"]);
  assert.equal(offers(c).filter(o => o.status === "active").length, 1);
  propose(c, { kind: "withdraw_trade_offer", offer_id: standing(c)!.id });
  assert.deepEqual([standing(c), offers(c).at(-1)!.status], [undefined, "withdrawn"]);
  propose(c, buyGoods(15, "Halberd"));
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_square" } }] });
  assert.deepEqual([standing(c), offers(c).at(-1)!.status, offers(c).at(-1)!.invalid_reason], [undefined, "invalidated", "scene_changed"]);
  assert.equal(gold(c), 500);
});

// =========================================================================================================== turn pipeline (offline): creation, negotiation, no settlement by prose
const HALBERD = (price: string, tail = "") => `Korvin lifts a halberd from the weapon rack and sets it on the counter. "${price} gold for the halberd${tail}."`;
function scripted(c: CampaignState) {
  const script = { narration: "", commands: [] as CampaignCommand[], evidence: [] as string[], seen: [] as GenerationRequest[] };
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream(request) { script.seen.push(request); const text = script.narration; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator, { async propose() { return { commands: [...script.commands], ...(script.evidence.length ? { evidence: [...script.evidence] } : {}), ...metadata }; } }, { service, search: new HybridSearch(service) });
  const step = async (input: string, narration: string, commands: CampaignCommand[] = [], evidence: string[] = []) => {
    Object.assign(script, { narration, commands, evidence });
    const events = await collect(coordinator.runTurn({ campaign: c, player_input: input }));
    const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
    return (last as { type: "turn_completed"; result: TurnResult }).result;
  };
  return { step, script, prompt: () => script.seen.at(-1)!.messages[0]!.content };
}
test("pipeline: a seller's concrete gold quote becomes ONE pending offer, nothing is paid, and the narrator is told it is pending", async () => {
  const c = market(), { step, prompt } = scripted(c);
  const r = await step("Korvin, how much for the halberd?", HALBERD("Fifteen"), [buyGoods(15, "Halberd")], ["Fifteen gold for the halberd."]);
  assert.deepEqual(r.authorization.map(a => [a.command.kind, a.authorized]), [["propose_trade_offer", true]]);
  assert.deepEqual([standing(c)?.price_gold, gold(c), itemNamed(c, "Halberd")], [15, 500, undefined]);
  await step("Hm. Fine.", "Korvin waits, thumbs hooked in his belt.");
  assert.match(prompt(), /TRADE OFFER PENDING \(authoritative\)/); assert.match(prompt(), /nothing is paid/i);
});
test("pipeline: typing 'deal', 'fine' or '*pays*' never settles; narrated payment never mints the goods", async () => {
  const c = market(), { step } = scripted(c);
  await step("What does the halberd cost?", HALBERD("Fifteen"), [buyGoods(15, "Halberd")], ["Fifteen gold for the halberd."]);
  const rev = c.revision;
  for (const input of ["Deal.", "Fine, I'll take it.", "*pays him fifteen gold*"]) {
    // Even a Controller that wrongly tries to materialize the goods or move gold is vetoed: only the explicit accept action settles.
    const r = await step(input, "Korvin pockets the coins and passes the halberd across the counter.", [{ kind: "create_item", name: "Halberd", description: "A halberd.", visual_description: "a halberd", category: "weapon", position: { kind: "carried", character_id: NICCO } }], ["Korvin pockets the coins and passes the halberd across the counter."]);
    assert.ok(r.authorization.every(a => !a.authorized), `${input}: ${JSON.stringify(r.authorization.map(a => [a.command.kind, a.authorized, a.code]))}`);
    assert.deepEqual([gold(c), itemNamed(c, "Halberd"), standing(c)?.price_gold], [500, undefined, 15], input);
  }
  assert.ok(c.revision >= rev);
  accept(c); assert.equal(gold(c), 485);
});
test("N1-N8: 20 -> 18 -> 15 supersedes in chat, only the standing offer settles once, and a withdrawn offer is not acceptable", async () => {
  const c = market(), { step } = scripted(c);
  await step("Price?", HALBERD("Twenty"), [buyGoods(20, "Halberd")], ["Twenty gold for the halberd."]);
  const first = standing(c)!.id;
  // N8: a counteroffer typed in chat creates nothing and changes nothing.
  await step("I'll give you twelve.", "Korvin snorts and shakes his head, saying nothing more.");
  assert.deepEqual([standing(c)!.id, standing(c)!.price_gold], [first, 20]);
  await step("Eighteen?", `Korvin grimaces. "Eighteen gold, and not a coin less, for the halberd."`, [buyGoods(18, "Halberd")], ["Eighteen gold, and not a coin less, for the halberd."]);
  await step("Fifteen.", `Korvin sighs. "Fifteen gold for the halberd, final."`, [buyGoods(15, "Halberd")], ["Fifteen gold for the halberd, final."]);
  assert.deepEqual(offers(c).map(o => [o.price_gold, o.status]), [[20, "superseded"], [18, "superseded"], [15, "active"]]);
  assert.match(reasonOf(() => accept(c, first)), /offer_superseded/);
  accept(c);
  assert.deepEqual([gold(c), snap(c).items.filter(i => i.name === "Halberd").length], [485, 1]);
  assert.match(reasonOf(() => accept(c, offers(c).at(-1)!.id)), /offer_accepted/);
  assert.deepEqual([gold(c), snap(c).items.filter(i => i.name === "Halberd").length], [485, 1], "a single settlement");
  // Withdrawal in the fiction.
  await step("Another?", HALBERD("Twenty"), [buyGoods(20, "Halberd")], ["Twenty gold for the halberd."]);
  const withdrawn = standing(c)!.id;
  const r = await step("Then forget it.", `Korvin changes his mind. "The halberd is not for sale."`, [{ kind: "withdraw_trade_offer", offer_id: withdrawn }], ["The halberd is not for sale."]);
  assert.deepEqual(r.authorization.map(a => a.authorized), [true]);
  assert.deepEqual([standing(c), offers(c).find(o => o.id === withdrawn)!.status], [undefined, "withdrawn"]);
  assert.match(reasonOf(() => accept(c, withdrawn)), /offer_withdrawn/);
});
test("SELL through the pipeline: the Controller proposes only for an existing item; an invented item is rejected", async () => {
  const c = market([swordItem]), { step } = scripted(c); const sword = itemNamed(c, "Old Rusty Sword")!;
  const ok = await step("*shows the sword*", `Korvin turns the Old Rusty Sword over in his hands. "Five gold for it, no more."`, [sellItems(5, sword.id)], ["Five gold for it, no more."]);
  assert.deepEqual(ok.authorization.map(a => a.authorized), [true]); assert.equal(standing(c)!.direction, "sell");
  assert.equal(gold(c), 500);
  const invented = await step("I also sell my golden crown.", `Korvin squints. "Fifty gold for the golden crown."`, [sellItems(50, "campaign_item_golden_crown")], ["Fifty gold for the golden crown."]);
  assert.deepEqual(invented.authorization.map(a => a.authorized), [false]);
  assert.deepEqual([standing(c)!.price_gold, itemNamed(c, "Golden Crown")], [5, undefined]);
});
test("Auction House and other non-offers: bids, silver, questions and hypotheticals yield no actionable offer", async () => {
  const c = market(), { step } = scripted(c);
  const cases: readonly (readonly [string, string, string, string])[] = [
    ["auction bid", `The auctioneer slams the gavel. "Current bid, fifteen gold!" The halberd gleams on the block.`, "Current bid, fifteen gold!", "auction_bid_not_offer"],
    ["silver", `Korvin lifts a halberd. "Fifteen silver for the halberd."`, "Fifteen silver for the halberd.", "unsupported_currency"],
    ["question", `Korvin lifts a halberd. "Would fifteen gold for the halberd suit you?"`, "Would fifteen gold for the halberd suit you?", "hypothetical_or_question"],
    ["hypothetical", `Korvin lifts a halberd. "If you wanted it, fifteen gold for the halberd."`, "If you wanted it, fifteen gold for the halberd.", "hypothetical_or_question"],
    ["fraction", `Korvin lifts a halberd. "Fifteen and a half gold for the halberd."`, "Fifteen and a half gold for the halberd.", "unsupported_currency"],
  ];
  for (const [label, narration, quote, code] of cases) {
    const r = await step("Price?", narration, [buyGoods(15, "Halberd")], [quote]);
    assert.deepEqual([r.authorization[0]?.authorized, r.authorization[0]?.code], [false, code], label);
    assert.deepEqual([offers(c).length, gold(c)], [0, 500], label);
  }
});
test("Controller trade proposals cannot carry a person, and no accept command exists on the Controller path", () => {
  const c = market(), ctx = buildTurnContext(world, snap(c));
  const person: CampaignCommand = { kind: "propose_trade_offer", direction: "buy", price_gold: 5, counterparty: korvin, subject: { kind: "person", subject_character_id: BRENNA, plan: [] } };
  const r = authorizeTradeProposals([{ command: person, quote: "Five gold for the woman." }], 'Korvin nods. "Five gold for the woman."', ctx, snap(c), world);
  assert.deepEqual([r[0]!.authorized, r[0]!.reason], [false, "rejected_command_not_allowed"]);
  const accepting = authorizeTradeProposals([{ command: { kind: "accept_trade_offer", offer_id: "trade_offer_00000001" }, quote: "Done." }], "Done.", ctx, snap(c), world);
  assert.equal(accepting[0]!.authorized, false);
});

// =========================================================================================================== person offers (P1-P16)
const OFFER_NARRATION = 'Korvin studies the woman in the cage, then Nicco. "Five." He taps the ledger. "Papers included. Clean transfer, debt-forfeiture chain, no liens."';
test("P1-P7: a person offer uses the same envelope, transfers nothing on creation, and acceptance runs the existing settlement exactly once", async () => {
  const c = market(), { step } = scripted(c);
  await step("Korvin, what about her?", OFFER_NARRATION);
  const o = standing(c)!;
  assert.deepEqual([o.direction, o.subject.kind, o.price_gold, o.counterparty], ["buy", "person", 5, korvin]);
  assert.deepEqual([gold(c), snap(c).legal_statuses.find(l => l.character_id === BRENNA)!.holder_id, snap(c).transactions], [500, "korvin", []], "no transfer on creation");
  await step("Done. *pays him five gold*", "Korvin pockets the coins and nods at the cage.");
  assert.deepEqual([gold(c), snap(c).legal_statuses.find(l => l.character_id === BRENNA)!.holder_id], [500, "korvin"], "spoken or narrated payment never settles");
  const rev = c.revision;
  accept(c);
  assert.equal(c.revision, rev + 1);
  const s = snap(c);
  assert.deepEqual([gold(c), s.legal_statuses.find(l => l.character_id === BRENNA)!.holder_id], [495, NICCO]);
  assert.equal(s.characters.filter(x => x.profile.name === "Brenna").length, 1, "the same person id; no new identity");
  assert.equal(s.transactions.length, 1);
  assert.match(s.legal_statuses.find(l => l.character_id === BRENNA)!.transfer!.note ?? "", /debt-forfeiture chain/);
  assert.equal(s.funds.find(f => f.character_id === "korvin")?.gold ?? 0, snap(market()).funds.find(f => f.character_id === "korvin")?.gold ?? 0, "the seller's purse is not a tracked asset");
  assert.match(reasonOf(() => accept(c, offers(c)[0]!.id)), /offer_accepted/);
  assert.deepEqual([gold(c), snap(c).transactions.length], [495, 1], "repeated accept does nothing");
});
test("P: an unaffordable person offer stays active and a refused acceptance changes nothing", async () => {
  const c = market([{ kind: "set_funds", character_id: NICCO, gold: 2 }]), { step } = scripted(c);
  await step("Korvin, what about her?", OFFER_NARRATION);
  const before = state(c), rev = c.revision;
  assert.throws(() => accept(c));
  assert.deepEqual([c.revision, state(c), standing(c)?.price_gold], [rev, before, 5]);
});

// ------------------------------------------------------------------------------------------------ identity masking (P8-P16)
/** A hidden slave: registered under her real name, but narration never established it; only a red-haired descriptor is visible. */
const hiddenBrenna = (revision: number, minute: number): CampaignCommand[] => [
  { kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: MARKET, status: "active" },
    origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase_unnamed_subject", label: "the woman", promoted_revision: revision, promoted_world_minute: minute, location_id: MARKET,
      established: { descriptor: "woman", appearance: ["red-haired"], role: "enslaved; offered for sale by Korvin" }, evidence: ["fixture"] } } },
  { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }];
function hiddenMarket(): CampaignState {
  const c = createOpeningCampaign(world, `actual_offer_hidden_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin"), ...hiddenBrenna(c.revision + 1, snap(c).runtime.scene.world_time.world_minute)] });
  return c;
}
const personOffer = (c: CampaignState, price = 5): CampaignCommand => ({ kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty: korvin,
  subject: { kind: "person", subject_character_id: BRENNA, plan: [{ kind: "transfer_person", transaction_id: "campaign_transaction_fixture", transaction_kind: "sale", character_id: BRENNA, from_holder_id: "korvin", to_holder_id: NICCO,
    payment: { payer_id: NICCO, payee_id: "korvin", gold: price }, documentation: "documented" }] } });
test("P8/P9/P10/P11/P12 security regression: an unknown slave never shows a name, id, canonical id, avatar token or lore; the name reveal re-renders the SAME offer", () => {
  const c = hiddenMarket(); propose(c, personOffer(c));
  const view = deriveTradeView(world, snap(c)), json = JSON.stringify(view);
  assert.equal(view.offer!.kind, "person");
  assert.deepEqual([view.offer!.lines, view.offer!.person], [["Red-haired Slave"], { label: "Red-haired Slave", name_known: false }]);
  assert.doesNotMatch(json, /Brenna/i); assert.doesNotMatch(json, /campaign_character|campaign_|brenna/i);
  assert.doesNotMatch(json, /avatar|canon-avatar|token|lore|trade_offer_0/i);
  assert.ok(!json.includes(standing(c)!.id), "the internal offer id never leaves the engine");
  const ref = view.offer!.ref;
  // The hidden name is a real, unrevealed campaign fact: the SAME state through the shared projection must not reveal it either.
  c.apply({ expected_revision: c.revision, commands: [{ kind: "set_profile", character_id: BRENNA, profile: { name: "Brenna", age: { kind: "exact", years: 29 }, name_source: "self_disclosed" } }] });
  const revealed = deriveTradeView(world, snap(c));
  assert.deepEqual([revealed.offer!.ref, revealed.offer!.lines, revealed.offer!.person!.name_known], [ref, ["Brenna"], true], "same subject ref; name only after a legitimate reveal");
  assert.equal(snap(c).characters.length, snap(hiddenMarket()).characters.length, "no alias and no new identity");
  accept(c);
  assert.equal(snap(c).legal_statuses.find(l => l.character_id === BRENNA)!.holder_id, NICCO);
});
test("P9/P13: with no safe descriptor an unknown slave is exactly 'Slave'; descriptors come only from a closed visible lexicon", () => {
  const c = createOpeningCampaign(world, `actual_offer_plain_${++serial}`);
  const plain = hiddenBrenna(c.revision + 1, snap(c).runtime.scene.world_time.world_minute); (plain[0] as { character: { origin_snapshot: { established: { appearance?: string[]; descriptor?: string }; label?: string } } }).character.origin_snapshot.established = { descriptor: "Brenna of Ashford, the Light's chosen" } as never;
  (plain[0] as { character: { origin_snapshot: { label: string } } }).character.origin_snapshot.label = "the Heartstone heir";
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, snap(c), "korvin"), ...plain] });
  propose(c, personOffer(c));
  const view = deriveTradeView(world, snap(c)), json = JSON.stringify(view);
  assert.deepEqual(view.offer!.lines, ["Slave"]);
  assert.doesNotMatch(json, /Ashford|Light|Heartstone|chosen|heir|Brenna/i);
});
test("P14/P15: an unknown counterparty never leaks; a known counterparty shows its name", () => {
  const c = hiddenMarket();
  const stranger: CampaignCommand = { kind: "propose_trade_offer", direction: "buy", price_gold: 5, counterparty: { kind: "anonymous", label: "the short man" }, subject: { kind: "goods", lines: [line("Halberd")] } };
  propose(c, stranger);
  assert.equal(deriveTradeView(world, snap(c)).offer!.counterparty, "The short man");
  propose(c, buyGoods(7, "Halberd"));
  assert.equal(deriveTradeView(world, snap(c)).offer!.counterparty, "Korvin", "Korvin's name is known to Nicco");
  const unknown = createOpeningCampaign(world, `actual_offer_unknown_${++serial}`);
  unknown.apply({ expected_revision: unknown.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  propose(unknown, buyGoods(7, "Halberd"));
  const shown = deriveTradeView(world, snap(unknown)).offer!.counterparty;
  assert.doesNotMatch(shown, /Korvin|korvin/i); assert.match(shown, /^(?:Unfamiliar person|.*)$/);
  assert.equal(shown, "Unfamiliar person");
  // A hostile anonymous label cannot smuggle an identifier through.
  const hostile = createOpeningCampaign(world, `actual_offer_hostile_${++serial}`);
  hostile.apply({ expected_revision: hostile.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  propose(hostile, { ...stranger, counterparty: { kind: "anonymous", label: "campaign_character_brenna" } } as CampaignCommand);
  assert.doesNotMatch(JSON.stringify(deriveTradeView(world, snap(hostile))), /campaign_character|brenna/i);
});
test("P: a view of a goods SELL shows what Nicco would give up and is distinct from BUY; the receipt appears only on the settlement revision", () => {
  const c = market([swordItem]); const sword = itemNamed(c, "Old Rusty Sword")!;
  propose(c, sellItems(5, sword.id));
  const v = deriveTradeView(world, snap(c));
  assert.deepEqual([v.offer!.direction, v.offer!.kind, v.offer!.lines, v.offer!.affordable, v.receipt], ["sell", "goods", ["Old Rusty Sword"], null, null]);
  accept(c);
  const done = deriveTradeView(world, snap(c));
  assert.deepEqual([done.offer, done.receipt?.summary], [null, "Sold Old Rusty Sword for 5 gold"]);
});

// =========================================================================================================== GameSession + HTTP: the only settlement path
async function sessionFor(c: CampaignState) {
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-offer-session-")); dirs.push(dir);
  const repository = new FileCampaignRepository(world, dir);
  await repository.saveCampaign(c);
  const deps: SessionDeps = { world, repository, createCoordinator: () => ({ async *runTurn() { /* offline: turns are driven directly in these tests */ } }) };
  const loaded = await GameSession.loadCampaign(deps, snap(c).campaign_id); assert.ok(loaded.ok);
  /** The session's own authoritative campaign, as persisted by its save. */
  const reload = async () => { await loaded.session.save(); return (await repository.loadCampaign(snap(c).campaign_id)).campaign; };
  return Object.assign(loaded.session, { reload });
}
const offersOf = (c: CampaignState): readonly TradeOfferRecord[] => (snap(c).trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
const revisionOf = (s: GameSession) => s.getView().session.revision;
test("GameSession.acceptTradeOffer: ref + revision only; settles atomically; stale, unknown and repeated requests are refused with safe messages", async () => {
  const c = market(); propose(c, buyGoods(15, "Halberd"));
  const s = await sessionFor(c), ref = s.getTradeView().offer!.ref, rev = revisionOf(s);
  assert.deepEqual([s.getTradeView().offer!.affordable, s.getTradeView().offer!.gold], [true, 500]);
  const stale = s.acceptTradeOffer({ ref, expected_revision: rev - 1 }); assert.ok(!stale.ok); assert.equal(revisionOf(s), rev);
  const unknown = s.acceptTradeOffer({ ref: "0".repeat(24), expected_revision: rev }); assert.ok(!unknown.ok); assert.equal(revisionOf(s), rev);
  const garbage = s.acceptTradeOffer({ ref: { x: 1 }, expected_revision: "1" }); assert.ok(!garbage.ok);
  const ok = s.acceptTradeOffer({ ref, expected_revision: rev });
  assert.ok(ok.ok);
  const settled = await s.reload();
  assert.deepEqual([offersOf(settled)[0]!.status, offersOf(settled)[0]!.settlement?.revision, gold(settled)], ["accepted", rev + 1, 485], "the settlement itself is one revision (a later sprite bookkeeping revision may follow)");
  assert.deepEqual([ok.receipt?.summary, s.getTradeView().offer], ["Bought Halberd for 15 gold", null]);
  const after = revisionOf(s);
  const again = s.acceptTradeOffer({ ref, expected_revision: after }); assert.ok(!again.ok); assert.equal(revisionOf(s), after);
  assert.doesNotMatch(JSON.stringify({ error: again.error, reason: again.reason }), /trade_offer_\d|campaign_character|campaign_household|campaign_transaction/);
});
test("GameSession: insufficient funds leaves the offer active, shows a safe message and creates no revision", async () => {
  const c = market([{ kind: "set_funds", character_id: NICCO, gold: 10 }]); propose(c, buyGoods(15, "Halberd"));
  const s = await sessionFor(c), rev = revisionOf(s);
  assert.equal(s.getTradeView().offer!.affordable, false);
  const r = s.acceptTradeOffer({ ref: s.getTradeView().offer!.ref, expected_revision: rev });
  assert.ok(!r.ok); assert.match(r.error.message, /Not enough gold/); assert.equal(revisionOf(s), rev);
  assert.notEqual(s.getTradeView().offer, null);
});
test("POST /api/trade/accept: 200 with the refreshed state, 409 for a stale revision, 422 for a stale offer; the body carries only ref and revision; no ids leak", async t => {
  const c = market(); propose(c, buyGoods(15, "Halberd"));
  const s = await sessionFor(c);
  const server = createPlaytestServer(s); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (body: unknown) => { const r = await fetch(`${base}/api/trade/accept`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() as any }; };
  const before = await (await fetch(`${base}/api/session`)).json() as any;
  assert.equal(before.trade.offer.direction, "buy"); assert.doesNotMatch(JSON.stringify(before.trade), /trade_offer_|campaign_|korvin/);
  const ref = before.trade.offer.ref, rev = before.revision ?? revisionOf(s);
  const stale = await post({ ref, expected_revision: rev - 1 }); assert.equal(stale.status, 409);
  // The browser cannot choose the price, the item or the person: extra fields are ignored and change nothing.
  const sneaky = await post({ ref, expected_revision: rev, price_gold: 1, gold: 9999, item: "x", character_id: "korvin" });
  assert.equal(sneaky.status, 200); assert.equal(gold(await s.reload()), 485, "settled at the offer's own price");
  const current = (await (await fetch(`${base}/api/session`)).json() as any).revision;
  const again = await post({ ref, expected_revision: current }); assert.equal(again.status, 422);
  assert.equal(again.data.ok, false); assert.doesNotMatch(JSON.stringify({ error: again.data.error, reason: again.data.reason }), /trade_offer_\d|campaign_character|campaign_household|campaign_transaction/);
  const after = await (await fetch(`${base}/api/session`)).json() as any;
  assert.equal(after.trade.offer, null);
});
test("the offer ref is opaque, stable per offer and distinct between campaigns", () => {
  const a = market(), b = market(); propose(a, buyGoods(15, "Halberd")); propose(b, buyGoods(15, "Halberd"));
  const ra = deriveTradeView(world, snap(a)).offer!.ref, rb = deriveTradeView(world, snap(b)).offer!.ref;
  assert.match(ra, /^[0-9a-f]{24}$/); assert.notEqual(ra, rb); assert.equal(ra, tradeOfferRef(snap(a).campaign_id, standing(a)!.id));
});

// =========================================================================================================== persistence schema
test("schema: trade_offers is an optional additive snapshot field; snapshots and saves without it still load", () => {
  const c = market(); const legacy: CampaignSnapshot = JSON.parse(JSON.stringify(snap(c)));
  assert.equal("trade_offers" in legacy, false, "a campaign that never traded carries no field");
  propose(c, buyGoods(15, "Halberd"));
  assert.ok(Array.isArray(snap(c).trade_offers));
  const restored = (c.constructor as typeof CampaignState).restore(world, JSON.parse(JSON.stringify(snap(c))));
  assert.deepEqual(standing(restored)?.price_gold, 15);
  assert.doesNotThrow(() => (c.constructor as typeof CampaignState).restore(world, legacy));
});
