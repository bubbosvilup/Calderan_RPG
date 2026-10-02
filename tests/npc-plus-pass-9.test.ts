import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { metadata, collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { invitedFollowers, leftBehindNotes } from "../src/turn/follow-invitation.js";
import { characterLocation, type MovableCharacter } from "../src/turn/character-movement.js";
import { CONTROLLER_POLICY } from "../src/llm/openrouter/deepseek-controller.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";

/** NPC+ Pass 9: consent-preserving household following. Invitation != movement; only completed narrated following moves an NPC+. */
function household(members: readonly string[] = ["brenna", "maren"]) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...members.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })),
  ] });
  return f;
}
async function play(narration: string, input = "I go down to the main hall. Maren, come with me.", o: { members?: readonly string[]; commands?: readonly CampaignCommand[]; evidence?: readonly string[] } = {}) {
  const f = household(o.members), service = new RetrievalService(f.world), requests: GenerationRequest[] = [];
  const narrator = { async generate(r: GenerationRequest) { requests.push(r); return { text: narration, ...metadata }; },
    async *stream(r: GenerationRequest) { requests.push(r); yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; } };
  const coordinator = new TurnCoordinator(f.world, narrator, { async propose() { return { commands: o.commands ?? [], evidence: o.evidence ?? [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: input }));
  const done = events.find(e => e.type === "turn_completed");
  assert.ok(done && done.type === "turn_completed", JSON.stringify(events.at(-1)));
  const snapshot = f.campaign.exportSnapshot();
  const where = (id: string) => characterLocation(snapshot, f.world, id);
  const moved = (id: string) => snapshot.premium_characters.find(p => p.character_id === id)?.dynamic.recent_developments.filter(e => e.kind === "moved") ?? [];
  const prompt = requests[0]!.messages.map(m => m.content).join("\n");
  return { result: done.result as TurnResult, snapshot, where, moved, prompt };
}

// ------------------------------------------------------------------------------------------------ implicit-destination following
for (const narration of [
  "Nicco goes down the stairs. Maren follows him.",
  "Nicco goes down the stairs. Maren follows a step behind, catching the door he left ajar.",
  "Nicco descends the stairs. Maren's lighter steps came after.",
  "Nicco goes downstairs. Maren rises and follows him down the stairs.",
  "Nicco descends. Maren falls into step behind him.",
  "Nicco descends. A moment later, Maren follows him down.",
]) test(`completed follow without a destination clause moves the invited NPC+ to Nicco's arrival: ${narration}`, async () => {
  const r = await play(narration);
  assert.equal(r.where("nicco"), "test_hall");
  assert.equal(r.where("maren"), "test_hall");
  assert.equal(r.where("brenna"), "test_room", "nobody else moves");
  const decision = r.result.authorization.find(d => d.command.kind === "move_character");
  assert.equal(decision?.authorized, true); assert.equal(decision?.reason, "authorized_narrative_confirmation");
  assert.deepEqual(r.moved("maren").map(e => e.kind === "moved" ? e.to : undefined), ["test_hall"]);
  assert.equal(r.result.narration_reconciliation?.issues.length ?? 0, 0, "an authorized follow is not erased by the audit");
});

test("authored active NPC+ (Gerome) descending after Nicco commits through existing authorization with a moved entry", async () => {
  const r = await play("Nicco goes down to the hall. Gerome descends after him.", "I go down to the main hall. Gerome, come with me.", { members: ["gerome"] });
  assert.equal(r.where("gerome"), "test_hall");
  assert.equal(r.moved("gerome").length, 1);
});

test("a controller move_character proposal for the follow is authorized by the same evidence (no double proposal)", async () => {
  const r = await play("Nicco goes down the stairs. Maren follows him.", undefined, { commands: [{ kind: "move_character", character_id: "maren", location_id: "test_hall" }] });
  assert.equal(r.result.authorization.filter(d => d.command.kind === "move_character").length, 1);
  assert.equal(r.where("maren"), "test_hall");
});

for (const [label, narration, input] of [
  ["request alone", "Nicco goes down the stairs into the main hall.", undefined],
  ["hesitation", "Nicco goes down the stairs. Maren hesitates.", undefined],
  ["refusal", "Nicco goes down the stairs. Maren refuses to follow.", undefined],
  ["stays", "Nicco goes down the stairs. Maren stays where she is.", undefined],
  ["no footsteps follow", "Nicco goes down the stairs. No footsteps follow.", undefined],
  ["negated", "Nicco goes down the stairs. Maren does not follow.", undefined],
  ["gaze follows", "Nicco goes down the stairs. Maren's gaze follows him.", undefined],
  ["eyes follow the conversation", "Nicco goes down the stairs. Maren's eyes follow the conversation.", undefined],
  ["follows his reasoning", "Nicco goes down the stairs. She follows his reasoning.", undefined],
  ["follows the sound with her eyes", "Nicco goes down the stairs. Maren follows the sound with her eyes.", undefined],
  ["almost", "Nicco goes down the stairs. Maren almost follows him.", undefined],
  ["modal might", "Nicco goes down the stairs. Maren might follow.", undefined],
  ["modal would", "Nicco goes down the stairs. Maren would follow him, given time.", undefined],
  ["future", "Nicco goes down the stairs. Maren will follow later.", undefined],
  ["historical", "Nicco goes down the stairs. Maren followed him yesterday.", undefined],
  ["watches him leave", "Nicco goes down the stairs. Maren watches him leave.", undefined],
  ["waits at the stairs", "Nicco goes down the stairs. Maren waits at the stairs.", undefined],
  ["unresolvable destination", "Nicco goes down the stairs. Maren follows him to the window.", undefined],
  ["Nicco did not move", "Maren follows him.", "Maren, come with me."],
] as const) test(`no movement: ${label}`, async () => {
  const r = await play(narration, input ?? undefined);
  assert.equal(r.where("maren"), "test_room");
  assert.equal(r.moved("maren").length, 0);
  assert.equal(r.result.authorized_commands.some(c => c.kind === "move_character"), false);
});

test("NPC+ not present: an active NPC+ already elsewhere is never moved by an implicit follow", async () => {
  // Maren is an active member but already in the hall (Nicco's arrival): nothing to resolve, no move, no development.
  const f = household(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: "test_hall" }] });
  const service = new RetrievalService(f.world), text = "Nicco goes down the stairs. Maren follows him.";
  const c = new TurnCoordinator(f.world, { async generate() { return { text, ...metadata }; }, async *stream() { yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const before = f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments.length;
  const done = (await collect(c.runTurn({ campaign: f.campaign, player_input: "I go down to the main hall." }))).find(e => e.type === "turn_completed");
  assert.ok(done && done.type === "turn_completed");
  assert.equal(done.result.authorized_commands.some(x => x.kind === "move_character"), false);
  assert.equal(f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments.length, before);
});

test("authored non-NPC+ NPC: behaviour unchanged — never moved, and the audit still protects state", async () => {
  const r = await play("Nicco goes down the stairs. Gerome follows him.", "I go down to the main hall. Gerome, come with me.", { members: ["maren"] });
  assert.equal(r.where("gerome"), "test_room");
  assert.ok(r.result.narration_reconciliation?.issues.some(i => i.kind === "absent_participant" || i.kind === "uncommitted_movement"));
  assert.match(r.prompt, /Maren stays there/, "a non-invited NPC+ keeps the conservative note");
});

test("unsupported NPC+ follow narration (no resolvable destination) is still caught by the audit", async () => {
  const r = await play("Nicco goes down the stairs. Maren follows him to the window and sits.");
  assert.equal(r.where("maren"), "test_room");
  assert.ok(r.result.narration_reconciliation?.issues.some(i => i.kind === "absent_participant" || i.kind === "uncommitted_movement"));
});

// ------------------------------------------------------------------------------------------------ invitation + note
const mk = (id: string): MovableCharacter => ({ id, names: [id[0]!.toUpperCase() + id.slice(1)], sex: "female" });
const two = [mk("maren"), mk("brenna")];
test("invitation detection is narrow, sentence-scoped and consent-preserving", () => {
  assert.deepEqual(invitedFollowers("I go down. Maren, come with me.", two), ["maren"]);
  assert.deepEqual(invitedFollowers("Would you come with me?", [mk("maren")]), ["maren"]);
  assert.deepEqual(invitedFollowers("Anyone who wants can come along.", two), ["maren", "brenna"]);
  assert.deepEqual(invitedFollowers("Maren, come back up with me if you like.", two), ["maren"]);
  assert.deepEqual(invitedFollowers("\"Brenna, would you like to come and sit by the hearth?\"", two), ["brenna"]);
  assert.deepEqual(invitedFollowers("Come with me.", [mk("maren")]), ["maren"], "an unnamed invitation reaches the sole eligible NPC+");
  assert.deepEqual(invitedFollowers("Gerome, come with me.", [mk("maren")], ["Gerome"]), [], "naming someone else never reaches a different NPC+");
  for (const notInvite of ["You must come with me, Maren.", "Maren, come with me or else.", "Maren, you have to come with me.", "If Maren came with me, it would be easier.",
    "Yesterday I told Maren to come with me.", "I remember asking Maren to come with me.", "Maren, don't come with me.", "Maren, stay here.", "I go down to the hall.",
    "Come with me.", "Imagine Maren came along."])
    assert.deepEqual(invitedFollowers(notInvite, two), [], notInvite);
});
test("the left-behind note: neutral choice for invited NPC+, byte-identical conservative note for everyone else", () => {
  const [neutral] = leftBehindNotes([mk("maren")], ["maren"], "Observation room", "Main hall");
  assert.match(neutral!, /invited to come along and decides freely whether to follow him: do not assume either choice/);
  assert.doesNotMatch(neutral!, /stays there|Maren follows|wants to/);
  assert.deepEqual(leftBehindNotes(two, [], "Observation room", "Main hall"),
    ["Nicco leaves Observation room. Maren, Brenna stay there: do not have Nicco bring or carry them. Someone comes along only if they themselves clearly follow him, narrated explicitly."]);
  assert.equal(leftBehindNotes(two, ["maren"], "Observation room", "Main hall").length, 2);
});
test("the narrator receives the neutral choice for the invited NPC+ only, and no automatic following follows from it", async () => {
  const r = await play("Nicco goes down the stairs alone.", "I go down to the main hall. Maren, come with me.");
  assert.match(r.prompt, /Maren was invited to come along/);
  assert.match(r.prompt, /Brenna stays there/);
  assert.equal(r.where("maren"), "test_room", "an invitation alone never moves anyone");
});
test("controller guidance: authored household members use move_character; leave_scene only for a completed departure with NO destination", () => {
  assert.match(CONTROLLER_POLICY, /uses move_character with the known place they reached/);
  assert.match(CONTROLLER_POLICY, /establishes NO destination at all/);
  assert.match(CONTROLLER_POLICY, /A known place always wins over leave_scene/);
});
test("a controller leave_scene for an authored NPC+ is still rejected (authorization unchanged)", async () => {
  const r = await play("Nicco goes down the stairs. Maren follows him.", undefined, { commands: [{ kind: "leave_scene", character_id: "maren" }] });
  assert.equal(r.result.authorization.find(d => d.command.kind === "leave_scene")?.authorized, false);
  assert.equal(r.where("maren"), "test_hall", "the derived move still applies");
});
