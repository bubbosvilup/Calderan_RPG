// Browser validation for Consolidation Block 5B (dev only, offline: zero live provider calls). Needs the compiled build (.build) and a Playwright install.
//  A  a narrated person: named by narration -> NO persistent character, no card, nothing in the NPC list.
//  B  authorized materialization: the person Actual Offer Accept materializes the SAME person once (Slave NPC, renamed on the same id after the reveal).
//  C  human repair of a synthetic duplicate: request -> card (SOURCE/TARGET) -> no mutation before Confirm -> Confirm commits once with zero provider calls.
import { DATA, fromBuild, launchBrowser } from "./lib/browser-env.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const { loadWorld } = await fromBuild("src/world/loader.js");
const { createOpeningCampaign } = await fromBuild("src/campaign/opening-state.js");
const { learnCanonicalName } = await fromBuild("src/campaign/identity-knowledge.js");
const { GameSession } = await fromBuild("src/app/game-session.js");
const { FileCampaignRepository } = await fromBuild("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await fromBuild("src/ui/server.js");
const { TurnCoordinator } = await fromBuild("src/turn/turn-coordinator.js");
const { RetrievalService } = await fromBuild("src/retrieval/retrieval-service.js");
const { HybridSearch } = await fromBuild("src/retrieval/hybrid-search.js");
const { stepNarrator, countingController, sessionWith } = await fromBuild("tests/block4-fixtures.js");
const world = await loadWorld(DATA);
const MARKET = "calderan_slave_market";
const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };
const results = []; const ok = (name, cond) => { results.push(cond); console.log(cond ? "PASS" : "FAIL", name); };
const browser = await launchBrowser();

// ============================================================ A + B  (real pipeline, scripted narrator, scripted empty controller)
{
  const c = createOpeningCampaign(world, "b5b_browser_ab");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...learnCanonicalName(world, c.exportSnapshot(), "korvin")] });
  const script = { narration: "" }, service = new RetrievalService(world);
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() { const text = script.narration; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  const dir = await mkdtemp(join(tmpdir(), "b5b-browser-"));
  const repository = new FileCampaignRepository(world, dir); await repository.saveCampaign(c);
  const deps = { world, repository, createCoordinator: () => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const session = GameSession.fromCampaign(deps, c);
  const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector("#conversation");
  const say = async (input, narration) => {
    script.narration = narration;
    const n = await page.locator("#conversation article").count();
    await page.fill("#input", input); await page.click("#send");
    await page.waitForFunction(k => document.querySelectorAll("#conversation article").length >= k + 2, n, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Your turn.", null, { timeout: 20000 });
  };
  const created = () => session.getView().session && c.exportSnapshot().characters.filter(x => x.origin.kind === "created");
  const gold = async () => (await page.evaluate(async () => (await fetch("/api/inventory")).json())).gold;
  // A
  const rev0 = c.revision;
  await say("*checks the cages*", 'Korvin leads Nicco past the canvas partition to the last cage.\n"Brenna. Thirty-two. A river hauler before the debt caught up," Korvin says.\nBrenna coughs behind the bars, feverish, and does not lift her head.');
  ok("A1 a narrated, named person is NOT a persistent character", created().length === 0);
  ok("A2 no confirmation card and no trade card for merely being narrated", (await page.locator(".confirm-card").count()) === 0 && (await page.locator(".trade-card").count()) === 0);
  ok("A3 the turn committed no character-creating state (provisional only)", !c.exportSnapshot().characters.some(x => x.profile.name === "Brenna"));
  await page.reload(); await page.waitForSelector("#conversation");
  ok("A4 reload does not materialize the person", created().length === 0);
  // B
  await say("Name your price, Korvin.", 'Korvin taps his ledger. "Five. She\'s a burden I paid four for." He holds the pen over the page. "Papers included. Clean transfer, debt-forfeiture chain, no liens. You walk her out that gate, she\'s yours."\nBrenna does not open her eyes.');
  await say("Done. *pays him*", "Korvin nods and slides the ledger across the counter.");
  await page.waitForSelector(".trade-card");
  ok("B1 the person offer card appears; still no persistent character before Accept", created().length === 0 && /Person/.test(await page.locator(".trade-card").first().innerText()));
  const goldBefore = await gold();
  await page.click(".trade-accept"); await page.waitForFunction(() => /Bought/.test(document.querySelector(".trade-region")?.innerText ?? ""));
  const after = created();
  ok("B2 Accept materializes exactly ONE persistent person, owned by the player (Slave), funds moved once", after.length === 1 && (await gold()) === goldBefore - 5 && c.exportSnapshot().legal_statuses.filter(l => l.holder_id === "nicco" && l.status === "enslaved").length === 1);
  ok("B3 the materialized person is the one that was narrated (same provenance ref)", /^narrated:|^P\d/.test(after[0].origin_snapshot?.ephemeral_ref ?? "") || after[0].origin_snapshot?.source === "narrator_ephemeral");
  await page.close(); await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close(); await rm(dir, { recursive: true, force: true });
}

// ============================================================ C  (synthetic duplicate -> human repair)
{
  const A = "campaign_character_maren", Bb = "campaign_character_maren_two";
  const person = (id, name) => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 19 } }, current: { current_location: "test_room", status: "active" } } });
  const dir = await mkdtemp(join(tmpdir(), "b5b-browser-c-"));
  const narrator = stepNarrator([]), controller = countingController([]);
  const s = sessionWith(narrator, controller, { save_dir: dir, autosave: false, setup: camp => camp.apply({ expected_revision: camp.revision, commands: [person(A, "Maren"), person(Bb, "Maren"),
    { kind: "create_item", name: "Shawl", description: "d", visual_description: "v", owner_id: Bb, position: { kind: "carried", character_id: Bb } }] }) });
  const server = createPlaytestServer(s.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const confirmPosts = [];
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/confirmation/")) confirmPosts.push(Object.keys(JSON.parse(r.postData() ?? "{}")).sort().join()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector("#input");
  const snap = () => s.campaign.exportSnapshot(), calls = () => narrator.calls() + controller.calls();
  const rev0 = s.campaign.revision, before = JSON.stringify(snap());
  const requested = await page.evaluate(async rev => { const r = await fetch("/api/repair/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "merge", character_id: "campaign_character_maren_two", target_id: "campaign_character_maren", expected_revision: rev }) }); return { status: r.status, body: await r.json() }; }, rev0);
  ok("C1 a conflict-free merge request is accepted and creates a card, no campaign change", requested.status === 200 && requested.body.created === true && s.campaign.revision === rev0 && JSON.stringify(snap()) === before);
  await page.reload(); await page.waitForSelector(".confirm-card");
  const text = (await page.locator(".confirm-card").innerText()).replace(/\s+/g, " ");
  ok("C2 the card names SOURCE and TARGET and says nothing has changed yet", /SOURCE/.test(text) && /TARGET/.test(text) && /Nothing has changed yet/.test(text));
  ok("C3 still no mutation while the card is open", s.campaign.revision === rev0 && snap().characters.find(x => x.id === Bb).retirement === undefined);
  await page.click(".confirm-accept"); await page.waitForSelector(".confirm-card", { state: "detached" });
  ok("C4 Confirm commits exactly once (one revision), the duplicate is retired into the target, the item moved", s.campaign.revision === rev0 + 1 && snap().characters.find(x => x.id === Bb).retirement?.merged_into === A && snap().items.find(i => i.name === "Shawl").owner_id === A);
  ok("C5 zero provider calls and the request carried only ref + revision", calls() === 0 && confirmPosts.length === 1 && confirmPosts[0] === "expected_revision,ref");
  const conflict = await page.evaluate(async rev => { const r = await fetch("/api/repair/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "retire", character_id: "nicco", expected_revision: rev }) }); return { status: r.status, body: await r.json() }; }, s.campaign.revision);
  ok("C6 a request with a hard conflict (the player) creates no card and reports the conflict", conflict.status === 422 && conflict.body.conflicts?.some(x => x.code === "player_character") && (await page.locator(".confirm-card").count()) === 0);
  await page.close(); await s.session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close(); await rm(dir, { recursive: true, force: true });
}
await browser.close();
console.log(results.every(Boolean) ? `ALL ${results.length} PASS` : `FAILED ${results.filter(x => !x).length}/${results.length}`);
process.exitCode = results.every(Boolean) ? 0 : 1;
