import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { metadata, collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { characterLocation } from "../src/turn/character-movement.js";
import { edgeDirection, routeDirection } from "../src/world/vertical-direction.js";
import { loadWorld } from "../src/world/loader.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";

/**
 * NPC+ follow-recognition closure. The positives are the seven production FOLLOW drafts the live follow-choice probe recorded that the
 * Pass 10 grammar missed, read VERBATIM from the evaluation artifact. Direction-free forms (manner tails) and DOWN-only forms ("comes
 * down", "appears at the bottom of the stair") are covered, plus the audit's pronoun-arrival consistency check.
 */
type Row = { variant: string; invitation: number; sample: number; invitation_text: string; output: string };
const LIVE = readFileSync("docs/evaluations/pass10/follow-choice-live.jsonl", "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as Row);
const draft = (invitation: number, sample: number) => LIVE.find(r => r.variant === "production" && r.invitation === invitation && r.sample === sample)!;
const MISSED = [[0, 0], [2, 0], [2, 1], [0, 2], [0, 3], [0, 4], [2, 4]] as const;

function household(o: { members?: readonly string[]; niccoInHall?: boolean; marenInHall?: boolean } = {}) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...(o.members ?? ["brenna", "maren", "gerome"]).map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })),
    ...(o.niccoInHall ? [{ kind: "runtime_delta" as const, delta: { player_location: "test_hall" } }] : []),
    ...(o.marenInHall ? [{ kind: "move_character" as const, character_id: "maren", location_id: "test_hall" }] : [])] });
  return f;
}
async function play(input: string, text: string, commands: readonly CampaignCommand[] = [], evidence: readonly string[] = [], o: Parameters<typeof household>[0] = {}) {
  const f = household(o), service = new RetrievalService(f.world);
  const narrator = { async generate() { return { text, ...metadata }; }, async *stream() { yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } }; } };
  const co = new TurnCoordinator(f.world, narrator, { async propose() { return { commands, evidence, ...metadata }; } }, { service, search: new HybridSearch(service) });
  const done = (await collect(co.runTurn({ campaign: f.campaign, player_input: input }))).find(e => e.type === "turn_completed");
  assert.ok(done && done.type === "turn_completed");
  const s = f.campaign.exportSnapshot(), base = done.result.base_revision;
  // `moved` counts only entries written by THIS turn (setup moves also write history).
  return { result: done.result as TurnResult, where: (id: string) => characterLocation(s, f.world, id),
    moved: (id: string) => s.premium_characters.find(p => p.character_id === id)?.dynamic.recent_developments.filter(e => e.kind === "moved" && e.revision > base).length ?? 0 };
}
const movementIssues = (r: TurnResult) => (r.narration_reconciliation?.issues ?? []).filter(i => i.kind === "absent_participant" || i.kind === "uncommitted_movement");

// ------------------------------------------------------------------------------------------------ direction helper
test("direction: fixture stairs are DOWN/UP; same place OTHER; no route UNKNOWN", () => {
  const { world } = turnFixture();
  assert.equal(routeDirection(world, "test_room", "test_hall"), "DOWN");
  assert.equal(routeDirection(world, "test_hall", "test_room"), "UP");
  assert.equal(routeDirection(world, "test_room", "test_room"), "OTHER");
  assert.equal(routeDirection(world, "test_room", "test_remote"), "UNKNOWN");
});
test("direction: real Heartstone stair edges agree in both directions; doors are OTHER; a pure two-stair descent is DOWN", async () => {
  const world = await loadWorld("data");
  assert.equal(edgeDirection(world, "heartstone_f1", "heartstone_lr"), "DOWN");
  assert.equal(edgeDirection(world, "heartstone_lr", "heartstone_f1"), "UP");
  assert.equal(edgeDirection(world, "heartstone_lr", "heartstone_u1"), "DOWN");
  assert.equal(edgeDirection(world, "heartstone_u1", "heartstone_lr"), "UP");
  assert.equal(edgeDirection(world, "heartstone_lr", "heartstone_square"), "OTHER");
  assert.equal(routeDirection(world, "heartstone_f1", "heartstone_u1"), "DOWN");
  assert.equal(routeDirection(world, "heartstone_lr", "heartstone_cy"), "OTHER");
});

// ------------------------------------------------------------------------------------------------ live positives, three controller modes
for (const [invitation, sample] of MISSED) for (const mode of ["none", "correct", "wrong"] as const)
  test(`live production follow inv${invitation}/s${sample} (controller ${mode}): exactly one move to Nicco's arrival, one moved entry, audit-consistent`, async () => {
    const row = draft(invitation, sample);
    const commands: CampaignCommand[] = mode === "none" ? [] : [{ kind: "move_character", character_id: "maren", location_id: mode === "correct" ? "test_hall" : "test_remote" }];
    const r = await play(row.invitation_text, row.output, commands, mode === "none" ? [] : ["Maren"]);
    assert.equal(r.where("maren"), "test_hall");
    assert.equal(r.moved("maren"), 1);
    assert.equal(r.moved("brenna") + r.moved("gerome"), 0, "nobody else moves");
    assert.equal(r.result.authorized_commands.filter(c => c.kind === "move_character").length, 1);
    assert.deepEqual(movementIssues(r.result), []);
  });

// ------------------------------------------------------------------------------------------------ negatives
const DOWN = "I go down to the main hall. Maren, come with me.", BASE = "The stairs creak underfoot as Nicco descends into the main hall.";
for (const [label, sentence] of [
  ["comes down later", "Maren comes down later."], ["came down yesterday", "Maren came down the stairs yesterday."], ["might come down", "Maren might come down the stairs."],
  ["usually comes down", "Maren usually comes down after him."], ["does not come down", "Maren does not come down."], ["refuses to come down", "Maren refuses to come down."],
  ["comes down, then stops", "Maren comes down the stairs a moment later, then stops on the landing."], ["comes down to another place", "Maren comes down the stairs to the cellar."],
  ["comes down — into another place", "Maren comes down the stairs — into the cellar."], ["appears at the top", "Maren appears at the top of the stairs."],
  ["appears at the window", "Maren appears at the window."], ["appears near the table", "Maren appears near the table."], ["appears later", "Maren appears at the bottom of the stairs later."],
  ["appeared yesterday", "Maren appeared at the bottom of the stairs yesterday."], ["eyes follow him down", "Maren's eyes follow him down the stairs."],
  ["footsteps somewhere", "Footsteps sound somewhere above, then fade."], ["gaze follows", "Maren's gaze follows him."], ["follows his reasoning", "Maren follows his reasoning."],
  ["almost follows", "Maren almost follows him."], ["usually follows", "Maren usually follows him."], ["would follow", "Maren would follow him."],
  ["refused to follow", "Maren refused to follow."], ["followed yesterday", "Maren followed him yesterday."], ["will follow later", "Maren will follow later."],
  ["ornate stair prose", "The stairs creak and settle; somewhere a step groans under no one's weight."],
] as const) test(`no movement (Nicco moved DOWN): ${label}`, async () => {
  const r = await play(DOWN, `${BASE} ${sentence}`);
  assert.equal(r.where("maren"), "test_room"); assert.equal(r.moved("maren"), 0);
  assert.equal(r.result.authorized_commands.some(c => c.kind === "move_character"), false);
});
for (const sentence of ["Maren comes down the stairs a moment later.", "Maren appears at the bottom of the stairs.", "Maren came down a moment after, catching up near the foot of the steps."])
  test(`no movement when Nicco moved UP: ${sentence}`, async () => {
    const r = await play("I go up to the observation room. Maren, come with me.", `Nicco climbs the stairs. ${sentence}`, [], [], { niccoInHall: true, marenInHall: true });
    assert.equal(r.where("nicco"), "test_room"); assert.equal(r.where("maren"), "test_hall"); assert.equal(r.moved("maren"), 0);
  });
test("a direction-free follow form still works when Nicco moved UP (manner tail only)", async () => {
  const r = await play("I go up to the observation room. Maren, come with me.", "Nicco climbs the stairs. Maren follows at her own pace.", [], [], { niccoInHall: true, marenInHall: true });
  assert.equal(r.where("maren"), "test_room"); assert.equal(r.moved("maren"), 1);
});
test("no Nicco movement: 'comes down' / 'appears at the bottom' move nobody", async () => {
  const r = await play("Maren, come with me.", "Maren comes down the stairs a moment later. Maren appears at the bottom of the stairs.");
  assert.equal(r.where("maren"), "test_room"); assert.equal(r.moved("maren"), 0);
});
test("NPC+ already at the arrival is not moved again", async () => {
  const r = await play(DOWN, `${BASE} Maren comes down the stairs a moment later.`, [], [], { marenInHall: true });
  assert.equal(r.moved("maren"), 0); assert.equal(r.result.authorized_commands.some(c => c.kind === "move_character"), false);
});
test("authored non-NPC+ (Gerome not a member) is unchanged: 'comes down' never moves him", async () => {
  const r = await play("I go down to the main hall. Gerome, come with me.", `${BASE} Gerome comes down the stairs a moment later.`, [], [], { members: ["maren"] });
  assert.equal(r.where("gerome"), "test_room"); assert.equal(r.moved("gerome"), 0);
});

// ------------------------------------------------------------------------------------------------ audit consistency (pronoun arrival)
test("audit: with an INVALID follow sentence, the pronoun-led arrival is flagged and state stays upstairs", async () => {
  const text = `${BASE} Maren's footsteps might follow behind him on the stair — unhurried but close. She reaches the hall floor a few paces after him and stops.`;
  const r = await play(DOWN, text);
  assert.equal(r.where("maren"), "test_room");
  const issue = (r.result.narration_reconciliation?.issues ?? []).find(i => i.kind === "uncommitted_movement" && i.character === "Maren");
  assert.ok(issue, "the arrival sentence must not survive unflagged"); assert.match(issue!.sentence, /She reaches the hall floor/);
});
test("audit: the same arrival after a VALID follow is clean (the move committed)", async () => {
  const r = await play(DOWN, `${BASE} Maren's footsteps follow behind him on the stair — unhurried but close. She reaches the hall floor a few paces after him and stops.`);
  assert.equal(r.where("maren"), "test_hall"); assert.deepEqual(movementIssues(r.result), []);
});
test("audit: pronoun continuation is tightly bounded (Nicco's own arrival, and an ambiguous pair, are never attributed)", async () => {
  const a = await play(DOWN, `${BASE} Nicco reaches the bottom. He sets his things on the table.`);
  assert.deepEqual(movementIssues(a.result), []);
  const b = await play(DOWN, `${BASE} Brenna and Maren watch from above. She reaches for a cup.`);
  assert.equal(b.result.narration_reconciliation?.issues.some(i => i.kind === "uncommitted_movement"), false);
});
