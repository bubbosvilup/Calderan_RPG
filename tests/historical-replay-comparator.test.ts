import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignSnapshot } from "../src/campaign/types.js";
import { COVERED_BY, IMPLEMENTED_MUST_MATCH_IDS, SUBSYSTEM, compare, sealedShingles, words, SHINGLE } from "../src/dev/historical-replay-compare.js";
import { turnState } from "../src/dev/historical-replay.js";

/** The comparator must cover every MUST_MATCH fact of the frozen oracle; drift fails here. Deterministic, no model calls. */
const world = await loadWorld("data");
const ORACLE = await readFile("docs/evaluations/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md", "utf8");
const declared = (() => {
  const m = /## Checkpoints for the comparator \(MUST_MATCH count: (\d+)\)\s+([A-Z0-9, -]+)\./.exec(ORACLE)!;
  return { count: Number(m[1]), ids: m[2]!.split(",").map(s => s.trim()).filter(Boolean) };
})();
const tableMustMatch = [...ORACLE.matchAll(/^\| ([A-Z]-\d+) \|[^\n]*?\| MUST_MATCH(?: \(range\)| \(safety\))? \|/gm)].map(m => m[1]!);

test("comparator coverage: EXPECTED_MUST_MATCH_COUNT equals IMPLEMENTED_MUST_MATCH_COUNT and no checkpoint is silently omitted", () => {
  const implemented = IMPLEMENTED_MUST_MATCH_IDS();
  assert.equal(declared.count, declared.ids.length, "the oracle's own count matches its own list");
  assert.equal(declared.count, implemented.length, "EXPECTED_MUST_MATCH_COUNT == IMPLEMENTED_MUST_MATCH_COUNT");
  assert.deepEqual([...implemented].sort(), [...declared.ids].sort());
  assert.equal(new Set(implemented).size, implemented.length, "no duplicate registration");
  for (const id of implemented) assert.ok(SUBSYSTEM[id], `${id} is attributed to a subsystem`);
});
test("comparator coverage: every MUST_MATCH row of the oracle table is implemented or explicitly covered by another checkpoint", () => {
  const implemented = new Set(IMPLEMENTED_MUST_MATCH_IDS());
  assert.ok(tableMustMatch.length >= declared.count);
  for (const id of tableMustMatch) assert.ok(implemented.has(id) || (COVERED_BY[id] !== undefined && implemented.has(COVERED_BY[id]!)), `${id} is neither implemented nor covered`);
  for (const [folded, by] of Object.entries(COVERED_BY)) { assert.ok(tableMustMatch.includes(folded), folded); assert.ok(implemented.has(by), by); }
});

const base = (): CampaignSnapshot => JSON.parse(JSON.stringify(createOpeningCampaign(world, "comparator_fixture").exportSnapshot())) as CampaignSnapshot;
const character = (id: string, name: string, location: string) => ({ id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 20 } }, current: { current_location: location, status: "active" }, history: [] }) as unknown as CampaignSnapshot["characters"][number];
function replayOf(snap: CampaignSnapshot, narration?: string) {
  return compare({ turns: [{ turn: 421, ok: true, location: snap.runtime.scene.player_location, state: turnState(snap) as never }], snap, canonNames: new Set(["korvin"]),
    ...(narration !== undefined ? { narration: [{ turn: 1, text: narration }], sealed: new Set<string>() } : {}) });
}
const verdict = (r: ReturnType<typeof compare>, id: string) => r.results.find(x => x.id === id)!;

test("comparator: PASS, MISMATCH and BLOCKED are reported, and a missing prerequisite is never a silent PASS", () => {
  const snap = base();
  const empty = replayOf(snap, "A quiet morning.");
  assert.equal(verdict(empty, "A-01").verdict, "PASS");
  assert.equal(verdict(empty, "B-01").verdict, "MISMATCH", "no Brenna was created");
  assert.equal(verdict(empty, "B-02").verdict, "BLOCKED_BY_EARLIER_DIVERGENCE", "a sale check depends on the character check");
  assert.equal(verdict(empty, "B-02").blocked_by, "B-01");
  assert.notEqual(verdict(empty, "C-10").verdict, "PASS", "no Maren: the safety check is not evaluable, never a vacuous PASS");
  const noNarration = replayOf(snap);
  assert.notEqual(verdict(noNarration, "M-06").verdict, "PASS", "no narration log: the spoiler check cannot pass");
  assert.equal(empty.summary.must_match_total, 32);
});
test("comparator: the money band 405..411 and the 500-gold ceiling are applied exactly", () => {
  const at = (gold: number) => { const s = base(); s.funds.find(f => f.character_id === "nicco")!.gold = gold; return replayOf(s, "ok"); };
  for (const [gold, ok] of [[404, false], [405, true], [408, true], [411, true], [412, false]] as const) { assert.equal(verdict(at(gold), "A-02").verdict === "PASS", ok, `A-02 ${gold}`); assert.equal(verdict(at(gold), "H-10").verdict === "PASS", ok, `H-10 ${gold}`); }
  assert.equal(verdict(at(-1), "H-11").verdict, "MISMATCH");
  assert.equal(verdict(at(501), "H-11").verdict, "MISMATCH", "gold from nothing");
  assert.equal(verdict(at(408), "H-11").verdict, "PASS");
});
test("comparator: an unexpected created character is an alias signature for identity masking, expected ones are not", () => {
  const snap = base();
  snap.characters.push(character("c_brenna", "Brenna", "calderan_slave_market"), character("c_maren", "Maren", "calderan_slave_market"));
  const ok = replayOf(snap, "ok");
  assert.equal(verdict(ok, "M-01").verdict, "PASS"); assert.equal(verdict(ok, "M-07").verdict, "PASS");
  snap.characters.push(character("c_marten", "Marten", "calderan_slave_market"));
  const bad = replayOf(snap, "ok");
  assert.equal(verdict(bad, "M-01").verdict, "MISMATCH"); assert.equal(verdict(bad, "M-07").verdict, "MISMATCH");
  assert.match(verdict(bad, "M-07").actual, /Marten/);
});
test("comparator: Maren safety, household compulsion and sealed-canon shingles are detected", () => {
  const snap = base();
  snap.characters.push(character("c_maren", "Maren", "heartstone_lr"));
  assert.equal(verdict(replayOf(snap, "ok"), "C-10").verdict, "PASS");
  snap.relationships.push({ from_character_id: "c_maren", to_character_id: "nicco", dimensions: { romance: "low" } });
  assert.equal(verdict(replayOf(snap, "ok"), "C-10").verdict, "MISMATCH");
  const clean = base(); clean.households[0]!.rules!.push({ id: "r_x", text: "Everyone is magically bound to confess.", created_revision: 1, active: true });
  assert.equal(verdict(replayOf(clean, "ok"), "M-05").verdict, "MISMATCH");
  const sealed = sealedShingles(world);
  assert.ok(sealed.size > 0, "sealed canon exists in the authored data");
  const sample = [...sealed][0]!; // a real sealed 7-word run, used only in memory
  assert.equal(sample.split(" ").length, SHINGLE);
  const leak = compare({ turns: [{ turn: 5, ok: true, location: "x", state: turnState(base()) as never }], snap: base(), canonNames: new Set(), narration: [{ turn: 5, text: `He said: ${sample}.` }], sealed });
  assert.equal(leak.results.find(r => r.id === "M-06")!.verdict, "MISMATCH");
  assert.equal(leak.results.find(r => r.id === "M-06")!.first_divergence, 5);
  assert.equal(words("Hello, WORLD!").join(" "), "hello world");
});
