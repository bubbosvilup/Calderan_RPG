import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { createFactSource, extractInputCommerceFacts, extractNarrationFacts, type CommerceFact, type NarrationFactScope } from "../src/turn/narration-facts/index.js";
import { actionableQuote, sellerPrices, sellerQuotes, settlementClaims, unsupportedMoney, withdrawalIn } from "../src/turn/commerce/commerce-evidence.js";

/**
 * Consolidation block 10 - NarrationFacts / commerce. Facts are DESCRIPTIVE (what a text states about a price, a withdrawal, a payment, a transfer);
 * the engine's policy (commerce-evidence.ts) decides what is actionable. Nothing here settles anything.
 */
const f = turnFixture(), context = buildTurnContext(f.world, f.campaign.exportSnapshot());
const scope: NarrationFactScope = { movers: [], context };
const facts = (text: string) => extractNarrationFacts(text, scope);
const prices = (text: string) => sellerPrices(facts(text));
const quote = (text: string) => facts(text).commerce.filter((x): x is Extract<CommerceFact, { kind: "price_quote" }> => x.kind === "price_quote");

// ------------------------------------------------------------------------------------------------ price extraction (Phase 3)
test("seller ask, seller counter and player counter are told apart; only seller quotes are actionable", () => {
  assert.deepEqual(quote('Korvin says, "A hundred for her."').map(q => [q.amount, q.quote_role, q.voice]), [[100, "seller_ask", "speech"]]);
  assert.deepEqual(quote('"I\'ll go ninety-five," Korvin says.').map(q => [q.amount, q.quote_role]), [[95, "seller_counter"]]);
  assert.deepEqual(sellerPrices(facts('"Ninety-five. Final."')), [95]);
  // The player's own typed figure is a counter, always.
  const input = extractInputCommerceFacts("I'll give you ninety gold.");
  assert.deepEqual(input.filter(x => x.kind === "price_quote").map(x => x.kind === "price_quote" && [x.amount, x.quote_role, x.voice]), [[90, "player_counter", "player_input"]]);
  assert.deepEqual(sellerPrices({ narration: "", movement: [], commerce: input, dialogue: [], identity: [] }), []);
});

test("hypothetical, conditional, negated and questioned prices are described but never completed", () => {
  for (const text of ['"If you had a hundred and fifty, maybe."', '"I wouldn\'t take eighty."', '"Would a hundred gold suit you?"', '"How much? A hundred?"'])
    assert.deepEqual(sellerPrices(facts(text)), [], text);
  assert.ok(quote('"I wouldn\'t take eighty."').every(q => q.modality !== "completed"));
});

test('"not a coin less" is an emphatic floor, not a negation of the price', () => {
  assert.deepEqual(prices('Korvin grimaces. "Eighteen gold, and not a coin less, for the halberd."'), [18]);
});

test("a payment already made is a payment claim, never a price quote; a past cost is not a current quote", () => {
  const text = "*Korvin pays Nicco ninety-five gold.*";
  assert.deepEqual(prices(text), []);
  assert.deepEqual(prices('"Five. She\'s a burden I paid four for."'), [5]);
  assert.ok(quote('"She\'s a burden I paid four for."').every(q => q.quote_kind === "past_cost"));
});

test("age, tenure and quantity beside an ask are not prices; several different prices in one statement are ambiguous", () => {
  assert.deepEqual(prices('"She\'s twenty, worked five years, asking a hundred."'), [100]);
  const group = sellerQuotes(facts('"The young one is two hundred gold, the broad one a hundred gold."'));
  assert.equal(actionableQuote(group).kind, "ambiguous");
  assert.equal(actionableQuote(sellerQuotes(facts('"A hundred. Ninety-five. Final."'))).kind, "quote");
});

test("unsupported money (silver, fractions) is described as such and yields no price", () => {
  assert.equal(unsupportedMoney(facts('"Ten silver for her."')), "currency");
  assert.equal(unsupportedMoney(facts('"Two and a half gold."')), "fraction");
  assert.deepEqual(prices('"Ten silver for her."'), []);
});

test("withdrawal: 'not for sale' / 'changed his mind' is a completed offer_withdrawn fact; a denial of the withdrawal is not", () => {
  assert.equal(withdrawalIn(facts('Korvin changes his mind. "The halberd is not for sale."'), "The halberd is not for sale."), true);
  assert.equal(withdrawalIn(facts('"The halberd is for sale."'), "The halberd is for sale."), false);
});

// ------------------------------------------------------------------------------------------------ claims (settlement is never narrated)
const claims = (text: string, standing = true, words: string[] = []) => settlementClaims(facts(text), { standing, words }).map(c => c.fact.kind + "/" + c.fact.form);
test("the real premature-settlement narration yields payment, document, ownership and finished-deal claims", () => {
  const kinds = facts("Korvin takes the coins and folds the paper.\n\n\"That's your bill of sale. She's yours. The sale's done either way.\"").commerce.map(x => `${x.kind}/${x.form}`);
  for (const want of ["payment_claim/pay_verb", "transfer_claim/document", "transfer_claim/yours", "settlement_claim/deal_done"]) assert.ok(kinds.includes(want), `${want} in ${kinds.join()}`);
  assert.equal(claims("Korvin takes the coins and folds the paper. \"She's yours.\"").length > 0, true);
});

test("ownership promised on a condition, a denied claim and a negotiation line are not claims", () => {
  assert.deepEqual(claims('"You walk her out that gate, she\'s yours."'), []);
  assert.deepEqual(claims('"She is not yours yet."'), []);
  assert.deepEqual(claims('"I\'ll take ninety gold," Nicco says.'), []);
});

// ------------------------------------------------------------------------------------------------ single source (source-level)
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
const SRC = walk("src");
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
test("source audit: the legacy commerce grammar is gone; trade-price.ts is the one low-level numeric helper", () => {
  const banned = /\b(?:statedGold|pricesInText|goldAmounts|fractionalPrice|unsupportedCurrency|NOT_AN_OFFER|amountsIn|pricesOf)\b|const HYPOTHETICAL = \/\\\?/;
  assert.deepEqual(SRC.filter(p => banned.test(code(p))), []);
  const readers = SRC.filter(p => /readPrices\(/.test(code(p)) && !p.endsWith("trade-price.ts"));
  assert.deepEqual(readers.map(p => p.replace(/\\/g, "/")), ["src/turn/narration-facts/commerce-forms.ts"], "ONE commerce extractor reads prices");
});

test("source audit: Actual Offer construction, trade authorization and the settlement audit all read the shared commerce facts", () => {
  const auth = code("src/turn/commerce/trade-authorization.ts"), offers = code("src/turn/commerce/person-offers.ts"), audit = code("src/turn/narration-audit.ts"), commit = code("src/turn/stages/commit-preparation.ts"), coordinator = code("src/turn/turn-coordinator.ts");
  assert.match(auth, /commerce-evidence/); assert.match(offers, /commerce-evidence/); assert.match(audit, /settlementClaims/);
  assert.match(commit, /facts: i\.facts/); assert.match(coordinator, /facts: factSource/);
  assert.doesNotMatch(audit, /const (?:PAY|PAID|GOODS|DONE)\b/, "the audit owns no private payment parser");
});

test("source audit: commerce facts carry no policy and narration-facts imports no campaign, authorization or audit code", () => {
  for (const p of walk("src/turn/narration-facts")) {
    const imports = [...readFileSync(p, "utf8").matchAll(/^import[^;]*from "([^"]+)"/gm)].map(m => m[1]!);
    assert.deepEqual(imports.filter(i => /campaign|authoriz|audit|trade\.js|person-offers/.test(i)), [], p);
  }
  assert.doesNotMatch(readFileSync("src/turn/narration-facts/types.ts", "utf8"), /\b(?:authorized|accepted|should_\w+)\b\s*[:?]/);
});

test("the same memoized source serves every consumer of a turn", () => {
  const source = createFactSource(scope);
  assert.equal(source.of("A hundred for her."), source.of("A hundred for her."));
});
