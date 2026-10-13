import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { TradeOfferRecord } from "../src/campaign/types.js";
import { GameSession, type SessionDeps } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import { metadata } from "./turn-fixtures.js";
import * as F from "./fixtures/person-offer-playthrough.js";

/**
 * Person Actual Offer end to end, driven by the narration of the live playthrough in which no card appeared: "Three hundred for her." and
 * "I'll go two-sixty." (no "gold"), a woman shown only as one of two women in a pen, a verbal "done deal", narrated payment, then Accept.
 * Real GameSession + TurnCoordinator, scripted Narrator, no provider call.
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market";
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
let serial = 0;
const NICCO = "nicco";

async function harness() {
  const campaign: CampaignState = createOpeningCampaign(world, `person_offer_e2e_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, { kind: "runtime_delta", delta: { time_advance_minutes: 600 } }] });
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-person-offer-e2e-")); dirs.push(dir);
  const repository = new FileCampaignRepository(world, dir);
  let narration = "";
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } };
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator, { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const deps: SessionDeps = { world, repository, createCoordinator: () => coordinator };
  const session = GameSession.fromCampaign(deps, campaign);
  const turn = async (t: F.FixtureTurn) => { narration = t.narration; const r = await session.submitPlayerInput(t.player); assert.ok(r.ok, JSON.stringify(r)); return r; };
  const snap = () => campaign.exportSnapshot();
  const offers = (): readonly TradeOfferRecord[] => (snap().trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
  const gold = () => snap().funds.find(f => f.character_id === NICCO)!.gold;
  const active = () => offers().filter(o => o.status === "active");
  const created = () => snap().characters.filter(c => c.origin.kind === "created");
  const accept = () => { const card = session.getTradeView().offer!; return session.acceptTradeOffer({ ref: card.ref, expected_revision: session.getView().session.revision }); };
  return { coordinator, campaign, session, turn, snap, offers, gold, active, created, accept, deps, repository };
}
const negotiate = async (h: Awaited<ReturnType<typeof harness>>) => { for (const t of [F.SELLERS_ROW, F.KORVIN_NAME_REVEAL, F.OFFER_300]) await h.turn(t); };

test("P1: \"Three hundred for her.\" (no \"gold\") creates an active person BUY offer of 300 for the woman, shown as Slave, without touching funds", async () => {
  const h = await harness(); await negotiate(h);
  assert.equal(h.active().length, 1);
  const o = h.active()[0]!;
  assert.deepEqual([o.direction, o.subject.kind, o.price_gold], ["buy", "person", 300]);
  const card = h.session.getTradeView().offer!;
  assert.deepEqual([card.kind, card.price_gold, card.person?.name_known], ["person", 300, false]);
  assert.match(card.lines[0]!, /^(?:[A-Z][a-z-]+ )?Slave$/, "only the safe player-visible label: no name, id or canonical metadata");
  assert.doesNotMatch(JSON.stringify(card), /campaign_character|bartolomhew/i);
  assert.equal(h.gold(), 500); assert.equal(h.created().length, 0, "nothing is materialized before Accept");
});

const planId = (o: TradeOfferRecord) => o.subject.kind === "person" ? o.subject.subject_character_id : undefined;
test("P2/P3/P4: \"I'll go two-sixty.\" supersedes the 300 offer with a 260 offer for the SAME person; a verbal done deal settles nothing", async () => {
  const h = await harness(); await negotiate(h);
  const first = h.active()[0]!;
  await h.turn(F.HAGGLE);
  assert.deepEqual(h.active().map(o => o.price_gold), [300], "haggling talk changes nothing");
  await h.turn(F.LOWBALL);
  assert.deepEqual(h.active().map(o => o.price_gold), [260]);
  const second = h.active()[0]!;
  assert.equal(h.offers().find(o => o.id === first.id)!.status, "superseded");
  assert.equal(planId(second), planId(first), "the same captive: no identity fork between the offers");
  assert.notEqual(second.id, first.id);
  const rev = h.campaign.revision;
  await h.turn(F.DONE_DEAL);
  assert.deepEqual([h.active().map(o => o.price_gold), h.gold(), h.created().length], [[260], 500, 0], "\"it's a done deal\" does not settle and does not materialize anybody");
  assert.equal(h.session.getTradeView().offer!.price_gold, 260);
  assert.ok(h.campaign.revision >= rev);
});
test("P5/P17: narrated payment (\"pays Korvin 260G\", \"give him 260 golds\") never settles an active Actual Offer and never creates the NPC", async () => {
  const h = await harness(); await negotiate(h);
  for (const t of [F.HAGGLE, F.LOWBALL, F.DONE_DEAL, F.PAYS_PROSE, F.GIVE_GOLD_PROSE]) await h.turn(t);
  assert.deepEqual([h.active().map(o => o.price_gold), h.gold(), h.created().length, h.snap().transactions.length], [[260], 500, 0, 0]);
  assert.equal(h.snap().legal_statuses.filter(l => l.status === "enslaved").length, 0);
});
async function toAccept() {
  const h = await harness(); await negotiate(h);
  for (const t of [F.HAGGLE, F.LOWBALL, F.DONE_DEAL, F.PAYS_PROSE, F.GIVE_GOLD_PROSE]) await h.turn(t);
  return h;
}
test("P6-P10: Accept debits 260 atomically (500 -> 240 in state, SessionView and UI payload) and materializes the woman as the campaign NPC \"Slave\"", async () => {
  const h = await toAccept(), before = h.snap();
  assert.equal(h.gold(), 500);
  const rev = h.session.getView().session.revision;
  const r = h.accept();
  assert.ok(r.ok, JSON.stringify(r));
  const after = h.snap();
  assert.equal(h.gold(), 240); assert.equal(h.session.getView().player.gold, 240, "SessionView funds");
  assert.equal(h.offers().filter(o => o.status === "accepted").length, 1);
  assert.equal(after.transactions.length, before.transactions.length + 1);
  const woman = h.created();
  assert.equal(woman.length, 1, "exactly one persistent NPC");
  assert.equal(after.legal_statuses.find(l => l.character_id === woman[0]!.id)!.holder_id, NICCO);
  assert.equal(after.runtime.npc_locations.some(n => n.character_id === woman[0]!.id) || woman[0]!.current.current_location === MARKET, true);
  const present = h.session.getView().scene.present.find(p => p.id === woman[0]!.id);
  assert.equal(present?.name, "Slave", "provisional visible name; no invented personal name");
  assert.equal(woman[0]!.profile.name, undefined);
  assert.ok(r.ok && r.view.player.gold === 240, "the Accept response itself carries the refreshed state");
  assert.equal(h.snap().revision, rev + 1, "one revision");
});
test("P19/P20/P21: double Accept, stale revision and insufficient funds mutate nothing", async () => {
  const h = await toAccept(), ref = h.session.getTradeView().offer!.ref, rev = h.session.getView().session.revision;
  const stale = h.session.acceptTradeOffer({ ref, expected_revision: rev - 1 }); assert.ok(!stale.ok);
  assert.deepEqual([h.gold(), h.created().length], [500, 0]);
  assert.ok(h.session.acceptTradeOffer({ ref, expected_revision: rev }).ok);
  const again = h.session.acceptTradeOffer({ ref, expected_revision: h.session.getView().session.revision }); assert.ok(!again.ok);
  assert.deepEqual([h.gold(), h.created().length, h.snap().transactions.length], [240, 1, 1], "no double debit");
  const poor = await harness(); poor.campaign.apply({ expected_revision: poor.campaign.revision, commands: [{ kind: "set_funds", character_id: NICCO, gold: 100 }] });
  await negotiate(poor); for (const t of [F.HAGGLE, F.LOWBALL]) await poor.turn(t);
  const before = JSON.stringify(poor.snap()), r = poor.accept();
  assert.ok(!r.ok); assert.equal(JSON.stringify(poor.snap()), before, "insufficient funds: zero mutation");
});
test("P13-P16/P18: the later \"Maren\" renames the SAME entity (Slave -> Maren), count and id unchanged, transaction subject unchanged, survives save/load", async () => {
  const h = await toAccept(); assert.ok(h.accept().ok);
  const id = h.created()[0]!.id, tx = h.snap().transactions[0]!;
  await h.turn(F.ASK_NAME_1);
  assert.equal(h.session.getView().scene.present.find(p => p.id === id)?.name, "Slave", "no name yet: still Slave");
  const saved = await h.session.save(); assert.ok(saved.ok);
  const reloaded = await h.deps.repository.loadCampaign(h.snap().campaign_id);
  assert.equal(reloaded.campaign.exportSnapshot().characters.filter(c => c.origin.kind === "created").length, 1, "P17: save/load keeps Slave");
  await h.turn(F.ASK_NAME_2);
  assert.equal(h.created().length, 1, "no second person");
  assert.equal(h.created()[0]!.id, id, "same id");
  assert.equal(h.session.getView().scene.present.find(p => p.id === id)?.name, "Maren");
  assert.equal(h.snap().legal_statuses.find(l => l.character_id === id)!.holder_id, NICCO);
  assert.equal(h.snap().transactions.length, 1); assert.equal(h.snap().transactions[0]!.subject_id, tx.subject_id);
  assert.equal(h.snap().characters.some(c => c.profile.name === "Maren" && c.id !== id), false);
  await h.session.save();
  const again = (await h.deps.repository.loadCampaign(h.snap().campaign_id)).campaign.exportSnapshot();
  assert.deepEqual(again.characters.filter(c => c.origin.kind === "created").map(c => [c.id, c.profile.name]), [[id, "Maren"]], "P18: Maren survives save/load");
});
test("P11: a captive who is already a campaign character is reused by the offer and by Accept: no duplicate \"Slave\", no replacement", async () => {
  const h = await harness();
  h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "register_character", character: { id: "campaign_character_r2_woman", origin: { kind: "created" }, profile: {}, current: { current_location: MARKET, status: "active" },
    origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase_unnamed_subject", label: "the woman", promoted_revision: h.campaign.revision + 1, promoted_world_minute: 600, location_id: MARKET,
      established: { descriptor: "woman", role: "captive; shown in a pen", sex: "female" }, evidence: ["fixture"] } } }] });
  h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "set_legal_status", character_id: "campaign_character_r2_woman", status: "enslaved", holder_id: "korvin" }] });
  await negotiate(h);
  const o = h.active()[0]!;
  assert.equal(o.price_gold, 300);
  assert.equal(planId(o), "campaign_character_r2_woman", "the offer's subject is the existing character");
  assert.ok(h.accept().ok);
  assert.equal(h.created().length, 1, "reused, not duplicated");
  assert.equal(h.gold(), 200);
  assert.equal(h.snap().legal_statuses.find(l => l.character_id === "campaign_character_r2_woman")?.holder_id, NICCO);
  assert.equal(h.session.getView().scene.present.find(p => p.id === "campaign_character_r2_woman")?.name, "Slave");
});
test("P12: a hidden canonical person is reused by Accept (same objective identity), shown as Slave, and no generic Slave is created beside them", async () => {
  const h = await harness();
  h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "move_character", character_id: "mistress_elara", location_id: MARKET }, { kind: "set_legal_status", character_id: "mistress_elara", status: "enslaved", holder_id: "korvin" }] });
  await h.turn(F.SELLERS_ROW);
  const r12 = await h.turn({ player: "how much is the woman with the platinum hair?", narration: "*Korvin nods toward the cage where a woman with platinum-blonde hair sits very straight.*\n\nThree hundred for her. Clean papers." });

  const card = h.session.getTradeView().offer!;
  assert.ok(card, "an offer card exists for the canonical person");
  assert.match(card.lines[0]!, /Slave$/); assert.doesNotMatch(JSON.stringify(card), /Elara|mistress_elara/);
  assert.ok(h.accept().ok);
  assert.equal(h.created().length, 0, "no duplicate generic Slave");
  assert.equal(h.snap().legal_statuses.find(l => l.character_id === "mistress_elara")!.holder_id, NICCO);
  assert.equal(h.gold(), 200);
});
test("movement follow-up (block 3, MOV-1): after Accept and the name, \"let's go home\" moves Nicco AND the purchased person to Heartstone: same id, no duplicate", async () => {
  const h = await toAccept(); assert.ok(h.accept().ok);
  await h.turn(F.ASK_NAME_1); await h.turn(F.ASK_NAME_2);
  const id = h.created()[0]!.id;
  assert.equal(h.snap().characters.find(c => c.id === id)?.profile.name, "Maren");
  await h.turn(F.GO_HOME);
  const s = h.snap();
  assert.equal(s.runtime.scene.player_location, "heartstone_lr", "Nicco moves home");
  assert.equal(s.characters.filter(c => c.origin.kind === "created").length, 1, "no duplicate: one Campaign character before and after the move");
  assert.equal(s.characters.find(c => c.id === id)?.current.current_location, "heartstone_lr", "the purchased person arrives with him (same stable id)");
  assert.equal(s.legal_statuses.find(l => l.character_id === id)?.holder_id, NICCO, "ownership is unchanged");
  assert.ok(h.session.getView().scene.present.some(p => p.id === id), "the interface shows her at the destination");
});

test("price forms: bargaining sentences read as offers; a repeated buyer figure or an acceptance echo is not a new offer", async () => {
  const { extractNarrationFacts } = await import("../src/turn/narration-facts/index.js");
  const { sellerPrices } = await import("../src/turn/commerce/commerce-evidence.js");
  const pricesOf = (text: string) => sellerPrices(extractNarrationFacts(text, { movers: [], context: { characters: [] } as never }));
  assert.deepEqual(pricesOf("Three hundred for her."), [300]);
  assert.deepEqual(pricesOf("\"I'll go two-sixty.\""), [260]);
  assert.deepEqual(pricesOf("Two hundred. You're a full third off."), []);
  assert.deepEqual(pricesOf("Done, then. Two-sixty."), [260]);
  assert.deepEqual(pricesOf("The cage creaks."), []);
});
test("P6b (live shape): a bare-name speech line answering the name question renames the SAME purchased Slave", async () => {
  const h = await toAccept(); assert.ok(h.accept().ok);
  const id = h.created()[0]!.id;
  await h.turn({ player: "asks the woman: what is your name?", narration: "*Nicco's attention shifts to the pen, to the young woman. Her lips part and close again. The rain runs down her face and she blinks it away.*\n\nLira.\n\n*It comes out barely above the sound of the rain on the canvas. Her eyes drop back to the mud immediately after.*" });
  assert.equal(h.created().length, 1); assert.equal(h.created()[0]!.id, id);
  assert.equal(h.snap().characters.find(c => c.id === id)?.profile.name, "Lira");
  assert.equal(h.session.getView().scene.present.find(p => p.id === id)?.name, "Lira");
});
test("live shape: the seller pitches \"The debt-settlement one\" with no pronoun: an ACTUAL OFFER for a person (never goods), then Accept makes a Slave NPC", async () => {
  const h = await harness();
  await h.turn(F.SELLERS_ROW);
  await h.turn({ player: "asks Korvin whether he has a woman for sale, and how much", narration: "*The short man stops mid-step.*\n\nA woman.\n\nWhat kind. I've got a laundress, sturdy, not young. Got another one, younger, can read and write some, came off a debt settlement. Different prices." });
  await h.turn({ player: "I want the younger one. Sell her to me, price?", narration: "*The man's eyes narrow a fraction.*\n\nThe debt-settlement one. Can read, write some. Twenty-two, maybe twenty-three. Healthy.\n\n*He lets that sit for a beat.*\n\nTwelve hundred gold." });
  const card = h.session.getTradeView().offer!;
  assert.ok(card, "a card exists"); assert.match(card.lines[0]!, /Slave$/); assert.equal(h.active()[0]!.subject.kind, "person");
  assert.equal(h.gold(), 500);
});
test("P6c (live shape 2): \"She stands…\" narration then a bare \"Lira.\" renames the purchased Slave, no second person", async () => {
  const h = await toAccept(); assert.ok(h.accept().ok);
  const id = h.created()[0]!.id;
  await h.turn({ player: "asks the woman: what is your name?", narration: "*She stands where the seller left her, just outside the pen's gate. Rain has darkened her hair flat against her skull. She is looking at the gravel between her own feet.*\n\n*When Nicco speaks, her chin lifts. Her throat moves.*\n\nLira.\n\n*She says it without inflection. Then her gaze drops back to the gravel, and she waits.*" });
  assert.equal(h.created().length, 1, "no second person"); assert.equal(h.created()[0]!.id, id);
  assert.equal(h.snap().characters.find(c => c.id === id)?.profile.name, "Lira");
});
test("live shape 3: \"Got one right here. Twenty-two, good health... Twelve hundred gold.\" with a bound young woman is a person offer", async () => {
  const h = await harness();
  await h.turn(F.SELLERS_ROW);
  await h.turn({ player: "asks Korvin whether he has a woman for sale, and how much", narration: "*He jerks his chin toward the young woman behind him without turning to look.*\n\nGot one right here. Twenty-two, good health, strong enough for housework or a kitchen. Can follow orders, doesn't cause trouble.\n\n*He lets that sit for a beat.*\n\nTwelve hundred gold.\n\n*The young woman stands still under the awning, her bound hands hanging loose in front of her waist.*" });
  const card = h.session.getTradeView().offer!;
  assert.ok(card, "a card exists"); assert.match(card.lines[0]!, /Slave$/); assert.equal(h.active()[0]!.subject.kind, "person"); assert.equal(h.active()[0]!.price_gold, 1200);
});
test("live shape 4: \"The young one. Strong back, no trade skills. She'll pull… Twelve hundred gold.\" is a person offer", async () => {
  const h = await harness();
  await h.turn(F.SELLERS_ROW);
  await h.turn({ player: "asks Korvin whether he has a woman for sale, and how much", narration: "*He tilts his head toward the covered wagon behind him.*\n\nGot two. One's kitchen work, decent hands, not young but not spent. Other one's younger, can't cook worth a damn but she's strong — field or hauling.\n\nWhich sort are you after? Price depends on what you want done with her." });
  await h.turn({ player: "I want the younger one. Sell her to me, price?", narration: "*The man's eyes narrow a fraction.*\n\nThe young one. Strong back, no trade skills. She'll pull, carry, haul — whatever you point her at.\n\n*He lets that sit for a breath.*\n\nTwelve hundred gold.\n\n*His free hand rests on his thigh, open, palm up.*" });
  const card = h.session.getTradeView().offer!;
  assert.ok(card, "a card exists"); assert.equal(h.active()[0]!.subject.kind, "person"); assert.equal(h.active()[0]!.price_gold, 1200);
});
test("live shape 5: \"Nine-fifty's the number.\" answering \"Sell her to me, price?\" is a person offer of 950", async () => {
  const h = await harness();
  await h.turn(F.SELLERS_ROW);
  await h.turn({ player: "asks Korvin whether he has a woman for sale, and how much", narration: "*He tilts his head toward the tent behind him.*\n\nI got two in. One's a kitchen woman, thirty or thereabouts. Other one's younger, strong back, not much for talk. Kitchen one's twelve hundred. The strong one, nine-fifty." });
  await h.turn({ player: "I want the younger one. Sell her to me, price?", narration: "*The man draws the ledger back onto his knee.*\n\nNine-fifty's the number. She's young, strong, quiet. Won't give you trouble with her mouth, that one.\n\n*He closes the ledger again and looks up at Nicco.*" });
  const card = h.session.getTradeView().offer!;
  assert.ok(card, "a card exists"); assert.equal(h.active()[0]!.subject.kind, "person"); assert.equal(h.active()[0]!.price_gold, 950);
});
