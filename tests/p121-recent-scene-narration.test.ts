import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WorldStore } from "../src/world/world-store.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, dialogueFocused } from "../src/turn/prompt-builder.js";
import { RecentConversation, type RecentExchange } from "../src/turn/recent-conversation.js";
import { recentSceneNarration, RECENT_SCENE_NARRATION_CHARACTERS, RECENT_SCENE_NARRATION_RULE } from "../src/turn/recent-scene-narration.js";
import { rpgNarration } from "../src/turn/rpg-dialogue.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { narratorPackOf, renderCandidateRequest } from "../src/turn/narrator-pack.js";
import { losslessCandidate, renderLosslessCandidate } from "../src/turn/lossless-knowledge.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { collect, mockNarrator, mockController } from "./turn-fixtures.js";

const world = new WorldStore(JSON.parse(await readFile("docs/evaluations/p12-scene-continuity/fixture-world.json", "utf8")));
function fixture(known = true) {
  const campaign = new CampaignState(world, "p121", { player_location: "audit_room", world_time: { world_minute: 600 } });
  if (known) campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(world, campaign.exportSnapshot(), "korvin")] });
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, mockNarrator("*The hall is quiet.*"), mockController([]), { service, search: new HybridSearch(service) });
  return { campaign, coordinator, context: buildTurnContext(world, campaign.exportSnapshot()) };
}
const exchange = (narration: string, location_id = "audit_room", player = "Hello."): RecentExchange => ({ narration, player, location_id, status: "finalized" });
function prompt(entries: readonly RecentExchange[], input = "*looks around*", known = true) {
  const f = fixture(known), history = new RecentConversation();
  for (const e of entries) history.add(e);
  const request = buildNarratorPrompt(input, f.context, history.forPrompt(), {}, { candidates: [], runtime: [] }, { recent_scene_source: history.finalized() });
  return { ...f, request, history, text: request.messages[0]!.content };
}
function block(text: string): string {
  const start = text.indexOf("[RECENT SCENE NARRATION]\n");
  return start < 0 ? "" : text.slice(start, text.indexOf("[PLAYER ACTION", start)).trimEnd();
}
for (const [category, narration, input] of [
  ["B door", "*The front door swings shut.*", "*walks toward the door*"],
  ["D restraint", "*Maren's wrists remain tied.*", "*looks at her hands*"],
  ["C packet", "*Korvin places a folded packet on the table.*", "*picks up the packet*"],
  ["E position", "*Maren crosses the room and sits beside the hearth.*", "*speaks to her*"],
] as const) test(`P12.1 ${category} survives the next prepared request without state mutation`, () => {
  const f = prompt([exchange(narration)], input);
  assert.ok(block(f.text).includes(narration));
  assert.ok(block(f.text).includes(RECENT_SCENE_NARRATION_RULE));
  assert.deepEqual(f.campaign.exportSnapshot(), fixture().campaign.exportSnapshot());
  assert.deepEqual(f.history.entries(), [exchange(narration)]);
});

for (const depth of [1, 2, 3, 5]) test(`P12.1 exact two-exchange window at depth ${depth}`, () => {
  const entries = Array.from({ length: depth }, (_, i) => exchange(`*Unique scene description ${i + 1}.*`));
  const f = prompt(entries);
  for (let i = 1; i <= depth; i++) assert.equal(block(f.text).includes(`description ${i}.`), i > depth - 2);
});

test("P12.1 speech stays only in dialogue history, with original narration and player history separate", () => {
  const entry = exchange("*The front door swings shut.*\nUnique NPC speech.\n*She waits.*", "audit_room", "*closes the front door*");
  const f = prompt([entry]);
  assert.equal(block(f.text).includes("Unique NPC speech."), false);
  assert.equal(f.text.split("Unique NPC speech.").length - 1, 1);
  assert.equal(block(f.text).includes("closes the front door"), false);
  assert.equal(f.text.split("closes the front door").length - 1, 1);
  assert.deepEqual(dialogueFocused(f.history.forPrompt(), f.context)[0]!.npc_dialogue, ["Unique NPC speech."]);
  assert.ok(block(f.text).includes("*She waits.*"));
});

test("P12.1 current visit excludes earlier locations and does not revive an old room on return", () => {
  const room = exchange("*Old room door shuts.*"), path = exchange("*The path is quiet.*", "audit_path");
  assert.equal(recentSceneNarration([room], "audit_path"), "");
  assert.equal(recentSceneNarration([room, path], "audit_room"), "");
  assert.equal(recentSceneNarration([room, path, exchange("*New room arrival.*")], "audit_room"), "*New room arrival.*");
  assert.equal(recentSceneNarration([room, { player: path.player, narration: path.narration, status: path.status }], "audit_room"), "");
  assert.equal(recentSceneNarration([room], undefined), "");
});

test("P12.1 actual travel and return requests exclude old room narration", async () => {
  const f = fixture();
  f.coordinator.recent(f.campaign).add(exchange("*The front door swings shut.*"));
  for (const location of ["audit_path", "audit_room"]) {
    const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: `*goes to ${location}*` }));
    assert.equal(events.at(-1)?.type, "turn_completed");
    assert.equal(f.campaign.exportSnapshot().runtime.scene.player_location, location);
    assert.equal(block(f.coordinator.contextRequest(f.campaign).messages[0]!.content).includes("front door swings shut"), false);
  }
});

test("P12.1 production turn and between-turn compaction receive only finalized delivered source", async () => {
  const f = fixture();
  const history = f.coordinator.recent(f.campaign);
  history.add(exchange("*The front door swings shut.*"));
  history.add({ ...exchange("*FAILED SECRET.*"), status: "state_failed" });
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "*looks at the door*" }));
  assert.equal(events.at(-1)?.type, "turn_completed");
  const text = f.coordinator.contextRequest(f.campaign).messages[0]!.content;
  assert.ok(block(text).includes("front door swings shut"));
  assert.ok(block(text).includes("The hall is quiet"));
  assert.equal(text.includes("FAILED SECRET"), false);
  assert.equal(history.forPrompt().some(e => e.location_id !== undefined), false, "metadata remains outside dialogue history");
});

test("P12.1 large paragraph is omitted whole; newest useful spans and dialogue survive under budget", () => {
  const f = prompt([exchange(`*${"large paragraph ".repeat(600)}*`), exchange("*Newest door closes.*\nStill speaking.\n*Newest seating remains.*")]);
  const narration = recentSceneNarration(f.history.finalized(), "audit_room");
  assert.ok(narration.length <= RECENT_SCENE_NARRATION_CHARACTERS);
  assert.equal(narration, "*Newest door closes.*\n*Newest seating remains.*");
  assert.equal(block(f.text).includes("large paragraph"), false);
  assert.ok(f.text.includes("Still speaking."));
  assert.deepEqual(rpgNarration(narration), ["*Newest door closes.*", "*Newest seating remains.*"]);
});

test("P12.1 a full budget prefers newest spans and counts inter-span separators", () => {
  const newest = `*${"n".repeat(998)}*`, older = `*${"o".repeat(998)}*`;
  const narration = recentSceneNarration([exchange(older), exchange(newest)], "audit_room");
  assert.equal(narration, newest, "two 1,000-character spans plus separator exceed the 2,000 limit");
  assert.equal(recentSceneNarration([exchange(`*${"x".repeat(1998)}*`)], "audit_room").length, 2000);
});

test("P12.1 identity mask is exact and its expansion counts toward the budget", () => {
  const f = prompt([exchange("*Korvin folds his arms.*")], "*looks around*", false);
  const gate = narratorIdentityGate(f.context)!;
  assert.ok(block(f.text).includes(gate.mask("*Korvin folds his arms.*")));
  assert.equal(block(f.text).includes("Korvin"), false);
  const expanded = recentSceneNarration([exchange(`*${"Korvin ".repeat(250)}*`), exchange("*Newest useful detail.*")], "audit_room", gate.mask);
  assert.equal(expanded, "*Newest useful detail.*");
  assert.equal(gate.identities.get("korvin")!.player_known_name, null);
});

test("P12.1 conflict retains structured canonical presence with explicit precedence and no movement", () => {
  const f = prompt([exchange("*Korvin leaves the room.*")], "*looks toward Korvin*");
  assert.ok(block(f.text).includes("*Korvin leaves the room.*"));
  assert.ok(f.text.includes("[PRESENT AND ABLE TO REACT]"));
  assert.ok(f.context.primary.scene.present_characters.some(c => c.id === "korvin"));
  assert.ok(f.text.includes("CURRENT STRUCTURED STATE overrides recent scene narration on conflict"));
  assert.ok(f.campaign.exportSnapshot().runtime.npc_locations.some(n => n.character_id === "korvin" && n.current_location === "audit_room"));
});

test("P12.1 every compaction layout preserves the complete continuity block byte for byte", () => {
  const f = prompt([exchange("*The front door swings shut.*\nSpeech stays separate.")]);
  const pack = narratorPackOf(f.request)!;
  assert.equal(block(pack.source.fixed_context.messages[0]!.content), block(f.text));
  const requests = [renderCandidateRequest(pack, pack.source.units), ...(["expanded", "grouped", "dictionary"] as const).map(layout => renderLosslessCandidate(pack, losslessCandidate(pack, layout)))];
  for (const request of requests) assert.equal(block(request.messages[0]!.content), block(f.text));
});

test("P12.1 malformed and legacy output does not guess narration; escaped stars stay intact", () => {
  for (const narration of ["*unfinished", "**bold**", "[DEBUG]\n*draft*", 'Korvin says, "Hello."', "Plain speech."]) assert.equal(recentSceneNarration([exchange(narration)], "audit_room"), "");
  assert.equal(recentSceneNarration([exchange("*An escaped \\* stays within narration.*\nHello.")], "audit_room"), "*An escaped \\* stays within narration.*");
});

test("P12.1 diagnostic history modes retain their previous projection without an extra prose copy", () => {
  const f = fixture(), history = [exchange("*The front door swings shut.*")];
  for (const mode of ["full_prose", "state_last"] as const) {
    const request = buildNarratorPrompt("*looks around*", f.context, history, {}, { candidates: [], runtime: [] }, { recent_context: mode, recent_scene_source: history });
    assert.equal(block(request.messages[0]!.content), "");
    assert.equal(request.messages[0]!.content.split("front door swings shut").length - 1, 1);
  }
});
