import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CharacterPortraitVersion } from "../src/campaign/types.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { CANON_AVATAR_FILES, CANON_AVATAR_ROUTE, canonAvatarToken, canonAvatarUrl, readCanonAvatar } from "../src/app/canon-avatars.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { createSaveFile } from "../src/persistence/save-format.js";

/** Authored canonical NPC avatars: stable-id registry, UI-only, read-only, no state. The PNGs live in data/canonNPCAvatar/ (fixtures here are temp files). */
const world = await loadWorld("data");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const MAPPING: readonly [string, string, string][] = [["A1", "korvin", "Korvin_avatar.png"], ["A2", "mistress_elara", "Elara_avatar.png"], ["A3", "bartolomhew", "Bartholomew_avatar.png"],
  ["A4", "blackthorn", "Blackthorn_avatar.png"], ["A5", "captain_doran_hale", "DoranHale_avatar.png"], ["A6", "brother_aven", "Aven_avatar.png"]];
async function assets(t: { after(fn: () => unknown): void }) {
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-canon-avatars-")); t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [, , file] of MAPPING) await writeFile(join(dir, file), PNG);
  return dir;
}
let serial = 0;
const campaign = (): CampaignState => { const c = createOpeningCampaign(world, `canon_avatar_${++serial}`); c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }] }); return c; };
/** Nicco knows the character by name (a named canon NPC shows its portrait even when not in the scene). */
const learn = (c: CampaignState, id: string) => { const cmds = learnCanonicalName(world, c.exportSnapshot(), id); if (cmds.length) c.apply({ expected_revision: c.revision, commands: cmds }); return c; };
const card = (c: CampaignState, id: string, dir: string) => playerCharacterProjection(world, c.exportSnapshot(), { canon_avatar_dir: dir }).project(id)!;

for (const [label, id, file] of MAPPING) test(`${label}: ${id} resolves its authored avatar through the explicit registry`, async t => {
  const dir = await assets(t);
  assert.ok(world.hasEntity(id), "a real authored character id");
  assert.equal(CANON_AVATAR_FILES[id], file);
  assert.equal(card(learn(campaign(), id), id, dir).avatar_url, `${CANON_AVATAR_ROUTE}${canonAvatarToken(id)}`);
  assert.deepEqual(await readCanonAvatar(canonAvatarToken(id)!, dir), PNG);
  assert.ok(!card(learn(campaign(), id), id, dir).avatar_url!.includes(id), "the URL never carries the authored id");
});
test("A7/A8/A16: drawer and round portrait read the one card.avatar_url (a single source image per character)", async () => {
  const client = await readFile("src/ui/client.js", "utf8");
  assert.match(client, /showImage\(ui\("character-avatar-image"\), card\.avatar_url\)/, "drawer");
  assert.match(client, /person\.card\?\.avatar_url;[\s\S]{0,200}setAttribute\("src", avatarUrl\)/, "scene round portrait (a non-player entry reads its card.avatar_url)");
  assert.match(client, /member\.card\?\.avatar_url[\s\S]{0,200}setAttribute\("src", member\.card\.avatar_url\)/, "household round portrait");
  assert.doesNotMatch(client, /canonNPCAvatar|_avatar\.png|canon-avatar/, "the client derives no path of its own");
});
test("A9: a character without an authored avatar, or with a missing asset file, keeps the passive placeholder", async t => {
  const dir = await assets(t), c = campaign();
  assert.equal(card(c, "mira_thorne", dir).avatar_url, null);
  assert.equal(card(c, "korvin", join(dir, "nowhere")).avatar_url, null, "registered but the file is absent");
});
test("A10/A11/A12: an authored avatar grants no NPC+ capability, changes no household or campaign state, and stores nothing", async t => {
  const dir = await assets(t), c = learn(campaign(), "korvin"), before = JSON.stringify(c.exportSnapshot());
  const view = card(c, "korvin", dir);
  assert.equal(view.character_capabilities.tier, "world_canon");
  assert.deepEqual([view.character_capabilities.can_edit_npc_plus, view.character_capabilities.can_generate_avatar, view.character_capabilities.can_show_gallery, view.character_capabilities.can_show_full_body, view.character_capabilities.can_upload_avatar], [false, false, false, false, false]);
  assert.equal(view.npc_plus, false); assert.equal(view.household, false); assert.equal(view.appearance_editor, null);
  assert.equal(JSON.stringify(c.exportSnapshot()), before, "projection writes nothing");
  assert.ok(!/canonNPCAvatar|canon-avatar|_avatar\.png/.test(before));
  assert.equal(c.exportSnapshot().premium_characters.length, 0);
  assert.equal(createSaveFile(c.exportSnapshot(), world, "2026-10-11T00:00:00.000Z").schema_version, 8);
});
test("A13/A14: a promoted canon NPC keeps the authored avatar as fallback and a selected NPC+ avatar supersedes it", async t => {
  const dir = await assets(t), c = learn(campaign(), "korvin");
  const apply = (...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
  apply({ kind: "register_character", character: { id: "korvin", origin: { kind: "canonical", canonical_entity_id: "korvin" }, profile: {}, current: { status: "active" } } }, { kind: "move_character", character_id: "korvin", location_id: "heartstone_lr" });
  const before = card(c, "korvin", dir);
  apply({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" });
  const promoted = card(c, "korvin", dir);
  assert.equal(promoted.ref, before.ref, "same identity"); assert.equal(c.exportSnapshot().characters.filter(x => x.id === "korvin").length, 1);
  assert.equal(promoted.character_capabilities.tier, "npc_plus"); assert.equal(promoted.avatar_url, `${CANON_AVATAR_ROUTE}${canonAvatarToken("korvin")}`, "fallback until an avatar is selected");
  const version: CharacterPortraitVersion = { version_id: "portrait_seed_1", prompt_version: "portrait-prompt-v1", prompt_fingerprint: "0123456789abcdef", model: "m", created_at: "2026-10-11T00:00:00.000Z", media_type: "image/png", asset_file: "portrait_seed_1.png", kind: "avatar" };
  apply({ kind: "record_portrait_batch", character_id: "korvin", versions: [version], avatar_version_id: "portrait_seed_1" });
  const selected = card(c, "korvin", dir).avatar_url!;
  assert.match(selected, /^\/api\/portrait\/asset\/[0-9a-f]{32}$/, "the selected NPC+ avatar wins"); assert.notEqual(selected, promoted.avatar_url);
});
test("A15: no path is built from display names or request text; unknown, path-like and unregistered ids are never served", async t => {
  const dir = await assets(t), { world: w, campaign: fc } = turnFixture();
  const root = await mkdtemp(join(tmpdir(), "caldrevan-canon-srv-")); t.after(() => rm(root, { recursive: true, force: true }));
  const store = new PortraitAssetStore(root, { layout: "campaign" }), repo = new FileCampaignRepository(w, root);
  const session = GameSession.fromCampaign({ world: w, repository: repo, portrait_store: store, portrait_generator: { identity: { provider: "test", model: "test" }, async generate() { throw new Error("no image calls"); } }, createCoordinator: () => ({ async *runTurn() {} }) }, fc);
  const server = createPlaytestServer(session, undefined, undefined, dir); server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const ok = await fetch(`${base}/api/canon-avatar/${canonAvatarToken("korvin")}`); assert.equal(ok.status, 200); assert.equal(ok.headers.get("content-type"), "image/png"); assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
  for (const bad of ["korvin", "Korvin", "korvin.png", "..%2F..%2Fpackage.json", "mira_thorne", "__proto__", "constructor", "Mistress%20Elara", "korvin/../elara"]) assert.equal((await fetch(`${base}/api/canon-avatar/${bad}`)).status, 404, bad);
  assert.equal(await readCanonAvatar("../package.json", dir), undefined); assert.equal(await readCanonAvatar("korvin", dir), undefined, "ids are not tokens"); assert.equal(canonAvatarUrl("constructor", dir), null);
  const source = await readFile("src/app/canon-avatars.ts", "utf8");
  assert.doesNotMatch(source, /`[^`]*\$\{[^}]*name[^}]*\}[^`]*_avatar/i, "no template path from a name");
});
test("no avatar path or metadata reaches narrator context, scene projection, retrieval or lore", async () => {
  for (const file of ["src/turn/context/context-builder.ts", "src/turn/context/scene-state-projection.ts", "src/turn/context/scene-state-render.ts", "src/turn/context/prompt-builder.ts", "src/retrieval/retrieval-service.ts"]) assert.doesNotMatch(await readFile(file, "utf8"), /canon-avatars|canonNPCAvatar|CANON_AVATAR/, file);
  assert.deepEqual(Object.keys(CANON_AVATAR_FILES).sort(), MAPPING.map(m => m[1]).sort());
});

test("the six registered files exist in data/canonNPCAvatar/ as real PNGs, and every registered id resolves a URL with the default directory", async () => {
  const world2 = world, c = campaign(); for (const [, id] of MAPPING) learn(c, id);
  for (const [, id, file] of MAPPING) {
    const bytes = await readFile(join("data/canonNPCAvatar", file));
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${file} is a PNG`);
    assert.equal(canonAvatarUrl(id), `${CANON_AVATAR_ROUTE}${canonAvatarToken(id)}`);
    assert.equal(playerCharacterProjection(world2, c.exportSnapshot()).project(id)!.avatar_url, `${CANON_AVATAR_ROUTE}${canonAvatarToken(id)}`);
  }
});

test("an unnamed canonical NPC who is not in the scene shows no portrait (no identity reveal); the URL token never carries the id", async t => {
  const dir = await assets(t), c = campaign();
  assert.equal(card(c, "korvin", dir).avatar_url, null);
});
