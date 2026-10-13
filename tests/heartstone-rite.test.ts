import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { isNpcPlus } from "../src/campaign/premium-characters.js";
import { HEARTSTONE_HOUSEHOLD_RULES, HEARTSTONE_CANONICAL_OATH, HEARTSTONE_DEED_ITEM, HEARTSTONE_CHARTER_ITEM, openingOathText } from "../src/campaign/heartstone-charter.js";
import { recognizedByHeartstone, stoneFeel, insideHeartstoneInterior } from "../src/campaign/heartstone-recognition.js";
import { HEARTSTONE_STONE_LINE } from "../src/turn/context/scene-state-render.js";
import { heartstoneRiteCommands } from "../src/campaign/heartstone-rite.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Heartstone canon (the in-world rite text), the two opening documents and the derived stone-warmth recognition (C, D, T). The rite itself
 * completes only through the player's explicit confirmation (see tests/explicit-npc-plus-promotion.test.ts). Offline: no provider is called.
 */
const world = await loadWorld("data");
const idOf = (name: string) => `campaign_character_${name.toLowerCase()}`;
let serial = 0;
function candidate(name: string, where = "heartstone_lr", boots = false): CampaignState {
  const c = createOpeningCampaign(world, `rite_${name.toLowerCase()}_${++serial}`), id = idOf(name);
  const commands: CampaignCommand[] = [{ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 26 } }, current: { current_location: where, status: "active" } } },
    { kind: "runtime_delta", delta: { player_location: where } }];
  if (boots) commands.push({ kind: "register_item", item: { id: `campaign_item_${name.toLowerCase()}_boots`, origin: { kind: "created" }, name: "Boots", owner_id: id, position: { kind: "equipped", character_id: id, slot: "feet", mode: "worn" } } });
  c.apply({ expected_revision: c.revision, commands });
  return c;
}
/** The explicit player confirmation (the only mechanical authority for the rite): one eligible join, promotion derived in the same revision. */
function promoted(name: string, where = "heartstone_lr") {
  const c = candidate(name, where), id = idOf(name), rite = heartstoneRiteCommands(world, c.exportSnapshot(), id);
  assert.ok(rite.ok, rite.ok ? "" : rite.reason);
  c.commit(c.prepare({ expected_revision: c.revision, commands: [...rite.commands] }));
  return { c, id };
}
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-10T12:00:00.000Z"), world), world).snapshot);

// ---------------------------------------------------------------------------------------------- C: canon
test("C1/C2/C3: the charter exposes exactly the three canonical rules and the canonical oath, with no extra rule", () => {
  assert.deepEqual([...HEARTSTONE_HOUSEHOLD_RULES], ["No lies or secrets within the family.", "Protect the family.", "Barefoot inside. Shoes outside."]);
  assert.ok(HEARTSTONE_CANONICAL_OATH.join(" ").includes("choose to stay and become a member of the Heartstone"));
  assert.equal(openingOathText("Brenna").includes("I, Brenna, choose"), true);
  const charter = world.getEntity("heartstone_household_charter")!;
  assert.equal([...charter.content.matchAll(/\b[123]\. /g)].length, 3);
});
test("C11/C12: the rite creates no love or obedience, no loyalty enforcement, no punishment, and rules are social not magical", () => {
  const r = promoted("Brenna");
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
test("T1/T2/T3/T4: the Keeper and active members feel gentle warmth through bare skin; unrecognized people and pre-rite candidates feel ordinary stone", () => {
  const r0 = candidate("Brenna"), id = idOf("Brenna");
  assert.equal(stoneFeel(snapshotWith(r0), world, "nicco", "heartstone_lr", "bare_skin"), "gentle_warmth");
  assert.equal(stoneFeel(snapshotWith(r0), world, id, "heartstone_lr", "bare_skin"), "ordinary_stone", "before the rite");
  const r = promoted("Brenna");
  assert.equal(stoneFeel(snapshotWith(r.c), world, r.id, "heartstone_lr", "bare_skin"), "gentle_warmth", "immediately after the rite");
  assert.equal(stoneFeel(snapshotWith(r.c), world, "campaign_character_stranger", "heartstone_lr", "bare_skin"), "ordinary_stone");
});
test("T5: nothing about the warmth is stored per character; save/load derives the same answer", () => {
  const r = promoted("Brenna"), restored = roundTrip(r.c);
  assert.equal(stoneFeel(snapshotWith(restored), world, r.id, "heartstone_lr", "bare_skin"), "gentle_warmth");
  assert.ok(!/warm/i.test(JSON.stringify(restored.exportSnapshot().characters)) && !/warm_floor|stone_warm/i.test(JSON.stringify(restored.exportSnapshot())));
});
test("T6/T7: shoes alone or merely entering give no warmth; the stone is only 'warm' inside Heartstone's interior", () => {
  const r = promoted("Brenna");
  assert.equal(stoneFeel(snapshotWith(r.c), world, r.id, "heartstone_lr", "shod_or_none"), "ordinary_stone");
  assert.equal(stoneFeel(snapshotWith(r.c), world, r.id, "calderan_slave_market", "bare_skin"), "ordinary_stone");
  assert.equal(insideHeartstoneInterior(world, "heartstone_lr"), true); assert.equal(insideHeartstoneInterior(world, "calderan_slave_market"), false);
  assert.equal(recognizedByHeartstone(snapshotWith(candidate("Brenna")), idOf("Brenna")), false, "entering alone recognizes nobody");
});
test("T8: inactive membership removes recognition immediately; the promotion stays", () => {
  const r = promoted("Brenna");
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
