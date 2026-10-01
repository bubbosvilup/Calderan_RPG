import test from "node:test";
import assert from "node:assert/strict";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { campaignId } from "../src/campaign/identity.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { WorldStore } from "../src/world/world-store.js";
import { findRoute, travelDestination } from "../src/world/travel.js";
import { loadWorld } from "../src/world/loader.js";
import type { LocationEntity, WorldEntity } from "../src/types/entities.js";
import { character, document, fixtures, location, room } from "./fixtures.js";

/**
 * Hardening H1: property / invariant coverage for the deterministic core. Deterministic generated and permutation cases only (seeded
 * PRNG, no external property-testing dependency): every run explores the same cases, so a failure is always reproducible.
 */
function prng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function permutations<T>(items: readonly T[]): T[][] { return items.length <= 1 ? [items.slice()] : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [x, ...p])); }
function campaign() { const world = new WorldStore(fixtures()); return { world, campaign: new CampaignState(world, "h1_properties", { player_location: room, world_time: { world_minute: 100 } }, { current: 50, max: 100 }) }; }
const fact = (n: number): CampaignCommand => ({ kind: "create_fact", fact: { id: campaignId("fact", `p${n}`), content: { kind: "campaign", statement: `Property fact ${n}.`, truth: "true" } } });
const funds = (gold: number): CampaignCommand => ({ kind: "set_funds", character_id: "nicco", gold });
const wait = (minutes: number): CampaignCommand => ({ kind: "runtime_delta", delta: { time_advance_minutes: minutes } });

// ------------------------------------------------------------------------------------------------ A. revision monotonicity
test("property A: a changed atomic batch increments the revision exactly once; a no-op batch never does (300 generated batches)", () => {
  const { campaign: c } = campaign(), rand = prng(0xC0FFEE);
  let facts = 0, gold = 0, changedBatches = 0, noopBatches = 0;
  for (let step = 0; step < 300; step++) {
    const batch: CampaignCommand[] = [], before = c.revision, snapshot = c.exportSnapshot();
    const size = Math.floor(rand() * 4);
    let expectChange = false;
    for (let k = 0; k < size; k++) {
      const r = rand();
      if (r < 0.3) { batch.push(fact(++facts)); expectChange = true; }
      else if (r < 0.55) { const g = Math.floor(rand() * 3) * 10; batch.push(funds(g)); if (g !== gold) expectChange = true; gold = g; }
      else if (r < 0.8) { batch.push(wait(1 + Math.floor(rand() * 5))); expectChange = true; }
      else batch.push(funds(gold)); // restating the current value: a no-op
    }
    const receipt = c.apply({ expected_revision: before, commands: batch });
    assert.equal(receipt.changed, expectChange, `step ${step}`);
    assert.equal(c.revision, before + (expectChange ? 1 : 0), `step ${step}: one increment per changed batch, never more`);
    if (!expectChange) assert.equal(c.exportSnapshot(), snapshot, `step ${step}: a no-op keeps the identical snapshot object`);
    expectChange ? changedBatches++ : noopBatches++;
  }
  assert.ok(changedBatches > 50 && noopBatches > 20, "the generator must exercise both outcomes");
});

// ------------------------------------------------------------------------------------------------ B. single-use receipts
test("property B: a receipt commits once; consumed, forged, cloned and foreign receipts never commit", () => {
  const { campaign: c } = campaign(), other = campaign().campaign;
  const receipt = c.prepare({ expected_revision: c.revision, commands: [fact(1)] });
  const clone = structuredClone(receipt), forged = { ...receipt };
  c.commit(receipt);
  const after = c.exportSnapshot();
  assert.throws(() => c.commit(receipt), /consumed|forged|foreign/i, "double commit");
  assert.throws(() => c.commit(clone), /consumed|forged|foreign/i, "structured clone");
  assert.throws(() => c.commit(forged), /consumed|forged|foreign/i, "spread copy");
  assert.throws(() => c.commit(null), /unknown preparation receipt/i);
  const foreign = other.prepare({ expected_revision: other.revision, commands: [fact(2)] });
  assert.throws(() => c.commit(foreign), /consumed|forged|foreign/i, "receipt from another campaign");
  assert.equal(c.exportSnapshot(), after, "rejected commits change nothing");
  other.commit(foreign); assert.equal(other.revision, 1, "the foreign receipt still belongs to its own campaign");
});

// ------------------------------------------------------------------------------------------------ C. stale receipts
test("property C: a receipt prepared against an older snapshot cannot mutate current state; stale proposals are refused", () => {
  const { campaign: c } = campaign();
  const stale = c.prepare({ expected_revision: c.revision, commands: [fact(1)] });
  c.apply({ expected_revision: c.revision, commands: [wait(5)] });
  const current = c.exportSnapshot();
  assert.throws(() => c.commit(stale), /stale/i);
  assert.equal(c.exportSnapshot(), current);
  assert.ok(!current.facts.some(f => f.id === campaignId("fact", "p1")));
  assert.throws(() => c.prepare({ expected_revision: c.revision - 1, commands: [fact(1)] }), /stale/i, "stale expected_revision");
  assert.throws(() => c.prepare({ expected_revision: c.revision + 1, commands: [fact(1)] }), /stale/i, "future expected_revision");
  // A no-op receipt is also bound to its base: it cannot be replayed after another change.
  const noop = c.prepare({ expected_revision: c.revision, commands: [] });
  c.apply({ expected_revision: c.revision, commands: [wait(1)] });
  assert.throws(() => c.commit(noop), /stale/i);
});

// ------------------------------------------------------------------------------------------------ D. order independence
test("property D: independent commands in every order (all 120 permutations) yield the same committed snapshot", () => {
  const commands = [fact(1), fact(2), fact(3), funds(40), wait(7)];
  const results = permutations(commands).map(order => { const { campaign: c } = campaign(); c.apply({ expected_revision: c.revision, commands: order }); return JSON.stringify(c.exportSnapshot()); });
  assert.equal(results.length, 120);
  assert.equal(new Set(results).size, 1, "irrelevant insertion order must not change the semantic result");
});

// ------------------------------------------------------------------------------------------------ E. stable-data comparison
test("property E: object-key insertion order never creates a false change or a different snapshot", () => {
  const forward: CampaignCommand = { kind: "create_fact", fact: { id: campaignId("fact", "keys"), content: { kind: "campaign", statement: "Key order fact.", truth: "true" } } };
  const reversed = JSON.parse('{"fact":{"content":{"truth":"true","statement":"Key order fact.","kind":"campaign"},"id":"' + campaignId("fact", "keys") + '"},"kind":"create_fact"}') as CampaignCommand;
  const a = campaign().campaign, b = campaign().campaign;
  a.apply({ expected_revision: 0, commands: [forward] }); b.apply({ expected_revision: 0, commands: [reversed] });
  assert.equal(JSON.stringify(a.exportSnapshot()), JSON.stringify(b.exportSnapshot()), "canonical snapshot regardless of input key order");
  a.apply({ expected_revision: a.revision, commands: [funds(25)] });
  const restated = JSON.parse('{"gold":25,"character_id":"nicco","kind":"set_funds"}') as CampaignCommand;
  const receipt = a.prepare({ expected_revision: a.revision, commands: [restated] });
  assert.equal(receipt.changed, false, "restating current data with reordered keys is a no-op");
  assert.equal(receipt.next_revision, a.revision);
});

// ------------------------------------------------------------------------------------------------ travel properties
type Edge = readonly [from: string, to: string, minutes: number];
function graphWorld(nodes: readonly { id: string; parent?: string | null }[], edges: readonly Edge[], order: (xs: number[]) => number[] = xs => xs) {
  const entities: WorldEntity[] = nodes.map(n => {
    const outgoing = edges.filter(e => e[0] === n.id);
    const connections = order(outgoing.map((_, i) => i)).map(i => ({ target: outgoing[i]![1], description: `to ${outgoing[i]![1]}`, minutes: outgoing[i]![2] }));
    return { ...location(n.id, n.parent ?? null), connections } satisfies LocationEntity;
  });
  entities.push(character("nicco", nodes[0]!.id, "player"));
  return new WorldStore(order(entities.map((_, i) => i)).map(i => ({ source: `h1/${entities[i]!.id}.yaml`, document: document(entities[i]!) })));
}
const NODES = ["a", "b", "c", "d", "e", "f"].map(id => ({ id: `h1_${id}` }));
const EDGES: Edge[] = [["h1_a", "h1_b", 2], ["h1_a", "h1_c", 1], ["h1_b", "h1_d", 2], ["h1_c", "h1_d", 3], ["h1_d", "h1_e", 4], ["h1_c", "h1_e", 9], ["h1_e", "h1_a", 1]];
test("route property: permuting outgoing-edge and entity declaration order never changes the selected route", () => {
  const reference = graphWorld(NODES, EDGES);
  const pairs = NODES.flatMap(o => NODES.map(d => [o.id, d.id] as const));
  const orders = [(xs: number[]) => xs.slice().reverse(), (xs: number[]) => { const r = prng(xs.length * 7919); return xs.slice().sort(() => r() - 0.5); },
    (xs: number[]) => [...xs.filter(x => x % 2), ...xs.filter(x => x % 2 === 0)]];
  for (const order of orders) {
    const permuted = graphWorld(NODES, EDGES, order);
    for (const [o, d] of pairs) assert.deepEqual(findRoute(permuted, o, d), findRoute(reference, o, d), `${o} -> ${d}`);
  }
});
test("route property: equal-cost ties break deterministically by node-ID sequence", () => {
  // a->b->d = 4 and a->c->d = 4: the tie goes to the lexically smaller node sequence (via b), in either declaration order.
  for (const order of [(xs: number[]) => xs, (xs: number[]) => xs.slice().reverse()]) {
    const route = findRoute(graphWorld(NODES, EDGES, order), "h1_a", "h1_d")!;
    assert.equal(route.minutes, 4); assert.deepEqual(route.nodes, ["h1_a", "h1_b", "h1_d"]);
  }
});
test("route property: unreachable stays a failure; non-locations and unknown IDs are never routed", () => {
  const w = graphWorld([...NODES, { id: "h1_island" }], EDGES);
  assert.equal(findRoute(w, "h1_a", "h1_island"), undefined);
  assert.equal(findRoute(w, "h1_island", "h1_a"), undefined);
  assert.equal(findRoute(w, "h1_a", "nicco"), undefined, "a character is not a destination");
  assert.equal(findRoute(w, "h1_a", "no_such_place"), undefined);
  assert.deepEqual(findRoute(w, "h1_a", "h1_a")?.minutes, 0, "origin == destination is the empty route");
});
test("route property (real Calderan graph): total minutes equal the sum of traversed authored edges, and routing never mutates WorldStore", async () => {
  const world = await loadWorld("data");
  const before = JSON.stringify(world.listEntities());
  const locations = world.getEntitiesByType("location").map(l => l.id), rand = prng(42);
  let routed = 0;
  for (let i = 0; i < 400; i++) {
    const o = locations[Math.floor(rand() * locations.length)]!, d = locations[Math.floor(rand() * locations.length)]!;
    const route = findRoute(world, o, d); if (!route) continue; routed++;
    assert.equal(route.minutes, route.edges.reduce((s, e) => s + e.minutes, 0), `${o} -> ${d}`);
    assert.deepEqual(route.nodes, [o, ...route.edges.map(e => e.target)]);
    for (const e of route.edges) {
      const from = world.getEntity(e.origin); assert.ok(from?.type === "location");
      assert.ok(from.type === "location" && from.connections.some(c => c.target === e.target && c.minutes === e.minutes), `${e.origin} -> ${e.target} must be an authored edge`);
    }
    assert.deepEqual(findRoute(world, o, d), route, "repeatable");
  }
  assert.ok(routed > 100, `exercised ${routed} real routes`);
  assert.equal(JSON.stringify(world.listEntities()), before, "WorldStore unchanged by routing");
});

// ------------------------------------------------------------------------------------------------ parent != travel
test("invariant: structural parent/child containment never creates travel adjacency", () => {
  const nodes = [{ id: "h1_district" }, { id: "h1_room_one", parent: "h1_district" }, { id: "h1_room_two", parent: "h1_district" }, { id: "h1_yard" }];
  const w = graphWorld(nodes, [["h1_yard", "h1_room_one", 3], ["h1_room_one", "h1_yard", 3]]);
  assert.equal(findRoute(w, "h1_room_one", "h1_room_two"), undefined, "siblings under one parent are not adjacent");
  assert.equal(findRoute(w, "h1_district", "h1_room_one"), undefined, "a parent is not connected to its children");
  assert.equal(findRoute(w, "h1_room_one", "h1_district"), undefined, "a child is not connected to its parent");
  assert.equal(findRoute(w, "h1_yard", "h1_room_two"), undefined, "reaching one child does not reach its sibling");
  assert.equal(findRoute(w, "h1_yard", "h1_room_one")?.minutes, 3, "only the authored edge routes");
  assert.equal(travelDestination(w, "h1_district"), "h1_district", "a container without an authored entrance does not resolve to a child");
});
test("invariant (real canon): district containers are not travel-adjacent to the places they contain", async () => {
  const world = await loadWorld("data");
  for (const district of ["calderan_center", "calderan_east", "calderan_north", "calderan_south", "calderan_west"]) {
    const entity = world.getEntity(district); assert.ok(entity?.type === "location");
    assert.deepEqual(entity.type === "location" ? entity.connections : null, [], `${district} has no authored connections`);
    const child = world.getEntitiesByType("location").find(l => l.parent === district)!;
    assert.equal(findRoute(world, district, child.id), undefined, `${district} -> ${child.id}`);
    assert.equal(findRoute(world, child.id, district), undefined, `${child.id} -> ${district}`);
  }
});
