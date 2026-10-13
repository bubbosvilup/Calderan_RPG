import type { CampaignCommand } from "../../campaign/types.js";
import type { CampaignState } from "../../campaign/campaign-state.js";
import { inventoryItems } from "../../campaign/inventory.js";
import { deriveSessionView } from "../../app/session-view.js";
import { inventoryVisualView } from "../../app/item-visual-view.js";
import { buildTurnContext } from "../../turn/context/context-builder.js";
import { turnFixture } from "../support/turn-fixture.js";
import { renderRun, runScenario, type DiagnosticScenario, type ScenarioRun } from "./controller-authorization-diagnostics.js";

/**
 * Item lifecycle inspector (offline, deterministic, no provider). The authoritative fact about an item is ONE field, `position`
 * (`unknown | carried | equipped | stored`); owner is separate. Everything printed here is derived from it:
 *   inspectItem(itemId)         owner, position, which derived views contain the item
 *   inspectInventory(characterId) the inventory as every projection sees it, compared
 *   inspectPickupScenario()     runs the pickup / drop scenarios through the real TurnCoordinator and prints the whole chain
 */
type Fixture = ReturnType<typeof turnFixture>;
export interface ItemInspection {
  readonly item_id: string; readonly exists: boolean; readonly owner: string | null | undefined; readonly position: unknown; readonly revision: number;
  readonly in_inventory_of: readonly string[]; readonly at_location: string | undefined; readonly session_view_inventory: boolean; readonly ui_inventory: boolean; readonly controller_items_here: boolean;
}
export function inspectItem(f: Fixture, itemId: string): ItemInspection {
  const snapshot = f.campaign.exportSnapshot(), item = snapshot.items.find(i => i.id === itemId);
  const holders = [...new Set(snapshot.items.flatMap(i => i.position.kind === "carried" || i.position.kind === "equipped" ? [i.position.character_id] : []))].filter(c => inventoryItems(snapshot, c).some(i => i.id === itemId));
  const view = deriveSessionView(f.world, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  const context = buildTurnContext(f.world, snapshot);
  return { item_id: itemId, exists: !!item, owner: item?.owner_id, position: item?.position, revision: snapshot.revision, in_inventory_of: holders,
    at_location: item?.position.kind === "stored" ? item.position.location_id : undefined,
    session_view_inventory: view.player.inventory.some(i => i.id === itemId), ui_inventory: inventoryVisualView(snapshot, "nicco", f.world).some(i => i.id === itemId),
    controller_items_here: !!context.items_here?.some(i => i.id === itemId) };
}
export function inspectInventory(f: Fixture, characterId: string): { readonly derived: readonly string[]; readonly session_view: readonly string[]; readonly ui: readonly string[] } {
  const snapshot = f.campaign.exportSnapshot();
  const view = deriveSessionView(f.world, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  return { derived: inventoryItems(snapshot, characterId).map(i => i.id), session_view: characterId === "nicco" ? [...view.player.inventory.map(i => i.id), ...view.player.equipment.map(i => i.id)].sort() : [], ui: inventoryVisualView(snapshot, characterId, f.world).map(i => i.id) };
}

export const SWORD = "campaign_item_sword";
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
export const groundSword = (owner: string | null = "nicco", location = "test_room") => (f: Fixture) => { apply(f.campaign, { kind: "register_item", item: { id: SWORD, origin: { kind: "created" }, name: "Sword", owner_id: owner, position: { kind: "stored", location_id: location } } }); };
export const pickUp = (who = "nicco"): CampaignCommand => ({ kind: "place_item", item_id: SWORD, position: { kind: "carried", character_id: who } });
export const dropHere = (location = "test_room"): CampaignCommand => ({ kind: "place_item", item_id: SWORD, position: { kind: "stored", location_id: location } });

export interface PickupCase { readonly scenario: DiagnosticScenario; readonly fixture: () => Fixture; readonly current: () => Fixture }
export function pickupCase(s: Omit<DiagnosticScenario, "fixture">): PickupCase {
  let held: Fixture | undefined; const make = () => (held = turnFixture());
  return { scenario: { ...s, fixture: make }, fixture: make, current: () => held! };
}
export async function runPickupCase(c: PickupCase): Promise<{ readonly run: ScenarioRun; readonly fixture: Fixture; readonly item: ItemInspection; readonly inventory: ReturnType<typeof inspectInventory> }> {
  const run = await runScenario(c.scenario), fixture = c.current();
  return { run, fixture, item: inspectItem(fixture, SWORD), inventory: inspectInventory(fixture, "nicco") };
}
export const PICKUP_CASES: readonly PickupCase[] = [
  pickupCase({ id: "A", title: "Plain pickup, explicit", input: "I pick up the sword.", narration: "Nicco bends and picks up the sword.", controller: { kind: "commands", commands: [pickUp()], evidence: ["Nicco bends and picks up the sword."] }, setup: groundSword() }),
  pickupCase({ id: "B", title: "Pickup, italic narration", input: "*picks up the sword*", narration: "*Nicco bends and picks up the sword.*", controller: { kind: "commands", commands: [pickUp()], evidence: ["Nicco bends and picks up the sword."] }, setup: groundSword() }),
  pickupCase({ id: "C", title: "Pickup, controller omits", input: "I pick up the sword.", narration: "Nicco bends and picks up the sword.", controller: { kind: "none" }, setup: groundSword() }),
  pickupCase({ id: "D", title: "Pickup, item lies in ANOTHER location", input: "I pick up the sword.", narration: "Nicco bends and picks up the sword.", controller: { kind: "commands", commands: [pickUp()], evidence: ["Nicco bends and picks up the sword."] }, setup: groundSword("nicco", "test_hall") }),
  pickupCase({ id: "E", title: "Narration only looks at the sword", input: "I look at the sword.", narration: "Nicco looks at the sword on the floor.", controller: { kind: "commands", commands: [pickUp()], evidence: ["Nicco looks at the sword on the floor."] }, setup: groundSword() }),
  pickupCase({ id: "F", title: "Pickup of someone else's sword", input: "I pick up the sword.", narration: "Nicco bends and picks up the sword.", controller: { kind: "commands", commands: [pickUp()], evidence: ["Nicco bends and picks up the sword."] }, setup: groundSword("brenna") }),
  pickupCase({ id: "G", title: "Brenna picks it up", input: "I watch Brenna.", narration: "Brenna crouches and picks up the sword.", controller: { kind: "commands", commands: [pickUp("brenna")], evidence: ["Brenna crouches and picks up the sword."] }, setup: groundSword() }),
  pickupCase({ id: "H", title: "Pickup, pronoun receipt", input: "I pick up the sword.", narration: "Nicco kneels beside the sword. He picks it up and weighs it.", controller: { kind: "commands", commands: [pickUp()], evidence: ["He picks it up and weighs it."] }, setup: groundSword() }),
];
async function main(): Promise<void> {
  const only = process.argv[2];
  for (const c of PICKUP_CASES.filter(x => !only || x.scenario.id === only)) {
    const r = await runPickupCase(c);
    console.log(`${renderRun(r.run)}\nITEM: ${JSON.stringify(r.item)}\nINVENTORY: ${JSON.stringify(r.inventory)}\n`);
  }
}
if (process.argv[1] && /item-lifecycle-inspector\.js$/.test(process.argv[1])) await main();
