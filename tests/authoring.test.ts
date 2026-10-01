import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { stringify } from "yaml";
import { inspectContext } from "../src/dev/inspect-context.js";
import { buildNarrativeContext, NARRATIVE_CONTEXT_LIMITS } from "../src/scene/narrative-context-builder.js";
import { RuntimeState } from "../src/world/runtime-state.js";
import { loadWorld } from "../src/world/loader.js";
import { document, location } from "./fixtures.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../src/dev/inspect-context.js", import.meta.url));
const ids = ["heartstone", "heartstone_cy", "heartstone_f1", "heartstone_lr", "heartstone_u1"];
/** Public square directly outside the tower (opening location); a city location, not part of the tower. */
const outside = "heartstone_square";

test("five Heartstone locations retain classification and explicit parent references", async () => {
  const world = await loadWorld("data");
  assert.deepEqual(world.getEntitiesByType("location").map(e => e.id).filter(id => id.startsWith("heartstone")).sort(), [...ids, outside].sort());
  assert.equal(world.getEntity(outside)!.parent, "calderan_west");
  assert.deepEqual(world.getEntitiesByType("character").map(e => e.id), ["arwen_woodsigner", "azael_melakor", "bartolomhew", "blackthorn", "boran_dravendark", "bram_kessel", "brother_aven", "brunna_keld", "captain_doran_hale", "cassian_valerius", "corvinus_morvath", "dren", "dunrig_iron_hands", "elspeth_vael", "garran_holt", "gaston", "gideon_melakor", "hadrik_voss", "halden_cross", "helbrecht", "iseult_morvath", "jessa_rook", "kaelen_dravendark", "korvin", "livia_marr", "lysandra_vell", "maelor_morvath", "marta_pell", "matthias_eld", "mira_thorne", "mistress_elara", "nicco", "niles_vanner", "odelia_crane", "oren_quarn", "orla_fen", "pellan", "rufus_tern", "seren_vael", "severan_krauss", "sister_mereth", "sister_veyra", "sun_emperor", "sybilla_melakor", "tavian_merrow", "uther_calderan", "vaelen_vael", "vorn_dravendark"]);
  for (const type of ["event", "item"] as const) assert.deepEqual(world.getEntitiesByType(type), []);
  for (const id of ids) {
    const entity = world.getEntity(id)!;
    // Phase 1R awareness audit: private-residence interiors are private; the rest stay unclassified.
    const awareness = ({ heartstone_lr: "private", heartstone_u1: "private" } as Record<string, string>)[id];
    assert.deepEqual(entity.knowledge, { visibility: { narrator: true, player: true }, known_by: [], ...(awareness ? { awareness } : {}) });
    assert.equal(entity.parent, id === "heartstone" ? "calderan_west" : "heartstone");
    assert.deepEqual(world.getAncestors(id).map(e => e.id), id === "heartstone" ? ["calderan_west", "calderan", "west", "continent"] : ["heartstone", "calderan_west", "calderan", "west", "continent"]);
    const context = await inspectContext(id);
    assert.equal(context.scene.player_location?.id, id);
    assert.equal(context.scene.player_location?.secret, false);
  }
  assert.equal(world.hasEntity("heartstone_l1"), false);
  assert.equal(world.hasEntity("heartstone_l1_living_room"), false);
  assert.equal(world.hasEntity("heartstone_lr_sofa"), false);
});

test("resolved topology has only LR-CY, LR-U1, LR-F1 and LR-square (main entrance) in both directions", async () => {
  const world = await loadWorld("data");
  const edges = world.getEntitiesByType("location").filter(e => e.id.startsWith("heartstone_")).flatMap(e => e.connections.filter(c => c.target.startsWith("heartstone_")).map(c => `${e.id}->${c.target}`)).sort();
  assert.deepEqual(edges, ["heartstone_cy->heartstone_lr", "heartstone_f1->heartstone_lr", "heartstone_lr->heartstone_cy", "heartstone_lr->heartstone_f1", "heartstone_lr->heartstone_square", "heartstone_lr->heartstone_u1", "heartstone_square->heartstone_lr", "heartstone_u1->heartstone_lr"]);
  const tower = world.getEntity("heartstone")!;
  assert.match(tower.content, /F1, F2, F3, F4, F5, and F6/);
  assert.match(tower.content, /F6 is the highest currently known floor/);
  for (let i = 2; i <= 6; i++) assert.equal(world.hasEntity(`heartstone_f${i}`), false);
});

test("LR NarrativeContext uses the production projection with bounded searchable features", async () => {
  const world = await loadWorld("data");
  const runtime = new RuntimeState(world, { player_location: "heartstone_lr", world_time: { world_minute: 0 } });
  const context = await inspectContext("heartstone_lr");
  assert.deepEqual(context, buildNarrativeContext(world, runtime));
  assert.equal(context.runtime_revision, 0);
  assert.deepEqual(context.scene.world_time, { world_minute: 0 });
  assert.deepEqual(context.scene.present_characters, []);
  assert.deepEqual(context.scene.location_ancestry.map(e => e.id), ["heartstone", "calderan_west", "calderan", "west", "continent"]);
  const lr = context.scene.player_location!;
  assert.equal(lr.id, "heartstone_lr"); assert.equal(lr.secret, false);
  assert(lr.features.length <= NARRATIVE_CONTEXT_LIMITS.features);
  assert(lr.content.length <= NARRATIVE_CONTEXT_LIMITS.content);
  assert(!JSON.stringify(context).includes('"heartstone_cy"'));
  assert(!JSON.stringify(context).includes('"heartstone_u1"'));
  // Named routes can occur in feature prose without projecting destination records.
  assert(!("connections" in lr));
  const source = world.getEntitiesByType("location").find(e => e.id === "heartstone_lr")!;
  assert.deepEqual(lr.features, source.features);
  assert(source.features.some(f => /large sofa/.test(f.name) && /large rug.*large sofa.*at least one armchair/.test(f.description)));
  assert(source.features.every(f => typeof f.name === "string" && typeof f.description === "string"));
  assert(Object.isFrozen(source.features));
  assert(!("search_text" in source)); // future indexing can read feature values directly
});

test("LR preserves supplied layout, three windows, conditional hearth, and no child rooms", async () => {
  const world = await loadWorld("data");
  const lr = world.getEntitiesByType("location").find(e => e.id === "heartstone_lr")!;
  assert.deepEqual(world.getChildren(lr.id), []);
  const prose = [lr.summary, lr.content, ...lr.features.map(f => f.description)].join(" ");
  for (const pattern of [/one large.*open-plan/, /roughly circular/, /old stone tower walls/, /solid and serviceable/, /massive.*heavy wooden/, /roughly opposite/, /Behind and to the left/i, /Exactly three modest/i, /one near the kitchen.*one near the main entrance.*one roughly left of the hearth/, /neither hidden nor concealed/, /hearth when lit/, /candles/]) assert.match(prose, pattern);
  assert(!/Gerome|window alcove|low wooden table|decorative plants|permanently lit|always burning/.test(prose));
});

test("LR refinement preserves open-plan identity and adds only relative feature layout", async () => {
  const world = await loadWorld("data");
  const lr = world.getEntitiesByType("location").find(e => e.id === "heartstone_lr")!;
  const feature = (name: string) => lr.features.find(f => f.name === name)!.description;
  assert.deepEqual(world.getChildren(lr.id), []);
  assert.match(feature("hearthside alcove"), /small physical alcove\/recess.*immediately to one side of the hearth/i);
  assert.match(feature("large stone hearth"), /along one side/);
  assert.match(feature("hearth seating area with large sofa"), /broadly central position relative to the hearth/);
  assert.match(feature("open kitchen area"), /broad curved perimeter section/);
  assert.match(feature("large table"), /away from the main entrance near the kitchen side/);
  assert.match(feature("large table"), /meals, communal eating, and convivial\/shared household use/);
  assert.match(feature("courtyard door"), /kitchen\/table side.*roughly opposite/);
  assert.match(feature("visible U1 hatch"), /lower\/outer part of the kitchen\/table side/);
  assert.match(feature("visible U1 hatch"), /separate from the upper-floor spiral staircase/);
  assert.match(feature("continuous spiral staircase"), /normal doorway\/opening.*perimeter.*away from the center/i);
  assert.match(feature("wall shelving"), /broad section.*perimeter near the stair-access side/i);
  assert.match(feature("massive main entrance door"), /opposite the courtyard side.*small entrance zone\/entry recess.*immediately inside/);
  assert(!/Gerome|Brenna|Maren|\bnorth\b|\bsouth\b|\beast\b|\bwest\b/.test(JSON.stringify(lr)));
  const tower = world.getEntitiesByType("location").find(e => e.id === "heartstone")!;
  assert.match(tower.content, /lateral\/peripheral, not a central tower core/);
  assert.match(tower.content, /each upper floor's central usable area comparatively open/);
  assert.match(tower.features.find(f => f.name === "continuous spiral staircase")!.description, /does not provide access to U1/);
});

test("F1 is sparse private observation canon with two patient stations and empty storage", async () => {
  const world = await loadWorld("data");
  const f1 = world.getEntitiesByType("location").find(e => e.id === "heartstone_f1")!;
  assert.equal(f1.parent, "heartstone");
  assert.deepEqual(f1.knowledge, { visibility: { narrator: true, player: true }, known_by: [] });
  assert.deepEqual(world.getChildren(f1.id), []);
  for (const fact of [/first upper floor/i, /open.plan/i, /private/i, /observation/i, /recovery/i, /two patient beds/i]) assert.match(f1.summary, fact);
  assert.deepEqual(f1.features.map(f => f.name), ["two patient stations", "wooden medical-storage cabinets", "lateral spiral stair access"]);
  const feature = (name: string) => f1.features.find(f => f.name === name)!.description;
  const stations = feature("two patient stations");
  for (const fact of [/two patient beds/i, /maximum.*capacity/i, /each bed/i, /one.*stool/i, /one.*(?:table|nightstand)/i, /one.*(?:wardrobe|cupboard)/i, /initially empty/i, /capacity.*not.*occupancy/i]) assert.match(stations, fact);
  const cabinets = feature("wooden medical-storage cabinets");
  for (const fact of [/one or two/i, /wooden cabinets/i, /opposite/i, /initially empty/i, /medicine/i, /dressings/i, /instruments/i, /supplies/i, /no inventory/i]) assert.match(cabinets, fact);
  for (const fact of [/side|perimeter/i, /central.*open/i, /downward.*LR/i, /upward.*F2/i]) assert.match(feature("lateral spiral stair access"), fact);
  assert.deepEqual(f1.connections.map(c => c.target), ["heartstone_lr"]);
  assert(!/Brenna|Maren|Gerome|window|lighting|wash basin|screen|curtain|desk|bookshel|magical|staff station|treatment table|operating equipment|lock|label/.test(JSON.stringify(f1)));
  // Feature text remains directly accessible for future derived indexing; no entities or index fields added.
  for (const cue of [/patient beds/, /bedside stool/, /bedside table/, /wardrobe/, /medicine storage/]) assert.match(f1.features.map(f => `${f.name} ${f.description}`).join(" "), cue);
  assert(!("search_text" in f1));
});

test("F1 NarrativeContext has compact root ancestry, no adjacent floors or household NPCs", async () => {
  const context = await inspectContext("heartstone_f1");
  assert.equal(context.scene.player_location!.id, "heartstone_f1");
  assert.equal(context.scene.player_location!.secret, false);
  assert.equal(context.scene.player_location!.features.length, 3);
  assert.deepEqual(context.scene.location_ancestry.map(e => e.id), ["heartstone", "calderan_west", "calderan", "west", "continent"]);
  assert(!("content" in context.scene.location_ancestry[0]!));
  assert.deepEqual(context.scene.present_characters, []);
  const json = JSON.stringify(context);
  assert(!json.includes('"heartstone_lr"'));
  assert(!json.includes('"heartstone_f2"')); // upward route prose is not an F2 record
  assert.equal(context.runtime_revision, 0);
  assert.equal(context.scene.world_time.world_minute, 0);
  const output = await execute(process.execPath, [cli, "heartstone_f1"]);
  assert.deepEqual(JSON.parse(output.stdout), context);
  assert.equal(output.stderr, "");
});

test("courtyard facilities stay features and medicinal beds are initially empty", async () => {
  const world = await loadWorld("data");
  const cy = world.getEntitiesByType("location").find(e => e.id === "heartstone_cy")!;
  assert.deepEqual(world.getChildren(cy.id), []);
  assert.deepEqual(cy.features.map(f => f.name), ["enclosing stone walls", "LR access door", "training area and dummies", "medicinal planting beds", "garden and tool shed", "practical work table", "tower-side bench", "woodshed and firewood storage", "clothesline", "rainwater collection barrel"]);
  assert.match(cy.features.find(f => f.name === "medicinal planting beds")!.description, /initially empty/);
  assert(!/wheel|well\b|fountain|animals|permanent crops/.test(JSON.stringify(cy)));
});

test("U1 lower descent remains an observable feature with no invented destination or secret answer", async () => {
  const world = await loadWorld("data");
  const u1 = world.getEntitiesByType("location").find(e => e.id === "heartstone_u1")!;
  const lower = u1.features.find(f => f.name === "old door and lower descending stairs")!;
  for (const fact of [/old door/i, /stairs.*descend/i, /below U1/i, /destination/i, /unknown|undefined/i]) assert.match(lower.description, fact);
  assert.deepEqual(world.getChildren(u1.id), []);
  assert.deepEqual(u1.connections.map(c => c.target), ["heartstone_lr"]);
  assert.match(u1.content, /not inherently claustrophobic/);
  assert.match(u1.content, /entirely stone/);
  assert.match(u1.content, /full extent is not completely understood or explored/);
  assert(!/treasure|monster|portal|tunnel|quest|magic|chamber/.test(JSON.stringify(u1)));
  const context = await inspectContext(u1.id);
  assert.equal(context.scene.player_location!.secret, false);
  assert(context.scene.player_location!.features.some(f => f.name === lower.name));
});

test("templates form valid authoring examples outside the runtime dataset", async () => {
  const templates = await loadWorld("docs/authoring/templates");
  for (const type of ["location", "character", "event", "faction", "item", "concept", "world_lore"] as const) {
    assert.equal(templates.getEntitiesByType(type).length, 1);
    assert.equal(templates.getEntitiesByType(type)[0]!.id, `template_${type}`);
  }
  const world = await loadWorld("data");
  assert.deepEqual(world.getEntitiesByType("location").map(e => e.id).filter(id => id.startsWith("heartstone")).sort(), [...ids, outside].sort());
  assert.equal(world.hasEntity("template_location"), false);
  // A single feature index contract is documented; no canonical synthetic field.
  const guide = await readFile("docs/authoring/AUTHORING_GUIDE.md", "utf8");
  assert.match(guide, /feature \*\*names and descriptions\*\*/);
  assert.match(guide, /entity_id.*chunk_id/s);
});

test("inspection CLI prints exactly the production JSON, is deterministic, and writes no canon", async () => {
  const dataFiles = (await readdir("data/locations", { recursive: true })).filter(f => /\.ya?ml$/.test(f)).sort();
  const before = await Promise.all(dataFiles.map(f => readFile(join("data/locations", f), "utf8")));
  const first = await execute(process.execPath, [cli, "heartstone_lr"]);
  const second = await execute(process.execPath, [cli, "heartstone_lr"]);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stdout, `${JSON.stringify(await inspectContext("heartstone_lr"), null, 2)}\n`);
  assert.deepEqual((await readdir("data/locations", { recursive: true })).filter(f => /\.ya?ml$/.test(f)).sort(), dataFiles);
  assert.deepEqual(await Promise.all(dataFiles.map(f => readFile(join("data/locations", f), "utf8"))), before);
});

for (const args of [[], ["missing"], ["heartstone_lr", "extra"]]) {
  test(`inspection CLI fails clearly for invalid arguments: ${args.join(" ")}`, async () => {
    await assert.rejects(execute(process.execPath, [cli, ...args]), (error: unknown) => {
      const e = error as Error & { code: number; stdout: string; stderr: string };
      assert.equal(e.code, 1); assert.equal(e.stdout, "");
      assert.match(e.stderr, /Context inspection failed:/);
      return true;
    });
  });
}

test("inspection does not bypass missing knowledge, hidden policy, or validation", async () => {
  const root = resolve(tmpdir());
  const directory = await mkdtemp(join(root, "caldrevan-authoring-test-"));
  const data = join(directory, "data");
  try {
    await mkdir(data);
    const entity = location("unclassified");
    const file = join(data, "unclassified.yaml");
    await writeFile(file, stringify(document(entity)));
    await assert.rejects(execute(process.execPath, [cli, "unclassified"], { cwd: directory }), (error: unknown) => {
      const e = error as Error & { code: number; stdout: string; stderr: string };
      assert.equal(e.code, 1); assert.equal(e.stdout, ""); assert.match(e.stderr, /unclassified primary-scene entity/); return true;
    });
    entity.knowledge = { visibility: { narrator: false, player: true }, known_by: [] };
    await writeFile(file, stringify(document(entity)));
    const hidden = await execute(process.execPath, [cli, "unclassified"], { cwd: directory });
    assert.equal(JSON.parse(hidden.stdout).scene.player_location, null);
    await writeFile(file, "schema_version: 2\n");
    await assert.rejects(inspectContext("unclassified", data), /schema version 1/);
  } finally {
    const rel = relative(root, resolve(directory));
    assert(rel && !rel.startsWith("..") && !rel.includes("/") && !rel.includes("\\") && basename(directory).startsWith("caldrevan-authoring-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
