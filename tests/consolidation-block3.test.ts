import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/support/turn-fixture.js";
import { metadata, collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { characterLocation, movableCharacters } from "../src/turn/movement/character-movement.js";
import { followCandidates, resolveHeldEscort } from "../src/turn/movement/follow-candidates.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";

/**
 * Consolidation block 3 — companion / group movement and identity continuity. Candidates are DERIVED per turn (npc_plus_active, held_by_player,
 * household_member, invited_this_turn); a candidate moves only by completed narrated follow of THAT person (A) or by the deterministic escort of a
 * held person the player names and leads (B). Ownership, membership and invitation alone never move anyone; nobody uninvited and free follows.
 */
const create = (id: string, name: string, sex: "female" | "male", location = "test_room"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex, age: { kind: "exact", years: 24 } }, current: { current_location: location, status: "active" } } });
const hold = (id: string): CampaignCommand => ({ kind: "set_legal_status", character_id: id, status: "enslaved", holder_id: "nicco" });
const household = (...ids: string[]): CampaignCommand[] => [
  { kind: "create_household", id: "campaign_household_home", name: "Home" },
  { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
  ...ids.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })),
];
interface Opts { readonly setup?: readonly CampaignCommand[]; readonly commands?: readonly CampaignCommand[]; readonly evidence?: readonly string[] }
async function play(narration: string, input: string, o: Opts = {}) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [...(o.setup ?? [])] });
  const before = f.campaign.revision, service = new RetrievalService(f.world), requests: GenerationRequest[] = [];
  const narrator = { async generate(r: GenerationRequest) { requests.push(r); return { text: narration, ...metadata }; },
    async *stream(r: GenerationRequest) { requests.push(r); yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; } };
  const coordinator = new TurnCoordinator(f.world, narrator, { async propose() { return { commands: o.commands ?? [], evidence: o.evidence ?? [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: input }));
  const done = events.find(e => e.type === "turn_completed");
  assert.ok(done && done.type === "turn_completed", JSON.stringify(events.at(-1)));
  const snapshot = f.campaign.exportSnapshot();
  return { f, result: done.result as TurnResult, snapshot, before, where: (id: string) => characterLocation(snapshot, f.world, id), prompt: requests[0]!.messages.map(m => m.content).join("\n"),
    created: () => snapshot.characters.filter(c => c.origin.kind === "created").length, issues: () => (done.result as TurnResult).narration_reconciliation?.issues ?? [] };
}
const GO = "I go down to the main hall.";
const NEUTRAL = "*Nicco goes down the stairs to the main hall.*";

// ------------------------------------------------------------------------------------------------ B: deterministic escort of a held person
test("M1: a held person named and led by the player moves with Nicco in ONE atomic batch (same revision step), same id", async () => {
  const r = await play(NEUTRAL, `Tessa, I just bought you. Let's go. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  assert.equal(r.where("nicco"), "test_hall"); assert.equal(r.where("campaign_character_t"), "test_hall");
  assert.equal(r.snapshot.revision, r.before + 1, "Nicco's travel and the escort are one commit");
  assert.equal(r.created(), 1, "no duplicate");
  assert.match(r.prompt, /NOT left behind/);
});
test("M2: a held person who is not addressed stays (ownership never moves anyone) and the narrator is told she stays", async () => {
  const r = await play(NEUTRAL, GO, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  assert.equal(r.where("nicco"), "test_hall"); assert.equal(r.where("campaign_character_t"), "test_room");
  assert.match(r.prompt, /Tessa stays there/);
});
test("M3: \"Tessa, stay here.\" or a refusal to bring her never escorts", async () => {
  for (const input of [`Tessa, stay here. ${GO}`, `Tessa, you are not coming with me. ${GO}`, `Tessa, don't follow me. ${GO}`, `Tessa, wait here for me. Let's meet later. ${GO}`]) {
    const r = await play(NEUTRAL, input, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
    assert.equal(r.where("campaign_character_t"), "test_room", input);
  }
});
test("M4: an unnamed \"come with me\" never escorts by pronoun guessing, even with one held person present", async () => {
  const r = await play(NEUTRAL, `Come with me. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  assert.equal(r.where("campaign_character_t"), "test_room");
});
test("M5: two held people, one named and led: only that one moves; both named: both move; neither moves when Nicco does not move", async () => {
  const setup = [create("campaign_character_t", "Tessa", "female"), create("campaign_character_d", "Dara", "female"), hold("campaign_character_t"), hold("campaign_character_d")];
  const one = await play(NEUTRAL, `Tessa, come with me. ${GO}`, { setup });
  assert.deepEqual([one.where("campaign_character_t"), one.where("campaign_character_d")], ["test_hall", "test_room"]);
  const both = await play(NEUTRAL, `Tessa and Dara, come with me. ${GO}`, { setup });
  assert.deepEqual([both.where("campaign_character_t"), both.where("campaign_character_d")], ["test_hall", "test_hall"]);
  const still = await play("*Nicco sits on the bed.*", "Tessa, come with me. I sit on the bed.", { setup });
  assert.deepEqual([still.where("nicco"), still.where("campaign_character_t")], ["test_room", "test_room"]);
});
test("M6: no remote teleport: a held person who is not with Nicco is never moved by the escort", async () => {
  const r = await play(NEUTRAL, `Tessa, come with me. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female", "test_remote"), hold("campaign_character_t")] });
  assert.equal(r.where("campaign_character_t"), "test_remote");
});
test("M7: a person who is free (not held) is never escorted by the player's words alone", async () => {
  const r = await play(NEUTRAL, `Tessa, come with me. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female")] });
  assert.equal(r.where("campaign_character_t"), "test_room");
});
test("M8: a Controller move for the escorted person to a different place is rejected; she stays with Nicco", async () => {
  const r = await play(NEUTRAL, `Tessa, come with me. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")], commands: [{ kind: "move_character", character_id: "campaign_character_t", location_id: "test_remote" }] });
  assert.equal(r.where("campaign_character_t"), "test_hall");
});

// ------------------------------------------------------------------------------------------------ A: narrated follow of an eligible candidate
test("M9: a household member narrated following Nicco (implicit destination) moves; without the narration, membership alone moves nobody", async () => {
  const setup = [create("campaign_character_t", "Tessa", "female"), ...household("campaign_character_t")];
  const follows = await play("Nicco goes down the stairs. Tessa follows him.", GO, { setup });
  assert.equal(follows.where("campaign_character_t"), "test_hall");
  const silent = await play(NEUTRAL, GO, { setup });
  assert.equal(silent.where("campaign_character_t"), "test_room");
});
test("M10: a held person narrated following Nicco moves (same candidate), even when not addressed", async () => {
  const r = await play("Nicco goes down the stairs. Tessa follows him.", GO, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  assert.equal(r.where("campaign_character_t"), "test_hall");
});
test("M11: a free, uninvited, non-household person narrated following Nicco never moves; the audit rejects the narration (parity)", async () => {
  const r = await play("Nicco goes down the stairs. Tessa follows him.", GO, { setup: [create("campaign_character_t", "Tessa", "female")] });
  assert.equal(r.where("campaign_character_t"), "test_room");
  assert.ok(!r.result.authorization.some(d => d.command.kind === "move_character" && d.authorized));
  assert.ok(!/Tessa follows him/.test(r.result.narration), "the unrecorded follow is not delivered");
});
test("M12: an invitation by name this turn makes a free person eligible; the invitation alone moves nobody", async () => {
  const setup = [create("campaign_character_t", "Tessa", "female")];
  const follows = await play("Nicco goes down the stairs. Tessa follows him.", `Tessa, come with me. ${GO}`, { setup });
  assert.equal(follows.where("campaign_character_t"), "test_hall");
  const silent = await play(NEUTRAL, `Tessa, come with me. ${GO}`, { setup });
  assert.equal(silent.where("campaign_character_t"), "test_room");
});
test("M13: a pronoun follow with two eligible women resolves to nobody (ambiguity fails closed)", async () => {
  const setup = [create("campaign_character_t", "Tessa", "female"), create("campaign_character_d", "Dara", "female"), hold("campaign_character_t"), hold("campaign_character_d")];
  const r = await play("Nicco goes down the stairs. She follows him.", GO, { setup });
  assert.deepEqual([r.where("campaign_character_t"), r.where("campaign_character_d")], ["test_room", "test_room"]);
});
test("M14: a narrated follow of one eligible person never moves a different person", async () => {
  const setup = [create("campaign_character_t", "Tessa", "female"), create("campaign_character_d", "Dara", "female"), hold("campaign_character_t"), hold("campaign_character_d")];
  const r = await play("Nicco goes down the stairs. Dara follows him.", GO, { setup });
  assert.deepEqual([r.where("campaign_character_t"), r.where("campaign_character_d")], ["test_room", "test_hall"]);
});

// ------------------------------------------------------------------------------------------------ pure resolver
test("M15: followCandidates is pure, per-turn and carries exactly the documented reasons; nothing is persisted", async () => {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [create("campaign_character_t", "Tessa", "female"), create("campaign_character_d", "Dara", "female"), create("campaign_character_f", "Free", "male"),
    hold("campaign_character_t"), ...household("campaign_character_d", "maren")] });
  const snap = f.campaign.exportSnapshot(), people = movableCharacters(snap, ["test_room"], f.world);
  const before = JSON.stringify(snap);
  const c = followCandidates(snap, people, "Free, come with me.");
  assert.deepEqual(c.get("campaign_character_t"), ["held_by_player"]);
  assert.ok(c.get("campaign_character_d")?.includes("household_member"));
  assert.deepEqual(c.get("campaign_character_f"), ["invited_this_turn"]);
  assert.ok(c.get("maren")?.includes("npc_plus_active"));
  assert.equal(followCandidates(snap, people, "").has("campaign_character_f"), false);
  assert.equal(JSON.stringify(snap), before, "pure");
  assert.doesNotMatch(JSON.stringify(snap), /followers|party|companion/i, "no persisted roster");
});
test("M16: the escort resolver needs Nicco's resolved travel; without a runtime move nothing is produced", async () => {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  const snap = f.campaign.exportSnapshot();
  const ctx = (await import("../src/turn/context/context-builder.js")).buildTurnContext(f.world, snap, { input: "", recent_text: "" });
  assert.deepEqual(resolveHeldEscort("Tessa, come with me.", snap, ctx, f.world, []).runtime, []);
  const out = resolveHeldEscort("Tessa, come with me.", snap, ctx, f.world, [{ kind: "runtime_delta", delta: { player_location: "test_hall" } }]);
  assert.deepEqual(out.runtime, [{ kind: "move_character", character_id: "campaign_character_t", location_id: "test_hall" }]);
});

// ------------------------------------------------------------------------------------------------ identity continuity and consistency
test("M17: after the escort the arrival turn reuses the SAME record: a narrated self-introduction creates no new person and the name is unchanged", async () => {
  const f = turnFixture(), service = new RetrievalService(f.world);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  let narration = NEUTRAL;
  const narrator = { async generate() { return { text: narration, ...metadata }; }, async *stream() { yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; } };
  const coordinator = new TurnCoordinator(f.world, narrator, { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  await collect(coordinator.runTurn({ campaign: f.campaign, player_input: `Tessa, come with me. ${GO}` }));
  narration = "*Tessa looks around the hall and lowers her voice.* \"My name is Tessa. I stay close to you.\"";
  await collect(coordinator.runTurn({ campaign: f.campaign, player_input: "I look at her." }));
  const s = f.campaign.exportSnapshot();
  assert.equal(s.characters.filter(c => c.origin.kind === "created").length, 1);
  assert.equal(s.characters.find(c => c.id === "campaign_character_t")?.profile.name, "Tessa");
  assert.equal(characterLocation(s, f.world, "campaign_character_t"), "test_hall");
});
test("M18: the scene projection and the visible scene show the escorted person at the destination, not at the origin", async () => {
  const r = await play(NEUTRAL, `Tessa, come with me. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  const scene = r.prompt.slice(r.prompt.indexOf("[CURRENT SCENE]"));
  assert.match(scene, /Tessa/);
  assert.equal(r.snapshot.characters.find(c => c.id === "campaign_character_t")?.current.current_location, "test_hall");
});
test("M19: when narration contradicts the player's own escort (leaves her at the origin) the STATE still follows the act, and the narrator was told so (residual: no reverse audit)", async () => {
  const r = await play("*Nicco goes down the stairs to the main hall. Tessa stays behind in the observation room and does not move.*", `Tessa, come with me. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  assert.equal(r.where("campaign_character_t"), "test_hall", "the state follows the player's own act");
  assert.match(r.prompt, /Tessa[^\n]*NOT left behind[^\n]*Main hall|NOT left behind/);
});
test("M20: save/load round trip keeps the escorted location and adds no persisted follower structure", async () => {
  const r = await play(NEUTRAL, `Tessa, come with me. ${GO}`, { setup: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  const { CampaignState } = await import("../src/campaign/campaign-state.js");
  const restored = CampaignState.restore(r.f.world, JSON.parse(JSON.stringify(r.snapshot)));
  assert.equal(characterLocation(restored.exportSnapshot(), r.f.world, "campaign_character_t"), "test_hall");
  assert.deepEqual(Object.keys(r.snapshot).filter(k => /follow|party|companion/i.test(k)), []);
});
test("M21 (ID-1): a different, unnamed woman at the destination who gives the name of a person left elsewhere does not fork that identity", async () => {
  const f = turnFixture(), service = new RetrievalService(f.world);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")] });
  let narration = NEUTRAL;
  const narrator = { async generate() { return { text: narration, ...metadata }; }, async *stream() { yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; } };
  const coordinator = new TurnCoordinator(f.world, narrator, { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  await collect(coordinator.runTurn({ campaign: f.campaign, player_input: GO }));
  narration = "A young woman by the hearth looks up. \"I am Tessa,\" she says quietly.";
  await collect(coordinator.runTurn({ campaign: f.campaign, player_input: "I ask the young woman at the hearth for her name." }));
  const s = f.campaign.exportSnapshot();
  const named = s.characters.filter(c => c.origin.kind === "created" && c.profile.name === "Tessa");
  assert.equal(named.length, 1, JSON.stringify(s.characters.filter(c => c.origin.kind === "created").map(c => [c.id, c.profile.name, c.current.current_location])));
});
