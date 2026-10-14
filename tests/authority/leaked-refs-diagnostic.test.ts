import test from "node:test";
import assert from "node:assert/strict";
import { leakedRefs } from "../../src/turn/audit/leaked-refs.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import type { TurnDiagnostics } from "../../src/turn/coordinator/turn-diagnostics.js";
import type { DeepReadonly } from "../../src/types/readonly.js";
import { setup, collect, mockNarrator, mockController } from "../support/turn-fixtures.js";

/** B1 part C: internal ref shapes in delivered prose are recorded in the turn trace, log only (never redacted, revised or failed). */
test("leaked ref shapes: opaque refs, scene keys, snake_case ids and known lowercase ids; ordinary prose is clean", () => {
  assert.deepEqual(leakedRefs("NPC12 nods. P3 waits by F1 while narrated:woman and other:guard watch mistress_elara.", ["korvin"]).map(r => `${r.kind}:${r.text}`),
    ["opaque_ref:NPC12", "opaque_ref:P3", "opaque_ref:F1", "scene_key:narrated:woman", "scene_key:other:guard", "raw_id:mistress_elara"]);
  assert.deepEqual(leakedRefs("Korvin counts the children. The P.S. is long; the NPCs stare; R2D2 is no ref.", ["korvin", "dren"]), []);
  assert.deepEqual(leakedRefs("korvin shrugs.", ["korvin"]).map(r => r.text), ["korvin"]);
});

test("a turn whose delivered prose carries an internal ref still completes unchanged; the trace records the shape", async () => {
  const run = async (prose: string) => {
    const f = setup(), records: DeepReadonly<TurnDiagnostics>[] = [];
    const co = new TurnCoordinator(f.world, mockNarrator(prose), mockController([]), f.retrieval, { diagnostics_sink: r => records.push(r) });
    const events = await collect(co.runTurn({ campaign: f.campaign, player_input: "I smile." }));
    return { events, record: records[0]! };
  };
  const leak = await run("Brenna smiles at NPC4.");
  assert.ok(leak.events.some(e => e.type === "turn_completed"));
  assert.equal(leak.events.some(e => e.type === "turn_failed"), false);
  assert.deepEqual(leak.record.audit?.leaked_refs, [{ kind: "opaque_ref", text: "NPC4" }]);
  const done = leak.events.find(e => e.type === "turn_completed");
  assert.ok(done?.type === "turn_completed" && done.result.narration.includes("NPC4"), "log only: the delivered prose is not redacted");
  const clean = await run("Brenna smiles.");
  assert.equal(clean.record.audit?.leaked_refs, undefined);
});
