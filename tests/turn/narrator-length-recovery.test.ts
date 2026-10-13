import test from "node:test";
import assert from "node:assert/strict";
import type { StateControllerProvider } from "../../src/llm/state-controller-provider.js";
import type { TurnDiagnostics } from "../../src/turn/coordinator/turn-diagnostics.js";
import type { TurnEvent } from "../../src/turn/turn-types.js";
import { TRUNCATION_RECOVERY_NOTICE } from "../../src/turn/stages/narration.js";
import { collect, metadata } from "../support/turn-fixtures.js";
import { NARRATION, coordinatorWith, countingController, stepNarrator, transfer, type NarratorStep } from "../support/turn-reliability-fixtures.js";

const GOOD = "Brenna accepts boots from Nicco.";
const BAD = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco."; // the second handover is not authorized: the audit objects
const PARTIAL = "Brenna accepts the bo";
const INPUT = "I give boots to Brenna.";
const length = (text = PARTIAL): NarratorStep => ({ text, finish: "length" });

/** A controller that records exactly which narration it was shown. */
function recordingController() {
  const seen: string[] = [];
  const controller: StateControllerProvider = { async propose(request) { seen.push(request.final_narration); return { commands: [transfer], ...metadata }; } };
  return { controller, seen };
}
async function run(steps: readonly NarrativeStep[], options: { retry?: false; commands?: boolean; gate?: (n: number) => void } = {}) {
  const records: TurnDiagnostics[] = [], rec = recordingController();
  let n = 0;
  const narrator = stepNarrator(steps, options.gate ? async () => { options.gate!(++n); } : undefined);
  const controller = options.commands === false ? countingController() : rec.controller;
  const calls = { controller: 0 };
  const counted: StateControllerProvider = { async propose(r) { calls.controller++; return controller.propose(r); } };
  const f = coordinatorWith(narrator, counted, { diagnostics: r => records.push(r as TurnDiagnostics), ...(options.retry === false ? { retry: false as const } : {}) });
  const base = f.campaign.revision;
  const events = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: INPUT, turn_key: "key_narr1", expected_revision: base }));
  const last = events.at(-1)!, trace = records.at(-1)!;
  return { f, narrator, events, last, trace, base, controllerCalls: () => calls.controller, shown: rec.seen, generation: trace.narrator_generation! };
}
type NarrativeStep = NarratorStep;
const failureCode = (e: TurnEvent) => e.type === "turn_failed" ? e.code : undefined;
const noProse = (events: readonly TurnEvent[], ...texts: string[]) => { const raw = JSON.stringify(events); for (const t of texts) assert.ok(!raw.includes(t), `"${t}" must not appear in any event`); };

test("NARR-1: a normal stop is 1 logical generation, 1 physical attempt, 1 Controller call, 1 commit, no recovery", async () => {
  const r = await run([{ text: GOOD }]);
  assert.equal(r.last.type, "turn_completed"); assert.equal(r.narrator.calls(), 1); assert.equal(r.controllerCalls(), 1); assert.equal(r.f.campaign.revision, r.base + 1);
  assert.deepEqual([r.generation.logical_generations, r.generation.physical_attempts], [1, 1]);
  assert.deepEqual(r.generation.truncation, { detected: false, recovery_attempted: false, recovery_result: "not_needed" });
  assert.equal(r.narrator.requests[0]!.max_output_tokens, undefined, "the primary request uses the configured production cap (768), not an override");
});

test("NARR-1: length -> exactly one regeneration; the partial is never delivered, audited, sent to the Controller or committed", async () => {
  const r = await run([length(), { text: GOOD }]);
  assert.equal(r.last.type, "turn_completed"); assert.equal(r.narrator.calls(), 2); assert.equal(r.controllerCalls(), 1); assert.equal(r.f.campaign.revision, r.base + 1);
  assert.deepEqual(r.shown, [GOOD], "the Controller saw only the complete narration");
  noProse(r.events, PARTIAL);
  assert.equal(r.f.coordinator.recent(r.f.campaign).finalized().at(-1)!.narration, GOOD, "history holds the complete narration only");
  assert.deepEqual(r.generation.attempts.map(a => [a.generation, a.finish_reason, a.outcome]), [["primary", "length", "length"], ["recovery", "stop", "stop"]]);
  assert.deepEqual(r.generation.truncation, { detected: true, recovery_attempted: true, recovery_result: "succeeded" });
  assert.deepEqual([r.generation.logical_generations, r.generation.physical_attempts], [2, 2]);
});

test("NARR-1: the recovery has the same base revision and context, a 1024 cap and a minimal instruction; it is not a continuation", async () => {
  const r = await run([length(), { text: GOOD }]);
  const [first, second] = r.narrator.requests as [typeof r.narrator.requests[number], typeof r.narrator.requests[number]];
  assert.equal(second.max_output_tokens, 1024); assert.notEqual(first.max_output_tokens, 1024);
  assert.deepEqual(second.messages, first.messages, "same context, nothing from the partial is appended");
  assert.equal(second.system_prompt, `${first.system_prompt}\n\n${TRUNCATION_RECOVERY_NOTICE}`);
  assert.ok(!second.system_prompt.includes(PARTIAL) && !second.messages.some(m => m.content.includes(PARTIAL)));
  assert.equal(r.events[0]!.type === "turn_started" && r.events[0]!.base_revision, r.base);
  assert.equal(r.f.campaign.revision, r.base + 1, "one commit on the original base");
});

test("NARR-1: two truncated answers end the turn as narrator_truncated: 0 Controller calls, 0 commits, nothing delivered", async () => {
  const r = await run([length(), length("Another half senten")]);
  assert.equal(failureCode(r.last), "narrator_truncated"); assert.equal(r.controllerCalls(), 0); assert.equal(r.f.campaign.revision, r.base);
  assert.equal(r.narrator.calls(), 2); noProse(r.events, PARTIAL, "Another half"); assert.equal(r.f.coordinator.recent(r.f.campaign).finalized().length, 0);
  assert.deepEqual(r.generation.truncation, { detected: true, recovery_attempted: true, recovery_result: "failed" });
  assert.ok(r.last.type === "turn_failed" && r.last.narration === "");
});

test("NARR-1: a failed recovery request is terminal narrator_truncated and never reaches the Controller", async () => {
  const r = await run([length(), { fail: "provider_unavailable" }], { retry: false });
  assert.equal(failureCode(r.last), "narrator_truncated"); assert.equal(r.controllerCalls(), 0); assert.equal(r.f.campaign.revision, r.base); assert.equal(r.narrator.calls(), 2);
  assert.equal(r.last.type === "turn_failed" && r.last.provider_code, "provider_unavailable", "the provider cause stays diagnosable");
});

test("NARR-1: refusal and malformed output follow their own policies and never trigger the truncation recovery", async () => {
  for (const code of ["model_refusal", "invalid_provider_response"] as const) {
    const r = await run([{ fail: code }, { text: GOOD }], { retry: false });
    assert.equal(r.last.type, "turn_failed", code); assert.notEqual(failureCode(r.last), "narrator_truncated", code);
    assert.equal(r.narrator.calls(), 1, `${code}: no regeneration`); assert.equal(r.controllerCalls(), 0); assert.equal(r.generation.truncation.recovery_attempted, false);
  }
});

test("NARR-1 budget: infrastructure retry + truncation recovery share ONE budget of 3 physical attempts (A: fail, length, ok)", async () => {
  const r = await run([{ fail: "network_error" }, length(), { text: GOOD }]);
  assert.equal(r.last.type, "turn_completed"); assert.equal(r.narrator.calls(), 3); assert.equal(r.controllerCalls(), 1); assert.equal(r.generation.physical_attempts, 3);
  assert.deepEqual(r.generation.attempts.map(a => [a.generation, a.outcome]), [["primary", "provider_error"], ["primary", "length"], ["recovery", "stop"]]);
});

test("NARR-1 budget: (B) length, recovery fails once, retry succeeds = 3 attempts, success", async () => {
  const r = await run([length(), { fail: "network_error" }, { text: GOOD }]);
  assert.equal(r.last.type, "turn_completed"); assert.equal(r.narrator.calls(), 3); assert.equal(r.controllerCalls(), 1);
  assert.deepEqual(r.generation.attempts.map(a => a.generation), ["primary", "recovery", "recovery"]);
});

test("NARR-1 budget: (C) a fourth physical attempt is never made: length, recovery fails twice -> terminal, 3 attempts", async () => {
  const r = await run([length(), { fail: "network_error" }, { fail: "network_error" }, { text: GOOD }]);
  assert.equal(failureCode(r.last), "narrator_truncated"); assert.equal(r.narrator.calls(), 3); assert.equal(r.controllerCalls(), 0); assert.equal(r.f.campaign.revision, r.base);
});

test("NARR-1 budget: (D) fail, length, length = the third attempt is the recovery and it is terminal", async () => {
  const r = await run([{ fail: "network_error" }, length(), length("Second half senten")]);
  assert.equal(failureCode(r.last), "narrator_truncated"); assert.equal(r.narrator.calls(), 3); assert.equal(r.controllerCalls(), 0);
});

test("NARR-1 budget: (E) the physical budget is exhausted before a recovery can start -> terminal narrator_truncated without a provider call", async () => {
  const r = await run([{ fail: "network_error" }, { fail: "network_error" }, length(), { text: GOOD }]);
  assert.notEqual(r.narrator.calls(), 4); assert.ok(r.narrator.calls() <= 3); assert.equal(r.controllerCalls(), 0); assert.equal(r.f.campaign.revision, r.base);
});

test("NARR-1: a recovery that needs an audit revision spends no third generation: the complete draft is redacted deterministically", async () => {
  const r = await run([length(), { text: BAD }]);
  assert.equal(r.last.type, "turn_completed"); assert.equal(r.narrator.calls(), 2, "length + recovery = both logical generations; no revision request");
  assert.equal(r.controllerCalls(), 1); assert.equal(r.f.campaign.revision, r.base + 1);
  const delivered = r.last.type === "turn_completed" ? r.last.result.narration : "";
  assert.ok(!delivered.includes("Gerome"), "the unauthorized handover is not delivered"); assert.equal(r.generation.logical_generations, 2);
  assert.ok(r.generation.physical_attempts <= 3);
});

test("NARR-1: an ordinary audit revision still works (primary + revision = 2 logical) and a truncated revision falls back to redaction of the complete draft", async () => {
  const ok = await run([{ text: BAD }, { text: GOOD }]);
  assert.equal(ok.last.type, "turn_completed"); assert.equal(ok.narrator.calls(), 2); assert.deepEqual(ok.generation.attempts.map(a => a.generation), ["primary", "revision"]);
  const cut = await run([{ text: BAD }, length("Brenna accepts")]);
  assert.equal(cut.last.type, "turn_completed"); assert.equal(cut.controllerCalls(), 1); assert.ok(cut.narrator.calls() <= 3);
  const delivered = cut.last.type === "turn_completed" ? cut.last.result.narration : ""; assert.ok(!delivered.includes("Gerome")); assert.notEqual(delivered, "Brenna accepts");
});

test("NARR-1: a campaign change between the truncated answer and its recovery aborts as stale_turn with no Controller call", async () => {
  const holder: { f?: ReturnType<typeof coordinatorWith> } = {};
  const steps: NarratorStep[] = [length(), { text: GOOD }];
  const records: TurnDiagnostics[] = [];
  let seen = 0;
  const narrator = stepNarrator(steps, async () => { if (++seen === 2) holder.f!.campaign.apply({ expected_revision: holder.f!.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); });
  const controller = countingController([transfer]);
  holder.f = coordinatorWith(narrator, controller, { diagnostics: x => records.push(x as TurnDiagnostics) });
  const events = await collect(holder.f.coordinator.runTurn({ campaign: holder.f.campaign, player_input: INPUT }));
  assert.equal(failureCode(events.at(-1)!), "stale_turn"); assert.equal(controller.calls(), 0);
});

test("NARR-1: narrator_truncated is a terminal, honest application error and the next turn works", async () => {
  const f = coordinatorWith(stepNarrator([length(), length(), { text: NARRATION }]), countingController());
  const first = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: INPUT }));
  assert.equal(failureCode(first.at(-1)!), "narrator_truncated"); const base = f.campaign.revision;
  const second = await collect(f.coordinator.runTurn({ campaign: f.campaign, player_input: "Hello, Brenna." }));
  assert.equal(second.at(-1)!.type, "turn_completed", "the third scripted answer is complete"); assert.ok(f.campaign.revision >= base);
});
