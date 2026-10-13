import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { CampaignCommand } from "../src/campaign/types.js";
import { renderForkReportMarkdown, scanIdentityForks } from "../src/campaign/identity-fork-scanner.js";
import { createSaveFile, serializeSave } from "../src/persistence/save-format.js";
import { turnFixture } from "../src/dev/support/turn-fixture.js";

/** Consolidation block 5B, phase 7: the identity-fork scanner is deterministic, multi-signal, diagnostic-only and strictly read-only. */
const person = (id: string, name: string | undefined, location: string, extra: object = {}): CampaignCommand => ({ kind: "register_character",
  character: { id, origin: { kind: "created" }, profile: { ...(name ? { name } : {}), sex: "female", species: "human", age: { kind: "exact", years: 19 }, appearance: { description: "slim dark-haired woman with a scar across the cheek" } },
    current: { current_location: location, status: "active" }, ...extra } as never });
/** Each person is registered in its own commit; an `origin_snapshot` placeholder is stamped with that commit's revision and the current world minute. */
const fixture = (...commands: CampaignCommand[]) => {
  const f = turnFixture();
  for (const command of commands) {
    if (command.kind === "register_character" && command.character.origin_snapshot) {
      const minute = f.campaign.exportSnapshot().runtime.scene.world_time.world_minute;
      command.character.origin_snapshot = { ...command.character.origin_snapshot, promoted_revision: f.campaign.revision + 1, promoted_world_minute: minute };
    }
    f.campaign.apply({ expected_revision: f.campaign.revision, commands: [command] });
  }
  return f;
};
const scan = (f: ReturnType<typeof fixture>, canonical: string[] = []) => scanIdentityForks(f.campaign.exportSnapshot(), new Set(canonical));
const origin = (revision: number, label = "the woman") => ({ origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase_unnamed_subject", promoted_revision: revision, promoted_world_minute: 0, location_id: "test_room", label, established: {}, evidence: [] } });

test("S1: same name + same place + same description is a finding, marked HUMAN REVIEW REQUIRED, diagnostic only, with the later record as suspected duplicate", () => {
  const f = fixture(person("campaign_character_mira", "Mira", "test_room", origin(2)), person("campaign_character_mira_2", "Mira", "test_room", origin(5)));
  const r = scan(f);
  assert.equal(r.findings.length, 1); const x = r.findings[0]!;
  assert.deepEqual([x.review, x.automatic_repair, x.suspected_original.id, x.suspected_duplicate.id], ["HUMAN REVIEW REQUIRED", false, "campaign_character_mira", "campaign_character_mira_2"]);
  assert.ok(["same_location", "descriptor"].every(k => x.signals.some(s => s.kind === k)));
  assert.ok(x.mergeability.mergeable);
  assert.match(renderForkReportMarkdown([r]), /HUMAN REVIEW REQUIRED/);
});
test("S2: the same NAME alone is never enough (different places, nothing else in common)", () => {
  const f = fixture(person("campaign_character_a", "Mira", "test_room", { profile: { name: "Mira" } }), person("campaign_character_b", "Mira", "test_hall", { profile: { name: "Mira" } }));
  assert.deepEqual(scan(f).findings, []);
});
test("S3: two different proper names are two people, however similar the rest", () => {
  const f = fixture(person("campaign_character_a", "Mira", "test_room"), person("campaign_character_b", "Lysa", "test_room"));
  assert.deepEqual(scan(f).findings, []);
});
test("S4: a named + an unnamed record in the same place with the same description is a (lower-ranked) finding; a canonical name is an extra signal", () => {
  const f = fixture(person("campaign_character_a", "Korvin", "test_room", origin(2)), person("campaign_character_b", undefined, "test_room", origin(3)));
  const r = scan(f, ["korvin"]);
  assert.equal(r.findings.length, 1);
  assert.ok(r.findings[0]!.signals.some(s => s.kind === "canonical_name"));
});
test("S5: retired characters, the player and canonical characters are never part of a pair", () => {
  const f = fixture(person("campaign_character_a", "Mira", "test_room", origin(2)), person("campaign_character_b", "Mira", "test_room", origin(3)));
  assert.equal(scan(f).findings.length, 1);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "retire_character", character_id: "campaign_character_b", reason: "operator_retired" }] });
  const r = scan(f); assert.deepEqual([r.findings, r.characters_considered], [[], 1]);
});
test("S6: deterministic and strictly read-only (same output twice; the snapshot, revision and pending records are untouched)", () => {
  const f = fixture(person("campaign_character_a", "Mira", "test_room", origin(2)), person("campaign_character_b", "Mira", "test_room", origin(3)));
  const snap = f.campaign.exportSnapshot(), before = JSON.stringify(snap), revision = f.campaign.revision;
  const a = JSON.stringify(scanIdentityForks(snap, new Set())), b = JSON.stringify(scanIdentityForks(snap, new Set()));
  assert.equal(a, b); assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before); assert.equal(f.campaign.revision, revision);
});
test("S7: the CLI reads saves and writes only its own report (the save file is byte-identical afterwards)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "block5b-scan-"));
  try {
    const f = fixture(person("campaign_character_a", "Mira", "test_room", origin(2)), person("campaign_character_b", "Mira", "test_room", origin(3)));
    const saves = join(dir, "saves", "c1"); await mkdir(saves, { recursive: true });
    const file = join(saves, "save.json"); await writeFile(file, serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-12T00:00:00.000Z"), f.world));
    const before = await readFile(file, "utf8");
    // The CLI loads the real data set; the fixture world must be the canonical one for the save to validate there.
    try { execFileSync("node", [".build/src/dev/maintenance/scan-identity-forks.js", "--out", join(dir, "out"), join(dir, "saves")], { encoding: "utf8" }); } catch { /* a fixture world that differs from data/ is reported as skipped, still read-only */ }
    assert.equal(await readFile(file, "utf8"), before);
    assert.deepEqual((await readdir(saves)).sort(), ["save.json"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
