import test from "node:test";
import assert from "node:assert/strict";
import { play } from "./pass10-support.js";
import { participatesInScene } from "../src/turn/scene-participation.js";
import { leftBehindNotes, invitedFollowers } from "../src/turn/follow-invitation.js";

const issuesOf = async (narration: string, input = "I go down to the main hall.") => (await play(narration, input)).result?.narration_reconciliation?.issues.map(i => i.kind) ?? [];

// ------------------------------------------------------------------------------------------------ condition audit (live chores 9 false positive)
test("'descends to the ground-floor hall' is a walking destination, not a knockdown (live chores 9, root cause)", async () => {
  for (const s of ["The stairs creak underfoot as Nicco descends to the ground-floor hall.", "The stairs creak underfoot as Nicco descends to the ground floor.",
    "Nicco goes down to the floor below.", "Nicco is led to the ground floor.", "The stairs creak underfoot as Nicco climbs back to the observation room."])
    assert.equal((await issuesOf(s)).includes("uncommitted_condition"), false, s);
});
test("ambient and object events beside a person are never that person's condition", async () => {
  for (const s of ["The floor groans under Nicco's weight.", "Light falls across Nicco's face.", "A shadow falls over Nicco.", "Rain beats against Nicco's hood.", "Dust settles on Nicco's sleeve.",
    "The chair groans as Nicco sits.", "Glass cracks under Nicco's boot.", "Fabric tears as Nicco pulls the sleeve.", "The boards complain as Nicco crosses the hall.", "The door shudders as Nicco opens it.", "The flame flickers beside Nicco."])
    assert.equal((await issuesOf(s)).includes("uncommitted_condition"), false, s);
});
test("a real fall or injury of a person is still caught", async () => {
  for (const s of ["Nicco falls to the floor.", "Nicco stumbles and falls.", "Nicco collapses onto the floor.", "Nicco staggers, then crumples to the floor.", "Nicco is knocked to the ground.",
    "Nicco's knees buckle and he drops to the ground.", "Nicco is thrown to the ground.", "Nicco goes down to the floor.", "Nicco steps back and drops to the ground.", "Blood runs from Nicco's split lip."])
    assert.equal((await issuesOf(s)).includes("uncommitted_condition"), true, s);
});

// ------------------------------------------------------------------------------------------------ absent participant: reference vs participation
const ROWS: readonly (readonly [name: string, sentence: string, participates: boolean, kind: string])[] = [
  ["Korvin", "Korvin is a slaver.", false, "reference"], ["Korvin", "I remember Korvin.", false, "reference"], ["Korvin", "According to Korvin, the price is fair.", false, "reference"],
  ["Korvin", "Korvin said yesterday that the boat was late.", false, "reference"], ["Korvin", "What Nicco knows of Korvin comes from the market.", false, "reference"], ["Korvin", "Korvin's shop stands at the corner.", false, "reference"],
  ["Korvin", "Stories about Korvin circulate in the quarter.", false, "reference"], ["Korvin", "If Korvin were here, he would laugh.", false, "reference"], ["Korvin", "Korvin works at the harbour.", false, "reference"],
  ["Korvin", "Korvin never comes here.", false, "reference"], ["Korvin", "Korvin left before dawn.", false, "reference"], ["Korvin", "Nicco speaks of Korvin.", false, "reference"],
  ["Brenna", "Brenna remains upstairs.", false, "reference"], ["Brenna", "Brenna does not follow.", false, "reference"], ["Maren", "Maren was not there to hear the invitation.", false, "reference"],
  ["Korvin", "Korvin walks in.", true, "participation"], ["Korvin", "Korvin says, \"Pay me.\"", true, "participation"], ["Korvin", "\"Pay me,\" Korvin says.", true, "participation"],
  ["Korvin", "\"Pay me,\" says Korvin.", true, "participation"], ["Korvin", "Nicco hands Korvin a coin.", true, "participation"], ["Korvin", "Korvin is here.", true, "participation"],
  ["Korvin", "Korvin, the slaver, smiles.", true, "participation"], ["Brenna", "Brenna answers from the stairwell.", true, "participation"],
  // Conservative gaps (fail toward allowing). Classified, locked here so a future coreference/possessive pass flips them deliberately.
  ["Korvin", "Korvin's voice cuts through the room.", false, "gap: possessive voice, acceptable conservative gap (a small possessive-sound rule could own it)"],
  ["Korvin", "Footsteps announce Korvin.", false, "gap: name as object of a non-interaction verb, acceptable conservative gap"],
  ["Korvin", "Someone calls to Korvin and he answers.", false, "gap: pronoun continuation, needs discourse/coreference"],
  ["Korvin", "Korvin is away. He laughs.", false, "gap: pronoun continuation, needs discourse/coreference"],
  ["Brenna", "Brenna stayed upstairs. She calls down.", false, "gap: pronoun continuation, needs discourse/coreference"],
  ["Maren", "Maren is absent. A moment later, she enters.", false, "gap: pronoun continuation, needs discourse/coreference"],
];
for (const [name, sentence, expected, kind] of ROWS) test(`absent participant (${kind.split(":")[0]}): ${sentence}`, () => assert.equal(participatesInScene(sentence, [name]), expected));

// ------------------------------------------------------------------------------------------------ invitation note
test("the invited note states the pre-turn fact separately from the choice, and decides nothing", () => {
  const mk = (id: string) => ({ id, names: [id[0]!.toUpperCase() + id.slice(1)] });
  const [note] = leftBehindNotes([mk("maren")], ["maren"], "Observation room", "Main hall");
  assert.match(note!, /Before this turn Maren was in Observation room with Nicco and present when he spoke/);
  assert.match(note!, /"away" or unlisted label/);
  assert.match(note!, /decides freely whether to follow him: do not assume either choice/);
  assert.match(note!, /If someone follows, they arrive in Main hall after Nicco/);
  assert.doesNotMatch(note!, /stays there|Maren follows|wants to|will follow|has decided|not yet/);
  const [plural] = leftBehindNotes([mk("maren"), mk("gerome")], ["maren", "gerome"], "Observation room", "Main hall");
  assert.match(plural!, /Maren, Gerome were invited to come along and each decide freely/);
  assert.match(plural!, /Before this turn Maren, Gerome were in Observation room with Nicco/);
});
test("the conservative note for people who were NOT invited is byte-identical to Pass 9", () => {
  const mk = (id: string) => ({ id, names: [id[0]!.toUpperCase() + id.slice(1)] });
  assert.deepEqual(leftBehindNotes([mk("maren"), mk("brenna")], [], "Observation room", "Main hall"),
    ["Nicco leaves Observation room. Maren, Brenna stay there: do not have Nicco bring or carry them. Someone comes along only if they themselves clearly follow him, narrated explicitly."]);
  assert.deepEqual(invitedFollowers("I go down.", [mk("maren")]), []);
});
test("no state concealed: the prompt still lists the invited NPC+ as away and the arrival scene as Nicco alone", async () => {
  const r = await play("Nicco goes down the stairs.", "I go down to the main hall. Maren, come with me.");
  assert.match(r.prompt, /members: Brenna \(away\), Maren \(away\)/);
  assert.match(r.prompt, /\[PRESENT AND ABLE TO REACT\]\n- Nobody besides Nicco\./);
  assert.equal(r.where("maren"), "test_room");
});
