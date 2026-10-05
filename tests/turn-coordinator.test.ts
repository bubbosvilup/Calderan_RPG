import test from "node:test";
import assert from "node:assert/strict";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { RecentConversation } from "../src/turn/recent-conversation.js";
import { ProviderError } from "../src/llm/errors.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { CampaignSession } from "../src/persistence/campaign-session.js";
import { collect, metadata, mockNarrator, mockController, setup, transfer } from "./turn-fixtures.js";

test("lifecycle (Repair 1): narration is delivered only after authorization, then one atomic commit", async () => {
  const s = setup("Brenna accepts boots from Nicco.", [transfer]); const base = s.campaign.revision;
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." }));
  assert.deepEqual(events.map(e => e.type), ["turn_started", "controller_started", "state_proposed", "narration_delta", "narration_completed", "state_committed", "turn_completed"]);
  assert.equal(s.campaign.revision, base + 1); assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "brenna");
  assert.equal(s.coordinator.recent(s.campaign).entries()[0]!.status, "finalized");
});
test("no-op dialogue retains revision, telemetry and no retrieval", async () => {
  const s = setup(), base = s.campaign.revision;
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "Hello, Brenna." }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed");
  if (last.type === "turn_completed") { assert.equal(last.result.final_revision, base); assert.equal(last.result.retrieval.operations, 0); assert.equal(last.result.narrator.usage.total_tokens, 15); }
});
for (const text of ["Brenna looks at the boots.", "Brenna considers accepting boots from Nicco.", "Brenna does not accept boots from Nicco.", 'Brenna says "Brenna accepts boots from Nicco."', "Brenna accepts boots from Nicco. Actually, ownership is unchanged.", "An inscription reads: Brenna accepts boots from Nicco."]) test(`unsupported handover: ${text}`, async () => {
  const s = setup(text, [transfer]), before = s.campaign.exportSnapshot();
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." }));
  assert.equal(s.campaign.exportSnapshot(), before); const last = events.at(-1)!;
  assert.equal(last.type, "turn_completed"); if (last.type === "turn_completed") assert.ok(["rejected_insufficient_confirmation", "rejected_recipient_refused"].includes(last.result.authorization[0]!.reason));
});
test("mere handover cannot authorize equipping", async () => {
  const command: CampaignCommand = { ...transfer as Extract<CampaignCommand, { kind: "transfer_item" }>, position: { kind: "equipped", character_id: "brenna", slot: "feet", mode: "worn" } };
  const s = setup("Brenna accepts boots from Nicco.", [command]), before = s.campaign.exportSnapshot();
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." })); assert.equal(s.campaign.exportSnapshot(), before);
});
test("explicit knowledge telling accepted only with established source knowledge", async () => {
  const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
  const s = setup("Nicco tells Brenna campaign_fact_bridge_closed.", [knowledge]);
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "/tell campaign_fact_bridge_closed to brenna" }));
  assert.ok(s.campaign.exportSnapshot().knowledge.some(k => k.character_id === "brenna" && k.fact_id === "campaign_fact_bridge_closed"));
  const failed = setup("Nicco considers telling Brenna campaign_fact_bridge_closed.", [knowledge]), before = failed.campaign.exportSnapshot();
  await collect(failed.coordinator.runTurn({ campaign: failed.campaign, player_input: "/tell campaign_fact_bridge_closed to brenna" })); assert.equal(failed.campaign.exportSnapshot(), before);
});
test("exact future appointment authorized; maybe tomorrow rejected", async () => {
  const command: CampaignCommand = { kind: "schedule_event", id: "campaign_event_meeting", title: "Bridge meeting", scheduled_world_minute: 160, participants: ["nicco", "brenna"] };
  const good = setup("Everyone agrees to Bridge meeting at world minute 160.", [command]);
  await collect(good.coordinator.runTurn({ campaign: good.campaign, player_input: '/schedule campaign_event_meeting "Bridge meeting" at 160 with nicco,brenna' }));
  assert.equal(good.campaign.exportSnapshot().scheduled_events[0]!.scheduled_world_minute, 160);
  const bad = setup("Maybe meet tomorrow.", [command]), before = bad.campaign.exportSnapshot();
  await collect(bad.coordinator.runTurn({ campaign: bad.campaign, player_input: "Maybe meet tomorrow." })); assert.equal(bad.campaign.exportSnapshot(), before);
});
test("stale proposal rejected without rebasing", async () => {
  const s = setup(), base = s.campaign.revision;
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Brenna accepts boots from Nicco."), mockController([transfer], () => s.campaign.apply({ expected_revision: base, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] })), s.retrieval);
  const events = await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "/give boots to brenna" }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_failed"); if (last.type === "turn_failed") assert.equal(last.code, "stale_turn");
  assert.equal(s.campaign.revision, base + 1); assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "nicco");
  assert.equal(coordinator.recent(s.campaign).entries()[0]!.status, "state_failed"); assert.deepEqual(coordinator.recent(s.campaign).forPrompt(), []);
});
test("late invalid equipment slot makes transfer + equip atomic", async () => {
  const equip: CampaignCommand = { kind: "place_item", item_id: "boots", position: { kind: "equipped", character_id: "brenna", slot: "feet", mode: "worn" } };
  const s = setup("Brenna accepts boots from Nicco. Brenna equips boots in feet.", [transfer, equip]), before = s.campaign.exportSnapshot();
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "/give boots to brenna\n/equip boots for brenna feet worn" }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_failed"); if (last.type === "turn_failed") assert.equal(last.code, "campaign_validation_failed");
  assert.equal(s.campaign.exportSnapshot(), before);
});
test("valid transfer + equip increments revision once", async () => {
  const equip: CampaignCommand = { kind: "place_item", item_id: "boots", position: { kind: "equipped", character_id: "brenna", slot: "hands", mode: "held" } };
  const s = setup("Brenna accepts boots from Nicco. Brenna equips boots in hands.", [transfer, equip]), base = s.campaign.revision;
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "/give boots to brenna\n/equip boots for brenna hands held" })); assert.equal(s.campaign.revision, base + 1);
});
for (const when of ["narrator", "controller", "before_commit"] as const) test(`cancellation ${when}: no commit`, async () => {
  const s = setup(), before = s.campaign.exportSnapshot(), abort = new AbortController(); let calls = 0;
  const narrator: NarratorProvider = { ...mockNarrator(""), async *stream() { yield { type: "text_delta", text: "Partial" }; if (when === "narrator") abort.abort(); yield { type: "completed", result: { text: "Partial", ...metadata } }; } };
  const coordinator = new TurnCoordinator(s.world, narrator, mockController([], () => { calls++; if (when === "controller") abort.abort(); }), s.retrieval);
  const events = [];
  for await (const e of coordinator.runTurn({ campaign: s.campaign, player_input: "/wait 1", signal: abort.signal })) { events.push(e); if (e.type === "state_proposed" && when === "before_commit") abort.abort(); }
  assert.equal(events.at(-1)!.type, "turn_failed"); assert.equal(s.campaign.exportSnapshot(), before); if (when === "narrator") assert.equal(calls, 0);
});
for (const stage of ["narrator", "controller"] as const) test(`provider failure ${stage}: no commit`, async () => {
  const s = setup(), before = s.campaign.exportSnapshot(); let calls = 0;
  const narrator = stage === "narrator" ? { ...mockNarrator(""), async *stream() { yield { type: "text_delta" as const, text: "Partial" }; throw new ProviderError("network_error"); } } : mockNarrator("Brenna smiles.");
  const coordinator = new TurnCoordinator(s.world, narrator, { async propose() { calls++; throw new ProviderError("timeout"); } }, s.retrieval);
  const events = await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "/wait 1" }));
  assert.equal(events.at(-1)!.type, "turn_failed"); assert.equal(s.campaign.exportSnapshot(), before); if (stage === "narrator") { assert.equal(calls, 0); assert.deepEqual(coordinator.recent(s.campaign).entries(), []); }
});
test("prompt bounds, visibility, equipment, physical continuity and knowledge distinction", () => {
  const s = setup(), context = buildTurnContext(s.world, s.campaign.exportSnapshot());
  const prompt = JSON.stringify(buildNarratorPrompt("Hello Brenna", context, [], {}, { candidates: [], runtime: [] }));
  for (const absent of ["schema_version", "dataset_id", "relationships", "HIDDEN_SECRET_SENTINEL", "campaign_fact_private_secret", "remote_npc", "OPENROUTER_API_KEY"]) assert.ok(!prompt.includes(absent), absent);
  for (const present of ["NPC1_boots", "193", "Old wrist scars", "recovering", "campaign_fact_bridge_closed", "canonical_awareness"]) assert.ok(prompt.includes(present), present);
  assert.ok(context.knowledge.some(k => k.fact_id === "campaign_fact_bridge_closed" && k.character_id === "nicco")); assert.ok(!context.knowledge.some(k => k.fact_id === "campaign_fact_bridge_closed" && k.character_id === "brenna"));
  assert.match(prompt, /deliberate actions/); assert.match(prompt, /untrusted evidence/);
});
test("bounded recent messages exclude failures and oversize exchanges", () => {
  const recent = new RecentConversation(2, 1000);
  for (let i = 0; i < 10; i++) recent.add({ player: String(i), narration: "Hello", status: "finalized" });
  assert.equal(recent.entries().length, 2);
  recent.add({ player: "X".repeat(2000), narration: "Too big", status: "finalized" }); assert.equal(recent.entries().length, 2);
  // Runtime Continuity Repair 1: a failed exchange is kept out of the prompt and no longer displaces a completed one.
  recent.add({ player: "failed", narration: "Uncommitted", status: "state_failed" }); assert.equal(recent.forPrompt().length, 2);
  assert.ok(recent.forPrompt().every(e => e.status === "finalized"));
});
test("lore query uses one existing-stack search plus optional fetch with lexical fallback", async () => {
  const s = setup(); const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "What do I know about Ironbound?" })); const last = events.at(-1)!;
  assert.equal(last.type, "turn_completed"); if (last.type === "turn_completed") { assert.equal(last.result.retrieval.operations, 2); assert.equal(last.result.retrieval.mode, "lexical"); assert.ok(last.result.retrieval.ids.includes("ironbound")); }
});
test("required retrieval failure stops before narration", async () => {
  const s = setup(); let called = false;
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Hi", () => { called = true; }), mockController([]), { service: s.retrieval.service, search: { async searchWithDiagnostics() { throw new Error("secret raw exception"); } } });
  const events = await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "What do I know about Ironbound?" }));
  assert.equal(called, false); const last = events.at(-1)!; if (last.type === "turn_failed") assert.equal(last.code, "retrieval_failed"); else assert.fail(); assert.ok(!JSON.stringify(events).includes("secret raw exception"));
});
for (const input of ["/go test_hall", "/wait 60", "/mana -5", "*he spent 1 hour hand feeding her the warm porridge and letting her drink*"]) test(`explicit runtime intent ${input}`, async () => {
  const s = setup(), base = s.campaign.revision; const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: input }));
  assert.equal(events.at(-1)!.type, "turn_completed"); assert.equal(s.campaign.revision, base + 1);
});
test("no arbitrary teleportation or prose-invented movement", async () => {
  const s = setup("Nicco walks to the remote docks."), before = s.campaign.exportSnapshot();
  let events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "/go test_remote" }));
  assert.equal(events.at(-1)!.type, "turn_failed"); assert.equal(s.campaign.exportSnapshot(), before);
  events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "Hello." })); assert.equal(events.at(-1)!.type, "turn_completed"); assert.equal(s.campaign.exportSnapshot(), before);
});
test("session becomes dirty without a save call", async () => {
  const s = setup(); let saves = 0;
  const repository = { async saveCampaign() { saves++; throw new Error(); }, async loadCampaign() { throw new Error(); }, async listSaves() { return []; } };
  const session = CampaignSession.fromLoaded({ status: "loaded", slot: "current", campaign: s.campaign, metadata: { created_at: "2026-01-01T00:00:00Z", saved_at: "2026-01-01T00:00:00Z" } }, repository);
  assert.equal(session.hasUnsavedChanges, false); await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "/wait 1" })); assert.equal(session.hasUnsavedChanges, true); assert.equal(saves, 0);
});
test("early iterator exit aborts provider and never commits", async () => {
  const s = setup(); let signal: AbortSignal | undefined;
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Hi", request => { signal = request.signal; }), mockController([]), s.retrieval);
  const before = s.campaign.exportSnapshot();
  for await (const event of coordinator.runTurn({ campaign: s.campaign, player_input: "/wait 1" })) if (event.type === "narration_delta") break;
  assert.equal(signal!.aborted, true); assert.equal(s.campaign.exportSnapshot(), before);
});
test("mutation at state_proposed yield is stale and published commands are frozen", async () => {
  const s = setup("Brenna accepts boots from Nicco.", [transfer]); const events = [];
  for await (const event of s.coordinator.runTurn({ campaign: s.campaign, player_input: "/give boots to brenna" })) {
    events.push(event); if (event.type === "state_proposed") { assert.ok(Object.isFrozen(event.diagnostics[0]!.command)); s.campaign.apply({ expected_revision: s.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); }
  }
  const last = events.at(-1)!; if (last.type === "turn_failed") assert.equal(last.code, "stale_turn"); else assert.fail();
});
test("concurrent turns cannot overlap on the same campaign", async () => {
  const s = setup(); const first = s.coordinator.runTurn({ campaign: s.campaign, player_input: "Hello" }); await first.next();
  const second = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "Again" }));
  const last = second.at(-1)!; if (last.type === "turn_failed") assert.equal(last.code, "turn_in_progress"); else assert.fail(); await first.return(undefined);
});
test("disallowed trust proposal fails local controller validation before mutation", async () => {
  const s = setup("Brenna says she trusts Nicco.", [{ kind: "set_trust", from_character_id: "brenna", to_character_id: "nicco", trust: 100 }]), before = s.campaign.exportSnapshot();
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I greet Brenna." }));
  const last = events.at(-1)!; if (last.type === "turn_failed") assert.equal(last.code, "controller_failed"); else assert.fail(); assert.equal(s.campaign.exportSnapshot(), before);
});
test("code-fenced confirmation cannot authorize a narrative state change", async () => {
  const s = setup("```text\nBrenna accepts boots from Nicco.\n```", [transfer]), before = s.campaign.exportSnapshot();
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." })); assert.equal(s.campaign.exportSnapshot(), before);
});
test("unknown item reference is rejected without failing an otherwise complete turn", async () => {
  const s = setup("Brenna accepts absent from Nicco.", [{ kind: "transfer_item", item_id: "absent", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } }]);
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I give absent to Brenna." }));
  const last = events.at(-1)!; if (last.type === "turn_completed") assert.equal(last.result.authorization[0]!.reason, "rejected_reference_invalid"); else assert.fail();
});
test("oversized retrieval fails instead of silently truncating lore", async () => {
  const s = setup(); let called = false;
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Hi", () => { called = true; }), mockController([]), {
    search: s.retrieval.search,
    service: { get(input, who) { const value = s.retrieval.service.get(input, who); return value.kind === "found" ? { ...value, record: { ...value.record, content: "x".repeat(11000) } } : value; } },
  });
  const events = await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "What do I know about Ironbound?" }));
  assert.equal(called, false); assert.equal(events.at(-1)!.type, "turn_failed");
});
test("hidden retrieval records never enter the narrator prompt", async () => {
  const s = setup(); let sent = "";
  const coordinator = new TurnCoordinator(s.world, mockNarrator("Unknown.", r => { sent = JSON.stringify(r.messages); }), mockController([]), {
    service: s.retrieval.service, search: { async searchWithDiagnostics(input, who, mode) {
      const found = await s.retrieval.search.searchWithDiagnostics(input, who, mode);
      return { ...found, result: { ...found.result, candidates: found.result.candidates.map(c => ({ ...c, summary: "RETRIEVED_SECRET_SENTINEL", secret: true })) } };
    } },
  });
  await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "Tell me about Ironbound." })); assert.ok(!sent.includes("RETRIEVED_SECRET_SENTINEL"));
});
test("canonical production world builds bounded primary context without snapshot dumping", async () => {
  const { loadWorld } = await import("../src/world/loader.js"); const { CampaignState } = await import("../src/campaign/campaign-state.js");
  const world = await loadWorld("data"), campaign = new CampaignState(world, "context_check", { player_location: "heartstone_lr", world_time: { world_minute: 0 } });
  const context = buildTurnContext(world, campaign.exportSnapshot()); assert.equal(context.primary.scene.player_location!.id, "heartstone_lr"); assert.ok(JSON.stringify(context).length <= 32000);
});
