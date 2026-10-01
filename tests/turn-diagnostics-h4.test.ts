import test from "node:test";
import assert from "node:assert/strict";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import { setup, collect, mockNarrator, mockController, transfer } from "./turn-fixtures.js";
import { ProviderError } from "../src/llm/errors.js";
import { createSaveFile } from "../src/persistence/save-format.js";

test("opt-in diagnostics preserve events, state and both provider prompts; emission is immutable and contains no prose", async () => {
  const plain = setup(), enabled = setup();
  const records: DeepReadonly<TurnDiagnostics>[] = [], prompts: unknown[] = [], controls: unknown[] = [];
  const controller = mockController([]);
  const coordinator = new TurnCoordinator(enabled.world, mockNarrator("Brenna smiles.", p => prompts.push(p)), { propose: async p => { controls.push(p); return controller.propose(p); } }, enabled.retrieval,
    { diagnostics_sink: r => records.push(r) });
  const disabledPrompts: unknown[] = [], disabledControls: unknown[] = [];
  const disabled = new TurnCoordinator(plain.world, mockNarrator("Brenna smiles.", p => disabledPrompts.push(p)), { propose: async p => { disabledControls.push(p); return controller.propose(p); } }, plain.retrieval);
  const input = "I smile. PRIVATE_USER_SECRET";
  const a = await collect(disabled.runTurn({ campaign: plain.campaign, player_input: input }));
  const b = await collect(coordinator.runTurn({ campaign: enabled.campaign, player_input: input }));
  const clean = (v: unknown) => JSON.parse(JSON.stringify(v, (key, value) => ["coordinator_total_ms", "controller_tail_ms", "elapsed_ms", "retrieval_ms", "signal"].includes(key) ? undefined : value));
  assert.deepEqual(clean(a), clean(b)); assert.deepEqual(plain.campaign.exportSnapshot(), enabled.campaign.exportSnapshot());
  assert.deepEqual(clean(prompts), clean(disabledPrompts)); assert.deepEqual(clean(controls), clean(disabledControls));
  assert.equal(records.length, 1); const r = records[0]!;
  assert.equal(r.outcome, "success"); assert.equal(r.commit.succeeded, true); assert.equal(r.final_revision, enabled.campaign.revision);
  for (const phase of ["input_intent", "projection", "retrieval", "prompt_composition", "narrator", "controller", "authorization", "preparation", "audit", "commit_preparation", "commit", "publication"] as const) {
    assert.ok(r.stage_timings[phase]); assert.ok(r.stage_timings[phase]!.deterministic_ms >= 0); assert.ok(r.stage_timings[phase]!.provider_ms >= 0);
  }
  assert.equal(r.retrieval?.triggered, false); assert.ok(r.context?.people_shown); assert.equal(r.controller?.parse_success, true);
  const json = JSON.stringify(r);
  for (const secret of ["PRIVATE_USER_SECRET", "Brenna smiles.", "Fixture passage", "system_prompt", "prior_state"]) assert.equal(json.includes(secret), false);
  assert.equal(JSON.stringify(createSaveFile(enabled.campaign.exportSnapshot(), enabled.world, "2026-10-01T00:00:00.000Z")).includes("stage_timings"), false);
  assert.throws(() => Object.assign(r.commit, { succeeded: false }), TypeError);
});

test("throwing diagnostics and legacy debug sinks cannot fail a successful reconciled turn", async () => {
  const f = setup("Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.", [transfer]);
  let calls = 0;
  const co = new TurnCoordinator(f.world, mockNarrator("Brenna accepts boots from Nicco. Gerome takes the ring from Nicco."), mockController([transfer]), f.retrieval,
    { diagnostics_sink: () => { calls++; throw new Error("sink failure"); }, debug_sink: () => { throw new Error("debug failure"); } });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: "I give boots to Brenna." }));
  assert.ok(events.some(e => e.type === "turn_completed")); assert.equal(events.some(e => e.type === "turn_failed"), false); assert.equal(calls, 1);
});

test("diagnostics distinguish reconciliation, audit and authorization without copying evidence", async () => {
  const f = setup(), records: DeepReadonly<TurnDiagnostics>[] = [];
  const co = new TurnCoordinator(f.world, mockNarrator("Brenna accepts boots from Nicco. Gerome takes the ring from Nicco."), mockController([transfer]), f.retrieval, { diagnostics_sink: r => records.push(r) });
  await collect(co.runTurn({ campaign: f.campaign, player_input: "I give boots to Brenna." }));
  const r = records[0]!; assert.equal(r.authorization?.authorized_count, 1); assert.equal(r.authorization?.decisions[0]?.kind, "transfer_item");
  assert.equal(r.audit?.reconciliation_attempted, true); assert.equal(r.audit?.redaction_used, true); assert.ok(r.stage_timings.reconciliation_audit);
  assert.equal(JSON.stringify(r).includes("Gerome takes"), false);
});

for (const failure of ["input", "retrieval", "narrator", "controller"] as const) test(`failure diagnostics: ${failure}`, async () => {
  const f = setup(), before = f.campaign.exportSnapshot(), records: DeepReadonly<TurnDiagnostics>[] = [];
  const narrator = failure === "narrator" ? { ...mockNarrator("unused"), async *stream(): AsyncGenerator<never> { throw new ProviderError("timeout"); } } : mockNarrator("Brenna smiles.");
  const controller = failure === "controller" ? { async propose(): Promise<never> { throw new ProviderError("structured_output_invalid"); } } : mockController([]);
  const retrieval = failure === "retrieval" ? { ...f.retrieval, search: { async searchWithDiagnostics(): Promise<never> { throw new Error("secret search"); } } } : f.retrieval;
  const co = new TurnCoordinator(f.world, narrator, controller, retrieval, { diagnostics_sink: r => records.push(r) });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: failure === "input" ? "" : failure === "retrieval" ? "Tell me about lore" : "I smile." }));
  assert.equal(events.at(-1)?.type, "turn_failed"); assert.equal(f.campaign.exportSnapshot(), before); assert.equal(records.length, 1);
  const r = records[0]!; assert.equal(r.outcome, "failure"); assert.equal(r.commit.succeeded, false);
  assert.equal(r.failure_phase, failure === "input" ? "input_intent" : failure); assert.equal(JSON.stringify(r).includes("secret"), false);
});

test("diagnostic IDs are session-local unique values, even on failed turns", async () => {
  const f = setup(), revision = f.campaign.revision, ids: string[] = [];
  const co = new TurnCoordinator(f.world, mockNarrator("Brenna smiles."), mockController([]), f.retrieval, { diagnostics_sink: r => ids.push(r.turn_id) });
  await collect(co.runTurn({ campaign: f.campaign, player_input: "" })); await collect(co.runTurn({ campaign: f.campaign, player_input: "" }));
  assert.equal(new Set(ids).size, 2); assert.equal(f.campaign.revision, revision);
});

test("an async diagnostic sink rejection is consumed without changing gameplay", async () => {
  const f = setup();
  const co = new TurnCoordinator(f.world, mockNarrator("Brenna smiles."), mockController([]), f.retrieval,
    { diagnostics_sink: async () => { throw new Error("async sink failure"); } });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: "I smile." }));
  assert.ok(events.some(e => e.type === "turn_completed")); await new Promise(resolve => setImmediate(resolve));
});

test("closing an uncommitted generator emits an abandoned record and releases the lock", async () => {
  const f = setup(), before = f.campaign.exportSnapshot(), records: DeepReadonly<TurnDiagnostics>[] = [];
  const co = new TurnCoordinator(f.world, mockNarrator("Brenna smiles."), mockController([]), f.retrieval, { diagnostics_sink: r => records.push(r) });
  const generator = co.runTurn({ campaign: f.campaign, player_input: "I smile." }); await generator.next(); await generator.return(undefined);
  assert.equal(records[0]?.outcome, "abandoned"); assert.equal(f.campaign.exportSnapshot(), before);
  assert.ok((await collect(co.runTurn({ campaign: f.campaign, player_input: "I smile." }))).some(e => e.type === "turn_completed"));
});
