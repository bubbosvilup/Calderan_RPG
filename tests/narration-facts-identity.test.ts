import test from "node:test";
import assert from "node:assert/strict";
import { dialogueUnits, frameOf, identityForms, type IdentityFact, type Person } from "../src/turn/narration-facts/index.js";
import { identityFacts, type IdentityScope } from "../src/turn/narration-facts/identity-forms.js";
import { attributedSpeech } from "../src/turn/identity/attributed-speech.js";
import { sellerPrices } from "../src/turn/commerce/commerce-evidence.js";
import { extractNarrationFacts } from "../src/turn/narration-facts/index.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { asksName } from "../src/turn/identity/identity-request.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";

/**
 * Consolidation block 11 - NarrationFacts / identity, speaker, recipient and reference facts. The facts describe who speaks a line, who gives a
 * name, who a line is addressed to and who a narrated sentence can mean; the consumers' policies decide (attributed-speech.ts, commerce-evidence.ts,
 * name-establishment.ts, partner-identity-guard.ts). Ambiguity is a first-class result: two candidates are never collapsed into one.
 */
const P = (id: string, sex: "female" | "male", name = id[0]!.toUpperCase() + id.slice(1)): Person => ({ id, names: [name], sex, unnamed: false });
const NICCO = P("nicco", "male"), KORVIN = P("korvin", "male"), BRENNA = P("brenna", "female"), MAREN = P("maren", "female");
const people = [NICCO, KORVIN, BRENNA];
type Line = [text: string, speaker: string | null, method: string | null];
const spoken = (narration: string, ps: readonly Person[] = people, rpg = true): Line[] =>
  dialogueUnits(narration, 0, ps, [], { rpg }).filter(u => u.quoted).map(u => [u.text, u.speaker ?? null, u.attribution?.method ?? null]);
const facts = (narration: string, ps: readonly Person[] = people, extra: Partial<IdentityScope> = {}): IdentityFact[] =>
  identityFacts(frameOf(narration), dialogueUnits(narration, 0, ps, [], { rpg: true }), { people: ps, ...extra });
const of = <K extends IdentityFact["kind"]>(list: readonly IdentityFact[], kind: K) => list.filter((f): f is Extract<IdentityFact, { kind: K }> => f.kind === kind);

// ------------------------------------------------------------------------------------------------ speaker attribution (Phase 3, cases A-G)
test("A explicit dialogue tag: the tag names the speaker, not the person the sentence opened with", () => {
  assert.deepEqual(spoken('Korvin leans on the post. "Two hundred," Brenna says.', people, false), [["Two hundred,", "brenna", "explicit_dialogue_tag"]]);
});
test("B adjacent action beat: an RPG plain line after a starred beat is the beat subject's", () => {
  assert.deepEqual(spoken("*Korvin leans on the post.*\n\nTwo hundred."), [["Two hundred.", "korvin", "adjacent_action_beat"]]);
});
test("C continued speaker: after a non-person beat the last acting subject keeps the line", () => {
  assert.deepEqual(spoken("*Korvin leans on the post.*\n\nTwo hundred.\n\n*The wind picks up.*\n\nTake it or leave it."),
    [["Two hundred.", "korvin", "adjacent_action_beat"], ["Take it or leave it.", "korvin", "continued_speaker"]]);
});
test("D direct name: a line labelled with a present person's name", () => {
  assert.deepEqual(spoken("*The market is loud.*\n\nKorvin: Two hundred."), [["Two hundred.", "korvin", "direct_name"]]);
});
test("E several speakers: a plural beat makes the line ambiguous between them, never one of them", () => {
  const [u] = dialogueUnits("*Korvin and Brenna look at each other.*\n\nFine.", 0, people, [], { rpg: true }).filter(x => x.quoted);
  assert.equal(u!.speaker, undefined);
  assert.equal(u!.attribution?.ambiguity, "ambiguous");
  assert.deepEqual([...u!.attribution!.candidates].sort(), ["brenna", "korvin"]);
});
test("F scene narration: starred prose has no speaker and no spoken line", () => {
  assert.deepEqual(spoken("*Rain falls on the market. Nobody moves.*"), []);
});
test("G nested quote: a line that reports somebody else's words stays ONE line of its own speaker", () => {
  assert.deepEqual(spoken('*Korvin leans on the post.*\n\nI told her "go home" and she didn\'t listen.'), [['I told her "go home" and she didn\'t listen.', "korvin", "adjacent_action_beat"]]);
});
test("post-hoc delivery tag (KPG-2): 'He says it flat' after a plain price line attributes the line; a different earlier beat subject makes it ambiguous", () => {
  assert.deepEqual(spoken("*Korvin nods at the pen.*\n\nHundred gold.\n\n*He says it flat.*"), [["Hundred gold.", "korvin", "explicit_dialogue_tag"]]);
  const [u] = dialogueUnits("*Brenna crosses her arms.*\n\nHundred gold.\n\n*Korvin says it flat.*", 0, people, [], { rpg: true }).filter(x => x.quoted);
  assert.equal(u!.speaker, undefined); assert.equal(u!.attribution?.ambiguity, "ambiguous");
});
test("speaker facts carry span, source text, method, confidence and candidates; nothing in them decides persistence", () => {
  const [f] = of(facts("*Korvin leans on the post.*\n\nTwo hundred."), "speaker_attribution");
  assert.equal(f!.source_text, "Two hundred.");
  assert.equal(f!.subject.entity_id, "korvin"); assert.equal(f!.attribution.method, "adjacent_action_beat"); assert.equal(f!.provenance.extractor, "identity");
  for (const key of ["should_persist", "persist", "importance", "materialize", "create"]) assert.ok(!(key in f!), key);
});

// ------------------------------------------------------------------------------------------------ self-introduction / names (Phase 5)
test("self-introduction and name disclosure are different facts; a presented name is the presenter's statement about someone else", () => {
  const self = of(facts("*The woman looks up.*\n\nMy name is Maren.", people, { asked: true }), "self_introduction");
  assert.deepEqual(self.map(f => [f.form, f.name, f.subject.entity_id]), [["my_name_is", "Maren", "other:woman"]]);
  const told = facts("*Korvin jerks his chin at the pen.*\n\nThat's Brenna. She cooks.");
  assert.deepEqual(of(told, "self_introduction"), []);
  assert.deepEqual(of(told, "name_disclosure").map(f => [f.form, f.name, f.subject.entity_id]), [["presented", "Brenna", "korvin"]]);
});
test("the shared name forms: standalone, full names and the bare answer to a name question", () => {
  const forms = (text: string, asked = false) => identityForms({ text, quoted: true, exchange: 0, paragraph: 0 }, asked).map(f => [f.kind, f.form, f.full_name ?? f.name, f.standalone]);
  assert.deepEqual(forms("I'm Korvin."), [["self", "i_am", "Korvin", true]]);
  assert.deepEqual(forms("My name is Tomas Reed. Sit down."), [["self", "my_name_is", "Tomas Reed", true]]);
  assert.deepEqual(forms("Lira."), [["self", "bare_name", "Lira", true]]);
  assert.deepEqual(forms("Maren. If it doesn't matter.", true), [["self", "name_first", "Maren", true], ["weak", "weak_opening", "Maren", false]]);
  assert.deepEqual(forms("Maren. If it doesn't matter.", false), [["weak", "weak_opening", "Maren", false]]);
});
test("the narrated name question (live B): 'I ask the apple seller what her name is' asks the name; a question about somebody ELSE's name does not", () => {
  for (const q of ["I ask the apple seller what her name is. She answers: \"My name is Maren.\"", "I ask her name.", "I ask him for his name.", "I asked the old guard what his name is."])
    assert.ok(asksName(q), q);
  for (const q of ["I ask Korvin what her name is.", "I ask him what her name is.", "I ask the man beside her what her name is.", "I ask the price.", "I ask her about the apples."])
    assert.ok(!asksName(q), q);
});
test("an unattributed self-introduction is still a self-introduction fact, with no subject: who it names is policy", () => {
  const [f] = of(facts("*Another man steps forward.*\n\nI'm Erdan."), "self_introduction");
  assert.equal(f!.name, "Erdan"); assert.equal(f!.subject.entity_id, undefined); assert.notEqual(f!.ambiguity, "none");
});

// ------------------------------------------------------------------------------------------------ recipient (Phase 6)
test("recipient facts: 'says to Nicco' is the player, a vocative is the named person, 'her' with one woman resolves and with two is ambiguous", () => {
  const recipient = (narration: string, ps: readonly Person[] = people) => of(facts(narration, ps), "recipient_attribution").map(f => [f.form, f.recipient.entity_id ?? null, [...f.recipient.candidates].sort(), f.ambiguity]);
  assert.deepEqual(recipient("*Korvin says to Nicco:*\n\nTwo hundred."), [["says_to", "nicco", ["nicco"], "none"]]);
  assert.deepEqual(recipient("*Korvin turns.*\n\nBrenna, take this."), [["vocative", "brenna", ["brenna"], "none"]]);
  assert.deepEqual(recipient("*Korvin says to her:*\n\nStand up."), [["says_to", "brenna", ["brenna"], "none"]]);
  assert.deepEqual(recipient("*Korvin says to her:*\n\nStand up.", [...people, MAREN]), [["says_to", null, ["brenna", "maren"], "ambiguous"]]);
});

// ------------------------------------------------------------------------------------------------ references (Phase 7)
test("references: one 'she' resolves, two are ambiguous; a descriptor matching one person resolves, two are ambiguous; 'another man' is somebody new", () => {
  const refs = (narration: string, ps: readonly Person[] = people, extra: Partial<IdentityScope> = {}) => of(facts(narration, ps, extra), "reference").map(f => [f.form, f.subject.entity_id ?? null, f.ambiguity, !!f.introduces_new]);
  assert.deepEqual(refs("*She nods.*"), [["pronoun", "brenna", "none", false]]);
  assert.deepEqual(refs("*She nods.*", [...people, MAREN]), [["pronoun", null, "ambiguous", false]]);
  assert.deepEqual(refs("*The woman nods.*", people, { descriptors: new Map([["x1", "woman"]]) }), [["descriptor", "x1", "none", false]]);
  assert.deepEqual(refs("*The woman nods.*", people, { descriptors: new Map([["x1", "woman"], ["x2", "woman"]]) }), [["descriptor", null, "ambiguous", false]]);
  assert.deepEqual(refs("*Another man steps forward.*"), [["descriptor", null, "unresolved", true]]);
});
test("the same name is never a merge: two present people named Maren make the reference ambiguous", () => {
  const twins = [...people, MAREN, { id: "maren_two", names: ["Maren"], sex: "female" as const, unnamed: false }];
  const [ref] = of(facts("*Maren nods.*", twins), "reference");
  assert.equal(ref!.subject.entity_id, undefined); assert.deepEqual([...ref!.subject.candidates].sort(), ["maren", "maren_two"]);
});

// ------------------------------------------------------------------------------------------------ policies over the facts
test("speaker policy: RPG plain speech is never a named speaker's words for the audit/household consumers; legacy tags are, Nicco only by name", () => {
  const f = turnFixture(), context = buildTurnContext(f.world, f.campaign.exportSnapshot());
  assert.deepEqual(attributedSpeech("*Brenna leans on the post.*\n\nTwo hundred.", context), { rpg: ["Two hundred."], lines: [] });
  assert.deepEqual(attributedSpeech('Brenna leans on the post. "Two hundred," she says.', context).lines.map(l => [l.speaker, l.text]), [["brenna", "Two hundred,"]]);
  assert.deepEqual(attributedSpeech('Nicco smiles. "Fine," he says.', context).lines, [], "a pronoun never puts words in Nicco's mouth");
  assert.deepEqual(attributedSpeech('"Fine," Nicco says.', context).lines.map(l => l.speaker), ["nicco"]);
});
test("commerce recipient policy: a price addressed to somebody other than Nicco, or to an ambiguous 'her', is not an offer to the player", () => {
  const f = turnFixture(), context = buildTurnContext(f.world, f.campaign.exportSnapshot());
  const prices = (text: string) => sellerPrices(extractNarrationFacts(text, { movers: [], context }));
  assert.deepEqual(prices('Gerome says to Nicco, "Two hundred gold for the halberd."'), [200]);
  assert.deepEqual(prices('Gerome says to Brenna, "Two hundred gold for the halberd."'), []);
  assert.deepEqual(prices('Gerome turns. "Brenna, two hundred gold for the halberd."'), []);
});
