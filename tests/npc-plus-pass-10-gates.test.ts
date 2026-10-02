import test from "node:test";
import assert from "node:assert/strict";
import { invitedFollowers } from "../src/turn/follow-invitation.js";
import { GATES } from "../src/turn/language/gates.js";

/** NPC+ Pass 10 — generated natural-English probes around the shared gates that decide follow / invitation / absent reference. */
const mk = (id: string) => ({ id, names: [id[0]!.toUpperCase() + id.slice(1)] });
const one = [mk("maren")], two = [mk("maren"), mk("brenna")], OTHERS = ["Gerome"];
const PHRASES = ["come with me", "come along", "come down", "come up", "come back", "join me", "follow me", "accompany me", "walk with me", "keep me company", "take my arm"] as const;

// ------------------------------------------------------------------------------------------------ invitations
const OFFERS = ["{N}, {P}.", "{P}, {N}.", "{N}, would you {P}?", "Could you {P}, {N}?", "{N}, please {P}.", "{N}, {P} if you like.", "{N}, {P} if you want.", "I would like {N} to {P}.", "{N}, you can {P}.",
  "{N}, I'd be glad if you'd {P}... {P}, {N}.", "Maren, how about you {P}?"] as const;
test("explicit invitations (every phrase x every polite frame) reach exactly the named NPC+", () => {
  let n = 0;
  for (const p of PHRASES) for (const frame of OFFERS) {
    const text = frame.replaceAll("{N}", "Maren").replaceAll("{P}", p).replace("I'd be glad if you'd", "Come now"); n++;
    assert.deepEqual(invitedFollowers(text, two, OTHERS), ["maren"], text);
    assert.deepEqual(invitedFollowers(text, one, OTHERS), ["maren"], text);
  }
  assert.ok(n >= 100);
});
const NOT_OFFERS = ["{N}, don't {P}.", "{N}, dont {P}.", "{N}, never {P}.", "If {N} would {P}, it would help.", "Yesterday I asked {N} to {P}.", "I remember asking {N} to {P}.", "{N}, you must {P}.", "{N}, {P} or else.",
  "{N}, you have to {P}.", "Imagine {N} could {P}.", "Suppose {N} were to {P}.", "I ordered {N} to {P}.", "I could never ask {N} to {P}.", "Someday {N} will {P}.", "Tomorrow {N} will {P}.", "I'd rather you didn't {P}, {N}.",
  "I'd rather you didnt {P}, {N}.", "{N}, I'm not asking you to {P}.", "{N}, I told you to {P} last night.", "Two days ago I asked {N} to {P}.", "{N}, you wont {P}.", "I won't ask {N} to {P}.", "{N}, one day you will {P}.", "I threaten {N}: {P}."] as const;
test("negated, conditional, imagined, remembered, other-day, coercive and threatening forms are never invitations (typed and apostrophed negation alike)", () => {
  for (const p of PHRASES) for (const frame of NOT_OFFERS) {
    const text = frame.replaceAll("{N}", "Maren").replaceAll("{P}", p);
    assert.deepEqual(invitedFollowers(text, two, OTHERS), [], text);
  }
});
test("who is invited: named, group, unnamed single, ambiguous unnamed (fail closed), another present person addressed", () => {
  assert.deepEqual(invitedFollowers("Maren, Brenna, come with me.", two, OTHERS), ["maren", "brenna"]);
  for (const g of ["Anyone who wants can come with me.", "Both of you, come with me.", "Everyone, come along.", "You all, join me.", "Whoever wants to, come with me."]) assert.deepEqual(invitedFollowers(g, two, OTHERS), ["maren", "brenna"], g);
  assert.deepEqual(invitedFollowers("Come with me.", one, OTHERS), ["maren"], "a single eligible NPC+ is the unnamed addressee");
  assert.deepEqual(invitedFollowers("Come with me.", two, OTHERS), [], "two eligible and nobody named: nobody (never guess)");
  assert.deepEqual(invitedFollowers("Gerome, come with me.", one, OTHERS), [], "naming another present person never reaches the sole eligible NPC+");
  assert.deepEqual(invitedFollowers("Brenna, come with me.", one, [...OTHERS, "Brenna"]), [], "an ineligible present person (production passes every non-eligible present name) is nobody");
});
test("documented gaps stay fail-closed (false negatives): 'if you came along', 'come on, let's go', 'wont you come'", () => {
  for (const t of ["Maren, I'd love it if you came along.", "Maren, come on, let's go together.", "Maren, won't you come with me?", "Maren, wont you come with me?"]) assert.deepEqual(invitedFollowers(t, one, OTHERS), [], t);
});

// ------------------------------------------------------------------------------------------------ gate invariants over generated cue families
const FAMILIES: Readonly<Record<string, readonly string[]>> = {
  negation: ["not", "never", "no longer", "can't", "won't", "doesn't", "didn't", "isn't"],
  modal: ["would", "could", "might", "may", "can", "will", "should", "shall"],
  hypothetical: ["if", "unless", "whether"],
  refusal: ["refuses", "declined", "rejects"],
  incomplete: ["almost", "nearly", "about to", "ready to", "tries to", "wants to", "plans to"],
  other_day: ["yesterday", "earlier", "two days ago", "last night", "tomorrow"],
  recollection: ["remembers", "recalls", "used to"],
  habitual: ["usually", "normally", "typically", "always", "often", "whenever", "every time", "as usual"],
};
test("follow_not_done fires on every cue of every family it is documented to cover, in prefix, infix and suffix position", () => {
  for (const [family, cues] of Object.entries(FAMILIES)) for (const cue of cues) for (const frame of ["{c} Maren follows him.", "Maren {c} follows him.", "Maren follows him {c}."]) {
    const text = frame.replace("{c}", cue);
    // `can` and `will` etc. are gate cues as whole words; "tries to" etc. are phrases. All must veto.
    assert.equal(GATES.follow_not_done.test(text), true, `${family}: ${text}`);
  }
});
test("follow_not_done stays silent on plain completed manner: quietly, slowly, a step behind, without a word, a moment later", () => {
  for (const t of ["Maren follows him.", "Maren quietly follows him.", "Maren follows a step behind.", "Maren follows without a word.", "A moment later, Maren follows him.", "Maren followed him down the stairs.", "Maren follows, catching the door.", "Maren follows him in silence."])
    assert.equal(GATES.follow_not_done.test(t), false, t);
});
test("gate overlap: a sentence the follow grammar would accept never carries a negation/refusal/hypothetical/habitual cue (independent cue lists)", () => {
  const veto = new RegExp(`\\b(?:${Object.values(FAMILIES).flat().map(c => c.replace(/'/g, "'?")).join("|")})\\b`, "i");
  for (const accepted of ["Maren follows him.", "Maren quietly follows him.", "Maren follows a step behind.", "A moment later, Maren follows him.", "Maren's footsteps follow."]) assert.equal(veto.test(accepted.replace(/a moment later/i, "")), false, accepted);
});
test("invitation_not_offered covers the player-typed contractions and keeps modal requests as invitations", () => {
  for (const t of ["Maren, dont come.", "Maren doesnt need to come.", "I didnt ask Maren to come.", "Maren wont come."]) assert.equal(GATES.invitation_not_offered.test(t), true, t);
  for (const t of ["Maren, would you come with me?", "Could you come with me, Maren?", "Maren, please come with me.", "Maren, you can come with me."]) assert.equal(GATES.invitation_not_offered.test(t), false, t);
});
