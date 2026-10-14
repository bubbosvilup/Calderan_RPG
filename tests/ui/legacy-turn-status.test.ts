import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLegacyPendingStatus, isLegacyPhaseStatus, LEGACY_OTHER_STATUS, LEGACY_PENDING_STATUS, LEGACY_PHASE_STATUS } from "../support/legacy-turn-status.js";

/**
 * Pins the closed `#status` vocabulary the turn-reliability browser check accepts mid-turn to the legacy client's own source: a new or
 * renamed status word in src/ui/client.js fails here, so the check can neither silently reject a legitimate state again nor drift into
 * accepting arbitrary text.
 */
const client = readFileSync("src/ui/client.js", "utf8");

test("legacy turn status: the phase words are exactly the client's PHASE_LABELS table", () => {
  const table = /const PHASE_LABELS = \{([^}]*)\}/.exec(client)?.[1];
  assert.ok(table, "PHASE_LABELS exists");
  assert.deepEqual([...table.matchAll(/"([^"]+)"/g)].map(m => m[1]), [...LEGACY_PHASE_STATUS]);
});

test("legacy turn status: every literal the client writes to #status is classified (pending or not), and the pending set is closed", () => {
  const written = new Set<string>();
  for (const line of client.split("\n").filter(l => /\bstatus\.textContent\s*=/.test(l))) {
    const assigned = line.slice(line.search(/\bstatus\.textContent\s*=/));
    // String literals on the right-hand side, minus comparison operands such as `data.status === "closed"`.
    for (const m of assigned.matchAll(/([!=]==\s*)?"([^"]*)"/g)) if (!m[1]) written.add(m[2]!);
  }
  assert.ok(written.has("Generating…"), "the submit-time pending word is written by the client");
  const known = new Set<string>([...LEGACY_PENDING_STATUS, ...LEGACY_OTHER_STATUS]);
  assert.deepEqual([...written].filter(w => !known.has(w)), [], "a new #status word: classify it in tests/support/legacy-turn-status.ts");
  assert.deepEqual(LEGACY_OTHER_STATUS.filter(w => isLegacyPendingStatus(w)), [], "idle and terminal words are never accepted mid-turn");
});

test("legacy turn status: the mid-turn predicate accepts only the closed words", () => {
  for (const word of LEGACY_PENDING_STATUS) assert.equal(isLegacyPendingStatus(word), true, word);
  for (const text of ["", "Your turn.", "Generating", "generating…", "Generating… Brenna accepts boots from Nicco.", "Brenna accepts boots from Nicco.", "Loading…"]) assert.equal(isLegacyPendingStatus(text), false, text);
  assert.equal(isLegacyPhaseStatus("Generating…"), false, "the submit-time word alone does not prove progress events reached the page");
});
