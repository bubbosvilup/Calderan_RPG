import test from "node:test";
import assert from "node:assert/strict";
import { WorldStore } from "../src/world/world-store.js";
import type { WorldEntity } from "../src/types/entities.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { carriedItems, carriesItem, equippedItems, equipsItem, hasItem, inventoryItems, itemAt, itemsAtLocation, ownedItems, ownsItem } from "../src/campaign/inventory.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { authorizeCommands } from "../src/turn/command-authorizer.js";
import { inventoryLines } from "../src/turn/item-projection.js";
import { referencedCharacters } from "../src/turn/referenced-characters.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { parseControllerProposal } from "../src/llm/controller-schema.js";
import { CONTROLLER_POLICY } from "../src/llm/openrouter/state-controller.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Permanent Inventory V1: derived inventory, predicates, location placement, absent-character grounding. */
function fixture() {
  const base = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, display_name: name, parent: null, aliases: [], summary: `${name}.`, tags: [], search_context: "", content: `${name}.`, knowledge: { visibility: { narrator: true, player: true }, known_by: [] as string[] }, ...extra });
  const npc = (id: string, name: string, location: string, extra: Record<string, unknown> = {}) => ({ ...base(id, name, extra), type: "character" as const, role: "npc" as const, location, traits: [], relationships: [] });
  const entities: WorldEntity[] = [
    { ...base("shop", "Brenna's shop"), type: "location", features: [], connections: [{ target: "heartstone_lr", description: "Out", minutes: 5 }] },
    { ...base("heartstone_lr", "Heartstone living room"), type: "location", features: [], connections: [{ target: "shop", description: "Back", minutes: 5 }] },
    { ...base("pellan_manor", "Pellan Manor"), type: "location", features: [], connections: [] },
    { ...base("nicco", "Nicco"), type: "character", role: "player", location: null, traits: [], relationships: [] },
    npc("brenna", "Brenna", "shop"), npc("maren", "Maren", "shop"),
    npc("pellan", "Lord Pellan", "pellan_manor", { summary: "Lord Pellan, a minor noble.", content: "Lord Pellan, a minor noble. SECRET-BIO: he owes the guild." }),
    npc("john_smith", "John Smith", "pellan_manor"), npc("john_cole", "John Cole", "pellan_manor"),
    npc("veiled_agent", "Veiled Agent", "pellan_manor", { knowledge: { visibility: { narrator: true, player: false }, known_by: [] } }),
  ];
  const world = new WorldStore(entities.map(entity => ({ source: `synthetic/${entity.id}.yaml`, document: { schema_version: 1, entity, chunks: [] } })));
  return { world, campaign: new CampaignState(world, `inv_${++serial}`, { player_location: "shop", world_time: { world_minute: 600 } }) };
}
let serial = 0;
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const create = (name: string, position: Record<string, unknown>, owner?: string): CampaignCommand => ({ kind: "create_item", name, description: `A ${name}.`, visual_description: `Plain ${name}.`, position, ...(owner ? { owner_id: owner } : {}) }) as CampaignCommand;
const id = (c: CampaignState, name: string) => c.exportSnapshot().items.find(i => i.name === name)!.id;
const ids = (items: readonly { id: string }[]) => items.map(i => i.id);

test("A-H: inventory is derived from item positions; has != owns; stored is never inventory; order is stable", () => {
  const { campaign } = fixture();
  const s0 = campaign.exportSnapshot();
  assert.deepEqual([inventoryItems(s0, "nicco"), carriedItems(s0, "nicco"), equippedItems(s0, "nicco"), ownedItems(s0, "nicco")], [[], [], [], []]); // A
  apply(campaign, create("Stolen ring", { kind: "carried", character_id: "nicco" }, "brenna"), create("Old sword", { kind: "stored", location_id: "heartstone_lr" }, "nicco"),
    create("Necklace", { kind: "carried", character_id: "brenna" }, "brenna"), create("Apple", { kind: "carried", character_id: "nicco" }));
  apply(campaign, { kind: "place_item", item_id: id(campaign, "Necklace"), position: { kind: "equipped", character_id: "brenna", slot: "neck", mode: "worn" } });
  const s = campaign.exportSnapshot(), ring = id(campaign, "Stolen ring"), sword = id(campaign, "Old sword"), necklace = id(campaign, "Necklace"), apple = id(campaign, "Apple");
  // B/F: the stolen ring is on Nicco but Brenna owns it.
  assert.deepEqual([hasItem(s, "nicco", ring), carriesItem(s, "nicco", ring), ownsItem(s, "nicco", ring), ownsItem(s, "brenna", ring), hasItem(s, "brenna", ring)], [true, true, false, true, false]);
  // D/E: Nicco's sword lies in Heartstone: owned, not had, at the location, in nobody's inventory.
  assert.deepEqual([hasItem(s, "nicco", sword), carriesItem(s, "nicco", sword), ownsItem(s, "nicco", sword), itemAt(s, sword, "heartstone_lr"), itemAt(s, sword, "shop")], [false, false, true, true, false]);
  assert.ok(!ids(inventoryItems(s, "nicco")).includes(sword)); assert.deepEqual(ids(itemsAtLocation(s, "heartstone_lr")), [sword]);
  // C: Brenna wears her necklace.
  assert.deepEqual([hasItem(s, "brenna", necklace), equipsItem(s, "brenna", necklace), carriesItem(s, "brenna", necklace), ownsItem(s, "brenna", necklace)], [true, true, false, true]);
  assert.deepEqual(ids(equippedItems(s, "brenna")), [necklace]);
  // Owned-but-elsewhere: Brenna owns the ring (on Nicco) and the necklace (on her); her inventory is only the necklace.
  assert.deepEqual(ids(ownedItems(s, "brenna")), [ring, necklace].sort()); assert.deepEqual(ids(inventoryItems(s, "brenna")), [necklace]);
  // H: deterministic ID order, identical across calls and independent of snapshot array order.
  assert.deepEqual(ids(inventoryItems(s, "nicco")), [ring, apple].sort()); assert.deepEqual(inventoryItems(s, "nicco"), inventoryItems(s, "nicco"));
  const shuffled = { ...s, items: [...s.items].reverse() } as typeof s;
  assert.deepEqual(ids(inventoryItems(shuffled, "nicco")), ids(inventoryItems(s, "nicco")));
  // G: the same item moved through stored -> carried -> equipped keeps its ID and the derived views follow.
  apply(campaign, { kind: "place_item", item_id: sword, position: { kind: "carried", character_id: "nicco" } });
  assert.ok(hasItem(campaign.exportSnapshot(), "nicco", sword) && !itemAt(campaign.exportSnapshot(), sword, "heartstone_lr"));
  apply(campaign, { kind: "place_item", item_id: sword, position: { kind: "equipped", character_id: "nicco", slot: "belt", mode: "held" } });
  const s2 = campaign.exportSnapshot();
  assert.deepEqual([equipsItem(s2, "nicco", sword), carriesItem(s2, "nicco", sword), ownsItem(s2, "nicco", sword)], [true, false, true]);
  assert.equal(s2.items.filter(i => i.name === "Old sword").length, 1);
  // Human-readable projection: names, [equipped], owner only when someone else; never technical IDs.
  const lines = inventoryLines(s2, fixture().world, "nicco", x => x === "brenna" ? "Brenna" : x);
  const label: Record<string, string> = { "Stolen ring": "Stolen ring (owned by Brenna)", "Old sword": "Old sword [equipped]", Apple: "Apple" };
  assert.deepEqual(lines, inventoryItems(s2, "nicco").map(i => label[i.name!]));
  assert.doesNotMatch(lines.join(" "), /campaign_item_/);
});

test("player, campaign NPC and NPC+ share one inventory query layer; save/load reproduces every inventory", () => {
  const { world, campaign } = fixture();
  const tomas = "campaign_character_tomas";
  apply(campaign, { kind: "register_character", character: { id: tomas, origin: { kind: "created" }, profile: { name: "Tomas" }, current: { current_location: "shop" } } });
  apply(campaign, { kind: "create_household", id: "campaign_household_home", name: "Home" }, { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } });
  apply(campaign, { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "maren", status: "member" } });
  assert.ok(campaign.exportSnapshot().premium_characters.some(p => p.character_id === "maren"), "fixture: Maren is NPC+");
  apply(campaign, create("Lantern", { kind: "carried", character_id: "nicco" }), create("Fishing net", { kind: "carried", character_id: tomas }, tomas), create("Apron", { kind: "carried", character_id: "maren" }, "maren"));
  const s = campaign.exportSnapshot();
  for (const [character, name] of [["nicco", "Lantern"], [tomas, "Fishing net"], ["maren", "Apron"]] as const) {
    assert.deepEqual(inventoryItems(s, character).map(i => i.name), [name], character);
    assert.ok(hasItem(s, character, id(campaign, name)));
  }
  // Save/load: inventory is derived, so the round-trip reproduces every view with no extra state.
  const loaded = decodeSave(serializeSave(createSaveFile(s, world, "2026-10-09T12:00:00.000Z"), world), world).snapshot;
  for (const character of ["nicco", tomas, "maren", "brenna"]) {
    assert.deepEqual(inventoryItems(loaded, character), inventoryItems(s, character)); assert.deepEqual(ownedItems(loaded, character), ownedItems(s, character));
  }
  assert.equal(Object.keys(loaded).some(k => /inventory/i.test(k)), false, "no inventory field in the save");
  assert.equal(loaded.schema_version, 6, "derived-only pass: no schema bump");
  // Invalid carrier/owner references in persisted state are rejected (no character deletion command exists).
  const bad = structuredClone(s) as any; bad.items[0].position = { kind: "carried", character_id: "campaign_character_gone" };
  assert.throws(() => CampaignState.restore(world, bad));
});

// ------------------------------------------------------------------------------------------------ controller pipeline (scripted)
async function turn(setup: (c: CampaignState) => void, narration: string, input: string, proposal: { commands: CampaignCommand[]; evidence?: string[] }) {
  const f = fixture(); setup(f.campaign);
  const priors: string[] = [], prompts: string[] = [], service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, { async generate(r: GenerationRequest) { prompts.push(JSON.stringify(r.messages)); return { text: narration, ...metadata }; },
    async *stream(r: GenerationRequest) { prompts.push(JSON.stringify(r.messages)); yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } },
    { async propose(request) { priors.push(request.prior_state); return { ...proposal, ...metadata }; } }, { service, search: new HybridSearch(service) });
  await collect(co.runTurn({ campaign: f.campaign, player_input: input }));
  return { campaign: f.campaign, prior: JSON.parse(priors[0]!), prompts };
}
const knife = (c: CampaignState) => apply(c, create("Silver knife", { kind: "carried", character_id: "nicco" }));
const KNIFE = "campaign_item_00000001";

test("I-L + pipeline 1/2/5: put down here, pick back up, same ID, no duplicate; wrong location refused", async () => {
  // 1 / I: put the existing knife down at the current location.
  const down = await turn(knife, "Nicco lays the silver knife on the table and leaves it there.", "I leave the silver knife here.",
    { commands: [{ kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "shop" } }], evidence: ["Nicco lays the silver knife on the table and leaves it there."] });
  let s = down.campaign.exportSnapshot();
  assert.deepEqual([s.items.length, itemAt(s, KNIFE, "shop"), hasItem(s, "nicco", KNIFE)], [1, true, false]);
  // 2 / J / 5: the stored knife is shown to the controller with its ID (items_here) and picked back up: same ID, one instance.
  const putBack = (c: CampaignState) => { knife(c); apply(c, { kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "shop" } }); };
  const up = await turn(putBack, "Nicco picks the silver knife back up and tucks it into his belt.", "I pick the silver knife back up.",
    { commands: [{ kind: "place_item", item_id: KNIFE, position: { kind: "carried", character_id: "nicco" } }], evidence: ["Nicco picks the silver knife back up and tucks it into his belt."] });
  assert.deepEqual(up.prior.context.items_here.map((i: { id: string; name: string }) => [i.id, i.name]), [[KNIFE, "Silver knife"]]);
  s = up.campaign.exportSnapshot();
  assert.deepEqual([s.items.length, carriesItem(s, "nicco", KNIFE), s.next_item_sequence], [1, true, 2]); // K: still one instance
  // 5: a duplicate create for the same stored item is refused (already established); the existing ID is the only one.
  const dup = await turn(putBack, "Nicco picks up the silver knife.", "I take the silver knife.",
    { commands: [{ kind: "create_item", name: "Silver knife", description: "d", visual_description: "Small silver knife.", category: "tool", position: { kind: "carried", character_id: "nicco" } }], evidence: ["Nicco picks up the silver knife."] });
  assert.equal(dup.campaign.exportSnapshot().items.length, 1);
  // L: no placement at an unrelated location, and none without a verified quote naming the item.
  for (const proposal of [
    { commands: [{ kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "heartstone_lr" } }], evidence: ["Nicco lays the silver knife on the table."] },
    { commands: [{ kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "shop" } }], evidence: ["There is a table nearby, scarred and old."] },
    { commands: [{ kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "shop" } }] },
  ] as { commands: CampaignCommand[]; evidence?: string[] }[]) {
    const r = await turn(knife, "There is a table nearby, scarred and old. Nicco lays the silver knife on the table.", "I look at the table.", proposal);
    assert.ok(carriesItem(r.campaign.exportSnapshot(), "nicco", KNIFE), JSON.stringify(proposal));
  }
  // The schema exposes the existing stored position on place_item only.
  assert.deepEqual(parseControllerProposal(JSON.stringify({ commands: [{ kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "shop" } }] })),
    [{ kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "shop" } }]);
  assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [{ kind: "transfer_item", mode: "handoff", item_id: KNIFE,  position: { kind: "stored", location_id: "shop" } }] })));
  // Existing equip rule is untouched: the structural branch only covers location placement.
  const f = fixture(); knife(f.campaign);
  const ctx = buildTurnContext(f.world, f.campaign.exportSnapshot()), none = { player_intents: [], narrator_confirmations: [], narrator_refusals: [] } as never;
  assert.equal(authorizeCommands([{ kind: "place_item", item_id: KNIFE, position: { kind: "stored", location_id: "shop" } }], none, ctx, f.campaign.exportSnapshot())[0]!.reason, "rejected_insufficient_confirmation");
});

test("M-R + pipeline 3/4: referenced absent characters are grounded by ID and name only, deterministically, without secrets", async () => {
  const { world, campaign } = fixture(), s = campaign.exportSnapshot(), present = ["nicco", "brenna", "maren"];
  const ref = (...texts: string[]) => referencedCharacters(world, s, present, ...texts);
  assert.deepEqual(ref("Lord Pellan's signet ring rests on the desk."), [{ id: "pellan", name: "Lord Pellan" }]); // M
  assert.deepEqual(ref("I take Pellan's ring."), [{ id: "pellan", name: "Lord Pellan" }]);
  assert.deepEqual(ref("Brenna's old knife lies here."), []); // N: present, not duplicated
  assert.deepEqual(ref("John's coat hangs by the door."), []); // O: two Johns -> no mapping
  assert.deepEqual(ref("John Cole's coat hangs by the door."), [{ id: "john_cole", name: "John Cole" }]);
  assert.deepEqual(ref("Garrick's hat."), []); assert.deepEqual(ref("the Duke's ring"), []); // P: unknown / title only
  assert.deepEqual(ref("The Veiled Agent left a note."), [], "Q: narrator-only identities never resolve");
  // 3 / R: Pellan absent and named -> the controller sees only {id, name}; the item is created owned by Pellan, carried by Nicco.
  const take = await turn(() => {}, "Lord Pellan's signet ring rests on the desk. Nicco takes Pellan's signet ring and pockets it.", "I take it.",
    { commands: [{ kind: "create_item", name: "Pellan's signet ring", description: "A signet ring.", visual_description: "Plain metal signet ring with a flat face.", category: "valuable", owner_id: "pellan", position: { kind: "carried", character_id: "nicco" } } as CampaignCommand],
      evidence: ["Nicco takes Pellan's signet ring and pockets it."] });
  assert.deepEqual(take.prior.referenced_known_characters, [{ id: "pellan", name: "Lord Pellan" }]);
  assert.doesNotMatch(JSON.stringify(take.prior), /SECRET-BIO|pellan_manor|minor noble/, "Q: identity only; no profile, location or secret");
  const ring = take.campaign.exportSnapshot().items[0]!;
  assert.deepEqual([ring.owner_id, ring.position], ["pellan", { kind: "carried", character_id: "nicco" }]);
  assert.doesNotMatch(take.prompts.join("\n"), /referenced_known_characters|campaign_item_/, "controller-only block; narrator never sees it");
  // 4: Pellan named but no item action -> grounding present, no state change.
  const talk = await turn(() => {}, "Brenna mentions that Lord Pellan left town yesterday.", "What happened to Pellan?", { commands: [] });
  assert.deepEqual([talk.prior.referenced_known_characters, talk.campaign.exportSnapshot().items], [[{ id: "pellan", name: "Lord Pellan" }], []]);
  // Ordinary turns with no named absent character keep the envelope unchanged (no key).
  const plain = await turn(() => {}, "Nicco looks around the shop.", "I look around.", { commands: [] });
  assert.equal("referenced_known_characters" in plain.prior, false);
  // Policy: concise item-continuity and grounding rules.
  assert.match(CONTROLLER_POLICY, /keeps its ID and is never created again/); assert.match(CONTROLLER_POLICY, /position stored at the current location/);
  assert.match(CONTROLLER_POLICY, /owner_id may name a character listed in referenced_known_characters/); assert.match(CONTROLLER_POLICY, /Moving an item never changes its owner/);
});
