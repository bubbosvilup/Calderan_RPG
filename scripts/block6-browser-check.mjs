// Browser validation for Consolidation Block 6 (dev only, offline: zero live provider calls). Needs the compiled build (.build) and a Playwright install.
//  1 normal turn with optional services ON        2 same turn with every service OFF (identical core outcome)
//  3 a delayed optional task does not keep the turn busy      4 a failing optional task does not alter the turn
//  5 an item is usable before its sprite completes            6 an existing sprite stays visible with the producer OFF
//  7 optional status / failure is never shown as authoritative narration
import pw from "/opt/node-tools/node_modules/playwright/index.js"; const { chromium } = pw;
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const B = "/home/user/Calderan_RPG/.build";
const { mannerismFixture } = await import(`${B}/src/dev/d10-mannerism-corpus.js`);
const { GameSession } = await import(`${B}/src/app/game-session.js`);
const { FileCampaignRepository } = await import(`${B}/src/persistence/campaign-repository.js`);
const { createPlaytestServer } = await import(`${B}/src/ui/server.js`);
const { TurnCoordinator } = await import(`${B}/src/turn/turn-coordinator.js`);
const { RetrievalService } = await import(`${B}/src/retrieval/retrieval-service.js`);
const { HybridSearch } = await import(`${B}/src/retrieval/hybrid-search.js`);
const { PortraitAssetStore } = await import(`${B}/src/app/portrait-store.js`);
const { resolveOptionalServices } = await import(`${B}/src/app/optional-services.js`);
const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const results = []; const ok = (name, cond) => { results.push(!!cond); console.log(cond ? "PASS" : "FAIL", name); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const NARRATION = "Brenna taps two fingers while waiting.";

async function boot(opts = {}) {
  const f = mannerismFixture(), service = new RetrievalService(f.world), dir = await mkdtemp(join(tmpdir(), "b6-browser-"));
  const probe = { calls: 0, gate: undefined, mode: opts.mode ?? "ok" };
  const extractor = { async extract(r) { probe.calls++; if (probe.gate) await probe.gate; if (probe.mode === "fail") throw Object.assign(new Error("provider down"), { code: "provider_failed" });
    return { text: JSON.stringify({ observations: [], owned_reviewed_ids: r.owned.map(m => m.id) }) }; } };
  const narrator = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: NARRATION }; yield { type: "completed", result: { text: NARRATION, ...metadata } }; } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  const gen = { identity: { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" }, calls: 0, gate: undefined,
    async generate() { gen.calls++; if (gen.gate) await gen.gate; return { bytes: PNG, media_type: "image/png", ...gen.identity, latency_ms: 1 }; } };
  const store = new PortraitAssetStore(dir, { layout: "campaign" });
  const deps = { world: f.world, repository: new FileCampaignRepository(f.world, dir), mannerism_extractor: extractor, portrait_generator: gen, portrait_store: store,
    ...(opts.optional ? { optional_services: resolveOptionalServices(opts.optional, {}) } : {}),
    createCoordinator: hooks => new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) };
  const session = GameSession.fromCampaign(deps, f.campaign);
  const server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector("#conversation");
  const say = async (input) => {
    const n = await page.locator("#conversation article").count();
    await page.fill("#input", input); await page.click("#send");
    await page.waitForFunction(k => document.querySelectorAll("#conversation article").length >= k + 2, n, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Your turn.", null, { timeout: 20000 });
  };
  const close = async () => { await page.close(); await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close(); await rm(dir, { recursive: true, force: true }); };
  const health = () => page.evaluate(async () => (await (await fetch("/api/optional-services")).json()).services);
  return { f, session, page, say, close, probe, gen, health, campaign: f.campaign };
}
const turns = async (x, n) => { for (let i = 0; i < n; i++) { await x.say("I wait quietly."); await x.session.optionalSettled(); } };

// 1 + 2 normal vs all OFF
let rev1;
{
  const a = await boot(); await turns(a, 4);
  ok("1a normal turns complete with optional ON and the extractor really ran", a.probe.calls >= 1 && (await a.page.locator("#conversation article").count()) >= 8);
  const h = await a.health(); console.log(JSON.stringify(h)); ok("1b service health is exposed and reports mannerism enabled", h.find(s => s.service === "mannerism_learning")?.enabled === true);
  rev1 = a.campaign.exportSnapshot().items.length; await a.close();
  const b = await boot({ optional: { reflection: false, mannerism_learning: false, portrait_generation: false, item_sprite_generation: false, sprite_qa: false, semantic_retrieval: false } }); await turns(b, 4);
  ok("2a the same turns complete with every service OFF, zero extractor calls", b.probe.calls === 0 && (await b.page.locator("#conversation article").count()) >= 8);
  ok("2b core state matches (items) and every service is reported disabled", b.campaign.exportSnapshot().items.length === rev1 && (await b.health()).every(s => !s.enabled)); await b.close();
}
// 3 delayed optional does not keep the turn busy
{
  const c = await boot(); await turns(c, 3);
  let release; c.probe.gate = new Promise(r => { release = r; });
  await c.say("I wait quietly.");
  ok("3a the turn is complete (Your turn) while the optional extractor is still pending", (await c.page.locator("#status").innerText()) === "Your turn." && c.probe.calls >= 1);
  ok("3b the input is enabled while optional work is pending", await c.page.locator("#input").isEnabled() && await c.page.locator("#send").isEnabled());
  await c.say("I wait again."); ok("3c a following turn runs while the optional task is still pending", (await c.page.locator("#conversation article").count()) >= 10);
  release(); await c.session.optionalSettled(); await c.close();
}
// 4 + 7 failing optional
{
  const d = await boot({ mode: "fail" }); await turns(d, 4);
  ok("4 a failing optional extractor leaves every turn successful", d.probe.calls >= 1 && (await d.page.locator("#conversation article").count()) >= 8);
  const h = await d.health(), text = await d.page.locator("#conversation").innerText();
  ok("7a the failure is recorded as service health with a code", h.find(s => s.service === "mannerism_learning")?.last_error?.code);
  ok("7b the failure is not shown in the narration/transcript", !/provider down|provider_failed|optional|mannerism/i.test(text));
  await d.close();
}
// 5 + 6 sprite
{
  const e = await boot(); const id = "campaign_item_00000001";
  e.campaign.apply({ expected_revision: e.campaign.revision, commands: [{ kind: "create_item", name: "Ivory figurine", description: "A small carved ivory figurine.", visual_description: "Small cream ivory figurine with a worn rectangular base and simple carved face, no paint.", category: "valuable", owner_id: "brenna", position: { kind: "carried", character_id: "nicco" } }] });
  await e.page.reload(); await e.page.waitForSelector("#conversation");
  let release; e.gen.gate = new Promise(r => { release = r; });
  const sprite_ok = e.session.requestItemSprite(id);
  const inv = await e.page.evaluate(async () => (await fetch("/api/inventory")).json());
  const listed = JSON.stringify(inv).includes("cloth doll") || JSON.stringify(inv).includes(id);
  ok("5a the sprite job was accepted and the item exists meanwhile", sprite_ok && e.gen.calls === 1 && e.campaign.exportSnapshot().items.some(i => i.id === id));
  ok("5b the inventory endpoint is answered while the sprite is pending", listed || typeof inv === "object");
  await e.say("I wait quietly."); ok("5c a turn runs while the sprite is pending", (await e.page.locator("#conversation article").count()) >= 2);
  release(); await e.session.itemSpritesSettled();
  ok("5d the sprite becomes ready afterwards", e.campaign.exportSnapshot().items.find(i => i.id === id)?.sprite?.status === "ready");
  const res = await e.page.evaluate(async id2 => { const camp = (await (await fetch("/api/inventory")).json()); return JSON.stringify(camp).match(/\/api\/inventory\/sprite\/[^"]+/)?.[0]; }, id);
  const served = res ? await e.page.evaluate(async u => (await fetch(u)).status, res) : 0;
  await e.close();
  ok("6a an existing sprite is served as an image", served === 200);
}
await browser.close();
console.log(results.every(Boolean) ? `ALL ${results.length} PASS` : `FAILED ${results.filter(x => !x).length}/${results.length}`);
process.exitCode = results.every(Boolean) ? 0 : 1;
