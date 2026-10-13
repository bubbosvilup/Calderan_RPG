import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/**
 * Lifecycle vocabulary (Repository Cleanup G). PROVISIONAL -> PERSISTENT is MATERIALIZATION; Campaign NPC -> NPC+ is PROMOTION. This guards the one
 * known misuse (the materialization primitive named as a promotion) without banning the word: NPC+ promotion, mannerism promotion and the
 * serialized origin fields (`origin_snapshot.promoted_revision`, `promoted_world_minute`) legitimately keep it. Historical material is exempt.
 */
const HISTORICAL = /^(?:docs\/evaluations\/|src\/dev\/historical\/|scripts\/historical\/|tests\/frozen\/|tests\/support\/historical\/|tests\/fixtures\/)/;
const SELF = "tests/architecture/lifecycle-vocabulary.architecture.test.ts";
const current = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "src", "tests", "scripts", "docs", "README.md"], { encoding: "utf8" }).split("\n")
  .filter(f => f && f !== SELF && !HISTORICAL.test(f) && /\.(?:ts|js|mjs|md)$/.test(f) && existsSync(f));

test("lifecycle vocabulary: the materialization primitive is not named as a promotion anywhere current", () => {
  assert.ok(current.length > 500);
  const OLD = /\b(?:buildPromotedCharacter|PromotionInput|promotedCharacterId|promotedLabel)\b|campaign\/promotion\.(?:js|ts)\b/;
  assert.deepEqual(current.filter(f => OLD.test(readFileSync(f, "utf8"))), []);
  assert.equal(existsSync("src/campaign/promotion.ts"), false);
});

test("lifecycle vocabulary: materialization creates a PERSISTENT Campaign Character and never NPC+ state", () => {
  const source = readFileSync("src/campaign/materialization.ts", "utf8");
  assert.match(source, /export function buildMaterializedCharacter\(/);
  assert.doesNotMatch(source, /from "\.\/(?:premium-characters|heartstone-rite|households)\.js"|premium_characters|households\b/,
    "NPC+ promotion is a separate transition (campaign/premium-characters.ts, the Heartstone rite); materialization never writes NPC+ or household state");
});
