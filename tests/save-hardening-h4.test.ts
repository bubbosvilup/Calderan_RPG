import test from "node:test";
import assert from "node:assert/strict";
import { migrateSave, CURRENT_SAVE_VERSION } from "../src/persistence/save-migrations.js";
import { createSaveFile, serializeSave, decodeSave, validateSaveFile } from "../src/persistence/save-format.js";
import { MAX_SAVE_BYTES } from "../src/persistence/strict-json.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { WorldStore } from "../src/world/world-store.js";
import { richCampaign, change, a, c } from "./persistence-fixtures.js";
import { fixtures, find, location, document, room, kitchen } from "./fixtures.js";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
const now = "2026-10-01T10:00:00.000Z";

/** NPC+ Pass 1: a real legacy envelope carries a schema-1 snapshot (no premium_characters domain). */
const legacySnapshot = ({ premium_characters: _premium, premium_reflections: _reflections, player_characters: _players, next_item_sequence: _items, ...snapshot }: Record<string, unknown>) => ({ ...snapshot, schema_version: 1 });
test("real legacy v1 envelope migrates to the current strict policy; unknown legacy fields are not discarded", () => {
  const { campaign, world } = richCampaign(), current = createSaveFile(campaign.exportSnapshot(), world, now);
  const { canon_compatibility: _policy, canon_references: _references, ...rest } = current;
  const old = { ...rest, schema_version: 1, snapshot: legacySnapshot(current.snapshot as unknown as Record<string, unknown>) };
  const loaded = decodeSave(JSON.stringify(old), world);
  assert.equal(loaded.schema_version, 5); assert.equal(loaded.canon_compatibility, "strict"); assert.equal(loaded.canon_references, undefined);
  assert.deepEqual(CampaignState.restore(world, loaded.snapshot).exportSnapshot(), campaign.exportSnapshot());
  assert.throws(() => validateSaveFile({ ...old, unknown_old: true }, world), { code: "invalid_save" });
  let invoked = false;
  assert.throws(() => validateSaveFile({ ...old, get unknown_old() { invoked = true; return "private"; } }, world), { code: "invalid_save" });
  assert.equal(invoked, false);
});

test("saving cannot manufacture compatibility evidence for a snapshot bound to another world", () => {
  const { campaign } = richCampaign(), sources = fixtures(); find(sources, room).entity.summary = "Changed";
  assert.throws(() => createSaveFile(campaign.exportSnapshot(), new WorldStore(sources), now), { code: "dataset_mismatch" });
});

test("corrupt legal holder is classified and cannot change live state", () => {
  const { campaign, world } = richCampaign(); change(campaign, { kind: "set_legal_status", character_id: c, status: "enslaved", holder_id: a });
  const before = campaign.exportSnapshot(), file = { ...createSaveFile(before, world, now),
    snapshot: { ...before, legal_statuses: before.legal_statuses.map(l => ({ ...l, holder_id: "missing" })) } };
  assert.throws(() => decodeSave(JSON.stringify(file), world), { code: "reference_invalid" }); assert.equal(campaign.exportSnapshot(), before);
});

for (const recovery of ["current_valid", "current_corrupt", "both_corrupt", "current_incompatible", "old_migratable"] as const)
  test(`explicit recovery policy: ${recovery}`, async t => {
    const root = await mkdtemp(join(tmpdir(), "caldrevan-h4-")); t.after(() => rm(root, { recursive: true, force: true }));
    const { campaign, world } = richCampaign(), repository = new FileCampaignRepository(world, root, { now: () => now });
    await repository.saveCampaign(campaign); const first = campaign.exportSnapshot();
    change(campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 1 } }); await repository.saveCampaign(campaign);
    const currentPath = join(root, campaign.exportSnapshot().campaign_id, "save.json"), previousPath = join(root, campaign.exportSnapshot().campaign_id, "save.previous.json");
    if (recovery === "current_corrupt" || recovery === "both_corrupt") await writeFile(currentPath, "{truncated");
    if (recovery === "both_corrupt") await writeFile(previousPath, "random");
    if (recovery === "current_incompatible") {
      const value = JSON.parse(await readFile(currentPath, "utf8")); value.canon_references[0].fingerprint = `sha256:${"0".repeat(64)}`;
      await writeFile(currentPath, JSON.stringify(value));
    }
    if (recovery === "old_migratable") {
      const value = JSON.parse(await readFile(currentPath, "utf8")); value.schema_version = 1; delete value.canon_compatibility; delete value.canon_references; value.snapshot.schema_version = 1; delete value.snapshot.premium_characters; delete value.snapshot.premium_reflections; delete value.snapshot.player_characters; delete value.snapshot.next_item_sequence;
      await writeFile(currentPath, JSON.stringify(value)); await writeFile(previousPath, "bad recovery");
    }
    const bytesBefore = await readFile(currentPath, "utf8"), stateBefore = campaign.exportSnapshot();
    // Save/Load v1 tiers: a fingerprint that no longer matches is content drift (warning), not an unloadable save.
    if (recovery === "current_incompatible") assert.deepEqual((await repository.loadCampaign(stateBefore.campaign_id)).canon.tier, "compatible_with_warnings");
    if (recovery === "current_corrupt" || recovery === "both_corrupt")
      await assert.rejects(repository.loadCampaign(stateBefore.campaign_id), { code: "invalid_json" });
    else if (recovery !== "current_incompatible") assert.deepEqual((await repository.loadCampaign(stateBefore.campaign_id)).campaign.exportSnapshot(), stateBefore);
    if (recovery === "both_corrupt" || recovery === "old_migratable") await assert.rejects(repository.loadCampaign(stateBefore.campaign_id, "previous"), { code: "invalid_json" });
    else assert.deepEqual((await repository.loadCampaign(stateBefore.campaign_id, "previous")).campaign.exportSnapshot(), first);
    assert.equal(await readFile(currentPath, "utf8"), bytesBefore); assert.equal(campaign.exportSnapshot(), stateBefore);
  });

test("migration seam fills a future domain, preserves unknown data, validates strictly and runs ordered steps", () => {
  assert.equal(CURRENT_SAVE_VERSION, 5);
  const old = { schema_version: 1, domains: { retained: ["value"] }, unknown_old: "keep" };
  const registry = {
    1: (input: Readonly<Record<string, unknown>>) => ({ ...input, schema_version: 2, domains: { ...(input.domains as object), example_future_domain: [] } }),
    2: (input: Readonly<Record<string, unknown>>) => ({ ...input, schema_version: 3 }),
  };
  const migrated = migrateSave(old, 3, registry) as typeof old & { domains: { example_future_domain: unknown[] } };
  assert.deepEqual(migrated.domains.example_future_domain, []); assert.equal(migrated.unknown_old, "keep");
  assert.deepEqual(old, { schema_version: 1, domains: { retained: ["value"] }, unknown_old: "keep" });
  const validate = (value: unknown) => {
    const v = value as Record<string, unknown>;
    if (Object.keys(v).some(key => !["schema_version", "domains"].includes(key)) || !(v.domains as Record<string, unknown>).example_future_domain) throw new Error("strict schema");
    return v;
  };
  assert.throws(() => validate(migrated), /strict schema/);
  const policy = { 1: (input: Readonly<Record<string, unknown>>) => {
    const { unknown_old: _explicitlyRetired, ...kept } = input;
    return { ...kept, schema_version: 2, domains: { ...(input.domains as object), example_future_domain: [] } };
  } };
  assert.equal(validate(migrateSave(old, 2, policy)).schema_version, 2);
});

for (const [name, input, current, registry, code] of [
  ["current", { schema_version: 1 }, 1, {}, undefined],
  ["ancient", { schema_version: 0 }, 1, {}, "unsupported_version"],
  ["future", { schema_version: 2 }, 1, {}, "unsupported_version"],
  ["malformed", { schema_version: "1" }, 1, {}, "invalid_save"],
  ["missing", {}, 1, {}, "invalid_save"],
  ["missing step", { schema_version: 1 }, 3, { 1: (s: object) => ({ ...s, schema_version: 2 }) }, "unsupported_version"],
  ["skipped version", { schema_version: 1 }, 3, { 1: () => ({ schema_version: 3 }) }, "migration_failed"],
  ["cycle", { schema_version: 1 }, 2, { 1: () => ({ schema_version: 1 }) }, "migration_failed"],
  ["throws", { schema_version: 1 }, 2, { 1: () => { throw new Error("private details"); } }, "migration_failed"],
] as const) test(`migration matrix: ${name}`, () => {
  if (code) assert.throws(() => migrateSave(input, current, registry), { code }); else assert.equal(migrateSave(input, current, registry), input);
});

test("invalid migration output cannot reach restore or alter live state", () => {
  const { campaign, world } = richCampaign(), before = campaign.exportSnapshot();
  const bad = migrateSave({ schema_version: 1 }, 2, { 1: () => ({ schema_version: 2, snapshot: { broken: true } }) });
  assert.throws(() => validateSaveFile(bad, world), { code: "migration_failed" }); // the real 2 -> 3 step rejects a broken snapshot
  assert.equal(campaign.exportSnapshot(), before);
  const invalidCurrent = migrateSave({ schema_version: 1 }, 2, { 1: () => ({ schema_version: 2, snapshot: { broken: true } }) }) as Record<string, unknown>;
  // NPC+ Pass 1: the real 2 -> 3 step inspects the snapshot, so broken legacy output now fails inside migration.
  assert.throws(() => validateSaveFile({ ...invalidCurrent, schema_version: 1 }, world), { code: "migration_failed" });
});

for (const scenario of ["opening", "rich", "legal_purchase", "late_named"] as const) test(`semantic save round trip: ${scenario}`, () => {
  const { world, campaign } = richCampaign();
  const selected = scenario === "opening" ? new CampaignState(world, "opening", { player_location: room, world_time: { world_minute: 0 } }) : campaign;
  if (scenario === "legal_purchase") {
    change(selected, { kind: "set_funds", character_id: a, gold: 20 }, { kind: "set_legal_status", character_id: c, status: "enslaved", holder_id: "brenna" });
    change(selected, { kind: "transfer_person", transaction_id: "campaign_transaction_purchase", transaction_kind: "sale", character_id: c,
      from_holder_id: "brenna", to_holder_id: a, payment: { payer_id: a, payee_id: "brenna", gold: 5 }, documentation: "documented" });
  }
  if (scenario === "late_named") change(selected, { kind: "set_profile", character_id: c, profile: { name: "Late Name" } });
  const before = selected.exportSnapshot(), text = serializeSave(createSaveFile(before, world, now), world);
  assert.deepEqual(CampaignState.restore(world, decodeSave(text, world).snapshot).exportSnapshot(), before);
  assert.equal(selected.exportSnapshot(), before);
});

for (const [name, text, code] of [
  ["truncated", "{", "invalid_json"], ["empty", "", "invalid_json"], ["random", "random text", "invalid_json"],
  ["top-level array", "[]", "invalid_save"], ["top-level null", "null", "invalid_save"],
  ["missing version", "{}", "invalid_save"], ["future version", '{"schema_version":99}', "unsupported_version"],
  ["oversized", " ".repeat(MAX_SAVE_BYTES + 1), "invalid_save"],
] as const) test(`corruption matrix: ${name}`, () => {
  const { campaign, world } = richCampaign(), before = campaign.exportSnapshot();
  assert.throws(() => decodeSave(text, world), { code }); assert.equal(campaign.exportSnapshot(), before);
});

for (const [name, mutate, code] of [
  ["timestamp", (f: any) => { f.metadata.saved_at = "yesterday"; }, "invalid_save"],
  ["missing domain", (f: any) => { delete f.snapshot.items; }, "invalid_save"],
  ["unknown field", (f: any) => { f.snapshot.extra = []; }, "invalid_save"],
  ["character ID", (f: any) => { f.snapshot.characters[0].id = "missing"; }, "reference_invalid"],
  ["relationship", (f: any) => { f.snapshot.relationships[0].to_character_id = "missing"; }, "reference_invalid"],
  ["location", (f: any) => { f.snapshot.runtime.scene.player_location = "missing"; }, "reference_invalid"],
  ["revision", (f: any) => { f.snapshot.revision = -1; }, "invalid_save"],
  ["manifest missing reference", (f: any) => { f.canon_references = []; }, "invalid_save"],
  ["manifest duplicate", (f: any) => { f.canon_references.push(f.canon_references[0]); }, "invalid_save"],
] as const) test(`corruption matrix: ${name}`, () => {
  const { campaign, world } = richCampaign(), before = campaign.exportSnapshot();
  const file = structuredClone(createSaveFile(before, world, now)); mutate(file);
  assert.throws(() => decodeSave(JSON.stringify(file), world), { code }); assert.equal(campaign.exportSnapshot(), before);
});

for (const drift of ["summary", "display_name", "unrelated_addition", "removed_location", "removed_npc", "structural_id", "unrelated_graph", "saved_graph"] as const)
  test(`canon drift: ${drift}`, () => {
    const { campaign, world } = richCampaign(), original = campaign.exportSnapshot();
    const text = serializeSave(createSaveFile(original, world, now), world), sources = fixtures();
    let expected: string | undefined;
    if (drift === "summary") find(sources, room).entity.summary = "New descriptive wording";
    if (drift === "display_name") find(sources, room).entity.display_name = "A New Label";
    if (drift === "unrelated_addition") sources.push({ source: "fixtures/new.yaml", document: document(location("unrelated_place")) });
    // Removing via structural renaming keeps synthetic WorldStore references internally valid.
    if (["removed_location", "removed_npc", "structural_id"].includes(drift)) {
      const target = drift === "removed_npc" ? "brenna" : room;
      const renamed = JSON.parse(JSON.stringify(sources).replaceAll(target, `${target}_replacement`)) as typeof sources;
      sources.splice(0, sources.length, ...renamed); expected = "reference_invalid";
    }
    if (drift === "unrelated_graph" || drift === "saved_graph") {
      const entity = find(sources, drift === "saved_graph" ? room : kitchen).entity;
      if (entity.type === "location") entity.connections.push({ target: "heartstone", description: "test path", minutes: 1 });
      // Save/Load v1: a structural edit to a referenced record loads with a drift warning (tier compatible_with_warnings).
    }
    const alternate = new WorldStore(sources);
    if (expected) assert.throws(() => decodeSave(text, alternate), { code: expected });
    else {
      const loaded = decodeSave(text, alternate);
      assert.deepEqual(CampaignState.restore(alternate, loaded.snapshot).exportSnapshot(), { ...original, dataset_id: alternate.datasetId });
      assert.doesNotThrow(() => serializeSave(loaded, alternate));
    }
    assert.equal(campaign.exportSnapshot(), original);
  });

