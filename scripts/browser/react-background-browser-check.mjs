// Browser validation of the React UI against optional / background work (dev only, offline: zero live provider calls, zero image calls).
// Needs the compiled build (`npm run build`), the React build (`npm run ui:build`) and a Playwright browser; paths come from scripts/lib/browser-env.mjs.
// The REAL turn pipeline, GameSession, SessionHost and HTTP server run behind the React UI with the same scripted Narrator / Controller / extractor /
// image-generator rigs the legacy checks used. Screenshots land in artifacts/local/browser/react-background/ (gitignored).
//
// Legacy check ids -> checks in this file (the legacy vanilla UI checks are block6-browser-check.mjs and block7-browser-check.mjs):
//   block6 1 (normal turn, services ON)           -> A1a A1b            block6 2 (every service OFF, same core outcome)   -> A2a A2b
//   block6 3 (delayed optional task, turn free)   -> A3a A3b A3c        block6 4 (failing optional task)                 -> A4
//   block6 7 (failure never shown as narration)   -> A7a A7b A7c        block6 5 (item usable before its sprite)         -> A5a A5b A5c A5d
//   block6 6 (existing sprite stays visible)      -> A6a A6b
//   block7 1 (legacy save loads / migrates)       -> B1a-B1f           block7 2 (historical Reflection note, producer OFF) -> B2a B2b
//   block7 3 (promoted mannerism unchanged)       -> B3                block7 4 (sprite without revision change)         -> B4a B4b B4c
//   block7 5 (gallery grows, no revision change)  -> B5a B5b B5c       block7 6 (avatar selection: revision once)       -> B6
//   block7 8 (expected_revision valid)            -> B8a B8b           block7 7 (reload reads the side store)           -> B7a B7b
import { DATA, ROOT, fromBuild, launchBrowser, shotsDir } from "../lib/browser-env.mjs";
import { existsSync } from "node:fs";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const REACT_DIR = process.env.REACT_UI_DIR ?? join(ROOT, "dist", "ui-client"); // REACT_UI_DIR: optional override (e.g. a private build of the current sources)
if (!existsSync(join(REACT_DIR, "index.html"))) { console.error("The React UI is not built: run `npm run ui:build` first."); process.exit(1); }
const m = fromBuild;
const { mannerismFixture } = await m("src/dev/support/d10-mannerism-corpus.js");
const { loadWorld } = await m("src/world/loader.js");
const { createOpeningCampaign, OPENING_HOUSEHOLD } = await m("src/campaign/opening-state.js");
const { buildMaterializedCharacter } = await m("src/campaign/materialization.js");
const { buildTurnContext } = await m("src/turn/context/context-builder.js");
const { establishNames } = await m("src/turn/identity/name-establishment.js");
const { GameSession } = await m("src/app/game-session.js");
const { SessionHost } = await m("src/app/session-host.js");
const { FileCampaignRepository } = await m("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await m("src/ui/server.js");
const { TurnCoordinator } = await m("src/turn/coordinator/turn-coordinator.js");
const { RetrievalService } = await m("src/retrieval/retrieval-service.js");
const { HybridSearch } = await m("src/retrieval/hybrid-search.js");
const { PortraitAssetStore } = await m("src/app/portrait-store.js");
const { resolveOptionalServices } = await m("src/app/optional-services.js");
const { toLegacyFile } = await m("tests/support/raw-save.js");

const SHOTS = await shotsDir("react-background");
const results = [];
const ok = (name, cond, detail = "") => { results.push([cond ? "PASS" : "FAIL", name]); console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? ` -- ${detail}` : ""}`); };
const browser = await launchBrowser();
const cleanups = [];
const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const openPages = [];
process.on("uncaughtException", async error => {
  console.log(`CRASH ${error?.message?.split("\n")[0] ?? error}`);
  let index = 0;
  for (const entry of openPages) {
    index++;
    try {
      console.log(`  page ${index}: ${entry.page.url()}`);
      console.log(`  text: ${(await entry.page.locator("body").innerText({ timeout: 3000 })).replace(/\s+/g, " ").slice(0, 600)}`);
      console.log(`  problems: ${JSON.stringify(entry.problems.slice(0, 12))}`);
      await entry.page.screenshot({ path: `${SHOTS}/crash-page-${index}.png`, timeout: 5000 });
    } catch (inner) { console.log(`  (page ${index} unavailable: ${String(inner?.message ?? inner).split("\n")[0]})`); }
  }
  process.exit(1);
});

/** One page with console-error, page-error, http-error and POST-body capture. */
async function openPage(url, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const problems = [], requests = [];
  page.on("console", msg => { if (msg.type() === "error") problems.push(`console: ${msg.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("response", r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${new URL(r.url()).pathname}`); });
  page.on("request", r => { if (r.method() === "POST") requests.push({ path: new URL(r.url()).pathname, body: r.postData() ?? "" }); });
  openPages.push({ page, problems });
  await page.goto(url);
  return { page, problems, requests };
}
const textarea = page => page.getByLabel(/says or does$/);
const idle = page => page.waitForFunction(() => document.querySelector("form[aria-label='Your action'] [role=status]")?.textContent === "Your turn.", null, { timeout: 20000 });
const articles = page => page.locator("[role=log] article").count();
async function say(page, text) {
  const before = await articles(page);
  await textarea(page).fill(text); await textarea(page).press("Enter");
  await page.waitForFunction(n => document.querySelectorAll("[role=log] article").length >= n + 2, before, { timeout: 20000 });
  await idle(page);
}
/** Client navigation by URL (full page load; the server session persists). */
const visit = (page, url) => page.goto(url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ===================================================================== A. block6: optional services never alter the turn
const NARRATION = "Brenna taps two fingers while waiting.";
async function boot(opts = {}) {
  const f = mannerismFixture(), service = new RetrievalService(f.world), dir = await mkdtemp(join(tmpdir(), "rb6-browser-"));
  const probe = { calls: 0, gate: undefined, mode: opts.mode ?? "ok" };
  const extractor = { async extract(r) { probe.calls++; if (probe.gate) await probe.gate; if (probe.mode === "fail") throw Object.assign(new Error("provider down"), { code: "provider_failed" });
    return { text: JSON.stringify({ observations: [], owned_reviewed_ids: r.owned.map(x => x.id) }) }; } };
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: NARRATION }; yield { type: "completed", result: { text: NARRATION, ...metadata } }; } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  const gen = { identity: { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" }, calls: 0, gate: undefined,
    async generate() { gen.calls++; if (gen.gate) await gen.gate; return { bytes: PNG, media_type: "image/png", ...gen.identity, latency_ms: 1 }; } };
  const store = new PortraitAssetStore(dir, { layout: "campaign" });
  const deps = { world: f.world, repository: new FileCampaignRepository(f.world, dir), mannerism_extractor: extractor, portrait_generator: gen, portrait_store: store,
    ...(opts.optional ? { optional_services: resolveOptionalServices(opts.optional, {}) } : {}),
    createCoordinator: hooks => new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) };
  const session = GameSession.fromCampaign(deps, f.campaign);
  const server = createPlaytestServer(session, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const { page, problems } = await openPage(`${base}/app/play`);
  await textarea(page).waitFor({ timeout: 20000 });
  const close = async () => { await page.close(); await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close(); await rm(dir, { recursive: true, force: true }); };
  const health = () => page.evaluate(async () => (await (await fetch("/api/optional-services")).json()).services);
  return { f, session, page, problems, base, close, probe, gen, health, campaign: f.campaign, say: text => say(page, text) };
}
const turns = async (x, n) => { for (let i = 0; i < n; i++) { await x.say("I wait quietly."); await x.session.optionalSettled(); } };
/** The Settings page's "Optional services" list as { service: "On" | "Off" } read from its role/text. */
async function settingsRows(x) {
  await visit(x.page, `${x.base}/app/play/settings`);
  await x.page.getByRole("heading", { name: "Optional services" }).waitFor({ timeout: 10000 });
  await x.page.locator("li[data-service]").first().waitFor({ timeout: 10000 });
  return x.page.locator("li[data-service]").evaluateAll(rows => Object.fromEntries(rows.map(r => [r.getAttribute("data-service"), r.querySelector("strong")?.nextElementSibling?.textContent?.trim() ?? "?"])));
}

// A1 + A2: normal vs all OFF
let items1;
{
  const a = await boot(); await turns(a, 4);
  ok("A1a (block6 1a) normal turns complete with optional ON and the extractor really ran", a.probe.calls >= 1 && (await articles(a.page)) >= 8);
  const h = await a.health();
  ok("A1b (block6 1b) service health is exposed (API) and reports mannerism enabled", h.find(s => s.service === "mannerism_learning")?.enabled === true);
  const rows = await settingsRows(a);
  ok("A1c (block6 1b, UI) the Settings page lists the optional services with mannerism learning On", rows.mannerism_learning === "On", JSON.stringify(rows));
  await a.page.screenshot({ path: `${SHOTS}/A1-settings-on.png` });
  items1 = a.campaign.exportSnapshot().items.length; await a.close();
  const b = await boot({ optional: { reflection: false, mannerism_learning: false, portrait_generation: false, item_sprite_generation: false, sprite_qa: false, semantic_retrieval: false } }); await turns(b, 4);
  ok("A2a (block6 2a) the same turns complete with every service OFF, zero extractor calls", b.probe.calls === 0 && (await articles(b.page)) >= 8);
  const rowsOff = await settingsRows(b);
  ok("A2b (block6 2b) core state matches (items) and every service is reported disabled (API and Settings page)",
    b.campaign.exportSnapshot().items.length === items1 && (await b.health()).every(s => !s.enabled) && Object.values(rowsOff).length > 0 && Object.values(rowsOff).every(v => v === "Off"), JSON.stringify(rowsOff));
  await b.close();
}
// A3: a delayed optional task does not keep the turn busy
{
  const c = await boot(); await turns(c, 3);
  let release; c.probe.gate = new Promise(r => { release = r; });
  await c.say("I wait quietly.");
  const status = (await c.page.locator("form[aria-label='Your action'] [role=status]").innerText()).trim();
  ok("A3a (block6 3a) the turn is complete (Your turn.) while the optional extractor is still pending", status === "Your turn." && c.probe.calls >= 1, status);
  await textarea(c.page).fill("x");
  ok("A3b (block6 3b) the composer and Send are enabled while optional work is pending", (await textarea(c.page).getAttribute("aria-disabled")) !== "true" && await c.page.getByRole("button", { name: "Send" }).isEnabled());
  await textarea(c.page).fill("");
  await c.say("I wait again.");
  ok("A3c (block6 3c) a following turn runs while the optional task is still pending", (await articles(c.page)) >= 10);
  release(); await c.session.optionalSettled(); await c.close();
}
// A4 + A7: failing optional
{
  const d = await boot({ mode: "fail" }); await turns(d, 4);
  ok("A4 (block6 4) a failing optional extractor leaves every turn successful", d.probe.calls >= 1 && (await articles(d.page)) >= 8 && !d.problems.length, d.problems.join(" | "));
  const h = await d.health(), text = await d.page.locator("[role=log]").innerText();
  ok("A7a (block6 7a) the failure is recorded as service health with a code", !!h.find(s => s.service === "mannerism_learning")?.last_error?.code);
  ok("A7b (block6 7b) the failure is not shown in the narration/transcript", !/provider down|provider_failed|optional|mannerism/i.test(text));
  const rows = await settingsRows(d);
  const body = await d.page.locator("li[data-service='mannerism_learning']").innerText();
  ok("A7c (block6 7, UI) the failure appears only as player-safe service health on Settings (diagnostic, not narration)", rows.mannerism_learning !== undefined && /Last problem: provider failed/.test(body) && !/provider down/.test(body), body);
  await d.page.screenshot({ path: `${SHOTS}/A7-settings-failure.png` });
  await d.close();
}
// A5 + A6: item sprite
{
  const e = await boot(); const id = "campaign_item_00000001";
  e.campaign.apply({ expected_revision: e.campaign.revision, commands: [{ kind: "create_item", name: "Ivory figurine", description: "A small carved ivory figurine.", visual_description: "Small cream ivory figurine with a worn rectangular base and simple carved face, no paint.", category: "valuable", owner_id: "brenna", position: { kind: "carried", character_id: "nicco" } }] });
  await e.page.reload(); await textarea(e.page).waitFor({ timeout: 20000 });
  let release; e.gen.gate = new Promise(r => { release = r; });
  const accepted = e.session.requestItemSprite(id);
  for (let i = 0; i < 100 && e.gen.calls < 1; i++) await sleep(20); // the job starts asynchronously
  ok("A5a (block6 5a) the sprite job was accepted and the item exists meanwhile", accepted && e.gen.calls === 1 && e.campaign.exportSnapshot().items.some(i => i.id === id));
  await visit(e.page, `${e.base}/app/play/inventory`);
  await e.page.getByRole("heading", { level: 1, name: "Inventory" }).waitFor({ timeout: 20000 });
  const card = e.page.getByRole("button", { name: "Ivory figurine, carried" });
  await card.waitFor({ timeout: 10000 });
  await card.click();
  const detail = e.page.getByRole("region", { name: "Item details" });
  ok("A5b (block6 5b) the Inventory page is answered and shows the item with its pending illustration while the sprite is pending",
    /Ivory figurine/.test(await detail.innerText()) && /Illustration on its way/.test(await detail.innerText()) && (await card.locator("img[src*='/api/inventory/sprite/']").count()) === 0);
  await e.page.screenshot({ path: `${SHOTS}/A5-sprite-pending.png` });
  await e.page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Play" }).click();
  await textarea(e.page).waitFor({ timeout: 10000 });
  await e.say("I wait quietly.");
  ok("A5c (block6 5c) a turn runs while the sprite is pending", (await articles(e.page)) >= 2);
  release(); await e.session.itemSpritesSettled();
  ok("A5d (block6 5d) the sprite becomes ready afterwards", e.campaign.exportSnapshot().items.find(i => i.id === id)?.sprite?.status === "ready");
  await e.page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Inventory" }).click();
  await e.page.getByRole("button", { name: "Ivory figurine, carried" }).waitFor({ timeout: 10000 });
  const img = e.page.getByRole("button", { name: "Ivory figurine, carried" }).locator("img[src*='/api/inventory/sprite/']");
  await img.first().waitFor({ timeout: 10000 });
  const src = await img.first().getAttribute("src");
  const served = await e.page.evaluate(async u => (await fetch(u)).status, src);
  const loaded = await img.first().evaluate(el => el.complete && el.naturalWidth > 0);
  await e.page.screenshot({ path: `${SHOTS}/A6-sprite-ready.png` });
  ok("A6a (block6 6a) the existing sprite is served as an image (200)", served === 200, `${src} ${served}`);
  ok("A6b (block6 6, UI) the item card shows the sprite as a loaded image and no longer says the illustration is on its way", loaded && (await e.page.getByRole("button", { name: "Ivory figurine, carried" }).locator("[title='Illustration on its way']").count()) === 0);
  await e.close();
}

// ===================================================================== B. block7: legacy save, side stores, background media
const world = await loadWorld(DATA);
const LR = "heartstone_lr", NOTE = "Mira keeps a steady, wary regard for Nicco.", MANNERISM = "Tilts their head slightly while listening.";
const LATE = [
  { player: "*carries her to the sofa*", narration: "*The woman lies on the sofa, burning with fever.*", status: "finalized", location_id: LR },
  { player: "name's nicco, i'm the keeper of the heartstone, what about you?", narration: "*Her eyes stay half-open, fixed on his face.*\n\nMira.\n\n*She says it without ceremony.*", status: "finalized", location_id: LR }];
const root = await mkdtemp(join(tmpdir(), "rb7-browser-")), id = "b7_browser";
cleanups.push(() => rm(root, { recursive: true, force: true }));
{
  const campaign = createOpeningCampaign(world, id);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = campaign.exportSnapshot().runtime.scene.world_time.world_minute;
  const woman = buildMaterializedCharacter({ label: "the woman", established: { sex: "female", species: "human", descriptor: "woman", appearance: ["tall and gaunt"], condition: ["feverish"] }, evidence: [], location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: campaign.revision + 1, world_minute: minute });
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "register_character", character: woman }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }] });
  campaign.apply({ expected_revision: campaign.revision, commands: establishNames(LATE, buildTurnContext(world, campaign.exportSnapshot()), world, campaign.exportSnapshot(), [], campaign.revision).commands });
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "create_item", name: "Ivory figurine", description: "A small carved ivory figurine.", visual_description: "Small cream ivory figurine with a worn rectangular base and simple carved face, no paint.", category: "valuable", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } }] });
  campaign.addMannerism({ expected_revision: campaign.revision, character_id: woman.id, definition: { canonical_key: "head_tilt_while_listening", text: MANNERISM } });
  const rev = campaign.revision;
  campaign.apply({ expected_revision: rev, commands: [{ kind: "record_reflection", character_id: woman.id, reflected_revision: rev, notes: [{ id: `r${rev}_stance_1`, kind: "stance", label: "stance_1", text: NOTE, evidence_refs: [`npcmem:${woman.id}:history:r3.0`], confidence: "medium", created_revision: rev, updated_revision: rev }] }] });
  await new FileCampaignRepository(world, root).saveCampaign(campaign);
  await toLegacyFile(join(root, id, "save.json"), world);
}
let requests = [];
async function open() {
  const service = new RetrievalService(world), gen = { identity: { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" }, calls: 0, gate: undefined,
    async generate() { gen.calls++; if (gen.gate) await gen.gate; return { bytes: Buffer.concat([PNG, Buffer.from([gen.calls])]), media_type: "image/png", ...gen.identity, latency_ms: 1 }; } };
  const narrator = { async generate() { throw new Error("unused"); }, async *stream(request) { requests.push(JSON.stringify(request)); yield { type: "text_delta", text: "*Nothing changes.*" }; yield { type: "completed", result: { text: "*Nothing changes.*", ...metadata } }; } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  const deps = { world, repository: new FileCampaignRepository(world, root), portrait_generator: gen, portrait_store: new PortraitAssetStore(root, { layout: "campaign" }), portrait_retry_delay_ms: () => 0,
    createCoordinator: hooks => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) };
  const host = new SessionHost(deps);
  const loaded = await host.loadCampaign({ campaign_id: id }); if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
  const session = host.active;
  const server = createPlaytestServer(host, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const { page, problems, requests: posts } = await openPage(`${base}/app/play/${id}`);
  await textarea(page).waitFor({ timeout: 30000 });
  const close = async () => { await page.close(); const closed = await host.closeCampaign(); if (!closed.ok) throw new Error(JSON.stringify(closed.error)); server.closeAllConnections(); server.close(); };
  const mira = () => session.getPlayUiView().household.flatMap(h => h.members).find(x => x.name === "Mira");
  return { session, host, page, problems, posts, close, gen, mira, base, loaded, rev: () => session.getView().session.revision, say: text => say(page, text) };
}
const key = () => `k${Math.random().toString(16).slice(2)}${Date.now()}`;

// B1 legacy load + migration on save + UI unchanged
let galleryAfter = 0, revisionAfterAll = 0;
{
  const a = await open(); const legacy = JSON.parse(await readFile(join(root, id, "save.json"), "utf8"));
  ok("B1a (block7 1a) the fixture really is a pre-block-7 save (schema 7, inline optional state, no store directory)", legacy.schema_version === 7 && legacy.snapshot.premium_reflections.length === 1 && !(await readdir(join(root, id))).includes("optional"));
  ok("B1b (block7 1b) it loads from the snapshot (legacy authority) and the React app opens it", !!a.session.getView().session.save && new URL(a.page.url()).pathname === `/app/play/${id}`);
  const before = await a.page.locator("[role=log]").innerText();
  const revision = a.rev();
  ok("B1c (block7 1c) loading does not mark the campaign unsaved (server state and Save indicator)", a.session.getView().session.save.state === "saved" && (await a.page.getByRole("banner").innerText()).length > 0 && !/Unsaved changes/.test(await a.page.getByRole("banner").innerText()));
  await a.page.screenshot({ path: `${SHOTS}/B1-legacy-loaded.png` });
  ok("B1d (block7 1d) the save succeeds and migrates", (await a.session.save()).ok);
  const migrated = JSON.parse(await readFile(join(root, id, "save.json"), "utf8"));
  ok("B1e (block7 1e) schema 8, markers present, optional fields left the snapshot, revision unchanged", migrated.schema_version === 8 && migrated.optional_state?.learning?.completed && migrated.optional_state?.media?.completed && !("premium_reflections" in migrated.snapshot) && migrated.snapshot.revision === revision);
  await a.page.reload(); await textarea(a.page).waitFor({ timeout: 30000 });
  await a.page.getByRole("complementary", { name: "People" }).getByText("Mira").first().waitFor({ timeout: 10000 });
  const miraRow = await a.page.getByRole("complementary", { name: "People" }).innerText();
  ok("B1f (block7 1f) the UI is unchanged after migration (transcript identical, Mira still listed)", (await a.page.locator("[role=log]").innerText()) === before && /Mira/.test(miraRow) && !a.problems.length, a.problems.join(" | "));
  await a.close();
}
// B2 + B3 narrator sees the historical note (producer OFF by default) and the promoted mannerism
{
  const b = await open(); requests = [];
  ok("B2a (block7 2a) Reflection is OFF in this session (default; Settings page agrees)", b.session.getOptionalServices().find(s => s.service === "reflection")?.enabled === false);
  await b.say("Mira, how are you feeling?");
  ok("B2b (block7 2b) the historical Reflection note (learning store) is in the Narrator request", requests.some(r => r.includes(NOTE)));
  ok("B3 (block7 3) the promoted mannerism is in the Narrator request", requests.some(r => r.includes(MANNERISM)));
  const turn = b.posts.filter(r => r.path === "/api/turn").map(r => JSON.parse(r.body))[0];
  ok("B3b (block7 3, UI) neither the Reflection note nor the mannerism text is shown in the transcript", !(await b.page.locator("[role=log]").innerText()).includes(NOTE) && !(await b.page.locator("[role=log]").innerText()).includes(MANNERISM) && !!turn);
  await b.close();
}
// B4 sprite after background generation, no revision change
{
  const c = await open(), item = "campaign_item_00000001";
  const before = c.rev(); let release; c.gen.gate = new Promise(r => { release = r; });
  const accepted = c.session.requestItemSprite(item);
  ok("B4a (block7 4a) the sprite job is accepted and the item is usable while it is pending", accepted);
  await c.say("I wait quietly."); const turnRevision = c.rev();
  await c.page.getByRole("complementary", { name: "Overview" }).getByRole("link", { name: "Inventory" }).click();
  const card = c.page.getByRole("button", { name: "Ivory figurine, carried" });
  await card.waitFor({ timeout: 20000 });
  ok("B4a2 (block7 4a, UI) while pending the Inventory shows the item without a sprite image", (await card.locator("img[src*='/api/inventory/sprite/']").count()) === 0);
  release(); await c.session.itemSpritesSettled();
  // No reload, no click: the Inventory page itself discovers the finished sprite (it polls the session read model while a sprite is pending).
  const img = card.locator("img[src*='/api/inventory/sprite/']");
  let appeared = true; await img.first().waitFor({ timeout: 15000 }).catch(() => { appeared = false; });
  const src = appeared ? await img.first().getAttribute("src") : "";
  ok("B4b (block7 4b) the sprite appears in the open Inventory after background generation (no reload) and is served as an image", appeared && (await c.page.evaluate(async u => (await fetch(u)).status, src)) === 200, src);
  await c.page.screenshot({ path: `${SHOTS}/B4-sprite-appeared.png` });
  ok("B4c (block7 4c) the sprite completion did not change the revision", c.rev() === turnRevision && turnRevision >= before);
  await c.session.save(); await c.close();
}
// B5-B8 gallery growth, selection, reload, expected_revision
{
  const e = await open(); const g = () => e.mira().appearance_editor.portrait.gallery.length;
  const startGallery = g();
  const miraRef = e.mira().ref;
  // The first batch runs through the React UI (NPC editor page) exactly as a player would.
  await visit(e.page, `${e.base}/app/play/${id}/household`);
  await e.page.getByRole("link", { name: "Edit Mira" }).click();
  await e.page.getByRole("heading", { level: 1, name: "Mira" }).waitFor({ timeout: 20000 });
  await e.page.getByRole("button", { name: "Generate 3 avatars" }).click();
  const thumbs = e.page.getByRole("region", { name: "Gallery" }).getByRole("button", { name: /^View portrait/ });
  await e.page.waitForFunction(n => document.querySelectorAll("section[aria-labelledby='gallery-heading'] button[aria-label^='View portrait']").length >= n, startGallery + 3, { timeout: 20000 });
  const firstGrowth = g() - startGallery;
  ok("B5a (block7 5a) a gallery batch completes through the React editor", firstGrowth === 3 && e.posts.some(r => r.path === "/api/portrait/generate" || r.path.startsWith("/api/portrait")), `grew ${firstGrowth}`);
  ok("B5b (block7 5b) the gallery grew (UI thumbnails match the server)", (await thumbs.count()) === g() && g() > startGallery);
  const r0 = e.rev(), grown = g();
  const out2 = await e.session.generateNpcPortraitBatch({ ref: miraRef, expected_revision: e.rev(), kind: "avatar" });
  await sleep(1300); // the session read model is fresh for 1s (staleTime); a focus refetch only applies to stale data
  // The batch ran outside the page; returning to the tab refreshes the session read model (refetchOnWindowFocus), which is how React finds it.
  await e.page.evaluate(async () => {
    const set = state => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state }); window.dispatchEvent(new Event("visibilitychange")); };
    set("hidden"); await new Promise(r => setTimeout(r, 50)); set("visible"); // the focus manager only refetches on a hidden -> visible change
  });
  let uiGrew = true; await e.page.waitForFunction(n => document.querySelectorAll("section[aria-labelledby='gallery-heading'] button[aria-label^='View portrait']").length > n, grown, { timeout: 10000 }).catch(() => { uiGrew = false; });
  ok("B5c (block7 5c) a second batch grows the gallery again WITHOUT a revision change", out2.ok && g() > grown && e.rev() === r0, `${g()} vs ${grown}, rev ${e.rev()} vs ${r0}`);
  ok("B5c2 (block7 5c, UI) the open editor shows the larger gallery after the tab refreshes, without a reload", uiGrew && (await thumbs.count()) === g(), `ui=${await thumbs.count()} server=${g()}`);
  if (!uiGrew) { await e.page.reload(); await e.page.getByRole("heading", { level: 1, name: "Mira" }).waitFor({ timeout: 20000 }); }
  await e.page.screenshot({ path: `${SHOTS}/B5-gallery.png` });
  // 6: select a non-avatar image as Avatar through the UI chip: the revision changes exactly once.
  const gal = e.mira().appearance_editor.portrait.gallery, otherIndex = gal.findIndex(x => !x.is_avatar);
  const posts0 = e.posts.length, rBefore = e.rev();
  if (otherIndex >= 0) {
    await e.page.getByRole("button", { name: `Set portrait ${otherIndex + 1} as Avatar`, exact: true }).click();
    await e.page.getByRole("button", { name: "Avatar (current)" }).waitFor({ timeout: 10000 });
    const avatarPosts = e.posts.slice(posts0).filter(r => r.path === "/api/portrait/avatar");
    const body = avatarPosts[0] ? JSON.parse(avatarPosts[0].body) : {};
    ok("B6 (block7 6) selecting an avatar changes the revision exactly once, via one request carrying expected_revision", avatarPosts.length === 1 && e.rev() === rBefore + 1 && body.expected_revision === rBefore, `${e.rev()} vs ${rBefore}`);
  } else ok("B6 (block7 6) selecting an avatar changes the revision exactly once", false, "no non-avatar image");
  await e.session.save(); galleryAfter = g(); revisionAfterAll = e.rev();
  // 8: expected_revision. The rendered revision is what the UI sends; it stays valid through a turn and its background optional work.
  await e.page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Play" }).click();
  await textarea(e.page).waitFor({ timeout: 10000 });
  const t0 = e.posts.length;
  await e.say("I wait."); await e.session.optionalSettled();
  const serverRevision = e.rev();
  await e.say("I wait again.");
  const turnPosts = e.posts.slice(t0).filter(r => r.path === "/api/turn").map(r => JSON.parse(r.body));
  ok("B8a (block7 8) both turns sent expected_revision (the rendered one) and were accepted, with no error shown", turnPosts.length === 2 && turnPosts.every(t => typeof t.expected_revision === "number") && !e.problems.length, e.problems.join(" | "));
  ok("B8b (block7 8) the second turn carried the server's revision after the first turn and its background optional work settled (not stale)", turnPosts[1]?.expected_revision === serverRevision && turnPosts[0].expected_revision <= serverRevision, `${JSON.stringify(turnPosts.map(t => t.expected_revision))} server=${serverRevision}`);
  await e.session.save(); revisionAfterAll = e.rev(); await e.close();
}
// B7 reload reads the side store
{
  const f = await open(); const file = JSON.parse(await readFile(join(root, id, "save.json"), "utf8"));
  const store = JSON.parse(await readFile(join(root, id, "optional", "media.json"), "utf8"));
  ok("B7a (block7 7a) the loaded campaign came from the side stores", file.schema_version === 8 && store.data.portraits[0].versions.length === galleryAfter);
  await visit(f.page, `${f.base}/app/play/${id}/household`);
  await f.page.getByRole("link", { name: "Edit Mira" }).click();
  await f.page.getByRole("heading", { level: 1, name: "Mira" }).waitFor({ timeout: 20000 });
  await f.page.locator("section[aria-labelledby='gallery-heading'] button[aria-label^='View portrait']").first().waitFor({ timeout: 10000 });
  const uiCount = await f.page.locator("section[aria-labelledby='gallery-heading'] button[aria-label^='View portrait']").count();
  ok("B7b (block7 7b) the gallery and revision survive the reload (server and UI)", f.mira().appearance_editor.portrait.gallery.length === galleryAfter && uiCount === galleryAfter && f.rev() === revisionAfterAll, `ui=${uiCount} after=${galleryAfter} rev=${f.rev()} vs ${revisionAfterAll}`);
  await f.page.screenshot({ path: `${SHOTS}/B7-reloaded-gallery.png` });
  await f.close();
}

await browser.close();
for (const cleanup of cleanups.reverse()) await cleanup();
const fails = results.filter(r => r[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
