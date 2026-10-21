import test from "node:test";
import { turnJson, revisionOf } from "../support/turn-http.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { WorldStore } from "../../src/world/world-store.js";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import { learnCanonicalName } from "../../src/campaign/identity-knowledge.js";
import { GameSession } from "../../src/app/game-session.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { createPlaytestServer } from "../../src/ui/server.js";
import type { NarratorProvider } from "../../src/llm/narrator-provider.js";
import { mockController, mockNarrator, metadata, collect } from "../support/turn-fixtures.js";
import { deriveSessionView } from "../../src/app/session-view.js";
import { derivePlayUiView } from "../../src/app/play-ui-view.js";
import { temporalGrounding } from "../../src/turn/temporal-grounding.js";
import { ProviderError } from "../../src/llm/errors.js";
import { retryPolicy } from "../../src/llm/retry.js";

/**
 * The play server's contract behind the React UI: the turn stream carries status words only, failures and disconnects commit nothing, and the
 * household / play projections are masked and committed. The page itself (pending exchange, stream endings, drawers, household, editors,
 * portrait lifecycle, inventory) is pinned by the Vitest suites under src/ui-client (run with `npm run ui:test`).
 */
const tick = () => new Promise(resolve => setImmediate(resolve));
const documents = JSON.parse(await readFile("tests/fixtures/scene-continuity/fixture-world.json", "utf8"));
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
const post = async (url: string, signal?: AbortSignal) => fetch(`${url}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: turnJson("*looks around*", await revisionOf(url)), ...(signal ? { signal } : {}) });

test("PIPE-1: the browser stream carries status words only; the unaudited draft never leaves the server and the revised narration arrives once", async t => {
  let calls = 0;
  const draft = "*Korvin leaves, then he stands beside Nicco.*", final = "*Korvin remains beside Nicco.*";
  const narrator: NarratorProvider = { ...mockNarrator(draft), async *stream() {
    const text = ++calls === 1 ? draft : final;
    yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } };
  } };
  const f = fixture(narrator), url = await host(t, f), before = f.campaign.exportSnapshot();
  const raw = await (await post(url)).text();
  const events = raw.trim().split("\n").map(line => JSON.parse(line)), result = events.at(-1);
  assert.deepEqual(events.slice(0, -1).map(e => e.type), ["progress", "progress", "progress"]);
  assert.deepEqual(events.slice(0, -1).map(e => e.phase), ["thinking", "narrating", "resolving"]);
  for (const e of events.slice(0, -1)) assert.deepEqual(Object.keys(e).sort(), ["phase", "type"], "a progress event has no text field");
  assert.ok(!raw.includes("Korvin leaves"), "the audited-away phrase was never visible anywhere in the response");
  assert.equal(result.ok, true); assert.equal(calls, 2); assert.equal(result.messages[2].text, final);
  assert.equal(raw.split("remains beside Nicco").length - 1, 1, "the final narration is published exactly once");
  assert.ok(events.every(e => e.type !== "draft" && e.type !== "narration_delta"));
  assert.equal(f.coordinator.recent(f.campaign).finalized()[0]!.narration, final);
  assert.equal(f.campaign.exportSnapshot().runtime.npc_locations.find(n => n.character_id === "korvin")!.current_location, "audit_room");
  assert.deepEqual(f.campaign.exportSnapshot().knowledge, before.knowledge);
  assert.ok(!JSON.stringify(result).includes("system_prompt"));
});

test("provider failure after a partial draft leaves no committed state, history or finalized HTTP message, and shows no draft", async t => {
  const f = fixture({ ...mockNarrator(""), async *stream() { yield { type: "text_delta", text: "*Korvin leaves the room.*" }; throw new Error("PRIVATE_ERROR_SENTINEL"); } });
  const url = await host(t, f), before = f.campaign.exportSnapshot(), lines = (await (await post(url)).text()).trim().split("\n").map(line => JSON.parse(line));
  assert.ok(lines.every(e => e.type === "progress" || e.type === "result")); assert.ok(!JSON.stringify(lines).includes("Korvin leaves")); assert.equal(lines.at(-1).ok, false);
  assert.equal(lines.at(-1).messages.length, 1); assert.ok(!JSON.stringify(lines).includes("PRIVATE_ERROR_SENTINEL"));
  assert.equal(f.campaign.exportSnapshot(), before); assert.equal(f.coordinator.recent(f.campaign).entries().length, 0);
});

test("disconnected HTTP stream cancels generation before commit", async t => {
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

test("throwing UI event callback cannot interrupt audit, final delivery or commit", async () => {
  const f = fixture(mockNarrator("*Korvin remains beside Nicco.*"));
  const outcome = await f.session.submitPlayerInput("*looks around*", { onEvent: () => { throw new Error("UI callback failed"); } });
  assert.equal(outcome.ok, true); assert.equal(f.coordinator.recent(f.campaign).finalized().length, 1);
  await f.session.shutdown({ discard_unsaved: true });
});

test("provider retry drops the failed partial text and retains only successful final text in history", async () => {
  let attempts = 0;
  const final = "*Korvin remains beside Nicco.*";
  const f = fixture(mockNarrator(final));
  const service = new RetrievalService(world);
  const narrator: NarratorProvider = { ...mockNarrator(final), async *stream() {
    if (++attempts === 1) { yield { type: "text_delta", text: "*Rejected partial draft" }; throw new ProviderError("network_error"); }
    yield { type: "text_delta", text: final }; yield { type: "completed", result: { text: final, ...metadata } };
  } };
  const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: retryPolicy({ backoff_ms: 0, max_backoff_ms: 0, sleep: async () => {} }) });
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: "*looks around*" }));
  assert.equal(events.at(-1)!.type, "turn_completed"); assert.equal(attempts, 2);
  assert.ok(!JSON.stringify(events).includes("Rejected partial draft"));
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

test("time label is the clock projection at 600 and after a committed wait across its bucket boundary", async () => {
  const f = fixture(mockNarrator("*The room remains quiet.*"));
  const context = { status: "idle" as const, last_saved_revision: null, provider: { mode: "stub" as const, configured: true } };
  assert.equal(deriveSessionView(world, f.campaign.exportSnapshot(), context).scene.time.time_of_day, "Late Morning");
  const result = await f.session.submitPlayerInput("/wait 120"); assert.ok(result.ok);
  assert.equal(result.view.scene.time.world_minute, 720);
  assert.equal(result.view.scene.time.time_of_day, temporalGrounding(720).time_of_day);
  assert.equal(result.view.scene.time.time_of_day, "Early Afternoon");
  await f.session.shutdown({ discard_unsaved: true });
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

test("generation lifecycle: no schema or context change (static guards)", async () => {
  const types = await readFile("src/campaign/types.ts", "utf8"), format = await readFile("src/persistence/save-format.ts", "utf8");
  assert.match(types, /schema_version: 7;/); assert.match(format, /schema_version: 8;/);
});
