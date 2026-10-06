import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorldStore } from "../src/world/world-store.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { recentSceneNarration } from "../src/turn/recent-scene-narration.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { playerDestination } from "../src/turn/player-travel.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { mockNarrator, mockController, collect, metadata } from "./turn-fixtures.js";
const world = await loadWorld("data"), market = "calderan_slave_market";
let serial = 0;
function fixture(location = market, minute = 600) {
  const campaign = createOpeningCampaign(world, `travel_fix_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [
    { kind: "runtime_delta", delta: { player_location: location, time_advance_minutes: minute, mana_delta: -90 } },
    { kind: "register_character", character: { id: "campaign_character_mira", origin: { kind: "created" }, profile: { name: "Mira", sex: "female" }, current: { current_location: location, status: "active" } } },
    { kind: "set_membership", household_id: "campaign_household_heartstone", membership: { character_id: "campaign_character_mira", status: "member", role: "companion" } }
  ] });
  const prompts: string[] = []; let calls = 0, controllers = 0, reflections = 0;
  let draft = "*Ordinary daylight fills the scene.*";
  const service = new RetrievalService(world);
  const generate = (r: GenerationRequest) => { calls++; prompts.push(r.messages.map(m => m.content).join("\n")); return { text: draft, ...metadata }; };
  const coordinator = new TurnCoordinator(world, { async generate(r) { return generate(r); }, async *stream(r) { const result = generate(r); yield { type: "text_delta", text: result.text }; yield { type: "completed", result }; } }, mockController([], () => { controllers++; }), { service, search: new HybridSearch(service) }, { provider_retry: false });
  const deps = { world, repository: new FileCampaignRepository(world), createCoordinator: () => coordinator, reflection_provider: { async reflect() { reflections++; return { text: "{}" }; } } };
  const session = GameSession.fromCampaign(deps, campaign);
  return { campaign, coordinator, session, deps, prompts, setDraft: (text: string) => { draft = text; }, counts: () => [calls, controllers, reflections], intent: (input: string) => playerIntent(input, buildTurnContext(world, campaign.exportSnapshot()), campaign.exportSnapshot(), world) };
}
const positive = ["they both walk to the Heartstone", "*they both walk to the Heartstone*", "we go home", "let's go home", "let us go home", "I walk back home", "Nicco returns to Heartstone", "Nicco and Mira walk to Heartstone", "Nicco and Mira go to Heartstone", "they both walk together to Heartstone", "Nicco walks with Mira to Heartstone", "I walk to Heartstone with Mira", "walks with her to Heartstone", "*goes back to Heartstone*", "go to Heartstone", "I go to Heartstone", "Nicco goes to Heartstone", "return home", "they both walk home", "we travel to heartstone_lr", "I head up to Heartstone Living Floor", "walk to Heartstone Tower"];
for (const input of positive) test(`player travel commits once, companion stays: ${input}`, async () => {
  const f = fixture(), intent = f.intent(input);
  const moves = intent.runtime.filter(c => c.kind === "runtime_delta" && c.delta.player_location);
  assert.equal(moves.length, 1); assert.deepEqual(moves[0], { kind: "runtime_delta", delta: { player_location: "heartstone_lr", time_advance_minutes: 21 } });
  const out = await f.session.submitPlayerInput(input); assert.ok(out.ok);
  assert.equal(out.view.scene.location.id, "heartstone_lr"); assert.equal(out.view.scene.time.world_minute, 621);
  assert.equal(f.campaign.exportSnapshot().characters.find(c => c.id === "campaign_character_mira")!.current.current_location, market);
  assert.ok(f.prompts[0]!.includes("heartstone_lr"));
});
const negative = ["Mira walks to Heartstone", "she walks to Heartstone", "Korvin goes to the market", "they walk to Heartstone", "I tell Mira to walk to Heartstone", "If Mira walked to Heartstone, I'd follow later.", "I might walk to Heartstone.", "I don't walk to Heartstone.", "Did we walk to Heartstone?", '"I walk to Heartstone."', "we are home", "Heartstone looks beautiful.", "*I walk to Heartstone?*", "Nicco and Banana walk to Heartstone", "I walk to Heartstne", "we go to banana", "I walk to market", "walk to tower", "I walk to Heartstone and then go to Slave Market", "I stand up and mira smiles and goes to Heartstone", "Mira, go to Heartstone"];
for (const input of negative) test(`non-authoritative player travel: ${input}`, () => {
  const f = fixture(), before = f.campaign.exportSnapshot(), intent = f.intent(input);
  assert.equal(intent.runtime.length, 0); assert.equal(f.campaign.exportSnapshot(), before);
});
const local = ["goes to the man leaning on the post", "walks to the woman with the fan", "approaches the seller", "goes over to the clerk", "walks toward the table", "steps up to the guard", "moves closer to the door", "walks across the room", "goes to the man beside Heartstone"];
for (const source of [market, "heartstone_square"]) for (const input of local) test(`local stays local from ${source}: ${input}`, () => {
  const f = fixture(source);
  for (const text of [input, `*${input}*`]) {
    const intent = f.intent(text); assert.equal(intent.runtime.length, 0);
    for (const a of intent.natural?.actions ?? []) if (a.kind === "movement") { assert.equal(a.detail.destination, undefined); assert.equal(a.detail.route, undefined); }
  }
});
test("exact destination mode and aliases are unique; no feature guessing", () => {
  for (const label of ["Heartstone", "heartstone", "HEARTSTONE", "Heartstone Tower", "home"]) assert.equal(playerDestination(label, world), "heartstone");
  assert.equal(playerDestination("Heartstone Living Floor", world), "heartstone_lr");
  assert.equal(playerDestination("Slave Market", world), market); assert.equal(playerDestination("pens", world), market);
  for (const label of ["Heartstne", "banana", "market", "tower", "the clerk", "the man beside Heartstone"]) assert.equal(playerDestination(label, world), undefined);
});
test("known unreachable travel fails with source grounding", () => {
  const f = fixture(), intent = f.intent("they both walk to blackwater");
  assert.equal(intent.runtime.length, 0); assert.equal(intent.natural!.actions[0]!.status, "blocked"); assert.ok(intent.natural!.notes[0]!.includes("remains"));
});
test("historical two turns, P12 boundary, time and projections", async () => {
  const f = fixture(); f.coordinator.recent(f.campaign).add({ player: "look", narration: "POISON_MARKET_CONTEXT", status: "finalized", location_id: market });
  f.setDraft("*They arrive at Heartstone.*");
  const first = await f.session.submitPlayerInput("they both walk to the heartstone"); assert.ok(first.ok);
  f.setDraft("*The door opens into Heartstone Living Floor. Daylight falls through the arched windows.*");
  const second = await f.session.submitPlayerInput("well we are home he opens the door and enters come in, this is the heartstone, our home"); assert.ok(second.ok);
  assert.match(second.narration, /door opens into Heartstone Living Floor/);
  assert.doesNotMatch(recentSceneNarration(f.coordinator.recent(f.campaign).finalized(), "heartstone_lr"), /POISON_MARKET_CONTEXT/);
  assert.equal(second.view.scene.location.id, "heartstone_lr"); assert.equal(second.view.scene.time.world_minute, 621);
  assert.equal(buildTurnContext(world, f.campaign.exportSnapshot()).primary.scene.player_location!.id, "heartstone_lr");
  assert.equal(f.coordinator.recent(f.campaign).finalized().at(-1)!.location_id, "heartstone_lr");
});
test("existing day rollover and mana recovery", async () => {
  const f = fixture(market, 1435), out = await f.session.submitPlayerInput("we go home"); assert.ok(out.ok);
  assert.equal(out.view.scene.time.world_minute, 1456); assert.equal(out.view.scene.time.day, 1); assert.equal(out.view.player.mana.current, 35);
});
test("manual correction uses owned authority, zero time/mana/providers/NPC movement and fresh context", async () => {
  const f = fixture(); const before = f.campaign.exportSnapshot();
  f.coordinator.recent(f.campaign).add({ player: "look", narration: "POISONED_MARKET", status: "finalized", location_id: market });
  const p = f.coordinator.participants(f.campaign), context = buildTurnContext(world, before);
  const plan = p.plan("*approaches a passer-by*", context); p.commit(plan, "A passer-by waits."); const oldIds = p.active().map(p => p.id); assert.ok(oldIds.length > 0);
  const out = f.session.overridePlayerLocation({ target: "heartstone_lr", expected_revision: before.revision }); assert.ok(out.ok);
  assert.equal(out.changed, true); assert.equal(out.view.session.revision, before.revision + 1);
  assert.equal(out.view.scene.location.id, "heartstone_lr"); assert.equal(out.view.scene.time.world_minute, 600); assert.equal(out.view.player.mana.current, 10);
  const after = f.campaign.exportSnapshot(); assert.deepEqual(after.characters, before.characters); assert.deepEqual(after.runtime.npc_locations, before.runtime.npc_locations);
  assert.deepEqual(f.counts(), [0, 0, 0]); assert.deepEqual(p.active(), []); assert.deepEqual(f.coordinator.recent(f.campaign).finalized(), []);
  assert.ok(!JSON.stringify(f.coordinator.contextRequest(f.campaign)).includes("POISONED_MARKET"));
  const next = p.plan("*approaches a passer-by*", buildTurnContext(world, after)); assert.ok(next.participants.every(p => !oldIds.includes(p.id)));
  assert.equal(out.view.household[0]!.members.find(m => m.id === "campaign_character_mira")!.presence, "away");
  assert.ok(out.confirmation.includes("Time unchanged"));
});
test("same-node correction resets poison without a revision", () => {
  const f = fixture(); f.coordinator.recent(f.campaign).add({ player: "look", narration: "POISON", status: "finalized", location_id: market });
  const rev = f.campaign.revision, out = f.session.overridePlayerLocation({ target: market, expected_revision: rev }); assert.ok(out.ok);
  assert.equal(out.changed, false); assert.equal(f.campaign.revision, rev); assert.equal(f.coordinator.recent(f.campaign).finalized().length, 0);
});
test("manual invalid/stale/character/feature targets have no mutation; exact name and disconnected target work", () => {
  const f = fixture(), before = f.campaign.exportSnapshot();
  for (const target of ["banana", "market", "Heartstone Tower", "nicco", "the clerk", "home"]) { const out = f.session.overridePlayerLocation({ target, expected_revision: before.revision }); assert.ok(!out.ok); assert.equal(f.campaign.exportSnapshot(), before); }
  const stale = f.session.overridePlayerLocation({ target: "heartstone_lr", expected_revision: before.revision - 1 }); assert.ok(!stale.ok); assert.equal(stale.error.code, "stale_turn");
  const named = f.session.overridePlayerLocation({ target: "Heartstone Living Floor", expected_revision: f.campaign.revision }); assert.ok(named.ok);
  const disconnected = f.session.overridePlayerLocation({ target: "blackwater", expected_revision: f.campaign.revision }); assert.ok(disconnected.ok); assert.equal(disconnected.view.scene.time.world_minute, 600);
});
test("reserved command cannot reach session or direct engine providers; closed rejected", async () => {
  const f = fixture(), before = f.campaign.exportSnapshot();
  const out = await f.session.submitPlayerInput("/location heartstone_lr"); assert.ok(!out.ok);
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "/location heartstone_lr" })); assert.equal(events.at(-1)!.type, "turn_failed");
  assert.equal(f.campaign.exportSnapshot(), before); assert.deepEqual(f.counts(), [0, 0, 0]);
  await f.session.shutdown({ discard_unsaved: true }); const closed = f.session.overridePlayerLocation({ target: "heartstone_lr", expected_revision: f.campaign.revision }); assert.ok(!closed.ok); assert.equal(closed.error.code, "session_closed");
});
test("manual correction persists on explicit save/load unchanged time", async () => {
  const f = fixture(), dir = await mkdtemp(join(tmpdir(), "caldrevan-location-"));
  try {
    const deps = { ...f.deps, repository: new FileCampaignRepository(world, dir) }, session = GameSession.fromCampaign(deps, f.campaign);
    assert.ok(session.overridePlayerLocation({ target: "heartstone_lr", expected_revision: f.campaign.revision }).ok); assert.ok((await session.save()).ok);
    const loaded = await GameSession.loadCampaign(deps, f.campaign.exportSnapshot().campaign_id); assert.ok(loaded.ok);
    assert.equal(loaded.session.getView().scene.location.id, "heartstone_lr"); assert.equal(loaded.session.getView().scene.time.world_minute, 600);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("HTTP correction returns final committed ID/revision, keeps transcript, reserves turn command", async () => {
  const f = fixture(), server = createPlaytestServer(f.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const addr = server.address(); assert.ok(addr && typeof addr === "object"); const base = `http://127.0.0.1:${addr.port}`;
    const before = await (await fetch(base + "/api/session")).json();
    const response = await fetch(base + "/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "heartstone_lr", expected_revision: before.revision }) });
    const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.scene.location_id, "heartstone_lr"); assert.equal(data.revision, before.revision + 1); assert.equal(data.view, undefined); assert.deepEqual(data.messages, before.messages); assert.deepEqual(f.counts(), [0, 0, 0]);
    const bad = await fetch(base + "/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "/location blackwater" }) }); assert.equal(bad.status, 422); assert.equal(f.campaign.exportSnapshot().runtime.scene.player_location, "heartstone_lr");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("busy correction is rejected before target validation and leaves state untouched", async () => {
  const f = fixture(), service = new RetrievalService(world); let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const narrator = { async generate() { await wait; return { text: "Daylight.", ...metadata }; }, async *stream() { await wait; yield { type: "completed" as const, result: { text: "Daylight.", ...metadata } }; } };
  const coordinator = new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) });
  const session = GameSession.fromCampaign({ ...f.deps, createCoordinator: () => coordinator }, f.campaign), before = f.campaign.exportSnapshot();
  const pending = session.submitPlayerInput("look around");
  const busy = session.overridePlayerLocation({ target: "heartstone_lr", expected_revision: before.revision }); assert.ok(!busy.ok); assert.equal(busy.error.code, "turn_in_progress"); assert.equal(f.campaign.exportSnapshot(), before);
  release(); await pending;
});
test("ambiguous exact canonical names fail closed with bounded IDs", () => {
  const sources = world.listEntities().map(entity => ({ source: entity.id + ".yaml", document: { schema_version: 1 as const, entity: { ...entity, ...(entity.id === "blackwater" ? { name: "Heartstone Living Floor" } : {}) }, chunks: world.listChunks().filter(c => c.entity_id === entity.id) } }));
  const duplicate = new WorldStore(sources), campaign = createOpeningCampaign(duplicate, "ambiguous_location"), service = new RetrievalService(duplicate);
  const coordinator = new TurnCoordinator(duplicate, mockNarrator("Daylight."), mockController([]), { service, search: new HybridSearch(service) });
  const session = GameSession.fromCampaign({ world: duplicate, repository: new FileCampaignRepository(duplicate), createCoordinator: () => coordinator }, campaign), before = campaign.exportSnapshot();
  const out = session.overridePlayerLocation({ target: "Heartstone Living Floor", expected_revision: before.revision }); assert.ok(!out.ok); assert.equal(out.candidates!.length, 2); assert.equal(campaign.exportSnapshot(), before);
  assert.equal(playerDestination("Heartstone Living Floor", duplicate), undefined);
});
test("added aliases preserve reference-based save compatibility", () => {
  const sources = world.listEntities().map(entity => ({ source: entity.id + ".yaml", document: { schema_version: 1 as const, entity: { ...entity, aliases: entity.aliases.filter(a => a !== "Heartstone Tower" && a !== "pens") }, chunks: world.listChunks().filter(c => c.entity_id === entity.id) } }));
  const old = new WorldStore(sources), campaign = createOpeningCampaign(old, "alias_compatibility");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr", time_advance_minutes: 621 } }] });
  const text = serializeSave(createSaveFile(campaign.exportSnapshot(), old, "2026-10-06T10:00:00.000Z"), old);
  const restored = decodeSave(text, world); assert.equal(restored.snapshot.runtime.scene.player_location, "heartstone_lr"); assert.equal(restored.snapshot.runtime.scene.world_time.world_minute, 621);
});
const arrivals = ["He enters Heartstone Tower.", "They arrive at Heartstone.", "We reach Heartstone.", "The journey ends at Heartstone's massive door.", "The door opens into Heartstone Living Floor."];
for (const narration of arrivals) test(`bounded uncommitted current arrival is caught: ${narration}`, () => {
  const f = fixture(), context = buildTurnContext(world, f.campaign.exportSnapshot()), intent = f.intent("they both walk to Heartstone");
  const access = projectKnowledgeAccess(context, undefined, { input: "they both walk to Heartstone" }, undefined);
  const issues = auditNarration({ narration, context, world, access, evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: f.campaign.exportSnapshot(), origin: market, player_input: "they both walk to Heartstone" });
  assert.ok(issues.some(i => i.kind === "uncommitted_movement")); assert.equal(f.campaign.exportSnapshot().runtime.scene.player_location, market);
});
for (const narration of ['Korvin says, "They arrived at Heartstone yesterday."', 'Nicco asks, "Did they reach Heartstone?"', "The road to Heartstone ends at a massive door.", "A book describes Heartstone's interior.", "They might arrive at Heartstone.", "They do not arrive at Heartstone.", "Mira enters Heartstone Tower.", "Heartstone rises far beyond the market."]) test(`arrival backstop allows lore/dialogue/NPC/plans: ${narration}`, () => {
  const f = fixture(), context = buildTurnContext(world, f.campaign.exportSnapshot()), intent = f.intent("they both walk to Heartstone");
  const issues = auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, undefined, { input: "they both walk to Heartstone" }, undefined), evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: f.campaign.exportSnapshot(), origin: market, player_input: "they both walk to Heartstone" });
  assert.ok(!issues.some(i => i.kind === "uncommitted_movement" && !i.character));
});

test("manual correction flushes retained relevance and poison before the next real narrator request", async () => {
  const f = fixture(); f.setDraft("*RETAINED_SCENE_POISON_MARKER.*");
  assert.ok((await f.session.submitPlayerInput("I look around RETAINED_INPUT_MARKER")).ok);
  const counts = f.counts();
  assert.ok(f.session.overridePlayerLocation({ target: market, expected_revision: f.campaign.revision }).ok);
  assert.deepEqual(f.counts(), counts);
  const request = JSON.stringify(f.coordinator.contextRequest(f.campaign)); assert.doesNotMatch(request, /RETAINED_SCENE_POISON_MARKER|RETAINED_INPUT_MARKER/);
  f.setDraft("*Daylight falls across the market.*"); assert.ok((await f.session.submitPlayerInput("I look around")).ok);
  assert.doesNotMatch(f.prompts.at(-1)!, /RETAINED_SCENE_POISON_MARKER|RETAINED_INPUT_MARKER/);
});
test("exact historical travel via HTTP publishes Heartstone only in finalized responses", async () => {
  const f = fixture(), server = createPlaytestServer(f.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const address = server.address(); assert.ok(address && typeof address === "object"); const base = `http://127.0.0.1:${address.port}`;
    const turns = ["they both walk to the heartstone", "well we are home he opens the door and enters come in, this is the heartstone, our home"];
    for (const [index, text] of turns.entries()) {
      f.setDraft(index ? "*The door opens into Heartstone Living Floor.*" : "*They arrive at Heartstone.*");
      const response = await fetch(base + "/api/turn", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text }) });
      const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
      for (const e of events.filter(e => e.type === "draft")) assert.equal(e.scene, undefined);
      const final = events.at(-1)!; assert.equal(final.ok, true); assert.equal(final.scene.location_id, "heartstone_lr");
      assert.equal(final.scene.location, world.getEntity("heartstone_lr")!.display_name); assert.equal(f.session.getView().scene.time.world_minute, 621);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

for (const narration of arrivals) test(`persistent false arrival is reaudited and redacted: ${narration}`, async () => {
  const f = fixture(); f.setDraft(narration);
  const out = await f.session.submitPlayerInput("they both walk to banana"); assert.ok(out.ok);
  assert.ok(!out.narration.includes(narration)); assert.equal(f.campaign.exportSnapshot().runtime.scene.player_location, market); assert.equal(out.view.scene.time.world_minute, 600);
  assert.equal(f.counts()[0], 2);
});

test("group movement diagnostics survive projection when the other actor stays behind", async () => {
  const f = fixture(); f.setDraft("He enters Blackwater.");
  const out = await f.session.submitPlayerInput("Nicco and Mira walk to Heartstone"); assert.ok(out.ok);
  assert.equal(out.view.scene.location.id, "heartstone_lr"); assert.equal(out.view.scene.time.world_minute, 621);
  assert.ok(!out.narration.includes("He enters Blackwater.")); assert.equal(f.counts()[0], 2);
  assert.equal(f.campaign.exportSnapshot().characters.find(c => c.id === "campaign_character_mira")!.current.current_location, market);
});
