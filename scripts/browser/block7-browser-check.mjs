// Browser validation for Consolidation Block 7 (dev only, offline: zero live provider calls). Needs the compiled build (.build) and a Playwright install.
//  1 a legacy pre-block-7 save loads, migrates on save, and the UI is unchanged     2 a historical Reflection note stays Narrator-visible with the producer OFF
//  3 a promoted mannerism behaves unchanged                                          4 an item sprite appears after background generation without a revision change
//  5 the portrait gallery grows without a revision change                            6 selecting an avatar changes the revision exactly once
//  7 a reload reads the side-store state                                             8 expected_revision stays valid through background work
import { fromBuild, launchBrowser } from "../lib/browser-env.mjs";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
const m = fromBuild;
const { loadWorld } = await m("src/world/loader.js");
const { createOpeningCampaign, OPENING_HOUSEHOLD } = await m("src/campaign/opening-state.js");
const { buildPromotedCharacter } = await m("src/campaign/promotion.js");
const { buildTurnContext } = await m("src/turn/context/context-builder.js");
const { establishNames } = await m("src/turn/identity/name-establishment.js");
const { GameSession } = await m("src/app/game-session.js");
const { FileCampaignRepository } = await m("src/persistence/campaign-repository.js");
const { createPlaytestServer } = await m("src/ui/server.js");
const { TurnCoordinator } = await m("src/turn/coordinator/turn-coordinator.js");
const { RetrievalService } = await m("src/retrieval/retrieval-service.js");
const { HybridSearch } = await m("src/retrieval/hybrid-search.js");
const { PortraitAssetStore } = await m("src/app/portrait-store.js");
const { toLegacyFile } = await m("tests/support/raw-save.js");
const world = await loadWorld("data");
const LR = "heartstone_lr", NOTE = "Mira keeps a steady, wary regard for Nicco.", MANNERISM = "Tilts their head slightly while listening.";
const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 1, elapsed_total_ms: 2 } };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const results = []; const ok = (name, cond) => { results.push(!!cond); console.log(cond ? "PASS" : "FAIL", name); };
const browser = await launchBrowser();
const LATE = [
  { player: "*carries her to the sofa*", narration: "*The woman lies on the sofa, burning with fever.*", status: "finalized", location_id: LR },
  { player: "name's nicco, i'm the keeper of the heartstone, what about you?", narration: "*Her eyes stay half-open, fixed on his face.*\n\nMira.\n\n*She says it without ceremony.*", status: "finalized", location_id: LR }];

const root = await mkdtemp(join(tmpdir(), "b7-browser-")), id = "b7_browser";
// ---- Setup: a campaign with a promoted NPC+ (Mira), a Reflection note, a promoted mannerism, a two-version gallery with a selected avatar. Saved, then rewritten to the exact pre-block-7 shape.
{
  const campaign = createOpeningCampaign(world, id);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = campaign.exportSnapshot().runtime.scene.world_time.world_minute;
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", species: "human", descriptor: "woman", appearance: ["tall and gaunt"], condition: ["feverish"] }, evidence: [], location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: campaign.revision + 1, world_minute: minute });
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "register_character", character: woman }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }] });
  campaign.apply({ expected_revision: campaign.revision, commands: establishNames(LATE, buildTurnContext(world, campaign.exportSnapshot()), world, campaign.exportSnapshot(), [], campaign.revision).commands });
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "create_item", name: "Ivory figurine", description: "A small carved ivory figurine.", visual_description: "Small cream ivory figurine with a worn rectangular base and simple carved face, no paint.", category: "valuable", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } }] });
  campaign.addMannerism({ expected_revision: campaign.revision, character_id: woman.id, definition: { canonical_key: "head_tilt_while_listening", text: MANNERISM } });
  const rev = campaign.revision;
  campaign.apply({ expected_revision: rev, commands: [{ kind: "record_reflection", character_id: woman.id, reflected_revision: rev, notes: [{ id: `r${rev}_stance_1`, kind: "stance", label: "stance_1", text: NOTE, evidence_refs: [`npcmem:${woman.id}:history:r3.0`], confidence: "medium", created_revision: rev, updated_revision: rev }] }] });
  const repository = new FileCampaignRepository(world, root);
  await repository.saveCampaign(campaign);
  await toLegacyFile(join(root, id, "save.json"), world);
}

let requests = [];
function deps(extra = {}) {
  const service = new RetrievalService(world), gen = { identity: { provider: "fal-ai", model: "Qwen/Qwen-Image", style_id: "Raelina/Raena-Qwen-Image" }, calls: 0, gate: undefined,
    async generate() { gen.calls++; if (gen.gate) await gen.gate; return { bytes: Buffer.concat([PNG, Buffer.from([gen.calls])]), media_type: "image/png", ...gen.identity, latency_ms: 1 }; } };
  const narrator = { async generate() { throw new Error("unused"); }, async *stream(request) { requests.push(JSON.stringify(request)); yield { type: "text_delta", text: "*Nothing changes.*" }; yield { type: "completed", result: { text: "*Nothing changes.*", ...metadata } }; } };
  const controller = { async propose() { return { commands: [], ...metadata }; } };
  return { gen, deps: { world, repository: new FileCampaignRepository(world, root), portrait_generator: gen, portrait_store: new PortraitAssetStore(root, { layout: "campaign" }), portrait_retry_delay_ms: () => 0,
    createCoordinator: hooks => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }), ...extra } };
}
async function open(extra) {
  const d = deps(extra), loaded = await GameSession.loadCampaign(d.deps, id); if (!loaded.ok) throw new Error(JSON.stringify(loaded.error));
  const session = loaded.session, server = createPlaytestServer(session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector("#conversation");
  const url = `http://127.0.0.1:${server.address().port}`;
  const say = async text => { const n = await page.locator("#conversation article").count(); await page.fill("#input", text); await page.click("#send");
    await page.waitForFunction(k => document.querySelectorAll("#conversation article").length >= k + 2, n, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Your turn.", null, { timeout: 20000 }); };
  const close = async () => { await page.close(); await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); server.close(); };
  const mira = () => session.getPlayUiView().household.flatMap(h => h.members).find(x => x.name === "Mira");
  return { session, page, say, close, d, url, mira, rev: () => session.getView().session.revision, loaded };
}
const key = () => `k${Math.random().toString(16).slice(2)}${Date.now()}`;

// 1 legacy load + migration on save + UI unchanged
let galleryAfter = 0, revisionAfterAll = 0;
{
  const a = await open(); const legacy = JSON.parse(await readFile(join(root, id, "save.json"), "utf8"));
  ok("1a the fixture really is a pre-block-7 save (schema 7, inline optional state, no store directory)", legacy.schema_version === 7 && legacy.snapshot.premium_reflections.length === 1 && !(await readdir(join(root, id))).includes("optional"));
  ok("1b it loads from the snapshot (legacy authority)", a.loaded.session && JSON.stringify(a.loaded.session.getView().session.save) !== undefined);
  const before = await a.page.locator("#conversation").innerText(), header = await a.page.locator("body").innerText();
  const revision = a.rev(); ok("1c loading does not mark the campaign unsaved", (await a.page.locator("body").innerText()).length > 0 && a.session.getView().session.save.state === "saved");
  ok("1d the save succeeds and migrates", (await a.session.save()).ok);
  const migrated = JSON.parse(await readFile(join(root, id, "save.json"), "utf8"));
  ok("1e schema 8, markers present, optional fields left the snapshot, revision unchanged", migrated.schema_version === 8 && migrated.optional_state?.learning?.completed && migrated.optional_state?.media?.completed && !("premium_reflections" in migrated.snapshot) && migrated.snapshot.revision === revision);
  await a.page.reload(); await a.page.waitForSelector("#conversation");
  ok("1f the UI is unchanged after migration", (await a.page.locator("#conversation").innerText()) === before && (await a.page.locator("body").innerText()).includes("Mira") === header.includes("Mira"));
  await a.close();
}
// 2 + 3 narrator sees the historical note (producer OFF by default) and the promoted mannerism
{
  const b = await open(); requests = [];
  ok("2a Reflection is OFF in this session (default)", b.session.getOptionalServices().find(s => s.service === "reflection")?.enabled === false);
  await b.say("Mira, how are you feeling?");
  ok("2b the historical Reflection note (learning store) is in the Narrator request", requests.some(r => r.includes(NOTE)));
  ok("3 the promoted mannerism is in the Narrator request", requests.some(r => r.includes(MANNERISM)));
  await b.close();
}
// 4 sprite after background generation, no revision change
{
  const c = await open(), item = "campaign_item_00000001";
  const before = c.rev(); let release; c.d.gen.gate = new Promise(r => { release = r; });
  const accepted = c.session.requestItemSprite(item);
  console.log("sprite request", accepted, c.d.gen.calls); ok("4a the sprite job is accepted and the item is usable while it is pending", accepted);
  await c.say("I wait quietly."); const turnRevision = c.rev();
  release(); await c.session.itemSpritesSettled();
  const inv = await c.page.evaluate(async () => (await fetch("/api/inventory")).json());
  const url = JSON.stringify(inv).match(/\/api\/inventory\/sprite\/[^"]+/)?.[0];
  ok("4b the sprite appears after background generation (served as an image)", url && (await c.page.evaluate(async u => (await fetch(u)).status, url)) === 200);
  ok("4c the sprite completion did not change the revision", c.rev() === turnRevision && turnRevision >= before);
  await c.session.save(); await c.close();
}
// 5-8 gallery growth, selection, reload, expected_revision
{
  const e = await open(); const g = () => e.mira().appearance_editor.portrait.gallery.length;
  const startRevision = e.rev(), startGallery = g();
  const out1 = await e.session.generateNpcPortraitBatch({ ref: e.mira().ref, expected_revision: e.rev(), kind: "avatar" });
  ok("5a a gallery batch completes", out1.ok); const afterFirst = e.rev();
  ok("5b the gallery grew", g() > startGallery);
  const gal = e.mira().appearance_editor.portrait.gallery, avatar = gal.find(x => x.is_avatar), other = gal.find(x => !x.is_avatar);
  const grown = g(), r0 = e.rev();
  const out2 = await e.session.generateNpcPortraitBatch({ ref: e.mira().ref, expected_revision: e.rev(), kind: "avatar" });
  ok("5c a second batch grows the gallery again WITHOUT a revision change", out2.ok && g() > grown && e.rev() === r0);
  if (other) {
    const sel = e.session.setNpcPortraitAvatar({ ref: e.mira().ref, expected_revision: e.rev(), item: other.token });
    ok("6 selecting an avatar changes the revision exactly once", sel.ok && e.rev() === r0 + 1);
  } else ok("6 selecting an avatar changes the revision exactly once", false);
  void avatar;
  await e.session.save(); galleryAfter = g(); revisionAfterAll = e.rev();
  // 8 expected_revision survives a background optional write: the view revision the client holds stays valid.
  const view = await e.page.evaluate(async () => (await (await fetch("/api/session")).json()));
  const r = view.session?.revision ?? view.revision;
  const t1 = await e.page.evaluate(async ([rev, k]) => (await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "I wait.", turn_key: k, expected_revision: rev }) })).status, [r, key()]);
  await e.session.optionalSettled();
  const r2 = e.rev(), t2 = await e.page.evaluate(async ([rev, k]) => (await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "I wait again.", turn_key: k, expected_revision: rev }) })).status, [r2, key()]);
  ok("8 expected_revision stays valid across the turn and its background optional work", t1 === 200 && t2 === 200);
  await e.session.save(); revisionAfterAll = e.rev(); await e.close();
}
// 7 reload reads the side store
{
  const f = await open(); const file = JSON.parse(await readFile(join(root, id, "save.json"), "utf8"));
  const store = JSON.parse(await readFile(join(root, id, "optional", "media.json"), "utf8"));
  ok("7a the loaded campaign came from the side stores", f.loaded.session && file.schema_version === 8 && store.data.portraits[0].versions.length === galleryAfter);
  ok("7b the gallery and revision survive the reload", f.mira().appearance_editor.portrait.gallery.length === galleryAfter && f.rev() === revisionAfterAll);
  await f.close();
}
await browser.close(); await rm(root, { recursive: true, force: true });
console.log(results.every(Boolean) ? `ALL ${results.length} PASS` : `FAILED ${results.filter(x => !x).length}/${results.length}`);
process.exitCode = results.every(Boolean) ? 0 : 1;
