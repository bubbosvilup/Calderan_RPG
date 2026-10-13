// Browser validation for turn reliability (PIPE-1 / REV-2 client): dev only, offline (mock providers, zero live calls). Needs .build and a Playwright install; paths come from scripts/lib/browser-env.mjs.
// Deterministic real-browser validation of PIPE-1 / REV-2 client behavior (Chromium via Playwright, mock providers, no network).
import { fromBuild, launchBrowser } from "../lib/browser-env.mjs";
import { once } from "node:events";
const { createPlaytestServer } = await fromBuild("src/ui/server.js");
const { stepNarrator, countingController, sessionWith } = await fromBuild("tests/block4-fixtures.js");
const { transfer } = await fromBuild("tests/turn-fixtures.js");

const BAD = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.";
const GOOD = "Brenna accepts boots from Nicco.";
let release; const gate = new Promise(r => { release = r; });
const narrator = stepNarrator([{ text: BAD }, { text: GOOD }], () => gate);
const s = sessionWith(narrator, countingController([transfer]));
const server = createPlaytestServer(s.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await launchBrowser();
const page = await browser.newPage();
const turnRequests = [];
page.on("request", r => { if (r.url().endsWith("/api/turn")) turnRequests.push(r.postData()); });
await page.goto(url);
await page.waitForSelector("#input");
const baseline = await page.evaluate(() => document.body.innerText);
const ringPhrase = "Gerome takes the ring";
await page.fill("#input", "I give boots to Brenna.");
await page.press("#input", "Enter");
const seen = [];
const sample = async () => seen.push(await page.evaluate(() => ({ text: document.body.innerText, status: document.querySelector("#status")?.textContent ?? "" })));
for (let i = 0; i < 12; i++) { await sample(); await page.waitForTimeout(60); }
const midTurn = seen.at(-1);
release();
await page.waitForFunction(() => document.body.innerText.includes("Brenna accepts boots from Nicco.") && !document.querySelector("article[aria-busy='true']"), { timeout: 15000 });
for (let i = 0; i < 6; i++) { await sample(); await page.waitForTimeout(60); }
const final = await page.evaluate(() => document.body.innerText);
const result = {
  baseline_has_ring_phrase: baseline.includes(ringPhrase),
  draft_marker_ever_visible: seen.some(x => x.text.includes(ringPhrase)),
  mid_turn_status_words: [...new Set(seen.slice(0, 12).map(x => x.status))],
  mid_turn_has_no_narration: !midTurn.text.includes("Brenna accepts"),
  final_prose_occurrences: final.split("Brenna accepts boots from Nicco.").length - 1,
  final_has_no_draft: !final.includes(ringPhrase),
  turn_requests: turnRequests.length,
  request_body_keys: Object.keys(JSON.parse(turnRequests[0])).sort(),
  revision_after: s.campaign.revision,
};
// Reload: the page re-reads the committed story once, no duplicate bubble.
await page.reload(); await page.waitForSelector("#input");
result.after_reload_occurrences = (await page.evaluate(() => document.body.innerText)).split("Brenna accepts boots from Nicco.").length - 1;
console.log(JSON.stringify(result, null, 1));
await browser.close(); await s.session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close();
