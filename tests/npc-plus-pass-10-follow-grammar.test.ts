import test from "node:test";
import assert from "node:assert/strict";
import { grammarProbe, play } from "./pass10-support.js";
import { positiveCorpus, negativeCorpus, nonMoverCorpus, UNSUPPORTED_ORNATE } from "./pass10-corpus.js";

/**
 * NPC+ Pass 10 — adversarial follow grammar. The corpora are deterministic cross-products (tests/pass10-corpus.ts). The contract is
 * asymmetric: zero tolerance for false positives (a wrong move commits state), false negatives are reported and fail closed.
 */
const PREFIX = "Nicco goes down the stairs. ";
const one = grammarProbe({ members: ["maren"] }), two = grammarProbe({ members: ["brenna", "maren"] });

test("positive corpus: every intended completed-follow form resolves to Nicco's arrival (no false negatives in scope)", () => {
  for (const c of positiveCorpus("Maren")) assert.deepEqual(one(PREFIX + c.text), ["maren->test_hall"], c.text);
  for (const c of positiveCorpus("She", "Her")) assert.deepEqual(one(PREFIX + c.text), ["maren->test_hall"], c.text);
});
test("two eligible women: a pronoun-led follow fails closed, a named one still resolves", () => {
  for (const c of positiveCorpus("She", "Her")) assert.deepEqual(two(PREFIX + c.text), [], c.text);
  for (const c of positiveCorpus("Maren").slice(0, 400)) assert.deepEqual(two(PREFIX + c.text), ["maren->test_hall"], c.text);
});
test("negative corpus (vision, cognition, sound, hypothetical, negation, incomplete, refusal, temporal, other destination, dialogue, reported, ambient): zero false positives", () => {
  for (const subject of ["Maren", "She"]) for (const c of negativeCorpus(subject)) assert.deepEqual(one(PREFIX + c.text), [], c.text);
});
test("a different mover (not an NPC+, not a registered person, Nicco himself) never moves anyone", () => {
  for (const c of nonMoverCorpus()) assert.deepEqual(one(PREFIX + c.text), [], c.text);
});
test("ornate narration outside the grammar fails closed: it never moves anyone to a place other than Nicco's arrival", () => {
  for (const t of UNSUPPORTED_ORNATE) for (const m of one(PREFIX + t.replaceAll("{S}", "Maren"))) assert.equal(m, "maren->test_hall", t);
});
test("INVARIANT 3: Nicco did not move -> no implicit follow, whatever the narration", () => {
  const still = grammarProbe({ members: ["maren"], niccoMoves: false });
  for (const c of positiveCorpus("Maren").slice(0, 600)) assert.deepEqual(still(PREFIX + c.text), [], c.text);
});
test("INVARIANT 4: an active NPC+ already at the arrival produces no command", () => {
  const there = grammarProbe({ members: ["maren"], marenAtHall: true });
  for (const c of positiveCorpus("Maren").slice(0, 600)) assert.deepEqual(there(PREFIX + c.text), [], c.text);
});

// ------------------------------------------------------------------------------------------------ live-derived regressions
test("the live follow shape — 'Behind him, <name>'s uneven tread followed — slow… her hand settled…' — is recognised (Pass 9 recognition gap)", async () => {
  const r = await play("Nicco descended the stairs. Behind him, Maren's uneven tread followed — slow… her hand settled lightly on the rail.", "I go down to the main hall. Maren, come with me.");
  assert.equal(r.where("maren"), "test_hall");
  assert.equal(r.moved("maren").length, 1);
  assert.equal(r.result?.narration_reconciliation?.issues.length ?? 0, 0, "an authorized follow is not erased");
});
test("a dash or ellipsis ends the follow manner like a comma, but never hides another destination", () => {
  for (const t of ["Maren follows him — to the window.", "Maren followed — toward the window, slowly.", "Maren followed… to the table.", "Maren followed — across the room to the shelf."]) assert.deepEqual(one(PREFIX + t), [], t);
  for (const t of ["Maren followed — slow and careful.", "Maren followed… quietly."]) assert.deepEqual(one(PREFIX + t), ["maren->test_hall"], t);
});
test("pre-existing false positives repaired: an entry word inside another phrase is not an arrival ('walks in the garden', 'goes in circles', 'door of the kitchen')", () => {
  for (const t of ["Maren walks in the garden.", "Maren goes in circles.", "Maren followed him to the door of the kitchen.", "Maren followed him in the dark.", "Maren went in the room behind the stairs.", "Maren follows in her mind the path he took."])
    assert.deepEqual(one(PREFIX + t), [], t);
  for (const t of ["Maren followed him inside.", "Maren followed him in.", "Maren walked in, silent.", "Maren followed him through the tower door.", "Maren followed him into the main hall."])
    assert.deepEqual(one(PREFIX + t), ["maren->test_hall"], t);
});
