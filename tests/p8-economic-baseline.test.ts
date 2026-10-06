import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { adjustedSilver, economicRelevance, economy, formatSilver, generatePriceIndex, parseEconomy, toSilver } from "../src/economy/economy.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { groundingIssues } from "../src/turn/grounding-audit.js";
import { collect, metadata, mockController, mockNarrator } from "./turn-fixtures.js";

/** P8 Economic Baseline V1: one authored anchor table, selective injection, a persisted per-seller index. No price engine. */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market";
let serial = 0;
function campaign(location?: string, extra: readonly CampaignCommand[] = []) {
  const c = createOpeningCampaign(world, `p8_economy_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [...(location ? [{ kind: "runtime_delta" as const, delta: { player_location: location } }] : []), ...extra] });
  return c;
}
const knowKorvin = (c: CampaignState) => c.apply({ expected_revision: c.revision, commands: [...learnCanonicalName(world, c.exportSnapshot(), "korvin")] });
const prompt = (c: CampaignState, input: string, recent: readonly RecentExchange[] = []) => {
  const r = buildNarratorPrompt(input, buildTurnContext(world, c.exportSnapshot(), { input }), recent, undefined, { candidates: [], runtime: [] });
  return r.messages[0]!.content;
};
const block = (text: string) => { const i = text.indexOf("[ECONOMIC REFERENCE"); if (i < 0) return ""; const end = text.indexOf("\n[", i + 1); return text.slice(i, end < 0 ? undefined : end); };
const index = (c: CampaignState, id: string) => c.exportSnapshot().price_indices?.find(p => p.character_id === id)?.percent;
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-06T12:00:00.000Z"), world), world).snapshot);

// ------------------------------------------------------------------------------------------------ 1-2 currency and table
test("P8 currency: 10 Silver = 1 Gold, whole units only, compact formatting", () => {
  assert.equal(economy().silver_per_gold, 10);
  assert.deepEqual([15, 20, 9, 34, 0, 6400].map(n => formatSilver(n)), ["1G 5S", "2G", "9S", "3G 4S", "0S", "640G"]);
  assert.equal(toSilver(3, 4), 34);
  for (const bad of [1.5, -1, 3.4]) assert.throws(() => formatSilver(bad));
});
test("P8 authored baseline loads and validates; decimals, foreign conversion and bad categories are rejected", () => {
  const e = economy(), silver = (key: string) => e.prices.find(p => p.key === key)?.silver;
  assert.deepEqual(Object.fromEntries(e.prices.map(p => [p.key, formatSilver(p.silver)])), {
    common_bread_1kg: "1S", mug_of_beer: "1S", simple_hot_meal: "3S", good_monthly_food_budget: "8G 5S", large_dinner_with_spiced_wine: "1G 5S",
    simple_inn_room_per_night: "5S", good_dagger_or_simple_weapon: "2G", tempered_steel_greatsword: "12G", full_knightly_plate: "200G",
    mercenary_or_armed_guard_per_day: "4G", average_slave: "640G", good_slave: "1000G" });
  assert.equal(silver("average_slave"), 6400);
  assert.deepEqual(e.incomes.map(i => [i.key, i.min_gold, i.max_gold]), [["poor_precarious_monthly", 6, 6], ["farmhand_unskilled_monthly", 8, 10], ["skilled_artisan_monthly", 12, 14],
    ["lower_bourgeoisie_monthly", 18, 20], ["middle_bourgeoisie_monthly", 38, 40], ["upper_bourgeoisie_monthly", 60, null]]);
  assert.deepEqual(e.index_range, { min: -30, max: 30 });
  const base = (price: string, currency = "silver_per_gold: 10") => `schema_version: 1\ncurrency: { ${currency} }\nincome_baselines: {}\nreference_prices:\n  x: ${price}\nprice_index_range_percent: { min: -30, max: 30 }\nprice_setters: []\n`;
  assert.ok(parseEconomy(base("{ label: X, category: food, gold: 1, silver: 2 }")));
  assert.throws(() => parseEconomy(base("{ label: X, category: food, gold: 1.5, silver: 0 }")), /whole number/);
  assert.throws(() => parseEconomy(base("{ label: X, category: food, gold: 0, silver: 12 }")), /silver below one gold/);
  assert.throws(() => parseEconomy(base("{ label: X, category: magic, gold: 1, silver: 0 }")), /category/);
  assert.throws(() => parseEconomy(base("{ label: X, category: food, gold: 1, silver: 0 }", "silver_per_gold: 100")), /10 Silver = 1 Gold/);
  for (const id of e.price_setters) assert.equal(world.getEntity(id)?.type, "character", id);
});

// ------------------------------------------------------------------------------------------------ 3 Personal Price Index
test("P8 price index: generated once per campaign, in range, persisted exactly through save/reload, can differ between campaigns", () => {
  const a = campaign(), b = campaign();
  const ka = index(a, "korvin")!;
  assert.ok(Number.isInteger(ka) && ka >= -30 && ka <= 30);
  assert.equal(ka, generatePriceIndex(a.exportSnapshot().campaign_id, "korvin"));
  assert.deepEqual(a.exportSnapshot().price_indices!.map(p => p.character_id), [...economy().price_setters].sort());
  const restored = roundTrip(a);
  assert.deepEqual(restored.exportSnapshot().price_indices, a.exportSnapshot().price_indices);
  assert.deepEqual(roundTrip(restored).exportSnapshot().price_indices, a.exportSnapshot().price_indices, "never rerolled on a second reload");
  assert.notDeepEqual(b.exportSnapshot().price_indices, a.exportSnapshot().price_indices, "a new campaign receives its own indices");
  // Never rerolled: a second assignment is rejected at the domain boundary.
  assert.throws(() => a.apply({ expected_revision: a.revision, commands: [{ kind: "set_price_index", character_id: "korvin", percent: 5 }] }), /already established/);
  assert.equal(index(a, "korvin"), ka);
  for (const p of a.exportSnapshot().price_indices!) assert.ok(p.percent >= -30 && p.percent <= 30);
  // Non-sellers do not receive campaign state.
  assert.equal(index(a, "helbrecht"), undefined);
});
test("P8 price index on a pre-P8 save: no stored record, yet the same stable value every load (no reroll)", () => {
  const c = campaign(MARKET), legacy = structuredClone(c.exportSnapshot()) as { price_indices?: unknown; campaign_id: string };
  delete legacy.price_indices;
  const old = CampaignState.restore(world, legacy);
  const value = () => buildTurnContext(world, old.exportSnapshot()).social.price_indices?.find(p => p.character_id === "korvin")?.percent;
  assert.equal(old.exportSnapshot().price_indices, undefined);
  assert.equal(value(), generatePriceIndex(legacy.campaign_id, "korvin"));
  assert.equal(value(), value());
});

// ------------------------------------------------------------------------------------------------ 4-12 selective injection
test("P8 non-economic turns receive no economic table", () => {
  const market = campaign(MARKET), home = campaign("heartstone_lr");
  for (const [c, input] of [[market, "*looks around*"], [home, "Are you hungry?"], [market, "What is this place?"], [home, "*sits by the hearth and eats the stew*"]] as const)
    assert.equal(prompt(c, input).includes("[ECONOMIC REFERENCE"), false, input);
});
test("P8 food and lodging purchases receive only their anchors", () => {
  const inn = campaign("gatherers_inn");
  const meal = block(prompt(inn, "I'd like to buy a hot meal. What does it cost?"));
  assert.match(meal, /simple hot meal ~3S/); assert.match(meal, /mug of beer ~1S/); assert.doesNotMatch(meal, /slave|greatsword/);
  const room = block(prompt(inn, "How much for a room for the night?"));
  assert.match(room, /simple inn room per night ~5S/); assert.doesNotMatch(room, /slave|greatsword|knightly/);
  assert.match(room, /10 Silver = 1 Gold/); assert.match(room, /no copper, no decimals/);
});
test("P8 equipment purchase receives the tempered steel greatsword ~12G anchor", () => {
  const shop = campaign("blackiron_repairs_and_arms");
  const b = block(prompt(shop, "How much for a tempered steel greatsword?"));
  assert.match(b, /tempered steel greatsword ~12G/); assert.match(b, /full knightly plate armor ~200G/); assert.doesNotMatch(b, /slave|inn room/);
});
test("P8 slave purchase receives average ~640G and good ~1000G anchors, plus quality guidance without formulas", () => {
  const c = campaign(MARKET);
  const b = block(prompt(c, "How much for an ordinary slave? Or a skilled one?"));
  assert.match(b, /average slave ~640G/); assert.match(b, /good or valuable slave ~1000G/);
  assert.match(b, /exceptional specialist may exceed it/); assert.doesNotMatch(b, /beauty|species|age modifier|%\s*per/i);
});
test("P8 Korvin's persisted index adjusts his rough anchor, and the block forbids exposing index mechanics", () => {
  const c = campaign(MARKET); knowKorvin(c);
  const percent = index(c, "korvin")!, b = block(prompt(c, "Korvin, how much for a slave who can cook?"));
  assert.ok(b.includes(`Seller tendency: Korvin prices ${percent > 0 ? "above" : percent < 0 ? "below" : "at about"}`), b);
  assert.ok(b.includes(`average slave ~${formatSilver(adjustedSilver(6400, percent))}`), b);
  assert.equal(formatSilver(adjustedSilver(6400, 20)), "768G");
  assert.equal(formatSilver(adjustedSilver(3, 22)), "4S");
  assert.match(b, /never mention anchors, indexes or tendencies/);
  assert.match(b, /approximate, not fixed/); assert.match(b, /a character may state a concrete Gold\/Silver price/);
});
test("P8 an unknown seller's name is masked in the economic block like everywhere else", () => {
  // Unknown Jessa Rook is the resolved conversation partner (foreground) without her name being player-known.
  const partner: RecentExchange[] = [{ player: "Evening.", narration: "*The innkeeper nods from behind the bar.*\n\nEvening.", status: "finalized", location_id: "gatherers_inn", conversation_partner_id: "jessa_rook" }];
  const b = block(prompt(campaign("gatherers_inn"), "How much for a room for the night?", partner));
  assert.ok(b.includes("Seller tendency: the unfamiliar woman"), b);
  assert.equal(/Jessa|Rook/.test(b), false);
});
test("P8 only foreground sellers get a tendency line; P6 background sellers stay baseline", () => {
  const c = campaign(MARKET); knowKorvin(c);
  const text = prompt(c, "Korvin, how much for a slave who can cook?");
  assert.ok(text.includes("[BACKGROUND PRESENT]"), "Elara and Blackthorn are present but backgrounded");
  assert.deepEqual(block(text).match(/Seller tendency: \S+/g), ["Seller tendency: Korvin"]);
  assert.doesNotMatch(block(text), /mercenary/, "slave labor talk is not a hiring turn");
});
test("P8 slave auction is never economically unanchored", () => {
  const c = campaign(MARKET), b = block(prompt(c, "I want to bid at the auction for the next one on the block."));
  assert.match(b, /average slave ~640G/); assert.match(b, /Auction: let opening bids, bidding and the closing price move naturally/);
  assert.match(b, /never goes for a few gold or many thousands/);
});
test("P8 Nicco selling an item receives its baseline and a buyer framing, without a resale formula", () => {
  const shop = campaign("blackiron_repairs_and_arms"), b = block(prompt(shop, "I want to sell this dagger. What would you pay for it?"));
  assert.match(b, /good dagger or simple weapon ~2G/); assert.match(b, /Nicco is selling: the other party is the buyer/);
  assert.doesNotMatch(b, /50%|half price|resale|margin|depreciat/i);
});

// ------------------------------------------------------------------------------------------------ 13-16 audit, continuity, purse
function harness(c: CampaignState) {
  let text = "";
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  return { co, turn: async (input: string, narration: string) => {
    text = narration;
    const last = (await collect(co.runTurn({ campaign: c, player_input: input }))).at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify(last).slice(0, 300));
    return (last as { result: { narration: string; narration_reconciliation?: { delivered: string } } }).result;
  } };
}
test("P8 audit: anchored Gold/Silver asks survive on economic turns; foreign coins and non-economic prices stay flagged", async () => {
  const c = campaign(MARKET); knowKorvin(c);
  const h = harness(c);
  const ask = "*Korvin rubs his jaw.*\n\nSeven hundred and eighty gold for her. She cooks.";
  const asked = await h.turn("Korvin, how much for the woman who cooks?", ask);
  assert.equal(asked.narration_reconciliation?.delivered ?? "draft", "draft");
  assert.equal(asked.narration, ask);
  const copper = await h.turn("How much for the bread?", "*Korvin shrugs.*\n\nThree copper for the loaf.");
  assert.notEqual(copper.narration_reconciliation?.delivered ?? "draft", "draft", "copper is not a Calderan coin");
  // Exact issue kinds, independent of other audit families.
  const g = (sentence: string, economic_reference: boolean) => groundingIssues({ sentences: [sentence], player_input: "", recent: [], authoritative_text: "", economic_reference }).map(i => i.kind);
  assert.deepEqual(g("That's twelve gold.", false), ["invented_price"], "a non-economic turn keeps the exact-price protection");
  assert.deepEqual(g("That's twelve gold.", true), []);
  assert.deepEqual(g("Three silver for the room.", true), []);
  assert.deepEqual(g("Three copper for the loaf.", true), ["invented_price"]);
  assert.match(groundingIssues({ sentences: ["Five crowns."], player_input: "", recent: [], authoritative_text: "", economic_reference: true })[0]!.correction, /only Gold and Silver/);
});
test("P8 negotiation continuity: a quoted price stays in recent scene context and the anchors persist into 'Too much.'", async () => {
  const c = campaign(MARKET); knowKorvin(c);
  const h = harness(c);
  await h.turn("Korvin, what do you want for her?", "*Korvin taps the post.*\n\nSeven hundred and eighty gold.");
  const next = h.co.contextRequest(c).messages[0]!.content;
  assert.ok(next.includes("Seven hundred and eighty gold."), "the ask stays in recent conversation");
  const turnPrompt = prompt(c, "Too much.", h.co.recent(c).forPrompt());
  assert.ok(turnPrompt.includes("[ECONOMIC REFERENCE"), "the ongoing negotiation keeps its anchors");
  assert.match(block(turnPrompt), /keep a price already quoted in this negotiation as its starting point/);
});
test("P8 the turn controller can never set or reroll a price index", async () => {
  const c = campaign(MARKET), before = index(c, "korvin")!, service = new RetrievalService(world);
  const co = new TurnCoordinator(world, mockNarrator("*Korvin waits.*"), mockController([{ kind: "set_price_index", character_id: "korvin", percent: before === 30 ? -30 : 30 }]),
    { service, search: new HybridSearch(service) }, { provider_retry: false });
  const last = (await collect(co.runTurn({ campaign: c, player_input: "Korvin, how much for a slave?" }))).at(-1)!;
  // The controller wire schema cannot even express it: fail closed before authorization, nothing committed.
  assert.deepEqual([last.type, (last as { code?: string }).code, (last as { provider_code?: string }).provider_code], ["turn_failed", "controller_failed", "structured_output_invalid"]);
  assert.equal(index(c, "korvin"), before);
});
test("P8 relevance cues: commercial phrasing injects; mere mention of food, gold light or a pen does not", () => {
  const signals = (input: string) => economicRelevance({ input, recent: [], location: "heartstone_lr Heartstone Living Floor", trade_negotiation: false });
  for (const input of ["What do you want for her?", "Is that for sale?", "I don't want to overpay.", "That's too much.", "Can I afford a sword?", "I'll pay twenty gold.", "What's the going rate for a guard?", "Want to hire a mercenary for a week."])
    assert.ok(signals(input), input);
  for (const input of ["Are you hungry?", "*eats the stew*", "Gold light spills across the floor.", "*picks up the pen*", "Thanks a lot.", "*charges at the bandit*", "Need a hand with that?"])
    assert.equal(signals(input), null, input);
  assert.deepEqual(signals("Want to hire a mercenary for a week.")!.categories, ["services"]);
  assert.equal(signals("How much do you earn a month?")!.income, true);
});
test("P8 existing purse authority still blocks impossible spending; no transaction path changed", () => {
  const BRENNA = "campaign_character_p8_brenna";
  const c = campaign(MARKET, [{ kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }]);
  const sale = (gold: number): CampaignCommand => ({ kind: "transfer_person", transaction_id: `campaign_transaction_p8_${gold}`, transaction_kind: "sale", character_id: BRENNA, from_holder_id: "korvin", to_holder_id: "nicco", payment: { payer_id: "nicco", payee_id: "korvin", gold }, documentation: "documented" });
  assert.throws(() => c.apply({ expected_revision: c.revision, commands: [sale(780)] }), /insufficient funds/);
  c.apply({ expected_revision: c.revision, commands: [sale(450)] });
  assert.equal(c.exportSnapshot().funds.find(f => f.character_id === "nicco")?.gold, 50);
  // An active person-trade is itself an economic turn: the anchors reach the narrator.
  const d = campaign(MARKET, [{ kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna" }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }]);
  assert.match(block(prompt(d, "Tell me about her.")), /average slave ~640G/);
});
