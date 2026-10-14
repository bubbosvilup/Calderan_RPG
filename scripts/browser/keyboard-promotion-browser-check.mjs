// Browser validation for the keyboard path to NPC+ promotion (B3, UI-1): dev only, offline (no provider, no network). Needs `npm run build` and
// Playwright (see scripts/lib/browser-env.mjs). Keyboard only after the page loads: focus, Tab, Shift-Tab, Enter and Escape; never a mouse click.
import { DATA, fromBuild, launchBrowser } from "../lib/browser-env.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const { loadWorld } = await fromBuild("src/world/loader.js");
const { createOpeningCampaign } = await fromBuild("src/campaign/opening-state.js");
const { GameSession } = await fromBuild("src/app/game-session.js");
const { FileCampaignRepository } = await fromBuild("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await fromBuild("src/ui/server.js");
const world = await loadWorld(DATA);
const LR = "heartstone_lr";
const c = createOpeningCampaign(world, "browser_keyboard_rite");
c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } },
  { kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 26 } }, current: { current_location: LR, status: "active" } } }] });
const dir = await mkdtemp(join(tmpdir(), "browser-keyboard-rite-"));
const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
const loaded = await GameSession.loadCampaign({ world, repository, createCoordinator: () => ({ async *runTurn() {} }) }, "browser_keyboard_rite");
const session = loaded.session;
const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const results = []; const ok = (name, cond) => { results.push([cond ? "PASS" : "FAIL", name]); console.log(cond ? "PASS" : "FAIL", name); };
let posts = 0, clicks = 0;
page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/npc-plus/promote")) posts++; });
await page.exposeFunction("__countClick", () => { clicks++; });
await page.addInitScript(() => document.addEventListener("mousedown", () => window.__countClick(), true));
await page.goto(url); await page.waitForSelector("#scene-participants button");
const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);
const inDrawer = () => page.evaluate(() => !!document.activeElement?.closest("#character-drawer"));

const entry = page.locator("#scene-participants button", { hasText: "Brenna" }).first();
await entry.focus(); await page.keyboard.press("Enter");
await page.waitForSelector("#character-overlay:not([hidden])");
ok("Enter on the scene entry opens Brenna's drawer", await page.locator("#character-overlay").isVisible());
let reached = false;
for (let k = 0; k < 12 && !reached; k++) { await page.keyboard.press("Tab"); reached = (await active()) === "character-promote-button"; }
ok("Tab reaches the Promote arrow", reached);
const loop = [];
for (let k = 0; k < 8; k++) { await page.keyboard.press("Tab"); loop.push(await inDrawer()); }
ok("Tab never leaves the drawer", loop.every(Boolean));
for (let k = 0; k < 12 && (await active()) !== "character-promote-button"; k++) await page.keyboard.press("Shift+Tab");
ok("Shift-Tab walks back to Promote", (await active()) === "character-promote-button");
await page.keyboard.press("Enter");
ok("Enter opens the confirmation and focuses Cancel, no request yet", (await page.locator("#character-promote-confirm").isVisible()) && (await active()) === "character-promote-cancel" && posts === 0);
await page.keyboard.press("Tab");
ok("Tab moves to the confirmation's Promote button", (await active()) === "character-promote-confirm-button");
const revision = session.getView().session.revision;
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#character-footer-actions button")?.textContent === "Edit NPC+");
ok("Enter promotes: exactly one request, one revision, Brenna is NPC+", posts === 1 && session.getView().session.revision === revision + 1 && /NPC\+/.test(await page.locator("#character-badges").innerText()));
ok("focus is restored inside the drawer after the promotion", await inDrawer() || (await active()) === "character-drawer");
let edit = false;
for (let k = 0; k < 20 && !edit; k++) { await page.keyboard.press("Tab"); edit = await page.evaluate(() => document.activeElement?.textContent === "Edit NPC+"); }
ok("Tab now reaches Edit NPC+ (the NPC+ controls are in the cycle too)", edit);
await page.keyboard.press("Escape");
await page.waitForSelector("#character-overlay", { state: "hidden" });
ok("Escape closes the drawer and focus returns to the scene entry", /Brenna/.test(await page.evaluate(() => document.activeElement?.textContent ?? "")));
ok("no mouse button was pressed", clicks === 0);
await browser.close(); await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close(); await rm(dir, { recursive: true, force: true });
const fails = results.filter(r => r[0] === "FAIL"); console.log(`\n${results.length - fails.length}/${results.length} checks passed`); process.exit(fails.length ? 1 : 0);
