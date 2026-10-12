import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { CampaignValidationError } from "../src/campaign/validation.js";
import type { CampaignCommand, TradeOfferRecord } from "../src/campaign/types.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { activeTradeOffer } from "../src/campaign/trade.js";
import { authorizeTradeProposals } from "../src/turn/trade-authorization.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { prepareCommit } from "../src/turn/stages/commit-preparation.js";
import { SceneParticipants } from "../src/turn/scene-participants.js";

/** Consolidation block 1 (TRD-1 ownership on SELL, TRD-2 offers re-checked against the DELIVERED text). Offline: no provider is called. */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", NICCO = "nicco";
const korvin = { kind: "character", character_id: "korvin" } as const;
let serial = 0;
function market(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `consolidation_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin"), ...extra] });
  return c;
}
const sword = (owner: string | null | undefined): CampaignCommand => ({ kind: "create_item", name: "Old Rusty Sword", description: "A pitted blade.", visual_description: "an old rusty sword", category: "weapon",
  ...(owner === undefined ? {} : { owner_id: owner }), position: { kind: "carried", character_id: NICCO } });
const sell = (id: string): CampaignCommand => ({ kind: "propose_trade_offer", direction: "sell", price_gold: 5, counterparty: korvin, subject: { kind: "items", item_ids: [id] } });
const buy: CampaignCommand = { kind: "propose_trade_offer", direction: "buy", price_gold: 15, counterparty: korvin, subject: { kind: "goods", lines: [{ name: "Halberd", description: "A halberd.", visual_description: "a halberd" }] } };
const snap = (c: CampaignState) => c.exportSnapshot();
const offers = (c: CampaignState) => (snap(c).trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
const swordId = (c: CampaignState) => snap(c).items.find(i => i.name === "Old Rusty Sword")!.id;
const run = (c: CampaignState, commands: CampaignCommand[]) => c.commit(c.prepare({ expected_revision: c.revision, commands }));
const reasonOf = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof CampaignValidationError || e instanceof Error ? e.message : String(e); } assert.fail("expected a rejection"); };

test("TRD-1: holding is not owning: a SELL of an item the seller holds but does not own (other owner, unknown owner, unowned) is rejected with item_not_owned and mutates nothing", () => {
  for (const owner of ["korvin", undefined, null]) {
    const c = market([sword(owner)]), before = JSON.stringify(snap(c));
    assert.match(reasonOf(() => run(c, [sell(swordId(c))])), /item_not_owned/, String(owner));
    assert.equal(JSON.stringify(snap(c)), before, "no partial mutation");
    assert.deepEqual(offers(c), []);
  }
});
test("TRD-1: a SELL of an item the player both holds and owns still works end to end", () => {
  const c = market([sword(NICCO)]); run(c, [sell(swordId(c))]);
  const offer = activeTradeOffer(offers(c))!; assert.equal(offer.price_gold, 5);
  run(c, [{ kind: "accept_trade_offer", offer_id: offer.id }]);
  assert.equal(snap(c).items.find(i => i.name === "Old Rusty Sword")?.owner_id, "korvin", "the item is transferred, not deleted");
  assert.equal(snap(c).funds.find(f => f.character_id === NICCO)!.gold, 505);
});
test("TRD-1: ownership that changes between proposal and Accept makes Accept fail with item_not_owned and mutates nothing", () => {
  const c = market([sword(NICCO)]); run(c, [sell(swordId(c))]);
  const raw = JSON.parse(JSON.stringify(snap(c)));
  raw.items.find((i: { name: string }) => i.name === "Old Rusty Sword").owner_id = "korvin"; // still held by the player, owned by someone else now
  const changed = CampaignState.restore(world, raw), before = JSON.stringify(snap(changed));
  assert.match(reasonOf(() => run(changed, [{ kind: "accept_trade_offer", offer_id: activeTradeOffer(offers(changed))!.id }])), /item_not_owned/);
  assert.equal(JSON.stringify(snap(changed)), before, "no gold paid, no item removed");
});
test("TRD-1: the Controller path rejects an unowned item with item_not_owned and no card", () => {
  const c = market([sword("korvin")]), projected = snap(c), context = buildTurnContext(world, projected);
  const [d] = authorizeTradeProposals([{ command: sell(swordId(c)), quote: "Five gold for it, no more." }], 'Korvin turns the Old Rusty Sword over. "Five gold for it, no more."', context, projected, world);
  assert.deepEqual([d!.authorized, d!.code], [false, "item_not_owned"]);
});

// ------------------------------------------------------------------------------------------------------------------------------ TRD-2
const DRAFT = 'Korvin lifts a halberd from the weapon rack and sets it on the counter. "Fifteen gold for the halberd."';
const QUOTE = "Fifteen gold for the halberd.";
function deliver(delivered: string) {
  const c = market(), projected = snap(c), context = buildTurnContext(world, projected), revision = c.revision;
  const diagnostics = authorizeTradeProposals([{ command: buy, quote: QUOTE }], DRAFT, context, projected, world);
  assert.equal(diagnostics[0]!.authorized, true, "the DRAFT authorizes the card");
  const prepared = c.prepare({ expected_revision: revision, commands: [buy] });
  assert.equal((prepared.snapshot.trade_offers ?? []).length, 1);
  const participants = new SceneParticipants();
  const skipped: string[] = [];
  const plan = prepareCommit({ world, prepare: p => c.prepare(p), prepared, commands: [buy], finalized: [], player_input: "Price?", delivered, scene: participants.plan("Price?", context),
    base_revision: revision, location_changed: false, trade_recheck: { diagnostics, projected }, on_skip: r => skipped.push(r) });
  assert.deepEqual(skipped, []);
  return plan;
}
test("TRD-2: a quote that survives in the delivered text keeps the card", () => {
  const plan = deliver(`${DRAFT} He waits.`);
  assert.equal((plan.receipt.snapshot.trade_offers ?? []).filter(o => o.status === "active").length, 1);
  assert.equal(plan.offers, undefined);
});
test("TRD-2: price removed by audit/redaction: no card, the turn still commits", () => {
  const plan = deliver("Korvin lifts a halberd from the weapon rack and sets it on the counter.");
  assert.deepEqual(plan.receipt.snapshot.trade_offers ?? [], []);
  assert.deepEqual(plan.offers?.map(o => [o.kind, o.status, o.reason]), [["offer", "blocked", "quote_not_in_delivered_text"]]);
});
test("TRD-2: price modified in the delivered text: the draft quote no longer authorizes a card", () => {
  const plan = deliver('Korvin lifts a halberd from the weapon rack and sets it on the counter. "Twenty gold for the halberd."');
  assert.deepEqual(plan.receipt.snapshot.trade_offers ?? [], []);
});
test("TRD-2: subject modified in the delivered text: no card", () => {
  const plan = deliver('Korvin lifts a bucket from the floor and sets it on the counter. "Fifteen gold for the bucket."');
  assert.deepEqual(plan.receipt.snapshot.trade_offers ?? [], []);
});
test("TRD-2: without a recheck input prepareCommit keeps its previous behaviour (offers untouched)", () => {
  const c = market(), projected = snap(c), context = buildTurnContext(world, projected), revision = c.revision;
  const prepared = c.prepare({ expected_revision: revision, commands: [buy] });
  const plan = prepareCommit({ world, prepare: p => c.prepare(p), prepared, commands: [buy], finalized: [], player_input: "Price?", delivered: "Nothing was said.", scene: new SceneParticipants().plan("Price?", context),
    base_revision: revision, location_changed: false, on_skip: () => {} });
  assert.equal((plan.receipt.snapshot.trade_offers ?? []).length, 1);
});
