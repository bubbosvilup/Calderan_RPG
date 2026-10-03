import assert from "node:assert/strict";
import { MANNERISM_SEEDS, reviewMannerismSeeds } from "../campaign/mannerism-seeds.js";
import { validateMannerismDefinition } from "../campaign/mannerisms.js";
const report = reviewMannerismSeeds();
for (const seed of MANNERISM_SEEDS) validateMannerismDefinition(seed);
assert.deepEqual(report.rejected_unsafe_seeds, []);
assert.deepEqual(report.duplicate_canonical_keys, []);
console.log(JSON.stringify(report, null, 2));
