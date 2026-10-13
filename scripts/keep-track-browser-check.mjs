// Browser validation for Keep track (dev only, offline: scripted Narrator and Controller, no provider call). Needs the compiled build (.build) and a
// Playwright install; adjust the absolute paths below. Screenshots land in /tmp/claude-0/browser/keep-track/.
import pw from "/opt/node-tools/node_modules/playwright/index.js"; const { chromium } = pw;
import { mkdir } from "node:fs/promises";
import { once } from "node:events";
const B = "/home/user/Calderan_RPG/.build";
const { makeRig } = await import(`${B}/tests/benchmark/harness.js`);
const { createPlaytestServer } = await import(`${B}/src/ui/server.js`);
const SHOTS = "/tmp/claude-0/browser/keep-track"; await mkdir(SHOTS, { recursive: true });
const results = []; const ok = (name, cond) => { results.push([cond ? "PASS" : "FAIL", name]); console.log(cond ? "PASS" : "FAIL", name); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

async function serve(session) {
  const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const keeps = []; page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/people/keep")) keeps.push(JSON.parse(r.postData() ?? "{}")); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url); await page.waitForFunction(() => !/Not loaded/.test(document.querySelector("#present-count")?.textContent ?? "Not loaded"));
  return { server, page, keeps, url, close: async () => { await page.close(); server.closeAllConnections(); server.close(); } };
}
const persistentNames = page => page.locator("#scene-participants strong").allInnerTexts();
const provisionalRows = page => page.locator("#provisional-people .provisional-person strong").allInnerTexts();

// ---------------------------------------------------------------- one named provisional person (Hollis)
const rig = await makeRig({ world: "market" }, "browser_keep");
await rig.say("I watch the crowd.", "*A lean porter drops a crate beside Nicco and wipes his brow.*\n\n\"My name is Hollis,\" he says. \"Mind your feet.\"");
let ui = await serve(rig.session);
let { page } = ui;
ok("1 the scene has one provisional person", (await provisionalRows(page)).join() === "Hollis");
ok("2 the Keep track affordance is visible and enabled", await page.locator("#provisional-people button.keep-track").isEnabled());
ok("3 the persistent people list (drawer entries) does NOT contain him", !(await persistentNames(page)).includes("Hollis"));
await page.screenshot({ path: `${SHOTS}/1-provisional.png` });
const rev0 = rig.session.getView().session.revision;
const token = await page.locator("#provisional-people .provisional-person").first().getAttribute("data-keep-token");
await page.click("#provisional-people button.keep-track");
await page.waitForFunction(() => [...document.querySelectorAll("#scene-participants strong")].some(e => e.textContent === "Hollis"));
ok("4-5 pressing Keep track sends exactly one request, carrying only the opaque token and the revision", ui.keeps.length === 1 && Object.keys(ui.keeps[0]).sort().join() === "expected_revision,token" && ui.keeps[0].token === token && ui.keeps[0].expected_revision === rev0);
ok("6 the revision moves exactly once", rig.session.getView().session.revision === rev0 + 1);
ok("7 Hollis appears among the persistent people", (await persistentNames(page)).includes("Hollis"));
ok("8 the provisional entry disappears (no duplicate)", (await provisionalRows(page)).length === 0 && await page.locator("#provisional-people").isHidden());
await page.locator("#scene-participants >> text=Hollis").first().click(); await page.waitForSelector("#character-overlay:not([hidden])");
ok("7b his character drawer opens as an ordinary campaign NPC", /Hollis/.test(await page.locator("#character-overlay").innerText()));
ok("11 the NPC+ rite is not offered at the market (existing eligibility: inside Heartstone only)", !(await page.locator("#character-promote-button").isVisible()));
await page.screenshot({ path: `${SHOTS}/2-kept-drawer.png` });
await ui.close();
await rig.reload();
ui = await serve(rig.session); page = ui.page;
ok("9-10 after save and reload he is still present as the same persistent person", (await persistentNames(page)).filter(n => n === "Hollis").length === 1 && (await provisionalRows(page)).length === 0
  && rig.campaign.exportSnapshot().characters.filter(c => c.origin.kind === "created").length === 1);
await page.screenshot({ path: `${SHOTS}/3-after-reload.png` });
await ui.close(); await rig.release();

// ---------------------------------------------------------------- two provisional people with the same label (two guards)
const two = await makeRig({ world: "market" }, "browser_keep_guards");
await two.say("I approach a guard.", "*The guard looks Nicco over, hand on his spear.*\n\n\"Keep moving,\" he says.");
await two.say("I approach another guard.", "*The second guard shrugs at Nicco and says nothing.*");
ui = await serve(two.session); page = ui.page;
const labels = await provisionalRows(page);
ok("S1 two same-label temporary people are listed distinguishably", labels.join("|") === "Guard (1)|Guard (2)");
const rows = page.locator("#provisional-people .provisional-person"), tokens = [await rows.nth(0).getAttribute("data-keep-token"), await rows.nth(1).getAttribute("data-keep-token")];
ok("S2 each row carries its own opaque token (never the label)", tokens[0] !== tokens[1] && tokens.every(t => /^[0-9a-f]{24}$/.test(t ?? "")));
await page.screenshot({ path: `${SHOTS}/4-two-guards.png` });
await rows.nth(1).locator("button.keep-track").click();
await page.waitForFunction(() => document.querySelectorAll("#provisional-people .provisional-person").length === 1);
ok("S3 the request names the second guard's token only", ui.keeps.length === 1 && ui.keeps[0].token === tokens[1]);
ok("S4 exactly that guard is kept; the other stays temporary", (await provisionalRows(page)).join() === "Guard" && two.campaign.exportSnapshot().characters.filter(c => c.origin.kind === "created").map(c => c.origin_snapshot?.ephemeral_ref).join() === "scene_npc_2");
await page.screenshot({ path: `${SHOTS}/5-second-guard-kept.png` });
await ui.close(); await two.release();

// ---------------------------------------------------------------- inside Heartstone the kept person is eligible for the unchanged NPC+ rite
const hall = await makeRig({ world: "market", commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }] }, "browser_keep_hall");
await hall.say("I look around the hall.", "*A courier waits by the hearth, rain on her cloak.*\n\n\"My name is Tamsin,\" she says. \"I carry letters for the Keeper.\"");
ui = await serve(hall.session); page = ui.page;
await page.click("#provisional-people button.keep-track");
await page.waitForFunction(() => [...document.querySelectorAll("#scene-participants strong")].some(e => e.textContent === "Tamsin"));
await page.locator("#scene-participants >> text=Tamsin").first().click(); await page.waitForSelector("#character-overlay:not([hidden])");
ok("11b inside Heartstone the kept person shows the existing Promote to NPC+ control", await page.locator("#character-promote-button").isVisible());
await page.screenshot({ path: `${SHOTS}/6-heartstone-promote.png` });
await ui.close(); await hall.release();

await browser.close();
const fails = results.filter(r => r[0] === "FAIL"); console.log(`\n${results.length - fails.length}/${results.length} checks passed`); process.exit(fails.length ? 1 : 0);
