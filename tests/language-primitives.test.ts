import test from "node:test";
import assert from "node:assert/strict";
import { escapeRegExp, exactNamePattern, quotedSpans, blankQuotes, sentencesOf, QUOTED_SPAN_SOURCE } from "../src/turn/language/text.js";
import { CARDINAL_WORD_ALTERNATION, NUMBER_WORDS, TENS, numberValue, numberWordValue } from "../src/turn/language/numbers.js";
import { sentencesOf as legacySentencesOf, blankQuotes as legacyBlankQuotes } from "../src/turn/sentences.js";
import { numberValue as captivesNumberValue } from "../src/turn/narrated-captives.js";

/** Hardening H1: direct tests for the canonical text and number primitives (src/turn/language/). */

// ---------------------------------------------------------------------------------------------------------------- escaping
test("escapeRegExp: every regex metacharacter matches literally", () => {
  const specials = ".*+?^${}()|[]\\";
  for (const ch of specials) {
    assert.ok(new RegExp(`^${escapeRegExp(ch)}$`).test(ch), JSON.stringify(ch));
    assert.ok(!new RegExp(`^${escapeRegExp(ch)}$`).test("a"), `${JSON.stringify(ch)} must not act as a metacharacter`);
  }
  for (const name of ["Dr. O'Neil (the elder)", "a+b", "[guard]", "C:\\path", "$5", "x|y", "^caret$", "who?"])
    assert.ok(new RegExp(`^${escapeRegExp(name)}$`).test(name), name);
  assert.ok(!new RegExp(`^${escapeRegExp("Dr. Lee")}$`).test("Drx Lee"), "an escaped '.' must not match any character");
});
test("exactNamePattern: whole-word, escaped, case-sensitive by default, and never matches with no terms", () => {
  assert.ok(exactNamePattern(["Maren"]).test("Maren nods."));
  assert.ok(!exactNamePattern(["Maren"]).test("Marena nods."), "whole word only");
  assert.ok(!exactNamePattern(["Maren"]).test("maren nods."), "case-sensitive by default");
  assert.ok(exactNamePattern(["Maren"], "i").test("maren nods."));
  assert.ok(exactNamePattern(["St. Caldus"]).test("At St. Caldus she prays."));
  assert.ok(!exactNamePattern(["St. Caldus"]).test("At Stx Caldus she prays."));
  assert.ok(!exactNamePattern([]).test("anything at all"));
  assert.ok(!exactNamePattern([]).test(""));
});

// ---------------------------------------------------------------------------------------------------------------- quotes
test("quotedSpans / blankQuotes: dialogue is separated from narrator prose; offsets are preserved", () => {
  const text = 'Brenna nods. "Take the boots," she says. “I won’t need them.” She leaves.';
  const spans = quotedSpans(text);
  assert.equal(spans.length, 2);
  assert.deepEqual(spans.map(([s, e]) => text.slice(s, e)), ['"Take the boots,"', "“I won’t need them.”"]);
  const blanked = blankQuotes(text);
  assert.equal(blanked.length, text.length, "blanking preserves length so offsets stay valid");
  assert.ok(!/boots|need/.test(blanked), "quoted dialogue never survives as narration");
  assert.match(blanked, /Brenna nods\./); assert.match(blanked, /She leaves\./);
});
test("quoted spans never cross a line break; an unbalanced quote is narration, not dialogue", () => {
  assert.deepEqual(quotedSpans('She says "go\nnow" quietly.'), []);
  assert.deepEqual(quotedSpans('He shrugs. "Unfinished'), []);
  assert.equal(blankQuotes('He shrugs. "Unfinished'), 'He shrugs. "Unfinished');
});
test("quote primitives are stateless (fresh RegExp per call) and the compatibility re-export is the same function", () => {
  const text = 'A "b" c "d".';
  assert.deepEqual(quotedSpans(text), quotedSpans(text));
  assert.equal(new RegExp(QUOTED_SPAN_SOURCE).global, false);
  assert.equal(legacyBlankQuotes, blankQuotes); assert.equal(legacySentencesOf, sentencesOf);
});

// ---------------------------------------------------------------------------------------------------------------- sentences
test("sentencesOf: dialogue punctuation does not split attribution", () => {
  assert.deepEqual(sentencesOf('She said, "Wait. Stop!" and left the room.'), ['She said, "Wait. Stop!" and left the room.']);
  assert.deepEqual(sentencesOf('"Go," he says. She goes.'), ['"Go," he says.', "She goes."]);
  assert.deepEqual(sentencesOf("“My name is Maren. I was taken.” She looks away."), ["“My name is Maren. I was taken.” She looks away."]);
});
test("sentencesOf: line breaks end sentences; trailing text without a full stop is kept", () => {
  assert.deepEqual(sentencesOf("First line\nSecond line"), ["First line", "Second line"]);
  assert.deepEqual(sentencesOf("Done. And then"), ["Done.", "And then"]);
  assert.deepEqual(sentencesOf(""), []);
});
test("sentencesOf: ellipsis handling is deliberate — '…' is not a boundary, a typed '...' before a space is", () => {
  assert.deepEqual(sentencesOf("I worked in… in the mines. Then I ran."), ["I worked in… in the mines.", "Then I ran."]);
  assert.deepEqual(sentencesOf("I worked in... in the mines."), ["I worked in...", "in the mines."]);
  assert.deepEqual(sentencesOf("Wait…"), ["Wait…"]);
});

// ---------------------------------------------------------------------------------------------------------------- numbers
test("numberWordValue: the bounded canonical table (0-19, tens, compounds below 100)", () => {
  NUMBER_WORDS.forEach((w, i) => assert.equal(numberWordValue(w), i, w));
  for (const [w, v] of Object.entries(TENS)) assert.equal(numberWordValue(w), v, w);
  assert.equal(numberWordValue("thirteen"), 13); assert.equal(numberWordValue("Fourteen"), 14);
  assert.equal(numberWordValue("thirty-two"), 32); assert.equal(numberWordValue("Ninety nine"), 99);
  for (const bad of ["twenty-zero", "twenty-ten", "hundred", "a dozen", "half a", "14", "", "twelvety", "forty-"]) {
    if (bad === "forty-") { assert.equal(numberWordValue(bad), 40); continue; } // trailing separator: the tens alone (legacy behaviour)
    assert.equal(numberWordValue(bad), undefined, bad);
  }
});
test("numberValue: digits are one to three only; words via the canonical table; promotion re-export is the same parser", () => {
  assert.equal(numberValue("19"), 19); assert.equal(numberValue("120"), 120); assert.equal(numberValue("1000"), undefined);
  assert.equal(numberValue("thirteen"), 13);
  assert.equal(captivesNumberValue, numberValue);
});
test("CARDINAL_WORD_ALTERNATION: one..nineteen and the tens, never zero; every alternative parses to a value", () => {
  const words = CARDINAL_WORD_ALTERNATION.split("|");
  assert.ok(words.includes("thirteen") && words.includes("fourteen") && words.includes("ninety"));
  assert.ok(!words.includes("zero"));
  for (const w of words) assert.ok(numberWordValue(w) !== undefined && numberWordValue(w)! > 0, w);
});
