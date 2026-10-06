/** Offline audit only. Run `npm run build --silent`, then
 * `node scripts/audit-player-travel-authority.mjs` from the repository root.
 * Uses scripted providers, detached campaigns and a loopback HTTP server.
 * Documents CURRENT behavior; never implements or invokes a safeswitch. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { loadWorld } from "../.build/src/world/loader.js";
import { createOpeningCampaign } from "../.build/src/campaign/opening-state.js";
import { CampaignState } from "../.build/src/campaign/campaign-state.js";
import { RuntimeState } from "../.build/src/world/runtime-state.js";
import { buildSceneRam } from "../.build/src/scene/scene-ram-builder.js";
import { buildNarrativeContext } from "../.build/src/scene/narrative-context-builder.js";
import { buildTurnContext } from "../.build/src/turn/context-builder.js";
import { playerIntent } from "../.build/src/turn/player-intent.js";
import { actionSegments, sceneDirection, resolveDestination, reachable } from "../.build/src/turn/natural-actions.js";
import { resolveTurnIntent, projectTurnIntent } from "../.build/src/turn/stages/intent.js";
import { SceneParticipants } from "../.build/src/turn/scene-participants.js";
import { recentSceneNarration } from "../.build/src/turn/recent-scene-narration.js";
import { TurnCoordinator } from "../.build/src/turn/turn-coordinator.js";
import { RetrievalService } from "../.build/src/retrieval/retrieval-service.js";
import { HybridSearch } from "../.build/src/retrieval/hybrid-search.js";
import { GameSession } from "../.build/src/app/game-session.js";
import { FileCampaignRepository } from "../.build/src/persistence/campaign-repository.js";
import { createPlaytestServer } from "../.build/src/ui/server.js";
import { createSaveFile, decodeSave, serializeSave } from "../.build/src/persistence/save-format.js";

const world = await loadWorld("data"), market = "calderan_slave_market";
const metadata = { model: "offline-audit-script", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, latency: { request_started_at: "2026-10-06T10:00:00Z", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "2026-10-06T10:00:00Z", elapsed_total_ms: 0 } };
let serial = 0, assertions = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); assertions++; }
function fixture({ location = market, minute = 600, mana = 100, companions = true, household = false } = {}) {
  const campaign = createOpeningCampaign(world, `travel_audit_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [
    { kind: "runtime_delta", delta: { player_location: location, time_advance_minutes: minute, mana_delta: mana - 100 } },
    ...(companions ? [{ kind: "register_character", character: { id: "campaign_character_audit_mira", origin: { kind: "created" }, profile: { name: "Mira", sex: "female" }, current: { current_location: location, status: "active" } } }] : []),
    ...(household ? [{ kind: "set_membership", household_id: "campaign_household_heartstone", membership: { character_id: "campaign_character_audit_mira", status: "member", role: "companion" } }] : []),
  ] });
  let draft = "*Ordinary daylight falls across the scene.*", controllerCommands = [], lastResult;
  const prompts = [], service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, {
    async generate() { throw new Error("unused"); },
    async *stream(request) { prompts.push(request.messages.map(m => m.content).join("\n")); yield { type: "text_delta", text: draft }; yield { type: "completed", result: { text: draft, ...metadata } }; },
  }, { async propose() { return { commands: controllerCommands, ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  coordinator.recent(campaign).add({ player: "*looks around*", narration: "*Mira waits beside Nicco among the licensed private sellers. A man leans on a post.*", status: "finalized", location_id: location });
  // Read-only observer wrapper: capture the coordinator's final result without changing it.
  const observed = { contextRequest(campaign) { return coordinator.contextRequest(campaign); }, async *runTurn(request) { for await (const event of coordinator.runTurn(request)) { if (event.type === "turn_completed") lastResult = event.result; yield event; } } };
  const session = GameSession.fromCampaign({ world, repository: new FileCampaignRepository(world), createCoordinator: () => observed }, campaign);
  return { campaign, coordinator, session, prompts, setDraft(text) { draft = text; }, setController(commands) { controllerCommands = commands; }, result() { return lastResult; } };
}
function state(f) {
  const s = f.campaign.exportSnapshot(), runtime = new RuntimeState(world, s.runtime.scene, s.runtime.mana);
  runtime.applySceneDelta({ character_movements: s.runtime.npc_locations.map(n => n.off_scene ? { character_id: n.character_id, off_scene: true } : { character_id: n.character_id, current_location: n.current_location }) });
  const ram = buildSceneRam(world, runtime), context = buildNarrativeContext(world, runtime), view = f.session.getView();
  return { revision: s.revision, player_location: s.runtime.scene.player_location, world_minute: s.runtime.scene.world_time.world_minute, mana: s.runtime.mana,
    mira_location: s.characters.find(c => c.id === "campaign_character_audit_mira")?.current.current_location ?? null,
    scene_ram: { player_location: ram.player_location, current_location: ram.current_location.id, present_characters: ram.present_characters },
    narrative_context: { player_location: context.scene.player_location?.id, present_characters: context.scene.present_characters.map(c => c.id) },
    session: { id: view.scene.location.id, name: view.scene.location.name, world_minute: view.scene.time.world_minute, present: view.scene.present.map(c => c.id) } };
}
function parse(f, input) {
  const snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(world, snapshot), participants = new SceneParticipants();
  try {
    const direct = playerIntent(input, context, snapshot, world);
    const i = { world, snapshot, base_revision: snapshot.revision, player_input: input, prepare: p => f.campaign.prepare(p), plan: (text, ctx) => participants.plan(text, ctx), finalized: f.coordinator.recent(f.campaign).finalized() };
    const resolved = resolveTurnIntent(i), projected = projectTurnIntent(i, resolved);
    return { action_spans: actionSegments(input), scene_directions: sceneDirection(input, context), direct, runtime_proposal: resolved.intent.runtime,
      projected_location: projected.arrival, projected_world_minute: projected.projected.runtime.scene.world_time.world_minute,
      destination_phrases: (direct.natural?.actions ?? []).filter(a => a.kind === "movement").map(a => a.detail.phrase), notes: projected.prompt_intent.notes,
      scene_plan: { focus: projected.scene.focus, addressed: projected.scene.addressed, canonical_location_id: projected.scene.canonical_location_id } };
  } catch (error) { return { action_spans: actionSegments(input), scene_directions: sceneDirection(input, context), error: error.code ?? error.message, runtime_proposal: [] }; }
}
function summary(result) {
  if (!result) return null;
  return { narration: result.narration, commands: result.authorized_commands, proposal: result.controller_proposal, authorization: result.authorization, reconciliation: result.narration_reconciliation, movement: result.movement, retrieval: result.retrieval };
}
const inputs = ["go to Heartstone", "goes to Heartstone", "I go to Heartstone", "Nicco goes to Heartstone", "goes back to Heartstone", "walk to Heartstone", "walks to Heartstone", "walk home", "go home", "return home", "returns to Heartstone", "heads to Heartstone", "leaves for Heartstone", "travels to Heartstone", "makes his way to Heartstone", "they walk to Heartstone", "they both walk to Heartstone", "we walk to Heartstone", "Nicco and Mira walk to Heartstone", "walks with Mira to Heartstone", "takes Mira home", "takes her to Heartstone", "goes with her to Heartstone", "they head home", "they return home", "we go home", "let's go home", "I walk to Heartstone", "Nicco walks with Mira to Heartstone", "they both walk to the heartstone", "goes to the man leaning on the post", "walks to the woman with the fan", "approaches the seller", "goes over to the clerk", "walks toward the table", "steps up to the guard", "moves closer to the door", "walks across the room", "goes to market", "goes to banana", "I walk to Heartstone.", "I walk to Heartstone?", "I don't walk to Heartstone", "I might walk to Heartstone", "I tell Mira to walk to Heartstone", '"I walk to Heartstone"', "go to heartstone", "go to HEARTSTONE", "go to Heartstone Tower", "go to heartstone_lr", "go to Heartstone Living Floor", "go to the tower", "go to the pens", "go to Heartstne", "let's go to Heartstone together", "I walk to Heartstone with Mira", "Mira walks to Heartstone", "he walks to Heartstone", "she walks to Heartstone"];
const matrix = [];
for (const base of inputs) for (const marked of [false, true]) {
  const input = marked ? `*${base}*` : base, f = fixture(), before = state(f), parsed = parse(f, input);
  const outcome = await f.session.submitPlayerInput(input), after = state(f);
  matrix.push({ input, marked, parsed, turn_ok: outcome.ok, error: outcome.ok ? null : outcome.error.code, moved: after.player_location !== before.player_location, time_advanced: after.world_minute - before.world_minute,
    destination_resolved: parsed.runtime_proposal.find(c => c.kind === "runtime_delta" && c.delta.player_location)?.delta.player_location ?? null, after: { player_location: after.player_location, world_minute: after.world_minute, mira_location: after.mira_location } });
  await f.session.shutdown({ discard_unsaved: true });
}
check(matrix.find(r => r.input === "they both walk to the heartstone").moved, false, "document current plural gap");
check(matrix.find(r => r.input === "*they both walk to the heartstone*").moved, false, "marking plural does not fix subject");
check(matrix.find(r => r.input === "I walk to Heartstone").time_advanced, 21, "existing natural first-person travel");

const destinations = ["heartstone", "heartstone_lr", "Heartstone", "heartstone", "Heartstone Tower", "Heartstone Living Floor", "the heartstone", "home", "the tower", "this tower", "market", "square", "gate", "West Gate", "the pens", "the man leaning on the post", "the woman with the fan", "the table", "banana", "Heartstne", "Heartstone!", "Heartstone?"].map(phrase => {
  const f = fixture(), context = buildTurnContext(world, f.campaign.exportSnapshot()), id = resolveDestination(phrase, context, world);
  return { phrase, resolved: id ?? null, route: id ? reachable(id, market, world) : null };
});
const travelDraft = "*They leave the Slave Market and walk through Calderan. Heartstone comes into view beyond the lane. At the tower, the pace slows. The journey ends at Heartstone's massive wooden door.*";
const interiorDraft = "*The massive wooden door opens into Heartstone LR. Three arched windows light the aged wooden floor. A hearth stands near a sofa and armchair; a kitchen table, stairs, a hatch and a shoe rack with an equipment bench fill the interior.*";
const f = fixture(), server = createPlaytestServer(f.session), sequence = [];
server.listen(0, "127.0.0.1"); await once(server, "listening");
try {
  for (const [input, draft] of [["they both walk to the heartstone", travelDraft], ["well we are home he opens the door and enters come in, this is the heartstone, our home", interiorDraft]]) {
    f.setDraft(draft); const before = state(f), parsed = parse(f, input), promptStart = f.prompts.length;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ text: input }) });
    const lines = (await response.text()).trim().split("\n").map(line => JSON.parse(line)), after = state(f), last = lines.at(-1);
    sequence.push({ input, before, parsed, route_if_destination_were_requested: reachable("heartstone", market, world), result: summary(f.result()), after, http_final: { type: last.type, ok: last.ok, scene: last.scene },
      draft_payload_contains_scene: lines.filter(e => e.type === "draft").some(e => e.scene),
      prompts: f.prompts.slice(promptStart).map(p => ({ authoritative_location_line: p.match(/Location: [^\n]+/)?.[0], recent_scene_block: p.match(/\[RECENT SCENE NARRATION\][\s\S]*?(?=\n\n\[|$)/)?.[0] ?? "" })),
      recent_scene_after: recentSceneNarration(f.coordinator.recent(f.campaign).finalized(), market) });
    check(last.ok, true, input); check(after.player_location, market, "runtime remains market"); check(after.world_minute, 600, "no travel time");
    check(f.result().narration, draft, "uncommitted travel/interior prose survives current audit");
    check(after.scene_ram.player_location, market, "Scene RAM projects authoritative market"); check(after.scene_ram.current_location, market, "Scene RAM canonical entity agrees");
    check(after.narrative_context.player_location, market, "NarrativeContext projects authoritative market"); check(after.session.id, market, "session projects authoritative market");
    check(last.scene.location, after.session.name, "HTTP matches runtime session view");
    check(sequence.at(-1).draft_payload_contains_scene, false, "preview cannot set header");
  }
} finally { await f.session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

const safety = [];
for (const [input, draft, commands, options] of [
  ["they both walk to the heartstone", "*Nicco enters Heartstone Tower.*", []],
  ["*enters home*", "*Nicco enters home.*", []],
  ["they both walk to the heartstone", "*He enters Heartstone Tower.*", []],
  ["they both walk to the heartstone", "*They arrive at Heartstone.*", []],
  ["they both walk to the heartstone", travelDraft, [{ kind: "move_character", character_id: "nicco", location_id: "heartstone_lr" }]],
  ["*goes back to Heartstone*", "*Nicco enters Heartstone Tower.*", []],
  ["*goes back to Heartstone*", "*Nicco enters Heartstone Tower. Mira follows him.*", []],
  ["*goes back to Heartstone*", "*Nicco enters Heartstone Tower. Mira walks to Heartstone.*", []],
  ["*carries Mira to Heartstone*", "*Nicco enters Heartstone Tower, carrying Mira.*", []],
  ["*goes back to Heartstone* Mira, come with me.", "Nicco enters Heartstone Tower. Mira follows him.", [], { household: true }],
  ["*goes back to Heartstone* Mira, come with me.", "*Nicco enters Heartstone Tower.*", [], { household: true }],
  ["*goes back to Heartstone* Mira, come with me.", "*Nicco enters Heartstone Tower. Mira follows him.*", [], { household: true }],
]) {
  const f = fixture(options); f.setDraft(draft); f.setController(commands); const before = state(f), parsed = parse(f, input), outcome = await f.session.submitPlayerInput(input);
  safety.push({ input, draft, before, parsed, turn_ok: outcome.ok, error: outcome.ok ? null : outcome.error.code, result: summary(f.result()), after: state(f) });
  await f.session.shutdown({ discard_unsaved: true });
}
check(safety[0].result.narration.includes("Nicco enters Heartstone Tower"), false, "named arrival backstop");
check(safety[2].result.narration, "*He enters Heartstone Tower.*", "pronoun arrival gap");
check(safety[4].after.player_location, market, "controller cannot move Nicco");
check(safety[5].after.mira_location, market, "travel does not move companions automatically");
check(safety[9].after.mira_location, "heartstone_lr", "existing active NPC+ implicit follow");
check(safety[10].after.mira_location, market, "invitation alone does not relocate even active NPC+");

const day = fixture({ minute: 1435, mana: 10 }); day.setDraft("*Nicco enters Heartstone Tower.*");
const dayBefore = state(day), dayOutcome = await day.session.submitPlayerInput("*goes back to Heartstone*"), dayAfter = state(day);
check(dayOutcome.ok, true, "day boundary turn"); check(dayAfter.world_minute, 1456, "route crosses midnight"); check(dayAfter.mana.current, 35, "existing daily mana recovery");
const encoded = serializeSave(createSaveFile(day.campaign.exportSnapshot(), world, "2026-10-06T10:00:00.000Z"), world), decoded = decodeSave(encoded, world), restored = CampaignState.restore(world, decoded.snapshot);
check(restored.exportSnapshot().runtime.scene, day.campaign.exportSnapshot().runtime.scene, "save/reload location and clock");
const persistence = { save_schema: decoded.schema_version, snapshot_schema: decoded.snapshot.schema_version, restored_location: restored.exportSnapshot().runtime.scene.player_location, restored_world_minute: restored.exportSnapshot().runtime.scene.world_time.world_minute };
await day.session.shutdown({ discard_unsaved: true });

// Find a real visible disconnected canonical node; the graph itself is never edited.
const blocked = world.getEntitiesByType("location").find(l => l.knowledge?.visibility.player && l.knowledge.visibility.narrator && !reachable(l.id, market, world).target);
assert.ok(blocked, "authored world has a disconnected visible node"); assertions++;
const blockedFixture = fixture(), blockedInput = `*goes to ${blocked.id}*`, blockedParsed = parse(blockedFixture, blockedInput), blockedBefore = state(blockedFixture);
const blockedOutcome = await blockedFixture.session.submitPlayerInput(blockedInput), blockedAfter = state(blockedFixture);
check(blockedAfter.player_location, market, "unreachable route no location change"); check(blockedAfter.world_minute, 600, "unreachable route no time change");
await blockedFixture.session.shutdown({ discard_unsaved: true });

const clerk = fixture({ location: "heartstone_square" }), clerkInput = "*goes over to the clerk*", clerkBefore = state(clerk), clerkParsed = parse(clerk, clerkInput);
const clerkOutcome = await clerk.session.submitPlayerInput(clerkInput), clerkAfter = state(clerk);
await clerk.session.shutdown({ discard_unsaved: true });

const output = { audit_only: true, production_baseline: "cad4d57", previous_movement_fix: "e4b3a45", paid_calls: 0, assertions, starting_location: market, starting_world_minute: 600, companion_fixture: "created character campaign_character_audit_mira, no permanent follow state", matrix, destinations, sequence, safety,
  day_boundary: { before: dayBefore, after: dayAfter }, persistence,
  unreachable: { input: blockedInput, canonical_destination: blocked.id, before: blockedBefore, parsed: blockedParsed, turn_ok: blockedOutcome.ok, after: blockedAfter },
  local_clerk_from_other_scene: { input: clerkInput, before: clerkBefore, parsed: clerkParsed, turn_ok: clerkOutcome.ok, after: clerkAfter } };
await mkdir("docs/evaluations/player-travel-authority", { recursive: true });
await writeFile("docs/evaluations/player-travel-authority/current-traces.json", JSON.stringify(output, null, 2) + "\n");
const rows = matrix.map(r => {
  const movement = r.parsed.direct?.natural?.actions.find(a => a.kind === "movement"), requested = movement?.detail.destination ?? r.destination_resolved;
  const recognized = r.parsed.error || movement || r.parsed.runtime_proposal.some(c => c.kind === "runtime_delta" && c.delta.player_location);
  const reason = r.error ?? movement?.detail.reason ?? (movement ? movement.status : recognized ? "strict grammar" : "no player movement grammar match");
  return `| \`${r.input.replaceAll("|", "\\|")}\` | ${recognized ? "Yes" : "No"} | ${requested ?? "—"} | ${r.moved ? "Yes" : "No"} | ${r.time_advanced} | ${reason} |`;
});
await writeFile("docs/evaluations/player-travel-authority/grammar-matrix.md", "# Current travel grammar: offline audit\n\nStarting at Calderan Slave Market, minute 600, with a present created Mira. Each input executes a real detached turn with scripted neutral narration. Recognized means player world-movement grammar matched, including rejected/unknown destinations. Destination is the named node for natural actions or prepared target for strict commands; `heartstone` routes to `heartstone_lr`. Committed means the authoritative location changed, not merely that the turn finalized. No production behavior changed.\n\n| Input | Movement recognized? | Destination resolved? | World travel committed? | Minutes advanced | Why / why not |\n|---|---|---|---|---|---|\n" + rows.join("\n") + "\n");
console.log(JSON.stringify({ assertions, matrix_rows: matrix.length, sequence: sequence.map(s => ({ input: s.input, location: s.after.player_location, minute: s.after.world_minute, delivery: s.result.reconciliation.delivered, http: s.http_final.scene })), safety: safety.map(s => ({ input: s.input, draft: s.draft, location: s.after.player_location, mira: s.after.mira_location, delivery: s.result?.reconciliation.delivered })), blocked: blocked.id, persistence }, null, 2));
