import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { WorldStore } from "../src/world/world-store.js";
import { findRoute, travelDestination } from "../src/world/travel.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { collect, mockController, mockNarrator } from "./turn-fixtures.js";
import { location, document } from "./fixtures.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
const world = await loadWorld("data");
const locs = world.getEntitiesByType("location");
const city = locs.filter(e => e.id === "calderan" || world.getAncestors(e.id).some(a => a.id === "calderan"));
const coordinator = (text: string) => {
  const service = new RetrievalService(world);
  return new TurnCoordinator(world, mockNarrator(text), mockController([]), { service, search: new HybridSearch(service) });
};
const benchmarks = [
  ["calderan_slave_market", "heartstone", 21], ["heartstone_square", "calderan_slave_market", 20],
  ["heartstone_square", "main_market_square", 30], ["heartstone_square", "calderan_civil_registry", 47],
  ["heartstone_square", "open_hand_chapel", 17], ["heartstone_square", "cathedral_of_the_bladed_sun", 58],
  ["center_west_road", "the_crucible", 40], ["center_west_road", "imperial_gate", 71],
  ["north_gate", "imperial_gate", 97],
] as const;
for (const [origin, requested, minutes] of benchmarks) test(`canonical end-to-end route ${origin} -> ${requested}`, async () => {
  const destination = travelDestination(world, requested);
  const route = findRoute(world, origin, destination)!;
  assert.ok(route);
  assert.equal(route.minutes, minutes);
  assert.deepEqual(findRoute(world, origin, destination), route);
  const campaign = new CampaignState(world, `route_${origin}_${requested}`, { player_location: origin, world_time: { world_minute: 0 } });
  const events = await collect(coordinator("Nicco arrives after walking through the city.").runTurn({ campaign, player_input: `/go ${requested}` }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
  assert.equal(campaign.exportSnapshot().runtime.scene.player_location, destination);
  assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, minutes);
  if (last.type === "turn_completed") assert.deepEqual(last.result.travel, route);
});

test("all authored places are reachable; containers never create edges; all reverse costs agree", () => {
  const containers = new Set(["calderan", "calderan_west", "calderan_north", "calderan_east", "calderan_south", "calderan_center", "heartstone"]);
  assert.equal(city.length, 78);
  for (const e of city) {
    const scene = new CampaignState(world, `scene_${e.id}`, { player_location: e.id, world_time: { world_minute: 0 } });
    assert.doesNotThrow(() => buildTurnContext(world, scene.exportSnapshot()), e.id);
    if (containers.has(e.id)) { assert.deepEqual(e.connections, []); assert.ok(e.entrance); }
    else assert.ok(findRoute(world, "heartstone_square", e.id), e.id);
    assert.ok(findRoute(world, "heartstone_square", travelDestination(world, e.id)), e.id);
    assert.equal(new Set(e.connections.map(c => c.target)).size, e.connections.length);
    for (const edge of e.connections) {
      assert.notEqual(e.id, edge.target);
      assert.ok(Number.isSafeInteger(edge.minutes) && edge.minutes > 0);
      const reverse = locs.find(l => l.id === edge.target)?.connections.find(c => c.target === e.id);
      assert.equal(reverse?.minutes, edge.minutes, `${e.id} -> ${edge.target}`);
      assert.equal(reverse?.kind, edge.kind);
    }
  }
});

test("the inner and outer wall boundaries have exactly the authorized gates", () => {
  const inner = new Set(city.filter(e => e.parent === "calderan_center").map(e => e.id));
  const crossings = new Set<string>();
  const exterior = new Set(["imperial_road", "north_approach"]);
  const outer = new Set<string>();
  for (const e of city) for (const edge of e.connections) {
    if (inner.has(e.id) !== inner.has(edge.target)) crossings.add(inner.has(e.id) ? e.id : edge.target);
    if (exterior.has(e.id) !== exterior.has(edge.target)) outer.add(exterior.has(e.id) ? edge.target : e.id);
  }
  assert.deepEqual([...crossings].sort(), ["center_east_gate", "center_west_gate"]);
  assert.deepEqual([...outer].sort(), ["imperial_gate", "north_gate"]);
  assert.deepEqual(city.filter(e => e.tags.includes("gate") || e.id === "imperial_gate").map(e => e.id).sort(), ["center_east_gate", "center_west_gate", "imperial_gate", "north_gate"]);
  for (const [from, to, bridge] of [["west_arterial_north", "north_arterial_west", "northwest_bridge"], ["center_west_road", "gilded_row", "center_bridge"], ["south_arterial", "east_arterial_south", "southeast_bridge"], ["center_west_road", "ducal_citadel", "citadel_bridge"]]) {
    assert.ok(findRoute(world, from!, to!)!.nodes.includes(bridge!));
  }
});

test("shortest duration wins over hop count; equal costs ignore authored edge order; disconnected and same-node routes", () => {
  const entities = ["origin", "alpha", "beta", "destination", "isolated"].map(id => location(id));
  entities[0]!.connections = [{ target: "destination", description: "slow", minutes: 9 }, { target: "beta", description: "b", minutes: 2 }, { target: "alpha", description: "a", minutes: 2 }];
  for (const e of entities.slice(1, 3)) e.connections = [{ target: "destination", description: "arrival", minutes: 2 }];
  const make = () => new WorldStore(entities.map(e => ({ source: `${e.id}.yaml`, document: document(e) })));
  const first = findRoute(make(), "origin", "destination");
  assert.deepEqual(first?.nodes, ["origin", "alpha", "destination"]);
  entities[0]!.connections.reverse();
  assert.deepEqual(findRoute(make(), "origin", "destination"), first);
  assert.equal(findRoute(make(), "origin", "isolated"), undefined);
  assert.equal(findRoute(make(), "absent", "destination"), undefined);
  assert.equal(findRoute(make(), "origin", "origin")?.minutes, 0);
});

test("edge schema rejects missing, zero, negative, fractional, unsafe costs and invalid topology", () => {
  for (const cost of [undefined, 0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const e = location("origin");
    const source = { source: "bad.yaml", document: { ...document(e), entity: { ...e, connections: [{ target: "destination", description: "bad", minutes: cost }] } } };
    assert.throws(() => new WorldStore([source, { source: "dest.yaml", document: document(location("destination")) }]), /minutes/);
  }
  for (const targets of [["origin"], ["missing"], ["destination", "destination"]]) {
    const e = location("origin"); e.connections = targets.map(target => ({ target, description: "bad", minutes: 1 }));
    assert.throws(() => new WorldStore([{ source: "bad.yaml", document: document(e) }, { source: "dest.yaml", document: document(location("destination")) }]));
  }
});

test("travel crosses day boundary once, preserves atomic failure and survives save/load", async () => {
  const campaign = new CampaignState(world, "route_day", { player_location: "heartstone_square", world_time: { world_minute: 1430 } });
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { mana_delta: -50 } }] });
  const before = campaign.exportSnapshot();
  assert.throws(() => playerIntent("/go silent_ocean", buildTurnContext(world, before), before, world));
  assert.equal(campaign.exportSnapshot(), before);
  const service = new RetrievalService(world);
  const fail = new TurnCoordinator(world, { async generate() { throw Error("offline"); }, async *stream() { throw Error("offline"); } }, mockController([]), { service, search: new HybridSearch(service) });
  const failed = await collect(fail.runTurn({ campaign, player_input: "/go calderan_slave_market" }));
  assert.equal(failed.at(-1)!.type, "turn_failed");
  assert.equal(campaign.exportSnapshot(), before);
  const events = await collect(coordinator("Nicco reaches the market.").runTurn({ campaign, player_input: "go to the Slave Market" }));
  assert.equal(events.at(-1)!.type, "turn_completed");
  const after = campaign.exportSnapshot();
  assert.equal(after.runtime.scene.world_time.world_minute, 1450);
  assert.equal(after.runtime.mana.current, 75);
  const saved = decodeSave(serializeSave(createSaveFile(after, world, "2026-10-01T12:00:00.000Z"), world), world);
  assert.deepEqual(CampaignState.restore(world, saved.snapshot).exportSnapshot(), after);
});

test("natural action and bare movement destinations share the command route", () => {
  const campaign = new CampaignState(world, "phrases", { player_location: "heartstone_square", world_time: { world_minute: 0 } });
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  for (const [text, requested] of [["*walks to the Civil Registry*", "calderan_civil_registry"], ["head to the Cathedral", "cathedral_of_the_bladed_sun"], ["/go Center", "calderan_center"]]) {
    const intent = playerIntent(text!, context, snapshot, world);
    const route = findRoute(world, "heartstone_square", travelDestination(world, requested!))!;
    assert.deepEqual(intent.runtime, [{ kind: "runtime_delta", delta: { player_location: route.destination, time_advance_minutes: route.minutes } }]);
  }
});

test("an unreachable carry moves nobody and charges no time; failed narration rolls back both travellers", async () => {
  const campaign = new CampaignState(world, "carry_failure", { player_location: "calderan_slave_market", world_time: { world_minute: 100 } });
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "register_character", character: {
    id: "campaign_character_maren", origin: { kind: "created" }, profile: { name: "Maren", sex: "female" },
    current: { current_location: "calderan_slave_market", status: "active" },
  } }] });
  const before = campaign.exportSnapshot();
  const blocked = await collect(coordinator("Nicco holds Maren. They remain at the Slave Market.").runTurn({ campaign, player_input: "*carries Maren to the Silent Ocean*" }));
  assert.equal(blocked.at(-1)!.type, "turn_completed");
  assert.deepEqual(campaign.exportSnapshot(), before);
  const service = new RetrievalService(world);
  const fail = new TurnCoordinator(world, { async generate() { throw Error("offline"); }, async *stream() { throw Error("offline"); } }, mockController([]), { service, search: new HybridSearch(service) });
  const failed = await collect(fail.runTurn({ campaign, player_input: "*carries Maren back to Heartstone*" }));
  assert.equal(failed.at(-1)!.type, "turn_failed");
  assert.deepEqual(campaign.exportSnapshot(), before);
});
