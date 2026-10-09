import test from "node:test";
import assert from "node:assert/strict";
import { setup, collect } from "./turn-fixtures.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { checkNarrative } from "../src/dev/narrative-checks.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { withHistoricalContext } from "../src/dev/historical-context.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { mockNarrator, metadata } from "./turn-fixtures.js";
const garments: CampaignCommand[] = ["pink_cotton", "pink_fluffy", "pink_shorts"].map(item_id => ({ kind: "transfer_item", mode: "handoff", item_id,  position: { kind: "carried", character_id: "brenna" } }));
const input = "I give Brenna the two pink shirts and the shorts.";
for (const narration of ["She snatches all three pieces at once, bundling them against her chest.", "Brenna takes them.", "Brenna accepts the clothes.", "She gathers all three into her arms.", "Brenna receives the garments.", "Brenna takes those clothes.", "Brenna picks up the shirts and shorts."]) test(`collective grounded acceptance: ${narration}`, async () => {
  const s = setup(narration, garments, true), revision = s.campaign.revision;
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: input }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed");
  if (last.type !== "turn_completed") return;
  assert.deepEqual(last.result.authorized_commands, garments);
  assert.equal(s.campaign.revision, revision + 1);
  assert.ok(Object.isFrozen(last.result.turn_evidence));
  assert.ok(Object.isFrozen(last.result.turn_evidence.player_intents[0]));
  assert.equal(last.result.turn_evidence.narrator_confirmations[0]!.collective, true);
  for (const item of s.campaign.exportSnapshot().items.filter(i => i.id.startsWith("pink_"))) assert.deepEqual(item.position, { kind: "carried", character_id: "brenna" });
});
for (const narration of ["Imagine this. Brenna takes them.", "If she agrees. Brenna takes them.", "Brenna takes them. She refuses.", "Brenna might accept them.", "Brenna takes the first shirt.", "Brenna takes the second shirt.", 'Brenna says "Brenna takes them."', "Brenna looks at the ring. She takes them.", "Brenna takes all four.", "Brenna wears the garments.", "Maren looks at Brenna. She takes them."]) test(`ambiguous or unconfirmed group stays unchanged: ${narration}`, async () => {
  const s = setup(narration, garments, true), before = s.campaign.exportSnapshot();
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: input }));
  assert.equal(s.campaign.exportSnapshot(), before);
});
for (const player of ["I give her the two pink shirts and the shorts.", "I give Brenna the two red shirts and the shorts.", "I give Brenna the two pink shirts except the shorts.", "I give Brenna the two pink shirts and a sword."]) test(`unresolved player references: ${player}`, async () => {
  const s = setup("Brenna takes them.", garments), before = s.campaign.exportSnapshot();
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: player })); assert.equal(s.campaign.exportSnapshot(), before);
});
const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
for (const [narration, accepted] of [
  ["Nicco explains the eastern bridge is closed to Brenna.", true],
  ["Brenna hears that the eastern bridge is closed from Nicco.", true],
  ["Brenna is told that the eastern bridge is closed.", true],
  ["Brenna reacts after hearing that the eastern bridge is closed.", true],
  ["Brenna looks worried.", false],
  ["Brenna witnesses the eastern bridge is closed.", false],
  ["Brenna infers the eastern bridge is closed.", false],
  ["Nicco might tell Brenna the eastern bridge is closed.", false],
] as const) test(`knowledge acquisition: ${narration}`, async () => {
  const s = setup(narration, [knowledge]), revision = s.campaign.revision;
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "/tell campaign_fact_bridge_closed to brenna" }));
  assert.equal(events.at(-1)!.type, "turn_completed"); assert.equal(s.campaign.revision, revision + Number(accepted));
});
test("qualitative checks are fixture diagnostics with positive and negative controls", () => {
  const s = setup(), context = buildTurnContext(s.world, s.campaign.exportSnapshot());
  for (const [text, category] of [["Gerome says hello.", "silent_character_speaking"], ["Brenna is barefoot.", "equipment_contradiction"], ["Maren adjusts her glasses.", "unestablished_accessory"], ["An axe leans against metal walls.", "unestablished_object"], ["You decide to leave.", "player_deliberate_takeover"], ["There is no information about Ironbound.", "retrieved_lore_denial"], ["BRENNA: Hello", "speaker_label"]]) assert.ok(checkNarrative(text!, "Hello", context, ["ironbound"], true).some(f => f.category === category));
  assert.deepEqual(checkNarrative("Gerome nods silently. Brenna shifts her booted feet. You notice a pause.", "Hello", context, [], true), []);
  assert.deepEqual(checkNarrative("An axe is visible.", "Hello", context), []);
});
test("historical decoration is bounded and never enters controller evidence or normal history", async () => {
  const window = [1, 2].map(n => ({ source_player_record: n * 2, source_assistant_record: n * 2 + 1, player_message: "old question", assistant_response: "HISTORICAL_ONLY_SENTINEL" }));
  const request = { system_prompt: "system", messages: [{ role: "user" as const, content: "[PLAYER ACTION] current" }] };
  assert.match(withHistoricalContext(request, window).messages[0]!.content, /NOT authoritative canon/);
  assert.throws(() => withHistoricalContext(request, window.slice(0, 1)));
  assert.throws(() => withHistoricalContext(request, [...window, ...window, ...window]));
  const s = setup(); let inspected = false;
  const provider = mockNarrator("Brenna nods.", r => assert.match(JSON.stringify(r), /HISTORICAL_ONLY_SENTINEL/));
  const coordinator = new TurnCoordinator(s.world, { generate: r => provider.generate(withHistoricalContext(r, window)), stream: r => provider.stream(withHistoricalContext(r, window)) }, { async propose(r) { inspected = true; assert.ok(!JSON.stringify(r).includes("HISTORICAL_ONLY_SENTINEL")); return { commands: [], ...metadata }; } }, s.retrieval);
  await collect(coordinator.runTurn({ campaign: s.campaign, player_input: "Hello" }));
  assert.ok(inspected); assert.ok(!JSON.stringify(coordinator.recent(s.campaign).entries()).includes("HISTORICAL_ONLY_SENTINEL"));
});
test("single explicit garment receipt never confirms the remaining offered set", async () => {
  const s = setup("Brenna's gaze shifts to the offered clothes. Without a word, she takes the cotton shirt, unfolding it.", garments, true);
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: input }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed");
  if (last.type === "turn_completed") assert.deepEqual(last.result.authorized_commands, [garments[0]]);
});
for (const phrase of ["Brenna agrees to meet at minute 160.", "We meet at world minute 160.", "Brenna might agree to meet at minute 160."]) test(`absolute agreement: ${phrase}`, async () => {
  const command: CampaignCommand = { kind: "schedule_event", id: "campaign_event_meeting", title: "Bridge meeting", scheduled_world_minute: 160, participants: ["nicco", "brenna"] };
  const s = setup(phrase, [command]), revision = s.campaign.revision;
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: '/schedule campaign_event_meeting "Bridge meeting" at 160 with nicco,brenna' }));
  assert.equal(s.campaign.revision, revision + Number(!phrase.includes("might")));
});

test("one participant agreement cannot bind additional participants", async () => {
  const command: CampaignCommand = { kind: "schedule_event", id: "campaign_event_meeting", title: "Bridge meeting", scheduled_world_minute: 160, participants: ["nicco", "brenna", "maren"] };
  const s = setup("Brenna agrees to meet at minute 160.", [command]), before = s.campaign.exportSnapshot();
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: '/schedule campaign_event_meeting "Bridge meeting" at 160 with nicco,brenna,maren' }));
  assert.equal(s.campaign.exportSnapshot(), before);
});
