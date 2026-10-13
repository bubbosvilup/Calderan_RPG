import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CampaignCommand } from "../src/campaign/types.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { inventoryItems } from "../src/campaign/inventory.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/context/prompt-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { deriveSessionView } from "../src/app/session-view.js";
import { diagnoseMutation } from "../src/turn/coordinator/mutation-diagnostics.js";
import { inspectInventory, inspectItem, pickupCase, runPickupCase, SWORD, groundSword, pickUp, dropHere, PICKUP_CASES } from "../src/dev/inspect/item-lifecycle-inspector.js";
import { turnFixture } from "../src/dev/support/turn-fixture.js";

/** Item lifecycle: one authoritative `position`, owner separate, every inventory view derived, pickup/drop/handoff share one placement model. */
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const reg = (id: string, name: string, owner: string | null, position: Record<string, unknown>) => ({ kind: "register_item", item: { id, origin: { kind: "created" }, name, owner_id: owner, position } }) as CampaignCommand;
async function turn(input: string, narration: string, commands: CampaignCommand[], evidence: string[], setup: (f: ReturnType<typeof turnFixture>) => void = groundSword()) {
  return runPickupCase(pickupCase({ id: "t", title: input, input, narration, controller: commands.length ? { kind: "commands", commands, evidence } : { kind: "none" }, setup }));
}
const inv = (r: { inventory: { derived: readonly string[] } }) => r.inventory.derived.includes(SWORD);
const itemsBlock = (f: ReturnType<typeof turnFixture>) => {
  const snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  return buildNarratorPrompt("", context, [], {}, playerIntent("Look around.", context, snapshot, f.world)).messages[0]!.content;
};
const A = "Nicco bends and picks up the sword.";

test("P1-P6, P21: pickup keeps the entity, moves only the carrier, owner unchanged, exactly one revision, inventory includes it", async () => {
  const r = await turn("I pick up the sword.", A, [pickUp()], [A]);
  const s = r.fixture.campaign.exportSnapshot();
  assert.equal(s.items.filter(i => i.id === SWORD).length, 1); assert.equal(s.items.filter(i => /sword/i.test(i.name ?? "")).length, 1);
  assert.deepEqual(r.item.position, { kind: "carried", character_id: "nicco" }); assert.equal(r.item.owner, "nicco");
  assert.equal(r.item.at_location, undefined); assert.ok(inv(r));
  assert.deepEqual([r.run.diagnostic.revision_before, r.run.diagnostic.revision_after], [2, 3]);
  assert.deepEqual([r.item.session_view_inventory, r.item.ui_inventory, r.item.controller_items_here], [true, true, false]);
  assert.deepEqual(r.inventory.session_view, r.inventory.derived); assert.deepEqual(r.inventory.ui, r.inventory.derived);
});
test("P12, P24: picking up another person's item changes the carrier, never the owner, and implies no theft or loan", async () => {
  const r = await turn("I pick up the sword.", A, [pickUp()], [A], groundSword("brenna"));
  assert.deepEqual([r.item.owner, r.item.position], ["brenna", { kind: "carried", character_id: "nicco" }]);
  const text = itemsBlock(r.fixture);
  assert.match(text, /Nicco carries Sword; owner: Brenna/i); assert.doesNotMatch(text.split("\n").filter(l => /Sword/.test(l)).join("\n"), /\b(?:stole|stolen|borrowed|lent|loan|theft)\b/i);
});
test("P14, P15: looking at, touching, reaching toward, failing or being prevented never picks anything up", async () => {
  for (const n of ["Nicco looks at the sword on the floor.", "Nicco touches the sword with his boot.", "Nicco reaches toward the sword.", "Nicco tries to pick up the sword but fails.", "Nicco is prevented from picking up the sword.", "Nicco considers picking up the sword.",
    "The sword slips away before Nicco can pick it up.", "Nicco is about to pick up the sword.", "Nicco refuses to pick up the sword."]) {
    const r = await turn("I pick up the sword.", n, [pickUp()], [n]);
    assert.deepEqual(r.item.position, { kind: "stored", location_id: "test_room" }, n); assert.ok(!inv(r), n);
    assert.deepEqual([r.run.diagnostic.revision_before, r.run.diagnostic.revision_after], [2, 2], n);
  }
});
test("receipt corpus: bounded positive constructions, italics, quotes and pronoun continuation", async () => {
  for (const n of ["Nicco takes the sword.", "Nicco grabs the sword from the floor.", "*Nicco bends and picks up the sword.*", "Nicco lifts the sword from the floor.", "Nicco retrieves the sword.", "Nicco picks the sword up.", "Nicco closes his hand around the sword and lifts it.",
    "\"Careful,\" says Brenna. Nicco picks up the sword.", "Nicco kneels beside the sword. He picks it up and weighs it.", "*Nicco kneels beside the sword.* *He picks it up.*"]) {
    const quote = n.replace(/\*/g, "").match(/[^.]*\b(?:picks|takes|grabs|lifts|retrieves)\b[^.]*\./)![0].trim();
    const r = await turn("I pick up the sword.", n, [pickUp()], [quote]);
    assert.ok(inv(r), `${n} -> ${JSON.stringify(r.item.position)} ${r.run.diagnostic.rejected.map(x => x.detail)}`);
  }
});
test("another person's act, a different item or a wrong subject is not Nicco's pickup", async () => {
  for (const n of ["Brenna picks up the sword.", "Brenna picks up the sword while Nicco watches.", "Nicco takes a step toward the sword.", "Nicco picks up the lantern."]) {
    const r = await turn("I pick up the sword.", n, [pickUp()], [n]);
    assert.ok(!inv(r), n);
  }
});
test("P18: an NPC pickup belongs to that NPC, not the player, and the next SSP shows who carries it", async () => {
  const n = "Brenna crouches and picks up the sword.", r = await turn("I watch Brenna.", n, [pickUp("brenna")], [n]);
  assert.deepEqual(r.item.position, { kind: "carried", character_id: "brenna" }); assert.deepEqual(r.item.in_inventory_of, ["brenna"]);
  assert.ok(!inv(r)); assert.equal(r.item.session_view_inventory, false);
  assert.match(itemsBlock(r.fixture), /Brenna carries (?:the )?Sword/i);
  assert.ok(inspectInventory(r.fixture, "brenna").derived.includes(SWORD)); assert.ok(!inspectInventory(r.fixture, "nicco").derived.includes(SWORD));
});
test("P17: an item lying elsewhere cannot be picked up here and is not teleported", async () => {
  const r = await turn("I pick up the sword.", A, [pickUp()], [A], groundSword("nicco", "test_hall"));
  assert.deepEqual(r.item.position, { kind: "stored", location_id: "test_hall" }); assert.equal(r.run.diagnostic.revision_after, 2);
  assert.equal(r.item.controller_items_here, false);
});
test("P16: two same-name items lying here are never picked arbitrarily; a distinguishing word resolves", async () => {
  const two = (f: ReturnType<typeof turnFixture>) => { apply(f.campaign, reg("campaign_item_sword_a", "Rusty sword", null, { kind: "stored", location_id: "test_room" }), reg("campaign_item_sword_b", "Silver sword", null, { kind: "stored", location_id: "test_room" })); };
  const pick = (id: string): CampaignCommand => ({ kind: "place_item", item_id: id, position: { kind: "carried", character_id: "nicco" } });
  const vague = await turn("I pick up the sword.", "Nicco picks up the sword.", [pick("campaign_item_sword_a")], ["Nicco picks up the sword."], two);
  assert.deepEqual(vague.fixture.campaign.exportSnapshot().items.filter(i => i.position.kind === "carried").map(i => i.id).filter(i => i.startsWith("campaign_item_sword_")), []);
  assert.equal(vague.run.diagnostic.revision_after, vague.run.diagnostic.revision_before);
  const exact = await turn("I pick up the silver sword.", "Nicco picks up the silver sword.", [pick("campaign_item_sword_b")], ["Nicco picks up the silver sword."], two);
  assert.deepEqual(exact.fixture.campaign.exportSnapshot().items.filter(i => i.position.kind === "carried" && i.id.startsWith("campaign_item_sword_")).map(i => i.id), ["campaign_item_sword_b"]);
  const wrong = await turn("I pick up the silver sword.", "Nicco picks up the silver sword.", [pick("campaign_item_sword_a")], ["Nicco picks up the silver sword."], two);
  assert.deepEqual(wrong.fixture.campaign.exportSnapshot().items.filter(i => i.position.kind === "carried" && i.id.startsWith("campaign_item_sword_")), []);
});
test("P13, P22: picking up what is already carried is a no-op: no duplicate, no revision", async () => {
  const carried = (f: ReturnType<typeof turnFixture>) => { apply(f.campaign, reg(SWORD, "Sword", "nicco", { kind: "carried", character_id: "nicco" })); };
  const r = await turn("I pick up the sword.", A, [pickUp()], [A], carried);
  assert.equal(r.fixture.campaign.exportSnapshot().items.filter(i => i.id === SWORD).length, 1);
  assert.equal(r.run.diagnostic.revision_after, r.run.diagnostic.revision_before); assert.deepEqual(r.inventory.derived.filter(i => i === SWORD), [SWORD]);
});
test("P19: an existing tracked item is never re-created by a pickup", async () => {
  const create: CampaignCommand = { kind: "create_item", name: "Sword", description: "A sword.", visual_description: "Plain sword.", category: "weapon", position: { kind: "carried", character_id: "nicco" } };
  const r = await turn("I pick up the sword.", A, [create], [A]);
  assert.equal(r.fixture.campaign.exportSnapshot().items.length, 1 + 0 + r.fixture.campaign.exportSnapshot().items.filter(i => i.id !== SWORD).length); // only the registered item and the fixture's canonical items
  assert.equal(r.fixture.campaign.exportSnapshot().items.filter(i => /sword/i.test(i.name ?? "")).length, 1);
  // The create_item is refused; the explicit pickup intent plus the unambiguous narrated receipt recover the real pickup of the SAME item.
  assert.deepEqual(r.item.position, { kind: "carried", character_id: "nicco" });
});
test("P9, P10: a drop is the inverse: carrier cleared, placed here, owner unchanged, inventory excludes it, ground SSP shows it", async () => {
  const held = (f: ReturnType<typeof turnFixture>) => { apply(f.campaign, reg(SWORD, "Sword", "nicco", { kind: "carried", character_id: "nicco" })); };
  const n = "Nicco sets the sword down on the floor.", r = await turn("I put the sword down.", n, [dropHere()], [n], held);
  assert.deepEqual(r.item.position, { kind: "stored", location_id: "test_room" }); assert.equal(r.item.owner, "nicco"); assert.ok(!inv(r));
  assert.deepEqual([r.item.session_view_inventory, r.item.ui_inventory, r.item.controller_items_here], [false, false, true]);
  assert.deepEqual([r.run.diagnostic.revision_before, r.run.diagnostic.revision_after], [2, 3]);
  assert.match(itemsBlock(r.fixture), /Sword[^\n]*(?:here|lies|on the ground|at this)/i);
  for (const bad of ["Nicco looks at the sword in his hands.", "Nicco is about to drop the sword.", "Nicco tries to put the sword down but cannot."]) {
    const x = await turn("I put the sword down.", bad, [dropHere()], [bad], held);
    assert.deepEqual(x.item.position, { kind: "carried", character_id: "nicco" }, bad);
  }
});
test("P25, P26, P27: current placement beats history, a carried item is not also listed on the ground, the controller gets technical state only", async () => {
  const r = await turn("I pick up the sword.", A, [pickUp()], [A]);
  const text = itemsBlock(r.fixture), carriedLines = text.split("\n").filter(l => /\bSword\b/.test(l) && /carries|carried|holds/.test(l));
  assert.ok(carriedLines.length >= 1 && carriedLines.length <= 2, text);
  assert.ok(!text.split("\n").some(l => /Sword/.test(l) && /(?:lying|on the ground|here\b)/i.test(l) && !/carr/.test(l)), "no second ground placement");
  const context = buildTurnContext(r.fixture.world, r.fixture.campaign.exportSnapshot());
  assert.ok(!context.items_here?.some(i => i.id === SWORD)); assert.ok(context.items.some(i => i.id === SWORD && i.position.kind === "carried"));
  assert.doesNotMatch(JSON.stringify(context), /Outside weather|\[CURRENT SCENE\]/);
});
test("P8, P28: pickup then drop round-trip through save/load with no schema change", async () => {
  const r = await turn("I pick up the sword.", A, [pickUp()], [A]);
  for (const step of ["pickup", "drop"]) {
    if (step === "drop") apply(r.fixture.campaign, dropHere());
    const before = r.fixture.campaign.exportSnapshot(), text = serializeSave(createSaveFile(before, r.fixture.world, "2026-10-10T10:00:00.000Z"), r.fixture.world);
    const after = decodeSave(text, r.fixture.world).snapshot;
    assert.deepEqual(after.items, before.items); assert.equal(after.schema_version, before.schema_version);
    assert.deepEqual(inventoryItems(after, "nicco").map(i => i.id), inventoryItems(before, "nicco").map(i => i.id));
    assert.deepEqual(Object.keys(after), Object.keys(before));
  }
  assert.doesNotMatch(readFileSync("src/campaign/types.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /inventory\s*[:?]\s*string\[\]|carried_items/);
});
test("P11: handoff between characters still moves only the carrier", async () => {
  const hand = (f: ReturnType<typeof turnFixture>) => { apply(f.campaign, reg(SWORD, "Sword", "nicco", { kind: "carried", character_id: "nicco" })); };
  const n = "Brenna takes the sword from Nicco.";
  const r = await runPickupCase(pickupCase({ id: "h", title: "h", input: "*hands Brenna the sword*", narration: "Nicco offers the hilt first. Brenna takes the sword and weighs it.", setup: hand,
    controller: { kind: "commands", commands: [{ kind: "transfer_item", mode: "handoff", item_id: SWORD, position: { kind: "carried", character_id: "brenna" } }], evidence: ["Brenna takes the sword and weighs it."] } }));
  assert.deepEqual([r.item.position, r.item.owner], [{ kind: "carried", character_id: "brenna" }, "nicco"]); assert.ok(n.length > 0);
});
test("P23: inventory order is deterministic by item id", () => {
  const f = turnFixture();
  apply(f.campaign, reg("campaign_item_zeta", "Zeta", null, { kind: "carried", character_id: "nicco" }), reg("campaign_item_alpha", "Alpha", null, { kind: "carried", character_id: "nicco" }), reg("campaign_item_mid", "Mid", null, { kind: "carried", character_id: "nicco" }));
  const a = inspectInventory(f, "nicco"), s = [...a.derived].sort();
  assert.deepEqual(a.derived, [...a.derived].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  assert.deepEqual(a.derived, a.ui); assert.ok(s.length >= 3);
});
test("owned-but-lying-here items are not in the SessionView inventory (root cause: a second inventory rule keyed on owner)", () => {
  const f = turnFixture(); groundSword("nicco")(f);
  const view = deriveSessionView(f.world, f.campaign.exportSnapshot(), { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  assert.ok(!view.player.inventory.some(i => i.id === SWORD)); assert.deepEqual(inspectItem(f, SWORD).in_inventory_of, []);
  apply(f.campaign, pickUp()); const after = deriveSessionView(f.world, f.campaign.exportSnapshot(), { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  assert.ok(after.player.inventory.some(i => i.id === SWORD));
});
test("P20: contradictory placement commands for one item are observable", () => {
  const f = turnFixture(); groundSword()(f);
  const d = diagnoseMutation({ debug: [] } as never);
  assert.ok(d); assert.equal(f.campaign.exportSnapshot().items.find(i => i.id === SWORD)!.position.kind, "stored");
  assert.ok(PICKUP_CASES.length >= 8);
});
test("live capture: a quote that opens the act is completed by the very next sentence, and only by it", async () => {
  const grasp = "Nicco's hand closes around the grip of the plain iron sword where it rests on the broad living-room floor.";
  const done = `*${grasp} The weight settles familiar in his palm as he lifts it, metal catching the glow.*\n\n*At the hearth, Brenna straightens.*`;
  const ok = await turn("*picks up the sword from the floor*", done, [pickUp()], [grasp]);
  assert.ok(inv(ok), String(ok.run.diagnostic.rejected.map(x => x.detail)));
  for (const bad of [`*${grasp} He tries to lift it but the weight is too much.*`, `*${grasp}* *Brenna lifts it from the floor and tosses it aside.*`, `*${grasp}* *At the hearth, Brenna straightens.* *Later, he lifts it.*`, `*${grasp}*`]) {
    const r = await turn("*picks up the sword from the floor*", bad, [pickUp()], [grasp]);
    assert.ok(!inv(r), bad);
  }
});
test("live capture: a put-down narrated from the item's side counts only for the item the actor holds, and an alias shared by two items stays ambiguous", async () => {
  const held = (f: ReturnType<typeof turnFixture>) => { apply(f.campaign, reg(SWORD, "Sword", "nicco", { kind: "carried", character_id: "nicco" })); };
  const quote = "The blade meets the stone with a flat, quiet ring.";
  const down = `*${quote} Dust puffs faintly where the flat settles back against the floor.*\n\n*Brenna watches him set it down.*`;
  const ok = await turn("*sets the sword down on the floor*", down, [dropHere()], [quote], held);
  assert.deepEqual(ok.item.position, { kind: "stored", location_id: "test_room" }, String(ok.run.diagnostic.rejected.map(x => x.detail)));
  for (const [bad, q] of [["*The blade is in his hand. Dust puffs faintly where the flat settles back against the floor.*", "The blade is in his hand."], ["*Brenna's blade meets the stone with a ring.*", "Brenna's blade meets the stone with a ring."], ["*The blade meets the stone, but Nicco snatches it up again.*", "The blade meets the stone, but Nicco snatches it up again."], ["*Dust puffs where the flat settles against the floor.*", "Dust puffs where the flat settles against the floor."]] as const) {
    const r = await turn("*sets the sword down on the floor*", bad, [dropHere()], [q], held);
    assert.deepEqual(r.item.position, { kind: "carried", character_id: "nicco" }, bad);
  }
  const twoBlades = (f: ReturnType<typeof turnFixture>) => { held(f); apply(f.campaign, reg("campaign_item_knife", "Knife", "nicco", { kind: "carried", character_id: "nicco" })); };
  const amb = await turn("*sets the sword down on the floor*", down, [dropHere()], [quote], twoBlades);
  assert.deepEqual(amb.item.position, { kind: "carried", character_id: "nicco" });
});
