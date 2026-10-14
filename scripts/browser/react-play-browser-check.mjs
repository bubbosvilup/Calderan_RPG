// Browser validation for the React play screen (UI-1), dev only and offline: zero live provider calls, zero image calls.
// Needs the compiled build (`npm run build`), the React build (`npm run ui:build`) and a Playwright browser; paths come from scripts/lib/browser-env.mjs.
// The REAL turn pipeline runs behind the UI with a scripted Narrator and Controller (as in actual-offer-browser-check.mjs), so offers, settlements,
// confirmations and stale revisions are produced exactly as in play; the React app only renders and initiates them.
// Screenshots land in artifacts/local/browser/react-play/ (gitignored).
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

const SHOTS = await shotsDir("react-play");
const results = [];
const ok = (name, cond, detail = "") => { results.push([cond ? "PASS" : "FAIL", name]); console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? ` -- ${detail}` : ""}`); };
const browser = await launchBrowser();
const cleanups = [];

/** One page with console-error, page-error (uncaught exceptions and unhandled rejections) and request capture. */
async function openPage(url, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const problems = [], requests = [], bodies = [];
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("response", r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${new URL(r.url()).pathname}`); });
  page.on("request", r => { if (r.method() === "POST") requests.push({ path: new URL(r.url()).pathname, body: r.postData() ?? "" }); });
  page.on("response", async r => { if (r.url().includes("/api/")) { try { bodies.push(await r.text()); } catch { /* streamed */ } } });
  await page.goto(url);
  return { page, problems, requests, bodies };
}
const textarea = page => page.getByLabel(/says or does$/);
const idle = page => page.waitForFunction(() => document.querySelector("form[aria-label='Your action'] [role=status]")?.textContent === "Your turn.", null, { timeout: 20000 });
async function say(page, text) {
  const before = await page.locator("[role=log] article").count();
  await textarea(page).fill(text); await textarea(page).press("Enter");
  await page.waitForFunction(n => document.querySelectorAll("[role=log] article").length >= n + 2, before, { timeout: 20000 });
  await idle(page);
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ===================================================================== A. offers, gold, masking, materialization, stale revision, layout
{
  const world = await loadWorld(DATA);
  const MARKET = "calderan_slave_market", BRENNA = "campaign_character_brenna";
  const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };
  const c = createOpeningCampaign(world, "react_browser");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin"),
    { kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: {}, current: { current_location: MARKET, status: "active" },
      origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase_unnamed_subject", label: "the woman", promoted_revision: c.revision + 1, promoted_world_minute: 0, location_id: MARKET,
        established: { descriptor: "woman", appearance: ["red-haired"], role: "enslaved; offered for sale by Korvin" }, evidence: ["fixture"] } } },
    { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }] });
  const script = { narration: "", commands: [], evidence: [], delay: 0 };
  const service = new RetrievalService(world);
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() {
    if (script.delay) await new Promise(resolve => setTimeout(resolve, script.delay));
    const text = script.narration; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } };
  } };
  const controller = { async propose() { return { commands: [...script.commands], ...(script.evidence.length ? { evidence: [...script.evidence] } : {}), ...metadata }; } };
  const dir = await mkdtemp(join(tmpdir(), "react-browser-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
  const deps = { world, repository, createCoordinator: () => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const { session } = await GameSession.loadCampaign(deps, "react_browser");
  const server = createPlaytestServer(session, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const { page, problems, requests, bodies } = await openPage(`${base}/app/`);
  const gold = async () => (await page.getByTestId("player-gold").innerText()).trim();
  const turnPosts = () => requests.filter(r => r.path === "/api/turn");

  // A1 boot: the playtest server has no campaigns, so / forwards to /play; landmarks exist
  await textarea(page).waitFor({ timeout: 15000 });
  ok("A1 the React app boots at /app/ and opens the playtest session at /app/play", new URL(page.url()).pathname === "/app/play" && (await page.title()) === "Caldrevan");
  ok("A2 semantic landmarks: banner, main, two complementary panels at 1440px", (await page.getByRole("banner").count()) === 1 && (await page.getByRole("main").count()) === 1 && (await page.getByRole("complementary").count()) === 2);
  ok("A3 the transcript renders the committed history", (await page.locator("[role=log] article").count()) >= 1);
  ok("A4 the player summary shows tracked gold", (await gold()) === "500");
  await page.screenshot({ path: `${SHOTS}/A1-boot-1440.png` });

  // A5 a turn: pending state while the narrator works, exactly one request for a burst of Enter presses, response, focus back
  Object.assign(script, { narration: 'Korvin looks up from his ledger. "Looking to buy?"', commands: [], evidence: [], delay: 900 });
  const articles = await page.locator("[role=log] article").count();
  await textarea(page).fill("Good morning, Korvin.");
  await textarea(page).press("Enter"); await textarea(page).press("Enter"); await textarea(page).press("Enter");
  await page.waitForFunction(() => /Thinking…|Narrating…|Resolving…/.test(document.querySelector("form[aria-label='Your action'] [role=status]")?.textContent ?? ""), null, { timeout: 5000 });
  const pendingVisible = await page.getByText(/^(Thinking|Narrating|Resolving)…$/).first().isVisible();
  const sendBusy = await page.getByRole("button", { name: "Sending…" }).isDisabled();
  await page.screenshot({ path: `${SHOTS}/A2-pending.png` });
  ok("A5 pending state is shown (status word, disabled Send) while the turn runs", pendingVisible && sendBusy);
  await page.waitForFunction(n => document.querySelectorAll("[role=log] article").length >= n + 2, articles, { timeout: 20000 }); await idle(page);
  ok("A6 a burst of Enter presses sends exactly one turn request", turnPosts().length === 1, `${turnPosts().length} requests`);
  ok("A7 the committed response appears in the transcript", (await page.locator("[role=log]").innerText()).includes("Looking to buy?"));
  ok("A8 focus returns to the composer after the turn", await textarea(page).evaluate(el => document.activeElement === el));
  const turnBody = JSON.parse(turnPosts()[0].body);
  ok("A9 the turn request carries only text, turn key and the rendered revision", Object.keys(turnBody).sort().join() === "expected_revision,text,turn_key");
  script.delay = 0;

  // A10-A13 Actual Offer BUY: render, accept, receipt, gold from the settlement
  const line = n => ({ name: n, description: `A ${n.toLowerCase()} of fair make.`, visual_description: `a ${n.toLowerCase()}, plain and serviceable` });
  const korvin = { kind: "character", character_id: "korvin" };
  Object.assign(script, { narration: 'Korvin lifts a halberd from the rack. "Fifteen gold for the halberd."', commands: [{ kind: "propose_trade_offer", direction: "buy", price_gold: 15, counterparty: korvin, subject: { kind: "goods", lines: [line("Halberd")] } }], evidence: ["Fifteen gold for the halberd."] });
  await say(page, "Korvin, how much for the halberd?");
  const buyCard = page.getByRole("region", { name: "Buy offer" });
  await buyCard.waitFor({ timeout: 10000 });
  const buyText = (await buyCard.innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: `${SHOTS}/A3-offer.png` });
  ok("A10 the Actual Offer renders inline (▼ BUY, Halberd, 15 gold)", /▼ BUY/.test(buyText) && /Halberd/.test(buyText) && /15 gold/.test(buyText));
  ok("A11 nothing settles before the click", (await gold()) === "500");
  await buyCard.getByRole("button", { name: /^Accept offer/ }).click();
  await page.getByText("Bought Halberd for 15 gold.").waitFor({ timeout: 10000 });
  const accepts = requests.filter(r => r.path === "/api/trade/accept");
  ok("A12 Accept settles once and sends only the offer ref and the revision", accepts.length === 1 && Object.keys(JSON.parse(accepts[0].body)).sort().join() === "expected_revision,ref");
  ok("A13 gold updates from the settlement (500 -> 485) without a reload", (await gold()) === "485" && (await buyCard.count()) === 0);

  // A14-A16 person offer: masked label, no hidden identity anywhere; the bought person stays a masked Campaign NPC row (here pre-registered; phase C covers materialization)
  Object.assign(script, { narration: 'Korvin taps the cage. "Five." He glances at the woman behind the bars. "Papers included. Clean transfer, no liens."', commands: [], evidence: [] });
  await say(page, "*looks at the woman in the cage* Korvin, what about her?");
  const personCard = page.getByRole("region", { name: "Buy offer" });
  await personCard.waitFor({ timeout: 10000 });
  const personText = (await personCard.innerText()).replace(/\s+/g, " ");
  ok("A14 a person offer is marked and masked (♟ Person, Red-haired Slave, 5 gold)", /♟ Person/.test(personText) && /Red-haired Slave/.test(personText) && /5 gold/.test(personText), personText);
  const html = await page.content();
  ok("A15 the hidden name and internal ids appear nowhere in the page or the API responses", !/Brenna|campaign_character_brenna/i.test(html) && !bodies.some(b => /Brenna|campaign_character_brenna/i.test(b)));
  await personCard.getByRole("button", { name: /^Accept offer/ }).click();
  await page.getByText(/^✓ Bought .* for 5 gold\.$/).waitFor({ timeout: 10000 });
  const people = await page.getByRole("complementary", { name: "People" }).innerText();
  ok("A16 after the person settlement: 480 gold; the person is listed as a masked Campaign NPC", (await gold()) === "480" && /Slave/.test(people) && /Met this campaign/.test(people) && !/Brenna/i.test(await page.content()), JSON.stringify({ gold: await gold(), people }));
  await page.screenshot({ path: `${SHOTS}/A4-person-settled.png` });

  // A17 stale revision: the campaign moves on behind the page; the next turn is refused before any provider call, the page refreshes and keeps the draft
  const profile = session.getPlayerProfileView();
  const moved = session.updatePlayerProfile({ expected_revision: session.getView().session.revision, patch: { build: profile?.fields.find(f => f.key === "build")?.value === "lean" ? "wiry" : "lean" } });
  Object.assign(script, { narration: "Korvin counts the coins twice.", commands: [], evidence: [] });
  await textarea(page).fill("I wait for the papers.");
  await textarea(page).press("Enter");
  await page.getByText(/The story changed since you last looked/).waitFor({ timeout: 10000 });
  ok("A17 a stale turn is explained and the draft is kept for a resend", moved.ok && (await textarea(page).inputValue()) === "I wait for the papers.");
  await textarea(page).press("Enter");
  await page.getByText("Korvin counts the coins twice.").waitFor({ timeout: 15000 });
  ok("A18 the resend at the refreshed revision succeeds", (await textarea(page).inputValue()) === "");

  // A19 character drawer: keyboard open, Escape closes, focus returns to the opener
  const korvinRow = page.getByRole("complementary", { name: "People" }).getByRole("button", { name: /Korvin/ });
  await korvinRow.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Korvin" });
  await dialog.waitFor({ timeout: 5000 });
  const focusInside = await dialog.evaluate(el => el.contains(document.activeElement));
  await page.screenshot({ path: `${SHOTS}/A5-drawer.png` });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  ok("A19 the character drawer opens from the keyboard, traps focus, closes on Escape and returns focus", focusInside && await korvinRow.evaluate(el => document.activeElement === el));

  // A20 responsive foundation: no horizontal overflow at 1440 / 1024 / 390; panels collapse into drawers
  const layout = {};
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 860 });
    await page.waitForTimeout(150);
    layout[width] = { overflow: !(await noOverflow(page)), asides: await page.getByRole("complementary").count() };
    await page.screenshot({ path: `${SHOTS}/A6-layout-${width}.png` });
  }
  await page.getByRole("button", { name: "People" }).click();
  const peopleDrawer = await page.getByRole("dialog", { name: "People" }).isVisible();
  await page.keyboard.press("Escape");
  ok("A20 no horizontal overflow at 1440/1024/390; 3, 2 and 1 columns; side panels open as drawers on small screens",
    !layout[1440].overflow && !layout[1024].overflow && !layout[390].overflow && layout[1440].asides === 2 && layout[1024].asides === 1 && layout[390].asides === 0 && peopleDrawer, JSON.stringify(layout));
  ok("A21 no console errors and no uncaught errors or unhandled rejections", problems.length === 0, problems.join(" | "));
  const legacy = await (await fetch(`${base}/`)).text();
  ok("A22 the legacy UI is still served at /", /client\.js/.test(legacy));
  await page.close();
  await session.shutdown({ discard_unsaved: true });
}

// ===================================================================== B. a pending confirmation, reached and confirmed with the keyboard only
{
  const MAREN = "campaign_character_maren";
  const maren = { kind: "register_character", character: { id: MAREN, origin: { kind: "created" }, profile: { name: "Maren", age: { kind: "exact", years: 19 } }, current: { current_location: "test_room", status: "active" } } };
  const dir = await mkdtemp(join(tmpdir(), "react-browser-confirm-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const narrator = stepNarrator([{ text: "Maren goes very still, searching Nicco's face for the catch." }]);
  const controller = countingController([]);
  const s = sessionWith(narrator, controller, { save_dir: dir, autosave: false, setup: c => c.apply({ expected_revision: c.revision, commands: [maren, { kind: "set_legal_status", character_id: MAREN, status: "enslaved", holder_id: "nicco" }] }) });
  const server = createPlaytestServer(s.session, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  const legal = () => s.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === MAREN);
  const { page, problems, requests } = await openPage(`http://127.0.0.1:${server.address().port}/app/play`);
  await textarea(page).waitFor({ timeout: 15000 });
  await say(page, "I hereby free you, Maren.");
  const card = page.getByRole("group", { name: /Free Maren\?/ });
  await card.waitFor({ timeout: 10000 });
  ok("B1 the engine's confirmation card renders inline and nothing has changed yet", legal()?.status === "enslaved");
  await textarea(page).focus();
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press("Shift+Tab");
    reached = await page.evaluate(() => /^Confirm: /.test(document.activeElement?.getAttribute("aria-label") ?? ""));
  }
  ok("B2 the Confirm button is reachable from the composer with the keyboard alone", reached);
  await page.screenshot({ path: `${SHOTS}/B1-confirmation-focus.png` });
  await page.keyboard.press("Enter");
  await card.waitFor({ state: "detached", timeout: 10000 });
  await page.getByText(/Maren: .*Confirmed/).waitFor({ timeout: 5000 }).catch(() => undefined);
  const posts = requests.filter(r => r.path.startsWith("/api/confirmation/"));
  ok("B3 Enter confirms once (ref + revision only); the engine frees Maren and a notice remains", legal()?.status === "free" && posts.length === 1 && posts[0].path === "/api/confirmation/confirm" && Object.keys(JSON.parse(posts[0].body)).sort().join() === "expected_revision,ref" && (await page.getByText(/Maren: /).count()) >= 1);
  ok("B4 no console errors and no uncaught errors or unhandled rejections", problems.length === 0, problems.join(" | "));
  await page.close();
  await s.session.shutdown({ discard_unsaved: true });
}

// ===================================================================== C. person Accept materializes the narrated person as ONE Campaign NPC (block 5B flow, through React)
{
  const world = await loadWorld(DATA);
  const MARKET = "calderan_slave_market";
  const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };
  const c = createOpeningCampaign(world, "react_browser_c");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin")] });
  const script = { narration: "" }, service = new RetrievalService(world);
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() { const text = script.narration; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  const dir = await mkdtemp(join(tmpdir(), "react-browser-c-")); cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
  const deps = { world, repository, createCoordinator: () => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const session = GameSession.fromCampaign(deps, c);
  const server = createPlaytestServer(session, undefined, undefined, undefined, { reactDir: REACT_DIR }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  cleanups.push(() => { server.closeAllConnections(); server.close(); });
  const created = () => c.exportSnapshot().characters.filter(x => x.origin.kind === "created");
  const { page, problems } = await openPage(`http://127.0.0.1:${server.address().port}/app/play`);
  await textarea(page).waitFor({ timeout: 15000 });
  const scene = () => page.getByRole("complementary", { name: "People" }).getByRole("region", { name: "In the scene" });
  const sceneButtons = () => scene().locator("button[aria-haspopup='dialog']").count();
  const temporary = () => scene().getByRole("group", { name: "Temporary" }).getByRole("button", { name: /^Keep track of / }).count();
  script.narration = 'Korvin leads Nicco past the canvas partition to the last cage.\n"Brenna. Thirty-two. A river hauler before the debt caught up," Korvin says.\nBrenna coughs behind the bars, feverish, and does not lift her head.';
  await say(page, "*checks the cages*");
  const rowsBefore = await sceneButtons(), temporaryBefore = await temporary();
  ok("C1 a narrated person is not a Campaign NPC (no persistent character, no card row)", created().length === 0 && !(await page.getByRole("complementary", { name: "People" }).getByRole("button", { name: /^Brenna/ }).count()));
  script.narration = `Korvin taps his ledger. "Five. She's a burden I paid four for." He holds the pen over the page. "Papers included. Clean transfer, debt-forfeiture chain, no liens. You walk her out that gate, she's yours."\nBrenna does not open her eyes.`;
  await say(page, "Name your price, Korvin.");
  const card = page.getByRole("region", { name: "Buy offer" });
  await card.waitFor({ timeout: 10000 });
  ok("C2 the person offer renders; still no persistent character before Accept", created().length === 0 && /♟ Person/.test(await card.innerText()));
  await card.getByRole("button", { name: /^Accept offer/ }).click();
  await page.getByText(/^✓ Bought .* for 5 gold\.$/).waitFor({ timeout: 10000 });
  await page.waitForFunction(n => document.querySelectorAll("aside[aria-label='People'] button[aria-haspopup='dialog']").length > n, rowsBefore, { timeout: 10000 }).catch(() => undefined);
  ok("C3 Accept materializes exactly one Campaign NPC: a new character row replaces the temporary entry", created().length === 1 && (await sceneButtons()) === rowsBefore + 1 && (await temporary()) === temporaryBefore - 1,
    JSON.stringify({ created: created().length, rowsBefore, rows: await sceneButtons(), temporaryBefore, temporary: await temporary(), scene: await scene().innerText() }));
  await page.screenshot({ path: `${SHOTS}/C1-materialized.png` });
  ok("C4 no console errors and no uncaught errors or unhandled rejections", problems.length === 0, problems.join(" | "));
  await page.close();
  await session.shutdown({ discard_unsaved: true });
}

await browser.close();
for (const cleanup of cleanups.reverse()) await cleanup();
const fails = results.filter(r => r[0] === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
process.exit(fails.length ? 1 : 0);
