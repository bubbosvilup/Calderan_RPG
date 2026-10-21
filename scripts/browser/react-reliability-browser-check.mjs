// Browser validation of turn reliability and human repair through the REACT UI (/app/play): dev only, offline (scripted narrator/controller, zero provider or image calls).
// Needs the compiled build (`npm run build`), the React build (`npm run ui:build`) and a Playwright browser; paths come from scripts/lib/browser-env.mjs.
// The REAL turn pipeline runs behind the UI; the React app only renders and initiates. This file is the React successor of two legacy checks:
//   turn-reliability-browser-check.mjs (PIPE-1 / REV-2)  -> section A (checks T1-T5) and section B (T6, an extra for the React retry path)
//   block5b-browser-check.mjs scenario A (narrated person) -> section C (N1-N4); scenario C (human repair) -> section D (R1-R6)
//   (block5b scenario B, person Accept materialization, lives in react-play-browser-check.mjs section C; stale-revision draft-kept resend in its A17/A18.)
// Screenshots land in artifacts/local/browser/react-reliability/ (gitignored).
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
const { learnCanonicalName } = await fromBuild("src/campaign/identity-knowledge.js");
const { GameSession } = await fromBuild("src/app/game-session.js");
const { FileCampaignRepository } = await fromBuild("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await fromBuild("src/ui/server.js");
const { TurnCoordinator } = await fromBuild("src/turn/coordinator/turn-coordinator.js");
const { RetrievalService } = await fromBuild("src/retrieval/retrieval-service.js");
const { HybridSearch } = await fromBuild("src/retrieval/hybrid-search.js");
const { stepNarrator, countingController, sessionWith } = await fromBuild("tests/support/turn-reliability-fixtures.js");
const { transfer } = await fromBuild("tests/support/turn-fixtures.js");

const SHOTS = await shotsDir("react-reliability");
const results = [];
const ok = (name, cond, detail = "") => { results.push([cond ? "PASS" : "FAIL", name]); console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? ` -- ${detail}` : ""}`); };
const browser = await launchBrowser();
const cleanups = [];

/** One page with console-error, page-error and request capture. */
async function openPage(url, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const problems = [], requests = [];
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("request", r => { if (r.method() === "POST") requests.push({ path: new URL(r.url()).pathname, body: r.postData() ?? "" }); });
  await page.goto(url);
  return { page, problems, requests };
}
const textarea = page => page.getByLabel(/says or does$/);
const statusOf = page => page.evaluate(() => document.querySelector("form[aria-label='Your action'] [role=status]")?.textContent ?? "");
const idle = page => page.waitForFunction(() => document.querySelector("form[aria-label='Your action'] [role=status]")?.textContent === "Your turn.", null, { timeout: 20000 });
const bodyText = page => page.evaluate(() => document.body.innerText);
const count = (text, needle) => text.split(needle).length - 1;
async function say(page, text) {
  const before = await page.locator("[role=log] article").count();
  await textarea(page).fill(text); await textarea(page).press("Enter");
  await page.waitForFunction(n => document.querySelectorAll("[role=log] article").length >= n + 2, before, { timeout: 20000 });
  await idle(page);
}
async function serve(session) {
  const server = createPlaytestServer(session, undefined, undefined, undefined, { reactDir: REACT_DIR });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

// ===================================================================== A. PIPE-1 / REV-2 (legacy turn-reliability-browser-check.mjs)
// The first narration invents a transfer the engine did not make (BAD); the audit rejects it and the retry (GOOD) is committed. The draft must never reach the page.
{
  const BAD = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.";
  const GOOD = "Brenna accepts boots from Nicco.";
  const ringPhrase = "Gerome takes the ring";
  let release; const gate = new Promise(r => { release = r; });
  const s = sessionWith(stepNarrator([{ text: BAD }, { text: GOOD }], () => gate), countingController([transfer]));
  const base = await serve(s.session);
  const { page, problems, requests } = await openPage(`${base}/app/play`);
  await textarea(page).waitFor({ timeout: 15000 });
  const turnPosts = () => requests.filter(r => r.path === "/api/turn");
  const baseline = await bodyText(page);
  await textarea(page).fill("I give boots to Brenna.");
  await textarea(page).press("Enter");
  const seen = [];
  const sample = async () => seen.push({ text: await bodyText(page), status: await statusOf(page) });
  for (let i = 0; i < 12; i++) { await sample(); await page.waitForTimeout(60); }
  const midTurn = seen.at(-1);
  const midStatuses = [...new Set(seen.map(x => x.status))];
  await page.screenshot({ path: `${SHOTS}/A1-mid-turn.png` });
  release();
  await page.waitForFunction(() => document.querySelector("[role=log]")?.innerText.includes("Brenna accepts boots from Nicco.") && !document.querySelector("article[aria-busy='true']"), null, { timeout: 15000 });
  await idle(page);
  for (let i = 0; i < 6; i++) { await sample(); await page.waitForTimeout(60); }
  const final = await bodyText(page);
  // legacy: "the draft prose is never visible, before, during or after the turn"
  ok("T1 the draft prose is never visible, before, during or after the turn", !baseline.includes(ringPhrase) && !seen.some(x => x.text.includes(ringPhrase)) && !final.includes(ringPhrase));
  // legacy: closed status vocabulary, at least one progress phase word, no narration. React vocabulary: PHASE_LABELS (Thinking…/Narrating…/Resolving…) in the composer status.
  const phaseWords = ["Thinking…", "Narrating…", "Resolving…"];
  ok("T2 mid-turn: neutral status words only (closed phase vocabulary, at least one), no narration",
    !midTurn.text.includes("Brenna accepts") && midStatuses.length > 0 && midStatuses.every(w => phaseWords.includes(w)) && midStatuses.some(w => phaseWords.includes(w)), JSON.stringify(midStatuses));
  await page.reload(); await textarea(page).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("[role=log]")?.innerText.includes("Brenna accepts boots from Nicco."), null, { timeout: 10000 });
  const afterReload = await bodyText(page);
  ok("T3 the final prose appears exactly once, also after a reload", count(final, GOOD) === 1 && count(afterReload, GOOD) === 1, `${count(final, GOOD)}/${count(afterReload, GOOD)}`);
  ok("T4 one turn request carrying text, turn_key and expected_revision", turnPosts().length === 1 && Object.keys(JSON.parse(turnPosts()[0].body)).sort().join() === "expected_revision,text,turn_key", `${turnPosts().length}`);
  ok("T5 one commit", s.campaign.revision === 2, `revision ${s.campaign.revision}`);
  ok("T5b no console errors and no uncaught errors", problems.length === 0, problems.join(" | "));
  await page.close();
  await s.session.shutdown({ discard_unsaved: true });
}

// ===================================================================== B. REV-2 retry with the same turn key (React-only extra: the legacy check had no connection-drop case)
// The connection drops on the first /api/turn attempt AFTER the server accepted it; the React client retries with the SAME turn_key and the server answers from the first result.
{
  const s = sessionWith(stepNarrator([{ text: "Brenna accepts boots from Nicco." }]), countingController([transfer]));
  const base = await serve(s.session);
  const { page, problems } = await openPage(`${base}/app/play`);
  await textarea(page).waitFor({ timeout: 15000 });
  const keys = [];
  let attempts = 0;
  await page.route("**/api/turn", async route => {
    const key = JSON.parse(route.request().postData() ?? "{}").turn_key; keys.push(key);
    if (attempts++ === 0) {
      // Let the server process the turn, then break the response seen by the page.
      await route.fetch().catch(() => undefined);
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await textarea(page).fill("I give boots to Brenna.");
  await textarea(page).press("Enter");
  await page.waitForFunction(() => document.querySelector("[role=log]")?.innerText.includes("Brenna accepts boots from Nicco."), null, { timeout: 20000 });
  await idle(page);
  const text = await page.locator("[role=log]").innerText();
  ok("T6 a dropped connection is retried with the SAME turn key: one commit, the prose shown once, the draft cleared",
    attempts === 2 && keys.length === 2 && keys[0] === keys[1] && !!keys[0] && s.campaign.revision === 2 && count(text, "Brenna accepts boots from Nicco.") === 1 && (await textarea(page).inputValue()) === "" && s.narrator.calls() === 1,
    JSON.stringify({ attempts, sameKey: keys[0] === keys[1], revision: s.campaign.revision, narratorCalls: s.narrator.calls(), occurrences: count(text, "Brenna accepts") }));
  ok("T6b no uncaught errors during the retry", problems.filter(p => p.startsWith("pageerror")).length === 0, problems.join(" | "));
  await page.close();
  await s.session.shutdown({ discard_unsaved: true });
}

// ===================================================================== C. a narrated person is not a persistent character (legacy block5b-browser-check.mjs scenario A)
{
  const world = await loadWorld(DATA);
  const MARKET = "calderan_slave_market";
  const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };
  const c = createOpeningCampaign(world, "react_reliability_c");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin")] });
  const script = { narration: "" }, service = new RetrievalService(world);
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() { const text = script.narration; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  const dir = await mkdtemp(join(tmpdir(), "react-rel-c-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
  const deps = { world, repository, createCoordinator: () => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const session = GameSession.fromCampaign(deps, c);
  const base = await serve(session);
  const { page, problems } = await openPage(`${base}/app/play`);
  await textarea(page).waitFor({ timeout: 15000 });
  const created = () => c.exportSnapshot().characters.filter(x => x.origin.kind === "created");
  const people = () => page.getByRole("complementary", { name: "People" });
  script.narration = 'Korvin leads Nicco past the canvas partition to the last cage.\n"Brenna. Thirty-two. A river hauler before the debt caught up," Korvin says.\nBrenna coughs behind the bars, feverish, and does not lift her head.';
  await say(page, "*checks the cages*");
  await page.screenshot({ path: `${SHOTS}/C1-narrated-person.png` });
  ok("N1 a narrated, named person is NOT a persistent character (no created character, no NPC row for her)",
    created().length === 0 && (await people().getByRole("button", { name: /^Brenna/ }).count()) === 0 && (await bodyText(page)).includes("Brenna coughs"));
  ok("N2 no confirmation card and no trade offer card for merely being narrated", (await page.getByRole("group", { name: /\?$/ }).count()) === 0 && (await page.locator("[data-confirmation-ref]").count()) === 0 && (await page.getByRole("region", { name: /offer/i }).count()) === 0);
  ok("N3 the turn committed no character-creating state (provisional only)", !c.exportSnapshot().characters.some(x => x.profile.name === "Brenna"));
  await page.reload(); await textarea(page).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("[role=log]")?.innerText.includes("Brenna coughs"), null, { timeout: 10000 });
  ok("N4 reload does not materialize the person", created().length === 0 && (await people().getByRole("button", { name: /^Brenna/ }).count()) === 0);
  ok("N5 no console errors and no uncaught errors", problems.length === 0, problems.join(" | "));
  await page.close();
  await session.shutdown({ discard_unsaved: true });
}

// ===================================================================== D. human repair of a synthetic duplicate (legacy block5b-browser-check.mjs scenario C)
// The React UI has no control that REQUESTS a repair (parity gap, see report); like the legacy check, the request is a direct API call. The card, the no-mutation
// guarantee and Confirm are exercised through the React UI.
{
  const A = "campaign_character_maren", Bb = "campaign_character_maren_two";
  const person = (id, name) => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 19 } }, current: { current_location: "test_room", status: "active" } } });
  const dir = await mkdtemp(join(tmpdir(), "react-rel-d-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const narrator = stepNarrator([]), controller = countingController([]);
  const s = sessionWith(narrator, controller, { save_dir: dir, autosave: false, setup: camp => camp.apply({ expected_revision: camp.revision, commands: [person(A, "Maren"), person(Bb, "Maren"),
    { kind: "create_item", name: "Shawl", description: "d", visual_description: "v", owner_id: Bb, position: { kind: "carried", character_id: Bb } }] }) });
  const base = await serve(s.session);
  const { page, problems, requests } = await openPage(`${base}/app/play`);
  await textarea(page).waitFor({ timeout: 15000 });
  const snap = () => s.campaign.exportSnapshot(), calls = () => narrator.calls() + controller.calls();
  const rev0 = s.campaign.revision, before = JSON.stringify(snap());
  const api = (path, body) => page.evaluate(async ([p, b]) => { const r = await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; }, [path, body]);
  const requested = await api("/api/repair/request", { operation: "merge", character_id: Bb, target_id: A, expected_revision: rev0 });
  ok("R1 a conflict-free merge request is accepted and creates a card, no campaign change", requested.status === 200 && requested.body.created === true && s.campaign.revision === rev0 && JSON.stringify(snap()) === before);
  await page.reload();
  const card = page.getByRole("group", { name: /Merge|Retire|Maren/ }).filter({ hasText: "SOURCE" });
  await card.waitFor({ timeout: 15000 });
  const text = (await card.innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: `${SHOTS}/D1-repair-card.png` });
  ok("R2 the card names SOURCE and TARGET and says nothing has changed yet", /SOURCE/.test(text) && /TARGET/.test(text) && /Nothing has changed yet/.test(text), text);
  ok("R3 still no mutation while the card is open", s.campaign.revision === rev0 && snap().characters.find(x => x.id === Bb).retirement === undefined);
  await card.getByRole("button", { name: /^Confirm: / }).click();
  await card.waitFor({ state: "detached", timeout: 10000 });
  ok("R4 Confirm commits exactly once (one revision), the duplicate is retired into the target, the item moved",
    s.campaign.revision === rev0 + 1 && snap().characters.find(x => x.id === Bb).retirement?.merged_into === A && snap().items.find(i => i.name === "Shawl").owner_id === A);
  const confirmPosts = requests.filter(r => r.path.startsWith("/api/confirmation/"));
  ok("R5 zero provider calls and the request carried only ref + revision", calls() === 0 && confirmPosts.length === 1 && confirmPosts[0].path === "/api/confirmation/confirm" && Object.keys(JSON.parse(confirmPosts[0].body)).sort().join() === "expected_revision,ref");
  const conflict = await api("/api/repair/request", { operation: "retire", character_id: "nicco", expected_revision: s.campaign.revision });
  await page.reload(); await textarea(page).waitFor({ timeout: 15000 });
  ok("R6 a request with a hard conflict (the player) creates no card and reports the conflict",
    conflict.status === 422 && conflict.body.conflicts?.some(x => x.code === "player_character") && (await page.locator("[data-confirmation-ref]").count()) === 0);
  // The deliberate hard-conflict request answers 422; that one expected resource log is not an error of the app.
  const unexpected = problems.filter(p => !/status of 422/.test(p));
  ok("R7 no console errors and no uncaught errors (besides the deliberate 422)", unexpected.length === 0, unexpected.join(" | "));
  await page.close();
  await s.session.shutdown({ discard_unsaved: true });
}

await browser.close();
for (const cleanup of cleanups.reverse()) await cleanup();
const fails = results.filter(r => r[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
