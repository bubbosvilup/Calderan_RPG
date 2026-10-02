import test from "node:test";
import assert from "node:assert/strict";
import { play } from "./pass10-support.js";
import { classifyFollowChoice } from "../src/dev/follow-choice-classify.js";
import { applyVariant, type VariantId } from "../src/dev/follow-choice-variants.js";

/** NPC+ Pass 10 — the optional paid probe's pure parts: classification of real Pass 9 drafts and single-factor prompt variants. */
const LIVE: readonly (readonly [string, string, string, boolean, string])[] = [
  ["breakfast 12 (decline: nobody answers)", "Maren", "Nicco's voice carries back up the stairwell, but no answer follows him down. If Maren replies, it would be from the room above or the stair behind — and the stair remains still. No footsteps sound on the boards behind him.", false, "STAY"],
  ["chores 9 (decline that misplaces Brenna)", "Brenna", "He is alone here. Brenna is away — not in the observation room above, not on the stairs, not in the hall. Whatever answer she might have given to his invitation, she is not here to give it.", false, "STAY"],
  ["friction 12 (decline for all three)", "Maren", "No footsteps follow behind him. Brenna, Gerome, and Maren each stay where they are — the observation room and whatever conversation lingered there remain upstairs.", false, "STAY"],
  ["evening care 11 (decline that misplaces Gerome)", "Gerome", "Gerome does not follow. He was not in the room when Nicco left, and the stairwell and hall below are empty. Whatever Gerome is doing tonight, he is elsewhere — away, as the household state records him.", false, "STAY"],
  ["errands 2 (decline that misplaces both)", "Maren", "The Observation room behind him stays silent. Gerome was not there to hear the invitation, and neither was Maren — both of them away from this floor entirely.", false, "STAY"],
  ["errands 11 (the one live follow, after the grammar fix)", "Brenna", "Nicco descended the stairs. Behind him, Brenna's uneven tread followed — slow… her hand settled lightly on his arm.", true, "FOLLOW"],
  ["hesitation only", "Maren", "Maren looks at the stairs and then at her hands, and says nothing.", false, "AMBIGUOUS"],
  ["name never mentioned", "Maren", "The hall is quiet and the hearth is cold.", false, "OTHER"],
];
for (const [label, name, text, grammar, expected] of LIVE) test(`classification of a real draft: ${label}`, () => assert.equal(classifyFollowChoice(text, name, grammar), expected));

test("variants: production is the identity; each other variant differs by exactly one factor; none implies acceptance or refusal or hides state", async () => {
  const r = await play("Nicco goes down the stairs.", "I go down to the main hall. Maren, come with me.");
  const c = { from: "Observation room", to: "Main hall", who: "Maren" };
  assert.equal(applyVariant("production", r.prompt, c), r.prompt);
  const lines = (s: string) => s.split("\n");
  const changed = (id: VariantId) => lines(applyVariant(id, r.prompt, c)).filter((l, i) => l !== lines(r.prompt)[i]).length;
  assert.equal(changed("pass9_note"), 1, "only the invited note differs");
  assert.doesNotMatch(applyVariant("pass9_note", r.prompt, c), /Before this turn Maren was in/);
  assert.equal(changed("away_labels"), 2, "only the two away labels of the invited person differ");
  assert.match(applyVariant("away_labels", r.prompt, c), /Maren \(in Observation room\)/);
  assert.match(applyVariant("away_labels", r.prompt, c), /Brenna \(away\)/, "the uninvited keep their label");
  const reordered = applyVariant("invited_first", r.prompt, c);
  assert.deepEqual(lines(reordered).slice().sort(), lines(r.prompt).slice().sort(), "reordering moves lines, adds and removes none");
  for (const id of ["pass9_note", "away_labels", "invited_first"] as const) assert.doesNotMatch(applyVariant(id, r.prompt, c), /Maren (?:will|has decided to|decides to) (?:follow|stay)|should follow|must follow/);
});
