// Browser validation for the React UI-2 pages (Inventory, player character page, Gallery, Lightbox, Modal), dev only and offline: zero live provider
// calls and zero live image calls. The portrait pipeline runs for real behind the UI, but its image generator is a local scripted fake that returns a
// tiny PNG and counts its calls; the narrator and controller are never invoked (no turn is played here).
// Needs the compiled build (`npm run build`), the React build (`npm run ui:build`) and a Playwright browser; paths come from scripts/lib/browser-env.mjs.
// Screenshots land in artifacts/local/browser/react-ui2/ (gitignored).
import { DATA, ROOT, fromBuild, launchBrowser, shotsDir } from "../lib/browser-env.mjs";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const REACT_DIR = join(ROOT, "dist", "ui-client");
if (!existsSync(join(REACT_DIR, "index.html"))) { console.error("The React UI is not built: run `npm run ui:build` first."); process.exit(1); }
const { loadWorld } = await fromBuild("src/world/loader.js");
const { createOpeningCampaign } = await fromBuild("src/campaign/opening-state.js");
const { GameSession } = await fromBuild("src/app/game-session.js");
const { SessionHost } = await fromBuild("src/app/session-host.js");
const { PortraitAssetStore } = await fromBuild("src/app/portrait-store.js");
const { FileCampaignRepository } = await fromBuild("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await fromBuild("src/ui/server.js");
const { TurnCoordinator } = await fromBuild("src/turn/coordinator/turn-coordinator.js");
const { RetrievalService } = await fromBuild("src/retrieval/retrieval-service.js");
const { HybridSearch } = await fromBuild("src/retrieval/hybrid-search.js");

const SHOTS = await shotsDir("react-ui2");
const results = [];
const ok = (name, cond, detail = "") => { results.push([cond ? "PASS" : "FAIL", name]); console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? ` -- ${detail}` : ""}`); };
const browser = await launchBrowser();
const cleanups = [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };

const openPages = [];
// A timeout or crash must leave evidence, not just a stack: for every open page print its URL, visible text, captured problems and requests,
// and save a screenshot (uploaded by CI on failure). The check still fails; nothing is retried or relaxed.
process.on("uncaughtException", async error => {
  console.log(`CRASH ${error?.message?.split("\n")[0] ?? error}`);
  let index = 0;
  for (const entry of openPages) {
    index++;
    try {
      console.log(`  page ${index}: ${entry.page.url()}`);
      console.log(`  text: ${(await entry.page.locator("body").innerText({ timeout: 3000 })).replace(/\s+/g, " ").slice(0, 600)}`);
      console.log(`  problems: ${JSON.stringify(entry.problems.slice(0, 12))}`);
      console.log(`  last posts: ${JSON.stringify(entry.requests.slice(-4).map(r => r.path))}`);
      await entry.page.screenshot({ path: `${SHOTS}/crash-page-${index}.png`, timeout: 5000 });
    } catch (inner) { console.log(`  (page ${index} unavailable: ${String(inner?.message ?? inner).split("\n")[0]})`); }
  }
  process.exit(1);
});

/** One page with console-error, page-error and request capture; `foreign` collects any request that leaves this server's origin. */
async function openPage(url, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const origin = new URL(url).origin, problems = [], requests = [], foreign = [];
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("response", r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${new URL(r.url()).pathname}`); });
  page.on("request", r => { if (new URL(r.url()).origin !== origin) foreign.push(r.url()); if (r.method() === "POST") requests.push({ path: new URL(r.url()).pathname, body: r.postData() ?? "" }); });
  openPages.push({ page, problems, requests });
  await page.goto(url);
  return { page, problems, requests, foreign };
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
const active = page => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "");

// ===================================================================== D. a persistent campaign: Inventory -> character page -> Gallery -> Lightbox
{
  const world = await loadWorld(DATA);
  const id = "react_ui2";
  const c = createOpeningCampaign(world, id);
  const item = (name, description, category, extra = {}) => ({ kind: "create_item", name, description, visual_description: `${name}, plainly made`, category, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" }, ...extra });
  c.apply({ expected_revision: c.revision, commands: [
    item("Iron sword", "A plain, well-kept sword.", "weapon"), item("Heartstone deed", "The deed to the Heartstone.", "document"), item("Waterskin", "Leather, half full.", "consumable"),
    item("Borrowed ledger", "Korvin's accounts, lent for the day.", "document", { owner_id: "korvin" })] });
  const sword = c.exportSnapshot().items.find(i => i.name === "Iron sword");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "place_item", item_id: sword.id, position: { kind: "equipped", character_id: "nicco", slot: "main_hand", mode: "held" } }] });
  const dir = await mkdtemp(join(tmpdir(), "react-ui2-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
  const service = new RetrievalService(world);
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() { throw new Error("no turn is played in this check"); } };
  const controller = { async propose() { throw new Error("no turn is played in this check"); } };
  const gen = { identity: { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" }, calls: 0, delay: 0,
    async generate() { gen.calls++; if (gen.delay) await new Promise(resolve => setTimeout(resolve, gen.delay)); return { bytes: Buffer.concat([PNG, Buffer.from([gen.calls])]), media_type: "image/png", ...gen.identity, latency_ms: 1 }; } };
  const deps = { world, repository, portrait_generator: gen, portrait_store: new PortraitAssetStore(dir, { layout: "campaign" }), portrait_retry_delay_ms: () => 0,
    createCoordinator: () => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const host = new SessionHost(deps);
  const loaded = await host.loadCampaign({ campaign_id: id });
  if (!loaded.ok) throw new Error(`campaign did not load: ${JSON.stringify(loaded.error)}`);
  const session = host.active;
  const server = createPlaytestServer(host, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const gallery = () => session.getPlayerProfileView().visual.editor.portrait;
  const { page, problems, requests, foreign } = await openPage(`${base}/app/play/${id}`);
  await page.getByLabel(/says or does$/).waitFor({ timeout: 30000 });

  // D1-D4 Inventory
  await page.getByLabel(/says or does$/).fill("a half-written thought");
  await page.getByRole("complementary", { name: "Overview" }).getByRole("link", { name: "Inventory" }).click();
  await page.getByRole("heading", { level: 1, name: "Inventory" }).waitFor({ timeout: 30000 });
  const cards = () => page.locator("ul[aria-describedby] button strong").allInnerTexts();
  ok("D1 Inventory opens from the play screen at /app/play/<campaign>/inventory and renders the authoritative items", new URL(page.url()).pathname === `/app/play/${id}/inventory` && (await cards()).includes("Iron sword") && (await cards()).includes("Waterskin"), JSON.stringify(await cards()));
  ok("D2 gold, counts, equipped state and player-safe ownership come from the read model", (await page.getByTestId("inventory-gold").innerText()) === "500"
    && (await page.getByRole("button", { name: "Iron sword, equipped" }).count()) === 1 && (await page.getByRole("button", { name: "Borrowed ledger, carried, belongs to someone else" }).count()) === 1 && /equipped/.test(await page.getByText(/ items? · /).innerText()));
  await page.screenshot({ path: `${SHOTS}/D1-inventory-1440.png` });
  const group = page.getByRole("group", { name: "Show items" });
  await group.getByRole("button", { name: "Equipped" }).click();
  const onlyEquipped = await cards();
  await group.getByRole("button", { name: "Carried" }).focus(); await page.keyboard.press("Enter");
  const carriedNames = await cards();
  await group.getByRole("button", { name: "All" }).focus(); await page.keyboard.press("Space");
  ok("D3 the All / Carried / Equipped filters work by mouse and keyboard", onlyEquipped.length === 1 && onlyEquipped[0] === "Iron sword" && !carriedNames.includes("Iron sword") && carriedNames.includes("Waterskin") && (await cards()).length >= 4);
  await page.getByRole("button", { name: "Waterskin, carried" }).click();
  ok("D4 selecting an item shows its detail; the equipment panel lists the slots read-only", /Leather, half full\./.test(await page.getByRole("region", { name: "Item details" }).innerText())
    && /Iron sword/.test(await page.getByRole("region", { name: "Equipment" }).innerText()) && (await page.getByRole("region", { name: "Equipment" }).getByRole("button", { name: /equip|drop|use/i }).count()) === 0);

  // D5 character page, draft kept across pages
  await page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Nicco" }).click();
  await page.getByRole("heading", { level: 1, name: "Nicco" }).waitFor({ timeout: 10000 });
  ok("D5 the player character page shows the authoritative player (gold, location, narrator summary) and the Inventory is one click away",
    (await page.getByTestId("character-gold").innerText()) === "500" && (await page.getByRole("region", { name: "Details" }).innerText()).length > 20 && (await page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Inventory" }).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/D2-character-1440.png` });

  // D6 appearance form
  const build = page.getByLabel("Build");
  const saveBtn = page.getByRole("button", { name: "Save changes" });
  const savedBefore = await saveBtn.isDisabled();
  await build.fill("lean and wiry");
  // scoped to the form: the header's save indicator also says "Unsaved changes" once the campaign has unsaved work
  const formDirty = page.getByRole("form", { name: "Profile and appearance" }).getByText("Unsaved changes");
  const unsaved = await formDirty.isVisible();
  const posts0 = requests.length;
  await saveBtn.click();
  await formDirty.waitFor({ state: "detached", timeout: 10000 });
  const profilePost = requests.slice(posts0).find(r => r.path === "/api/player-character");
  const savedBuild = session.getPlayerProfileView().fields.find(f => f.key === "build")?.value;
  ok("D6 the appearance form: Save is disabled until a change, the change is flagged, Save sends only the changed field, the server's value comes back",
    savedBefore && unsaved && !!profilePost && JSON.stringify(Object.keys(JSON.parse(profilePost.body)).sort()) === '["expected_revision","patch"]' && JSON.stringify(JSON.parse(profilePost.body).patch) === '{"build":"lean and wiry"}'
    && savedBuild === "lean and wiry" && (await build.inputValue()) === "lean and wiry");

  // D7 generation with the scripted fake: busy state, then the Gallery refreshes from the server
  ok("D7a the Gallery starts empty and says how to begin", /No portraits yet/.test(await page.getByRole("region", { name: "Gallery" }).innerText()) && gallery().gallery.length === 0);
  const blocked = gallery().generation_blocked;
  gen.delay = 700;
  await page.getByRole("button", { name: "Generate 3 avatars" }).click();
  await page.getByText("Generating 3 avatar images").waitFor({ timeout: 5000 });
  const busyDisabled = await page.getByRole("button", { name: "Generate 3 full-body images" }).isDisabled() && await page.getByRole("button", { name: "Save changes" }).isDisabled();
  await page.screenshot({ path: `${SHOTS}/D3-generating.png` });
  await page.getByText("Generating 3 avatar images").waitFor({ state: "detached", timeout: 20000 });
  gen.delay = 0;
  const thumbs = page.getByRole("region", { name: "Gallery" }).getByRole("button", { name: /^View portrait/ });
  ok("D7 generation (scripted fake, no network) shows a busy state, locks the other controls, then lists 3 images from the server", !blocked && busyDisabled && (await thumbs.count()) === 3 && gen.calls === 3 && gallery().gallery.length === 3, `${blocked} calls=${gen.calls}`);
  await page.screenshot({ path: `${SHOTS}/D4-gallery-1440.png` });

  // D8 lightbox: open, keyboard next/previous, Escape, focus return, focus trap, inert background
  const first = thumbs.first();
  const firstLabel = await first.getAttribute("aria-label");
  await first.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /^Portrait 1 of 3$/ });
  await dialog.waitFor({ timeout: 5000 });
  const inertWhileOpen = await page.evaluate(() => document.getElementById("root")?.inert === true && document.documentElement.dataset.scrollLocked === "true");
  await page.screenshot({ path: `${SHOTS}/D5-lightbox-1440.png` });
  await page.keyboard.press("ArrowRight");
  const second = await page.getByRole("dialog", { name: /^Portrait 2 of 3$/ }).isVisible();
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft");
  const wrapped = await page.getByRole("dialog", { name: /^Portrait 3 of 3$/ }).isVisible();
  await page.getByRole("button", { name: "Next portrait" }).click();
  const back = await page.getByRole("dialog", { name: /^Portrait 1 of 3$/ }).isVisible();
  let trapped = true;
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); trapped = trapped && await page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement) === true); }
  const sameImage = await page.getByRole("dialog").locator("img").getAttribute("alt");
  ok("D8 the lightbox opens from the keyboard, steps with arrows and buttons (wrapping), traps Tab, blocks the page behind (inert + no scroll)", second && wrapped && back && trapped && inertWhileOpen && sameImage === "Portrait 1 of 3");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  ok("D9 Escape closes the lightbox, the page is usable again and focus returns to the thumbnail that opened it", (await active(page)) === firstLabel && await page.evaluate(() => document.getElementById("root")?.inert !== true && !document.documentElement.dataset.scrollLocked), `${await active(page)} vs ${firstLabel}`);

  // D10 Avatar / Full Body selection through the server
  const posts1 = requests.length;
  const plain = () => page.getByRole("region", { name: "Gallery" }).getByRole("button", { name: /^View portrait \d+ of \d+, [^(]*$/ }).first();
  await plain().click();
  await page.getByRole("button", { name: "Set as Avatar" }).click();
  await page.getByRole("button", { name: "Avatar ✓" }).waitFor({ timeout: 10000 });
  const avatarPost = requests.slice(posts1).find(r => r.path === "/api/portrait/avatar");
  const avatarBody = avatarPost ? JSON.parse(avatarPost.body) : {};
  await page.keyboard.press("Escape");
  await page.getByText("Current Avatar", { exact: true }).waitFor({ timeout: 5000 });
  ok("D10 choosing the Avatar sends only {ref, expected_revision, item}; the role and the avatar figure come back from the server",
    JSON.stringify(Object.keys(avatarBody).sort()) === '["expected_revision","item","ref"]' && gallery().gallery.filter(i => i.is_avatar).length === 1 && !!gallery().avatar
    && !/\/|\\|\.png|\.jpg/.test(String(avatarBody.item)), JSON.stringify(avatarBody));
  // full body: generate one batch, assign through the thumbnail chip, then clear
  await page.getByRole("button", { name: "Generate 3 full-body images" }).click();
  await page.waitForFunction(() => document.querySelectorAll("section[aria-labelledby='gallery-heading'] button[aria-label^='View portrait']").length === 6, null, { timeout: 20000 });
  const chip = page.getByRole("button", { name: /^Set portrait \d as Full Body$/ }).first();
  await chip.click();
  await page.getByText("Current Full Body", { exact: true }).waitFor({ timeout: 10000 });
  ok("D11 Full Body is chosen from a thumbnail chip and shown only after the server's state arrives; the Avatar is never substituted for it", gallery().full_body !== null && gallery().gallery.filter(i => i.is_full_body).length === 1 && gen.calls === 6, `calls=${gen.calls}`);
  await page.getByRole("button", { name: "Clear Full Body" }).click();
  await page.getByText("No full-body image selected.", { exact: true }).waitFor({ timeout: 10000 });
  ok("D12 Clear Full Body empties the role on the server and the figure shows its empty state", gallery().full_body === null);

  // D13 delete: refusal for a role holder (server's sentence), success for an unassigned image
  await page.getByRole("button", { name: /^View portrait \d+ of 6.*\(Avatar\)/ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete image" }).click();
  const refusal = await page.getByRole("dialog").getByRole("alert").filter({ hasText: /Avatar/ }).first().innerText().catch(() => "");
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
  const before = gallery().gallery.length;
  await plain().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10000 });
  ok("D13 deleting asks first; the engine refuses a role holder with its own sentence; an unassigned image is deleted and the Gallery follows the server", /Avatar/.test(refusal) && gallery().gallery.length === before - 1 && (await thumbs.count()) === before - 1, `${refusal} ${before} ${gallery().gallery.length}`);

  // D14 deep link and reload, draft survived the page changes
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "Nicco" }).waitFor({ timeout: 10000 });
  const reloadedBuild = await page.getByLabel("Build").inputValue();
  await page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Play" }).click();
  await page.getByLabel(/says or does$/).waitFor({ timeout: 10000 });
  ok("D14 a reload on the deep link restores the page from the server; Play is reachable from it", reloadedBuild === "lean and wiry" && new URL(page.url()).pathname === `/app/play/${id}`);
  await page.getByLabel(/says or does$/).fill("kept across pages");
  await page.getByRole("complementary", { name: "Overview" }).getByRole("link", { name: "Character" }).click();
  await page.getByRole("heading", { level: 1, name: "Nicco" }).waitFor({ timeout: 10000 });
  await page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Play" }).click();
  ok("D15 the composer draft survives a visit to the character page", (await page.getByLabel(/says or does$/).inputValue()) === "kept across pages");
  // the player row in the scene list also leads to the character page
  await page.getByRole("complementary", { name: "People" }).getByRole("link", { name: /Nicco/ }).click();
  ok("D16 selecting the player in the scene list opens the character page", /character\/player$/.test(new URL(page.url()).pathname));

  // D17 responsive: no horizontal overflow on either page, the Gallery or the lightbox at 1440 / 1024 / 390
  const layout = {};
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 860 });
    await page.goto(`${base}/app/play/${id}/inventory`); await page.getByRole("heading", { level: 1, name: "Inventory" }).waitFor();
    const inventory = await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}/E1-inventory-${width}.png` });
    await page.goto(`${base}/app/play/${id}/character/player`); await page.getByRole("heading", { level: 1, name: "Nicco" }).waitFor();
    const character = await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}/E2-character-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: /^View portrait 1 of/ }).click();
    const box = await page.getByRole("dialog").boundingBox();
    const lightbox = !!box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= 860 + 1 && await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}/E3-lightbox-${width}.png` });
    await page.keyboard.press("Escape");
    layout[width] = { inventory, character, lightbox };
  }
  ok("D17 no horizontal overflow on Inventory, the character page and the lightbox at 1440, 1024 and 390 px; the lightbox fits the viewport",
    Object.values(layout).every(l => l.inventory && l.character && l.lightbox), JSON.stringify(layout));
  // the one deliberate engine refusal (deleting the Avatar holder, D13) is the only 4xx/console line allowed
  const unexpected = problems.filter(p => !/422/.test(p) && !/Unprocessable/.test(p));
  ok("D18 no console errors, uncaught errors, unexpected failed requests or requests to any other host (the one refused delete of D13 excepted)", unexpected.length === 0 && problems.filter(p => /^http 422/.test(p)).length === 1 && foreign.length === 0, `${problems.join(" | ")} ${foreign.join(" ")}`);
  ok("D19 the scripted image generator was the only image source: exactly 6 local calls for two batches", gen.calls === 6);
  await page.close();
  await host.close?.();
  await session.shutdown({ discard_unsaved: true });
}

// ===================================================================== E. the disposable playtest session serves the same pages under /app/play/...
{
  const world = await loadWorld(DATA);
  const c = createOpeningCampaign(world, "react_ui2_playtest");
  const dir = await mkdtemp(join(tmpdir(), "react-ui2-pt-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
  const service = new RetrievalService(world);
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() { throw new Error("unused"); } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  const deps = { world, repository, createCoordinator: () => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const session = GameSession.fromCampaign(deps, c);
  const server = createPlaytestServer(session, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const { page, problems } = await openPage(`${base}/app/play/inventory`);
  await page.getByRole("heading", { level: 1, name: "Inventory" }).waitFor({ timeout: 30000 });
  const links = await page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link").evaluateAll(a => a.map(x => x.getAttribute("href")));
  await page.getByRole("navigation", { name: "Campaign pages" }).getByRole("link", { name: "Nicco" }).click();
  await page.getByRole("heading", { level: 1, name: "Nicco" }).waitFor({ timeout: 10000 });
  ok("E1 the playtest session serves Inventory and the character page under /app/play/... with links that stay inside /play", JSON.stringify(links) === '["/app/play","/app/play/inventory","/app/play/character/player"]' && new URL(page.url()).pathname === "/app/play/character/player", JSON.stringify(links));
  ok("E2 no console errors and no uncaught errors", problems.length === 0, problems.join(" | "));
  await page.close();
  await session.shutdown({ discard_unsaved: true });
}

await browser.close();
for (const cleanup of cleanups.reverse()) await cleanup();
const fails = results.filter(r => r[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
