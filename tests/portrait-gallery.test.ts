import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import { portraitFingerprint } from "../src/campaign/portrait-prompt.js";
import { portraitItemToken, MAX_PORTRAIT_VERSIONS } from "../src/campaign/portraits.js";
import { parseCampaignSnapshot } from "../src/campaign/validation.js";
import { applyAppearancePatch } from "../src/campaign/permanent-appearance.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CharacterPortraitVersion } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { TurnRequest } from "../src/turn/turn-types.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { GameSession, type SessionDeps } from "../src/app/index.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { DEFAULT_PORTRAIT_IMAGE_CONFIG, ImageGenerationError, type PortraitImageGenerator, type ImageReference } from "../src/llm/openrouter/image-client.js";
import { mockController, mockNarrator } from "./turn-fixtures.js";

/** Portrait Gallery + Avatar/Full-Body roles V2: the full session lifecycle with a fake generator. No paid calls. */
const world = await loadWorld("data");
const LR = "heartstone_lr";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString("base64");
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "caldrevan-gallery-")); dirs.push(d); return d; };
let serial = 0;
const tick = () => new Promise(resolve => setImmediate(resolve));

/**
 * Each call returns a valid PNG whose final byte is the call's index, so a stored file identifies the candidate it came from.
 * `plan(i)` fails call i; `gate` holds every call open (to observe concurrency and interleave other operations).
 */
class FakeGenerator implements PortraitImageGenerator {
  readonly config = DEFAULT_PORTRAIT_IMAGE_CONFIG;
  calls: { prompt: string; references: readonly ImageReference[] }[] = [];
  plan: (index: number) => ImageGenerationError | undefined = () => undefined;
  gate: Promise<void> | undefined; cost: number | undefined = 0.018; active = 0; maxActive = 0;
  async generate(request: { prompt: string; references?: readonly ImageReference[] }) {
    const index = this.calls.length;
    this.calls.push({ prompt: request.prompt, references: request.references ?? [] });
    this.active++; this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (this.gate) await this.gate; else await tick();
      const failure = this.plan(index);
      if (failure) throw failure;
      return { bytes: Buffer.concat([Buffer.from(PNG, "base64"), Buffer.from([index])]), media_type: "image/png" as const, model: this.config.model, ...(this.cost !== undefined ? { cost_usd: this.cost } : {}), latency_ms: 5 };
    } finally { this.active--; }
  }
}
const LATE = [
  { player: "*carries her to the sofa*", narration: "*The woman lies on the sofa, burning with fever.*", status: "finalized" as const, location_id: LR },
  { player: "name's nicco, i'm the keeper of the heartstone, what about you?", narration: "*Her eyes stay half-open, fixed on his face.*\n\nMira.\n\n*She says it without ceremony.*", status: "finalized" as const, location_id: LR },
];
interface Options { readonly generator?: FakeGenerator; readonly store?: PortraitAssetStore; readonly pick?: (count: number) => number; readonly seed?: (c: CampaignState, woman: string) => void;
  /** Runs inside the next player turn, before the real coordinator: simulates a turn committing state mid-generation. */
  readonly duringTurn?: { fn?: ((campaign: CampaignState) => void) | undefined } }
async function miraSession(options: Options = {}) {
  const generator = options.generator ?? new FakeGenerator();
  const id = `gallery_session_${++serial}`;
  const c = createOpeningCampaign(world, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", species: "human", descriptor: "woman", appearance: ["tall and gaunt"], condition: ["feverish"] }, evidence: [], location_id: LR,
    trigger: "purchase_unnamed_subject", promoted_revision: c.revision + 1, world_minute: minute });
  const plain = buildPromotedCharacter({ label: "Sovela", established: { name: "Sovela" }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: c.revision + 1, world_minute: minute });
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: woman }, { kind: "register_character", character: plain }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }] });
  c.apply({ expected_revision: c.revision, commands: [...establishNames(LATE, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision).commands] as CampaignCommand[] });
  options.seed?.(c, woman.id);
  const saves = await temp(), root = await temp();
  const repository = new FileCampaignRepository(world, saves);
  await repository.saveCampaign(c);
  const service = new RetrievalService(world), logs: { code: string; status?: number }[] = [];
  const store = options.store ?? new PortraitAssetStore(root);
  const deps: SessionDeps = { world, repository, portrait_generator: generator, portrait_store: store, portrait_log: entry => logs.push(entry), ...(options.pick ? { portrait_pick: options.pick } : {}),
    createCoordinator: () => {
      const real = new TurnCoordinator(world, mockNarrator("*Nothing changes.*"), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
      return { contextRequest: (campaign: CampaignState) => real.contextRequest(campaign), resetSceneContinuity: (campaign: CampaignState) => real.resetSceneContinuity(campaign),
        async *runTurn(request: TurnRequest) { const fn = options.duringTurn?.fn; if (fn) { options.duringTurn!.fn = undefined; fn(request.campaign); } yield* real.runTurn(request); } };
    } };
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok);
  return { session: loaded.session, deps, id, woman: woman.id, plain: plain.id, generator, root, saves, logs, repository, store };
}
const mira = (s: GameSession) => s.getPlayUiView().household.flatMap(h => h.members).find(m => m.name === "Mira")!;
const portrait = (s: GameSession) => mira(s).appearance_editor!.portrait;
const rev = (s: GameSession) => s.getView().session.revision;
const files = async (root: string) => { const out: string[] = []; const walk = async (d: string) => { for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) e.isDirectory() ? await walk(join(d, e.name)) : out.push(e.name); }; await walk(root); return out.sort(); };
const portraitFiles = async (root: string) => (await files(root)).filter(f => f.startsWith("portrait_"));
/** The candidate index a served image came from (the fake's final byte). */
const candidateOf = async (s: GameSession, url: string) => { const bytes = (await s.readPortraitAsset(url.split("/").pop()))!.bytes; return bytes[bytes.length - 1]; };
const generate = (s: GameSession) => s.generateNpcPortraitBatch({ ref: mira(s).ref, expected_revision: rev(s) });
const fakeVersion = (n: number, fingerprint = "0123456789abcdef"): CharacterPortraitVersion => ({ version_id: `portrait_seed_${n}`, prompt_version: "portrait-prompt-v1", prompt_fingerprint: fingerprint,
  model: "bytedance-seed/seedream-5-0-flash", created_at: "2026-10-07T12:00:00.000Z", media_type: "image/png", asset_file: `portrait_seed_${n}.png` });

test("creation and NPC+ promotion never generate; generation happens only on the explicit batch action", async () => {
  const { session, generator, woman, repository, id } = await miraSession();
  // Mira was registered as a campaign character, promoted to NPC+ by joining the household, and named: nothing was generated.
  assert.equal(generator.calls.length, 0);
  assert.equal(session.getView().session.revision, (await repository.loadCampaign(id)).campaign.revision);
  const snapshot = (await repository.loadCampaign(id)).campaign.exportSnapshot();
  assert.ok(snapshot.premium_characters.some(p => p.character_id === woman)); assert.equal(snapshot.portraits, undefined);
  // Opening views and running a turn generate nothing either.
  session.getPlayUiView(); const turn = await session.submitPlayerInput("*looks around*"); assert.ok(turn.ok, JSON.stringify(turn.ok ? "" : turn.error));
  assert.equal(generator.calls.length, 0);
  const editor = portrait(session);
  assert.deepEqual([editor.avatar, editor.full_body, editor.gallery.length, mira(session).avatar_url, editor.can_generate_batch], [null, null, 0, null, true]);
});

test("first batch 3/3: exactly 3 concurrent calls with one prompt; one revision; Avatar is one of the batch; Full Body stays empty; save/reload/restart", async () => {
  const picks: number[] = [];
  const { session, generator, root, woman, repository, id, deps } = await miraSession({ pick: count => { picks.push(count); return 2; } });
  const before = mira(session), revision = rev(session), snapshotBefore = (await repository.loadCampaign(id)).campaign.exportSnapshot();
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const running = session.generateNpcPortraitBatch({ ref: before.ref, expected_revision: revision });
  await tick(); await tick();
  assert.equal(generator.active, 3, "all three candidates are in flight at once");
  open();
  const result = await running;
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual([result.requested, result.succeeded, result.failed, result.avatar_auto_selected, result.message, result.cost_usd], [3, 3, 0, true, "3 portrait options generated.", 0.054]);
  assert.equal(generator.calls.length, 3); assert.equal(generator.maxActive, 3, "never more than 3 calls");
  assert.ok(generator.calls.every(c => c.prompt === before.appearance_editor!.portrait_prompt.prompt && c.references.length === 0), "the same committed prompt for every candidate");
  assert.equal(rev(session), revision + 1, "one revision for the whole batch");
  assert.deepEqual(picks, [3], "uniform pick over the 3 successes");
  const p = portrait(session);
  assert.equal(p.gallery.length, 3); assert.equal(p.gallery.filter(g => g.is_avatar).length, 1); assert.equal(p.gallery.filter(g => g.is_full_body).length, 0);
  assert.equal(p.full_body, null, "Full Body is never auto-selected");
  assert.equal(p.avatar!.url, p.gallery[2]!.url); assert.equal(await candidateOf(session, p.avatar!.url), await candidateOf(session, p.gallery[2]!.url));
  assert.equal(mira(session).avatar_url, p.avatar!.url, "compact surfaces use the Avatar");
  assert.equal(p.avatar!.stale, false);
  assert.deepEqual((await portraitFiles(root)).length, 3); assert.ok(!(await files(root)).some(f => f.startsWith(".tmp")));
  // Derived media only: the character record, Household, NPC+ and relationships are unchanged.
  await session.save();
  const saved = (await repository.loadCampaign(id)).campaign.exportSnapshot();
  assert.deepEqual(saved.characters.find(c => c.id === woman), snapshotBefore.characters.find(c => c.id === woman));
  assert.deepEqual([saved.households, saved.premium_characters, saved.relationships], [snapshotBefore.households, snapshotBefore.premium_characters, snapshotBefore.relationships]);
  const meta = saved.portraits!.find(r => r.character_id === woman)!;
  assert.equal(meta.versions.length, 3); assert.equal(meta.avatar_version_id, meta.versions[2]!.version_id); assert.equal(meta.full_body_version_id, undefined);
  assert.ok(meta.versions.every(v => v.cost_usd === 0.018 && v.prompt_fingerprint === portraitFingerprint(before.appearance_editor!.portrait_prompt.prompt) && v.reference_used === undefined));
  assert.equal(new Set(meta.versions.map(v => v.version_id)).size, 3);
  // Opaque tokens only: no root path, file name, version ID, character ID or key in any view.
  const json = JSON.stringify(session.getPlayUiView());
  for (const leak of [root, woman, "test-key", ...meta.versions.flatMap(v => [v.version_id, v.asset_file, v.prompt_fingerprint])]) assert.ok(!json.includes(leak), leak);
  assert.ok(p.gallery.every(g => /^[0-9a-f]{32}$/.test(g.token) && /^\/api\/portrait\/asset\/[0-9a-f]{32}$/.test(g.url) && !g.url.endsWith(g.token)));
  // Restart: a new session over the same save and store serves the same Gallery and roles.
  const restarted = await GameSession.loadCampaign(deps, id); assert.ok(restarted.ok);
  assert.deepEqual(portrait(restarted.session), p);
  assert.ok(await restarted.session.readPortraitAsset(p.gallery[0]!.url.split("/").pop()));
});

for (const [label, failing, expected] of [["2/3", [1], [0, 2]], ["1/3", [0, 1], [2]]] as const) test(`first batch ${label}: only successes enter the Gallery; the Avatar is chosen among them only`, async () => {
  for (let pick = 0; pick < expected.length; pick++) {
    const picks: number[] = [];
    const { session, generator, root, logs } = await miraSession({ pick: count => { picks.push(count); return pick; } });
    generator.plan = index => (failing as readonly number[]).includes(index) ? new ImageGenerationError("provider_unavailable", 502) : undefined;
    const revision = rev(session), result = await generate(session);
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepEqual([result.succeeded, result.failed, result.avatar_auto_selected, result.message], [expected.length, 3 - expected.length, true, `${expected.length} of 3 portrait options generated.`]);
    assert.equal(rev(session), revision + 1); assert.equal(generator.calls.length, 3);
    const p = portrait(session);
    assert.deepEqual(await Promise.all(p.gallery.map(g => candidateOf(session, g.url))), expected, "successful candidates only, in call order");
    assert.deepEqual(picks, [expected.length]);
    assert.equal(await candidateOf(session, p.avatar!.url), expected[pick], "Avatar is the picked success");
    assert.equal(p.full_body, null);
    assert.equal((await portraitFiles(root)).length, expected.length); assert.ok(!(await files(root)).some(f => f.startsWith(".tmp")));
    assert.equal(logs.filter(l => l.code === "provider_unavailable").length, failing.length);
  }
});

test("first batch 0/3 changes nothing: no revision, no files, no roles, no metadata", async () => {
  const picks: number[] = [];
  const { session, generator, root, logs } = await miraSession({ pick: count => { picks.push(count); return 0; } });
  generator.plan = () => new ImageGenerationError("insufficient_credits", 402);
  const revision = rev(session), before = portrait(session), result = await generate(session);
  assert.ok(!result.ok); assert.equal(result.error.code, "portrait_generation_failed");
  assert.match(result.error.message, /^Portrait generation failed\. The image provider reports insufficient credits\./);
  assert.deepEqual([result.requested, result.succeeded, result.failed], [3, 0, 3]);
  assert.equal(generator.calls.length, 3); assert.equal(rev(session), revision); assert.deepEqual(portrait(session), before);
  assert.deepEqual(await files(root), []); assert.deepEqual(picks, []); assert.equal(logs.length, 3);
  assert.deepEqual(logs[0], { code: "insufficient_credits", status: 402 });
  // A later success is still the first-ever batch: the Avatar bootstraps then.
  generator.plan = () => undefined;
  const next = await generate(session); assert.ok(next.ok && next.avatar_auto_selected);
});

test("default randomness: the Avatar is drawn from the batch via node:crypto, never from earlier images", async () => {
  for (let run = 0; run < 6; run++) {
    const { session, generator } = await miraSession();
    generator.plan = index => index === 0 ? new ImageGenerationError("timeout") : undefined;
    assert.ok((await generate(session)).ok);
    const avatar = await candidateOf(session, portrait(session).avatar!.url);
    assert.ok(avatar === 1 || avatar === 2, `avatar ${avatar} must be a success of this batch`);
  }
});

test("subsequent batches append to the Gallery and never change the Avatar or the Full Body", async () => {
  let picks = 0;
  const { session } = await miraSession({ pick: () => { picks++; return 0; } });
  assert.ok((await generate(session)).ok);
  const first = portrait(session), ref = mira(session).ref;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: first.gallery[1]!.token }).ok);
  const roles = portrait(session);
  const revision = rev(session), second = await generate(session);
  assert.ok(second.ok); assert.equal(second.avatar_auto_selected, false); assert.equal(second.message, "3 portrait options generated.");
  assert.equal(rev(session), revision + 1); assert.equal(picks, 1, "no pick after the first batch");
  const p = portrait(session);
  assert.equal(p.gallery.length, 6); assert.deepEqual(p.gallery.slice(0, 3).map(g => g.token), first.gallery.map(g => g.token), "new images append");
  assert.deepEqual([p.avatar, p.full_body], [roles.avatar, roles.full_body]);
  assert.deepEqual(p.gallery.map(g => [g.is_avatar, g.is_full_body]), [[true, false], [false, true], [false, false], [false, false], [false, false], [false, false]]);
});

test("roles: set Avatar, set Full Body, one image holding both, clear Full Body; no files copied; appearance untouched", async () => {
  const { session, root, repository, id, woman } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok);
  const ref = mira(session).ref, g = portrait(session).gallery, filesBefore = await files(root);
  const profile = () => session.getPlayUiView().household.flatMap(h => h.members).find(m => m.ref === ref)!.appearance_editor!.fields;
  const fields = profile();
  let revision = rev(session);
  // Avatar → image 2: the previous Avatar loses the role; compact surfaces follow.
  const avatar = session.setNpcPortraitAvatar({ ref, expected_revision: revision, item: g[1]!.token });
  assert.ok(avatar.ok && avatar.changed); assert.equal(rev(session), ++revision);
  assert.deepEqual(portrait(session).gallery.map(x => x.is_avatar), [false, true, false]);
  assert.equal(mira(session).avatar_url, g[1]!.url); assert.equal(portrait(session).full_body, null);
  // Full Body → image 3; Avatar unchanged.
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: g[2]!.token }).ok); assert.equal(rev(session), ++revision);
  assert.deepEqual([portrait(session).full_body!.url, portrait(session).avatar!.url], [g[2]!.url, g[1]!.url]);
  // Same image for both roles.
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: g[1]!.token }).ok); assert.equal(rev(session), ++revision);
  const both = portrait(session).gallery[1]!;
  assert.deepEqual([both.is_avatar, both.is_full_body], [true, true]); assert.equal(portrait(session).full_body!.url, portrait(session).avatar!.url);
  // Re-assigning the current holder is a no-op.
  const same = session.setNpcPortraitAvatar({ ref, expected_revision: revision, item: g[1]!.token }); assert.ok(same.ok && !same.changed); assert.equal(rev(session), revision);
  // Clear Full Body: the image stays in the Gallery, the slot is empty again, the Avatar is untouched.
  const clear = session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: null });
  assert.ok(clear.ok && clear.changed); assert.equal(rev(session), ++revision);
  assert.equal(portrait(session).full_body, null); assert.equal(portrait(session).avatar!.url, g[1]!.url); assert.equal(portrait(session).gallery.length, 3);
  const again = session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: null }); assert.ok(again.ok && !again.changed);
  assert.deepEqual(await files(root), filesBefore, "roles never copy or move files");
  assert.deepEqual(profile(), fields, "roles never touch appearance");
  await session.save();
  const saved = (await repository.loadCampaign(id)).campaign.exportSnapshot().portraits!.find(r => r.character_id === woman)!;
  assert.equal(saved.avatar_version_id, saved.versions[1]!.version_id); assert.equal(saved.full_body_version_id, undefined);
});

test("role validation: forged, malformed, raw-ID, cross-character and cross-campaign handles, stale revisions and ineligible refs are refused", async () => {
  const a = await miraSession({ pick: () => 0 }), b = await miraSession({ pick: () => 0 });
  assert.ok((await generate(a.session)).ok); assert.ok((await generate(b.session)).ok);
  const ref = mira(a.session).ref, revision = rev(a.session), before = portrait(a.session);
  await a.session.save();
  const snapshot = (await a.repository.loadCampaign(a.id)).campaign.exportSnapshot(), meta = snapshot.portraits![0]!;
  const otherCharacter = portraitItemToken(snapshot.campaign_id, a.plain, meta.versions[1]!.version_id);
  for (const item of ["0".repeat(32), "zz", meta.versions[1]!.version_id, meta.versions[1]!.asset_file, "../../etc/passwd", 7, undefined, otherCharacter, portrait(b.session).gallery[1]!.token, before.gallery[1]!.url]) {
    for (const call of [() => a.session.setNpcPortraitAvatar({ ref, expected_revision: revision, item }), () => a.session.setNpcPortraitFullBody({ ref, expected_revision: revision, item })]) {
      const r = call(); assert.ok(!r.ok, String(item)); assert.equal(r.error.code, "invalid_input");
    }
    const d = await a.session.deleteNpcPortrait({ ref, expected_revision: revision, item }); assert.ok(!d.ok); assert.equal(d.error.code, "invalid_input");
  }
  const stale = a.session.setNpcPortraitAvatar({ ref, expected_revision: revision - 1, item: before.gallery[1]!.token });
  assert.ok(!stale.ok); assert.equal(stale.error.code, "stale_turn");
  const p = playerCharacterProjection(world, snapshot);
  for (const cid of ["nicco", a.plain]) {
    const r = a.session.setNpcPortraitFullBody({ ref: p.project(cid)!.ref, expected_revision: revision, item: before.gallery[1]!.token }); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input");
  }
  assert.equal(rev(a.session), revision); assert.deepEqual(portrait(a.session), before);
  // Domain boundary: a role naming a version outside the character's Gallery never commits, even if a caller bypasses the session.
  const forged = await import("../src/campaign/campaign-state.js");
  const restored = forged.CampaignState.restore(world, structuredClone(snapshot));
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "set_portrait_avatar", character_id: a.woman, version_id: "portrait_missing" }] }));
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "set_portrait_full_body", character_id: a.plain, version_id: meta.versions[0]!.version_id }] }), "no cross-character role binding");
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "delete_portrait_version", character_id: a.woman, version_id: meta.avatar_version_id! }] }), "a role holder cannot be deleted");
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "record_portrait_batch", character_id: a.woman, versions: [fakeVersion(1)], avatar_version_id: "portrait_seed_1" }] }), "no Avatar bootstrap after the first batch");
});

test("delete: Avatar, Full Body and dual-role images are blocked; an unassigned image is removed metadata-first, then its file", async () => {
  const order: string[] = [];
  let session!: GameSession;
  class WatchingStore extends PortraitAssetStore {
    override async remove(campaignId: string, characterId: string, file: string) {
      // At the moment the file is deleted, the committed Gallery must already be without it.
      order.push(`remove:${portrait(session).gallery.length}`);
      return super.remove(campaignId, characterId, file);
    }
  }
  const root = await temp();
  const s = await miraSession({ pick: () => 0, store: new WatchingStore(root) }); session = s.session;
  assert.ok((await generate(session)).ok);
  const ref = mira(session).ref, g = portrait(session).gallery;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: g[1]!.token }).ok);
  const revision = rev(session);
  const blocked = async (item: string, message: RegExp) => {
    const r = await session.deleteNpcPortrait({ ref, expected_revision: revision, item });
    assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input"); assert.match(r.error.message, message);
  };
  await blocked(g[0]!.token, /^Choose another Avatar before deleting this image\.$/);
  await blocked(g[1]!.token, /^Choose another Full Body image or clear Full Body first\.$/);
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: g[0]!.token }).ok);
  const dual = rev(session), r = await session.deleteNpcPortrait({ ref, expected_revision: dual, item: g[0]!.token });
  assert.ok(!r.ok); assert.match(r.error.message, /Avatar and the Full Body/);
  assert.equal(rev(session), dual); assert.equal((await portraitFiles(root)).length, 3); assert.deepEqual(order, []);
  // Unassigned image 3: committed removal first, then the file.
  const filesBefore = await portraitFiles(root);
  const ok = await session.deleteNpcPortrait({ ref, expected_revision: dual, item: g[2]!.token });
  assert.ok(ok.ok && ok.changed); assert.equal(rev(session), dual + 1);
  assert.deepEqual(order, ["remove:2"], "metadata committed before the physical delete");
  assert.deepEqual(portrait(session).gallery.map(x => x.token), [g[0]!.token, g[1]!.token]);
  assert.equal((await portraitFiles(root)).length, 2); assert.equal(await session.readPortraitAsset(g[2]!.url.split("/").pop()), undefined);
  assert.ok(filesBefore.length === 3);
  // Deleting it again: it is no longer in the Gallery.
  const gone = await session.deleteNpcPortrait({ ref, expected_revision: rev(session), item: g[2]!.token }); assert.ok(!gone.ok); assert.equal(gone.error.code, "invalid_input");
});

test("delete: a file that cannot be removed after the commit stays as a safe orphan; the Gallery is still correct", async () => {
  class StuckStore extends PortraitAssetStore { override async remove() { return false; } }
  const root = await temp();
  const { session, logs } = await miraSession({ pick: () => 0, store: new StuckStore(root) });
  assert.ok((await generate(session)).ok);
  const g = portrait(session).gallery;
  const r = await session.deleteNpcPortrait({ ref: mira(session).ref, expected_revision: rev(session), item: g[1]!.token });
  assert.ok(r.ok && r.changed, "the delete still succeeds for the player");
  assert.equal(portrait(session).gallery.length, 2); assert.equal((await portraitFiles(root)).length, 3, "the orphan file remains on disk");
  assert.deepEqual(logs.at(-1), { code: "orphaned_asset" });
  assert.equal(await session.readPortraitAsset(g[1]!.url.split("/").pop()), undefined, "an orphan is not served");
});

test("V1 save: active_version_id becomes the Avatar; no Full Body; every old version stays in the Gallery; delete of it is blocked", async () => {
  const { session, saves, id, deps, root } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok);
  assert.ok((await session.save()).ok);
  // Rewrite the save into the exact V1 shape: active_version_id on the second version, no V2 role fields.
  const path = join(saves, id, "save.json"), file = JSON.parse(await readFile(path, "utf8"));
  const record = file.snapshot.portraits[0];
  const versions = record.versions.map((v: { version_id: string }) => v.version_id);
  delete record.avatar_version_id; record.active_version_id = versions[1];
  await writeFile(path, JSON.stringify(file, null, 2));
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok, JSON.stringify(loaded.ok ? "" : loaded.error));
  const v1 = loaded.session, p = portrait(v1);
  assert.equal(p.gallery.length, 3, "every V1 version is in the Gallery");
  assert.deepEqual(p.gallery.map(g => g.is_avatar), [false, true, false]); assert.equal(p.full_body, null);
  assert.equal(mira(v1).avatar_url, p.gallery[1]!.url, "the portrait the V1 save displayed is still shown");
  const blocked = await v1.deleteNpcPortrait({ ref: mira(v1).ref, expected_revision: rev(v1), item: p.gallery[1]!.token });
  assert.ok(!blocked.ok); assert.match(blocked.error.message, /Choose another Avatar/);
  assert.equal((await portraitFiles(root)).length, 3, "no new image generated by the migration");
  // Re-saving writes the V2 field only.
  assert.ok(v1.setNpcPortraitAvatar({ ref: mira(v1).ref, expected_revision: rev(v1), item: p.gallery[0]!.token }).ok);
  assert.ok((await v1.save()).ok);
  const resaved = JSON.parse(await readFile(path, "utf8")).snapshot.portraits[0];
  assert.deepEqual([resaved.active_version_id, resaved.avatar_version_id, resaved.full_body_version_id], [undefined, versions[0], undefined]);
  // A record naming conflicting legacy and V2 avatars is corrupt, never silently resolved.
  const conflict = structuredClone(file); conflict.snapshot.portraits[0].avatar_version_id = versions[2];
  await writeFile(path, JSON.stringify(conflict, null, 2));
  assert.equal((await GameSession.loadCampaign(deps, id)).ok, false);
});

test("snapshot decode: legacy active_version_id maps to avatar_version_id; matching duplicates collapse; dangling roles are invalid", async () => {
  const { session, repository, id } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok); await session.save();
  const snapshot = structuredClone((await repository.loadCampaign(id)).campaign.exportSnapshot()) as any;
  const record = snapshot.portraits[0], avatar = record.avatar_version_id;
  delete record.avatar_version_id; record.active_version_id = avatar;
  assert.deepEqual(Object.keys(parseCampaignSnapshot(snapshot).portraits![0]!), ["character_id", "avatar_version_id", "versions"]);
  record.avatar_version_id = avatar;
  assert.equal(parseCampaignSnapshot(snapshot).portraits![0]!.avatar_version_id, avatar);
  const { CampaignState } = await import("../src/campaign/campaign-state.js");
  delete record.active_version_id; record.full_body_version_id = "portrait_missing";
  assert.throws(() => CampaignState.restore(world, snapshot), "a role must name a Gallery version");
});

test("Gallery limit: a batch that cannot be fully recorded is refused before any paid call", async () => {
  for (const [seeded, allowed] of [[MAX_PORTRAIT_VERSIONS - 2, false], [MAX_PORTRAIT_VERSIONS - 3, true]] as const) {
    const { session, generator } = await miraSession({ seed: (c, woman) => {
      for (let start = 0; start < seeded; start += 3) {
        const batch = Array.from({ length: Math.min(3, seeded - start) }, (_, i) => fakeVersion(start + i + 1));
        c.apply({ expected_revision: c.revision, commands: [{ kind: "record_portrait_batch", character_id: woman, versions: batch, ...(start === 0 ? { avatar_version_id: batch[0]!.version_id } : {}) }] });
      }
    } });
    assert.equal(portrait(session).gallery.length, seeded); assert.equal(portrait(session).can_generate_batch, allowed);
    const revision = rev(session), result = await generate(session);
    if (allowed) { assert.ok(result.ok); assert.equal(portrait(session).gallery.length, MAX_PORTRAIT_VERSIONS); assert.equal(portrait(session).can_generate_batch, false); }
    else {
      assert.ok(!result.ok); assert.equal(result.error.message, "Gallery is full. Delete some unused portraits first.");
      assert.equal(generator.calls.length, 0, "no paid call"); assert.equal(rev(session), revision);
    }
  }
});

test("stale revision, bad refs and ineligible targets never call the provider; one batch at a time; roles, delete and appearance are locked during a batch", async () => {
  const { session, generator, plain, deps, id } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok);
  const ref = mira(session).ref, revision = rev(session), g = portrait(session).gallery;
  assert.ok(session.overridePlayerLocation({ target: "heartstone_square", expected_revision: revision }).ok);
  const stale = await session.generateNpcPortraitBatch({ ref, expected_revision: revision });
  assert.ok(!stale.ok); assert.equal(stale.error.code, "stale_turn");
  const now = rev(session), calls = generator.calls.length;
  for (const bad of ["0".repeat(24), "../../etc/passwd", 7, ref.replace(/./, "f")]) {
    const r = await session.generateNpcPortraitBatch({ ref: bad, expected_revision: now }); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input");
  }
  const p = playerCharacterProjection(world, (await deps.repository.loadCampaign(id)).campaign.exportSnapshot());
  for (const cid of ["nicco", plain]) { const r = await session.generateNpcPortraitBatch({ ref: p.project(cid)!.ref, expected_revision: now }); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input"); }
  assert.equal(generator.calls.length, calls, "no provider call for any rejected request");
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const running = session.generateNpcPortraitBatch({ ref, expected_revision: now });
  await tick();
  const second = await session.generateNpcPortraitBatch({ ref, expected_revision: now });
  assert.ok(!second.ok); assert.equal(second.error.code, "turn_in_progress", "double submit is refused");
  for (const r of [session.updateNpcAppearance({ ref, expected_revision: now, patch: { build: "lean" } }), session.setNpcPortraitAvatar({ ref, expected_revision: now, item: g[1]!.token }),
    session.setNpcPortraitFullBody({ ref, expected_revision: now, item: g[1]!.token }), await session.deleteNpcPortrait({ ref, expected_revision: now, item: g[2]!.token })]) {
    assert.ok(!r.ok); assert.equal(r.error.code, "turn_in_progress");
  }
  assert.ok(session.overridePlayerLocation({ target: LR, expected_revision: now }).ok, "unrelated state may still change");
  open();
  const done = await running;
  assert.ok(done.ok, JSON.stringify(done)); assert.equal(rev(session), now + 2, "the batch rebases onto unrelated state in one revision");
  assert.equal(generator.calls.length, calls + 3); assert.equal(portrait(session).gallery.length, 6);
});

test("a turn may run during a batch: the commit waits for idle; an appearance change in that turn prevents the commit and removes the batch files", async () => {
  const duringTurn: Options["duringTurn"] = {};
  const { session, generator, root, woman } = await miraSession({ pick: () => 0, duringTurn });
  // Compatible turn: commits nothing portrait-related; the batch lands after it.
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const running = generate(session); await tick();
  const turn = session.submitPlayerInput("*waits*");
  open();
  const [batch, turnResult] = await Promise.all([running, turn]);
  assert.ok(turnResult.ok); assert.ok(batch.ok, JSON.stringify(batch)); assert.equal(portrait(session).gallery.length, 3);
  // Incompatible: the turn changes Mira's committed appearance while candidates are in flight.
  generator.gate = new Promise<void>(resolve => { open = resolve; });
  const before = portrait(session), revision = rev(session);
  const second = session.generateNpcPortraitBatch({ ref: mira(session).ref, expected_revision: revision }); await tick();
  duringTurn.fn = campaign => {
    const record = campaign.exportSnapshot().characters.find(c => c.id === woman)!;
    const patched = applyAppearancePatch(record.profile.appearance, { hair_color: "silver" }); assert.ok(patched.ok);
    campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "set_profile", character_id: woman, profile: { ...structuredClone(record.profile), appearance: patched.appearance } as never }] });
  };
  const changing = session.submitPlayerInput("*waits again*");
  open();
  const [refused] = await Promise.all([second, changing]);
  // (The stub turn's own commit may go stale after the direct mutation; what matters is that appearance changed mid-batch.)
  assert.match(mira(session).appearance_editor!.portrait_prompt.prompt, /silver/);
  assert.ok(!refused.ok); assert.match(refused.error.message, /appearance changed while the portraits were generating/);
  assert.equal(portrait(session).gallery.length, 3); assert.deepEqual(portrait(session).gallery.map(g => g.token), before.gallery.map(g => g.token));
  assert.equal(portrait(session).avatar!.stale, true, "the Avatar is now marked as an older appearance");
  assert.equal((await portraitFiles(root)).length, 3); assert.ok(!(await files(root)).some(f => f.startsWith(".tmp")), "staged files are discarded");
});

test("a failed metadata commit removes every finalized file of the batch; no half-batch reaches the campaign", async () => {
  const duringTurn: Options["duringTurn"] = {};
  const { session, generator, root, woman } = await miraSession({ pick: () => 0, duringTurn });
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const revision = rev(session), running = session.generateNpcPortraitBatch({ ref: mira(session).ref, expected_revision: revision }); await tick();
  // A turn records portraits first, so this batch's first-batch Avatar bootstrap is no longer valid and its commit is refused.
  duringTurn.fn = campaign => campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "record_portrait_batch", character_id: woman, versions: [fakeVersion(1)], avatar_version_id: "portrait_seed_1" }] });
  const turn = session.submitPlayerInput("*waits*");
  open();
  const [result] = await Promise.all([running, turn]);
  assert.ok(!result.ok); assert.equal(result.error.code, "campaign_validation_failed");
  assert.equal(portrait(session).gallery.length, 1, "only the turn's record; nothing from the failed batch");
  assert.deepEqual(await files(root), [], "all three finalized files were removed");
});

test("staleness is per image: Avatar, Full Body and Gallery markers follow the current prompt; stale images stay usable", async () => {
  const { session } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok);
  const ref = mira(session).ref;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: portrait(session).gallery[1]!.token }).ok);
  assert.deepEqual([portrait(session).avatar!.stale, portrait(session).full_body!.stale, portrait(session).gallery.some(g => g.stale)], [false, false, false]);
  assert.ok(session.updateNpcAppearance({ ref, expected_revision: rev(session), patch: { hair_color: "copper" } }).ok);
  const p = portrait(session);
  assert.deepEqual([p.avatar!.stale, p.full_body!.stale, p.gallery.every(g => g.stale), p.gallery.length], [true, true, true, 3]);
  assert.ok((await generate(session)).ok);
  const q = portrait(session);
  assert.deepEqual(q.gallery.map(g => g.stale), [true, true, true, false, false, false]); assert.deepEqual([q.avatar!.stale, q.full_body!.stale], [true, true], "roles never move to the new images");
  assert.ok(session.setNpcPortraitAvatar({ ref, expected_revision: rev(session), item: q.gallery[4]!.token }).ok);
  assert.equal(portrait(session).avatar!.stale, false);
});

test("reference: separate from the Gallery and roles; the same reference reaches all 3 candidates; attaching or removing it never changes roles", async () => {
  const { session, generator } = await miraSession({ pick: () => 0 });
  const ref = mira(session).ref;
  assert.ok((await session.setNpcPortraitReference({ ref, expected_revision: rev(session), image: { data_base64: JPEG } })).ok);
  assert.deepEqual([portrait(session).reference_attached, portrait(session).gallery.length, portrait(session).avatar], [true, 0, null], "a reference is not a Gallery item or a role");
  assert.ok((await generate(session)).ok);
  assert.equal(generator.calls.length, 3);
  assert.ok(generator.calls.every(c => c.references.length === 1 && c.references[0]!.media_type === "image/jpeg" && Buffer.from(c.references[0]!.bytes).toString("base64") === JPEG), "same reference for every candidate");
  assert.ok(portrait(session).gallery.every(g => g.reference_used));
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: portrait(session).gallery[2]!.token }).ok);
  const roles = portrait(session);
  assert.ok((await session.setNpcPortraitReference({ ref, expected_revision: rev(session), image: { data_base64: PNG } })).ok);
  assert.ok((await session.setNpcPortraitReference({ ref, expected_revision: rev(session), image: null })).ok);
  const after = portrait(session);
  assert.deepEqual([after.avatar, after.full_body, after.gallery.map(g => g.token)], [roles.avatar, roles.full_body, roles.gallery.map(g => g.token)]);
  assert.ok((await generate(session)).ok);
  assert.ok(generator.calls.slice(3).every(c => c.references.length === 0)); assert.ok(portrait(session).gallery.slice(3).every(g => !g.reference_used));
});

test("compact projection: Avatar only, never the Full Body; no Avatar → null; Gallery and roles stay editor-only", async () => {
  const { session, deps, id, plain } = await miraSession({ pick: () => 1 });
  assert.equal(mira(session).avatar_url, null);
  assert.ok((await generate(session)).ok);
  const ref = mira(session).ref, g = portrait(session).gallery;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: g[0]!.token }).ok);
  const card = mira(session);
  assert.equal(card.avatar_url, g[1]!.url); assert.notEqual(card.avatar_url, card.appearance_editor!.portrait.full_body!.url);
  // The scene participant projection carries the same card (Mira is present in the living room).
  const participant = session.getPlayUiView().participants.find(x => x.ref === ref)!;
  assert.equal(participant.card!.avatar_url, g[1]!.url);
  const other = playerCharacterProjection(world, (await deps.repository.loadCampaign(id)).campaign.exportSnapshot()).project(plain)!;
  assert.deepEqual([other.avatar_url, other.appearance_editor], [null, null]);
});

test("HTTP: generate takes ref + revision only; role and delete routes take an opaque item token; assets served; traversal 404; stale 409", async () => {
  const { session, generator } = await miraSession({ pick: () => 0 });
  const server = createPlaytestServer(session);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (route: string, body: unknown) => fetch(`${url}/api/portrait/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const card = (state: any) => state.play.household.flatMap((h: any) => h.members).find((m: any) => m.name === "Mira");
    const state = await (await fetch(`${url}/api/session`)).json();
    const response = await post("generate", { ref: card(state).ref, expected_revision: state.revision, prompt: "draw a castle", model: "evil/model", n: 10, batch_size: 10, character_id: "campaign_character_x" });
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.deepEqual([next.requested, next.succeeded, next.failed, next.avatar_auto_selected], [3, 3, 0, true]);
    assert.equal(generator.calls.length, 3, "the browser cannot change the batch size"); assert.ok(generator.calls.every(c => c.prompt === card(state).appearance_editor.portrait_prompt.prompt));
    const gallery = card(next).appearance_editor.portrait.gallery;
    const asset = await fetch(url + gallery[0].url);
    assert.equal(asset.status, 200); assert.equal(asset.headers.get("content-type"), "image/png");
    const avatar = await post("avatar", { ref: card(next).ref, expected_revision: next.revision, item: gallery[1].token });
    assert.equal(avatar.status, 200); const afterAvatar = await avatar.json(); assert.equal(card(afterAvatar).avatar_url, gallery[1].url);
    const full = await post("full-body", { ref: card(next).ref, expected_revision: afterAvatar.revision, item: gallery[2].token });
    assert.equal(full.status, 200); const afterFull = await full.json(); assert.equal(card(afterFull).appearance_editor.portrait.full_body.url, gallery[2].url);
    const blocked = await post("delete", { ref: card(next).ref, expected_revision: afterFull.revision, item: gallery[2].token });
    assert.equal(blocked.status, 422); assert.match((await blocked.json()).error.message, /clear Full Body first/);
    const cleared = await post("full-body", { ref: card(next).ref, expected_revision: afterFull.revision, item: null });
    const afterClear = await cleared.json(); assert.equal(card(afterClear).appearance_editor.portrait.full_body, null);
    const deleted = await post("delete", { ref: card(next).ref, expected_revision: afterClear.revision, item: gallery[2].token });
    assert.equal(deleted.status, 200); assert.equal(card(await deleted.json()).appearance_editor.portrait.gallery.length, 2);
    assert.equal((await post("avatar", { ref: card(next).ref, expected_revision: next.revision, item: gallery[0].token })).status, 409, "stale revision");
    for (const bad of ["/api/portrait/asset/../../package.json", "/api/portrait/asset/" + "0".repeat(32), "/api/portrait/asset/zzz", `/api/portrait/asset/${gallery[0].token}`]) assert.notEqual((await fetch(url + bad)).status, 200, bad);
    assert.doesNotMatch(JSON.stringify(next), /OPENROUTER|test-key|caldrevan-gallery-|\\\\|asset_file|prompt_fingerprint|version_id|portrait_[0-9a-f]{12}/);
  } finally { server.close(); await session.shutdown({ discard_unsaved: true }); }
});
