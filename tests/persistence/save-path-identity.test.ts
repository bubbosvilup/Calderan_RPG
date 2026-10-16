import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { nodeSaveFileSystem, type SaveFileSystem } from "../../src/persistence/filesystem.js";
import { richCampaign } from "../support/persistence-fixtures.js";

/**
 * Windows persistence portability (found by the first Windows CI run: 163 `unsafe_path` failures). The save directory guard must establish
 * filesystem IDENTITY, not textual equality: a legitimate directory may be reached through a spelling that differs from its canonical one (an 8.3
 * short name such as `RUNNER~1`, or different case) and must be accepted, while a link, a junction or any component that resolves outside the
 * verified tree must still be refused. Nothing here trusts how a name looks.
 *
 * The alias is simulated at the SaveFileSystem seam, which is the boundary the guard uses: `aliasing(map)` makes the filesystem answer for an alias
 * segment exactly as Windows does for a short name (every operation reaches the real directory, `realpath` returns the canonical spelling).
 */
async function temporary(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "caldrevan-path-identity-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

/** A filesystem in which `alias` segments name the directory spelled `map[alias]`; realpath yields the canonical (real) spelling. */
function aliasing(map: Readonly<Record<string, string>>): SaveFileSystem {
  const translate = (path: string) => path.split(sep).map(segment => map[segment] ?? segment).join(sep);
  const wrapped = { ...nodeSaveFileSystem } as Record<string, unknown>;
  for (const [name, original] of Object.entries(nodeSaveFileSystem)) {
    if (typeof original !== "function") continue;
    wrapped[name] = (...args: unknown[]) => (original as (...a: unknown[]) => unknown).apply(nodeSaveFileSystem, args.map(arg => (typeof arg === "string" ? translate(arg) : arg)));
  }
  return wrapped as unknown as SaveFileSystem;
}

test("a legitimate directory reached through an alias spelling (8.3 short name, case) is accepted and saves round-trip", async t => {
  const base = await temporary(t), { world, campaign } = richCampaign();
  await fs.mkdir(join(base, "RealLongDirectoryName", "saves"), { recursive: true });
  const filesystem = aliasing({ "REALLO~1": "RealLongDirectoryName" });
  const root = join(base, "REALLO~1", "saves");
  const repository = new FileCampaignRepository(world, root, { filesystem });
  await repository.saveCampaign(campaign);
  const loaded = await repository.loadCampaign("fixture_campaign");
  assert.deepEqual(loaded.campaign.exportSnapshot(), campaign.exportSnapshot());
  // The bytes are in the real directory; the alias created nothing of its own.
  assert.ok((await fs.stat(join(base, "RealLongDirectoryName", "saves", "fixture_campaign", "save.json"))).isFile());
  assert.deepEqual(await fs.readdir(base), ["RealLongDirectoryName"]);
});

test("the guard trusts identity, not spelling: an alias-looking name that resolves outside the verified tree is refused", async t => {
  const base = await temporary(t), { world, campaign } = richCampaign();
  await fs.mkdir(join(base, "inside", "saves"), { recursive: true });
  await fs.mkdir(join(base, "elsewhere", "deeper", "saves"), { recursive: true });
  // `EVIL~1` is a regular directory under `inside` as far as lstat is concerned, but its canonical location is not a direct child of `inside`.
  const fake = aliasing({ "EVIL~1": "elsewhere" });
  const redirect: SaveFileSystem = { ...fake, realpath: async path => (path.split(sep).includes("EVIL~1") ? join(base, "elsewhere", "deeper") : nodeSaveFileSystem.realpath(path)) };
  await assert.rejects(new FileCampaignRepository(world, join(base, "inside", "EVIL~1", "saves"), { filesystem: redirect }).saveCampaign(campaign), { code: "unsafe_path" });
  await assert.rejects(new FileCampaignRepository(world, join(base, "EVIL~1", "deeper", "saves"), { filesystem: redirect }).saveCampaign(campaign), { code: "unsafe_path" });
  assert.deepEqual(await fs.readdir(join(base, "elsewhere", "deeper", "saves")), [], "nothing was written through the redirect");
});

test("a component that lstat reports as a link is refused even when its realpath is a direct child of the verified parent", async t => {
  const base = await temporary(t), { world, campaign } = richCampaign();
  await fs.mkdir(join(base, "saves", "real"), { recursive: true });
  const linkReported: SaveFileSystem = { ...nodeSaveFileSystem, info: async path => (path.endsWith(`${sep}alias`) ? { kind: "link", size: 0, links: 1 } : nodeSaveFileSystem.info(path)),
    realpath: async path => (path.endsWith(`${sep}alias`) ? join(base, "saves", "real") : nodeSaveFileSystem.realpath(path)) };
  await assert.rejects(new FileCampaignRepository(world, join(base, "saves", "alias"), { filesystem: linkReported }).saveCampaign(campaign), { code: "unsafe_path" });
});

test("a file where a directory is required is refused", async t => {
  const base = await temporary(t), { world, campaign } = richCampaign();
  await fs.writeFile(join(base, "saves"), "not a directory");
  await assert.rejects(new FileCampaignRepository(world, join(base, "saves"), {}).saveCampaign(campaign), { code: "unsafe_path" });
});
