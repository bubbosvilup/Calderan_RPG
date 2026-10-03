import test from "node:test";
import assert from "node:assert/strict";
import { invitedFollowers } from "../src/turn/follow-invitation.js";
import { household, play, grammarProbe } from "./pass10-support.js";
import { readFileSync } from "node:fs";
import { collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { scriptedController, scriptedNarrator } from "./provider-failure-scripts.js";
import { characterLocation } from "../src/turn/character-movement.js";
import type { CampaignCommand } from "../src/campaign/types.js";

/** Movement/follow debt closure: D-13, D-14, D-15 (deterministic, through the real turn pipeline unless noted). */
const mk = (id: string) => ({ id, names: [id[0]!.toUpperCase() + id.slice(1)] });
const one = [mk("maren")], two = [mk("maren"), mk("brenna")];

// ================================================================================================ D-15
test("D-15 unit: a known but absent addressee is never reinterpreted as the sole eligible NPC+", () => {
  assert.deepEqual(invitedFollowers("Brenna, come with me.", one, [], ["Brenna"]), []);
  assert.deepEqual(invitedFollowers("Come with me, Brenna.", one, [], ["Brenna"]), []);
  assert.deepEqual(invitedFollowers("Brenna come with me.", one, [], ["Brenna"]), []);
  assert.deepEqual(invitedFollowers("Maren, come with me.", one, [], ["Brenna"]), ["maren"], "a named eligible person still wins");
  assert.deepEqual(invitedFollowers("Come with me.", one, [], ["Brenna"]), ["maren"], "unnamed with one eligible");
  assert.deepEqual(invitedFollowers("Come with me, we will look for Brenna.", one, [], ["Brenna"]), ["maren"], "a mention is not an address");
  assert.deepEqual(invitedFollowers("Anyone who wants can come along.", two, [], ["Korvin"]), ["maren", "brenna"], "group semantics unchanged");
  assert.deepEqual(invitedFollowers("Come with me, Zorp.", one, [], ["Brenna"]), ["maren"], "an unknown word never blocks a generic invitation");
});
test("D-15 pipeline: 'Brenna, come with me' with Brenna elsewhere gives Maren no invitation; the same words with Brenna present or other names behave as before", async () => {
  const away = { extra: [{ kind: "move_character" as const, character_id: "brenna", location_id: "test_remote" }] };
  const absentNamed = await play("Nicco goes down.", "I go down to the main hall. Brenna, come with me.", { members: ["maren"], ...away });
  assert.ok(!/decides freely/.test(absentNamed.prompt), "Maren was not invited");
  const generic = await play("Nicco goes down.", "I go down to the main hall. Come with me.", { members: ["maren"], ...away });
  assert.match(generic.prompt, /decides freely/, "an unnamed invitation still reaches the sole eligible NPC+");
  const named = await play("Nicco goes down.", "I go down to the main hall. Maren, come with me.", { members: ["maren"], ...away });
  assert.match(named.prompt, /decides freely/);
});

// ================================================================================================ D-14
const move = (character_id: string, location_id: string) => ({ kind: "move_character" as const, character_id, location_id });
const FOLLOW = "Nicco goes down the stairs. Maren follows him a moment later.";
const DOWN = "I go down to the main hall. Maren, come with me.";
const moves = (r: Awaited<ReturnType<typeof play>>["result"]) => r!.authorization.filter(a => a.command.kind === "move_character");
test("D-14: identical controller move proposals collapse to one effective proposal (one decision, one commit, one history entry)", async () => {
  const r = await play(FOLLOW, DOWN, { members: ["maren"], commands: [move("maren", "test_hall"), move("maren", "test_hall")], evidence: ["Maren follows him", "Maren follows him"] });
  assert.equal(moves(r.result).length, 1); assert.equal(moves(r.result)[0]!.authorized, true);
  assert.equal(r.result!.authorized_commands.filter(c => c.kind === "move_character").length, 1);
  assert.equal(r.where("maren"), "test_hall"); assert.equal(r.moved("maren").length, 1);
});
test("D-14: different destination or different mover is NOT deduplicated; the evidence quote stays with its own command", async () => {
  const diffDest = await play(FOLLOW, DOWN, { members: ["maren"], commands: [move("maren", "test_remote"), move("maren", "test_hall")], evidence: ["wrong place", "Maren follows him"] });
  assert.equal(moves(diffDest.result).length, 2, "same mover, different destination: both proposals reach authorization");
  assert.equal(moves(diffDest.result).filter(a => a.authorized).length, 1); assert.equal(diffDest.where("maren"), "test_hall");
  const diffMover = await play(FOLLOW, DOWN, { members: ["maren", "brenna"], commands: [move("maren", "test_hall"), move("brenna", "test_hall")], evidence: ["Maren follows him", "nothing narrated"] });
  assert.equal(moves(diffMover.result).length, 2, "different mover, same destination: kept");
  assert.equal(diffMover.where("maren"), "test_hall"); assert.equal(diffMover.where("brenna"), "test_room", "Brenna was never narrated following");
});
test("D-14: a controller move plus the derived identical one is one proposal; a wrong controller destination plus the derived correct one both reach authorization and the correct one survives", async () => {
  const both = await play(FOLLOW, DOWN, { members: ["maren"], commands: [move("maren", "test_hall")], evidence: ["Maren follows him"] });
  assert.equal(moves(both.result).length, 1);
  const none = await play(FOLLOW, DOWN, { members: ["maren"], commands: [] });
  assert.equal(moves(none.result).length, 1, "derived only");
  const wrong = await play(FOLLOW, DOWN, { members: ["maren"], commands: [move("maren", "test_remote")], evidence: ["Maren follows him"] });
  assert.equal(moves(wrong.result).length, 2); assert.equal(wrong.where("maren"), "test_hall"); assert.equal(wrong.moved("maren").length, 1);
});

// ================================================================================================ D-13
async function revised(texts: string[], members = ["maren"], input = "I go down to the main hall. Maren, come with me.") {
  const f = household(members), service = new RetrievalService(f.world), narrator = scriptedNarrator(texts);
  const co = new TurnCoordinator(f.world, narrator, scriptedController([]), { service, search: new HybridSearch(service) });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: input }));
  const done = events.find(e => e.type === "turn_completed"), r = done && done.type === "turn_completed" ? done.result : undefined;
  const delivered = (events.find(e => e.type === "narration_completed") as { text: string } | undefined)?.text ?? "";
  const at = (id: string) => characterLocation(f.campaign.exportSnapshot(), f.world, id);
  return { r, delivered, at, calls: narrator.requests.length, moved: (id: string) => f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === id)?.dynamic.recent_developments.filter(e => e.kind === "moved").length ?? 0 };
}
const FALL = "Nicco goes down the stairs. Maren follows him. Nicco falls to the floor.";
test("D-13: a revision that keeps the committed move is clean (no repair sentence)", async () => {
  const t = await revised([FALL, "Nicco goes down the stairs. Maren follows him."]);
  assert.equal(t.r!.narration_reconciliation?.delivered, "revision"); assert.equal(t.r!.narration_reconciliation?.repaired_arrivals, undefined);
  assert.equal(t.delivered, "Nicco goes down the stairs. Maren follows him."); assert.equal(t.at("maren"), "test_hall");
});
test("D-13: a revision that omits the committed move is repaired deterministically; state stays committed exactly once", async () => {
  const t = await revised([FALL, "Nicco goes down the stairs."]);
  assert.equal(t.at("maren"), "test_hall"); assert.equal(t.moved("maren"), 1, "state is never rolled back or duplicated");
  assert.deepEqual(t.r!.narration_reconciliation?.repaired_arrivals, ["Maren has followed Nicco to Main hall."]);
  assert.equal(t.delivered, "Nicco goes down the stairs. Maren has followed Nicco to Main hall.");
  const redacted = await revised([FALL, FALL.replace("Maren follows him. ", "")]);
  assert.match(redacted.delivered, /Maren has followed Nicco to Main hall\.$/, "also after a redaction that dropped the mover");
});
test("D-13: several committed movers are each represented; unrelated movement prose does not trigger a repair; a revision that invents an uncommitted follower is still redacted", async () => {
  const two = await revised(["Nicco goes down the stairs. Maren follows him. Brenna follows him. Nicco falls to the floor.", "Nicco goes down the stairs."], ["maren", "brenna"], "I go down to the main hall. Maren, Brenna, come with me.");
  assert.equal(two.at("maren"), "test_hall"); assert.equal(two.at("brenna"), "test_hall");
  assert.equal(two.r!.narration_reconciliation?.repaired_arrivals?.length, 2);
  assert.match(two.delivered, /Maren has followed Nicco to Main hall\. Brenna has followed Nicco to Main hall\./);
  const nomove = await revised(["Nicco walks to the window. Nicco falls to the floor.", "Nicco walks to the window."], ["maren"], "I walk to the window.");
  assert.equal(nomove.r!.narration_reconciliation?.repaired_arrivals, undefined); assert.equal(nomove.at("maren"), "test_room");
  const invented = await revised([FALL, "Nicco goes down the stairs. Maren follows him. Brenna follows him."], ["maren", "brenna"], "I go down to the main hall. Maren, come with me.");
  assert.equal(invented.r!.narration_reconciliation?.delivered, "redacted"); assert.equal(invented.at("brenna"), "test_room"); assert.doesNotMatch(invented.delivered, /Brenna follows/);
});

// ================================================================================================ D-12 / D-11 (grammar)
const PREFIX = "Nicco goes down the stairs. ";
const grammar = grammarProbe({ members: ["maren"] }), women = grammarProbe({ members: ["brenna", "maren"] }), household3 = grammarProbe({ members: ["brenna", "maren", "gerome"] });
type Row = { output: string };
const live = (file: string) => readFileSync(`docs/evaluations/movement-follow-closure/${file}`, "utf8").split("\n").filter(Boolean).map(l => (JSON.parse(l) as Row).output);

test("D-12 live-derived: eight production drafts that were real follows and were not recognised are recognised now", () => {
  const [d01, , label] = [live("d01-live.jsonl"), live("d02-d03-live.jsonl"), live("d03-label-live.jsonl")];
  const expected: readonly [readonly string[], number, string][] = [[d01, 3, "gerome"], [label, 3, "gerome"], [label, 7, "maren"], [label, 14, "maren"], [label, 15, "maren"], [label, 16, "maren"], [label, 18, "gerome"], [label, 23, "gerome"]];
  for (const [rows, at, id] of expected) assert.deepEqual(household3(rows[at]!), [`${id}->test_hall`], rows[at]);
});
test("D-12: ornate physical-arrival families resolve to Nicco's arrival (named subject, completed, same-turn descent)", () => {
  for (const t of ["Heavy footfalls marked Maren's descent.", "Maren joined him a moment later.", "Maren hurried after him.", "Maren fell in beside him.", "Maren went down after him.",
    "Maren stepped into the hall.", "Maren comes down into the hall a few paces behind.", "Maren ducked slightly through the doorframe and stepped into the hall.",
    "Maren rounds the stairwell and steps into the hall.", "Maren descends the stairs.", "Maren appears at the bottom of the stairs a moment after he reaches the hall.", "Maren follows at a short distance."])
    assert.deepEqual(grammar(PREFIX + t), ["maren->test_hall"], t);
});
test("D-12 zero new false positives: intent-only, sound-only, modal, negated, temporal, habitual, imagined, other destination, quoted, someone else", async () => {
  for (const t of ["Maren chose to follow him.", "Maren decided to follow him down.", "He heard Maren on the stairs behind him.", "Maren's steps sounded on the stairs behind him.",
    "Maren might step into the hall.", "Maren would walk into the hall if asked.", "Maren refused to step into the hall.", "Maren did not come down into the hall.", "Maren did not appear at the bottom of the stairs.",
    "Maren walked into the hall yesterday.", "Maren usually walks into the hall at dawn.", "Maren stepped into the hall in his memory.", "Maren walked into the kitchen.", "Maren walks in the hall.",
    "Maren descended the stairs and stopped halfway.", "Maren could descend the stairs.", "Maren stays upstairs while Gerome steps into the hall.", "Maren watched Gerome step into the hall.",
    "\"Maren steps into the hall,\" Gerome said.", "Nobody steps into the hall.", "Maren wondered whether she should step into the hall."])
    assert.deepEqual(grammar(PREFIX + t), [], t);
  assert.deepEqual(grammarProbe({ members: ["maren"], niccoMoves: false })("Maren joined him. Maren hurried after him. Maren comes down after him."), [], "Nicco did not move: no implicit follow");
  // Already at the arrival: the grammar may report the (true) arrival as evidence, but the proposal stage drops it as already established.
  const already = await play("Nicco goes down the stairs. Maren comes down into the hall a few paces behind.", "I go down to the main hall.", { members: ["maren"], extra: [{ kind: "move_character", character_id: "maren", location_id: "test_hall" }] });
  assert.equal(already.result?.authorization.filter(a => a.command.kind === "move_character").length, 0, "already at the arrival: no command");
});
test("D-11: the bounded antecedent resolves a pronoun only to the single named subject of the window", () => {
  assert.deepEqual(women(PREFIX + "Maren's footsteps followed on the stairs. She came down after him."), ["maren->test_hall"]);
  assert.deepEqual(women(PREFIX + "Brenna looks at Nicco. She followed him down."), ["brenna->test_hall"]);
  assert.deepEqual(household3("Behind him, a heavy tread. Gerome's broad frame fills the stairway as he follows down, each step groaning."), ["gerome->test_hall"]);
});
test("D-11 fail-closed: two named people, an addressee, a stay or refusal before, or Nicco competing for 'he', never resolve", () => {
  for (const t of ["Brenna looks at Maren. She follows him.", "Brenna looks at Maren. She came down after him.", "Maren says \"Brenna, wait.\" She follows him down.", "Maren refuses. She follows him.", "Maren stays upstairs. She follows him.", "She follows him."])
    assert.deepEqual(women(PREFIX + t), [], t);
  assert.deepEqual(household3(PREFIX + "Nicco nods at Gerome, and he follows him down."), []);
  assert.deepEqual(household3(PREFIX + "Gerome stays upstairs. He follows."), []);
});

// ================================================================================================ D-07
const departed = (r: Awaited<ReturnType<typeof play>>) => (r.result?.narration_reconciliation?.issues ?? []).some(i => i.kind === "uncommitted_departure");
test("D-07 closed: a player-ordered destination-less exit of an authored NPC+ is committed as OFF_SCENE once the narration completes it", async () => {
  const r = await play("Maren walks out, and the door shuts behind her.", "Maren, go out for a while.", { members: ["maren"] });
  assert.ok(!departed(r), "the completed exit is recorded, so it is not an unrecorded departure");
  assert.equal(r.where("maren"), undefined, "no location: she is off-scene");
  assert.deepEqual(r.snapshot.runtime.npc_locations.find(n => n.character_id === "maren"), { character_id: "maren", off_scene: { last_known_location: "test_room", since_revision: r.snapshot.revision } });
  assert.match(r.result?.narration ?? "", /walks out/i);
});
test("D-07: live-observed stair exits that state their direction are movements", async () => {
  for (const t of ["Maren moved toward the stairs, her footsteps receding down into the main hall below."]) {
    const r = await play(`Maren looked up. ${t}`, "Maren, take a walk.", { members: ["maren"] });
    // Batch 3: "receding down into the main hall" states its direction (and the place), so it is a movement to the one structured neighbour.
    assert.ok(!departed(r), t);
    assert.equal(r.where("maren"), "test_hall", t);
  }
});
test("D-07 zero new false positives: a stay, a plan, a hesitation, a follower after Nicco, or an arrival is not a departure", async () => {
  for (const t of ["Maren looked up and stayed where she was.", "Maren glanced toward the stairs, then back. \"I can do that,\" she said, already shifting as if ready to go.", "Maren hesitated at the top of the stairs and did not go down.",
    "Maren said she might go down to the hall later."]) assert.ok(!departed(await play(t, "Maren, could you fetch bread?", { members: ["maren"] })), t);
  const follow = await play("Nicco goes down the stairs. Behind him, Maren's footsteps followed. She descended the stairs and stopped at the bottom.", "I go down to the main hall. Maren, come with me.", { members: ["maren"] });
  assert.ok(!departed(follow), "Nicco moved: a follower's descent is never a departure");
});

test("D-07 live families (final closure): a completed stair exit that states its direction is a movement to the ONE structured neighbour", async () => {
  const hall = [{ kind: "runtime_delta", delta: { player_location: "test_hall" } }, { kind: "move_character", character_id: "maren", location_id: "test_hall" }] as const;
  const room = (n: string, input: string, extra: readonly CampaignCommand[] = []) => play(`Maren looked up from where she sat. ${n}`, input, { members: ["maren"], extra });
  // Verbatim live drafts (production narrator, 2026-10-03).
  for (const t of ["She nodded and rose. She crossed the room to the stairs and descended, her footsteps fading.", "She crossed to the stairs and descended, her footsteps fading into the sounds of the hall below.",
    "Maren moved toward the stairs and descended, her footsteps fading into the quiet of the room below.", "Maren rose and moved toward the stairs. She descended out of sight."]) assert.equal((await room(t, "Maren, take a walk.")).where("maren"), "test_hall", t);
  for (const t of ["\"All right,\" she said, and crossed the hall. Her footsteps faded as she ascended, the old treads creaking once or twice underfoot.", "She crossed the hall toward the stairs, her footsteps fading as she climbed.",
    "\"All right,\" she said, and crossed the hall to the stair. Her footsteps receded overhead as she climbed.", "She holds Nicco's gaze for a moment, then rises. Her footsteps cross the hall toward the stair, and she climbs out of sight, the sound of her movement fading overhead.",
    "She pushes back from the table without argument and crosses to the foot of the steps. \"All right,\" she says, and her footsteps fade upward into the quiet above."]) assert.equal((await room(t, "Maren, go upstairs.", hall)).where("maren"), "test_room", t);
  // Verbatim live descents by sound with an explicit direction (batch 2).
  for (const t of ["\"All right.\" She rose and crossed to the stairs, her footsteps receding downward into the main hall.", "She gave a small nod and crossed to the head of the stairs, her footsteps receding downward toward the main hall."])
    assert.equal((await room(t, "Maren, take a walk.")).where("maren"), "test_hall", t);
  // Incomplete, paused or unrelated climbing never moves anyone, and the unrecorded claim is withdrawn.
  for (const t of ["Maren pushed back her chair, crossed the hall toward the stairs, and started up the stairs without another word.", "Without a word she crossed the hall, her footsteps quiet on the stone floor, and started up.", "Maren moved toward the stairs, pausing at the top step, not yet descending.", "Maren climbed onto the narrow bed and pulled her knees up.",
    "Her gaze drifts toward the arched window, then to the stairs leading down, then back again."]) {
    const r = await room(t, "Maren, wait.", t.includes("started up") ? hall : []);
    assert.equal(r.where("maren"), t.includes("started up") ? "test_hall" : "test_room", t);
  }
});
test("final closure: door exits without a named destination are OFF_SCENE only when completed; stepping through and back is not", async () => {
  const hall = [{ kind: "runtime_delta", delta: { player_location: "test_hall" } }, { kind: "move_character", character_id: "maren", location_id: "test_hall" }] as const;
  const done = await play("Maren looked up from where she sat. \"All right,\" she said, and crossed the hall and pushed the door open, letting in a brief rush of cooler air before stepping through and pulling it shut behind her.", "Maren, go out for some air.", { members: ["maren"], extra: hall });
  assert.ok(done.snapshot.runtime.npc_locations.find(n => n.character_id === "maren")?.off_scene);
  // Verbatim live drafts (batch 2): the door falls or swings shut behind her.
  for (const t of ["\"All right,\" she said, and pushed to her feet. She crossed the hall and pulled the door open. Cool air curled in for a moment before she stepped through, letting it fall shut behind her.",
    "She gave a small nod and crossed the hall, pushing the door open. Cool air drifted in briefly before it swung shut behind her, leaving the hall quiet except for the low crackle of the fire."]) {
    const r = await play(`Maren glanced up from where she sat. ${t}`, "Maren, go out into the courtyard.", { members: ["maren"], extra: hall });
    assert.ok(r.snapshot.runtime.npc_locations.find(n => n.character_id === "maren")?.off_scene, t);
  }
  const back = await play("Maren looked up from where she sat. She crossed to the door, stepped through it and then back again, shaking her head.", "Maren, go out.", { members: ["maren"], extra: hall });
  assert.equal(back.where("maren"), "test_hall");
});
test("D-24 (bare-pronoun form): a failed player move withdraws a dependent follow even when Nicco is only 'He'", async () => {
  for (const t of ["He sets off toward the docks. Maren follows him.", "He goes toward the remote docks. Maren comes after him.", "He heads for the remote docks. Maren came down after him."]) {
    const r = await play(t, "I set off for the remote docks. Maren, come with me.", { members: ["maren"] });
    assert.deepEqual([r.snapshot.runtime.scene.player_location, r.where("maren")], ["test_room", "test_room"], t);
    assert.doesNotMatch(r.result?.narration ?? "", /Maren (?:follows|comes|came)/, t);
  }
  // A move that succeeds keeps its follow, and a local follow with no failed move is untouched.
  const ok = await play("Nicco goes down the stairs. Maren follows him.", "I go down to the main hall. Maren, come with me.", { members: ["maren"] });
  assert.equal(ok.where("maren"), "test_hall");
  const local = await play("Nicco settles at the table. Maren follows him over to the table.", "I sit down and read. Maren, stay close.", { members: ["maren"] });
  assert.match(local.result?.narration ?? "", /Maren follows him over to the table/);
});
