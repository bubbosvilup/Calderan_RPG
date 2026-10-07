import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import { portraitFingerprint } from "../src/campaign/portrait-prompt.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { GameSession, type SessionDeps } from "../src/app/index.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { PortraitAssetStore } from "../src/app/portrait-store.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { DEFAULT_PORTRAIT_IMAGE_CONFIG, ImageGenerationError, OpenRouterImageClient, type PortraitImageGenerator, type ImageReference } from "../src/llm/openrouter/image-client.js";
import { mockController, mockNarrator } from "./turn-fixtures.js";

/** Portrait Image Generation V1: provider client (fake fetch) and the full session lifecycle (fake generator). No paid calls. */
const world = await loadWorld("data");
const LR = "heartstone_lr";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString("base64");
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "caldrevan-portrait-")); dirs.push(d); return d; };
let serial = 0;

// ------------------------------------------------------------------------------------------------ provider client (fake fetch)
const ENDPOINTS = { id: DEFAULT_PORTRAIT_IMAGE_CONFIG.model, endpoints: [{ provider_slug: "seed", supported_parameters: { resolution: { type: "enum", values: ["1K", "2K"] },
  aspect_ratio: { type: "enum", values: ["1:1", "2:3", "3:4"] }, n: { type: "range", min: 1, max: 1 }, input_references: { type: "range", min: 0, max: 14 } }, pricing: [{ billable: "output_image", unit: "image", cost_usd: 0.018 }] }] };
function fakeFetch(reply: (body: any) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; body?: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (url.endsWith("/endpoints")) return new Response(JSON.stringify(ENDPOINTS), { status: 200 });
    return reply(init.body ? JSON.parse(String(init.body)) : undefined);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ok = (data: unknown, cost?: number) => new Response(JSON.stringify({ created: 1, data, ...(cost !== undefined ? { usage: { cost } } : {}) }), { status: 200 });
const client = (f: typeof fetch, key: string | undefined = "test-key", config = DEFAULT_PORTRAIT_IMAGE_CONFIG, timeout_ms = 2000) => new OpenRouterImageClient(config, { fetch: f, api_key: () => key, timeout_ms });

test("client: exact request (prompt unchanged, no negative prompt, validated config), decode, cost, cached capabilities", async () => {
  const { f, calls } = fakeFetch(() => ok([{ b64_json: PNG, media_type: "image/png" }], 0.018));
  const c = client(f), prompt = "Full-body character reference image.\nSubject: one female.";
  const result = await c.generate({ prompt });
  assert.equal(result.media_type, "image/png"); assert.equal(result.cost_usd, 0.018); assert.equal(result.model, "bytedance-seed/seedream-5-0-flash"); assert.ok(result.bytes.length > 8);
  const post = calls.find(x => x.url.endsWith("/images"))!;
  assert.equal(post.url, "https://openrouter.ai/api/v1/images");
  assert.deepEqual(post.body, { model: "bytedance-seed/seedream-5-0-flash", prompt, n: 1, resolution: "1K", aspect_ratio: "2:3" });
  assert.equal((post.init.headers as Record<string, string>).Authorization, "Bearer test-key");
  await c.generate({ prompt, references: [{ media_type: "image/png", bytes: Buffer.from(PNG, "base64") }] });
  const withRef = calls.filter(x => x.url.endsWith("/images")).at(-1)!.body;
  assert.deepEqual(withRef.input_references, [{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } }]);
  assert.equal(calls.filter(x => x.url.endsWith("/endpoints")).length, 1, "capabilities fetched once per client");
  // Missing cost stays unknown.
  const plain = await client(fakeFetch(() => ok([{ b64_json: PNG }])).f).generate({ prompt });
  assert.equal(plain.cost_usd, undefined); assert.equal(plain.media_type, "image/png");
});

test("client: failures map to safe codes without bodies; unsupported config and missing key never POST", async () => {
  const expectCode = async (c: OpenRouterImageClient, code: string, status?: number) => {
    await assert.rejects(c.generate({ prompt: "p" }), (e: unknown) => e instanceof ImageGenerationError && e.code === code && (status === undefined || e.status === status) && !/SECRET_BODY|test-key/.test(e.message));
  };
  for (const [status, code] of [[401, "authentication_error"], [402, "insufficient_credits"], [429, "rate_limited"], [500, "provider_unavailable"], [502, "provider_unavailable"], [400, "unsupported_configuration"], [524, "timeout"]] as const)
    await expectCode(client(fakeFetch(() => new Response('{"error":{"message":"SECRET_BODY"}}', { status })).f), code, status);
  await expectCode(client(fakeFetch(() => new Response("not json SECRET_BODY", { status: 200 })).f), "invalid_provider_response");
  await expectCode(client(fakeFetch(() => ok([])).f), "invalid_provider_response");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: PNG }, { b64_json: PNG }])).f), "invalid_provider_response");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: "" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: "@@not base64@@" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: Buffer.from("plain text, not an image").toString("base64") }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: PNG, media_type: "image/jpeg" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => ok([{ b64_json: Buffer.from("<svg></svg>").toString("base64"), media_type: "image/svg+xml" }])).f), "invalid_image");
  await expectCode(client(fakeFetch(() => new Promise<Response>(() => undefined)).f, "test-key", DEFAULT_PORTRAIT_IMAGE_CONFIG, 30), "timeout");
  const none = fakeFetch(() => ok([{ b64_json: PNG }]));
  await expectCode(new OpenRouterImageClient(DEFAULT_PORTRAIT_IMAGE_CONFIG, { fetch: none.f, api_key: () => undefined }), "configuration_error"); await expectCode(client(none.f, "  "), "configuration_error");
  assert.equal(none.calls.length, 0, "no request without a key");
  const unsupported = fakeFetch(() => ok([{ b64_json: PNG }]));
  await expectCode(client(unsupported.f, "k", { ...DEFAULT_PORTRAIT_IMAGE_CONFIG, resolution: "4K" }), "unsupported_configuration");
  await expectCode(client(unsupported.f, "k", { ...DEFAULT_PORTRAIT_IMAGE_CONFIG, aspect_ratio: "9:21" }), "unsupported_configuration");
  assert.ok(!unsupported.calls.some(x => x.url.endsWith("/images")), "an unsupported configuration never generates");
});

// ------------------------------------------------------------------------------------------------ session lifecycle (fake generator)
class FakeGenerator implements PortraitImageGenerator {
  readonly config = DEFAULT_PORTRAIT_IMAGE_CONFIG;
  calls: { prompt: string; references: readonly ImageReference[] }[] = [];
  fail: ImageGenerationError | undefined; gate: Promise<void> | undefined; image = PNG; cost: number | undefined = 0.018;
  async generate(request: { prompt: string; references?: readonly ImageReference[] }) {
    this.calls.push({ prompt: request.prompt, references: request.references ?? [] });
    if (this.gate) await this.gate;
    if (this.fail) throw this.fail;
    const bytes = Buffer.from(this.image, "base64");
    return { bytes, media_type: this.image === PNG ? "image/png" as const : "image/jpeg" as const, model: this.config.model, ...(this.cost !== undefined ? { cost_usd: this.cost } : {}), latency_ms: 5 };
  }
}
const LATE = [
  { player: "*carries her to the sofa*", narration: "*The woman lies on the sofa, burning with fever.*", status: "finalized" as const, location_id: LR },
  { player: "name's nicco, i'm the keeper of the heartstone, what about you?", narration: "*Her eyes stay half-open, fixed on his face.*\n\nMira.\n\n*She says it without ceremony.*", status: "finalized" as const, location_id: LR },
];
async function miraSession(generator = new FakeGenerator(), portraitRoot?: string) {
  const id = `portrait_session_${++serial}`;
  const c = createOpeningCampaign(world, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", species: "human", descriptor: "woman", appearance: ["tall and gaunt"], condition: ["feverish"] }, evidence: [], location_id: LR,
    trigger: "purchase_unnamed_subject", promoted_revision: c.revision + 1, world_minute: minute });
  const plain = buildPromotedCharacter({ label: "Sovela", established: { name: "Sovela" }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: c.revision + 1, world_minute: minute });
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: woman }, { kind: "register_character", character: plain }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }] });
  c.apply({ expected_revision: c.revision, commands: [...establishNames(LATE, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision).commands] as CampaignCommand[] });
  const saves = await temp(), root = portraitRoot ?? await temp();
  const repository = new FileCampaignRepository(world, saves);
  await repository.saveCampaign(c);
  const service = new RetrievalService(world), logs: { code: string; status?: number }[] = [];
  const deps: SessionDeps = { world, repository, portrait_generator: generator, portrait_store: new PortraitAssetStore(root), portrait_log: entry => logs.push(entry),
    createCoordinator: () => new TurnCoordinator(world, mockNarrator("*Nothing changes.*"), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok);
  return { session: loaded.session, deps, id, woman: woman.id, plain: plain.id, generator, root, logs, repository };
}
const mira = (s: GameSession) => s.getPlayUiView().household.flatMap(h => h.members).find(m => m.name === "Mira")!;
const files = async (root: string) => { const out: string[] = []; const walk = async (d: string) => { for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) e.isDirectory() ? await walk(join(d, e.name)) : out.push(e.name); }; await walk(root); return out.sort(); };

test("Mira: generate from the committed prompt; file + metadata committed atomically; appearance and identity untouched; save/reload/restart", async () => {
  const { session, generator, root, woman, repository, id, deps } = await miraSession();
  const before = mira(session), revision = session.getView().session.revision;
  assert.deepEqual([before.appearance_editor!.portrait.available, before.portrait_url], [false, null]);
  const snapshotBefore = (await repository.loadCampaign(id)).campaign.exportSnapshot();
  const result = await session.generateNpcPortrait({ ref: before.ref, expected_revision: revision });
  assert.ok(result.ok && result.changed && result.cost_usd === 0.018, JSON.stringify(result));
  assert.equal(generator.calls.length, 1);
  assert.equal(generator.calls[0]!.prompt, before.appearance_editor!.portrait_prompt.prompt, "the provider receives the previewed prompt exactly");
  assert.equal(session.getView().session.revision, revision + 1);
  const after = mira(session), portrait = after.appearance_editor!.portrait;
  assert.deepEqual([after.name, after.ref, portrait.available, portrait.stale, portrait.version_number, portrait.version_count, portrait.model_label], ["Mira", before.ref, true, false, 1, 1, "bytedance-seed/seedream-5-0-flash"]);
  assert.match(portrait.url!, /^\/api\/portrait\/asset\/[0-9a-f]{32}$/); assert.equal(after.portrait_url, portrait.url);
  const token = portrait.url!.split("/").pop()!;
  const served = await session.readPortraitAsset(token);
  assert.deepEqual([served?.media_type, served?.bytes.equals(Buffer.from(PNG, "base64"))], ["image/png", true]);
  assert.equal((await files(root)).filter(f => f.startsWith("portrait_")).length, 1); assert.ok(!(await files(root)).some(f => f.startsWith(".tmp")));
  // Derived media only: appearance, profile, origin, name provenance, Household and NPC+ unchanged.
  await session.save();
  const saved = (await repository.loadCampaign(id)).campaign.exportSnapshot();
  const r0 = snapshotBefore.characters.find(c => c.id === woman)!, r1 = saved.characters.find(c => c.id === woman)!;
  assert.deepEqual(r1, r0);
  assert.deepEqual([saved.households, saved.premium_characters, saved.relationships], [snapshotBefore.households, snapshotBefore.premium_characters, snapshotBefore.relationships]);
  const meta = saved.portraits!.find(p => p.character_id === woman)!;
  assert.equal(meta.versions[0]!.prompt_fingerprint, portraitFingerprint(before.appearance_editor!.portrait_prompt.prompt));
  assert.equal(meta.active_version_id, meta.versions[0]!.version_id); assert.equal(meta.versions[0]!.cost_usd, 0.018);
  // No key, filesystem path or internal ID reaches the view.
  const json = JSON.stringify(session.getPlayUiView());
  assert.ok(!json.includes(root) && !json.includes(meta.versions[0]!.asset_file) && !json.includes("test-key") && !json.includes(woman));
  // Restart: a new session over the same save and portrait store still serves the image.
  const restarted = await GameSession.loadCampaign(deps, id); assert.ok(restarted.ok);
  assert.equal(mira(restarted.session).appearance_editor!.portrait.url, portrait.url);
  assert.ok((await restarted.session.readPortraitAsset(token))?.bytes.equals(Buffer.from(PNG, "base64")));
});

test("stale after an appearance edit; regenerate adds a version, keeps the old one, clears stale; failures change nothing", async () => {
  const { session, generator, root, logs } = await miraSession();
  const ref = mira(session).ref;
  assert.ok((await session.generateNpcPortrait({ ref, expected_revision: session.getView().session.revision })).ok);
  const first = mira(session).appearance_editor!.portrait;
  assert.ok(session.updateNpcAppearance({ ref, expected_revision: session.getView().session.revision, patch: { hair_color: "copper" } }).ok);
  const stale = mira(session).appearance_editor!.portrait;
  assert.deepEqual([stale.stale, stale.url], [true, first.url], "the old portrait stays, marked stale; nothing regenerates automatically");
  assert.equal(generator.calls.length, 1);
  // Failure: provider error → no new version, revision unchanged, old portrait active, no file left behind.
  generator.fail = new ImageGenerationError("insufficient_credits", 402);
  const revision = session.getView().session.revision, filesBefore = await files(root);
  const failed = await session.generateNpcPortrait({ ref, expected_revision: revision });
  assert.ok(!failed.ok); assert.equal(failed.error.code, "portrait_generation_failed"); assert.match(failed.error.message, /insufficient credits/);
  assert.deepEqual(logs.at(-1), { code: "insufficient_credits", status: 402 });
  assert.equal(session.getView().session.revision, revision); assert.deepEqual(await files(root), filesBefore);
  assert.deepEqual(mira(session).appearance_editor!.portrait, stale);
  // Regenerate: the current prompt (with the new hair) produces version 2; version 1's file is still served.
  generator.fail = undefined;
  assert.ok((await session.generateNpcPortrait({ ref, expected_revision: revision })).ok);
  assert.match(generator.calls.at(-1)!.prompt, /Hair: copper\./);
  const second = mira(session).appearance_editor!.portrait;
  assert.deepEqual([second.stale, second.version_number, second.version_count], [false, 2, 2]); assert.notEqual(second.url, first.url);
  assert.ok(await session.readPortraitAsset(first.url!.split("/").pop()));
  assert.equal((await files(root)).filter(f => f.startsWith("portrait_")).length, 2);
});

test("stale revision, unknown/forged/ineligible refs and Nicco never call the provider; concurrency is locked", async () => {
  const { session, generator } = await miraSession();
  const ref = mira(session).ref, revision = session.getView().session.revision;
  assert.ok(session.overridePlayerLocation({ target: "heartstone_square", expected_revision: revision }).ok);
  const stale = await session.generateNpcPortrait({ ref, expected_revision: revision });
  assert.ok(!stale.ok); assert.equal(stale.error.code, "stale_turn");
  const now = session.getView().session.revision;
  for (const bad of ["0".repeat(24), "../../etc/passwd", 7, mira(session).ref.replace(/./, "f")]) {
    const r = await session.generateNpcPortrait({ ref: bad, expected_revision: now }); assert.ok(!r.ok); assert.equal(r.error.code, "invalid_input");
  }
  assert.equal(generator.calls.length, 0, "no provider call for any rejected request");
  // Concurrency: one generation at a time; the character's appearance is locked while it runs; a turn-free revision change rebases.
  let open!: () => void; generator.gate = new Promise<void>(resolve => { open = resolve; });
  const running = session.generateNpcPortrait({ ref, expected_revision: now });
  await new Promise(resolve => setImmediate(resolve));
  const second = await session.generateNpcPortrait({ ref, expected_revision: now });
  assert.ok(!second.ok); assert.equal(second.error.code, "turn_in_progress");
  const edit = session.updateNpcAppearance({ ref, expected_revision: now, patch: { build: "lean" } });
  assert.ok(!edit.ok); assert.equal(edit.error.code, "turn_in_progress");
  assert.ok(session.overridePlayerLocation({ target: LR, expected_revision: now }).ok, "unrelated state may still change");
  open();
  const done = await running;
  assert.ok(done.ok, JSON.stringify(done)); assert.equal(session.getView().session.revision, now + 2);
  assert.equal(generator.calls.length, 1);
});

test("ineligible targets: Nicco and an unmanaged campaign character are rejected before any provider call", async () => {
  const { session, generator, deps, id, plain } = await miraSession();
  const snapshot = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot(), p = playerCharacterProjection(world, snapshot);
  for (const cid of ["nicco", plain]) {
    const r = await session.generateNpcPortrait({ ref: p.project(cid)!.ref, expected_revision: session.getView().session.revision });
    assert.ok(!r.ok, cid); assert.equal(r.error.code, "invalid_input");
  }
  assert.equal(p.project(plain)!.appearance_editor, null); assert.equal(p.project(plain)!.portrait_url, null);
  assert.equal(generator.calls.length, 0);
});

test("reference: one validated local image guides generation consistently; bad uploads rejected; removable; never a URL", async () => {
  const { session, generator } = await miraSession();
  const ref = mira(session).ref, rev = () => session.getView().session.revision;
  for (const image of [{ data_base64: Buffer.from("not an image").toString("base64") }, { data_base64: "https://example.com/x.png" }, { url: "https://example.com/x.png" }, "x", { data_base64: Buffer.alloc(5 * 1024 * 1024, 0x89).toString("base64") }]) {
    const r = await session.setNpcPortraitReference({ ref, expected_revision: rev(), image }); assert.ok(!r.ok, JSON.stringify(image).slice(0, 60)); assert.equal(r.error.code, "invalid_input");
  }
  assert.ok((await session.setNpcPortraitReference({ ref, expected_revision: rev(), image: { data_base64: JPEG } })).ok);
  assert.equal(mira(session).appearance_editor!.portrait.reference_attached, true);
  assert.ok((await session.generateNpcPortrait({ ref, expected_revision: rev() })).ok);
  assert.deepEqual(generator.calls[0]!.references.map(r => [r.media_type, Buffer.from(r.bytes).toString("base64")]), [["image/jpeg", JPEG]]);
  assert.ok((await session.generateNpcPortrait({ ref, expected_revision: rev() })).ok);
  assert.equal(generator.calls[1]!.references.length, 1, "regenerate uses the attached reference too");
  assert.ok((await session.setNpcPortraitReference({ ref, expected_revision: rev(), image: null })).ok);
  assert.equal(mira(session).appearance_editor!.portrait.reference_attached, false);
  assert.ok((await session.generateNpcPortrait({ ref, expected_revision: rev() })).ok);
  assert.equal(generator.calls[2]!.references.length, 0);
});

test("asset access: only current-campaign opaque tokens; traversal and other campaigns' tokens get nothing; old saves have no portrait", async () => {
  const a = await miraSession(), b = await miraSession();
  assert.ok((await a.session.generateNpcPortrait({ ref: mira(a.session).ref, expected_revision: a.session.getView().session.revision })).ok);
  const token = mira(a.session).appearance_editor!.portrait.url!.split("/").pop()!;
  assert.ok(await a.session.readPortraitAsset(token));
  for (const bad of [undefined, "", "../../../etc/passwd", "..%2F..%2Fsecret", token.toUpperCase(), token + "0", "0".repeat(32)]) assert.equal(await a.session.readPortraitAsset(bad), undefined, String(bad));
  assert.equal(await b.session.readPortraitAsset(token), undefined, "another campaign cannot read it");
  assert.deepEqual([mira(b.session).appearance_editor!.portrait.available, mira(b.session).portrait_url], [false, null], "no portrait metadata: absent, nothing invented");
});

test("HTTP: generate route takes ref + revision only (a supplied prompt is ignored), serves the asset, 404s traversal, 409 stale", async () => {
  const { session, generator } = await miraSession();
  const server = createPlaytestServer(session);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const state = await (await fetch(`${url}/api/session`)).json();
    const card = state.play.household.flatMap((h: any) => h.members).find((m: any) => m.name === "Mira");
    const post = (body: unknown) => fetch(`${url}/api/portrait/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const response = await post({ ref: card.ref, expected_revision: state.revision, prompt: "draw a castle", model: "evil/model", character_id: "campaign_character_x" });
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.equal(generator.calls[0]!.prompt, card.appearance_editor.portrait_prompt.prompt, "the browser cannot override the prompt");
    const portraitUrl = next.play.household.flatMap((h: any) => h.members).find((m: any) => m.ref === card.ref).appearance_editor.portrait.url;
    const asset = await fetch(url + portraitUrl);
    assert.equal(asset.status, 200); assert.equal(asset.headers.get("content-type"), "image/png");
    assert.ok(Buffer.from(await asset.arrayBuffer()).equals(Buffer.from(PNG, "base64")));
    for (const bad of ["/api/portrait/asset/../../package.json", "/api/portrait/asset/" + "0".repeat(32), "/api/portrait/asset/zzz"]) assert.equal((await fetch(url + bad)).status === 200, false, bad);
    assert.equal((await post({ ref: card.ref, expected_revision: state.revision })).status, 409);
    assert.doesNotMatch(JSON.stringify(next), /OPENROUTER|test-key|caldrevan-portrait-|\\\\|asset_file|prompt_fingerprint/);
  } finally { server.close(); await session.shutdown({ discard_unsaved: true }); }
});
