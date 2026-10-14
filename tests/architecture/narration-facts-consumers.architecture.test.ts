import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sourceFiles } from "../support/source-paths.js";

/**
 * Consolidation block 11 - the final semantic architecture, asserted at source level:
 *
 *   Narrator candidate -> ONE NarrationFactSource per turn (movement, commerce, dialogue / speaker, identity, recipient, reference facts)
 *   -> domain policies -> CampaignState prepare/commit -> audit verifies against the SAME facts.
 *
 * FACTS DESCRIBE. POLICIES DECIDE. CAMPAIGNSTATE OWNS TRUTH. AUDIT VERIFIES AGAINST THE SAME FACTS.
 * Each test is one of the twelve architecture assertions of docs/evaluations/CONSOLIDATION_BLOCK11_FINAL_SEMANTIC_ARCHITECTURE.md §11.
 */
/** POSIX paths on every platform (tests/support/source-paths.ts), so the path filters and expected lists below match on Windows too. */
const walk = (dir: string) => sourceFiles(dir);
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
const imports = (p: string) => [...readFileSync(p, "utf8").matchAll(/^import[^;]*?from "([^"]+)"/gm)].map(m => m[1]!);
const FACTS = walk("src/turn/narration-facts");
/** Runtime sources outside the fact layer. src/dev holds offline tools and live probes, not runtime readers. */
const RUNTIME = walk("src").filter(p => !p.includes("narration-facts/") && !p.startsWith("src/dev"));
const usesFacts = (p: string) => imports(p).some(s => /narration-facts\/index\.js$/.test(s));

test("1. one NarrationFactSource per turn: the coordinator creates exactly one and hands it to authorization, audit and commit preparation", () => {
  const coordinator = code("src/turn/coordinator/turn-coordinator.ts");
  assert.equal((coordinator.match(/createFactSource\(/g) ?? []).length, 1);
  assert.match(coordinator, /authorizeTurn\(\{[^\n]*facts: factSource/);
  assert.match(coordinator, /createNarrationAuditor\(\{ facts: factSource/);
  assert.match(coordinator, /delivered: delivery\.text, scene, base_revision, facts: factSource/);
  // The source memoizes per text and serves the scene reading too: one dialogue / identity reading for every consumer of the turn.
  const source = code("src/turn/narration-facts/source.ts");
  assert.match(source, /scene: \(recent, context, world, options/); assert.match(source, /scenes\.get\(key\)/);
});

test("2. movement consumers read the shared movement facts", () => {
  for (const p of ["src/turn/stages/authorization.ts", "src/turn/audit/narration-audit.ts"]) { assert.ok(usesFacts(p), p); assert.match(code(p), /characterMovementsFromFacts\(facts,/, p); }
  assert.equal(existsSync("src/turn/scene-departure.ts"), false);
});

test("3. commerce consumers read the shared commerce facts (Actual Offer construction, trade authorization, settlement audit)", () => {
  for (const p of ["src/turn/commerce/person-offers.ts", "src/turn/audit/narration-audit.ts", "src/turn/commerce/commerce-evidence.ts"]) assert.match(readFileSync(p, "utf8"), /narration-facts\/index\.js/, p);
  assert.match(code("src/turn/commerce/person-offers.ts"), /sellerQuotes\(|sellerPrices\(|actionableQuote\(/);
  assert.match(code("src/turn/audit/narration-audit.ts"), /settlementClaims\(/);
});

test("4. identity / name consumers read the shared identity facts and scene reading", () => {
  for (const p of ["src/turn/identity/name-establishment.ts", "src/turn/commerce/person-offers.ts", "src/turn/identity/partner-identity-guard.ts", "src/turn/identity/canonical-name-disclosure.ts", "src/turn/identity/provisional-people.ts"]) assert.ok(usesFacts(p), p);
  assert.match(code("src/turn/identity/name-establishment.ts"), /options\.facts \? options\.facts\.scene\(/);
  assert.match(code("src/turn/commerce/person-offers.ts"), /source\.scene\(/);
  const guard = code("src/turn/identity/partner-identity-guard.ts");
  assert.match(guard, /source\.scene\(/); assert.match(guard, /kind === "self_introduction"/); assert.match(guard, /introduces_new/);
  assert.match(code("src/turn/identity/canonical-name-disclosure.ts"), /identityForms\(/);
  // No consumer keeps its own self-introduction grammar.
  const SELF_GRAMMAR = /I'm\|I’m\|I am\|My name|My name is\|/;
  assert.deepEqual(RUNTIME.filter(p => !p.endsWith("identity-request.ts") && SELF_GRAMMAR.test(code(p))), []);
});

/**
 * Speech verb lists outside the fact layer: each remaining one is classified (Block 11 sweep). None of them attributes a narrated line to a speaker.
 * B = reads the PLAYER's input; D = domain-specific content, not attribution; F = deferred with justification (Controller evidence verification).
 */
const SPEECH_LIST = /says\??\||\|says\b|\(\?:says/;
const CLASSIFIED: Readonly<Record<string, string>> = {
  "src/turn/authorization/evidence-authorization.ts": "F: verifies the Controller's cited knowledge-communication evidence ('X tells Nicco that ...'); not narration attribution",
  "src/turn/authorization/turn-evidence.ts": "F: verifies Controller transfer / knowledge evidence quotes; not narration attribution",
  "src/turn/audit/grounding-audit.ts": "D: 'the law says' inside a legal-procedure claim",
  "src/turn/audit/narration-audit.ts": "B + D: the player's own speech act in their input; 'everyone says' as a rumor source inside a quote",
  "src/turn/optional/mannerism-portrayal-gate.ts": "D: optional Mannerism diagnostic for a named observer's habit remark; never authority",
};
test("5. speaker attribution exists only in the fact layer (every other speech-verb list is classified and attributes nobody)", () => {
  const found = RUNTIME.filter(p => SPEECH_LIST.test(code(p))).sort();
  assert.deepEqual(found, Object.keys(CLASSIFIED).sort());
  assert.match(code("src/turn/narration-facts/dialogue-vocabulary.ts"), /export const SPEECH = "says\|said/);
  for (const name of ["dialogueUnits", "speechTagAfter", "speechTagBefore", "POST_HOC_TAG"]) assert.deepEqual(RUNTIME.filter(p => new RegExp(`(?:function|const)\\s+${name}\\b`).test(code(p))), [], name);
});

test("6. recipient attribution exists only in the fact layer; commerce consumes it as a fact", () => {
  assert.match(code("src/turn/narration-facts/identity-forms.ts"), /kind: "recipient_attribution"/);
  assert.deepEqual(RUNTIME.filter(p => /recipient_attribution/.test(code(p))), ["src/turn/commerce/commerce-evidence.ts"]);
  assert.deepEqual(RUNTIME.filter(p => /\b(?:SAYS_TO|ADDRESSED|VOCATIVE_HEAD|VOCATIVE_TAIL)\b/.test(code(p))), []);
});

test("7. targeted audit consumers read the shared facts of the same source (no private dialogue projection)", () => {
  const audit = code("src/turn/audit/narration-audit.ts");
  assert.match(audit, /const source = input\.facts \?\? createFactSource\(/); assert.match(audit, /const facts = source\.of\(narration\)/);
  assert.match(audit, /attributedSpeech\(narration, context, \{ units: facts\.dialogue/);
  assert.match(audit, /source\.scene\(/); assert.match(audit, /partnerNameConflict\(\{[^}]*facts: source/);
  assert.ok(!imports("src/turn/audit/narration-audit.ts").some(s => /prompt-builder/.test(s)), "the audit does not read the prompt projection");
  for (const p of ["src/turn/authorization/household-evidence.ts", "src/turn/context/prompt-builder.ts"]) assert.match(code(p), /attributedSpeech\(/, p);
});

test("8. no banned legacy names: the duplicate readers are deleted and nothing refers to them", () => {
  for (const p of ["src/turn/narrated-captives.ts", "src/turn/scene-participation.ts", "src/turn/scene-departure.ts"]) assert.equal(existsSync(p), false, p);
  const banned = /\b(?:narrationUnits|dialogueFocusedOld|dialogueFocusedNext|SHADOW_DIALOGUE|__du|__pp|__append)\b|narrated-captives\.js|scene-participation\.js/;
  assert.deepEqual(walk("src").filter(p => banned.test(code(p))), []);
  assert.deepEqual(walk("tests").filter(p => /narrated-captives\.js|scene-participation\.js/.test(code(p))), []);
});

test("9. commerce has no seller-attribution parser of its own: the speaker of a price is the shared dialogue unit's", () => {
  const forms = code("src/turn/narration-facts/commerce-forms.ts");
  assert.ok(!/\bconst SAY\b/.test(forms)); assert.ok(!SPEECH_LIST.test(forms));
  assert.match(forms, /function speakerOf\(text: string, units: readonly DialogueUnit\[\]/);
  assert.match(forms, /method !== "recent_subject"|method === "recent_subject"/);
  assert.ok(!SPEECH_LIST.test(code("src/turn/commerce/commerce-evidence.ts")));
});

test("10. narration-facts imports no CampaignState mutation, authorization, audit or persistence code", () => {
  for (const p of FACTS) for (const spec of imports(p))
    assert.doesNotMatch(spec, /campaign|authorization|narration-audit|turn-coordinator|stages\/|character-movement|movement-evidence|follow-candidates|persistence|repository|session/, `${p} imports ${spec}`);
});

test("11. facts do not consume policy: no fact module imports a consumer", () => {
  const POLICY = /commerce-evidence|attributed-speech|name-establishment|person-offers|partner-identity-guard|canonical-name-disclosure|provisional-people|household-evidence|identity-request|prompt-builder|trade-(?!price)/;
  for (const p of FACTS) for (const spec of imports(p)) assert.doesNotMatch(spec, POLICY, `${p} imports ${spec}`);
  // trade-price.ts is the one low-level numeric price helper (Block 10), not a policy.
  // The player's name question is injected through the scope (asks_name), never read by the fact layer itself.
  assert.match(code("src/turn/narration-facts/extract.ts"), /readonly asks_name\?: \(player: string\) => boolean/);
});

test("12. player-input readers stay separate from narration readers", () => {
  assert.ok(!imports("src/turn/identity/identity-request.ts").some(s => /narration-facts/.test(s)), "identity-request reads the player's input only");
  assert.match(code("src/turn/identity/identity-request.ts"), /export function asksName\(player: string\)/);
  // The only player-input entry of the fact layer is the commerce input reader, whose every figure is a player counter.
  assert.match(code("src/turn/narration-facts/extract.ts"), /export function extractInputCommerceFacts\(/);
  assert.match(code("src/turn/narration-facts/commerce-forms.ts"), /voice: "player_input"|"player_input"/);
});
