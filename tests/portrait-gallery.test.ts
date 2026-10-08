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
import { appearanceFingerprint, PORTRAIT_NEGATIVE_PROMPT, PORTRAIT_POSE_TEXT, PORTRAIT_PROMPT_VERSION } from "../src/campaign/portrait-prompt.js";
import { portraitItemToken, MAX_PORTRAIT_VERSIONS } from "../src/campaign/portraits.js";
import { parseCampaignSnapshot } from "../src/campaign/validation.js";
import { applyAppearancePatch } from "../src/campaign/permanent-appearance.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot, CharacterPortraitVersion } from "../src/campaign/types.js";
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
import { RAENA_IMAGE_STACK } from "../src/app/image-stack.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { ImageGenerationError, type GeneratedImage, type ImageGenerationRequest, type ImageReference, type PortraitImageGenerator } from "../src/llm/image-generator.js";
import { mockController, mockNarrator } from "./turn-fixtures.js";

/**
 * Portrait Gallery V2 + image generation v1: the full session lifecycle (kinds, poses, seeds, single recovery, roles, legacy data) with
 * a fake generator. No paid calls.
 */
const world = await loadWorld("data");
const LR = "heartstone_lr";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString("base64");
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "caldrevan-gallery-")); dirs.push(d); return d; };
let serial = 0;
const tick = () => new Promise(resolve => setImmediate(resolve));

interface Call { prompt: string; negative_prompt?: string; width: number; height: number; seed: number; references: readonly ImageReference[] }
/**
 * Each call returns a valid PNG whose final byte is the call's index, so a stored file identifies the call it came from.
 * `plan(i)` fails call i; `gate` holds every call open (to observe concurrency and interleave other operations).
 */
class FakeGenerator implements PortraitImageGenerator {
  readonly identity = { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" };
  calls: Call[] = [];
  plan: (index: number, call: Call) => ImageGenerationError | undefined = () => undefined;
  gate: Promise<void> | undefined; units: number | undefined = 1; active = 0; maxActive = 0;
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const index = this.calls.length, call: Call = { prompt: request.prompt, ...(request.negative_prompt !== undefined ? { negative_prompt: request.negative_prompt } : {}),
      width: request.width, height: request.height, seed: request.seed, references: request.references ?? [] };
    this.calls.push(call);
    this.active++; this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (this.gate) await this.gate; else await tick();
      const failure = this.plan(index, call);
      if (failure) throw failure;
      return { bytes: Buffer.concat([Buffer.from(PNG, "base64"), Buffer.from([index])]), media_type: "image/png", ...this.identity, provider_seed: request.seed,
        ...(this.units !== undefined ? { billable_units: this.units } : {}), latency_ms: 5 };
    } finally { this.active--; }
  }
}
const LATE = [
  { player: "*carries her to the sofa*", narration: "*The woman lies on the sofa, burning with fever.*", status: "finalized" as const, location_id: LR },
  { player: "name's nicco, i'm the keeper of the heartstone, what about you?", narration: "*Her eyes stay half-open, fixed on his face.*\n\nMira.\n\n*She says it without ceremony.*", status: "finalized" as const, location_id: LR },
];
interface Options { readonly generator?: FakeGenerator; readonly store?: PortraitAssetStore; readonly pick?: (count: number) => number; readonly seed?: (c: CampaignState, woman: string) => void;
  /** Rewrites the exported snapshot before the session loads it (e.g. to plant pre-v1 Gallery data that today's commands refuse). */
  readonly snapshot?: (snapshot: CampaignSnapshot, woman: string) => void;
  readonly seeds?: () => number;
  /** Runs inside the next player turn, before the real coordinator: simulates a turn committing state mid-generation. */
  readonly duringTurn?: { fn?: ((campaign: CampaignState) => void) | undefined } }
async function miraSession(options: Options = {}) {
  const generator = options.generator ?? new FakeGenerator();
  const id = `gallery_session_${++serial}`;
  let c = createOpeningCampaign(world, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", species: "human", descriptor: "woman", appearance: ["tall and gaunt"], condition: ["feverish"] }, evidence: [], location_id: LR,
    trigger: "purchase_unnamed_subject", promoted_revision: c.revision + 1, world_minute: minute });
  const plain = buildPromotedCharacter({ label: "Sovela", established: { name: "Sovela" }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: c.revision + 1, world_minute: minute });
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: woman }, { kind: "register_character", character: plain }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }] });
  c.apply({ expected_revision: c.revision, commands: [...establishNames(LATE, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision).commands] as CampaignCommand[] });
  options.seed?.(c, woman.id);
  if (options.snapshot) { const snapshot = structuredClone(c.exportSnapshot()) as CampaignSnapshot; options.snapshot(snapshot, woman.id); c = CampaignState.restore(world, snapshot); }
  const saves = await temp(), root = await temp();
  const repository = new FileCampaignRepository(world, saves);
  await repository.saveCampaign(c);
  const service = new RetrievalService(world), logs: { code: string; status?: number; recovery?: string }[] = [];
  const store = options.store ?? new PortraitAssetStore(root);
  const deps: SessionDeps = { world, repository, portrait_generator: generator, portrait_store: store, portrait_log: entry => logs.push(entry), portrait_retry_delay_ms: () => 0,
    ...(options.pick ? { portrait_pick: options.pick } : {}), ...(options.seeds ? { portrait_seed: options.seeds } : {}),
    createCoordinator: () => {
      const real = new TurnCoordinator(world, mockNarrator("*Nothing changes.*"), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
      return { contextRequest: (campaign: CampaignState) => real.contextRequest(campaign), resetSceneContinuity: (campaign: CampaignState) => real.resetSceneContinuity(campaign),
        async *runTurn(request: TurnRequest) { const fn = options.duringTurn?.fn; if (fn) { options.duringTurn!.fn = undefined; fn(request.campaign); } yield* real.runTurn(request); } };
    } };
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok);
  return { session: loaded.session, deps, id, woman: woman.id, plain: plain.id, generator, root, saves, logs, repository, store, campaignId: c.exportSnapshot().campaign_id };
}
const mira = (s: GameSession) => s.getPlayUiView().household.flatMap(h => h.members).find(m => m.name === "Mira")!;
const portrait = (s: GameSession) => mira(s).appearance_editor!.portrait;
const rev = (s: GameSession) => s.getView().session.revision;
const files = async (root: string) => { const out: string[] = []; const walk = async (d: string) => { for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) e.isDirectory() ? await walk(join(d, e.name)) : out.push(e.name); }; await walk(root); return out.sort(); };
const portraitFiles = async (root: string) => (await files(root)).filter(f => f.startsWith("portrait_"));
/** The call index a served image came from (the fake's final byte). */
const candidateOf = async (s: GameSession, url: string) => { const bytes = (await s.readPortraitAsset(url.split("/").pop()))!.bytes; return bytes[bytes.length - 1]; };
const generate = (s: GameSession, kind: "avatar" | "fullbody" = "avatar", pose?: string) => s.generateNpcPortraitBatch({ ref: mira(s).ref, expected_revision: rev(s), kind, ...(pose ? { pose } : {}) });
const fakeVersion = (n: number, kind?: "avatar" | "fullbody", fingerprint = "0123456789abcdef"): CharacterPortraitVersion => ({ version_id: `portrait_seed_${n}`, prompt_version: "portrait-prompt-v1", prompt_fingerprint: fingerprint,
  model: "bytedance-seed/seedream-5-0-flash", created_at: "2026-10-07T12:00:00.000Z", media_type: "image/png", asset_file: `portrait_seed_${n}.png`, ...(kind ? { kind } : {}) });
const isAvatarCall = (c: Call) => c.width === 992 && c.height === 992;

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
  assert.deepEqual([editor.avatar, editor.full_body, editor.gallery.length, mira(session).avatar_url, editor.can_generate_batch, editor.generation_blocked], [null, null, 0, null, true, null]);
  assert.deepEqual(editor.poses.avatar.map(p => p.id), ["neutral", "three_quarter", "confident", "shy", "playful", "hand_near_face", "wink"]);
  assert.deepEqual(editor.poses.fullbody.map(p => p.id), ["neutral", "contrapposto", "hand_on_hip", "relaxed", "playful", "kneeling", "confident"]);
});

test("first avatar batch 3/3: 3 concurrent 992×992 calls, distinct explicit seeds, trigger + negative prompt; metadata persisted; Avatar bootstrapped; reload/restart", async () => {
  const picks: number[] = [];
  const { session, generator, root, woman, repository, id, deps } = await miraSession({ pick: count => { picks.push(count); return 2; } });
  const before = mira(session), revision = rev(session), snapshotBefore = (await repository.loadCampaign(id)).campaign.exportSnapshot();
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const running = session.generateNpcPortraitBatch({ ref: before.ref, expected_revision: revision, kind: "avatar", pose: "neutral" });
  await tick(); await tick();
  assert.equal(generator.active, 3, "all three candidates are in flight at once");
  open();
  const result = await running;
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual([result.kind, result.requested, result.succeeded, result.failed, result.refused, result.provider_calls, result.avatar_auto_selected, result.message, result.cost_usd],
    ["avatar", 3, 3, 0, 0, 3, true, "3 avatar options generated.", 0.06], "cost = returned billable units × $0.02");
  assert.equal(generator.calls.length, 3); assert.equal(generator.maxActive, 3, "never more than 3 calls");
  const expected = before.appearance_editor!.portrait_prompts.avatar;
  for (const call of generator.calls) {
    assert.equal(call.prompt, expected.prompt, "the committed avatar prompt (neutral pose) for every candidate");
    assert.ok(call.prompt.startsWith("Anime illustration of an adult fantasy RPG character: a bust-up portrait from the chest up"), "trigger + avatar framing");
    assert.ok(call.prompt.includes("high-collared, modest neckline"));
    assert.equal(call.negative_prompt, PORTRAIT_NEGATIVE_PROMPT.avatar); assert.equal(call.negative_prompt, expected.negative_prompt);
    assert.deepEqual([call.width, call.height], [992, 992]); assert.ok(Number.isSafeInteger(call.seed) && call.seed > 0);
    assert.equal(call.references.length, 0, "v1 never sends a reference");
  }
  assert.equal(new Set(generator.calls.map(c => c.seed)).size, 3, "three different seeds");
  assert.equal(rev(session), revision + 1, "one revision for the whole batch");
  assert.deepEqual(picks, [3], "uniform pick over the 3 successes");
  const p = portrait(session);
  assert.equal(p.gallery.length, 3); assert.equal(p.gallery.filter(g => g.is_avatar).length, 1); assert.equal(p.gallery.filter(g => g.is_full_body).length, 0);
  assert.deepEqual(p.gallery.map(g => [g.kind, g.pose_label, g.can_be_avatar, g.can_be_full_body, g.model_label]), Array(3).fill(["avatar", "Neutral", true, false, "Raelina/Raena-Qwen-Image"]));
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
  // Metadata persisted: kind, pose, exact prompt, seed sent, provider identity, LoRA id, size, billed units, cost, appearance fingerprint.
  for (const [index, v] of meta.versions.entries()) {
    assert.deepEqual({ kind: v.kind, pose: v.pose, prompt: v.prompt, seed: v.seed, provider_seed: v.provider_seed, provider: v.provider, model: v.model, style_id: v.style_id, width: v.width, height: v.height,
      billable_units: v.billable_units, cost_usd: v.cost_usd, prompt_version: v.prompt_version, prompt_fingerprint: v.prompt_fingerprint, reference_used: v.reference_used },
    { kind: "avatar", pose: "neutral", prompt: expected.prompt, seed: generator.calls[index]!.seed, provider_seed: generator.calls[index]!.seed, provider: "fal-ai", model: "Qwen/Qwen-Image",
      style_id: "Raelina/Raena-Qwen-Image", width: 992, height: 992, billable_units: 1, cost_usd: 0.02, prompt_version: PORTRAIT_PROMPT_VERSION,
      prompt_fingerprint: appearanceFingerprint(before.appearance_editor!.portrait_details), reference_used: undefined });
  }
  assert.equal(new Set(meta.versions.map(v => v.version_id)).size, 3);
  // Opaque tokens only: no root path, file name, version ID, character ID, seed or key in any view.
  const json = JSON.stringify(session.getPlayUiView());
  for (const leak of [root, woman, "test-key", ...meta.versions.flatMap(v => [v.version_id, v.asset_file, v.prompt_fingerprint])]) assert.ok(!json.includes(leak), leak);
  assert.ok(p.gallery.every(g => /^[0-9a-f]{32}$/.test(g.token) && /^\/api\/portrait\/asset\/[0-9a-f]{32}$/.test(g.url) && !g.url.endsWith(g.token)));
  // Restart: a new session over the same save and store serves the same Gallery, roles and files.
  const restarted = await GameSession.loadCampaign(deps, id); assert.ok(restarted.ok);
  assert.deepEqual(portrait(restarted.session), p);
  for (const g of p.gallery) assert.ok(await restarted.session.readPortraitAsset(g.url.split("/").pop()), "files survive reload");
});

test("full-body batch: 800×1200 head-to-feet prompt with the chosen pose text; never bootstraps or changes the Avatar", async () => {
  const { session, generator } = await miraSession({ pick: () => 0 });
  const first = await generate(session, "fullbody", "hand_on_hip");
  assert.ok(first.ok, JSON.stringify(first)); assert.equal(first.avatar_auto_selected, false, "a full-body batch never bootstraps the Avatar"); assert.equal(first.message, "3 full-body options generated.");
  for (const call of generator.calls) {
    assert.deepEqual([call.width, call.height], [800, 1200]);
    assert.ok(call.prompt.includes("full-body character artwork with the entire figure visible from head to feet"));
    assert.ok(call.prompt.includes(`Pose and expression: ${PORTRAIT_POSE_TEXT.fullbody.hand_on_hip.text}.`), "pose text");
    assert.equal(call.negative_prompt, PORTRAIT_NEGATIVE_PROMPT.fullbody); assert.match(call.negative_prompt!, /cropped feet/);
  }
  let p = portrait(session);
  assert.deepEqual([p.avatar, p.full_body], [null, null]);
  assert.deepEqual(p.gallery.map(g => [g.kind, g.pose_label, g.can_be_avatar, g.can_be_full_body]), Array(3).fill(["fullbody", "Hand on hip", false, true]));
  // The first AVATAR batch still bootstraps the Avatar afterwards (no avatar-kind image existed yet).
  const avatars = await generate(session, "avatar", "wink");
  assert.ok(avatars.ok && avatars.avatar_auto_selected);
  assert.ok(generator.calls.slice(3).every(c => isAvatarCall(c) && c.prompt.includes(PORTRAIT_POSE_TEXT.avatar.wink.text)));
  p = portrait(session);
  assert.equal(p.gallery.find(g => g.is_avatar)!.kind, "avatar");
});

test("kind and pose come from the server enums only: missing/unknown kind, unknown or cross-kind pose, free text are refused before any call", async () => {
  const { session, generator } = await miraSession();
  const ref = mira(session).ref, revision = rev(session);
  for (const [kind, pose] of [[undefined, undefined], ["portrait", "neutral"], ["avatar", "kneeling"], ["fullbody", "wink"], ["avatar", "looking_back"], ["avatar", "toString"],
    ["avatar", "a sultry pose, no clothes"], ["fullbody", 7]] as const) {
    const r = await session.generateNpcPortraitBatch({ ref, expected_revision: revision, kind, pose });
    assert.ok(!r.ok, `${kind}/${pose}`); assert.equal(r.error.code, "invalid_input");
  }
  assert.equal(generator.calls.length, 0); assert.equal(rev(session), revision);
  // An omitted pose is the neutral pose.
  assert.ok((await session.generateNpcPortraitBatch({ ref, expected_revision: revision, kind: "avatar" })).ok);
  assert.ok(generator.calls.every(c => c.prompt.includes(PORTRAIT_POSE_TEXT.avatar.neutral.text)));
});

for (const [label, failing, expected] of [["2/3", [1], [0, 2]], ["1/3", [0, 1], [2]]] as const) test(`first batch ${label}: only successes enter the Gallery; the Avatar is chosen among them only`, async () => {
  for (let pick = 0; pick < expected.length; pick++) {
    const picks: number[] = [];
    const { session, generator, root, logs } = await miraSession({ pick: count => { picks.push(count); return pick; } });
    generator.plan = index => (failing as readonly number[]).includes(index) ? new ImageGenerationError("invalid_request", 400) : undefined;
    const revision = rev(session), result = await generate(session);
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepEqual([result.succeeded, result.failed, result.refused, result.avatar_auto_selected, result.message],
      [expected.length, 3 - expected.length, 0, true, `${expected.length} of 3 generated successfully; ${3 - expected.length} failed.`]);
    assert.equal(rev(session), revision + 1); assert.equal(generator.calls.length, 3, "an invalid request (4xx) is never retried");
    const p = portrait(session);
    assert.deepEqual(await Promise.all(p.gallery.map(g => candidateOf(session, g.url))), expected, "successful candidates only, in call order");
    assert.deepEqual(picks, [expected.length]);
    assert.equal(await candidateOf(session, p.avatar!.url), expected[pick], "Avatar is the picked success");
    assert.equal(p.full_body, null);
    assert.equal((await portraitFiles(root)).length, expected.length); assert.ok(!(await files(root)).some(f => f.startsWith(".tmp")));
    assert.deepEqual(logs.filter(l => l.code === "invalid_request"), failing.map(() => ({ code: "invalid_request", status: 400 })));
  }
});

test("first batch 0/3 changes nothing: no revision, no files, no roles, no metadata", async () => {
  const picks: number[] = [];
  const { session, generator, root, logs } = await miraSession({ pick: count => { picks.push(count); return 0; } });
  generator.plan = () => new ImageGenerationError("insufficient_credits", 402);
  const revision = rev(session), before = portrait(session), result = await generate(session);
  assert.ok(!result.ok); assert.equal(result.error.code, "portrait_generation_failed");
  assert.equal(result.error.message, "Portrait generation failed. The image provider reports insufficient credits. Nothing was saved.");
  assert.deepEqual([result.requested, result.succeeded, result.failed, result.provider_calls], [3, 0, 3, 3]);
  assert.equal(generator.calls.length, 3); assert.equal(rev(session), revision); assert.deepEqual(portrait(session), before);
  assert.deepEqual(await files(root), []); assert.deepEqual(picks, []); assert.equal(logs.length, 3);
  assert.deepEqual(logs[0], { code: "insufficient_credits", status: 402 });
  // A later success is still the first avatar batch: the Avatar bootstraps then.
  generator.plan = () => undefined;
  const next = await generate(session); assert.ok(next.ok && next.avatar_auto_selected);
});

test("504 is retried once with the SAME seed and prompt; 429 likewise; the batch still delivers 3", async () => {
  for (const [code, status] of [["transient_provider_error", 504], ["rate_limited", 429]] as const) {
    const { session, generator, logs } = await miraSession({ pick: () => 0 });
    generator.plan = index => index === 1 ? new ImageGenerationError(code, status) : undefined;
    const result = await generate(session, "avatar", "shy");
    assert.ok(result.ok, JSON.stringify(result));
    assert.deepEqual([result.succeeded, result.failed, result.provider_calls, result.message], [3, 0, 4, "3 avatar options generated."]);
    assert.equal(generator.calls.length, 4);
    assert.equal(generator.calls[3]!.seed, generator.calls[1]!.seed, "same seed"); assert.equal(generator.calls[3]!.prompt, generator.calls[1]!.prompt, "same prompt");
    assert.deepEqual(logs, [{ code, status, recovery: "same_seed" }]);
    const kept = portrait(session).gallery.map(g => g.token);
    assert.equal(kept.length, 3);
  }
});

test("content refusal is retried once with a NEW seed, same kind and pose, and the modest-neckline reinforcement", async () => {
  const { session, generator, logs, repository, id, woman } = await miraSession({ pick: () => 0 });
  generator.plan = index => index === 0 ? new ImageGenerationError("content_refusal", 422) : undefined;
  const result = await generate(session, "avatar", "hand_near_face");
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual([result.succeeded, result.refused, result.provider_calls], [3, 0, 4]);
  const [refused, , , retry] = generator.calls;
  assert.ok(!generator.calls.slice(0, 3).map(c => c.seed).includes(retry!.seed), "a new seed, distinct from every seed of the batch");
  assert.deepEqual([retry!.width, retry!.height, retry!.negative_prompt], [refused!.width, refused!.height, refused!.negative_prompt]);
  assert.ok(retry!.prompt.includes(`Pose and expression: ${PORTRAIT_POSE_TEXT.avatar.hand_near_face.text}.`), "same pose");
  assert.ok(retry!.prompt.includes("Fully clothed; high-collared, modest neckline.")); assert.ok(!refused!.prompt.includes("Fully clothed"));
  assert.equal(retry!.prompt.replace(" Fully clothed; high-collared, modest neckline.", ""), refused!.prompt, "only the reinforcement differs");
  assert.deepEqual(logs, [{ code: "content_refusal", status: 422, recovery: "reseed" }]);
  // The recorded seed and prompt are the ones actually used for the stored image.
  await session.save();
  const versions = (await repository.loadCampaign(id)).campaign.exportSnapshot().portraits!.find(r => r.character_id === woman)!.versions;
  const fromRetry = versions.find(v => v.seed === retry!.seed)!;
  assert.equal(fromRetry.prompt, retry!.prompt); assert.equal(fromRetry.pose, "hand_near_face");
});

test("a second refusal stops (no endless weakening): partial success is kept with a clear summary", async () => {
  const { session, generator } = await miraSession({ pick: () => 0 });
  generator.plan = index => index === 0 || index === 3 ? new ImageGenerationError("content_refusal", 422) : undefined;
  const result = await generate(session);
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual([result.succeeded, result.failed, result.refused, result.provider_calls], [2, 1, 1, 4]);
  assert.equal(result.message, "2 of 3 generated successfully; 1 was refused by the image provider.");
  assert.equal(portrait(session).gallery.length, 2);
  assert.doesNotMatch(result.message, /422|content_policy|HTTP/);
});

test("at most 6 provider calls per batch; total refusal and total transient failure change nothing", async () => {
  for (const [error, message] of [[() => new ImageGenerationError("transient_provider_error", 503), "Portrait generation failed. The image provider timed out or was temporarily unavailable. Nothing was saved."],
    [() => new ImageGenerationError("content_refusal", 422), "None of the 3 avatar options could be generated: the image provider refused them. Try again or choose another pose."]] as const) {
    const { session, generator, root } = await miraSession({ pick: () => 0 });
    generator.plan = () => error();
    const revision = rev(session), result = await generate(session);
    assert.ok(!result.ok); assert.equal(result.error.message, message);
    assert.equal(generator.calls.length, 6, "one recovery per image, never more"); assert.equal(result.provider_calls, 6);
    assert.equal(rev(session), revision); assert.deepEqual(await files(root), []);
  }
  // Mixed: one refusal survives its reseed, one transient survives its retry, one succeeds.
  const { session, generator } = await miraSession({ pick: () => 0 });
  generator.plan = (index, call) => index === 0 || (index > 2 && call.prompt.includes("Fully clothed")) ? new ImageGenerationError("content_refusal", 422)
    : index === 1 || (index > 2 && !call.prompt.includes("Fully clothed")) ? new ImageGenerationError("transient_provider_error", 504) : undefined;
  const mixed = await generate(session);
  assert.ok(mixed.ok); assert.equal(generator.calls.length, 5);
  assert.equal(mixed.message, "1 of 3 generated successfully; 1 was refused by the image provider and 1 failed.");
});

test("auth, configuration and invalid requests are never retried", async () => {
  for (const [error, message] of [[new ImageGenerationError("auth_error", 401), /rejected the Hugging Face token/], [new ImageGenerationError("configuration_error"), /set HF_TOKEN/],
    [new ImageGenerationError("invalid_request", 422), /rejected the request/], [new ImageGenerationError("malformed_response"), /unusable response/]] as const) {
    const { session, generator, logs } = await miraSession();
    generator.plan = () => error;
    const result = await generate(session);
    assert.ok(!result.ok); assert.match(result.error.message, message); assert.equal(generator.calls.length, 3, error.code);
    assert.ok(logs.every(l => l.recovery === undefined));
    assert.doesNotMatch(result.error.message, /hf_|Bearer|HTTP/);
  }
});

test("seeds: an explicit seed on every call, distinct within a batch even when the source repeats", async () => {
  const sequence = [5, 5, 6, 5, 7, 8, 9];
  const { session, generator } = await miraSession({ pick: () => 0, seeds: () => sequence.shift()! });
  generator.plan = index => index === 2 ? new ImageGenerationError("content_refusal", 422) : undefined;
  assert.ok((await generate(session)).ok);
  assert.deepEqual(generator.calls.map(c => c.seed), [5, 6, 7, 8], "duplicates skipped; the reseed is new too");
});

test("minors: generation is blocked before any call, with a clear note", async () => {
  const { session, generator } = await miraSession({ seed: (c, woman) => {
    const record = c.exportSnapshot().characters.find(x => x.id === woman)!;
    c.apply({ expected_revision: c.revision, commands: [{ kind: "set_profile", character_id: woman, profile: { ...structuredClone(record.profile), age: { kind: "exact", years: 16 } } as never }] });
  } });
  const p = portrait(session);
  assert.equal(p.can_generate_batch, false); assert.match(p.generation_blocked!, /only available for adult characters/);
  for (const kind of ["avatar", "fullbody"] as const) {
    const r = await generate(session, kind); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input"); assert.match(r.error.message, /adult/);
  }
  assert.equal(generator.calls.length, 0);
});

test("default randomness: the Avatar is drawn from the batch via node:crypto, never from earlier images", async () => {
  for (let run = 0; run < 6; run++) {
    const { session, generator } = await miraSession();
    generator.plan = index => index === 0 ? new ImageGenerationError("invalid_request", 400) : undefined;
    assert.ok((await generate(session)).ok);
    const avatar = await candidateOf(session, portrait(session).avatar!.url);
    assert.ok(avatar === 1 || avatar === 2, `avatar ${avatar} must be a success of this batch`);
  }
});

test("subsequent batches append to the Gallery and never change the Avatar or the Full Body", async () => {
  let picks = 0;
  const { session } = await miraSession({ pick: () => { picks++; return 0; } });
  assert.ok((await generate(session)).ok);
  assert.ok((await generate(session, "fullbody")).ok);
  const first = portrait(session), ref = mira(session).ref;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: first.gallery[4]!.token }).ok);
  const roles = portrait(session);
  const revision = rev(session), second = await generate(session);
  assert.ok(second.ok); assert.equal(second.avatar_auto_selected, false); assert.equal(second.message, "3 avatar options generated.");
  assert.equal(rev(session), revision + 1); assert.equal(picks, 1, "no pick after the first avatar batch");
  const p = portrait(session);
  assert.equal(p.gallery.length, 9); assert.deepEqual(p.gallery.slice(0, 6).map(g => g.token), first.gallery.map(g => g.token), "new images append");
  assert.deepEqual([p.avatar, p.full_body], [roles.avatar, roles.full_body]);
  assert.deepEqual(p.gallery.map(g => [g.is_avatar, g.is_full_body]), [[true, false], [false, false], [false, false], [false, false], [false, true], [false, false], [false, false], [false, false], [false, false]]);
});

test("roles follow kinds: Avatar from avatar images, Full Body from full-body images; clear Full Body; no files copied; appearance untouched", async () => {
  const { session, root, repository, id, woman } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok); assert.ok((await generate(session, "fullbody")).ok);
  const ref = mira(session).ref, g = portrait(session).gallery, filesBefore = await files(root);
  const profile = () => session.getPlayUiView().household.flatMap(h => h.members).find(m => m.ref === ref)!.appearance_editor!.fields;
  const fields = profile();
  let revision = rev(session);
  // Avatar → avatar image 2: the previous Avatar loses the role; compact surfaces follow.
  const avatar = session.setNpcPortraitAvatar({ ref, expected_revision: revision, item: g[1]!.token });
  assert.ok(avatar.ok && avatar.changed); assert.equal(rev(session), ++revision);
  assert.deepEqual(portrait(session).gallery.map(x => x.is_avatar), [false, true, false, false, false, false]);
  assert.equal(mira(session).avatar_url, g[1]!.url); assert.equal(portrait(session).full_body, null);
  // The avatar role rejects a full-body image; the full-body role rejects an avatar image.
  const wrongAvatar = session.setNpcPortraitAvatar({ ref, expected_revision: revision, item: g[3]!.token });
  assert.ok(!wrongAvatar.ok); assert.equal(wrongAvatar.error.code, "invalid_input"); assert.match(wrongAvatar.error.message, /Only an avatar image can be the Avatar/);
  const wrongFull = session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: g[0]!.token });
  assert.ok(!wrongFull.ok); assert.match(wrongFull.error.message, /Only a full-body image can be the Full Body/);
  assert.equal(rev(session), revision);
  // Full Body → full-body image; Avatar unchanged.
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: g[5]!.token }).ok); assert.equal(rev(session), ++revision);
  assert.deepEqual([portrait(session).full_body!.url, portrait(session).avatar!.url], [g[5]!.url, g[1]!.url]);
  // Re-assigning the current holder is a no-op.
  const same = session.setNpcPortraitAvatar({ ref, expected_revision: revision, item: g[1]!.token }); assert.ok(same.ok && !same.changed); assert.equal(rev(session), revision);
  // Clear Full Body: the image stays in the Gallery, the slot is empty again, the Avatar is untouched.
  const clear = session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: null });
  assert.ok(clear.ok && clear.changed); assert.equal(rev(session), ++revision);
  assert.equal(portrait(session).full_body, null); assert.equal(portrait(session).avatar!.url, g[1]!.url); assert.equal(portrait(session).gallery.length, 6);
  const again = session.setNpcPortraitFullBody({ ref, expected_revision: revision, item: null }); assert.ok(again.ok && !again.changed);
  assert.deepEqual(await files(root), filesBefore, "roles never copy or move files");
  assert.deepEqual(profile(), fields, "roles never touch appearance");
  await session.save();
  const saved = (await repository.loadCampaign(id)).campaign.exportSnapshot().portraits!.find(r => r.character_id === woman)!;
  assert.equal(saved.avatar_version_id, saved.versions[1]!.version_id); assert.equal(saved.full_body_version_id, undefined);
  // Domain boundary: the kind rule holds even if a caller bypasses the session.
  const restored = CampaignState.restore(world, structuredClone((await repository.loadCampaign(id)).campaign.exportSnapshot()));
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "set_portrait_avatar", character_id: woman, version_id: saved.versions[3]!.version_id }] }), /only an avatar image/);
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "set_portrait_full_body", character_id: woman, version_id: saved.versions[0]!.version_id }] }), /only a full-body image/);
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "record_portrait_batch", character_id: woman, versions: [fakeVersion(1, "fullbody")], avatar_version_id: "portrait_seed_1" }] }));
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
    const r = a.session.setNpcPortraitAvatar({ ref: p.project(cid)!.ref, expected_revision: revision, item: before.gallery[1]!.token }); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input");
  }
  assert.equal(rev(a.session), revision); assert.deepEqual(portrait(a.session), before);
  // Domain boundary: a role naming a version outside the character's Gallery never commits, even if a caller bypasses the session.
  const restored = CampaignState.restore(world, structuredClone(snapshot));
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "set_portrait_avatar", character_id: a.woman, version_id: "portrait_missing" }] }));
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "set_portrait_full_body", character_id: a.plain, version_id: meta.versions[0]!.version_id }] }), "no cross-character role binding");
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "delete_portrait_version", character_id: a.woman, version_id: meta.avatar_version_id! }] }), "a role holder cannot be deleted");
  assert.throws(() => restored.apply({ expected_revision: restored.revision, commands: [{ kind: "record_portrait_batch", character_id: a.woman, versions: [fakeVersion(1, "avatar")], avatar_version_id: "portrait_seed_1" }] }), "no Avatar bootstrap after the first avatar batch");
});

test("delete: Avatar and Full Body holders are blocked; an unassigned image is removed metadata-first, then its file", async () => {
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
  assert.ok((await generate(session)).ok); assert.ok((await generate(session, "fullbody")).ok);
  const ref = mira(session).ref, g = portrait(session).gallery;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: g[3]!.token }).ok);
  const revision = rev(session);
  const blocked = async (item: string, message: RegExp) => {
    const r = await session.deleteNpcPortrait({ ref, expected_revision: revision, item });
    assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input"); assert.match(r.error.message, message);
  };
  await blocked(g[0]!.token, /^Choose another Avatar before deleting this image\.$/);
  await blocked(g[3]!.token, /^Choose another Full Body image or clear Full Body first\.$/);
  assert.equal(rev(session), revision); assert.equal((await portraitFiles(root)).length, 6); assert.deepEqual(order, []);
  // Unassigned image: committed removal first, then the file.
  const ok = await session.deleteNpcPortrait({ ref, expected_revision: revision, item: g[2]!.token });
  assert.ok(ok.ok && ok.changed); assert.equal(rev(session), revision + 1);
  assert.deepEqual(order, ["remove:5"], "metadata committed before the physical delete");
  assert.deepEqual(portrait(session).gallery.map(x => x.token), [g[0]!.token, g[1]!.token, g[3]!.token, g[4]!.token, g[5]!.token]);
  assert.equal((await portraitFiles(root)).length, 5); assert.equal(await session.readPortraitAsset(g[2]!.url.split("/").pop()), undefined);
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

test("legacy (pre-v1) images: old metadata loads, stays viewable, keeps its roles (even both), shows stale, but can never receive a role again", async () => {
  const legacy = [fakeVersion(1), fakeVersion(2)];
  const s = await miraSession({ pick: () => 0, snapshot: (snapshot, woman) => {
    snapshot.portraits = [{ character_id: woman, avatar_version_id: legacy[0]!.version_id, full_body_version_id: legacy[0]!.version_id, versions: structuredClone(legacy) }];
  } });
  const { session, store, campaignId, woman, repository, id, deps } = s;
  for (const v of legacy) await store.finalize(await store.stage(campaignId, woman, Buffer.from(PNG, "base64")), campaignId, woman, v.asset_file);
  const ref = mira(session).ref;
  let p = portrait(session);
  assert.deepEqual(p.gallery.map(g => [g.kind, g.pose_label, g.can_be_avatar, g.can_be_full_body, g.is_avatar, g.is_full_body, g.stale]),
    [["legacy", null, false, false, true, true, true], ["legacy", null, false, false, false, false, true]]);
  assert.equal(mira(session).avatar_url, p.gallery[0]!.url); assert.equal(p.full_body!.url, p.gallery[0]!.url);
  assert.deepEqual([p.avatar!.stale, p.full_body!.stale], [true, true], "stale marker: generated from an older (pre-v1) appearance fingerprint");
  for (const g of p.gallery) assert.ok(await session.readPortraitAsset(g.url.split("/").pop()), "legacy files are viewable");
  // A legacy image cannot receive a new role; the dual-role one cannot be deleted.
  for (const r of [session.setNpcPortraitAvatar({ ref, expected_revision: rev(session), item: p.gallery[1]!.token }), session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: p.gallery[1]!.token })]) {
    assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input");
  }
  const dual = await session.deleteNpcPortrait({ ref, expected_revision: rev(session), item: p.gallery[0]!.token });
  assert.ok(!dual.ok); assert.match(dual.error.message, /Avatar and the Full Body/);
  // An avatar batch never replaces an existing (legacy) Avatar automatically.
  const batch = await generate(session); assert.ok(batch.ok && !batch.avatar_auto_selected);
  p = portrait(session);
  assert.ok(p.gallery[0]!.is_avatar, "the legacy Avatar is preserved");
  // Moving the Avatar to a new avatar image works; moving it back to the legacy image is refused.
  assert.ok(session.setNpcPortraitAvatar({ ref, expected_revision: rev(session), item: p.gallery[2]!.token }).ok);
  const back = session.setNpcPortraitAvatar({ ref, expected_revision: rev(session), item: p.gallery[0]!.token });
  assert.ok(!back.ok); assert.match(back.error.message, /Only an avatar image/);
  assert.ok(portrait(session).gallery[0]!.is_full_body, "the legacy Full Body is still held");
  // Save + reload: legacy versions round-trip without any kind; roles load.
  assert.ok((await session.save()).ok);
  const saved = (await repository.loadCampaign(id)).campaign.exportSnapshot().portraits!.find(r => r.character_id === woman)!;
  assert.deepEqual(saved.versions.slice(0, 2), legacy, "legacy metadata is unchanged (no kind invented)");
  assert.equal(saved.full_body_version_id, legacy[0]!.version_id);
  const reloaded = await GameSession.loadCampaign(deps, id); assert.ok(reloaded.ok);
  assert.deepEqual(portrait(reloaded.session), portrait(session));
});

test("V1 save: active_version_id becomes the Avatar; no Full Body; every old version stays in the Gallery; delete of it is blocked", async () => {
  const { session, saves, id, deps, root } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok);
  assert.ok((await session.save()).ok);
  // Rewrite the save into the exact V1 shape: active_version_id on the second version, no V2 role fields, no v1 image metadata.
  const path = join(saves, id, "save.json"), file = JSON.parse(await readFile(path, "utf8"));
  const record = file.snapshot.portraits[0];
  const versions = record.versions.map((v: { version_id: string }) => v.version_id);
  delete record.avatar_version_id; record.active_version_id = versions[1];
  for (const v of record.versions) for (const key of ["kind", "pose", "prompt", "seed", "provider_seed", "provider", "style_id", "width", "height", "billable_units"]) delete v[key];
  await writeFile(path, JSON.stringify(file, null, 2));
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok, JSON.stringify(loaded.ok ? "" : loaded.error));
  const v1 = loaded.session, p = portrait(v1);
  assert.equal(p.gallery.length, 3, "every V1 version is in the Gallery");
  assert.deepEqual(p.gallery.map(g => g.is_avatar), [false, true, false]); assert.equal(p.full_body, null);
  assert.ok(p.gallery.every(g => g.kind === "legacy"));
  assert.equal(mira(v1).avatar_url, p.gallery[1]!.url, "the portrait the V1 save displayed is still shown");
  const blocked = await v1.deleteNpcPortrait({ ref: mira(v1).ref, expected_revision: rev(v1), item: p.gallery[1]!.token });
  assert.ok(!blocked.ok); assert.match(blocked.error.message, /Choose another Avatar/);
  assert.equal((await portraitFiles(root)).length, 3, "no new image generated by the migration");
  // Re-saving writes the V2 role field only (the legacy Avatar is kept as is).
  assert.ok((await v1.save()).ok);
  const resaved = JSON.parse(await readFile(path, "utf8")).snapshot.portraits[0];
  assert.deepEqual([resaved.active_version_id, resaved.avatar_version_id, resaved.full_body_version_id], [undefined, versions[1], undefined]);
  // A record naming conflicting legacy and V2 avatars is corrupt, never silently resolved.
  const conflict = structuredClone(file); conflict.snapshot.portraits[0].avatar_version_id = versions[2];
  await writeFile(path, JSON.stringify(conflict, null, 2));
  assert.equal((await GameSession.loadCampaign(deps, id)).ok, false);
});

test("snapshot decode: legacy active_version_id maps to avatar_version_id; v1 fields are optional and bounded; dangling roles are invalid", async () => {
  const { session, repository, id } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok); await session.save();
  const snapshot = structuredClone((await repository.loadCampaign(id)).campaign.exportSnapshot()) as any;
  const record = snapshot.portraits[0], avatar = record.avatar_version_id;
  delete record.avatar_version_id; record.active_version_id = avatar;
  assert.deepEqual(Object.keys(parseCampaignSnapshot(snapshot).portraits![0]!), ["character_id", "avatar_version_id", "versions"]);
  record.avatar_version_id = avatar;
  assert.equal(parseCampaignSnapshot(snapshot).portraits![0]!.avatar_version_id, avatar);
  for (const [key, bad] of [["kind", "portrait"], ["seed", -1], ["seed", 1.5], ["width", 0], ["prompt", "x".repeat(4001)], ["pose", "Bad Pose"], ["billable_units", -1], ["provider", "../x"]] as const) {
    const copy = structuredClone(snapshot); copy.portraits[0].versions[0][key] = bad;
    assert.throws(() => parseCampaignSnapshot(copy), `${key}=${String(bad).slice(0, 20)}`);
  }
  delete record.active_version_id; record.full_body_version_id = "portrait_missing";
  assert.throws(() => CampaignState.restore(world, snapshot), "a role must name a Gallery version");
});

test("Gallery limit: a batch that cannot be fully recorded is refused before any paid call", async () => {
  for (const [seeded, allowed] of [[MAX_PORTRAIT_VERSIONS - 2, false], [MAX_PORTRAIT_VERSIONS - 3, true]] as const) {
    const { session, generator } = await miraSession({ seed: (c, woman) => {
      for (let start = 0; start < seeded; start += 3) {
        const batch = Array.from({ length: Math.min(3, seeded - start) }, (_, i) => fakeVersion(start + i + 1, "avatar"));
        c.apply({ expected_revision: c.revision, commands: [{ kind: "record_portrait_batch", character_id: woman, versions: batch, ...(start === 0 ? { avatar_version_id: batch[0]!.version_id } : {}) }] });
      }
    } });
    assert.equal(portrait(session).gallery.length, seeded); assert.equal(portrait(session).can_generate_batch, allowed);
    for (const kind of ["avatar", "fullbody"] as const) {
      const revision = rev(session), result = await generate(session, kind);
      if (allowed) { assert.ok(result.ok); assert.equal(portrait(session).gallery.length, MAX_PORTRAIT_VERSIONS); assert.equal(portrait(session).can_generate_batch, false); break; }
      assert.ok(!result.ok); assert.equal(result.error.message, "Gallery is full. Delete some unused portraits first.");
      assert.equal(generator.calls.length, 0, "no paid call"); assert.equal(rev(session), revision);
    }
  }
});

test("stale revision, bad refs and ineligible targets never call the provider; one batch at a time (either kind); roles, delete and appearance are locked during a batch", async () => {
  const { session, generator, plain, deps, id } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session)).ok);
  const ref = mira(session).ref, revision = rev(session), g = portrait(session).gallery;
  assert.ok(session.overridePlayerLocation({ target: "heartstone_square", expected_revision: revision }).ok);
  const stale = await session.generateNpcPortraitBatch({ ref, expected_revision: revision, kind: "avatar" });
  assert.ok(!stale.ok); assert.equal(stale.error.code, "stale_turn");
  const now = rev(session), calls = generator.calls.length;
  for (const bad of ["0".repeat(24), "../../etc/passwd", 7, ref.replace(/./, "f")]) {
    const r = await session.generateNpcPortraitBatch({ ref: bad, expected_revision: now, kind: "avatar" }); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input");
  }
  const p = playerCharacterProjection(world, (await deps.repository.loadCampaign(id)).campaign.exportSnapshot());
  for (const cid of ["nicco", plain]) { const r = await session.generateNpcPortraitBatch({ ref: p.project(cid)!.ref, expected_revision: now, kind: "avatar" }); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input"); }
  assert.equal(generator.calls.length, calls, "no provider call for any rejected request");
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const running = session.generateNpcPortraitBatch({ ref, expected_revision: now, kind: "avatar" });
  await tick();
  for (const kind of ["avatar", "fullbody"] as const) {
    const second = await session.generateNpcPortraitBatch({ ref, expected_revision: now, kind });
    assert.ok(!second.ok); assert.equal(second.error.code, "turn_in_progress", `overlapping ${kind} batch is refused`);
  }
  for (const r of [session.updateNpcAppearance({ ref, expected_revision: now, patch: { build: "lean" } }), session.setNpcPortraitAvatar({ ref, expected_revision: now, item: g[1]!.token }),
    session.setNpcPortraitFullBody({ ref, expected_revision: now, item: null }), await session.deleteNpcPortrait({ ref, expected_revision: now, item: g[2]!.token })]) {
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
  const second = session.generateNpcPortraitBatch({ ref: mira(session).ref, expected_revision: revision, kind: "fullbody" }); await tick();
  duringTurn.fn = campaign => {
    const record = campaign.exportSnapshot().characters.find(c => c.id === woman)!;
    const patched = applyAppearancePatch(record.profile.appearance, { hair_color: "silver" }); assert.ok(patched.ok);
    campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "set_profile", character_id: woman, profile: { ...structuredClone(record.profile), appearance: patched.appearance } as never }] });
  };
  const changing = session.submitPlayerInput("*waits again*");
  open();
  const [refused] = await Promise.all([second, changing]);
  // (The stub turn's own commit may go stale after the direct mutation; what matters is that appearance changed mid-batch.)
  assert.match(mira(session).appearance_editor!.portrait_prompts.fullbody.prompt, /silver/);
  assert.ok(!refused.ok); assert.match(refused.error.message, /appearance changed while the portraits were generating/);
  assert.equal(portrait(session).gallery.length, 3); assert.deepEqual(portrait(session).gallery.map(g => g.token), before.gallery.map(g => g.token));
  assert.equal(portrait(session).avatar!.stale, true, "the Avatar is now marked as an older appearance");
  assert.equal((await portraitFiles(root)).length, 3); assert.ok(!(await files(root)).some(f => f.startsWith(".tmp")), "staged files are discarded");
});

test("a failed metadata commit removes every finalized file of the batch; no half-batch reaches the campaign", async () => {
  const duringTurn: Options["duringTurn"] = {};
  const { session, generator, root, woman } = await miraSession({ pick: () => 0, duringTurn });
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const revision = rev(session), running = session.generateNpcPortraitBatch({ ref: mira(session).ref, expected_revision: revision, kind: "avatar" }); await tick();
  // A turn records an avatar batch first, so this batch's Avatar bootstrap is no longer valid and its commit is refused.
  duringTurn.fn = campaign => campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "record_portrait_batch", character_id: woman, versions: [fakeVersion(1, "avatar")], avatar_version_id: "portrait_seed_1" }] });
  const turn = session.submitPlayerInput("*waits*");
  open();
  const [result] = await Promise.all([running, turn]);
  assert.ok(!result.ok); assert.equal(result.error.code, "campaign_validation_failed");
  assert.equal(portrait(session).gallery.length, 1, "only the turn's record; nothing from the failed batch");
  assert.deepEqual(await files(root), [], "all three finalized files were removed");
});

test("staleness is per image and follows the appearance (not the pose or kind); stale images stay usable", async () => {
  const { session } = await miraSession({ pick: () => 0 });
  assert.ok((await generate(session, "avatar", "wink")).ok); assert.ok((await generate(session, "fullbody", "kneeling")).ok);
  const ref = mira(session).ref;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: portrait(session).gallery[4]!.token }).ok);
  assert.deepEqual([portrait(session).avatar!.stale, portrait(session).full_body!.stale, portrait(session).gallery.some(g => g.stale)], [false, false, false], "pose and kind do not make an image stale");
  assert.ok(session.updateNpcAppearance({ ref, expected_revision: rev(session), patch: { hair_color: "copper" } }).ok);
  const p = portrait(session);
  assert.deepEqual([p.avatar!.stale, p.full_body!.stale, p.gallery.every(g => g.stale), p.gallery.length], [true, true, true, 6]);
  assert.ok((await generate(session)).ok);
  const q = portrait(session);
  assert.deepEqual(q.gallery.map(g => g.stale), [true, true, true, true, true, true, false, false, false]); assert.deepEqual([q.avatar!.stale, q.full_body!.stale], [true, true], "roles never move to the new images");
  assert.ok(session.setNpcPortraitAvatar({ ref, expected_revision: rev(session), item: q.gallery[7]!.token }).ok);
  assert.equal(portrait(session).avatar!.stale, false);
});

test("reference (deferred in v1): stored data is kept and removable, but never sent to the generator; roles never change", async () => {
  const { session, generator } = await miraSession({ pick: () => 0 });
  const ref = mira(session).ref;
  assert.ok((await session.setNpcPortraitReference({ ref, expected_revision: rev(session), image: { data_base64: JPEG } })).ok);
  assert.deepEqual([portrait(session).reference_attached, portrait(session).gallery.length, portrait(session).avatar], [true, 0, null], "a reference is not a Gallery item or a role");
  assert.ok((await generate(session)).ok); assert.ok((await generate(session, "fullbody")).ok);
  assert.equal(generator.calls.length, 6);
  assert.ok(generator.calls.every(c => c.references.length === 0), "v1 text-to-image never receives the reference");
  assert.ok(portrait(session).gallery.every(g => !g.reference_used));
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: portrait(session).gallery[4]!.token }).ok);
  const roles = portrait(session);
  assert.ok((await session.setNpcPortraitReference({ ref, expected_revision: rev(session), image: null })).ok);
  const after = portrait(session);
  assert.equal(after.reference_attached, false);
  assert.deepEqual([after.avatar, after.full_body, after.gallery.map(g => g.token)], [roles.avatar, roles.full_body, roles.gallery.map(g => g.token)]);
});

test("compact projection: Avatar only, never the Full Body; no Avatar → null; Gallery and roles stay editor-only", async () => {
  const { session, deps, id, plain } = await miraSession({ pick: () => 1 });
  assert.equal(mira(session).avatar_url, null);
  assert.ok((await generate(session)).ok); assert.ok((await generate(session, "fullbody")).ok);
  const ref = mira(session).ref, g = portrait(session).gallery;
  assert.ok(session.setNpcPortraitFullBody({ ref, expected_revision: rev(session), item: g[3]!.token }).ok);
  const card = mira(session);
  assert.equal(card.avatar_url, g[1]!.url); assert.notEqual(card.avatar_url, card.appearance_editor!.portrait.full_body!.url);
  // The scene participant projection carries the same card (Mira is present in the living room).
  const participant = session.getPlayUiView().participants.find(x => x.ref === ref)!;
  assert.equal(participant.card!.avatar_url, g[1]!.url);
  const other = playerCharacterProjection(world, (await deps.repository.loadCampaign(id)).campaign.exportSnapshot()).project(plain)!;
  assert.deepEqual([other.avatar_url, other.appearance_editor], [null, null]);
});

test("HTTP: generate takes ref + revision + kind + pose only; role and delete routes take an opaque item token; assets served; traversal 404; stale 409", async () => {
  const { session, generator } = await miraSession({ pick: () => 0 });
  const server = createPlaytestServer(session);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (route: string, body: unknown) => fetch(`${url}/api/portrait/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const card = (state: any) => state.play.household.flatMap((h: any) => h.members).find((m: any) => m.name === "Mira");
    const state = await (await fetch(`${url}/api/session`)).json();
    const invalid = await post("generate", { ref: card(state).ref, expected_revision: state.revision, kind: "avatar", pose: "free text" });
    assert.equal(invalid.status, 422); assert.equal(generator.calls.length, 0);
    const response = await post("generate", { ref: card(state).ref, expected_revision: state.revision, kind: "avatar", pose: "three_quarter", prompt: "draw a castle", model: "evil/model", n: 10, batch_size: 10,
      seed: 1, width: 4096, character_id: "campaign_character_x" });
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.deepEqual([next.kind, next.requested, next.succeeded, next.failed, next.avatar_auto_selected], ["avatar", 3, 3, 0, true]);
    assert.equal(generator.calls.length, 3, "the browser cannot change the batch size");
    assert.ok(generator.calls.every(c => c.prompt.includes(PORTRAIT_POSE_TEXT.avatar.three_quarter.text) && !c.prompt.includes("castle") && c.seed !== 1 && c.width === 992));
    const fb = await post("generate", { ref: card(next).ref, expected_revision: next.revision, kind: "fullbody", pose: "contrapposto" });
    assert.equal(fb.status, 200); const afterFb = await fb.json();
    const gallery = card(afterFb).appearance_editor.portrait.gallery;
    assert.deepEqual(gallery.map((g: any) => g.kind), ["avatar", "avatar", "avatar", "fullbody", "fullbody", "fullbody"]);
    const asset = await fetch(url + gallery[0].url);
    assert.equal(asset.status, 200); assert.equal(asset.headers.get("content-type"), "image/png");
    const avatar = await post("avatar", { ref: card(next).ref, expected_revision: afterFb.revision, item: gallery[1].token });
    assert.equal(avatar.status, 200); const afterAvatar = await avatar.json(); assert.equal(card(afterAvatar).avatar_url, gallery[1].url);
    const wrongKind = await post("full-body", { ref: card(next).ref, expected_revision: afterAvatar.revision, item: gallery[0].token });
    assert.equal(wrongKind.status, 422);
    const full = await post("full-body", { ref: card(next).ref, expected_revision: afterAvatar.revision, item: gallery[4].token });
    assert.equal(full.status, 200); const afterFull = await full.json(); assert.equal(card(afterFull).appearance_editor.portrait.full_body.url, gallery[4].url);
    const blocked = await post("delete", { ref: card(next).ref, expected_revision: afterFull.revision, item: gallery[4].token });
    assert.equal(blocked.status, 422); assert.match((await blocked.json()).error.message, /clear Full Body first/);
    const cleared = await post("full-body", { ref: card(next).ref, expected_revision: afterFull.revision, item: null });
    const afterClear = await cleared.json(); assert.equal(card(afterClear).appearance_editor.portrait.full_body, null);
    const deleted = await post("delete", { ref: card(next).ref, expected_revision: afterClear.revision, item: gallery[4].token });
    assert.equal(deleted.status, 200); assert.equal(card(await deleted.json()).appearance_editor.portrait.gallery.length, 5);
    assert.equal((await post("avatar", { ref: card(next).ref, expected_revision: next.revision, item: gallery[0].token })).status, 409, "stale revision");
    for (const bad of ["/api/portrait/asset/../../package.json", "/api/portrait/asset/" + "0".repeat(32), "/api/portrait/asset/zzz", `/api/portrait/asset/${gallery[0].token}`]) assert.notEqual((await fetch(url + bad)).status, 200, bad);
    assert.doesNotMatch(JSON.stringify(afterFb), /OPENROUTER|HF_TOKEN|hf_|test-key|caldrevan-gallery-|\\\\|asset_file|prompt_fingerprint|version_id|portrait_[0-9a-f]{12}|"seed"/);
  } finally { server.close(); await session.shutdown({ discard_unsaved: true }); }
});

test("the production stack config is the validated Raena setup", () => {
  assert.deepEqual([RAENA_IMAGE_STACK.provider, RAENA_IMAGE_STACK.endpoint, RAENA_IMAGE_STACK.style_id, RAENA_IMAGE_STACK.base_model, RAENA_IMAGE_STACK.trigger, RAENA_IMAGE_STACK.lora_scale],
    ["fal-ai", "fal-ai/qwen-image", "Raelina/Raena-Qwen-Image", "Qwen/Qwen-Image", "Anime illustration of", 1]);
  assert.deepEqual([RAENA_IMAGE_STACK.avatar_size, RAENA_IMAGE_STACK.fullbody_size], [{ width: 992, height: 992 }, { width: 800, height: 1200 }]);
  assert.equal(RAENA_IMAGE_STACK.lora_url, "https://huggingface.co/Raelina/Raena-Qwen-Image/resolve/main/raena_qwen_image_lora_v0.1.safetensors");
});
