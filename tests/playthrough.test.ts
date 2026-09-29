import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv, extractPairs, type SourcePair } from "../src/dev/playthrough-csv.js";
import type { CuratedLabel } from "../src/dev/playthrough-manifest.js";
import { setup, collect } from "./turn-fixtures.js";

test("CSV quoted newlines, commas, escaped quotes and provenance", () => {
  const source = 'Created At,From,Message\r\nx,Nicco,"Hello,\n""friend"""\r\nx,Caldrevan - Dark Fantasy Isekai,Welcome\r\n';
  const pairs = extractPairs(source); assert.equal(pairs[0]!.source_player_record, 2); assert.equal(pairs[0]!.source_assistant_record, 3); assert.equal(pairs[0]!.player_message, 'Hello,\n"friend"');
  assert.throws(() => parseCsv('a,"unterminated')); assert.throws(() => parseCsv('"closed"oops')); assert.equal(parseCsv('a,b\r\n').length, 1);
});
const corpus = JSON.parse(await readFile("tests/playthrough/curated.json", "utf8")) as { fixtures: (CuratedLabel & SourcePair)[] };
for (const fixture of corpus.fixtures) test(`historical replay record ${fixture.row}: ${fixture.category}`, async () => {
  const s = setup(fixture.assistant_response, fixture.expected.filter(c => c.kind !== "runtime_delta"), fixture.row === 115), before = s.campaign.revision;
  const events = await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: fixture.player_message }));
  const result = events.at(-1)!; assert.equal(result.type, "turn_completed");
  if (result.type === "turn_completed") {
    // Explicit fixture grounding resolves the recipient and garment names; labels remain unchanged.
    assert.deepEqual(result.result.authorized_commands, fixture.expected);
    assert.equal(s.campaign.revision, before + (fixture.expected.length ? 1 : 0));
    if (fixture.row === 115) assert.equal(result.result.authorization.filter(d => d.authorized).length, 3);
  }
});
