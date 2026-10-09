import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, ItemTransferMode } from "../src/campaign/types.js";
import { carriesItem, equipsItem, hasItem, inventoryItems, itemAt, ownsItem } from "../src/campaign/inventory.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { parseControllerProposal } from "../src/llm/controller-schema.js";
import { CONTROLLER_POLICY } from "../src/llm/openrouter/state-controller.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { authorizeWithEvidence } from "../src/turn/evidence-authorization.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { metadata, mockNarrator } from "./turn-fixtures.js";
import { ItemSpriteJobs } from "../src/app/item-sprite-jobs.js";

const ID = "campaign_item_00000001";
const apply = (campaign: CampaignState, ...commands: CampaignCommand[]) => campaign.apply({ expected_revision: campaign.revision, commands });
const transfer = (mode: ItemTransferMode, recipient: string): Extract<CampaignCommand, {kind:"transfer_item"}> => ({ kind: "transfer_item", mode, item_id: ID, position: { kind: "carried", character_id: recipient } });
function fixture(owner: string | null | undefined = "nicco", holder = "nicco", name = "Silver Knife") {
  const f = turnFixture();
  apply(f.campaign, { kind: "create_item", name, description: "A plain silver knife.", visual_description: "Plain silver blade, dark wooden handle.", category: "weapon", ...(owner !== undefined ? { owner_id: owner } : {}), position: { kind: "carried", character_id: holder } });
  apply(f.campaign, { kind: "set_item_sprite", item_id: ID, sprite: { status: "pending" } }, { kind: "set_item_sprite", item_id: ID, sprite: { status: "ready", asset_ref: "portrait_item_fixture.png", generated_from_visual_description: "Plain silver blade, dark wooden handle." } });
  return { ...f, item: () => f.campaign.exportSnapshot().items.find(i => i.id === ID)! };
}
for (const [mode, owner, holder, recipient, finalOwner] of [
  ["gift", "nicco", "nicco", "brenna", "brenna"], ["handoff", "nicco", "nicco", "brenna", "nicco"],
  ["lend", "nicco", "nicco", "brenna", "nicco"], ["return", "nicco", "brenna", "nicco", "nicco"],
  ["steal", "brenna", "brenna", "nicco", "brenna"], ["reclaim", "brenna", "nicco", "brenna", "brenna"],
  ["take", "brenna", "brenna", "nicco", "brenna"],
] as const) test(`transfer ${mode}: atomic position/owner, predicates, visuals and save roundtrip`, () => {
  const f = fixture(owner, holder), before = f.item(), revision = f.campaign.revision, total = f.campaign.exportSnapshot().items.length;
  apply(f.campaign, transfer(mode, recipient)); const after = f.item(), s = f.campaign.exportSnapshot();
  assert.equal(f.campaign.revision, revision + 1); assert.equal(after.owner_id, finalOwner);
  assert.deepEqual(after.position, { kind: "carried", character_id: recipient });
  assert.deepEqual({ ...after, owner_id: undefined, position: undefined }, { ...before, owner_id: undefined, position: undefined });
  assert.equal(s.items.length, total); assert.equal(s.items.filter(i => i.id === ID).length, 1);
  assert.equal(hasItem(s, recipient, ID), true); assert.equal(carriesItem(s, recipient, ID), true); assert.equal(equipsItem(s, recipient, ID), false);
  assert.equal(ownsItem(s, finalOwner, ID), true); assert.equal(ownsItem(s, recipient, ID), finalOwner === recipient);
  assert.equal(hasItem(s, holder, ID), false); assert.equal(itemAt(s, ID, "test_room"), false);
  assert.ok(inventoryItems(s, recipient).some(i => i.id === ID)); assert.ok(!inventoryItems(s, holder).some(i => i.id === ID));
  const loaded = decodeSave(serializeSave(createSaveFile(s, f.world, "2026-10-10T12:00:00.000Z"), f.world), f.world).snapshot;
  assert.equal(loaded.schema_version, 6); assert.deepEqual(loaded.items.find(i => i.id === ID), after);
});
for (const [mode, owner, holder, recipient] of [
  ["gift", "brenna", "nicco", "maren"], ["lend", "brenna", "nicco", "maren"],
  ["return", "nicco", "brenna", "maren"], ["reclaim", "brenna", "maren", "nicco"],
  ["handoff", "nicco", "nicco", "nicco"], ["take", "nicco", "nicco", "remote_npc"],
  ["take", "nicco", "nicco", "unknown_person"], ["take", "brenna", "remote_npc", "nicco"],
] as const) test(`invalid transfer ${mode} ${holder}->${recipient}: no mutation/revision`, () => {
  const f = fixture(owner, holder), before = f.campaign.exportSnapshot();
  assert.throws(() => apply(f.campaign, transfer(mode, recipient))); assert.equal(f.campaign.exportSnapshot(), before);
});
test("unknown/unowned owners stay distinct; gift/lend/return/reclaim cannot fabricate title", () => {
  for (const owner of [null, undefined]) for (const mode of ["handoff", "steal", "take"] as const) {
    const f = fixture(); const s = structuredClone(f.campaign.exportSnapshot()) as import("../src/campaign/types.js").CampaignSnapshot;
    const it = s.items.find(i => i.id === ID)!; if (owner === undefined) delete it.owner_id; else it.owner_id = owner;
    const restored = CampaignState.restore(f.world, s); apply(restored, transfer(mode, "brenna"));
    const item = restored.exportSnapshot().items.find(i => i.id === ID)!;
    assert.equal(item.owner_id, owner); assert.equal(Object.hasOwn(item, "owner_id"), owner !== undefined);
    for (const bad of ["gift", "lend", "return", "reclaim"] as const) assert.throws(() => apply(restored, transfer(bad, "nicco")));
  }
});
test("equipped source loses its slot; stored source rejected; place pickup works", () => {
  const f = fixture("brenna", "brenna");
  apply(f.campaign, { kind: "place_item", item_id: ID, position: { kind: "equipped", character_id: "brenna", slot: "neck", mode: "worn" } });
  apply(f.campaign, transfer("handoff", "nicco")); assert.deepEqual(f.item().position, { kind: "carried", character_id: "nicco" });
  assert.ok(f.campaign.exportSnapshot().characters.find(c => c.id === "brenna")?.current.empty_slots?.includes("neck"));
  apply(f.campaign, { kind: "place_item", item_id: ID, position: { kind: "stored", location_id: "test_room" } });
  const before = f.campaign.exportSnapshot(); assert.throws(() => apply(f.campaign, transfer("take", "nicco"))); assert.equal(f.campaign.exportSnapshot(), before);
  apply(f.campaign, { kind: "place_item", item_id: ID, position: { kind: "carried", character_id: "nicco" } }); assert.equal(f.item().owner_id, "brenna");
  assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [{ ...transfer("gift", "brenna"), position: { kind: "equipped", character_id: "brenna", slot: "neck", mode: "worn" } }] })));
});
test("stale and late-invalid gift batches remain atomic", () => {
  const f = fixture(), before = f.campaign.exportSnapshot();
  assert.throws(() => f.campaign.apply({ expected_revision: before.revision - 1, commands: [transfer("gift", "brenna")] })); assert.equal(f.campaign.exportSnapshot(), before);
  assert.throws(() => apply(f.campaign, transfer("gift", "brenna"), transfer("gift", "missing"))); assert.equal(f.campaign.exportSnapshot(), before);
});
test("authored NPC, campaign NPC and NPC+ use the same transfer table; ready sprite never queues", async () => {
  const f = fixture(); const tomas = "campaign_character_tomas";
  apply(f.campaign, { kind: "register_character", character: { id: tomas, origin: { kind: "created" }, profile: { name: "Tomas" }, current: { current_location: "test_room" } } },
    { kind: "create_household", id: "campaign_household_test", name: "Test" }, { kind: "set_membership", household_id: "campaign_household_test", membership: { character_id: "nicco", role: "owner", status: "member" } },
    { kind: "set_membership", household_id: "campaign_household_test", membership: { character_id: "maren", status: "member" } });
  assert.ok(f.campaign.exportSnapshot().premium_characters.some(c => c.character_id === "maren"));
  const jobs = new ItemSpriteJobs(f.campaign, {}), before = f.item().sprite;
  for (const who of ["brenna", tomas, "maren"]) {
    apply(f.campaign, transfer("lend", who)); apply(f.campaign, transfer("return", "nicco"));
    assert.equal(jobs.request(ID), false); jobs.resumeInterrupted(); await jobs.settled(); assert.deepEqual(f.item().sprite, before);
  }
});
test("Controller schema requires mode and forbids owner/source injection; policy materializes current truth", () => {
  assert.deepEqual(parseControllerProposal(JSON.stringify({ commands: [transfer("handoff", "brenna")] })), [transfer("handoff", "brenna")]);
  for (const extra of [{ owner_id: "brenna" }, { from_character_id: "nicco" }, { mode: "sale" }]) assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [{ ...transfer("gift", "brenna"), ...extra }] })));
  const { mode: _mode, ...legacy } = transfer("gift", "brenna"); assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [legacy] })));
  assert.match(CONTROLLER_POLICY, /Possession is not ownership/); assert.match(CONTROLLER_POLICY, /new loan\/theft retains source ownership/);
});
for (const [input, narration, mode, owner, holder, to, allowed] of [
  ["I give Brenna the silver knife as a gift.", "Brenna accepts the silver knife from Nicco as a gift.", "gift", "nicco", "nicco", "brenna", true],
  ["I give Brenna the silver knife to read.", "Brenna accepts the silver knife from Nicco to hold for him.", "handoff", "nicco", "nicco", "brenna", true],
  ["I offer Brenna the silver knife as a gift.", "Brenna refuses the silver knife and Nicco keeps it.", "gift", "nicco", "nicco", "brenna", false],
  ["I steal Brenna's silver knife.", "Nicco fails to steal the silver knife from Brenna.", "steal", "brenna", "brenna", "nicco", false],
  ["I take Brenna's silver knife.", "Nicco steals the silver knife from Brenna and pockets it.", "steal", "brenna", "brenna", "nicco", true],
  ["I give Maren the silver knife as a present.", "Maren accepts the silver knife from Nicco.", "gift", "brenna", "nicco", "maren", false],
] as const) test(`evidence/completion: ${input} / ${allowed}`, () => {
  const f = fixture(owner, holder), s = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, s);
  const intent = playerIntent(input, context, s, f.world), evidence = deriveTurnEvidence(intent, narration, context);
  const d = authorizeWithEvidence([transfer(mode, to)], [narration], evidence, narration, context, s, "hybrid", f.world)[0]!;
  assert.equal(d.authorized, allowed, JSON.stringify(d));
});
test("newly materialized gift/loan/theft retain required descriptions and correct current owner", async () => {
  for (const [mode, owner] of [["gift", "nicco"], ["loan", "brenna"], ["theft", "brenna"]] as const) {
    const f = turnFixture(), service = new RetrievalService(f.world), narration = mode === "gift" ? "Brenna gives Nicco her old key as a gift; Nicco accepts the key." : mode === "loan" ? "Brenna lends her old key to Nicco, who takes the key." : "Nicco steals Brenna's old key and pockets the key.";
    const create: CampaignCommand = { kind: "create_item", name: "Old key", description: "An old iron key.", visual_description: "Plain worn iron key.", category: "tool", owner_id: owner, position: { kind: "carried", character_id: "nicco" } };
    const co = new TurnCoordinator(f.world, mockNarrator(narration), { async propose() { return { commands: [create], evidence: [narration], ...metadata }; } }, { service, search: new HybridSearch(service) });
    for await (const _event of co.runTurn({ campaign: f.campaign, player_input: "I take the key." })) { /* drain */ }
    const item = f.campaign.exportSnapshot().items.find(i => i.name === "Old key")!; assert.ok(item); assert.equal(item.owner_id, owner); assert.deepEqual(item.position, create.position);
    assert.equal(item.description, create.description); assert.equal(item.visual_description, create.visual_description);
  }
});

for (const [owner, holder, to, mode, input, narration, quote, allowed] of [
  ["nicco", "nicco", "brenna", "handoff", "I hand Brenna the silver knife.", "Brenna accepts the silver knife from Nicco. Ownership is unchanged.", "Brenna accepts the silver knife from Nicco.", true],
  ["nicco", "nicco", "brenna", "gift", "I hand Brenna the silver knife.", "Brenna accepts the silver knife from Nicco.", "Brenna accepts the silver knife from Nicco.", false],
  ["nicco", "nicco", "brenna", "lend", "I hand Brenna the silver knife.", "Brenna accepts the silver knife from Nicco. Brenna refuses the silver knife and Nicco keeps it.", "Brenna accepts the silver knife from Nicco.", false],
  ["brenna", "brenna", "maren", "handoff", "I watch Brenna.", "Brenna hands the silver knife to Maren, who accepts it.", "Brenna hands the silver knife to Maren, who accepts it.", true],
] as const) test(`transfer evidence scope ${mode} ${holder}->${to} allowed=${allowed}: ${narration}`, () => {
  const f = fixture(owner, holder), snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  const evidence = deriveTurnEvidence(playerIntent(input, context, snapshot, f.world), narration, context);
  const d = authorizeWithEvidence([transfer(mode, to)], [quote], evidence, narration, context, snapshot, "hybrid", f.world)[0]!;
  assert.equal(d.authorized, allowed, JSON.stringify(d));
});

test("Controller place_item cannot bypass an explicit character-to-character transfer", () => {
  const f = fixture(), snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  const narration = "Brenna accepts the silver knife from Nicco.";
  const evidence = deriveTurnEvidence(playerIntent("I hand Brenna the silver knife.", context, snapshot, f.world), narration, context);
  const command: CampaignCommand = { kind: "place_item", item_id: ID, position: { kind: "carried", character_id: "brenna" } };
  assert.equal(authorizeWithEvidence([command], [narration], evidence, narration, context, snapshot, "hybrid", f.world)[0]!.authorized, false);
});

// Exact quote and proposal from the bounded live failure. No provider call or retry.
test("live Return regression: giver-led returns quote authorizes and commits unchanged ownership", async () => {
  const f = fixture("nicco", "brenna", "Sword"), service = new RetrievalService(f.world);
  const narration = "Brenna returns Nicco's sword to Nicco. Nicco takes the sword back from Brenna and carries it.";
  const quote = "Brenna returns Nicco's sword to Nicco.", command = transfer("return", "nicco"), before = f.campaign.revision;
  const coordinator = new TurnCoordinator(f.world, mockNarrator(narration), { async propose() { return { commands: [command], evidence: [quote], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const events = []; for await (const e of coordinator.runTurn({ campaign: f.campaign, player_input: "I accept my sword back from Brenna." })) events.push(e);
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed");
  if (last.type === "turn_completed") assert.equal(last.result.authorization[0]!.authorized, true);
  assert.equal(f.campaign.revision, before + 1); assert.equal(f.item().owner_id, "nicco"); assert.deepEqual(f.item().position, { kind: "carried", character_id: "nicco" });
});
for (const narration of ["Brenna does not return Nicco's sword to Nicco.", "Brenna tries to return Nicco's sword to Nicco.", "Brenna will return Nicco's sword to Nicco.", "Brenna returns Nicco's sword toward Nicco."]) test(`return quote still needs completed receipt: ${narration}`, () => {
  const f = fixture("nicco", "brenna", "Sword"), snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  const evidence = deriveTurnEvidence(playerIntent("I accept my sword back from Brenna.", context, snapshot, f.world), narration, context);
  assert.equal(authorizeWithEvidence([transfer("return", "nicco")], [narration], evidence, narration, context, snapshot, "hybrid", f.world)[0]!.authorized, false);
});
