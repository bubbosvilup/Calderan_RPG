import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { buildNarratorPrompt } from "../../src/turn/context/prompt-builder.js";
import { narratorIdentityGate } from "../../src/turn/identity/narrator-identity.js";

/**
 * CTX-1 (substring part, B1): the Narrator input projection replaces canonical NPC ids with opaque refs (NPC<n>). An id is matched only between
 * non-alphanumeric boundaries: it still masks inside an id-shaped handle ("fact_dren_debt"), never inside an ordinary word ("dren" in "children").
 */
const world = await loadWorld("data");
function at(location: string) {
  const c = createOpeningCampaign(world, `id_mask_${location}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: location } }] });
  return c;
}
const gateAt = (location: string) => { const context = buildTurnContext(world, at(location).exportSnapshot()); return { context, gate: narratorIdentityGate(context)! }; };

test('the id "dren" is masked as an id and inside id-shaped handles, never inside "children"', () => {
  const { gate } = gateAt("calderan_slave_market"), ref = gate.identities.get("dren")!.ref;
  assert.match(ref, /^NPC\d+$/);
  assert.equal(gate.mask("I ask the sister how many children live here."), "I ask the sister how many children live here.");
  assert.equal(gate.mask("dren"), ref);
  assert.equal(gate.mask("fact_dren_debt"), `fact_${ref}_debt`);
  assert.equal(gate.mask("dren-owned"), `${ref}-owned`);
});

test("no authored prose word in data/ that merely contains a canonical NPC id is altered by the id mask", () => {
  const { gate } = gateAt("calderan_slave_market"), ids = [...gate.identities.keys()];
  const files: string[] = [];
  const walk = (dir: string) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p); else if (/\.ya?ml$/.test(e)) files.push(p); } };
  walk("data");
  const words = new Set(files.flatMap(f => readFileSync(f, "utf8").match(/[\p{L}\p{N}]+/gu) ?? []));
  const containing = [...words].filter(w => ids.some(id => w !== id && w.includes(id)));
  assert.ok(containing.includes("children"), "the scan covers the known collision");
  const altered = containing.filter(w => /NPC\d/.test(gate.mask(w)));
  assert.deepEqual(altered, [], `words corrupted by the id mask: ${altered.join(", ")}`);
});

test("Narrator prompt at Saint Orra House keeps the word children in the location prose and the player action", () => {
  const { context } = gateAt("saint_orra_house");
  const prompt = buildNarratorPrompt("I ask the sister how many children live here.", context, [], {}, { candidates: [], runtime: [] });
  const text = prompt.messages.map(m => m.content).join("\n");
  assert.ok(text.includes("children"));
  assert.equal(/\p{L}NPC\d/u.test(text), false, "no opaque ref spliced inside a word");
});
