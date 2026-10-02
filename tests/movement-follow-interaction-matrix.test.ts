import test from "node:test";
import assert from "node:assert/strict";
import { play } from "./pass10-support.js";
import type { CampaignCommand } from "../src/campaign/types.js";

/**
 * Movement/follow debt closure: combined interaction matrix. Every row runs the REAL turn pipeline (scripted narrator and controller) and
 * asserts the one invariant that matters across all fifteen debts: delivered prose and committed state agree, and nobody moves without
 * narrated completed evidence. Rows combine: single / two / group, named / unnamed / absent addressee, down / up / unreachable,
 * draft follow / stay, pronoun / named follow, duplicate and wrong controller proposals, and destination-less departures.
 */
const mv = (character_id: string, location_id: string): CampaignCommand => ({ kind: "move_character", character_id, location_id });
interface Row { readonly name: string; readonly members: readonly string[]; readonly input: string; readonly narration: string; readonly commands?: readonly CampaignCommand[]; readonly evidence?: readonly string[];
  readonly extra?: readonly CampaignCommand[]; readonly expect: Readonly<Record<string, string>>; readonly moves?: number; readonly stateOnly?: true }
const DOWN = "I go down to the main hall.";
// Final movement closure rows. Every row: narration -> evidence -> authorization -> committed location -> scene projection (state `expect`) -> persistence (single authoritative location).
const ROWS: readonly Row[] = [
  { name: "single, named, follows", members: ["maren"], input: `${DOWN} Maren, come with me.`, narration: "Nicco goes down the stairs. Maren follows him a moment later.", expect: { maren: "test_hall" } },
  { name: "single, named, stays", members: ["maren"], input: `${DOWN} Maren, come with me.`, narration: "Nicco goes down the stairs. Maren does not follow him.", expect: { maren: "test_room" } },
  { name: "single, unnamed invitation, follows (sole eligible)", members: ["maren"], input: `${DOWN} Come with me.`, narration: "Nicco goes down the stairs. Behind him, Maren came down a moment later.", expect: { maren: "test_hall" } },
  { name: "two, only the named one follows", members: ["maren", "brenna"], input: `${DOWN} Maren, come with me.`, narration: "Nicco goes down the stairs. Maren follows him. Brenna stays in her seat.", expect: { maren: "test_hall", brenna: "test_room" } },
  { name: "two, group invitation, both follow", members: ["maren", "brenna"], input: `${DOWN} Anyone who wants can come with me.`, narration: "Nicco goes down the stairs. Maren follows him. Brenna follows him a pace behind.", expect: { maren: "test_hall", brenna: "test_hall" } },
  { name: "group of three, one follows by an ornate form, one stays", members: ["maren", "brenna", "gerome"], input: `${DOWN} Anyone who wants can come with me.`, narration: "Nicco goes down the stairs. Gerome ducked through the doorframe and stepped into the hall. Brenna does not follow.", expect: { gerome: "test_hall", brenna: "test_room", maren: "test_room" } },
  { name: "two women, pronoun follow fails closed", members: ["maren", "brenna"], input: `${DOWN} Anyone who wants can come with me.`, narration: "Nicco goes down the stairs. Brenna looks at Maren. She follows him.", expect: { maren: "test_room", brenna: "test_room" } },
  { name: "two women, bounded pronoun follow after one named subject", members: ["maren", "brenna"], input: `${DOWN} Maren, come with me.`, narration: "Nicco goes down the stairs. Maren's footsteps followed on the stairs. She came down after him.", expect: { maren: "test_hall", brenna: "test_room" } },
  { name: "named absent addressee never invites the sole eligible NPC+, nobody follows", members: ["maren"], input: `${DOWN} Brenna, come with me.`, narration: "Nicco goes down the stairs. Maren does not follow.", extra: [mv("brenna", "test_remote")], expect: { maren: "test_room" } },
  { name: "Nicco did not move: a follow-shaped sentence moves nobody", members: ["maren"], input: "I sit down and read. Maren, stay close.", narration: "Maren joined him a moment later and hurried after him.", expect: { maren: "test_room" } },
  { name: "failed Nicco movement + dependent follow: no move, no dependent arrival prose (D-24)", members: ["maren"], input: "I walk to the remote docks. Maren, come with me.", narration: "Nicco walks to the remote docks. Maren came down after him.", expect: { maren: "test_room" } },
  { name: "duplicate controller proposals plus a narrated follow: one move", members: ["maren"], input: `${DOWN} Maren, come with me.`, narration: "Nicco goes down the stairs. Maren follows him.", commands: [mv("maren", "test_hall"), mv("maren", "test_hall")], evidence: ["Maren follows him", "Maren follows him"], expect: { maren: "test_hall" }, moves: 1 },
  { name: "wrong controller destination plus a narrated follow: both proposals reach authorization, the narrated arrival wins", members: ["maren"], input: `${DOWN} Maren, come with me.`, narration: "Nicco goes down the stairs. Maren follows him.", commands: [mv("maren", "test_remote")], evidence: ["Maren follows him"], expect: { maren: "test_hall" }, moves: 2 },
  { name: "controller proposes a move with no narrated follow: nothing moves", members: ["maren"], input: `${DOWN} Maren, come with me.`, narration: "Nicco goes down the stairs. Maren does not follow.", commands: [mv("maren", "test_hall")], evidence: ["Maren does not follow"], expect: { maren: "test_room" } },
  { name: "destination-less departure ordered by the player and narrated complete: OFF_SCENE, nowhere", members: ["maren"], input: "Maren, go out for a while.", narration: "Maren walks out, and the door shuts behind her.", expect: { maren: "OFF_SCENE" } },
  { name: "NPC+ known-destination movement while Nicco stays (explicit)", members: ["maren"], input: "I read by the window.", narration: "Maren heads down to the main hall.", expect: { maren: "test_hall" } },
  { name: "NPC+ known-destination movement while Nicco stays (unique graph relation)", members: ["maren"], input: "I read by the window.", narration: "Maren goes downstairs.", expect: { maren: "test_hall" } },
  { name: "destination-less departure, no player order: OFF_SCENE", members: ["maren"], input: "I read by the window.", narration: "Maren disappears into the city.", expect: { maren: "OFF_SCENE" } },
  { name: "known destination never becomes OFF_SCENE", members: ["maren"], input: "I read by the window.", narration: "Maren walks out to the main hall.", expect: { maren: "test_hall" } },
  { name: "player request, narrated refusal: no change", members: ["maren"], input: "Maren, go out for a while.", narration: "Maren shakes her head and stays where she is.", expect: { maren: "test_room" } },
  { name: "incomplete departure: no change", members: ["maren"], input: "I read by the window.", narration: "Maren starts toward the stairs, then looks back at him.", expect: { maren: "test_room" } },
  { name: "failed Nicco movement + independent NPC departure: OFF_SCENE", members: ["maren"], input: "I walk to the remote docks.", narration: "Nicco walks to the remote docks. Maren goes out for a while.", expect: { maren: "OFF_SCENE" } },
  { name: "normal local follow to the table while Nicco stays: delivered, nobody changes place", members: ["maren"], input: "I sit down and read. Maren, stay close.", narration: "Nicco settles at the table. Maren follows him over to the table.", expect: { maren: "test_room" } },
  { name: "destination-less stair exit while Nicco stays: state stays, prose is withdrawn", members: ["maren"], input: "I stay and read. Maren, do as you like.", narration: "Maren looked up. She crossed to the stairs and descended, her footsteps fading.", expect: { maren: "test_room" } },
];
for (const row of ROWS) test(`matrix: ${row.name}`, async () => {
  const r = await play(row.narration, row.input, { members: row.members, commands: row.commands ?? [], evidence: row.evidence ?? [], extra: row.extra ?? [] });
  assert.ok(r.result, "the turn completed");
  const at = (id: string) => r.where(id) ?? (r.snapshot.runtime.npc_locations.find(n => n.character_id === id)?.off_scene ? "OFF_SCENE" : undefined);
  for (const [id, where] of Object.entries(row.expect)) assert.equal(at(id), where, `${id} location`);
  for (const id of row.members) assert.ok(r.moved(id).length <= 1, `${id}: at most one moved development`);
  if (row.moves !== undefined) assert.equal(r.result!.authorization.filter(a => a.command.kind === "move_character").length, row.moves, "effective move proposals");
  // Prose never claims a departure or arrival that state does not hold: whoever stays upstairs is never narrated arriving or leaving.
  const text = r.result!.narration ?? "";
  if (row.stateOnly) return; // known residual D-24: a dependent follower sentence can survive the redaction of Nicco's own rejected move (state is correct)
  for (const [id, where] of Object.entries(row.expect)) if (where === "test_room") {
    const name = id[0]!.toUpperCase() + id.slice(1);
    assert.doesNotMatch(text, new RegExp(`\\b${name}\\b[^.]*\\b(?:descended|walks out|walked out|stepped into the hall|came down after him)\\b`), `${name} stays upstairs: prose must not say otherwise`);
  }
});
