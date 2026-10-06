import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { WorldStore } from "../src/world/world-store.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { createPlaytestServer } from "../src/ui/server.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import { mockController, mockNarrator, metadata, collect } from "./turn-fixtures.js";
import { deriveSessionView } from "../src/app/session-view.js";
import { derivePlayUiView } from "../src/app/play-ui-view.js";
import { temporalGrounding } from "../src/turn/temporal-grounding.js";
import { ProviderError } from "../src/llm/errors.js";
import { retryPolicy } from "../src/llm/retry.js";

class Element {
  private text = "";
  className = ""; value = ""; hidden = false; disabled = false;
  scrollTop = 0; scrollHeight = 100; clientHeight = 100; focused = false;
  parent?: Element; children: Element[] = [];
  attributes = new Map<string, string>(); handlers = new Map<string, (event: any) => any>();
  get textContent(): string { return this.text + this.children.map(c => c.textContent).join(""); }
  set textContent(value: string) { this.text = value; this.children = []; }
  append(...children: Element[]) { children.forEach(c => { c.parent = this; }); this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.text = ""; this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  addEventListener(name: string, handler: (event: any) => any) { this.handlers.set(name, handler); }
  focus() { this.focused = true; }
  requestSubmit() { return this.handlers.get("submit")!({ preventDefault() {} }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const opening = { messages: [{ role: "narrator", text: "*An ordinary morning.*" }], status: "idle", configured: true,
  scene: { location: "Observation room", time_of_day: "Late Morning" }, household: [] };
async function client(fetchMock: (...args: any[]) => any = async () => ({ ok: true, json: async () => opening })) {
  const nodes = new Map(["conversation", "composer", "input", "send", "status", "error", "location", "daypart", "household-members", "latest", "day", "location-id", "gold", "present-count", "scene-participants", "household-count", "character-overlay", "character-drawer", "character-close", "character-backdrop", "appearance-tab", "portrait-initial", "character-badges", "character-name", "character-role", "character-relationship", "character-state", "character-where", "character-appearance", "character-affiliations", "appearance-panel", "story-panel", "story-tab", "character-public-profile", "character-summary", "character-facts", "character-history", "character-observations", "character-boundary"].map(id => [`#${id}`, new Element()]));
  const context: any = { document: { querySelector: (id: string) => nodes.get(id), createElement: () => new Element() }, fetch: fetchMock, setTimeout, clearTimeout, TextDecoder };
  runInNewContext(await readFile("src/ui/client.js", "utf8"), context); await tick();
  return { node: (id: string) => nodes.get(`#${id}`)!, renderRpg: context.renderRpg as (target: Element, source: string) => void };
}

for (const [source, expected, styles] of [
  ["*He looks up.*", "He looks up.", ["rpg-narration"]],
  ['*He looks up.*\n\n"Good morning."\n\n*He waits.*', 'He looks up.\n\n"Good morning."\n\nHe waits.', ["rpg-narration", "rpg-dialogue", "rpg-narration"]],
  ["*A partial do", "A partial do", ["rpg-narration"]],
  ["*A completed door.* Speak.", "A completed door. Speak.", ["rpg-narration", "rpg-dialogue"]],
  ["Hello. *holds out his hand*", "Hello. holds out his hand", ["rpg-dialogue", "rpg-narration"]],
  [String.raw`A literal \* and **double stars**.`, "A literal * and **double stars**.", ["rpg-dialogue"]],
  ["*<img src=x onerror=alert(1)>*\n<script>alert(1)</script>", "<img src=x onerror=alert(1)>\n<script>alert(1)</script>", ["rpg-narration", "rpg-dialogue"]],
  ["*", "", []], ["", "", []], ["Plain dialogue.", "Plain dialogue.", ["rpg-dialogue"]],
  ["*one* *two*", "one two", ["rpg-narration", "rpg-dialogue", "rpg-narration"]],
  ["Malformed *unclosed\n\nparagraph", "Malformed unclosed\n\nparagraph", ["rpg-dialogue", "rpg-narration"]],
] as const) test(`RPG renderer safely preserves text/paragraphs and tolerates partial markers: ${source}`, async () => {
  const c = await client(), target = new Element(); c.renderRpg(target, source);
  assert.equal(target.textContent, expected); assert.deepEqual(target.children.map(c => c.className), styles);
  assert.ok(target.children.every(c => c.children.length === 0), "all model bytes are inert text nodes");
});

for (const ending of ["final", "failed", "cancelled", "interrupted"] as const) test(`client live chunks use one bubble, preserve authority and clean up ${ending}`, async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>, submits = 0;
  const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
  const c = await client(async (_url: string, options?: any) => {
    if (!options) return { ok: true, json: async () => opening };
    submits++; assert.equal(options.headers.Accept, "application/x-ndjson");
    return { ok: true, headers: { get: () => "application/x-ndjson; charset=utf-8" }, body };
  });
  const emit = (event: object) => stream.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
  assert.equal(c.node("household-members").textContent, "No household members yet.");
  c.node("input").value = "*looks around*";
  const submitted = c.node("composer").requestSubmit(); await tick();
  const articles = c.node("conversation").children, bubble = articles[2]!;
  assert.equal(articles.length, 3); assert.equal(articles[1]!.children[1]!.textContent, "looks around");
  assert.match(bubble.className, /provisional/); assert.equal(c.node("send").disabled, true);
  await c.node("composer").requestSubmit(); assert.equal(submits, 1);
  emit({ type: "draft", action: "start", phase: "draft", text: "" });
  emit({ type: "draft", action: "delta", phase: "draft", text: "*Korvin leaves the ro" }); await tick();
  assert.equal(bubble.children[1]!.textContent, "Korvin leaves the ro");
  assert.equal(bubble.children[1]!.children[0]!.className, "rpg-narration");
  assert.equal(c.node("conversation").children[2], bubble);
  const earlier = articles[0]!.children[1]!.children[0];
  c.node("conversation").scrollHeight = 1000; c.node("conversation").scrollTop = 100;
  emit({ type: "draft", action: "delta", phase: "draft", text: "om.*" }); await tick();
  assert.equal(c.node("conversation").scrollTop, 100); assert.equal(c.node("latest").hidden, false);
  assert.equal(articles[0]!.children[1]!.children[0], earlier, "chunks never re-render prior messages");
  emit({ type: "draft", action: "start", phase: "revision", text: "" });
  emit({ type: "draft", action: "delta", phase: "revision", text: "*Korvin remains near the doorway.*" }); await tick();
  assert.equal(bubble.children[1]!.textContent, "Korvin remains near the doorway.");
  assert.match(bubble.children[0]!.textContent, /Revising/);
  assert.equal(c.node("household-members").textContent, "No household members yet.", "draft prose never updates household");
  c.node("latest").handlers.get("click")!({}); assert.equal(c.node("conversation").scrollTop, 1000);
  const finalText = '*Korvin remains beside Nicco.*\n\n"All is well — truly."';
  const result = ending === "final" ? { ...opening, type: "result", ok: true, messages: [...opening.messages, { role: "player", text: "*looks around*" }, { role: "narrator", text: finalText }],
    scene: { location: "Observation room", time_of_day: "Early Afternoon" }, household: [{ members: [{ name: "Maren", presence: "present", location: "Observation room" }, { name: "Unfamiliar household member", presence: "away" }] }] } :
    { ...opening, type: "result", ok: false, error: { message: ending === "cancelled" ? "Cancelled." : "Provider unavailable.", turn_state_changed: false } };
  if (ending !== "interrupted") {
    const bytes = new TextEncoder().encode(JSON.stringify(result) + "\n");
    // Split within a non-ASCII character as well as within JSON strings.
    for (const byte of bytes) stream.enqueue(new Uint8Array([byte]));
  }
  stream.close(); await submitted;
  assert.equal(c.node("send").disabled, false); assert.equal(c.node("input").focused, true);
  if (ending === "final") {
    assert.equal(c.node("conversation").children.length, 3); assert.equal(c.node("conversation").children[2], bubble);
    assert.equal(bubble.className, "narrator"); assert.equal(bubble.attributes.get("aria-busy"), "false");
    assert.equal(bubble.children[1]!.textContent, 'Korvin remains beside Nicco.\n\n"All is well — truly."');
    assert.equal(c.node("daypart").textContent, "Early Afternoon");
    assert.equal(c.node("household-members").children.length, 2);
    assert.match(c.node("household-members").textContent, /MarenPresent · Observation roomUnfamiliar household memberAway/);
    assert.equal(c.node("input").value, "");
  } else {
    assert.equal(c.node("conversation").children.length, 1); assert.doesNotMatch(c.node("conversation").textContent, /Korvin/);
    assert.equal(c.node("input").value, "*looks around*"); assert.equal(c.node("error").hidden, false);
  }
});

test("regeneration UI preserves canonical text and labels safely rendered alternatives as comparison only", async () => {
  const initial = { ...opening, alternate_models: [{ id: "mock/model", label: "Mock model" }], messages: [{ role: "narrator", text: '*Canonical story.*', comparison_id: "turn_1", comparison_available: true }] };
  let calls = 0;
  const c = await client(async (url: string, options?: any) => {
    if (!options) return { ok: true, json: async () => initial };
    calls++; assert.equal(url, "/api/alternative"); assert.deepEqual(JSON.parse(options.body), { message_id: "turn_1", model: "mock/model" });
    return { ok: true, json: async () => ({ ok: true, alternatives: [{ label: "Mock model", text: '*Alternative action.*\n\n<script>inert</script>' }] }) };
  });
  const article = c.node("conversation").children[0]!, original = article.children[1], select = article.children[2]!;
  select.value = "mock/model"; await select.handlers.get("change")!({});
  assert.equal(calls, 1); assert.equal(original!.textContent, "Canonical story.");
  assert.match(article.children[4]!.textContent, /Alternative · Mock modelComparison only · Does not change the story/);
  assert.match(article.children[4]!.textContent, /Alternative action\.\n\n<script>inert<\/script>/);
  assert.equal(select.disabled, false); assert.equal(select.value, "");
});

test("Heartstone header changes only on final committed result, never provisional arrival prose", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
  const market = { ...opening, scene: { location: "Slave Market", time_of_day: "Late Morning" } };
  const c = await client(async (_url: string, options?: any) => options
    ? { ok: true, headers: { get: () => "application/x-ndjson" }, body }
    : { ok: true, json: async () => market });
  c.node("input").value = "*goes back to Heartstone*";
  const submitted = c.node("composer").requestSubmit(); await tick();
  const emit = (event: object) => stream.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
  emit({ type: "draft", action: "start", phase: "draft", text: "" });
  emit({ type: "draft", action: "delta", phase: "draft", text: "Nicco enters Heartstone Tower." }); await tick();
  assert.equal(c.node("location").textContent, "Slave Market");
  assert.equal(c.node("daypart").textContent, "Late Morning");
  emit({ ...market, type: "result", ok: true, scene: { location: "Heartstone LR", time_of_day: "Early Afternoon" }, messages: [...market.messages, { role: "player", text: "*goes back to Heartstone*" }, { role: "narrator", text: "Nicco enters Heartstone Tower." }] });
  stream.close(); await submitted;
  assert.equal(c.node("location").textContent, "Heartstone LR");
  assert.equal(c.node("daypart").textContent, "Early Afternoon");
});

const documents = JSON.parse(await readFile("docs/evaluations/p12-scene-continuity/fixture-world.json", "utf8"));
const world = new WorldStore(documents);
function fixture(narrator: NarratorProvider, known = true) {
  const campaign = new CampaignState(world, "ui_v1", { player_location: "audit_room", world_time: { world_minute: 600 } });
  if (known) campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(world, campaign.exportSnapshot(), "korvin")] });
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false });
  const session = GameSession.fromCampaign({ world, repository: new FileCampaignRepository(world), createCoordinator: () => coordinator }, campaign);
  return { campaign, coordinator, session };
}
async function host(t: any, f: ReturnType<typeof fixture>) {
  const server = createPlaytestServer(f.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { await f.session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
const post = (url: string, signal?: AbortSignal) => fetch(`${url}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text: "*looks around*" }), ...(signal ? { signal } : {}) });

test("real coordinator streams provisional departure, revises it, commits only the final audited narration", async t => {
  let release!: () => void, calls = 0;
  const waiting = new Promise<void>(resolve => { release = resolve; }); t.after(() => release());
  const draft = "*Korvin leaves, then he stands beside Nicco.*", final = "*Korvin remains beside Nicco.*";
  const narrator: NarratorProvider = { ...mockNarrator(draft), async *stream() {
    const text = ++calls === 1 ? draft : final;
    yield { type: "text_delta", text: text.slice(0, 15) };
    if (calls === 1) await waiting;
    yield { type: "text_delta", text: text.slice(15) }; yield { type: "completed", result: { text, ...metadata } };
  } };
  const f = fixture(narrator), url = await host(t, f), before = f.campaign.exportSnapshot();
  const response = await post(url), reader = response.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /"type":"draft"/); assert.match(first, /Korvin leaves/);
  assert.equal(f.campaign.exportSnapshot(), before); assert.equal(f.coordinator.recent(f.campaign).entries().length, 0);
  assert.equal((await (await fetch(`${url}/api/session`)).json()).messages.length, 1);
  release(); let lines = first;
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; lines += new TextDecoder().decode(chunk.value); }
  const events = lines.trim().split("\n").map(line => JSON.parse(line)), result = events.at(-1);
  assert.ok(events.some(e => e.action === "start" && e.phase === "revision")); assert.equal(result.ok, true);
  assert.equal(calls, 2); assert.equal(result.messages[2].text, final);
  assert.equal(f.coordinator.recent(f.campaign).finalized()[0]!.narration, final);
  assert.equal(f.campaign.exportSnapshot().runtime.npc_locations.find(n => n.character_id === "korvin")!.current_location, "audit_room");
  assert.deepEqual(f.campaign.exportSnapshot().knowledge, before.knowledge);
  assert.ok(!JSON.stringify(result).includes("system_prompt"));
});

test("provider failure after a visible draft leaves no committed state, history or finalized HTTP message", async t => {
  const f = fixture({ ...mockNarrator(""), async *stream() { yield { type: "text_delta", text: "*Korvin leaves the room.*" }; throw new Error("PRIVATE_ERROR_SENTINEL"); } });
  const url = await host(t, f), before = f.campaign.exportSnapshot(), lines = (await (await post(url)).text()).trim().split("\n").map(line => JSON.parse(line));
  assert.ok(lines.some(e => e.action === "delta")); assert.equal(lines.at(-1).ok, false);
  assert.equal(lines.at(-1).messages.length, 1); assert.ok(!JSON.stringify(lines).includes("PRIVATE_ERROR_SENTINEL"));
  assert.equal(f.campaign.exportSnapshot(), before); assert.equal(f.coordinator.recent(f.campaign).entries().length, 0);
});

test("disconnected provisional HTTP stream cancels generation before commit", async t => {
  let cancelled!: () => void;
  const stopped = new Promise<void>(resolve => { cancelled = resolve; });
  const f = fixture({ ...mockNarrator(""), async *stream(request) {
    yield { type: "text_delta", text: "*Korvin leaves the room.*" };
    await new Promise<void>(resolve => { if (request.signal?.aborted) resolve(); else request.signal?.addEventListener("abort", () => resolve(), { once: true }); });
    cancelled(); yield { type: "completed", result: { text: "*Korvin leaves the room.*", ...metadata } };
  } });
  const url = await host(t, f), before = f.campaign.exportSnapshot(), abort = new AbortController();
  const response = await post(url, abort.signal); await response.body!.getReader().read(); abort.abort(); await stopped;
  for (let i = 0; i < 20 && f.session.status !== "idle"; i++) await tick();
  assert.equal(f.campaign.exportSnapshot(), before); assert.equal(f.coordinator.recent(f.campaign).entries().length, 0);
  assert.equal((await (await fetch(`${url}/api/session`)).json()).messages.length, 1);
});

test("throwing preview observer cannot interrupt audit, final delivery or commit", async () => {
  const f = fixture(mockNarrator("*Korvin remains beside Nicco.*"));
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "*looks around*", on_narrator_preview: () => { throw new Error("UI callback failed"); } }));
  assert.equal(events.at(-1)!.type, "turn_completed"); assert.equal(f.coordinator.recent(f.campaign).finalized().length, 1);
  await f.session.shutdown({ discard_unsaved: true });
});

test("provider retry starts a fresh visual buffer and retains only successful final text in history", async () => {
  let attempts = 0;
  const final = "*Korvin remains beside Nicco.*";
  const f = fixture(mockNarrator(final));
  const service = new RetrievalService(world), previews: { action: string; text: string }[] = [];
  const narrator: NarratorProvider = { ...mockNarrator(final), async *stream() {
    if (++attempts === 1) { yield { type: "text_delta", text: "*Rejected partial draft" }; throw new ProviderError("network_error"); }
    yield { type: "text_delta", text: final }; yield { type: "completed", result: { text: final, ...metadata } };
  } };
  const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: retryPolicy({ backoff_ms: 0, max_backoff_ms: 0, sleep: async () => {} }) });
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: "*looks around*", on_narrator_preview: e => previews.push(e) }));
  assert.equal(events.at(-1)!.type, "turn_completed"); assert.equal(attempts, 2);
  assert.deepEqual(previews.map(e => e.action), ["start", "delta", "start", "delta"]);
  assert.equal(coordinator.recent(f.campaign).finalized()[0]!.narration, final);
  await f.session.shutdown({ discard_unsaved: true });
});

test("HTTP household is an ID-free, private-field-free committed projection with empty/join/leave states", async t => {
  const f = fixture(mockNarrator("*The room is quiet.*"), false), url = await host(t, f);
  const get = async () => (await fetch(`${url}/api/session`)).json();
  assert.deepEqual((await get()).household, []);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_ui", name: "PRIVATE_HOUSEHOLD_SENTINEL" },
    { kind: "set_membership", household_id: "campaign_household_ui", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_ui", character_id: "korvin" },
  ] });
  let data = await get(); assert.deepEqual(data.household, [{ members: [{ name: "Unfamiliar household member", presence: "present", location: "Front hall" }] }]);
  assert.doesNotMatch(JSON.stringify(data.household), /korvin|Korvin|campaign_|PRIVATE_|profile|knowledge|fact|legal|equipment/);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    ...learnCanonicalName(world, f.campaign.exportSnapshot(), "korvin"),
    { kind: "register_character", character: { id: "campaign_character_maren", origin: { kind: "created" }, profile: { name: "Maren" }, current: { current_location: "audit_room" } } },
    { kind: "join_household", household_id: "campaign_household_ui", character_id: "campaign_character_maren" },
  ] });
  data = await get(); assert.deepEqual(data.household[0].members.map((m: any) => m.name).sort(), ["Korvin", "Maren"]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "leave_scene", character_id: "korvin" },
    { kind: "leave_household", household_id: "campaign_household_ui", character_id: "campaign_character_maren" },
  ] });
  data = await get(); assert.deepEqual(data.household, [{ members: [{ name: "Korvin", presence: "away" }] }]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "leave_household", household_id: "campaign_household_ui", character_id: "korvin" }] });
  assert.deepEqual((await get()).household, [{ members: [] }]);
});

test("time label is P11's projection at 600 and after a committed wait across its bucket boundary", async () => {
  const f = fixture(mockNarrator("*The room remains quiet.*"));
  const context = { status: "idle" as const, last_saved_revision: null, provider: { mode: "stub" as const, configured: true } };
  assert.equal(deriveSessionView(world, f.campaign.exportSnapshot(), context).scene.time.time_of_day, "Late Morning");
  const result = await f.session.submitPlayerInput("/wait 120"); assert.ok(result.ok);
  assert.equal(result.view.scene.time.world_minute, 720);
  assert.equal(result.view.scene.time.time_of_day, temporalGrounding(720).time_of_day);
  assert.equal(result.view.scene.time.time_of_day, "Early Afternoon");
  await f.session.shutdown({ discard_unsaved: true });
});

for (const ok of [true, false]) test(`location composer waits for final view without narrator bubbles: ${ok}`, async () => {
  let resolveResponse!: (value: unknown) => void; const requests: any[] = [];
  const c = await client(async (url: string, options?: any) => {
    if (!options) return { ok: true, json: async () => ({ ...opening, revision: 7 }) };
    requests.push([url, JSON.parse(options.body)]);
    return new Promise(resolve => { resolveResponse = resolve; });
  });
  const initial = c.node("conversation").children.length;
  c.node("input").value = "/location heartstone_lr";
  const submitted = c.node("composer").requestSubmit(); await tick();
  assert.equal(c.node("conversation").children.length, initial);
  assert.equal(c.node("location").textContent, "Observation room");
  assert.deepEqual(requests, [["/api/location", { target: "heartstone_lr", expected_revision: 7 }]]);
  resolveResponse({ json: async () => ({ ...opening, ok, revision: ok ? 8 : 7, scene: { location: ok ? "Heartstone LR" : "Observation room", time_of_day: "Late Morning" },
    confirmation: "Manual location correction. Time unchanged.", error: { message: "Unknown canonical location." } }) });
  await submitted;
  assert.equal(c.node("conversation").children.length, initial);
  assert.equal(c.node("location").textContent, ok ? "Heartstone LR" : "Observation room");
  assert.match(ok ? c.node("status").textContent : c.node("error").textContent, ok ? /Manual location correction/ : /Unknown canonical location/);
});


test("play shell has only requested navigation and one authoritative responsive status/composer", async () => {
  const html = await readFile("src/ui/index.html", "utf8");
  const nav = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)![1]!;
  assert.deepEqual([...nav.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1]), ["Nicco", "Household", "World", "Debug", "&#128190;"]);
  assert.match(nav, /aria-label="Save"/);
  for (const id of ["location", "location-id", "gold", "composer", "input", "scene-participants"]) assert.equal(html.split(`id="${id}"`).length - 1, 1);
  assert.match(await readFile("src/ui/style.css", "utf8"), /@media\(max-width:720px\)/);
});

test("committed public play projection hides identities and private character fields without mutating state", async t => {
  const f = fixture(mockNarrator("*Quiet.*"), false), url = await host(t, f);
  const before = JSON.stringify(f.campaign.exportSnapshot());
  const data = await (await fetch(`${url}/api/session`)).json();
  assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before);
  assert.equal(data.play.day, 0);
  assert.equal(data.play.gold, f.session.getView().player.gold);
  assert.equal(data.scene.location_id, "audit_room");
  assert.equal(data.play.participants[0].category, "You");
  assert.ok(data.play.participants.some((p: any) => p.name === "Unfamiliar person"));
  assert.doesNotMatch(JSON.stringify(data.play), /korvin|Korvin|private_notes|conditions|dimensions|canonical_entity_id/);
  const ref = data.play.participants[1].ref;
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [...learnCanonicalName(world, f.campaign.exportSnapshot(), "korvin")] });
  const named = f.session.getPlayUiView().participants.find(p => p.name === "Korvin")!;
  assert.equal(named.ref, ref);
  assert.equal(named.card!.relationship, "Not recorded");
  assert.deepEqual(named.card!.affiliations, []);
});

test("scene entries open a safe character drawer by reference and close through button, backdrop and Escape", async () => {
  const person = { ref: "opaque", name: "Known person", category: "Household \u00b7 NPC+", card: { name: "Known person", household: true, npc_plus: true, role: "Cook", relationship: "Not recorded", state: "Not recorded", where: "Here", appearance: "An established appearance.", affiliations: [] } };
  const data = { ...opening, scene: { ...opening.scene, location_id: "real_location" }, play: { day: 6, gold: 37, participants: [person] } };
  const c = await client(async () => ({ ok: true, json: async () => data }));
  assert.equal(c.node("location-id").textContent, "real_location"); assert.equal(c.node("gold").textContent, "37"); assert.equal(c.node("day").textContent, " \u00b7 Day 6");
  assert.equal(c.node("present-count").textContent, "1 present");
  const entry = c.node("scene-participants").children[0]!;
  for (const close of ["character-close", "character-backdrop", "escape"]) {
    entry.handlers.get("click")!({});
    assert.equal(c.node("character-overlay").hidden, false);
    assert.equal(c.node("character-name").textContent, "Known person");
    assert.equal(c.node("character-appearance").textContent, person.card.appearance);
    assert.equal(c.node("character-affiliations").textContent, "None known.");
    if (close === "escape") c.node("character-drawer").handlers.get("keydown")!({ key: "Escape", preventDefault() {} });
    else c.node(close).handlers.get("click")!({});
    assert.equal(c.node("character-overlay").hidden, true); assert.equal(entry.focused, true);
  }
});

test("streaming draft cannot change location ID, gold, day or participants; final committed result can", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { stream = c; } });
  const initial = { ...opening, scene: { ...opening.scene, location_id: "initial" }, play: { day: 0, gold: 11, participants: [] } };
  const c = await client(async (_url, options) => options ? { ok: true, headers: { get: () => "application/x-ndjson" }, body } : { ok: true, json: async () => initial });
  c.node("input").value = "Walk."; const submitted = c.node("composer").requestSubmit(); await tick();
  const emit = (e: object) => stream.enqueue(new TextEncoder().encode(JSON.stringify(e) + "\n"));
  emit({ type: "draft", action: "delta", phase: "draft", text: "Arrival", scene: { location_id: "fake" }, play: { gold: 999 } }); await tick();
  assert.equal(c.node("location-id").textContent, "initial"); assert.equal(c.node("gold").textContent, "11");
  emit({ ...initial, type: "result", ok: true, scene: { location: "Destination", location_id: "destination", time_of_day: "Evening" }, play: { day: 1, gold: 9, participants: [] }, messages: [...initial.messages, { role: "player", text: "Walk." }, { role: "narrator", text: "Arrival" }] });
  stream.close(); await submitted;
  assert.equal(c.node("location-id").textContent, "destination"); assert.equal(c.node("gold").textContent, "9"); assert.equal(c.node("day").textContent, " \u00b7 Day 1");
});

test("character whitelist uses public appearance, actual NPC+ membership and hides secret conditions/affiliations", () => {
  const docs = structuredClone(documents);
  const entity = docs.find((d: any) => d.document.entity.id === "korvin").document.entity;
  entity.base_location = entity.location; delete entity.location;
  Object.assign(entity, { work_location: null, home_location: null, species: null, sex: null, age_band: null, purpose: null, morality: null });
  entity.appearance = "Grey hair and a weathered face.";
  entity.occupation = "Hall attendant";
  entity.private_notes = "PRIVATE_SENTINEL";
  const secret = structuredClone(docs[0]);
  secret.source = "ui/secret.yaml";
  Object.assign(secret.document.entity, { id: "secret_affiliation", name: "SECRET_AFFILIATION", display_name: "SECRET_AFFILIATION", type: "concept", related_entities: [] });
  delete secret.document.entity.features; delete secret.document.entity.connections;
  docs.push(secret);
  entity.affiliations = ["secret_affiliation"];
  const w = new WorldStore(docs);
  const c = new CampaignState(w, "ui_privacy", { player_location: "audit_room", world_time: { world_minute: 600 } });
  c.apply({ expected_revision: c.revision, commands: [
    ...learnCanonicalName(w, c.exportSnapshot(), "korvin"),
    { kind: "register_character", character: { id: "korvin", origin: { kind: "canonical", canonical_entity_id: "korvin" }, profile: {}, current: { conditions: ["HIDDEN_CONDITION"], presentation: "HIDDEN_PRESENTATION" } } },
    { kind: "create_household", id: "campaign_household_card" },
    { kind: "set_membership", household_id: "campaign_household_card", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_card", character_id: "korvin" },
    { kind: "set_funds", character_id: "nicco", gold: 23 },
  ] });
  const snapshot = c.exportSnapshot();
  const view = deriveSessionView(w, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  const play = derivePlayUiView(w, snapshot, view), person = play.participants.find(p => p.name === "Korvin")!;
  assert.equal(play.gold, 23); assert.equal(person.npc_plus, true); assert.equal(person.household, true);
  assert.equal(person.card!.appearance, entity.appearance); assert.equal(person.card!.role, entity.occupation);
  assert.doesNotMatch(JSON.stringify(play), /PRIVATE_SENTINEL|SECRET_AFFILIATION|HIDDEN_CONDITION|HIDDEN_PRESENTATION/);
});

test("household drawer uses the shared opaque card and renders existing Story tab as inert player-known text", async () => {
  const card = { ref: "household-ref", name: "Known member", name_known: true, category: "Household", household: true, npc_plus: true, presence: "away", known_location: null,
    role: "Porter", relationship: "Known colleague", state: "Not recorded", where: "Whereabouts not known", appearance: "An established coat.", affiliations: ["Public fellowship"],
    public_profile: { species: "Human" }, public_summary: "<script>inert summary</script>", story_facts: [{ text: "A learned rumor.", status: "heard_rumor" }], history: [{ text: "An established account.", source: "Their account" }], observations: [], knowledge_boundary: "Public and learned information only." };
  const data = { ...opening, play: { participants: [], household: [{ members: [card] }] } };
  const c = await client(async () => ({ ok: true, json: async () => data }));
  c.node("household-members").children[0]!.handlers.get("click")!({});
  assert.equal(c.node("character-name").textContent, "Known member"); assert.equal(c.node("character-where").textContent, "Whereabouts not known");
  c.node("story-tab").handlers.get("click")!({});
  assert.equal(c.node("story-panel").hidden, false); assert.equal(c.node("appearance-panel").hidden, true);
  assert.equal(c.node("character-summary").textContent, card.public_summary); assert.equal(c.node("character-summary").children.length, 0);
  assert.match(c.node("character-facts").textContent, /heard rumor: A learned rumor/);
  assert.equal(c.node("character-history").textContent, "Their account: An established account.");
  c.node("appearance-tab").handlers.get("click")!({}); assert.equal(c.node("story-panel").hidden, true);
});
