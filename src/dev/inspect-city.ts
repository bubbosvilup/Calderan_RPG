import { loadWorld } from "../world/loader.js";
import { findRoute, travelDestination } from "../world/travel.js";

const world = await loadWorld("data");
const city = world.getEntitiesByType("location").filter(e => e.id === "calderan" || world.getAncestors(e.id).some(a => a.id === "calderan"));
const remaining = new Set(city.map(e => e.id)), components: string[][] = [];
while (remaining.size) {
  const pending = [[...remaining][0]!], component: string[] = [];
  while (pending.length) {
    const id = pending.pop()!;
    if (!remaining.delete(id)) continue;
    component.push(id);
    for (const e of city) if (e.id === id) pending.push(...e.connections.map(c => c.target));
    else if (e.connections.some(c => c.target === id)) pending.push(e.id);
  }
  components.push(component.sort());
}
const pairs = [
  ["heartstone_square", "the_coined_lie"], ["heartstone_square", "chevalier_fountain"],
  ["heartstone_square", "main_market_square"], ["heartstone_square", "calderan_slave_market"],
  ["heartstone_square", "center_west_gate"], ["heartstone_square", "calderan_civil_registry"],
  ["center_west_gate", "center_east_gate"], ["center_west_road", "imperial_gate"],
  ["north_gate", "imperial_gate"], ["calderan_slave_market", "heartstone_lr"],
];
let diameter: { origin: string; destination: string; minutes: number } | undefined;
for (const a of city.filter(e => e.connections.length)) for (const b of city.filter(e => e.connections.length)) {
  const route = findRoute(world, a.id, b.id);
  if (route && (!diameter || route.minutes > diameter.minutes)) diameter = { origin: a.id, destination: b.id, minutes: route.minutes };
}
console.log(JSON.stringify({ locations: city.length, added_nodes: city.filter(e => world.getProvenance(e.id)!.source_path.includes("routes/")).length,
  directed_edges: city.reduce((n, e) => n + e.connections.length, 0), components: components.length,
  largest_component: Math.max(...components.map(c => c.length)), isolated: components.filter(c => c.length === 1).flat(),
  unreachable_destinations: city.filter(e => !findRoute(world, "heartstone_square", travelDestination(world, e.id))).map(e => e.id),
  diameter, benchmarks: pairs.map(([from, to]) => findRoute(world, from!, to!)),
  inventory: city.map(e => ({ id: e.id, name: e.name, parent: e.parent, entrance: e.entrance,
    placement: e.features.find(f => f.name === "canonical map placement")?.description ?? e.summary,
    access: e.connections.map(c => ({ target: c.target, minutes: c.minutes, kind: c.kind })) })),
}, null, 2));
