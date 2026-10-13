// Browser validation for Actual Offer V1 (dev only, offline: zero live provider calls). Needs the compiled build (.build) and a Playwright install; paths come from scripts/lib/browser-env.mjs.
// The REAL turn pipeline runs behind the UI with a scripted Narrator and a scripted Controller, so every offer here is created exactly as in play; settlement happens only on a browser click.
// Screenshots land in artifacts/local/browser/actual-offer/ (gitignored).
import { DATA, fromBuild, launchBrowser, shotsDir } from "./lib/browser-env.mjs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const { loadWorld } = await fromBuild("src/world/loader.js");
const { createOpeningCampaign } = await fromBuild("src/campaign/opening-state.js");
const { learnCanonicalName } = await fromBuild("src/campaign/identity-knowledge.js");
const { GameSession } = await fromBuild("src/app/game-session.js");
const { FileCampaignRepository } = await fromBuild("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await fromBuild("src/ui/server.js");
const { TurnCoordinator } = await fromBuild("src/turn/coordinator/turn-coordinator.js");
const { RetrievalService } = await fromBuild("src/retrieval/retrieval-service.js");
const { HybridSearch } = await fromBuild("src/retrieval/hybrid-search.js");
const world = await loadWorld(DATA);
const MARKET = "calderan_slave_market", BRENNA = "campaign_character_brenna";
const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };

// ---- fixture: the slave market, Korvin present and known, Nicco carries an Old Rusty Sword, and a red-haired enslaved woman whose name is not yet known.
const c = createOpeningCampaign(world, "browser_offer");
c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin"),
  { kind: "create_item", name: "Old Rusty Sword", description: "A pitted blade.", visual_description: "an old rusty sword", category: "weapon", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } },
  { kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: {}, current: { current_location: MARKET, status: "active" },
    origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase_unnamed_subject", label: "the woman", promoted_revision: c.revision + 1, promoted_world_minute: 0, location_id: MARKET,
      established: { descriptor: "woman", appearance: ["red-haired"], role: "enslaved; offered for sale by Korvin" }, evidence: ["fixture"] } } },
  { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }] });

// ---- scripted narrator and controller driven from this script
const script = { narration: "", commands: [], evidence: [] };
const service = new RetrievalService(world);
const narrator = { async generate() { throw new Error("unused"); }, async *stream() { const text = script.narration; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
const controller = { async propose() { return { commands: [...script.commands], ...(script.evidence.length ? { evidence: [...script.evidence] } : {}), ...metadata }; } };
const dir = await mkdtemp(join(tmpdir(), "browser-offer-"));
const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
const deps = { world, repository, createCoordinator: () => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false }) };
const loaded = await GameSession.loadCampaign(deps, "browser_offer");
const session = loaded.session;
const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/`;

const SHOTS = await shotsDir("actual-offer");
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const results = []; const ok = (name, cond) => { results.push([cond ? "PASS" : "FAIL", name]); console.log(cond ? "PASS" : "FAIL", name); };
let navigations = 0; page.on("framenavigated", f => { if (f === page.mainFrame()) navigations++; });
page.on("response", async r => { if (r.url().endsWith("/api/trade/accept")) console.log("ACCEPT", r.status(), (await r.text()).slice(0, 300)); });
const acceptPosts = []; page.on("request", r => { if (r.method() === "POST" && r.url().endsWith("/api/trade/accept")) acceptPosts.push(JSON.parse(r.postData() ?? "{}")); });
const bodies = []; page.on("response", async r => { if (r.url().includes("/api/session") || r.url().includes("/api/turn") || r.url().includes("/api/trade")) { try { bodies.push(await r.text()); } catch { /* streamed */ } } });
await page.goto(url); await page.waitForSelector("#conversation");

const inventory = async () => page.evaluate(async () => (await fetch("/api/inventory")).json());
const gold = async () => (await inventory()).gold;
const names = async () => (await inventory()).items.map(i => i.name);
/** One real turn through the composer: the scripted narrator answers; the scripted controller proposes. */
async function say(input, narration, commands = [], evidence = []) {
  Object.assign(script, { narration, commands, evidence });
  const articles = await page.locator("#conversation article").count();
  await page.fill("#input", input); await page.click("#send");
  await page.waitForFunction(n => document.querySelectorAll("#conversation article").length >= n + 2, articles, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Your turn.", null, { timeout: 20000 });
}
const card = () => page.locator(".trade-card");
const cardText = async () => (await card().count()) ? (await card().first().innerText()).replace(/\s+/g, " ") : "";
const line = n => ({ name: n, description: `A ${n.toLowerCase()} of fair make.`, visual_description: `a ${n.toLowerCase()}, plain and serviceable` });
const korvin = { kind: "character", character_id: "korvin" };
const buy = (price, name) => ({ kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty: korvin, subject: { kind: "goods", lines: [line(name)] } });
const HALBERD = price => `Korvin lifts a halberd from the weapon rack and sets it on the counter. "${price} gold for the halberd."`;

// ============================================================ A. BUY Halberd 15g
await say("Korvin, how much for the halberd?", HALBERD("Fifteen"), [buy(15, "Halberd")], ["Fifteen gold for the halberd."]);
await page.waitForSelector(".trade-card");
await page.screenshot({ path: `${SHOTS}/offer-A1-buy-card.png` });
ok("A1 a BUY card appears inline after the Narrator response", /▼ BUY/.test(await cardText()) && /Halberd/.test(await cardText()) && /15 gold/.test(await cardText()));
ok("A2 no money moved and no item exists before the click", (await gold()) === 500 && !(await names()).includes("Halberd"));
await say("Deal. *pays him fifteen gold*", "Korvin pockets nothing yet, tapping the counter and waiting for the coins.");
ok("A3 typing 'Deal' / '*pays*' settles nothing", (await gold()) === 500 && !(await names()).includes("Halberd") && (await card().count()) === 1);
const nav0 = navigations;
await page.click(".trade-accept");
await page.waitForFunction(() => document.querySelector(".trade-receipt"));
await page.screenshot({ path: `${SHOTS}/offer-A2-receipt.png` });
ok("A4 funds decrease by exactly 15", (await gold()) === 485);
ok("A5 the Halberd is in the Inventory (carried, one item)", (await names()).filter(n => n === "Halberd").length === 1);
ok("A6 no page reload", navigations === nav0 && (await card().count()) === 0 && /Bought Halberd for 15 gold/.test(await page.locator(".trade-region").innerText()));
ok("A7 the request carried only the offer ref and the revision", acceptPosts.length === 1 && Object.keys(acceptPosts[0]).sort().join() === "expected_revision,ref");

// ============================================================ B. SELL Old Rusty Sword 5g
const sword = { kind: "propose_trade_offer", direction: "sell", price_gold: 5, counterparty: korvin, subject: { kind: "items", item_ids: [(await inventory()).items.find(i => i.name === "Old Rusty Sword").id] } };
await say("*offers the old sword* Would you buy this?", `Korvin turns the Old Rusty Sword over in his hands. "Five gold for it, no more."`, [sword], ["Five gold for it, no more."]);
await page.waitForSelector(".trade-card");
await page.screenshot({ path: `${SHOTS}/offer-B1-sell-card.png` });
ok("B1 a SELL card (▲ SELL, distinct from BUY by text and icon)", /▲ SELL/.test(await cardText()) && !/▼ BUY/.test(await cardText()) && /Old Rusty Sword/.test(await cardText()));
ok("B2 nothing sold before the click", (await names()).includes("Old Rusty Sword") && (await gold()) === 485);
await page.click(".trade-accept"); await page.waitForFunction(() => /Sold Old Rusty Sword/.test(document.querySelector(".trade-region")?.innerText ?? ""));
ok("B3 the sword leaves the Inventory and 5 gold are credited", !(await names()).includes("Old Rusty Sword") && (await gold()) === 490);
ok("B4 unrelated items untouched (Halberd and the documents remain)", (await names()).includes("Halberd") && (await names()).length >= 3);

// ============================================================ C. unknown-name person
const quote = 'Korvin taps the cage. "Five." He glances at the woman behind the bars. "Papers included. Clean transfer, no liens."';
await say("*looks at the woman in the cage* Korvin, what about her?", quote);
await page.waitForSelector(".trade-card");
const personCard = await cardText();
await page.screenshot({ path: `${SHOTS}/offer-C1-person-card.png` });
ok("C1 a person offer shows 'Slave' with only a safe visible descriptor (Red-haired Slave)", /♟ Person/.test(personCard) && /Red-haired Slave/.test(personCard) && /5 gold/.test(personCard));
const pageText = await page.evaluate(() => document.body.innerText + document.documentElement.innerHTML);
ok("C2 the hidden name, ids and avatar tokens appear nowhere in the page or in any state/stream the browser received", !/Brenna/i.test(pageText) && !bodies.some(b => /Brenna/i.test(b) || /campaign_character_brenna/.test(b)) && !/canon-avatar|avatar/i.test(personCard));
const ref0 = await card().first().getAttribute("data-trade-ref");

// ============================================================ D. legitimate name reveal re-renders the SAME offer
await say("What is your name?", 'The woman lifts her head from the straw. "My name is Brenna," she whispers.');
await page.waitForFunction(() => /Brenna/.test(document.querySelector(".trade-card")?.innerText ?? ""));
await page.screenshot({ path: `${SHOTS}/offer-D1-revealed.png` });
const revealed = await cardText();
ok("D1 after the reveal the same offer re-renders as Brenna", /Brenna/.test(revealed) && !/Slave/.test(revealed));
ok("D2 same offer ref, no second card, no alias", (await card().count()) === 1 && (await card().first().getAttribute("data-trade-ref")) === ref0);
const before = session.getView().session.revision;
await page.click(".trade-accept"); await page.waitForFunction(() => /Bought Brenna/.test(document.querySelector(".trade-region")?.innerText ?? ""));
ok("D3 accepting the person offer runs the existing settlement once (5 gold, one revision for the settlement)", (await gold()) === 485 && session.getView().session.revision >= before + 1);

// ============================================================ E. 20 gold -> 15 gold, old offer not acceptable
await say("And the shield?", `Korvin hefts a round shield. "Twenty gold for the shield."`, [buy(20, "Shield")], ["Twenty gold for the shield."]);
await page.waitForSelector(".trade-card");
const oldRef = await card().first().getAttribute("data-trade-ref");
ok("E1 the first quote (20 gold) is the standing offer", /20 gold/.test(await cardText()));
await say("Fifteen.", `Korvin sighs. "Fifteen gold for the shield, final."`, [buy(15, "Shield")], ["Fifteen gold for the shield, final."]);
await page.waitForFunction(() => /15 gold/.test(document.querySelector(".trade-card")?.innerText ?? ""));
await page.screenshot({ path: `${SHOTS}/offer-E1-superseded.png` });
ok("E2 the new quote (15 gold) replaces the card; there is a single card and no Counteroffer button", (await card().count()) === 1 && !/counter/i.test(await page.locator(".trade-region").innerText()) && (await page.getByRole("button", { name: /counter/i }).count()) === 0);
const stale = await page.evaluate(async ref => { const s = await (await fetch("/api/session")).json(); const r = await fetch("/api/trade/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, expected_revision: s.revision }) }); return { status: r.status, body: await r.json() }; }, oldRef);
ok("E3 the old 20-gold offer is not acceptable (rejected, nothing settles)", stale.status === 422 && stale.body.ok === false && (await gold()) === 485 && !(await names()).includes("Shield"));
await page.click(".trade-accept"); await page.waitForFunction(() => /Bought Shield for 15 gold/.test(document.querySelector(".trade-region")?.innerText ?? ""));
ok("E4 only the standing offer settles, once, at 15 gold", (await gold()) === 470 && (await names()).filter(n => n === "Shield").length === 1);

// ============================================================ F. insufficient funds shows inline and leaves the offer
await page.evaluate(() => 0);
await say("The helm?", `Korvin lifts a steel helm. "Nine hundred gold for the helm."`, [buy(900, "Steel Helm")], ["Nine hundred gold for the helm."]);
await page.waitForSelector(".trade-card");
ok("F1 an unaffordable BUY disables Accept and explains the purse", (await page.locator(".trade-accept").isDisabled()) && /Not enough gold/.test(await cardText()));
await page.screenshot({ path: `${SHOTS}/offer-F1-insufficient.png` });

await browser.close(); server.close();
const fails = results.filter(r => r[0] === "FAIL"); console.log(`\n${results.length - fails.length}/${results.length} checks passed`); process.exit(fails.length ? 1 : 0);
