import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Seller / interaction-partner continuity across descriptor-based narration. Real data/ world, scripted offline narration, no controller commands. */
const world = await loadWorld("data"), MARKET = "calderan_slave_market";
let serial = 0;
function scene() {
  const campaign = createOpeningCampaign(world, `seller_continuity_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, { kind: "runtime_delta", delta: { time_advance_minutes: 30 } }] });
  let text = "", request: GenerationRequest | undefined;
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(r) { request = r; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const turn = async (input: string, narration: string) => {
    text = narration;
    const last = (await collect(co.runTurn({ campaign, player_input: input }))).at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify(last).slice(0, 400));
    const result = (last as { result: TurnResult }).result;
    return { result, plan: result.scene_participants!.plan, prompt: request!.messages[0]!.content, system: request!.system_prompt, snapshot: campaign.exportSnapshot() };
  };
  return { campaign, turn };
}
const SELLER_SCENE = "*In the back rows, a short, compact seller with large damaged hands, a hooked nose and small, perceptive eyes leans on a pen rail. In the pen beside him a tall northern woman sits chained, thin and flushed.*";
const INTRO_INPUT = "*walks up to the short compact man by the pens* hello, name's Nicco, who am i talking with ?";
const INTRO = "*The short man looks him over.*\n\nKorvin.\n\n*He jerks a thumb toward the pens.* What are you after?";
const QUOTE_INPUT = "*crouches to inspect the northern woman* name your price";
/** Production narration is plain RPG output: *action* beats followed by unquoted speech. */
const QUOTE = "*The short man glances at the woman in the pen, then back at Nicco.*\n\nFive gold. Take her off my hands.";
const quoted = async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  const quote = await s.turn(QUOTE_INPUT, QUOTE);
  return { s, quote };
};

test("seller continuity: a price quoted in plain RPG speech by 'the man' and a bare payment buy the quoted woman from the SAME canonical seller", async () => {
  const { s } = await quoted();
  const pay = await s.turn("mmh alright *pays up*", "*The short man pockets the coins and unlocks the chain.*\n\nDone.");
  assert.equal(pay.plan.focus, "korvin", "the counterpart stays the foreground partner although the player named nobody");
  assert.equal(pay.plan.created, null, "no temporary stand-in for the seller");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1);
  assert.equal(sale[0]!.gold, 5); assert.equal(sale[0]!.payer_id, "nicco"); assert.equal(sale[0]!.payee_id, "korvin"); assert.equal(sale[0]!.from_holder_id, "korvin");
  assert.equal(sale[0]!.from_counterparty, undefined, "not an anonymous counterparty");
  assert.equal(pay.snapshot.funds.find(f => f.character_id === "nicco")!.gold, 495);
  assert.equal(pay.snapshot.characters.filter(c => c.origin.kind === "created").length, 1, "exactly the bought woman; no invented seller");
});
test("seller continuity: dealing words keep the partner even when a walking verb is present ('she can't walk'), and a mere question prices without buying", async () => {
  const { s } = await quoted();
  const ask = await s.turn("how much was it again?", "*The short man shrugs, nodding at the woman in the pen.*\n\nFive gold for her, like I said.");
  assert.equal(ask.plan.focus, "korvin");
  assert.equal(ask.snapshot.transactions.length, 0, "a price question is not a purchase");
  const pay = await s.turn("alright deal *pays up* she can't walk for sure, hand me the key", "*The short man nods and hands over the key.*\n\nIt's yours.");
  assert.equal(pay.plan.focus, "korvin");
  assert.equal(pay.snapshot.transactions.filter(t => t.kind === "sale" && t.payee_id === "korvin").length, 1);
});
test("seller continuity: a hedged or conditional payment never buys; funds and ownership stay", async () => {
  const { s } = await quoted();
  const maybe = await s.turn("maybe I will pay up if she survives the night", "*The short man waits.*\n\nYour call.");
  assert.equal(maybe.snapshot.transactions.length, 0);
  assert.equal(maybe.snapshot.funds.find(f => f.character_id === "nicco")!.gold, 500);
});
test("seller continuity: two competing descriptor speakers in one exchange bind to nobody (fail closed, never a guessed seller)", async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  await s.turn(QUOTE_INPUT, "*The short man glances at the woman. A broad clerk at the next pen leans in.*\n\n*The seller says* Five gold. Take her off my hands.\n\n*The clerk says* Papers cost extra.");
  const pay = await s.turn("mmh alright *pays up*", "*Coins change hands.*\n\nDone.");
  assert.equal(pay.snapshot.transactions.filter(t => t.payee_id === "korvin").length, 0, "a speaker is never guessed as the canonical seller when two descriptors compete");
});
test("seller continuity: leaving the place ends the counterpart; the same payment words elsewhere do not reach back to the seller", async () => {
  const { s } = await quoted();
  s.campaign.apply({ expected_revision: s.campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "gatherers_inn" } }] });
  const away = await s.turn("mmh alright *pays up*", "*Nobody here knows what he means.*");
  assert.notEqual(away.plan.focus, "korvin");
  assert.equal(away.snapshot.transactions.length, 0);
});
test("transaction diagnostics: a resolved sale, an over-purse payment and a silent non-offer are told apart in the turn result", async () => {
  const { s } = await quoted();
  const pay = await s.turn("mmh alright *pays up*", "*The short man pockets the coins.*\n\nDone.");
  assert.deepEqual(pay.result.person_transactions?.map(t => [t.kind, t.status, t.seller, t.price]), [["purchase", "resolved", "Korvin", 5]]);
  const rich = scene();
  await rich.turn("*looks around the market*", SELLER_SCENE);
  await rich.turn(INTRO_INPUT, INTRO);
  await rich.turn(QUOTE_INPUT, "*The short man glances at the woman in the pen.*\n\nSix hundred gold. Take her off my hands.");
  const broke = await rich.turn("mmh alright *pays up*", "*The short man waits.*\n\nWell?");
  assert.deepEqual(broke.result.person_transactions?.map(t => [t.status, t.reason]), [["blocked", "insufficient_funds"]]);
  assert.equal(broke.snapshot.transactions.length, 0);
  assert.equal(broke.snapshot.funds.find(f => f.character_id === "nicco")!.gold, 500);
});

test("seller continuity: a woman presented only by name in the seller's plain speech ('Brenna. Thirty-two.') and referred to mid-sentence is the person bought by a bare payment", async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  await s.turn("let's see the northener first.", "*The short man ducks under the canvas lean-to and stops beside a figure on the straw.*\n\n*She is tall, even curled on her side, her skin flushed with fever.*\n\nBrenna. Thirty-two. Former river hauler, debt auction, so the papers are clean. Fever started two days ago.");
  await s.turn("Name your price Korvin, i'm easing a burden out of you", "*The short man glances down at Brenna, then back up at Nicco.*\n\nFive gold. Papers are clean, I'll have the transfer drawn up before you walk her out.");
  const pay = await s.turn("mmh alright *pays up* i will bring her myself, hand me the key to those chains", "*The short man takes the five coins one at a time and drops them into a pouch.*\n\nTransfer's signed on my end. Here.");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1);
  assert.equal(sale[0]!.gold, 5); assert.equal(sale[0]!.payee_id, "korvin");
  assert.equal(pay.snapshot.characters.filter(c => c.origin.kind === "created").length, 1);
});

test("seller continuity: speech about 'her' after a beat about the sick woman is not hers, and an unstarred seller beat does not hide the seller", async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  await s.turn("let's see the northener first.", "*Inside, on straw, a woman lies on her side. She's tall, the arms against her chest thick with slack muscle. She doesn't look up.*\n\nBrenna. Thirty-two. Picked her up at a debt auction in Ashford. Fever started two days ago.");
  await s.turn("*puts a hand on her forehead*", "*Her skin burns under his palm. Her eyes stay shut.*\n\nThe short man hasn't moved from his crouch. He watches Nicco's hand on her forehead.\n\nTwo days I said. I'm not nursing her back to health out here. Make me an offer or don't.");
  await s.turn("Name your price Korvin, i'm easing a burden out of you", "*The short man glances back at Brenna's shallow breathing.*\n\nFive gold. Papers are clean, debt-forfeiture chain, no liens. I'll have them drawn before you walk her out.");
  const pay = await s.turn("mmh alright *pays up* i will bring her myself, hand me the key to those chains", "*The short man takes the coins.*\n\nPapers, then the key. Here.");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1, JSON.stringify(pay.result.person_transactions));
  assert.equal(sale[0]!.payee_id, "korvin"); assert.equal(sale[0]!.from_counterparty, undefined);
});

test("seller continuity: 'Brenna, the short man says, …' presents the woman by name; watching an auction or looking away from the pens makes nobody a captive", async () => {
  const s = scene();
  await s.turn("*looks around the market*", "*A tall man with blond hair, his tonsure marking him former clergy, watches the auction with an easy expression. Nearer the pens, a short, compact man studies the people in the cages.*");
  await s.turn(INTRO_INPUT, "*The short man's eyes shift from the pens to Nicco.*\n\nKorvin. What are you after?");
  await s.turn("let's see the northener first.", "*Inside, a woman sits against the far post, tall even sitting, her cheeks flushed. She watches them approach.*\n\nBrenna, the short man says, hooking a thumb toward her. Thirty-two. Picked her up at a debt auction out Ashford way. Fever started two days ago.");
  await s.turn("*crouches and checks her forehead*", "*Brenna's eyes track him down, guarded, unhurried. Her skin is hot under his palm.*\n\n*Behind Nicco, the short man shifts his weight.* She was eating fine before it hit.");
  await s.turn("Name your price Korvin, i'm easing a burden out of you", "*The short man's eyes narrow. His gaze flicks once to Brenna and back to Nicco.*\n\nFive gold. Clean papers, no liens. I'll have the transfer drawn before you walk out.");
  const pay = await s.turn("mmh alright *pays up* hand me the key", "*The short man takes the coins and holds out the papers.*\n\nThere. She's yours.");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1, JSON.stringify(pay.result.person_transactions));
  const bought = pay.snapshot.characters.filter(c => c.origin.kind === "created");
  assert.equal(bought.length, 1); assert.equal(bought[0]!.profile.name, "Brenna");
});

test("seller continuity: 'This is Brenna.' in plain speech, with her captivity stated in a later line ('Picked her up at a debt auction'), is the woman sold by 'the seller'", async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  await s.turn("let's see the northener first.", "*The short man leads Nicco to the far end, where a woman sits against a timber frame. She is tall even seated, her skin flushed and damp.*\n\nThis is Brenna. Thirty-two. River hauler out of the far north.\n\n*He crouches a short distance from her and taps his own forehead.*\n\nPicked her up at a debt auction in Ashford. Fever started two days ago.");
  await s.turn("name your price Korvin", "*The seller looks down at Brenna, then back at Nicco.*\n\nFive gold. Papers are clean, I'll have the transfer written up proper.");
  const pay = await s.turn("mmh alright *pays up* hand me the key", "*The seller takes the coins.*\n\nFair enough. Let me get the key.");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1, JSON.stringify(pay.result.person_transactions));
  assert.equal(sale[0]!.payee_id, "korvin");
  assert.equal(pay.snapshot.characters.filter(c => c.origin.kind === "created")[0]!.profile.name, "Brenna");
});

test("seller continuity: an anonymous seller's plain-speech price ('She's a write-off. Three gold.') for the scene's only captive is a sale from an anonymous counterparty", async () => {
  const s = scene();
  await s.turn("*walks into a small private lot behind the canvas* hello, i'm shopping for a sick girl, how much do you want?", "*A man on a stool whittles a stick beside the lot. Behind the canvas a girl lies on the ground, a shackle on her ankle, fever-flushed.*");
  await s.turn("*crouches and checks the girl medically*", "*The man watches from the entrance. His gaze goes to the girl on the ground, then back up.*\n\nShe's a write-off. Three gold, no papers, no listing. You carry her out yourself.");
  const pay = await s.turn("*pays him and takes the key to free her*", "*The man takes the coins and sets a small iron key on the crate.*\n\nShe's yours.");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1, JSON.stringify(pay.result.person_transactions));
  assert.equal(sale[0]!.gold, 3); assert.equal(sale[0]!.payer_id, "nicco");
  assert.ok(sale[0]!.from_counterparty, "anonymous counterparty, not a canonical seller");
  assert.equal(pay.snapshot.funds.find(f => f.character_id === "nicco")!.gold, 497);
});

test("seller continuity: with a dead woman and a girl in the lot, 'She's a write-off' refers to the person narration mentioned last, and the anonymous seller still sells her", async () => {
  const s = scene();
  await s.turn("*walks into a small private lot behind the canvas* hello, i'm shopping for a sick girl, how much do you want?", "*A man on a stool whittles a stick beside the lot. Behind the canvas lie a woman under a sheet and a girl, fever-flushed, a shackle on her ankle.*");
  await s.turn("*crouches and checks them medically*", "*Nicco's gaze moves from the girl's face to the still woman under the sheet. The man watches, his eyes lingering on the girl a beat longer than on the others.*\n\nThree gold. No papers, no listing. She's a write-off, you take her as-is.");
  const pay = await s.turn("*pays him and takes the key to free her*", "*The man counts three coins into his shirt and drops a small iron key in Nicco's hand.*\n\nShe's yours.");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1, JSON.stringify(pay.result.person_transactions));
  assert.equal(sale[0]!.gold, 3);
});

test("seller continuity: 'That's her. Brenna.' presents the woman; a pen mentioned before 'but the man walks past' captures nobody; 'her' in the quote follows the name mentioned last", async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  await s.turn("let's see the northener first.", "*The short man leads Nicco to the back. A few figures are visible in the pens, some sitting, some standing, but the man walks past the first two and stops at a third.*\n\n*Inside, a woman sits against the far post, tall even seated, her skin flushed.*\n\nThat's her. Brenna. Thirty-two. Was a river hauler before the debt caught up with her. Fever started two days ago.");
  await s.turn("name your price Korvin", "*The short man scratches his neck, glancing toward Brenna against the post.*\n\nFive gold. Clean transfer, debt-forfeiture chain, no liens on her. Papers are yours.");
  const pay = await s.turn("mmh alright *pays up* hand me the key", "*The short man takes the coins.*\n\nFair enough. Let me get the key.");
  const sale = pay.snapshot.transactions.filter(t => t.kind === "sale");
  assert.equal(sale.length, 1, JSON.stringify(pay.result.person_transactions));
  const created = pay.snapshot.characters.filter(c => c.origin.kind === "created");
  assert.equal(created.length, 1); assert.equal(created[0]!.profile.name, "Brenna");
});

test("seller continuity: 'That's Brenna.' in the exchange that describes the one woman names HER (one identity), so the sale creates Brenna and no unnamed stand-in", async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  await s.turn("let's see the northener first.", "*The short man leads Nicco past the roped pens to the back, where a single tall woman sits chained to a wooden post. She is big, broad-shouldered, her skin flushed with fever.*\n\nThat's Brenna. Thirty-two. River hauler out of Ashford, debt auction, so the papers are clean.");
  await s.turn("*puts a hand on her forehead*", "*Her skin is hot under his palm. The short man watches from a couple of paces back.*\n\nShe's tougher than she looks right now.");
  await s.turn("name your price Korvin", "*The short man glances back at the pen, at the big woman slumped against the post.*\n\nFive gold. Clean transfer, debt-forfeiture chain, no liens on her. Papers are yours.");
  const pay = await s.turn("mmh alright *pays up* hand me the key", "*The short man takes the five gold and hands over the papers.*\n\nThere. Clean. She's yours.");
  const created = pay.snapshot.characters.filter(c => c.origin.kind === "created");
  assert.equal(created.length, 1, JSON.stringify(pay.result.person_transactions));
  assert.equal(created[0]!.profile.name, "Brenna");
  assert.equal(pay.snapshot.transactions.filter(t => t.kind === "sale").length, 1);
});

test("seller continuity: a woman promoted by name BEFORE she was narrated as held (no captive role) is still the captive the seller later prices as 'the woman' — no unnamed duplicate", async () => {
  const s = scene();
  await s.turn("*looks around the market*", SELLER_SCENE);
  await s.turn(INTRO_INPUT, INTRO);
  const brenna = buildPromotedCharacter({ label: "Brenna", established: { name: "Brenna", sex: "female", descriptor: "woman" }, evidence: ['Someone: "Brenna. Thirty-two."'], location_id: MARKET, trigger: "name_established", promoted_revision: s.campaign.revision + 1, world_minute: s.campaign.exportSnapshot().runtime.scene.world_time.world_minute });
  s.campaign.apply({ expected_revision: s.campaign.revision, commands: [{ kind: "register_character", character: brenna }] });
  await s.turn("let's see the northener.", "*The short man leads Nicco to a pen where a woman sits chained to a wooden post, skin flushed with fever.*\n\nShe's tougher than she looks right now.");
  await s.turn("name your price Korvin", "*The short man glances back at the pen, at the chained woman slumped against the post.*\n\nFive gold. Clean transfer, no liens on her. Papers are yours.");
  const pay = await s.turn("mmh alright *pays up* hand me the key", "*The short man takes the five gold and hands over the papers.*\n\nThere. Clean. She's yours.");
  assert.deepEqual(pay.snapshot.characters.filter(c => c.origin.kind === "created").map(c => c.id), [brenna.id], JSON.stringify(pay.result.person_transactions));
  assert.equal(pay.snapshot.transactions.filter(t => t.kind === "sale" && t.subject_id === brenna.id).length, 1);
});
