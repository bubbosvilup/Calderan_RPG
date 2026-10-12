import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { identityNameFactId } from "../src/campaign/identity-knowledge.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { canonAvatarToken, CANON_AVATAR_ROUTE } from "../src/app/canon-avatars.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * P0 foreground canonical identity binding. A canonical NPC the Narrator foregrounds (or the player selects) is ONE objective actor across
 * turns: the Narrator is told who it portrays, a direct self-introduction resolves against that same actor before any character creation,
 * and a conflicting invented name never creates a person. Real data/ world, scripted offline narration, no controller commands.
 *
 * Why Pass 2 missed it: its fixtures always had the PLAYER describe the person in the same turn as the name request ("walks up to the short
 * compact man ... who am i talking with"), so the canonical casting ran inside that very turn. The production paths never did that: the
 * Narrator chose a seller from the background list on a turn that named nobody, and the next turn carried no referent at all.
 */
const world = await loadWorld("data"), MARKET = "calderan_slave_market";
let serial = 0;
function scene() {
  const campaign = createOpeningCampaign(world, `fg_binding_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, { kind: "runtime_delta", delta: { time_advance_minutes: 600 } }] });
  let text = "", request: GenerationRequest | undefined;
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(r) { request = r; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const turn = async (input: string, narration: string) => {
    text = narration;
    const events = await collect(co.runTurn({ campaign, player_input: input }));
    const last = events.at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify(last).slice(0, 400));
    const result = (last as { result: TurnResult }).result;
    const delivered = (events.find(e => e.type === "narration_completed") as { text: string }).text;
    return { result, plan: result.scene_participants!.plan, system: request!.system_prompt, prompt: request!.messages[0]!.content, delivered, snapshot: campaign.exportSnapshot() };
  };
  const knows = (id: string) => campaign.exportSnapshot().knowledge.some(k => k.character_id === "nicco" && k.fact_id === identityNameFactId(id) && k.status === "knows");
  const label = (id: string) => playerCharacterProjection(world, campaign.exportSnapshot()).project(id)!.name;
  return { campaign, turn, knows, label };
}
const SEEK = "looks for private licensed sellers";
const KORVIN = "*A short, compact seller with large damaged hands, a hooked nose and small, perceptive eyes leans on a pen rail, watching the crowd.*";
const BARTHOLOMEW = "*At the end of the row a tall man with blond hair gone mostly white and a clerical tonsure smiles pleasantly at the passers-by.*";
const ASK = "perhaps interested in buying, what's your name?";
const OBJECTIVE = "[CURRENT INTERACTION PARTNER — OBJECTIVE IDENTITY]";
const created = (snapshot: { characters: readonly { origin: { kind: string } }[] }) => snapshot.characters.filter(c => c.origin.kind === "created").length;

test("T1/T2/T5/T14/T15: Korvin surfaced by the Narrator is the bound partner; the name request keeps the SAME actor, grants the name and adds no actor", async () => {
  const s = scene();
  const first = await s.turn(SEEK, KORVIN);
  assert.equal(first.plan.focus, null, "nobody was selected by the player this turn");
  assert.equal(s.label("korvin"), "Unfamiliar person", "T14: the player-facing label stays masked before any reveal");
  const second = await s.turn(ASK, "*The seller squints at you.*\n\nKorvin.\n\n*He nods.*\n\nWhat are you after?");
  assert.equal(second.plan.focus, "korvin", "the objective partner survived the turn boundary");
  assert.deepEqual(second.plan.addressed, ["korvin"]);
  assert.ok(second.system.includes(OBJECTIVE), "T15: the Narrator is told who it portrays");
  assert.match(second.system, /"objective_identity":"Korvin"/); assert.match(second.system, /"player_knows_name":false/);
  assert.equal(second.plan.participants.length, 0, "T5: no temporary participant");
  assert.equal(created(second.snapshot), 0, "T5: no campaign character");
  assert.ok(s.knows("korvin"), "T2: disclosure updates player knowledge of the SAME entity");
  assert.equal(s.label("korvin"), "Korvin");
  assert.equal(second.snapshot.characters.filter(c => c.profile.name === "Marden" || c.profile.name === "Erdan").length, 0);
});
test("T3/T4: a conflicting invented name (Marden, Erdan) creates nobody, grants nothing, and is revised out of the delivered narration", async () => {
  for (const [name, reply] of [["Marden", "*The seller squints at you.*\n\nMarden. What are you after?"], ["Marden", "*The seller grunts.* \"Name's Marden. What are you after?\""],
    ["Erdan", "*He squints at you.*\n\nMy name is Erdan. Buying or looking?"], ["Erdan", "*The short man looks you over, then shrugs.* \"Erdan,\" he says. \"What are you after?\""]] as const) {
    const s = scene();
    await s.turn(SEEK, KORVIN);
    const r = await s.turn(ASK, reply);
    assert.equal(created(r.snapshot), 0, `${name}: no invented person (${reply})`);
    assert.equal(r.snapshot.characters.some(c => c.profile.name === name), false);
    assert.equal(s.knows("korvin"), false, "the wrong name discloses nothing");
    assert.equal(s.label("korvin"), "Unfamiliar person");
    assert.ok(r.result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict"), "the audit asked for a revision");
    assert.ok(!r.delivered.includes(name), `the invented name is not delivered: ${r.delivered}`);
    assert.equal(r.plan.participants.length, 0, "T5: actor count unchanged");
  }
});
test("T7/T8: an explicit descriptor selection (\"goes to the tall man with a blond white tonsure\") binds the canonical Bartholomew and the name request keeps him", async () => {
  const s = scene();
  await s.turn(SEEK, KORVIN);
  await s.turn("looks for other private sellers", "*Further along, a lean woman with a decorative fan watches the pens.*");
  const pick = await s.turn("goes to the tall man with a blond white tonsure", BARTHOLOMEW);
  assert.equal(pick.plan.focus, "bartolomhew", "the player's selection is the objective foreground participant");
  assert.equal(pick.plan.created, null, "no temporary stand-in");
  const ask = await s.turn("Goodmorning, my names is Nicco, what's your name?", "*The tall man inclines his head.*\n\nBartolomhew.\n\n*He smiles.*\n\nA pleasure.");
  assert.equal(ask.plan.focus, "bartolomhew");
  assert.match(ask.system, /"objective_identity":"Bartolomhew"/);
  assert.ok(s.knows("bartolomhew")); assert.equal(s.label("bartolomhew"), "Bartolomhew");
  assert.equal(created(ask.snapshot), 0); assert.equal(ask.plan.participants.length, 0);
});
test("T9: the conflicting name Mael cannot create a character for Bartholomew", async () => {
  const s = scene();
  await s.turn("goes to the tall man with a blond white tonsure", BARTHOLOMEW);
  const ask = await s.turn("Goodmorning, my names is Nicco, what's your name?", "*The tall man inclines his head.*\n\nMael. A pleasure.");
  assert.equal(created(ask.snapshot), 0); assert.equal(s.knows("bartolomhew"), false); assert.equal(s.label("bartolomhew"), "Unfamiliar person");
  assert.ok(ask.result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict"));
  assert.ok(!ask.delivered.includes("Mael"));
});
test("T6: the canonical avatar stays attached to the one canonical actor after the reveal (no duplicate campaign character with a generic initial)", async t => {
  const dir = await mkdtemp(join(tmpdir(), "fg-binding-avatars-")); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "Korvin_avatar.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  const s = scene();
  await s.turn(SEEK, KORVIN);
  const r = await s.turn(ASK, "*The seller squints at you.*\n\nKorvin.\n\n*He nods.*\n\nWhat are you after?");
  const card = playerCharacterProjection(world, r.snapshot, { canon_avatar_dir: dir }).project("korvin")!;
  assert.equal(card.name, "Korvin"); assert.equal(card.avatar_url, `${CANON_AVATAR_ROUTE}${canonAvatarToken("korvin")}`);
  assert.equal(created(r.snapshot), 0);
});
test("T10: a genuinely non-canonical temporary participant who gives a name stays temporary (AUTH-2: a name from narration creates no Campaign Character)", async () => {
  const s = scene();
  const first = await s.turn("*stops an ordinary passer-by*", "*A middle-aged woman in a patched cloak slows, wary.*");
  assert.ok(first.plan.created, "a temporary participant exists");
  const second = await s.turn("what's your name?", "*She hesitates.*\n\nI'm Erdan.");
  assert.equal(created(second.snapshot), 0, "a name from narration does not create a Campaign Character");
  assert.deepEqual(second.result.identity?.provisional.map(p => p.name), ["Erdan"]);
  assert.ok(second.result.scene_participants!.after.length <= 1, "the temporary participant stays the one present person: no second stand-in appears");
});
test("T11: an explicitly different speaker is not misbound: Korvin stays unnamed and the other speaker is a separate person", async () => {
  const s = scene();
  await s.turn(SEEK, KORVIN);
  const r = await s.turn(ASK, "*Before the seller can answer, the thin man beside him says:*\n\nI'm Erdan.");
  assert.equal(s.knows("korvin"), false, "Korvin's name is unknown");
  assert.equal(r.snapshot.characters.filter(c => c.id === "korvin").length, 0, "no alias or rename of Korvin");
  assert.ok(!r.snapshot.characters.some(c => c.profile.name === "Erdan" && c.origin.kind === "canonical"));
  assert.ok(!r.result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict"), "speaker attribution wins over the addressee");
});
test("T12: a true new second person is not swallowed: Korvin keeps his identity and exactly one new person exists", async () => {
  const s = scene();
  await s.turn(SEEK, KORVIN);
  const r = await s.turn(ASK, "*The seller grunts.*\n\nI'm Korvin.\n\n*A second man steps forward.*\n\nI'm Erdan.");
  assert.equal(r.snapshot.characters.filter(c => c.profile.name === "Korvin").length, 0, "Korvin is never created as a second person");
  assert.ok(created(r.snapshot) <= 1, "at most the one genuinely new person");
});
test("T13: an ambiguous scene binds nobody arbitrarily (two canonical sellers surfaced, no selection)", async () => {
  const s = scene();
  const first = await s.turn(SEEK, `${KORVIN} ${BARTHOLOMEW}`);
  assert.equal(first.plan.focus, null);
  const second = await s.turn(ASK, "*A seller glances over.*\n\nMarden.");
  assert.equal(second.plan.focus, null, "no partner was invented");
  assert.equal(s.knows("korvin"), false); assert.equal(s.knows("bartolomhew"), false);
  assert.ok(!second.system.includes(OBJECTIVE));
});
test("no global fuzzy casting: a weak description of a background person binds no canonical actor", async () => {
  const s = scene();
  await s.turn(SEEK, "*A short man with a beard sells rope from a barrow.*");
  const r = await s.turn(ASK, "*The rope seller shrugs.*\n\nTamsin.");
  assert.equal(r.plan.focus, null); assert.ok(!r.system.includes(OBJECTIVE));
});
test("T16 / continuity: the objective partner survives later turns without re-resolving from scratch, while the player-facing label stays masked", async () => {
  const s = scene();
  await s.turn(SEEK, KORVIN);
  const second = await s.turn("how much do you charge for a strong worker?", "*He rubs his jaw.*\n\nDepends on the worker.");
  assert.equal(second.plan.focus, "korvin");
  const third = await s.turn("and for a cook, how much do you ask?", "*He considers it.*\n\nMore, if she can really cook.");
  assert.equal(third.plan.focus, "korvin", "T16: still the same partner two turns on");
  assert.ok(third.system.includes(OBJECTIVE) && /"objective_identity":"Korvin"/.test(third.system), "NarratorContext still knows the actor");
  assert.equal(s.label("korvin"), "Unfamiliar person");
  assert.equal(third.plan.participants.length, 0);
});
test("a bound partner whose name is not theirs to give is told not to give any name (no invented replacement)", async () => {
  const s = scene();
  await s.turn(SEEK, KORVIN);
  const r = await s.turn("how much do you charge?", "*He shrugs.*\n\nDepends.");
  assert.doesNotMatch(r.system, /do not give them any personal name/, "a public name is available, so the partner may introduce themselves");
});
const LIVE_SEEK = "*Nicco passes a stall where a man with large, damaged hands and a hooked nose sits on a stool beside two captives chained to a post, watching the lane's traffic with small mobile eyes. Further along, a woman with platinum-blonde hair and an expensive dress stands at the open front of a partitioned stall, a decorative fan moving slowly in one hand, speaking in low tones with a buyer. Neither calls out.*";
test("T17 (live failure): two canonical sellers surfaced together, the name question picks nobody, the answering man is still the canonical one and \"Varro\" is rejected", async () => {
  const s = scene();
  await s.turn(SEEK, LIVE_SEEK);
  const r = await s.turn(ASK, "*The man with the damaged hands straightens on his stool.*\n\nDepends on what you're after. *He scratches a broad knuckle against his jaw.* People call me Varro. What's your name, then?");
  assert.match(r.system, /PEOPLE JUST SHOWN TO NICCO/, "the Narrator was told the objective identities of the people it just showed");
  assert.equal(created(r.snapshot), 0); assert.equal(s.knows("korvin"), false); assert.equal(s.label("korvin"), "Unfamiliar person");
  assert.ok(r.result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict"), "the invented name raised an audit issue");
  assert.ok(!r.delivered.includes("Varro"), `the invented name is not delivered: ${r.delivered}`);
});
const LIVE_SEEK_2 = "*A man with a hooked nose and battered hands sits on a stool beside a canvas lean-to, watching Nicco pass. Behind him two men sit chained to a post. Farther along, a woman in elegant clothes with platinum-blonde hair holds a decorative fan and speaks in low tones with a buyer. A cleric-looking man with a tonsure and a pleasant, weathered face stands nearby, watching the traffic.*";
test("T18 (live failure 2): a paraphrased description still surfaces Korvin, and a bare invented name (\"Marek.\") from the compact man creates nobody", async () => {
  const s = scene();
  await s.turn(SEEK, LIVE_SEEK_2);
  const r = await s.turn(ASK, "*The compact man shifts on his stool and looks Nicco over with quick, perceptive eyes. He doesn't stand.*\n\nMarek.\n\n*He tips his chin toward the two men chained behind him.*\n\nLooking for labor, or something particular?");
  assert.equal(created(r.snapshot), 0, "no invented person");
  assert.equal(s.knows("korvin"), false); assert.equal(s.label("korvin"), "Unfamiliar person");
  assert.ok(r.result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict"));
  assert.ok(!r.delivered.includes("Marek"), `the invented name is not delivered: ${r.delivered}`);
});
test("T19 (live failure 3): a name given as a whole sentence inside a longer line still discloses the canonical name to the player", async () => {
  const s = scene();
  await s.turn("goes to the tall man with a blond white tonsure", BARTHOLOMEW);
  const ask = await s.turn("Goodmorning, my names is Nicco, what's your name?", "*The tall man dips his head, a hand on his chest.*\n\nA good morning to you too, Nicco. Bartolomhew. Most people manage something shorter.");
  assert.ok(s.knows("bartolomhew")); assert.equal(s.label("bartolomhew"), "Bartolomhew");
  assert.equal(created(ask.snapshot), 0); assert.equal(ask.plan.participants.length, 0);
});
test("T20 (live failure 4): several people shown, nobody chosen; the compact man answers with his own canonical name, which the player now knows (same actor, nobody created)", async () => {
  const s = scene();
  await s.turn(SEEK, LIVE_SEEK_2);
  const r = await s.turn(ASK, "*The compact man's fingers tap once against the ledger. His eyes settle on Nicco.*\n\nKorvin.\n\n*He says it flatly, and leaves it at that.*\n\nDepends on what you're after. What's the work?");
  assert.ok(s.knows("korvin")); assert.equal(s.label("korvin"), "Korvin");
  assert.equal(created(r.snapshot), 0); assert.equal(r.plan.participants.length, 0);
  assert.ok(!r.result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict"));
});
test("T21 (live failure 5): a bystander described AFTER the name was spoken does not stop the partner's own name from being learned", async () => {
  const s = scene();
  await s.turn("goes to the tall man with a blond white tonsure", BARTHOLOMEW);
  const ask = await s.turn("Goodmorning, my names is Nicco, what's your name?", "*The blond man's smile settles a fraction deeper. He inclines his head.*\n\nGood morning to you, Nicco.\n\n*He pauses there, the name taken in and held without comment.*\n\nBartolomhew. Most people manage the first four syllables and leave the rest alone.\n\n*Behind him, the broad-shouldered man has stopped picking at his thread. His eyes track the exchange without expression.*\n\nAnd what brings you to my corner of the square today?");
  assert.ok(s.knows("bartolomhew")); assert.equal(s.label("bartolomhew"), "Bartolomhew");
  assert.equal(created(ask.snapshot), 0);
});
test("T22 (live failure 6): a bystander woman described after the compact man's name line does not make the speaker ambiguous", async () => {
  const s = scene();
  await s.turn(SEEK, LIVE_SEEK_2);
  const r = await s.turn(ASK, "*The compact man's eyes move over Nicco with a quick, practical scan.*\n\nKorvin.\n\n*He lets the name sit without ceremony.*\n\nYou're looking to buy?\n\n*The woman with the platinum hair is still engaged with her buyer two stalls down.*");
  assert.ok(s.knows("korvin")); assert.equal(s.label("korvin"), "Korvin"); assert.equal(created(r.snapshot), 0);
});
const LIVE_SEEK_3 = "*A man with a hooked nose and large, damaged hands sits on a stool near one of these setups, watching the traffic pass.*\n\n*Further along, a woman with platinum-blonde hair and an expensive fan speaks quietly with another man near a canopy. The man — tall, blond gone mostly to white, with a clerical tonsure and an easy smile — gestures as he talks.*";
test("T23 (live failure 7): a definite reference with no authored trait (\"The man on the stool\") resolves through the sentence that introduced him", async () => {
  const s = scene();
  await s.turn(SEEK, LIVE_SEEK_3);
  const r = await s.turn(ASK, "*The man on the stool shifts forward, planting both feet flat on the packed earth.*\n\nKorvin. You looking for something particular, or just seeing what's out today?");
  assert.ok(s.knows("korvin")); assert.equal(s.label("korvin"), "Korvin"); assert.equal(created(r.snapshot), 0);
  const w = scene();
  await w.turn(SEEK, LIVE_SEEK_3);
  const bad = await w.turn(ASK, "*The man on the stool shifts forward, planting both feet flat on the packed earth.*\n\nMarek. You looking for something particular?");
  assert.equal(created(bad.snapshot), 0); assert.equal(w.knows("korvin"), false);
  assert.ok(bad.result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict"));
});
