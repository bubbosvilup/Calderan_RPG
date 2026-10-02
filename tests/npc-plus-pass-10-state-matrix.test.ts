import test from "node:test";
import assert from "node:assert/strict";
import { household, play } from "./pass10-support.js";
import type { CampaignCommand } from "../src/campaign/types.js";

/**
 * NPC+ Pass 10 — cross-product state matrix. One oracle covers every row: a character moves in a turn iff
 *   Nicco moved this turn AND the character was with him at the origin AND the narration narrates a COMPLETED follow of Nicco
 *   AND the character is an active NPC+ (the only class implicit-destination following applies to).
 * Invitation wording never matters (invariant 1); the controller can only agree with narrated evidence (authorization is unchanged).
 */
type Subject = "npcplus_authored" | "npcplus_created" | "inactive_former" | "authored_non_npcplus" | "created_non_member";
const SUBJECTS: readonly Subject[] = ["npcplus_authored", "npcplus_created", "inactive_former", "authored_non_npcplus", "created_non_member"];
const PLACES = { origin: "test_room", absent: "test_remote", destination: "test_hall" } as const;
type Presence = keyof typeof PLACES;
const INVITATIONS = { none: "", direct: " {N}, come with me.", group: " Anyone who wants can come along.", consent: " {N}, come along if you want.", coercive: " {N}, you must come with me.", hypothetical: " If {N} came with me, it would help.", historical: " Yesterday I asked {N} to come with me." } as const;
type Invitation = keyof typeof INVITATIONS;
const NARRATIONS = { follow: "{N} follows him.", refuse: "{N} refuses to follow.", hesitate: "{N} hesitates at the top of the stairs.", stay: "{N} stays where she is.", ambiguous: "{N} might follow him later.", other_destination: "{N} follows him to the window.", ornate_false_positive: "{N}'s eyes follow him down the stairs, and {N} follows his reasoning." } as const;
type Narration = keyof typeof NARRATIONS;

function setup(subject: Subject, presence: Presence) {
  const place = PLACES[presence];
  const created = (id: string, name: string, location: string): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex: "female" }, current: { current_location: location, status: "active" } } });
  const members = subject === "npcplus_authored" ? ["maren"] : subject === "inactive_former" ? ["maren"] : [];
  const f = household(members, subject === "npcplus_created" || subject === "created_non_member" ? [created("campaign_character_tessa", "Tessa", place)] : []);
  if (subject === "npcplus_created") f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: "campaign_household_home", character_id: "campaign_character_tessa" }] });
  const id = subject === "npcplus_created" || subject === "created_non_member" ? "campaign_character_tessa" : subject === "authored_non_npcplus" ? "gerome" : "maren";
  const name = subject === "npcplus_created" || subject === "created_non_member" ? "Tessa" : subject === "authored_non_npcplus" ? "Gerome" : "Maren";
  // Authored NPCs have runtime locations; place them (move_character) before any membership change.
  const authoredId = subject === "authored_non_npcplus" ? "gerome" : "maren";
  if ((subject === "npcplus_authored" || subject === "inactive_former" || subject === "authored_non_npcplus") && presence !== "origin") f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: authoredId, location_id: place }] });
  if (subject === "inactive_former") f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "leave_household", household_id: "campaign_household_home", character_id: "maren" }] });
  return { f, id, name, place };
}
const moveOracle = (s: Subject, p: Presence, n: Narration, niccoMoves: boolean) => niccoMoves && p === "origin" && n === "follow" && (s === "npcplus_authored" || s === "npcplus_created");

for (const subject of SUBJECTS) for (const presence of Object.keys(PLACES) as Presence[]) for (const narration of Object.keys(NARRATIONS) as Narration[]) {
  test(`matrix ${subject} / ${presence} / ${narration}: location follows the oracle for every invitation wording and Nicco movement`, async () => {
    for (const invitation of Object.keys(INVITATIONS) as Invitation[]) for (const niccoMoves of [true, false]) {
      const { f, id, name, place } = setup(subject, presence);
      const input = (niccoMoves ? "I go down to the main hall." : "I stay here and look around.") + INVITATIONS[invitation].replaceAll("{N}", name);
      const text = (niccoMoves ? "Nicco goes down the stairs. " : "Nicco looks around. ") + NARRATIONS[narration].replaceAll("{N}", name);
      const movedBefore = f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === id)?.dynamic.recent_developments.filter(e => e.kind === "moved").length ?? 0;
      const r = await play(text, input, { fixture: f });
      assert.ok(r.result, `${subject}/${presence}/${narration}/${invitation}/${niccoMoves}: turn failed`);
      const expected = moveOracle(subject, presence, narration, niccoMoves) ? "test_hall" : place;
      assert.equal(r.where(id), expected, `${subject}/${presence}/${narration}/${invitation}/nicco=${niccoMoves}`);
      // Nobody else ever moves, and a move produces exactly one moved development for the mover.
      for (const other of ["brenna", "gerome", "maren"]) if (other !== id && subject !== "inactive_former") assert.equal(r.where(other), r.snapshot.runtime.npc_locations.find(n => n.character_id === other)?.current_location);
      assert.equal(r.moved(id).length - movedBefore, moveOracle(subject, presence, narration, niccoMoves) ? 1 : 0, `${subject}/${presence}/${narration}/${invitation}/${niccoMoves}: moved developments`);
    }
  });
}

// ------------------------------------------------------------------------------------------------ controller dimension
const CONTROLLERS: Readonly<Record<string, (id: string) => readonly CampaignCommand[]>> = {
  none: () => [],
  correct: id => [{ kind: "move_character", character_id: id, location_id: "test_hall" }],
  duplicate: id => [{ kind: "move_character", character_id: id, location_id: "test_hall" }, { kind: "move_character", character_id: id, location_id: "test_hall" }],
  wrong_leave_scene: id => [{ kind: "leave_scene", character_id: id }],
  wrong_destination: id => [{ kind: "move_character", character_id: id, location_id: "test_remote" }],
};
for (const [label, commands] of Object.entries(CONTROLLERS)) for (const narration of ["follow", "refuse", "stay"] as const) {
  test(`controller ${label} x narration ${narration}: authority is the narrated completed follow, never the proposal`, async () => {
    const { f } = setup("npcplus_authored", "origin");
    const r = await play(`Nicco goes down the stairs. ${NARRATIONS[narration].replaceAll("{N}", "Maren")}`, "I go down to the main hall. Maren, come with me.", { fixture: f, commands: commands("maren") });
    assert.ok(r.result);
    const follows = narration === "follow";
    assert.equal(r.where("maren"), follows ? "test_hall" : "test_room");
    assert.equal(r.moved("maren").length, follows ? 1 : 0, "exactly one authoritative move and one development");
    // Two identical controller proposals are both authorized (cosmetic: the second is a no-op at commit); the state change is single.
    const authorizedMoves = r.result!.authorized_commands.filter(c => c.kind === "move_character" && c.character_id === "maren").length;
    assert.equal(authorizedMoves, follows ? (label === "duplicate" ? 2 : 1) : 0);
    assert.equal(r.result!.authorized_commands.some(c => c.kind === "leave_scene"), false);
    assert.equal(r.where("brenna"), "test_room");
  });
}

// ------------------------------------------------------------------------------------------------ invalid / unreachable Nicco movement
test("unreachable Nicco movement fails the turn with no partial state, whatever the narration or controller says", async () => {
  const f = household();
  const before = JSON.stringify(f.campaign.exportSnapshot());
  const r = await play("Nicco is at the docks. Maren follows him.", "I go to the remote docks. Maren, come with me.", { fixture: f, commands: [{ kind: "move_character", character_id: "maren", location_id: "test_remote" }] });
  assert.equal(r.result, undefined, "no completed turn");
  assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before, "failed turn leaves the snapshot byte-identical");
});
