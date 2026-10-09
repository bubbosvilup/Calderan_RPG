import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import { CampaignState as State } from "../src/campaign/campaign-state.js";
import { parseCampaignProposal } from "../src/campaign/validation.js";
import { ENGINE_ITEM_ID, formatItemId } from "../src/campaign/items.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { authorizeCommands } from "../src/turn/command-authorizer.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { narratorCarriedLines, narratorItemView } from "../src/turn/item-projection.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { parseControllerProposal } from "../src/llm/controller-schema.js";
import { CONTROLLER_POLICY } from "../src/llm/openrouter/state-controller.js";
import { createSaveFile, decodeSave, decodeSaveWithReport, serializeSave } from "../src/persistence/save-format.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Item Domain V1: persistent item instances with engine-allocated identity, ownership independent of physical position, one
 * discriminated position, atomic allocation, save/load + migration, controller materialization through evidence authorization.
 */
const create = (fields: Partial<Extract<CampaignCommand, { kind: "create_item" }>> = {}): CampaignCommand =>
  ({ kind: "create_item", name: "Silver knife", position: { kind: "carried", character_id: "nicco" }, ...fields }) as CampaignCommand;
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const engineItems = (c: CampaignState) => c.exportSnapshot().items.filter(i => ENGINE_ITEM_ID.test(i.id));
const frozen = (c: CampaignState) => JSON.stringify(c.exportSnapshot());

test("C/D/L: the engine allocates sequential IDs; the proposal cannot name one; unknown owner stays unset", () => {
  const { campaign } = turnFixture();
  assert.equal(campaign.exportSnapshot().next_item_sequence, 1);
  const r0 = campaign.revision;
  apply(campaign, create());
  apply(campaign, create({ name: "Red leather journal", category: "document", position: { kind: "stored", location_id: "test_room" } }));
  const [a, b] = engineItems(campaign);
  assert.deepEqual([a!.id, b!.id], ["campaign_item_00000001", "campaign_item_00000002"]); assert.equal(formatItemId(41), "campaign_item_00000041");
  assert.equal(campaign.exportSnapshot().next_item_sequence, 3);
  assert.deepEqual([a!.created_revision, b!.created_revision], [r0 + 1, r0 + 2]);
  assert.deepEqual(a, { id: "campaign_item_00000001", origin: { kind: "created" }, name: "Silver knife", position: { kind: "carried", character_id: "nicco" }, created_revision: r0 + 1 });
  assert.equal(Object.hasOwn(a!, "owner_id"), false, "unknown ownership is omitted, never guessed");
  // C: there is no id field in the command vocabulary, so a proposer cannot choose the ID (unknown key) ...
  assert.throws(() => parseCampaignProposal({ expected_revision: 0, commands: [{ ...create(), id: "campaign_item_00000099" }] }));
  assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [{ ...create({ description: "d", category: "weapon" }), id: "campaign_item_00000099" }] })));
  // ... and the engine namespace is closed to register_item.
  assert.throws(() => apply(campaign, { kind: "register_item", item: { id: "campaign_item_00000003", origin: { kind: "created" }, name: "Forged", position: { kind: "unknown" } } }), /allocated by the engine/);
  assert.equal(campaign.exportSnapshot().next_item_sequence, 3);
});

test("E/F/O + stale revision: rejected, failed-batch, stale and no-op proposals consume no ID and no revision", () => {
  const { campaign } = turnFixture();
  apply(campaign, create());
  const before = frozen(campaign), revision = campaign.revision;
  // E: invalid reference (unknown holder / location / owner).
  assert.throws(() => apply(campaign, create({ position: { kind: "carried", character_id: "nobody" } })));
  assert.throws(() => apply(campaign, create({ position: { kind: "stored", location_id: "nowhere" } })));
  assert.throws(() => apply(campaign, create({ owner_id: "nobody" })));
  assert.throws(() => apply(campaign, create({ position: { kind: "equipped", character_id: "nicco", slot: "hand", mode: "held" } })), /carried or stored/);
  // F: a valid creation followed by an invalid command in the same batch: nothing persists.
  assert.throws(() => apply(campaign, create({ name: "Ivory figurine" }), { kind: "place_item", item_id: "campaign_item_00000077", position: { kind: "carried", character_id: "nicco" } }));
  // Stale expected_revision fails exactly like any other stale proposal.
  assert.throws(() => campaign.apply({ expected_revision: revision - 1, commands: [create({ name: "Stale" })] }), /stale/);
  assert.equal(frozen(campaign), before); assert.equal(campaign.revision, revision); assert.equal(campaign.exportSnapshot().next_item_sequence, 2);
  // O: an empty (no-op) proposal changes nothing and consumes nothing.
  assert.deepEqual(campaign.apply({ expected_revision: revision, commands: [] }), { revision, changed: false });
  apply(campaign, create({ name: "Ivory figurine" }));
  assert.deepEqual(engineItems(campaign).map(i => i.id), ["campaign_item_00000001", "campaign_item_00000002"], "no gap: failures consumed nothing");
});

test("I/K/J: owner is independent of the carrier; exactly one discriminated position; references must resolve", () => {
  const { campaign } = turnFixture();
  apply(campaign, create({ name: "Ivory figurine", category: "valuable", owner_id: "brenna" }));
  let figurine = engineItems(campaign)[0]!;
  assert.deepEqual([figurine.owner_id, figurine.position], ["brenna", { kind: "carried", character_id: "nicco" }]);
  // The existing minimal position primitive moves it without touching ownership.
  apply(campaign, { kind: "place_item", item_id: figurine.id, position: { kind: "stored", location_id: "test_hall" } });
  figurine = engineItems(campaign)[0]!;
  assert.deepEqual([figurine.owner_id, figurine.position], ["brenna", { kind: "stored", location_id: "test_hall" }]);
  // K: a position cannot carry two physical places (unknown keys are rejected by the discriminated parser) ...
  assert.throws(() => apply(campaign, create({ position: { kind: "carried", character_id: "nicco", location_id: "test_room" } as never })));
  // ... nor can a restored snapshot.
  const snap = structuredClone(campaign.exportSnapshot()) as any;
  snap.items.find((i: { id: string }) => i.id === figurine.id).position = { kind: "stored", location_id: "test_hall", character_id: "nicco" };
  assert.throws(() => State.restore(turnFixture().world, snap));
  // Allocator invariant: an engine ID at or above next_item_sequence, or without its creation revision, is corrupt state.
  for (const corrupt of [(s: any) => { s.next_item_sequence = 1; }, (s: any) => { delete s.items.find((i: { id: string }) => i.id === figurine.id).created_revision; }]) {
    const s = structuredClone(campaign.exportSnapshot()) as any; corrupt(s); assert.throws(() => State.restore(turnFixture().world, s), /item\.id/);
  }
});

test("G/H: save/load round-trips IDs, owner, position and allocator; old saves migrate with no inferred items", () => {
  const { world, campaign } = turnFixture();
  apply(campaign, create({ owner_id: "brenna", name: "Ivory figurine" }), create({ name: "Rusted sword", category: "weapon", position: { kind: "stored", location_id: "test_room" } }));
  const text = serializeSave(createSaveFile(campaign.exportSnapshot(), world, "2026-10-09T10:00:00.000Z"), world);
  const loaded = decodeSave(text, world).snapshot;
  assert.deepEqual(loaded, campaign.exportSnapshot());
  assert.equal(loaded.next_item_sequence, 3);
  const restored = State.restore(world, loaded); apply(restored, create({ name: "Third" }));
  assert.equal(engineItems(restored).at(-1)!.id, "campaign_item_00000003");
  // H: a schema-5 snapshot (before the Item Domain) migrates: its items are kept exactly, nothing is inferred, the allocator is safe.
  const old = JSON.parse(serializeSave(createSaveFile(turnFixture().campaign.exportSnapshot(), world, "2026-10-09T10:00:00.000Z"), world));
  old.snapshot.schema_version = 5; delete old.snapshot.next_item_sequence;
  const migrated = decodeSaveWithReport(JSON.stringify(old), world);
  assert.equal(migrated.snapshot_migrated_from, 5); assert.equal(migrated.file.snapshot.schema_version, 6);
  assert.equal(migrated.file.snapshot.next_item_sequence, 1);
  assert.deepEqual(migrated.file.snapshot.items, turnFixture().campaign.exportSnapshot().items, "existing items unchanged; no items inferred");
  // A schema-5 file already carrying the allocator is malformed; a 5-file with an empty item list starts at 1.
  const smuggled = structuredClone(old); smuggled.snapshot.next_item_sequence = 9;
  assert.throws(() => decodeSaveWithReport(JSON.stringify(smuggled), world), { code: "migration_failed" });
  const empty = structuredClone(old); empty.snapshot.items = [];
  for (const c of empty.snapshot.characters) delete c.current.empty_slots;
  assert.equal(decodeSaveWithReport(JSON.stringify(empty), world).file.snapshot.next_item_sequence, 1);
});

test("M/N: the controller sees stable item IDs for relevant items; the narrator sees names, never engine IDs", () => {
  const { world, campaign } = turnFixture();
  apply(campaign, create({ name: "Ivory figurine", owner_id: "brenna" }), create({ name: "Red leather journal", position: { kind: "stored", location_id: "test_room" } }),
    create({ name: "Far lantern", position: { kind: "stored", location_id: "test_remote" } }));
  const context = buildTurnContext(world, campaign.exportSnapshot());
  assert.ok(context.items.some(i => i.id === "campaign_item_00000001" && i.owner_id === "brenna"), "carried by a present person, with ID");
  assert.deepEqual(context.items_here?.map(i => [i.id, i.name]), [["campaign_item_00000002", "Red leather journal"]], "lying here, with ID; irrelevant remote items excluded");
  const view = narratorItemView(context.items.find(i => i.id === "campaign_item_00000001")!);
  assert.equal("id" in view, false); assert.equal("created_revision" in view, false); assert.equal(view.name, "Ivory figurine");
  assert.equal("id" in narratorItemView(context.items.find(i => i.id === "boots")!), true, "authored/legacy item IDs render unchanged");
  assert.deepEqual(narratorCarriedLines(campaign.exportSnapshot().items, "nicco", id => id === "brenna" ? "Brenna" : id).filter(l => /figurine/.test(l)), ["Ivory figurine (owned by Brenna)"]);
  const fresh = turnFixture();
  assert.equal(buildTurnContext(fresh.world, fresh.campaign.exportSnapshot()).items_here, undefined, "no items here: context unchanged");
});

// ------------------------------------------------------------------------------------------------ controller pipeline (no live model)
async function turn(narration: string, input: string, proposal: { commands: CampaignCommand[]; evidence?: string[] }, setup?: (c: CampaignState) => void) {
  const f = turnFixture(); setup?.(f.campaign);
  const prompts: string[] = [], priors: string[] = [], service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, { async generate(r: GenerationRequest) { prompts.push(JSON.stringify(r.messages)); return { text: narration, ...metadata }; },
    async *stream(r: GenerationRequest) { prompts.push(JSON.stringify(r.messages)); yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } },
    { async propose(request) { priors.push(request.prior_state); return { ...proposal, ...metadata }; } }, { service, search: new HybridSearch(service) });
  await collect(co.runTurn({ campaign: f.campaign, player_input: input }));
  return { campaign: f.campaign, prompts, priors };
}
const knife = create({ name: "Silver knife", description: "A small silver table knife.", category: "tool" });
test("A/B + replay 1-4: incidental objects are not materialized; a taken object is, through verified evidence only", async () => {
  // A / replay 1: scene dressing, no proposal -> nothing created.
  const a = await turn("Cups, plates and knives crowd the table. Nicco sits down.", "I sit down.", { commands: [] });
  assert.deepEqual(engineItems(a.campaign), []); assert.equal(a.campaign.exportSnapshot().next_item_sequence, 1);
  // B / replay 2: the player takes a specific object; one proposal with a verbatim quote -> exactly one item.
  const b = await turn("A silver knife rests beside the plate. Nicco picks up the silver knife and tucks it into his belt.", "I take the silver knife.",
    { commands: [knife], evidence: ["Nicco picks up the silver knife and tucks it into his belt."] });
  assert.deepEqual(engineItems(b.campaign).map(i => [i.id, i.name, i.position.kind]), [["campaign_item_00000001", "Silver knife", "carried"]]);
  // Replay 3: looking closely at the merchant's figurine -> no item. Replay 4: slipping it into his coat -> the merchant still owns it.
  const look = await turn("Brenna turns the carved ivory figurine in the light so Nicco can see it.", "I look at it more closely.", { commands: [] });
  assert.deepEqual(engineItems(look.campaign), []);
  const steal = await turn("While Brenna looks away, Nicco slips the ivory figurine into his coat.", "I slip the figurine into my coat.",
    { commands: [create({ name: "Ivory figurine", description: "A carved ivory figurine.", category: "valuable", owner_id: "brenna" })], evidence: ["Nicco slips the ivory figurine into his coat."] });
  assert.deepEqual(engineItems(steal.campaign).map(i => [i.name, i.owner_id, i.position]), [["Ivory figurine", "brenna", { kind: "carried", character_id: "nicco" }]]);
  // Already materialized: the controller sees it with its ID and a re-materialization is refused.
  const again = await turn("Nicco pats the ivory figurine in his coat.", "I check the figurine.",
    { commands: [create({ name: "Ivory figurine", description: "d", category: "valuable", owner_id: "brenna" })], evidence: ["Nicco pats the ivory figurine in his coat."] },
    c => apply(c, create({ name: "Ivory figurine", owner_id: "brenna" })));
  assert.equal(engineItems(again.campaign).length, 1);
  assert.match(again.priors[0]!, /"id":"campaign_item_00000001","origin":\{"kind":"created"\},"name":"Ivory figurine"/);
  // N: the narrator prompt names the carried item but never its engine ID.
  assert.match(again.prompts[0]!, /Ivory figurine/); assert.doesNotMatch(again.prompts.join("\n"), /item_\d{8}/);
});

test("O: unverified or invalid controller materializations commit nothing and consume no ID", async () => {
  const cases: { commands: CampaignCommand[]; evidence?: string[] }[] = [
    { commands: [knife] }, // no quote
    { commands: [knife], evidence: ["Nicco looks at the table for a long moment."] }, // quote does not name the object
    { commands: [knife], evidence: ["Nicco might pick up the silver knife later."] }, // not verbatim narration
    { commands: [create({ name: "Silver knife", description: "d", category: "tool", position: { kind: "carried", character_id: "remote_npc" } })], evidence: ["Nicco picks up the silver knife."] }, // absent holder
    { commands: [create({ name: "Silver knife", description: "d", category: "tool", position: { kind: "stored", location_id: "test_hall" } })], evidence: ["Nicco picks up the silver knife."] }, // not here
  ];
  for (const proposal of cases) {
    const r = await turn("Nicco picks up the silver knife.", "I take the silver knife.", proposal);
    assert.deepEqual(engineItems(r.campaign), [], JSON.stringify(proposal)); assert.equal(r.campaign.exportSnapshot().next_item_sequence, 1);
  }
  // Authorizer: structural checks only, then evidence completes (no grammar path).
  const { world, campaign } = turnFixture(), context = buildTurnContext(world, campaign.exportSnapshot());
  const evidence = { player_intents: [], narrator_confirmations: [], narrator_refusals: [] } as never;
  assert.equal(authorizeCommands([knife], evidence, context, campaign.exportSnapshot())[0]!.reason, "rejected_insufficient_confirmation");
});

test("OWNER ≠ PRESENCE A-G: ownership resolves to a known character, present or absent; an absent owner must be named; position stays strict", async () => {
  const ring = (owner?: string) => create({ name: "Signet ring", description: "A heavy gold signet ring.", category: "valuable", ...(owner ? { owner_id: owner } : {}) });
  // Authorizer: presence is not required of an owner (structure passes to evidence), but the owner must exist.
  const { world, campaign } = turnFixture(), context = buildTurnContext(world, campaign.exportSnapshot());
  assert.ok(!context.characters.some(c => c.id === "remote_npc"), "fixture: remote_npc is absent");
  const empty = { player_intents: [], narrator_confirmations: [], narrator_refusals: [] } as never;
  const reason = (owner: string) => authorizeCommands([ring(owner)], empty, context, campaign.exportSnapshot(), world)[0]!.reason;
  assert.equal(reason("brenna"), "rejected_insufficient_confirmation"); // A: present owner -> evidence decides
  assert.equal(reason("remote_npc"), "rejected_insufficient_confirmation"); // B: absent owner -> evidence decides (was reference_invalid)
  assert.equal(reason("nobody"), "rejected_reference_invalid"); // C: unknown owner
  assert.throws(() => apply(campaign, ring("nobody"))); // C: the engine command refuses it too
  // B/E: absent owner explicitly named in the narration -> committed; owner stays the absent character, position is Nicco.
  const named = await turn("The stranger's signet ring lies on the desk where he left it. Nicco takes the stranger's signet ring and pockets it.", "I take the stranger's signet ring.",
    { commands: [ring("remote_npc")], evidence: ["Nicco takes the stranger's signet ring and pockets it."] });
  const item = engineItems(named.campaign)[0]!;
  assert.deepEqual([item.owner_id, item.position], ["remote_npc", { kind: "carried", character_id: "nicco" }]);
  // D: an absent owner the narration does not establish is never inferred -> nothing commits, no ID consumed.
  const guessed = await turn("A signet ring lies on the desk. Nicco takes the signet ring and pockets it.", "I take the signet ring.",
    { commands: [ring("remote_npc")], evidence: ["Nicco takes the signet ring and pockets it."] });
  assert.deepEqual(engineItems(guessed.campaign), []); assert.equal(guessed.campaign.exportSnapshot().next_item_sequence, 1);
  // The same proposal without an owner (unknown) is fine: unknown stays unknown.
  const unknown = await turn("A signet ring lies on the desk. Nicco takes the signet ring and pockets it.", "I take the signet ring.",
    { commands: [ring()], evidence: ["Nicco takes the signet ring and pockets it."] });
  assert.equal(Object.hasOwn(engineItems(unknown.campaign)[0]!, "owner_id"), false);
  // Position stays strict even with a valid absent owner: an absent carrier or a remote location is refused.
  for (const position of [{ kind: "carried", character_id: "remote_npc" }, { kind: "stored", location_id: "test_remote" }] as const) {
    const r = await turn("The stranger's signet ring lies on the desk. Nicco takes the stranger's signet ring.", "I take the ring.",
      { commands: [create({ name: "Signet ring", description: "d", category: "valuable", owner_id: "remote_npc", position })], evidence: ["Nicco takes the stranger's signet ring."] });
    assert.deepEqual(engineItems(r.campaign), [], JSON.stringify(position));
  }
  // F: save/load preserves the absent owner exactly. G: moving the item never changes its owner.
  const f = turnFixture(); apply(f.campaign, ring("remote_npc"));
  const loaded = decodeSave(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-09T10:00:00.000Z"), f.world), f.world).snapshot;
  assert.equal(loaded.items.find(i => i.id === "campaign_item_00000001")!.owner_id, "remote_npc");
  const restored = State.restore(f.world, loaded);
  apply(restored, { kind: "place_item", item_id: "campaign_item_00000001", position: { kind: "stored", location_id: "test_room" } });
  assert.deepEqual([engineItems(restored)[0]!.owner_id, engineItems(restored)[0]!.position], ["remote_npc", { kind: "stored", location_id: "test_room" }]);
});

test("controller contract: create_item is in the schema without an ID field; policy states the materialization rule", () => {
  const parsed = parseControllerProposal(JSON.stringify({ commands: [{ kind: "create_item", name: "Rusted sword", description: "An abandoned rusted sword.", category: "weapon", position: { kind: "carried", character_id: "nicco" } }] }));
  assert.deepEqual(parsed, [{ kind: "create_item", name: "Rusted sword", description: "An abandoned rusted sword.", category: "weapon", position: { kind: "carried", character_id: "nicco" } }]);
  assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [{ kind: "create_item", name: "x", description: "d", category: "gizmo", position: { kind: "carried", character_id: "nicco" } }] })));
  assert.match(CONTROLLER_POLICY, /Materialize an object with create_item only when/); assert.match(CONTROLLER_POLICY, /Never materialize incidental scene dressing/);
  assert.match(CONTROLLER_POLICY, /Never supply an item ID/);
});
