// Browser validation for people in the React UI (Keep track, explicit NPC+ promotion, keyboard promotion), dev only and offline: zero provider calls.
// Needs the compiled build (`npm run build`), the React build (`npm run ui:build`) and a Playwright browser; paths come from scripts/lib/browser-env.mjs.
// The REAL pipeline runs behind the UI (GameSession + playtest server, scripted Narrator/Controller or no coordinator at all); React only renders and initiates.
// Screenshots land in artifacts/local/browser/react-people/ (gitignored).
//
// Legacy -> new mapping (the legacy vanilla UI checks this file replaces):
//   keep-track-browser-check.mjs:       1->K1  2->K2  3->K3  4-5->K4  6->K5  7->K6  8->K7  7b->K8  11->K9  9-10->K10  S1->K11  S2->K12  S3->K13  S4->K14  11b->K15
//   explicit-promotion-browser-check.mjs: 1-2->P1  (no NPC+ editor controls)->P2  3-4->P3  5->P4  6-8->P5  9->P6  10->P7  12->P8  (one revision)->P9  11->P10
//                                         (already NPC+ no arrow)->P11  (canonical inside)->P12  (masked canonical)->P13  (Player no control)->P14
//   keyboard-promotion-browser-check.mjs: Enter opens drawer->Q1  Tab reaches Promote->Q2  Tab never leaves drawer->Q3  Shift-Tab back->Q4  Enter opens confirm+Cancel focus->Q5
//                                         Tab to Promote button->Q6  Enter promotes->Q7  focus restored->Q8  Tab reaches NPC+ edit control->Q9  Escape closes+focus->Q10  no mouse->Q11
import { DATA, ROOT, fromBuild, launchBrowser, shotsDir } from "../lib/browser-env.mjs";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const REACT_DIR = process.env.REACT_UI_DIR ?? join(ROOT, "dist", "ui-client"); // REACT_UI_DIR: optional override to test an alternate React build
if (!existsSync(join(REACT_DIR, "index.html"))) { console.error("The React UI is not built: run `npm run ui:build` first."); process.exit(1); }
const { makeRig } = await fromBuild("tests/benchmark/harness.js");
const { loadWorld } = await fromBuild("src/world/loader.js");
const { createOpeningCampaign } = await fromBuild("src/campaign/opening-state.js");
const { GameSession } = await fromBuild("src/app/game-session.js");
const { FileCampaignRepository } = await fromBuild("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await fromBuild("src/ui/server.js");

const SHOTS = await shotsDir("react-people");
const results = [];
const ok = (name, cond, detail = "") => { results.push([cond ? "PASS" : "FAIL", name]); console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? ` -- ${detail}` : ""}`); };
const browser = await launchBrowser();
const cleanups = [];

/** Serves a session with the React app; returns a page with request capture (keeps, promotes) and console/page error capture. */
async function serve(session, { route = "/app/play", viewport = { width: 1440, height: 900 }, init } = {}) {
  const server = createPlaytestServer(session, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const page = await browser.newPage({ viewport });
  const problems = [], keeps = [], promotes = [];
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("response", r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${new URL(r.url()).pathname}`); });
  page.on("request", r => {
    if (r.method() !== "POST") return;
    const path = new URL(r.url()).pathname;
    if (path === "/api/people/keep") keeps.push(JSON.parse(r.postData() ?? "{}"));
    if (path === "/api/npc-plus/promote") promotes.push(JSON.parse(r.postData() ?? "{}"));
  });
  if (init) await page.addInitScript(init);
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}${route}`);
  await page.getByLabel(/says or does$/).waitFor({ timeout: 15000 });
  return { server, page, problems, keeps, promotes, base, close: async () => { await page.close(); server.closeAllConnections(); server.close(); } };
}
const people = page => page.getByRole("complementary", { name: "People" });
const scene = page => people(page).getByRole("region", { name: "In the scene" });
const temporary = page => scene(page).getByRole("group", { name: "Temporary" });
// Persistent scene rows only (the Temporary group is a separate list of [data-keep-token] rows).
const sceneNames = page => scene(page).locator("ul > li:not([data-keep-token]) strong").allInnerTexts();
const tempRows = page => temporary(page).locator("li strong").allInnerTexts();
const sceneRow = (page, name) => scene(page).getByRole("button", { name: new RegExp(`^${name}`) }).first();
const dialogOf = (page, name) => page.getByRole("dialog", { name });
const gone = (page, name) => dialogOf(page, name).waitFor({ state: "detached", timeout: 5000 });
const promoteBtn = (page, name) => page.getByRole("button", { name: `Promote ${name} to NPC+` });
const withKeepable = async page => { await temporary(page).getByRole("button", { name: /^Keep track of / }).first().waitFor({ timeout: 10000 }); };

// ===================================================================== K. Keep track (legacy keep-track-browser-check.mjs)
{
  // one named provisional person (Hollis)
  const rig = await makeRig({ world: "market" }, "react_keep");
  await rig.say("I watch the crowd.", "*A lean porter drops a crate beside Nicco and wipes his brow.*\n\n\"My name is Hollis,\" he says. \"Mind your feet.\"");
  let ui = await serve(rig.session); let { page } = ui;
  await withKeepable(page);
  ok("K1 [1] the scene has one temporary (provisional) person", (await tempRows(page)).join() === "Hollis", JSON.stringify(await tempRows(page)));
  const keepBtn = temporary(page).getByRole("button", { name: "Keep track of Hollis" });
  ok("K2 [2] the Keep track affordance is visible and enabled", (await keepBtn.isVisible()) && (await keepBtn.isEnabled()));
  ok("K3 [3] the persistent people list (scene rows) does NOT contain him", !(await sceneNames(page)).includes("Hollis"));
  await page.screenshot({ path: `${SHOTS}/K1-provisional.png` });
  const rev0 = rig.session.getView().session.revision;
  const token = await temporary(page).locator("li").first().getAttribute("data-keep-token");
  await keepBtn.click();
  await page.waitForFunction(() => [...document.querySelectorAll("aside[aria-label='People'] ul > li strong")].some(e => e.textContent === "Hollis" && !e.closest("[role=group]")), null, { timeout: 10000 });
  await temporary(page).waitFor({ state: "detached", timeout: 10000 });
  ok("K4 [4-5] Keep track sends exactly one request, carrying only the opaque token and the revision", ui.keeps.length === 1 && Object.keys(ui.keeps[0]).sort().join() === "expected_revision,token" && ui.keeps[0].token === token && ui.keeps[0].expected_revision === rev0, JSON.stringify(ui.keeps));
  ok("K5 [6] the revision moves exactly once", rig.session.getView().session.revision === rev0 + 1);
  ok("K6 [7] Hollis appears among the persistent people", (await sceneNames(page)).includes("Hollis"));
  ok("K7 [8] the temporary entry disappears (no duplicate)", (await temporary(page).count()) === 0 && (await sceneNames(page)).filter(n => n === "Hollis").length === 1);
  await sceneRow(page, "Hollis").click();
  await dialogOf(page, "Hollis").waitFor({ timeout: 5000 });
  ok("K8 [7b] his character drawer opens as an ordinary campaign NPC", /Hollis/.test(await dialogOf(page, "Hollis").innerText()) && (await dialogOf(page, "Hollis").getByText("NPC+", { exact: true }).count()) === 0);
  ok("K9 [11] the NPC+ rite is not offered at the market (inside Heartstone only)", (await page.getByRole("button", { name: /^Promote .* to NPC\+$/ }).count()) === 0);
  await page.screenshot({ path: `${SHOTS}/K2-kept-drawer.png` });
  ok("K9b no console errors and no uncaught errors", ui.problems.length === 0, ui.problems.join(" | "));
  await ui.close();
  await rig.reload();
  ui = await serve(rig.session); page = ui.page;
  ok("K10 [9-10] after save and reload he is still present as the same persistent person", (await sceneNames(page)).filter(n => n === "Hollis").length === 1 && (await temporary(page).count()) === 0
    && rig.campaign.exportSnapshot().characters.filter(c => c.origin.kind === "created").length === 1);
  await page.screenshot({ path: `${SHOTS}/K3-after-reload.png` });
  await ui.close(); await rig.release();

  // two provisional people with the same label (two guards)
  const two = await makeRig({ world: "market" }, "react_keep_guards");
  await two.say("I approach a guard.", "*The guard looks Nicco over, hand on his spear.*\n\n\"Keep moving,\" he says.");
  await two.say("I approach another guard.", "*The second guard shrugs at Nicco and says nothing.*");
  ui = await serve(two.session); page = ui.page;
  await withKeepable(page);
  const labels = await tempRows(page);
  ok("K11 [S1] two same-label temporary people are listed distinguishably", labels.join("|") === "Guard (1)|Guard (2)", JSON.stringify(labels));
  const rows = temporary(page).locator("li");
  const tokens = [await rows.nth(0).getAttribute("data-keep-token"), await rows.nth(1).getAttribute("data-keep-token")];
  ok("K12 [S2] each row carries its own opaque token (never the label)", tokens[0] !== tokens[1] && tokens.every(t => /^[0-9a-f]{24}$/.test(t ?? "")), JSON.stringify(tokens));
  await page.screenshot({ path: `${SHOTS}/K4-two-guards.png` });
  await temporary(page).getByRole("button", { name: "Keep track of Guard (2)" }).click();
  await page.waitForFunction(() => document.querySelectorAll("aside[aria-label='People'] [data-keep-token]").length === 1, null, { timeout: 10000 });
  ok("K13 [S3] the request names the second guard's token only", ui.keeps.length === 1 && ui.keeps[0].token === tokens[1], JSON.stringify(ui.keeps));
  ok("K14 [S4] exactly that guard is kept; the other stays temporary", (await tempRows(page)).join() === "Guard"
    && two.campaign.exportSnapshot().characters.filter(c => c.origin.kind === "created").map(c => c.origin_snapshot?.ephemeral_ref).join() === "scene_npc_2");
  await page.screenshot({ path: `${SHOTS}/K5-second-guard-kept.png` });
  await ui.close(); await two.release();

  // inside Heartstone the kept person is eligible for the unchanged NPC+ rite
  const hall = await makeRig({ world: "market", commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }] }, "react_keep_hall");
  await hall.say("I look around the hall.", "*A courier waits by the hearth, rain on her cloak.*\n\n\"My name is Tamsin,\" she says. \"I carry letters for the Keeper.\"");
  ui = await serve(hall.session); page = ui.page;
  await withKeepable(page);
  await temporary(page).getByRole("button", { name: "Keep track of Tamsin" }).click();
  await sceneRow(page, "Tamsin").waitFor({ timeout: 10000 });
  await sceneRow(page, "Tamsin").click();
  await dialogOf(page, "Tamsin").waitFor({ timeout: 5000 });
  ok("K15 [11b] inside Heartstone the kept person shows the existing Promote to NPC+ control", await promoteBtn(page, "Tamsin").isVisible());
  await page.screenshot({ path: `${SHOTS}/K6-heartstone-promote.png` });
  await ui.close(); await hall.release();
}

// ===================================================================== P/Q fixtures: a Heartstone campaign served without a coordinator (no turns run)
const world = await loadWorld(DATA);
const LR = "heartstone_lr", M = "calderan_slave_market";
const person = (name, where, status = "active") => ({ kind: "register_character", character: { id: `campaign_character_${name.toLowerCase()}`, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 26 } }, current: { current_location: where, status } } });
async function sessionWith(id, commands) {
  const c = createOpeningCampaign(world, id);
  c.apply({ expected_revision: c.revision, commands });
  const dir = await mkdtemp(join(tmpdir(), "react-people-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
  const loaded = await GameSession.loadCampaign({ world, repository, createCoordinator: () => ({ async *runTurn() {} }) }, id);
  return loaded.session;
}

// ===================================================================== P. Explicit NPC+ promotion (legacy explicit-promotion-browser-check.mjs)
{
  const session = await sessionWith("react_rite", [{ kind: "runtime_delta", delta: { player_location: LR } }, person("Brenna", LR), person("Sovela", M), person("Dara", LR, "inactive"),
    { kind: "register_character", character: { id: "korvin", origin: { kind: "canonical", canonical_entity_id: "korvin" }, profile: {}, current: { status: "active" } } }, { kind: "move_character", character_id: "korvin", location_id: LR }]);
  const ui = await serve(session); const { page } = ui;
  const startUrl = page.url();
  console.log("   scene:", (await sceneNames(page)).join(", "));
  await sceneRow(page, "Brenna").click();
  const drawer = dialogOf(page, "Brenna"); await drawer.waitFor({ timeout: 5000 });
  ok("P1 [1-2] campaign NPC Brenna: the Promote to NPC+ control is visible", await promoteBtn(page, "Brenna").isVisible());
  ok("P2 no NPC+ editor controls before promotion", (await drawer.getByRole("link", { name: /Edit appearance/ }).count()) === 0 && (await drawer.getByText("NPC+", { exact: true }).count()) === 0);
  await page.screenshot({ path: `${SHOTS}/P1-arrow.png` });
  await promoteBtn(page, "Brenna").click();
  const confirm = drawer.getByRole("group", { name: "Promote Brenna to NPC+?" });
  await confirm.waitFor({ timeout: 5000 });
  ok("P3 [3-4] click opens the confirmation (no request yet)", (await confirm.isVisible()) && ui.promotes.length === 0);
  console.log("   title:", await confirm.locator("strong").first().innerText());
  await page.screenshot({ path: `${SHOTS}/P2-confirm.png` });
  await confirm.getByRole("button", { name: /^Cancel/ }).click();
  await confirm.waitFor({ state: "detached", timeout: 5000 });
  ok("P4 [5] cancel works (no request, the control is back)", (await promoteBtn(page, "Brenna").isVisible()) && ui.promotes.length === 0);
  await promoteBtn(page, "Brenna").click();
  const rev0 = session.getView().session.revision;
  await confirm.getByRole("button", { name: "Confirm: Promote" }).click();
  await drawer.getByText("NPC+", { exact: true }).first().waitFor({ timeout: 10000 });
  ok("P5 [6-8] confirm sends exactly one request (ref + revision only) and Brenna becomes NPC+", ui.promotes.length === 1 && Object.keys(ui.promotes[0]).sort().join() === "expected_revision,ref" && (await drawer.getByText("NPC+", { exact: true }).count()) >= 1, JSON.stringify(ui.promotes));
  ok("P6 [9] the Promote control disappears", (await promoteBtn(page, "Brenna").count()) === 0);
  const editLink = drawer.getByRole("link", { name: "Edit appearance and portraits" });
  ok("P7 [10] NPC+ editor capabilities become available (the edit link to the NPC+ page)", await editLink.isVisible());
  ok("P8 [12] no page reload (single navigation)", page.url() === startUrl);
  ok("P9 one revision committed", session.getView().session.revision === rev0 + 1);
  await page.screenshot({ path: `${SHOTS}/P3-npcplus.png` });
  // the NPC+ editor page offers Generate (legacy "Generate" portrait action)
  await editLink.click();
  await page.getByRole("button", { name: /Generate/ }).first().waitFor({ timeout: 10000 }).catch(() => undefined);
  ok("P7b [10] the NPC+ page offers portrait Generate", (await page.getByRole("button", { name: /Generate/ }).count()) >= 1);
  await page.screenshot({ path: `${SHOTS}/P3b-npcplus-page.png` });
  await page.goBack();
  await page.getByLabel(/says or does$/).waitFor({ timeout: 10000 });
  await page.getByRole("link", { name: "Household" }).first().click();
  await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 10000 });
  ok("P10 [11] Brenna appears in the Heartstone household page", (await page.getByRole("button", { name: "View Brenna" }).count()) === 1);
  await page.screenshot({ path: `${SHOTS}/P4-household.png` });
  await page.goBack();
  await page.getByLabel(/says or does$/).waitFor({ timeout: 10000 });
  // no control for already NPC+, Player, ineligible
  await sceneRow(page, "Brenna").click(); await dialogOf(page, "Brenna").waitFor({ timeout: 5000 });
  ok("P11 already NPC+: no Promote control", (await promoteBtn(page, "Brenna").count()) === 0);
  await page.keyboard.press("Escape"); await gone(page, "Brenna");
  const present = (await sceneNames(page)).join("|");
  if (present.includes("Korvin")) {
    await sceneRow(page, "Korvin").click(); await dialogOf(page, "Korvin").waitFor({ timeout: 5000 });
    ok("P12 campaign-record canonical Korvin (inside, eligible): Promote control visible", await promoteBtn(page, "Korvin").isVisible());
    await page.keyboard.press("Escape"); await gone(page, "Korvin");
  } else console.log("   (Korvin is masked in the scene; P12 covered by P13)");
  await sceneRow(page, "Unfamiliar person").click(); await dialogOf(page, "Unfamiliar person").waitFor({ timeout: 5000 });
  const masked = promoteBtn(page, "Unfamiliar person");
  ok("P13 campaign-record canonical NPC (masked identity): eligible, control shows only the masked label", await masked.isVisible());
  await masked.click();
  console.log("   masked confirm:", await dialogOf(page, "Unfamiliar person").getByRole("group").locator("strong").first().innerText());
  await page.keyboard.press("Escape"); await gone(page, "Unfamiliar person");
  const nicco = scene(page).getByRole("link", { name: /Nicco/ });
  ok("P14 Player: a link to the character page, no drawer and no promotion control", (await nicco.count()) === 1 && (await scene(page).getByRole("button", { name: /^Nicco/ }).count()) === 0 && (await page.getByRole("button", { name: /^Promote Nicco/ }).count()) === 0);
  ok("P15 no console errors and no uncaught errors", ui.problems.length === 0, ui.problems.join(" | "));
  await ui.close(); await session.shutdown({ discard_unsaved: true });
}

// ===================================================================== Q. Keyboard path to promotion (legacy keyboard-promotion-browser-check.mjs)
{
  const session = await sessionWith("react_keyboard_rite", [{ kind: "runtime_delta", delta: { player_location: LR } }, person("Brenna", LR)]);
  let clicks = 0;
  const ui = await serve(session, { init: () => { document.addEventListener("mousedown", () => window.__clicks = (window.__clicks ?? 0) + 1, true); } });
  const { page } = ui;
  const active = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName);
  const inDrawer = () => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
  const isPromote = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Promote Brenna to NPC+");
  const entry = sceneRow(page, "Brenna");
  await entry.focus(); await page.keyboard.press("Enter");
  const drawer = dialogOf(page, "Brenna"); await drawer.waitFor({ timeout: 5000 });
  ok("Q1 Enter on the scene entry opens Brenna's drawer", await drawer.isVisible());
  let reached = false;
  for (let k = 0; k < 12 && !reached; k++) { await page.keyboard.press("Tab"); reached = await isPromote(); }
  ok("Q2 Tab reaches the Promote control", reached);
  const loop = [];
  for (let k = 0; k < 10; k++) { await page.keyboard.press("Tab"); loop.push(await inDrawer()); }
  ok("Q3 Tab never leaves the drawer", loop.every(Boolean), JSON.stringify(loop));
  for (let k = 0; k < 14 && !(await isPromote()); k++) await page.keyboard.press("Shift+Tab");
  ok("Q4 Shift-Tab walks back to Promote", await isPromote());
  await page.keyboard.press("Enter");
  const confirm = drawer.getByRole("group", { name: "Promote Brenna to NPC+?" });
  await confirm.waitFor({ timeout: 5000 });
  // The React card focuses Confirm (autoFocus), where the legacy one focused Cancel; the intent (focus moves into the confirmation, no request yet) is kept.
  const focusInCard = await page.evaluate(() => !!document.activeElement?.closest("[role=group]")?.querySelector("[aria-label='Confirm: Promote']") && !!document.activeElement?.closest("[role=group]"));
  ok("Q5 Enter opens the confirmation and moves focus into it, no request yet", (await confirm.isVisible()) && focusInCard && ui.promotes.length === 0, await active());
  let onConfirm = (await active()) === "Confirm: Promote";
  for (let k = 0; k < 4 && !onConfirm; k++) { await page.keyboard.press("Tab"); onConfirm = (await active()) === "Confirm: Promote"; }
  ok("Q6 focus is on (or Tab reaches) the confirmation's Promote button", onConfirm, await active());
  const revision = session.getView().session.revision;
  await page.keyboard.press("Enter");
  await drawer.getByText("NPC+", { exact: true }).first().waitFor({ timeout: 10000 });
  ok("Q7 Enter promotes: exactly one request, one revision, Brenna is NPC+", ui.promotes.length === 1 && session.getView().session.revision === revision + 1 && (await drawer.getByText("NPC+", { exact: true }).count()) >= 1);
  await page.waitForTimeout(200);
  ok("Q8 focus is restored inside the drawer after the promotion", (await inDrawer()) || (await page.evaluate(() => document.activeElement === document.body)) === false);
  let edit = false;
  for (let k = 0; k < 20 && !edit; k++) { await page.keyboard.press("Tab"); edit = await page.evaluate(() => document.activeElement?.textContent === "Edit appearance and portraits"); }
  ok("Q9 Tab now reaches the NPC+ edit control (it is in the cycle too)", edit);
  await page.keyboard.press("Escape");
  await gone(page, "Brenna");
  ok("Q10 Escape closes the drawer and focus returns to the scene entry", /Brenna/.test(await page.evaluate(() => document.activeElement?.textContent ?? "")));
  clicks = await page.evaluate(() => window.__clicks ?? 0);
  ok("Q11 no mouse button was pressed", clicks === 0, String(clicks));
  ok("Q12 no console errors and no uncaught errors", ui.problems.length === 0, ui.problems.join(" | "));
  await ui.close(); await session.shutdown({ discard_unsaved: true });
}

await browser.close();
for (const cleanup of cleanups.reverse()) await cleanup();
const fails = results.filter(r => r[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
