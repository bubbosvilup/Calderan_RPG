import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { isNpcPlus, activeNpcPlus } from "../src/campaign/premium-characters.js";
import { deriveSessionView } from "../src/app/session-view.js";
import { oathMissing } from "../src/turn/household-evidence.js";
import { HEARTSTONE_HOUSEHOLD_RULES, HEARTSTONE_CANONICAL_OATH, HEARTSTONE_DEED_ITEM, HEARTSTONE_CHARTER_ITEM, openingOathText } from "../src/campaign/heartstone-charter.js";
import { recognizedByHeartstone, stoneFeel, insideHeartstoneInterior } from "../src/campaign/heartstone-recognition.js";
import { HEARTSTONE_STONE_LINE } from "../src/turn/scene-state-render.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { runScenario, type DiagnosticScenario } from "../src/dev/controller-authorization-diagnostics.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Heartstone household rite = NPC+ promotion event, plus the canon, the two opening documents and the derived stone-warmth recognition
 * (tests R1-R15, C1-C15, D1-D10, T1-T10). Offline: no provider is called.
 */
const world = await loadWorld("data");
type F = ReturnType<typeof turnFixture>;
const idOf = (name: string) => `campaign_character_${name.toLowerCase()}`;
const FULL_OATH = (n: string) => `"I, ${n}, choose to stay and become a member of the Heartstone. I swear to be loyal to and protect my family, and to stand faithfully beside the Keeper."`;
const QUOTE = (n: string) => `I, ${n}, choose to stay and become a member of the Heartstone.`;
const ACCEPT = `Nicco accepts the oath. "I accept you as a member of the Heartstone."`;
const BODY = (n: string) => `${n} stands barefoot, her bare feet flat on the stone of the floor.`;
const RITE = (n: string) => `${BODY(n)} ${FULL_OATH(n)}\n\n${ACCEPT}`;

let serial = 0;
function candidate(name: string, where = "heartstone_lr", boots = false): CampaignState {
  const c = createOpeningCampaign(world, `rite_${name.toLowerCase()}_${++serial}`), id = idOf(name);
  const commands: CampaignCommand[] = [{ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 26 } }, current: { current_location: where, status: "active" } } },
    { kind: "runtime_delta", delta: { player_location: where } }];
  if (boots) commands.push({ kind: "register_item", item: { id: `campaign_item_${name.toLowerCase()}_boots`, origin: { kind: "created" }, name: "Boots", owner_id: id, position: { kind: "equipped", character_id: id, slot: "feet", mode: "worn" } } });
  c.apply({ expected_revision: c.revision, commands });
  return c;
}
async function attempt(name: string, narration: string, options: { where?: string; boots?: boolean; quote?: string; campaign?: CampaignState } = {}) {
  const c = options.campaign ?? candidate(name, options.where, options.boots), id = idOf(name), before = c.revision;
  const scenario: DiagnosticScenario = { id: "r", title: "r", input: "*waits for her answer*", narration, fixture: () => ({ world, campaign: c } as unknown as F),
    controller: { kind: "commands", commands: [{ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id }], evidence: [options.quote ?? QUOTE(name)] } };
  const run = await runScenario(scenario);
  return { c, id, run, before, after: c.revision };
}
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-10T12:00:00.000Z"), world), world).snapshot);
const memberIds = (c: CampaignState) => c.exportSnapshot().households.find(h => h.id === OPENING_HOUSEHOLD)!.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id);
const unchanged = (r: Awaited<ReturnType<typeof attempt>>) => { assert.equal(r.after, r.before, "no revision"); assert.deepEqual(memberIds(r.c), []); assert.equal(isNpcPlus(r.c.exportSnapshot(), r.id), false); };

// ---------------------------------------------------------------------------------------------- R: rite = promotion event
test("R1/R2/R3: a verified voluntary rite activates membership AND NPC+ promotion in exactly one revision", async () => {
  const r = await attempt("Brenna", RITE("Brenna"));
  assert.equal(r.run.diagnostic.verdict, "committed", JSON.stringify(r.run.diagnostic.rejected));
  assert.deepEqual(memberIds(r.c), [r.id]);
  assert.equal(isNpcPlus(r.c.exportSnapshot(), r.id), true);
  assert.equal(r.after, r.before + 1);
  assert.ok(activeNpcPlus(r.c.exportSnapshot()).has(r.id));
});
test("R4: membership and promotion persist through save/load and are not recalculated from prose", async () => {
  const r = await attempt("Brenna", RITE("Brenna")), restored = roundTrip(r.c);
  assert.deepEqual(memberIds(restored), [r.id]);
  assert.equal(isNpcPlus(restored.exportSnapshot(), r.id), true);
  assert.deepEqual(restored.exportSnapshot().premium_characters, r.c.exportSnapshot().premium_characters);
});
test("R5: failed, coerced, unconscious, no-Keeper and vague attempts change nothing (no revision, no member, no promotion)", async () => {
  const cases: [string, string][] = [
    ["no acceptance", `${BODY("Brenna")} ${FULL_OATH("Brenna")}`],
    ["silence is not acceptance", `${BODY("Brenna")} ${FULL_OATH("Brenna")}\n\nNicco says nothing and looks away.`],
    ["coerced", `${BODY("Brenna")} Held at sword point and threatened, she is forced to say: ${FULL_OATH("Brenna")}\n\n${ACCEPT}`],
    ["unconscious", `Brenna lies unconscious, barefoot against the stone. Nicco speaks for her: ${FULL_OATH("Brenna")}\n\n${ACCEPT}`],
    ["vague oath", `${BODY("Brenna")} "I like it here. I may stay."\n\n${ACCEPT}`],
    ["magically compelled", `${BODY("Brenna")} Under a magical compulsion she recites: ${FULL_OATH("Brenna")}\n\n${ACCEPT}`],
  ];
  for (const [label, narration] of cases) { const r = await attempt("Brenna", narration); try { unchanged(r); } catch (e) { throw new Error(`${label}: ${(e as Error).message}`); } }
});
test("R6: entering Heartstone, being called family, or going barefoot alone does not promote", async () => {
  for (const narration of [
    `Brenna steps inside Heartstone and looks around. "It is warm in here."`,
    `Brenna smiles. "You are like family to me, Nicco." She sets her boots by the door and pads barefoot across the stone.`,
    `Brenna sleeps in the guest bed beside the hearth. Nicco carries her blanket in. "Stay as long as you need."`,
    `Brenna kisses Nicco. "I love you." She stands barefoot on the stone floor.`,
  ]) unchanged(await attempt("Brenna", narration));
});
test("R6b: the rite does not count outside Heartstone, with worn footwear, or without stone contact", async () => {
  unchanged(await attempt("Brenna", RITE("Brenna"), { where: "calderan_slave_market" }));
  unchanged(await attempt("Brenna", RITE("Brenna"), { boots: true }));
  unchanged(await attempt("Brenna", `Brenna stands barefoot on a thick wool rug. ${FULL_OATH("Brenna")}\n\n${ACCEPT}`));
});
test("R7/R8: leaving the room or the household never demotes; the promotion record and the read model keep it", async () => {
  const r = await attempt("Brenna", RITE("Brenna")), c = r.c;
  c.apply({ expected_revision: c.revision, commands: [{ kind: "move_character", character_id: r.id, location_id: "calderan_slave_market" }] });
  assert.equal(isNpcPlus(c.exportSnapshot(), r.id), true); assert.deepEqual(memberIds(c), [r.id]);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "leave_household", household_id: OPENING_HOUSEHOLD, character_id: r.id }] });
  assert.deepEqual(memberIds(c), []); assert.equal(isNpcPlus(c.exportSnapshot(), r.id), true, "promotion is distinct from membership and is not reversed");
  const view = deriveSessionView(world, c.exportSnapshot(), { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  assert.deepEqual(view.promoted.map(p => [p.name, p.household_member]), [["Brenna", false]]);
});
test("R9/R10/R13: existing NPC+ systems recognize the character, with no second NPC+ truth; the view exposes both without ids", async () => {
  const r = await attempt("Brenna", RITE("Brenna")), snap = r.c.exportSnapshot();
  assert.ok(snap.premium_characters.some(p => p.character_id === r.id), "the one premium record");
  assert.ok(!JSON.stringify(snap.characters).includes("npc_plus"), "no promotion flag on the character record");
  assert.ok(!JSON.stringify(snap.households).includes("npc_plus"));
  const view = deriveSessionView(world, snap, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  const brenna = JSON.stringify(view).includes("Brenna");
  assert.ok(brenna); assert.deepEqual(view.promoted, [{ name: "Brenna", household_member: true }]);
  assert.ok(!JSON.stringify(view.promoted).includes("campaign_character"), "no ids exposed");
});
test("R11/R12/R14/R15: a Maren-like candidate (a different name and a natural variation) works with nothing hard-coded", async () => {
  const oath = `"I, Maren, have decided to stay and join the Heartstone as part of its family. I promise to protect the family and to stand beside the Keeper, faithfully."`;
  const r = await attempt("Maren", `Maren kneels barefoot with one palm flat on the stone wall. ${oath}\n\nNicco nods slowly. "I accept you as a member of the Heartstone."`, { quote: "I, Maren, have decided to stay and join the Heartstone as part of its family." });
  assert.equal(r.run.diagnostic.verdict, "committed", JSON.stringify(r.run.diagnostic.rejected));
  assert.deepEqual(memberIds(r.c), [r.id]); assert.equal(isNpcPlus(r.c.exportSnapshot(), r.id), true);
});

// ---------------------------------------------------------------------------------------------- C: canon
test("C1/C2/C3: the charter exposes exactly the three canonical rules and the canonical oath, with no extra rule", () => {
  assert.deepEqual([...HEARTSTONE_HOUSEHOLD_RULES], ["No lies or secrets within the family.", "Protect the family.", "Barefoot inside. Shoes outside."]);
  assert.ok(HEARTSTONE_CANONICAL_OATH.join(" ").includes("choose to stay and become a member of the Heartstone"));
  assert.equal(openingOathText("Brenna").includes("I, Brenna, choose"), true);
  const charter = world.getEntity("heartstone_household_charter")!;
  assert.equal([...charter.content.matchAll(/\b[123]\. /g)].length, 3);
});
test("C4/C5/C6: canonical oath and natural variations are accepted; vague statements fail; display text is separate from matching", () => {
  assert.deepEqual(oathMissing([`I, Brenna, choose to stay and become a member of the Heartstone. I swear to be loyal to and protect my family, and to stand faithfully beside the Keeper.`]), []);
  assert.deepEqual(oathMissing([`It is my own choice: I will stay and join the Heartstone as family. I pledge to protect my family and stand beside the Keeper, faithfully.`]), []);
  for (const vague of ["I like it here.", "I may stay.", "You are like family.", "I'll help you.", "I choose to stay and I swear to protect my family."]) assert.ok(oathMissing([vague]).length > 0, vague);
  assert.ok(oathMissing([`I swear to protect my family and stand faithfully beside the Keeper.`]).length > 0, "no personal choice / stay");
});
test("C7/C8/C9/C10: voluntary oath, explicit Keeper acceptance and bare-skin stone contact are all required; any pose works", async () => {
  const poses = [`Brenna stands barefoot, her bare feet on the stone floor.`, `Brenna sits barefoot with one hand flat against the stone wall.`, `Brenna leans a bare foot against the stone wall.`];
  for (const pose of poses) { const r = await attempt("Brenna", `${pose} ${FULL_OATH("Brenna")}\n\n${ACCEPT}`); assert.equal(r.run.diagnostic.verdict, "committed", pose); }
  unchanged(await attempt("Brenna", `${BODY("Brenna")} ${FULL_OATH("Brenna")}`));
});
test("C11/C12: the rite creates no love or obedience, no loyalty enforcement, no punishment, and rules are social not magical", async () => {
  const r = await attempt("Brenna", RITE("Brenna"));
  assert.deepEqual(r.c.exportSnapshot().relationships, [], "no relationship is created by the rite itself");
  assert.deepEqual(r.c.exportSnapshot().legal_statuses, [], "no legal or compulsion state either");
  const lore = world.getEntity("heartstone_household_charter")!.content;
  assert.match(lore, /not supernatural commands|no magical punishment/i); assert.match(lore, /voluntary promise/i);
});
test("C14/C15: the full wording is retrievable on inspection but is not injected into every turn", async () => {
  const seen: GenerationRequest[] = [], service = new RetrievalService(world);
  const c = candidate("Brenna");
  const co = new TurnCoordinator(world, { async generate() { throw new Error("x"); }, async *stream(req) { seen.push(req); yield { type: "text_delta", text: "Brenna nods." }; yield { type: "completed", result: { text: "Brenna nods.", ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  await collect(co.runTurn({ campaign: c, player_input: "*pours tea*" }));
  const prompt = seen.at(-1)!.messages[0]!.content;
  assert.ok(!prompt.includes("choose to stay and become a member"), "oath is not in the ordinary prompt");
  assert.ok(!prompt.includes("Natural variation"), "rite instructions are not in the ordinary prompt");
  await collect(co.runTurn({ campaign: c, player_input: "*reads the Heartstone Household Charter: what is the household rite and the oath?*" }));
  const inspected = seen.at(-1)!.messages[0]!.content;
  assert.ok(/become a member of the Heartstone/.test(inspected) && /Keeper/.test(inspected), "on inspection the wording is retrievable");
});

// ---------------------------------------------------------------------------------------------- D: opening documents
test("D1-D5/D7: exactly one deed and one charter exist from initialization, owned and carried by Nicco, with the household rules seeded", () => {
  const c = createOpeningCampaign(world, "d_docs"), s = c.exportSnapshot();
  for (const doc of [HEARTSTONE_DEED_ITEM, HEARTSTONE_CHARTER_ITEM]) {
    const items = s.items.filter(i => i.id === doc.id); assert.equal(items.length, 1);
    assert.equal(items[0]!.owner_id, "nicco"); assert.deepEqual(items[0]!.position, { kind: "carried", character_id: "nicco" }); assert.equal(items[0]!.category, "document");
  }
  assert.equal(s.items.length, 2);
  assert.deepEqual(s.households[0]!.rules!.map(r => r.text), [...HEARTSTONE_HOUSEHOLD_RULES]);
  assert.equal(s.revision, 1);
});
test("D6: save/load keeps the documents without duplication; a second initialization is a fresh, equal state", () => {
  const c = createOpeningCampaign(world, "d_save"), restored = roundTrip(c);
  assert.deepEqual(restored.exportSnapshot().items, c.exportSnapshot().items);
  assert.equal(restored.exportSnapshot().items.length, 2);
  assert.equal(createOpeningCampaign(world, "d_other").exportSnapshot().items.length, 2);
});
test("D8: handing the deed over changes possession only, never the deed's legal text or ownership field", () => {
  const c = createOpeningCampaign(world, "d_hand");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }, { kind: "register_character", character: { id: "campaign_character_clerk", origin: { kind: "created" }, profile: { name: "Clerk", age: { kind: "exact", years: 40 } }, current: { current_location: "heartstone_lr", status: "active" } } },
    { kind: "transfer_item", mode: "handoff", item_id: HEARTSTONE_DEED_ITEM.id, position: { kind: "carried", character_id: "campaign_character_clerk" } }] });
  const deed = c.exportSnapshot().items.find(i => i.id === HEARTSTONE_DEED_ITEM.id)!;
  assert.deepEqual(deed.position, { kind: "carried", character_id: "campaign_character_clerk" }); assert.equal(deed.owner_id, "nicco");
  assert.match(world.getEntity("heartstone_deed_of_ownership")!.content, /changes who holds the paper, not who owns/i);
});
test("D9/D10: the charter lore lists rules, rite and oath; the deed lore is a genuine, challengeable deed; default item context stays compact", () => {
  const charter = world.getEntity("heartstone_household_charter")!.content;
  for (const text of HEARTSTONE_HOUSEHOLD_RULES) assert.ok(charter.includes(text));
  assert.ok(charter.includes("choose to stay and become a member of the Heartstone"));
  const deed = world.getEntity("heartstone_deed_of_ownership")!.content;
  assert.match(deed, /valid/i); assert.match(deed, /challeng/i);
  assert.ok(HEARTSTONE_CHARTER_ITEM.description.length < 200 && HEARTSTONE_DEED_ITEM.description.length < 200);
});

// ---------------------------------------------------------------------------------------------- T: stone warmth (derived)
const snapshotWith = (c: CampaignState) => c.exportSnapshot();
test("T1/T2/T3/T4: the Keeper and active members feel gentle warmth through bare skin; unrecognized people and pre-rite candidates feel ordinary stone", async () => {
  const r0 = candidate("Brenna"), id = idOf("Brenna");
  assert.equal(stoneFeel(snapshotWith(r0), world, "nicco", "heartstone_lr", "bare_skin"), "gentle_warmth");
  assert.equal(stoneFeel(snapshotWith(r0), world, id, "heartstone_lr", "bare_skin"), "ordinary_stone", "before the rite");
  const r = await attempt("Brenna", RITE("Brenna"));
  assert.equal(stoneFeel(snapshotWith(r.c), world, r.id, "heartstone_lr", "bare_skin"), "gentle_warmth", "immediately after the rite");
  assert.equal(stoneFeel(snapshotWith(r.c), world, "campaign_character_stranger", "heartstone_lr", "bare_skin"), "ordinary_stone");
});
test("T5: nothing about the warmth is stored per character; save/load derives the same answer", async () => {
  const r = await attempt("Brenna", RITE("Brenna")), restored = roundTrip(r.c);
  assert.equal(stoneFeel(snapshotWith(restored), world, r.id, "heartstone_lr", "bare_skin"), "gentle_warmth");
  assert.ok(!/warm/i.test(JSON.stringify(restored.exportSnapshot().characters)) && !/warm_floor|stone_warm/i.test(JSON.stringify(restored.exportSnapshot())));
});
test("T6/T7: shoes alone or merely entering give no warmth; the stone is only 'warm' inside Heartstone's interior", async () => {
  const r = await attempt("Brenna", RITE("Brenna"));
  assert.equal(stoneFeel(snapshotWith(r.c), world, r.id, "heartstone_lr", "shod_or_none"), "ordinary_stone");
  assert.equal(stoneFeel(snapshotWith(r.c), world, r.id, "calderan_slave_market", "bare_skin"), "ordinary_stone");
  assert.equal(insideHeartstoneInterior(world, "heartstone_lr"), true); assert.equal(insideHeartstoneInterior(world, "calderan_slave_market"), false);
  assert.equal(recognizedByHeartstone(snapshotWith(candidate("Brenna")), idOf("Brenna")), false, "entering alone recognizes nobody");
});
test("T8: inactive membership removes recognition immediately; the promotion stays", async () => {
  const r = await attempt("Brenna", RITE("Brenna"));
  r.c.apply({ expected_revision: r.c.revision, commands: [{ kind: "leave_household", household_id: OPENING_HOUSEHOLD, character_id: r.id }] });
  assert.equal(stoneFeel(snapshotWith(r.c), world, r.id, "heartstone_lr", "bare_skin"), "ordinary_stone");
  assert.equal(isNpcPlus(snapshotWith(r.c), r.id), true);
});
test("T9/T10: the narrator receives the compact recognition lore only inside Heartstone, with no sentience, healing or hot/cold canon", async () => {
  const run = async (campaign: CampaignState) => {
    const seen: GenerationRequest[] = [], service = new RetrievalService(world);
    const co = new TurnCoordinator(world, { async generate() { throw new Error("x"); }, async *stream(req) { seen.push(req); yield { type: "text_delta", text: "Quiet." }; yield { type: "completed", result: { text: "Quiet.", ...metadata } }; } },
      { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
    await collect(co.runTurn({ campaign, player_input: "*looks around*" })); return seen.at(-1)!.messages[0]!.content;
  };
  assert.ok((await run(candidate("Brenna"))).includes(HEARTSTONE_STONE_LINE), "inside");
  assert.ok(!(await run(candidate("Brenna", "calderan_slave_market"))).includes("Heartstone stone:"), "outside");
  assert.match(HEARTSTONE_STONE_LINE, /not healing, no sentience/); assert.match(HEARTSTONE_STONE_LINE, /ordinary stone at its real temperature/);
  assert.ok(!/cold to outsiders|outsiders are cold/i.test(HEARTSTONE_STONE_LINE));
  assert.ok(HEARTSTONE_STONE_LINE.length < 420, "compact");
});
