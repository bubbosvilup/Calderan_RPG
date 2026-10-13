import test from "node:test";
import assert from "node:assert/strict";
import { travelCompanions } from "../../src/dev/historical/historical-anchors.js";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadWorld } from "../../src/world/loader.js";
import { anchoredIds, anchorsSha256, groundedNarrator, renderAnchorBlock, travelReferents, validateAnchors, verifyAnchorEvidence, type AnchorFile } from "../../src/dev/historical/historical-anchors.js";
import type { NarratorProvider } from "../../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../../src/llm/types.js";
import { metadata } from "../support/turn-fixtures.js";

/** Historical turn anchors are replay-only scenario constraints: premise, never outcome, never state. Deterministic, no model calls. */
const PATH = "tests/fixtures/historical-replay/HISTORICAL_TURN_ANCHORS.json";
const text = await readFile(PATH, "utf8");
const file = JSON.parse(text) as AnchorFile;
const world = await loadWorld("data");

test("anchors: the frozen artifact is valid and unchanged since it was frozen", async () => {
  assert.deepEqual(validateAnchors(file), []);
  const frozen = (await readFile("tests/fixtures/historical-replay/HISTORICAL_TURN_ANCHORS.sha256", "utf8")).trim().split(/\s+/)[0];
  assert.equal(anchorsSha256(text), frozen, "anchors are frozen; changing them requires a new frozen hash and a logged reason");
});
test("anchors: they carry no state and no outcome (schema rejects funds, household, NPC+, commands, completed transactions)", () => {
  const base = file.anchors[0]!;
  const bad = (patch: Record<string, unknown>) => validateAnchors({ version: 1, note: "", anchors: [{ ...base, ...patch } as never] });
  assert.ok(bad({ funds: 405 }).some(p => /funds/.test(p)), "unknown field");
  assert.ok(bad({ commands: [] }).length > 0);
  assert.ok(bad({ before: "Nicco's funds drop to 495." }).length > 0);
  assert.ok(bad({ before: "Brenna is a household member." }).length > 0);
  assert.ok(bad({ before: "Apply transfer_person now." }).length > 0);
  assert.ok(bad({ transaction: { counterparty_role: "x", subject_label: "y", status: "completed" } }).some(p => /outcome/.test(p)));
  assert.deepEqual(bad({}), []);
  assert.ok(file.anchors.filter(a => a.transaction).every(a => a.transaction!.status === "offered_not_completed"));
});
test("anchors: counterparts are described by role, so no unintroduced canonical person is named to the Narrator", () => {
  const names = world.getEntitiesByType("character").filter(e => e.id !== "nicco").flatMap(e => [e.name, e.display_name, ...e.aliases]).filter((n): n is string => !!n && n.length > 2 && !/^nicco$/i.test(n));
  for (const a of file.anchors) for (const field of [a.before, a.establish_in_previous_reply ?? ""]) for (const name of names) assert.equal(new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "iu").test(field), false, `${a.id} names ${name}`);
});
test("anchors: the Narrator block states the premise at the right turns and decides no outcome", () => {
  const quote = renderAnchorBlock(file, 6)!, pay = renderAnchorBlock(file, 7)!;
  assert.match(quote, /HISTORICAL SCENARIO ANCHOR/); assert.match(quote, /In this reply, establish naturally/); assert.match(quote, /five gold/);
  assert.match(pay, /Continuity/); assert.match(pay, /five gold/); assert.match(pay, /not yet completed/);
  for (const block of [quote, pay]) { assert.match(block, /do not decide any outcome/); assert.doesNotMatch(block.split("\n").slice(2).join("\n"), /\b(?:paid|sold|is now yours)\b/i); }
  assert.equal(renderAnchorBlock(file, 8), undefined, "turns with no anchor get no block");
  assert.deepEqual(anchoredIds(file, 6), ["A006_brenna_quote"]); assert.deepEqual(anchoredIds(file, 7), ["A006_brenna_quote"]);
  assert.equal(travelReferents(file)["9"], "heartstone_lr");
});
test("anchors: the narrator wrapper only appends the block to the last user message; no block leaves the request untouched", async () => {
  const seen: GenerationRequest[] = [];
  const inner: NarratorProvider = { async generate(r) { seen.push(r); return { text: "ok", ...metadata }; }, async *stream(r) { seen.push(r); yield { type: "completed", result: { text: "ok", ...metadata } }; } };
  let block: string | undefined;
  const wrapped = groundedNarrator(inner, () => block);
  const request: GenerationRequest = { system_prompt: "SYSTEM", messages: [{ role: "user", content: "CONTEXT" }, { role: "assistant", content: "earlier" }, { role: "user", content: "ACTION" }], max_output_tokens: 99 };
  await wrapped.generate(request);
  assert.equal(seen[0], request, "no block: the very same request object");
  block = "[HISTORICAL SCENARIO ANCHOR]\n- premise";
  await wrapped.generate(request);
  for await (const _ of wrapped.stream(request)) void _;
  for (const r of seen.slice(1)) {
    assert.equal(r.system_prompt, "SYSTEM"); assert.equal(r.max_output_tokens, 99);
    assert.deepEqual(r.messages.map(m => m.content), ["CONTEXT", "earlier", `ACTION\n\n${block}`]);
  }
  assert.equal(request.messages[2]!.content, "ACTION", "the original request is not mutated");
});
test("anchors: evidence excerpts are checked against the historical transcript; a missing excerpt is reported", () => {
  const replies: Record<number, string> = Object.fromEntries(file.anchors.map(a => [a.evidence.assistant_turn, `*prose* ${a.evidence.excerpt.toUpperCase()} more`]));
  assert.deepEqual(verifyAnchorEvidence(file, replies), []);
  assert.equal(verifyAnchorEvidence(file, { ...replies, 6: "nothing relevant" }).length, 1);
});
test("anchors: nothing in the engine or production play reads anchors, turn numbers or the replay harness", async () => {
  const offenders: string[] = [];
  const walk = async (dir: string): Promise<void> => { for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) { if (!/^dev$/.test(e.name)) await walk(p); } else if (/\.(ts|js)$/.test(e.name) && /historical-anchors|historical-replay|HISTORICAL_TURN_ANCHORS/.test(await readFile(p, "utf8"))) offenders.push(p); } };
  await walk("src");
  assert.deepEqual(offenders, [], "only src/dev may reference the replay harness or anchors");
});

test("anchors: travel anchors may list plain first names of companions, nothing else", () => {
  const withCompanions = file.anchors.filter(a => a.travel?.companions?.length);
  assert.ok(withCompanions.length >= 2);
  assert.deepEqual(travelCompanions(file)["261"], ["Brenna", "Maren"]);
  const base = file.anchors.find(a => a.travel)!;
  assert.ok(validateAnchors({ version: 1, note: "", anchors: [{ ...base, travel: { ...base.travel!, companions: ["Brenna's gold"] } }] }).some(p => /plain first names/.test(p)));
});
