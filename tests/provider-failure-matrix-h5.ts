import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { aggregate } from "../src/dev/diagnostics-aggregate.js";
import type { ProviderErrorCode } from "../src/llm/errors.js";
import { collect, transfer } from "./turn-fixtures.js";
import { failOnce, failTwice, fakeRetry, scriptedController, scriptedNarrator, type Step } from "./provider-failure-scripts.js";

/** Offline H5 injection matrix (NOT live): every transient/permanent provider failure at each call site, with and without retry. Prints JSON. */
const TEXT = "Brenna accepts boots from Nicco.";
const cases: { id: string; narrator?: Step[]; controller?: Step[]; texts?: string[]; commands?: typeof transfer[] }[] = [];
for (const code of ["rate_limited", "timeout", "network_error", "provider_unavailable"] as ProviderErrorCode[]) {
  cases.push({ id: `narrator_${code}_once`, narrator: failOnce(code) }, { id: `controller_${code}_once`, controller: failOnce(code) }, { id: `narrator_${code}_twice`, narrator: failTwice(code) }, { id: `controller_${code}_twice`, controller: failTwice(code) });
}
cases.push({ id: "narrator_empty_once", narrator: ["empty", "ok"] }, { id: "controller_malformed_once", controller: ["malformed", "ok"] }, { id: "narrator_malformed_response_once", narrator: ["malformed", "ok"] },
  { id: "narrator_authentication_error", narrator: [{ fail: "authentication_error" }, "ok"] }, { id: "controller_configuration_error", controller: [{ fail: "configuration_error" }, "ok"] },
  { id: "reconciliation_rate_limited_once", narrator: ["ok", { fail: "rate_limited" }, "ok"], texts: [TEXT, "Brenna hesitates."], commands: [] });
const out: Record<string, unknown> = {};
for (const retry of [true, false]) {
  const records = []; let commits = 0, duplicates = 0;
  for (const c of cases) for (let run = 1; run <= 5; run++) {
    const f = turnFixture(), service = new RetrievalService(f.world), diag: TurnDiagnostics[] = [];
    const policy = fakeRetry().policy;
    const co = new TurnCoordinator(f.world, scriptedNarrator(c.texts ?? [TEXT], c.narrator), scriptedController(c.commands ?? [transfer], c.controller), { service, search: new HybridSearch(service) },
      { diagnostics_sink: r => diag.push(structuredClone(r) as TurnDiagnostics), provider_retry: retry ? policy : false });
    const events = await collect(co.runTurn({ campaign: f.campaign, player_input: "I give boots to Brenna." }));
    const n = events.filter(e => e.type === "state_committed").length; commits += n; if (n > 1) duplicates++;
    records.push({ scenario_id: c.id, run, diagnostics: diag[0]! });
  }
  const a = aggregate(records);
  out[retry ? "retry_enabled" : "retry_disabled"] = { turns: a.turns, success: a.outcome.success, success_rate: a.outcome.success_rate, failure_codes: a.outcome.failure_codes, provider_codes: a.outcome.provider_codes,
    turns_with_retry: a.retry.turns_with_retry, recovered_calls: a.retry.recovered_calls, unrecovered_retried_calls: a.retry.unrecovered_retried_calls, commits_total: commits, turns_with_more_than_one_commit: duplicates };
}
process.stdout.write(JSON.stringify({ kind: "offline_injection_not_live", runs_per_case: 5, cases: cases.map(c => c.id), results: out }, null, 2) + "\n");
