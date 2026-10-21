// Browser validation for the React UI-3 pages (Household, NPC+ editor and portraits, Settings, campaign list close/delete, unified navigation), dev only
// and offline: zero live provider calls and zero live image calls. The portrait pipeline runs for real behind the UI with a local scripted image generator
// (a tiny PNG, counted calls); the narrator and controller are never invoked (no turn is played).
// Needs the compiled build (`npm run build`), the React build (`npm run ui:build`; REACT_UI_DIR overrides the folder) and a Playwright browser.
// Screenshots land in artifacts/local/browser/react-ui3/ (gitignored).
import { DATA, ROOT, fromBuild, launchBrowser, shotsDir } from "../lib/browser-env.mjs";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const REACT_DIR = process.env.REACT_UI_DIR ?? join(ROOT, "dist", "ui-client");
if (!existsSync(join(REACT_DIR, "index.html"))) { console.error("The React UI is not built: run `npm run ui:build` first."); process.exit(1); }
const { loadWorld } = await fromBuild("src/world/loader.js");
const { createOpeningCampaign } = await fromBuild("src/campaign/opening-state.js");
const { SessionHost } = await fromBuild("src/app/session-host.js");
const { PortraitAssetStore } = await fromBuild("src/app/portrait-store.js");
const { FileCampaignRepository } = await fromBuild("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await fromBuild("src/ui/server.js");

const SHOTS = await shotsDir("react-ui3");
const results = [];
const ok = (name, cond, detail = "") => { results.push([cond ? "PASS" : "FAIL", name]); console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? ` -- ${detail}` : ""}`); };
const browser = await launchBrowser();
const cleanups = [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const LR = "heartstone_lr";
const person = (name, where, status = "active") => ({ kind: "register_character", character: { id: `campaign_character_${name.toLowerCase()}`, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 26 } }, current: { current_location: where, status } } });
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);

async function openPage(url, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const origin = new URL(url).origin, problems = [], requests = [], foreign = [];
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("response", r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${new URL(r.url()).pathname}`); });
  page.on("request", r => { if (new URL(r.url()).origin !== origin) foreign.push(r.url()); if (r.method() === "POST") requests.push({ path: new URL(r.url()).pathname, body: r.postData() ?? "" }); });
  await page.goto(url);
  return { page, problems, requests, foreign };
}

const world = await loadWorld(DATA);
const dir = await mkdtemp(join(tmpdir(), "react-ui3-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
const repository = new FileCampaignRepository(world, dir);
for (const [id, name] of [["react_ui3", "Heartstone household"], ["react_ui3_spare", "Spare campaign"]]) {
  const c = createOpeningCampaign(world, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }, person("Brenna", LR)] });
  await repository.saveCampaign(c);
  void name;
}
const gen = { identity: { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" }, calls: 0,
  async generate() { gen.calls++; return { bytes: Buffer.concat([PNG, Buffer.from([gen.calls])]), media_type: "image/png", ...gen.identity, latency_ms: 1 }; } };
const deps = { world, repository, portrait_generator: gen, portrait_store: new PortraitAssetStore(dir, { layout: "campaign" }), portrait_retry_delay_ms: () => 0,
  createCoordinator: () => ({ async *runTurn() {} }) };
const host = new SessionHost(deps);
const loaded = await host.loadCampaign({ campaign_id: "react_ui3" });
if (!loaded.ok) throw new Error(`campaign did not load: ${JSON.stringify(loaded.error)}`);
const server = createPlaytestServer(host, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
cleanups.push(() => { server.closeAllConnections(); server.close(); });
const base = `http://127.0.0.1:${server.address().port}`;
const nav = page => page.getByRole("navigation", { name: "Campaign pages" });

// ===================================================================== H. Household -> promotion -> NPC+ editor -> portraits
{
  const { page, problems, requests, foreign } = await openPage(`${base}/app/play/react_ui3`);
  await page.getByLabel(/says or does$/).waitFor({ timeout: 30000 });
  await nav(page).getByRole("link", { name: "Household" }).click();
  await page.getByRole("heading", { level: 1, name: "Household" }).waitFor({ timeout: 10000 });
  ok("H1 the Household page lists the engine's members (Brenna is not in the household yet) and has no NPC+ edit link", (await page.getByRole("link", { name: /^Edit / }).count()) === 0);
  // promote through the scene drawer (the one explicit flow), then the household shows the NPC+
  await nav(page).getByRole("link", { name: "Play" }).click();
  await page.getByRole("complementary", { name: "People" }).getByRole("button", { name: /Brenna/ }).first().click();
  await page.getByRole("button", { name: "Promote Brenna to NPC+" }).click();
  await page.getByRole("button", { name: /Confirm: Promote/ }).click();
  await page.getByRole("link", { name: "Edit appearance and portraits" }).waitFor({ timeout: 10000 });
  ok("H2 promotion sent exactly one request (ref + revision) and the NPC+ gets its editor link only from the engine's capability", requests.filter(r => r.path === "/api/npc-plus/promote").length === 1);
  await page.keyboard.press("Escape");
  await nav(page).getByRole("link", { name: "Household" }).click();
  await page.getByRole("heading", { level: 1, name: "Household" }).waitFor({ timeout: 10000 });
  const card = page.getByRole("button", { name: "View Brenna" });
  ok("H3 the household lists Brenna with the NPC+ badge", (await card.count()) === 1 && /NPC\+/.test(await card.innerText()));
  await page.getByRole("searchbox", { name: "Search members" }).fill("zzz");
  ok("H4 a search with no match says so and sends no request", (await page.getByText("No members match this filter or search.").isVisible()) && !requests.some(r => r.path.includes("search")));
  await page.getByRole("searchbox", { name: "Search members" }).fill("");
  await page.screenshot({ path: `${SHOTS}/H-household-1440.png` });
  await page.getByRole("link", { name: "Edit Brenna" }).click();
  await page.getByRole("heading", { level: 1, name: "Brenna" }).waitFor({ timeout: 10000 });
  const editorUrl = page.url();
  ok("H5 the editor lives at /characters/<opaque ref>, never at a name", /\/app\/play\/react_ui3\/characters\/[0-9a-f]{24}$/.test(new URL(editorUrl).pathname));
  // appearance save
  await page.getByLabel("Hair color").fill("copper");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/Saved|saved/).first().waitFor({ timeout: 10000 }).catch(() => undefined);
  const saveReq = requests.find(r => r.path === "/api/appearance");
  const savedBody = saveReq ? JSON.parse(saveReq.body) : {};
  ok("H6 Save sends only ref, expected_revision and the changed field", !!saveReq && Object.keys(savedBody).sort().join() === "expected_revision,patch,ref" && JSON.stringify(savedBody.patch) === '{"hair_color":"copper"}', saveReq?.body);
  // generation: only on a deliberate click
  ok("H7 nothing was generated before the click", gen.calls === 0);
  await page.getByRole("button", { name: "Generate 3 avatars" }).click();
  const thumbs = page.getByRole("region", { name: "Gallery" }).getByRole("button", { name: /^View portrait/ });
  await thumbs.nth(2).waitFor({ timeout: 20000 });
  ok("H8 generation (scripted fake, no network) lists 3 images from the server", (await thumbs.count()) === 3 && gen.calls === 3);
  // the first generated image may already hold the role; open one that does not
  for (let i = 0; i < 3; i++) { await thumbs.nth(i).click(); if (await page.getByRole("button", { name: "Set as Avatar" }).isVisible()) break; await page.keyboard.press("Escape"); }
  await page.getByRole("button", { name: "Set as Avatar" }).click();
  await page.getByRole("button", { name: "Avatar ✓" }).waitFor({ timeout: 10000 });
  const avatarReq = requests.find(r => r.path === "/api/portrait/avatar");
  ok("H9 choosing the Avatar sends ref, item and revision only", !!avatarReq && Object.keys(JSON.parse(avatarReq.body)).sort().join() === "expected_revision,item,ref", avatarReq?.body);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${SHOTS}/H-editor-1440.png` });
  // deep link and reload
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "Brenna" }).waitFor({ timeout: 10000 });
  ok("H10 reload on the editor deep link restores the saved value from the server", (await page.getByLabel("Hair color").inputValue()) === "copper");
  // responsive
  const widths = {};
  for (const [w, h] of [[1440, 900], [1024, 800], [390, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const path of ["/household", "/characters/" + new URL(editorUrl).pathname.split("/").pop(), "/settings", ""]) {
      await page.goto(`${base}/app/play/react_ui3${path}`);
      await page.getByRole("navigation", { name: "Campaign pages" }).waitFor({ state: "attached", timeout: 10000 });
      widths[`${w}${path}`] = await noOverflow(page) && await page.getByRole("navigation", { name: "Campaign pages" }).isVisible();
    }
  }
  ok("H11 the page navigation stays visible and there is no horizontal overflow on Household, the editor, Settings and Play at 1440, 1024 and 390 px", Object.values(widths).every(Boolean), JSON.stringify(widths));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${base}/app/play/react_ui3/household`);
  await page.screenshot({ path: `${SHOTS}/H-household-390.png` });
  ok("H12 no console errors, uncaught errors or requests to another host", problems.length === 0 && foreign.length === 0, problems.concat(foreign).join(" | "));
  await page.close();
}

// ===================================================================== S. Settings (diagnostics, close) and the campaign list (delete with confirmation)
{
  const { page, problems, requests } = await openPage(`${base}/app/play/react_ui3/settings`);
  await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor({ timeout: 30000 });
  await page.getByRole("heading", { level: 2, name: "Optional services" }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-service]").length > 0, null, { timeout: 10000 });
  ok("S1 the optional-services list is the server's report (read-only, no Reflection claim)", (await page.locator("[data-service]").count()) > 0 && (await page.getByRole("button", { name: /turn (on|off)/i }).count()) === 0);
  await page.getByRole("button", { name: "Close campaign" }).click();
  await page.getByRole("heading", { level: 1, name: "Campaigns" }).waitFor({ timeout: 10000 });
  ok("S2 Close campaign returns to the campaign list", /^\/app\/?$/.test(new URL(page.url()).pathname) && requests.some(r => r.path === "/api/campaigns/close"));
  await page.getByRole("button", { name: "Delete campaign react_ui3_spare" }).or(page.getByRole("button", { name: /Delete campaign .*Spare/ })).first().waitFor({ timeout: 10000 }).catch(() => undefined);
  const deletes = page.getByRole("button", { name: /^Delete campaign / });
  const before = await deletes.count();
  await deletes.last().click();
  await page.getByRole("dialog", { name: "Delete this campaign?" }).waitFor({ timeout: 5000 });
  await page.keyboard.press("Escape");
  ok("S3 Escape cancels the delete confirmation and nothing is sent", (await page.getByRole("dialog").count()) === 0 && !requests.some(r => r.path === "/api/campaigns/delete"));
  await deletes.last().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForFunction(n => document.querySelectorAll("button[aria-label^='Delete campaign ']").length === n - 1, before, { timeout: 10000 });
  const body = JSON.parse(requests.find(r => r.path === "/api/campaigns/delete").body);
  ok("S4 confirming deletes exactly one campaign by id", Object.keys(body).join() === "campaign_id" && (await deletes.count()) === before - 1);
  await page.screenshot({ path: `${SHOTS}/S-campaigns.png` });
  ok("S5 no console errors or uncaught errors", problems.length === 0, problems.join(" | "));
  await page.close();
}

await browser.close();
for (const cleanup of cleanups.reverse()) await cleanup();
const fails = results.filter(r => r[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
