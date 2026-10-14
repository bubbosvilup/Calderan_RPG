import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCampaignRepository, type SaveSlot } from "../../src/persistence/campaign-repository.js";
import { CURRENT_SAVE_VERSION } from "../../src/persistence/save-migrations.js";
import { turnFixture } from "../../src/dev/support/turn-fixture.js";

/**
 * Block B4 (P5, PER-4 fixtures part), user decision 3 of 2026-10-14: two REAL saves from earlier evaluation runs, copied byte for byte into
 * tests/fixtures/legacy-saves/ with provenance (tests/fixtures/provenance.json pins every hash). Both were written against the offline turn fixture world
 * (dataset sha256:fe4bc97e…), so they load against it with no canon drift. Each test works on a temporary copy; the fixtures are never written.
 *
 *   save5-snapshot6  envelope 5 / snapshot 6 (2026-10-09 item sprite smoke): current r7, previous r4, one rolling checkpoint r4; optional state still in
 *                    the snapshot (pre block 7), two ready item sprites.
 *   save8-stores     envelope 8 (2026-10-12 consolidation block 7 live run): r6, both optional-state markers, learning and media side stores, two NPC+.
 */
const world = turnFixture(false).world;
const FIXTURES = join("tests", "fixtures", "legacy-saves");
async function copyOf(t: TestContext, name: string): Promise<{ root: string; repository: FileCampaignRepository }> {
  const root = await fs.mkdtemp(join(tmpdir(), "caldrevan-legacy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(join(FIXTURES, name), root, { recursive: true });
  return { root, repository: new FileCampaignRepository(world, root, { now: () => "2026-10-14T12:00:00.000Z" }) };
}

test("legacy fixtures are bound to the offline turn fixture world", () => assert.equal(world.datasetId, "sha256:fe4bc97e8a39fd8dbbc2892afb5443a58b699c3c07321b57c0348363015ad82f"));

for (const [slot, revision, items, sprites] of [["current", 7, 8, 2], ["previous", 4, 7, 1], ["backup:r00000004-20261009T211218268Z.json", 4, 7, 1]] as const) {
  test(`save5-snapshot6 ${slot}: migrates from envelope 5 / snapshot 6 and loads unchanged in meaning`, async t => {
    const { repository } = await copyOf(t, "save5-snapshot6"), loaded = await repository.loadCampaign("turn_fixture", slot as SaveSlot), s = loaded.campaign.exportSnapshot();
    assert.equal(loaded.migrated_from, 5); assert.equal(loaded.snapshot_migrated_from, 6);
    assert.equal(s.revision, revision); assert.equal(s.items.length, items); assert.equal(s.items.filter(i => i.sprite?.status === "ready").length, sprites);
    assert.deepEqual(loaded.optional_state_source, { learning: "legacy_snapshot", media: "legacy_snapshot" });
    assert.equal(loaded.canon.drifted_references.length, 0); assert.equal(loaded.canon.unverified, false);
  });
}

test("save5-snapshot6: the first save by this build migrates it to the current envelope with side stores, compact, and it reloads identically", async t => {
  const { root, repository } = await copyOf(t, "save5-snapshot6"), loaded = await repository.loadCampaign("turn_fixture");
  const before = loaded.campaign.exportSnapshot();
  await repository.saveCampaign(loaded.campaign, { metadata: { save_reason: "manual" } });
  const text = await fs.readFile(join(root, "turn_fixture", "save.json"), "utf8");
  assert.equal(JSON.parse(text).schema_version, CURRENT_SAVE_VERSION); assert.equal(text.slice(0, -1).includes("\n"), false);
  const again = await repository.loadCampaign("turn_fixture");
  assert.deepEqual(again.campaign.exportSnapshot(), before);
  assert.deepEqual(again.optional_state_source, { learning: "side_store", media: "side_store" });
  assert.equal((await repository.loadCampaign("turn_fixture", "previous")).campaign.revision, 7, "the previous slot is the legacy file, still loadable");
});

test("save8-stores: loads with both side stores, and a save and reload by this build keeps the state", async t => {
  const { repository } = await copyOf(t, "save8-stores"), loaded = await repository.loadCampaign("turn_fixture"), s = loaded.campaign.exportSnapshot();
  assert.equal(loaded.migrated_from, undefined); assert.equal(s.revision, 6); assert.equal(s.premium_characters.length, 2); assert.equal(s.items.length, 8);
  assert.deepEqual(loaded.optional_state_source, { learning: "side_store", media: "side_store" });
  assert.ok(loaded.continuity, "the recent conversation is restored");
  await repository.saveCampaign(loaded.campaign, { metadata: { save_reason: "manual" } });
  assert.deepEqual((await repository.loadCampaign("turn_fixture")).campaign.exportSnapshot(), s);
});
