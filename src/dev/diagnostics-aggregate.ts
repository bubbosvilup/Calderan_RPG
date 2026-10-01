import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";

/**
 * Hardening H5 — offline aggregation of H4 TurnDiagnostics. Pure and local: no telemetry, no network, no prompt or narration text
 * (the input records carry none). A record may be tagged with the evaluation scenario and run number.
 */
export interface EvalRecord { readonly scenario_id?: string; readonly run?: number; readonly diagnostics: TurnDiagnostics }
/** USD per million tokens. Never defaulted: cost is reported as null unless the operator supplies prices. */
export interface TokenPrices { readonly narrator_input?: number | undefined; readonly narrator_output?: number | undefined; readonly controller_input?: number | undefined; readonly controller_output?: number | undefined }
export interface Percentiles { readonly n: number; readonly p50: number | null; readonly p95: number | null; readonly p99: number | null; readonly max: number | null; readonly mean: number | null }
export const rate = (n: number, d: number): number | null => d === 0 ? null : n / d;
/** Nearest-rank percentile; honest about tiny samples (p99 of n<100 is the max). */
export function percentiles(values: readonly number[]): Percentiles {
  if (!values.length) return { n: 0, p50: null, p95: null, p99: null, max: null, mean: null };
  const s = [...values].sort((a, b) => a - b), at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
  return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.at(-1)!, mean: s.reduce((a, b) => a + b, 0) / s.length };
}
const count = <T>(items: readonly T[], key: (item: T) => string | undefined): Record<string, number> => {
  const out: Record<string, number> = {}; for (const item of items) { const k = key(item); if (k) out[k] = (out[k] ?? 0) + 1; } return out;
};
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const stageMs = (d: TurnDiagnostics, ...phases: (keyof TurnDiagnostics["stage_timings"])[]) => sum(phases.map(p => (d.stage_timings[p]?.provider_ms ?? 0) + (d.stage_timings[p]?.deterministic_ms ?? 0)));
const totalMs = (d: TurnDiagnostics) => sum(Object.values(d.stage_timings).map(t => t.deterministic_ms + t.provider_ms));

export interface Aggregate {
  readonly turns: number;
  readonly outcome: { readonly success: number; readonly failure: number; readonly abandoned: number; readonly success_rate: number | null; readonly failure_rate: number | null;
    readonly failure_codes: Record<string, number>; readonly failure_phases: Record<string, number>; readonly provider_codes: Record<string, number> };
  readonly latency_ms: { readonly narrator: Percentiles; readonly controller: Percentiles; readonly reconciliation: Percentiles; readonly total_turn: Percentiles };
  readonly narrator: { readonly reached: number; readonly completed: number; readonly provider_success_rate: number | null; readonly empty_or_inconsistent: number };
  readonly controller: { readonly reached: number; readonly provider_success: number; readonly provider_success_rate: number | null; readonly structured_output_invalid: number;
    readonly parse_success_rate: number | null; readonly proposed_total: number; readonly authorized_total: number; readonly rejected_total: number;
    readonly turns_with_proposal: number; readonly authorized_proposal_rate: number | null; readonly rejected_proposal_rate: number | null; readonly normalization_used: number };
  readonly audit: { readonly audited: number; readonly turns_with_issues: number; readonly issue_rate: number | null; readonly issues_per_turn: number | null; readonly issue_kinds: Record<string, number>;
    readonly reconciliation_attempted: number; readonly reconciliation_rate: number | null; readonly reconciliation_clean: number; readonly reconciliation_still_bad: number; readonly redaction_used: number; readonly redaction_rate: number | null;
    readonly revision_issue_kinds: Record<string, number> };
  readonly retry: { readonly turns_with_retry: number; readonly retry_rate: number | null; readonly first_attempt_success: number; readonly first_attempt_success_rate: number | null;
    readonly recovered_calls: number; readonly unrecovered_retried_calls: number; readonly retry_reasons: Record<string, number>; readonly attempts_total: number };
  readonly retrieval: { readonly triggered: number; readonly triggered_rate: number | null; readonly modes: Record<string, number>; readonly fallback_to_lexical: number };
  readonly context: { readonly serialized_characters: Percentiles; readonly prompt_pressure: Percentiles };
  readonly commit: { readonly attempted: number; readonly succeeded: number; readonly commit_success_rate: number | null };
  readonly tokens: { readonly narrator_prompt: number; readonly narrator_completion: number; readonly controller_prompt: number; readonly controller_completion: number;
    readonly narrator_calls_with_usage: number; readonly controller_calls_with_usage: number; readonly avg_per_turn: { readonly narrator_prompt: number | null; readonly narrator_completion: number | null; readonly controller_prompt: number | null; readonly controller_completion: number | null } };
  readonly estimated_cost_usd: number | null;
  readonly by_scenario: Record<string, { readonly turns: number; readonly success: number; readonly reconciliation: number; readonly redaction: number; readonly turns_with_issues: number; readonly retried: number }>;
}
export function aggregate(records: readonly EvalRecord[], prices: TokenPrices = {}): Aggregate {
  const ds = records.map(r => r.diagnostics), n = ds.length;
  const failed = ds.filter(d => d.outcome === "failure");
  const reachedController = ds.filter(d => d.stage_timings.controller !== undefined);
  const audited = ds.filter(d => d.audit);
  const attemptsOf = (d: TurnDiagnostics) => Object.values(d.provider_attempts ?? {});
  const withRetry = ds.filter(d => attemptsOf(d).some(a => a.attempts > 1));
  const structuredInvalid = ds.filter(d => d.provider_code === "structured_output_invalid").length;
  const controllerOk = reachedController.filter(d => d.controller !== undefined).length;
  const proposed = sum(ds.map(d => d.authorization?.proposed_count ?? 0)), authorizedN = sum(ds.map(d => d.authorization?.authorized_count ?? 0));
  const tokens = { np: 0, nc: 0, cp: 0, cc: 0, nCalls: 0, cCalls: 0 };
  for (const d of ds) {
    for (const r of [d.narrator, d.revision_narrator]) if (r?.usage && (r.usage.prompt_tokens !== undefined || r.usage.completion_tokens !== undefined)) { tokens.np += r.usage.prompt_tokens ?? 0; tokens.nc += r.usage.completion_tokens ?? 0; tokens.nCalls++; }
    if (d.controller?.usage && (d.controller.usage.prompt_tokens !== undefined || d.controller.usage.completion_tokens !== undefined)) { tokens.cp += d.controller.usage.prompt_tokens ?? 0; tokens.cc += d.controller.usage.completion_tokens ?? 0; tokens.cCalls++; }
  }
  const priced = prices.narrator_input !== undefined && prices.narrator_output !== undefined && prices.controller_input !== undefined && prices.controller_output !== undefined;
  const cost = priced ? (tokens.np * prices.narrator_input! + tokens.nc * prices.narrator_output! + tokens.cp * prices.controller_input! + tokens.cc * prices.controller_output!) / 1e6 : null;
  const by_scenario: Aggregate["by_scenario"] = {};
  for (const r of records) {
    const key = r.scenario_id ?? "unlabelled", d = r.diagnostics, cur = by_scenario[key] ?? { turns: 0, success: 0, reconciliation: 0, redaction: 0, turns_with_issues: 0, retried: 0 };
    by_scenario[key] = { turns: cur.turns + 1, success: cur.success + (d.outcome === "success" ? 1 : 0), reconciliation: cur.reconciliation + (d.audit?.reconciliation_attempted ? 1 : 0),
      redaction: cur.redaction + (d.audit?.redaction_used ? 1 : 0), turns_with_issues: cur.turns_with_issues + ((d.audit?.issue_count ?? 0) > 0 ? 1 : 0), retried: cur.retried + (attemptsOf(d).some(a => a.attempts > 1) ? 1 : 0) };
  }
  const issueKinds: Record<string, number> = {}, revisionKinds: Record<string, number> = {};
  for (const d of audited) { for (const k of d.audit!.issue_kinds) issueKinds[k] = (issueKinds[k] ?? 0) + 1; for (const k of d.audit!.revision_issue_kinds) revisionKinds[k] = (revisionKinds[k] ?? 0) + 1; }
  const reconciled = audited.filter(d => d.audit!.reconciliation_attempted);
  const pressure = ds.flatMap(d => d.context ? [d.context.serialized_characters / d.context.max_characters] : []);
  const sorted = (values: readonly number[]) => values.filter(v => v > 0);
  return {
    turns: n,
    outcome: { success: ds.filter(d => d.outcome === "success").length, failure: failed.length, abandoned: ds.filter(d => d.outcome === "abandoned").length,
      success_rate: rate(ds.filter(d => d.outcome === "success").length, n), failure_rate: rate(failed.length, n),
      failure_codes: count(failed, d => d.failure_code), failure_phases: count(failed, d => d.failure_phase), provider_codes: count(failed, d => d.provider_code) },
    latency_ms: { narrator: percentiles(sorted(ds.map(d => stageMs(d, "narrator")))), controller: percentiles(sorted(ds.map(d => stageMs(d, "controller")))),
      reconciliation: percentiles(sorted(ds.map(d => stageMs(d, "reconciliation", "reconciliation_narrator", "reconciliation_audit")))), total_turn: percentiles(ds.map(totalMs)) },
    narrator: { reached: ds.filter(d => d.stage_timings.narrator !== undefined).length, completed: ds.filter(d => d.narrator?.completed).length,
      provider_success_rate: rate(ds.filter(d => d.narrator?.completed).length, ds.filter(d => d.stage_timings.narrator !== undefined).length),
      empty_or_inconsistent: ds.filter(d => (d.provider_attempts?.narrator?.retry_reasons ?? []).includes("empty_or_inconsistent_completion") || (d.failure_code === "narrator_failed" && !d.provider_code && d.failure_phase === "narrator")).length },
    controller: { reached: reachedController.length, provider_success: controllerOk, provider_success_rate: rate(controllerOk, reachedController.length), structured_output_invalid: structuredInvalid,
      parse_success_rate: rate(reachedController.length - structuredInvalid, reachedController.length), proposed_total: proposed, authorized_total: authorizedN, rejected_total: proposed - authorizedN,
      turns_with_proposal: ds.filter(d => (d.authorization?.proposed_count ?? 0) > 0).length, authorized_proposal_rate: rate(authorizedN, proposed), rejected_proposal_rate: rate(proposed - authorizedN, proposed),
      normalization_used: ds.filter(d => d.controller?.normalization_used).length },
    audit: { audited: audited.length, turns_with_issues: audited.filter(d => d.audit!.issue_count > 0).length, issue_rate: rate(audited.filter(d => d.audit!.issue_count > 0).length, audited.length),
      issues_per_turn: rate(sum(audited.map(d => d.audit!.issue_count)), audited.length), issue_kinds: issueKinds, reconciliation_attempted: reconciled.length, reconciliation_rate: rate(reconciled.length, audited.length),
      reconciliation_clean: reconciled.filter(d => d.audit!.delivered === "revision").length, reconciliation_still_bad: reconciled.filter(d => d.audit!.redaction_used).length,
      redaction_used: audited.filter(d => d.audit!.redaction_used).length, redaction_rate: rate(audited.filter(d => d.audit!.redaction_used).length, audited.length), revision_issue_kinds: revisionKinds },
    retry: { turns_with_retry: withRetry.length, retry_rate: rate(withRetry.length, n), first_attempt_success: ds.filter(d => d.outcome === "success" && !attemptsOf(d).some(a => a.attempts > 1)).length,
      first_attempt_success_rate: rate(ds.filter(d => d.outcome === "success" && !attemptsOf(d).some(a => a.attempts > 1)).length, n),
      recovered_calls: sum(ds.map(d => attemptsOf(d).filter(a => a.recovered).length)), unrecovered_retried_calls: sum(ds.map(d => attemptsOf(d).filter(a => a.attempts > 1 && !a.recovered).length)),
      retry_reasons: count(ds.flatMap(d => attemptsOf(d).flatMap(a => a.retry_reasons)), r => r), attempts_total: sum(ds.map(d => sum(attemptsOf(d).map(a => a.attempts)))) },
    retrieval: { triggered: ds.filter(d => d.retrieval?.triggered).length, triggered_rate: rate(ds.filter(d => d.retrieval?.triggered).length, ds.filter(d => d.retrieval).length),
      modes: count(ds, d => d.retrieval?.mode), fallback_to_lexical: ds.filter(d => d.retrieval?.fallback_to_lexical).length },
    context: { serialized_characters: percentiles(ds.flatMap(d => d.context ? [d.context.serialized_characters] : [])), prompt_pressure: percentiles(pressure) },
    commit: { attempted: ds.filter(d => d.commit.attempted).length, succeeded: ds.filter(d => d.commit.succeeded).length, commit_success_rate: rate(ds.filter(d => d.commit.succeeded).length, ds.filter(d => d.commit.attempted).length) },
    tokens: { narrator_prompt: tokens.np, narrator_completion: tokens.nc, controller_prompt: tokens.cp, controller_completion: tokens.cc, narrator_calls_with_usage: tokens.nCalls, controller_calls_with_usage: tokens.cCalls,
      avg_per_turn: { narrator_prompt: rate(tokens.np, n), narrator_completion: rate(tokens.nc, n), controller_prompt: rate(tokens.cp, n), controller_completion: rate(tokens.cc, n) } },
    estimated_cost_usd: cost, by_scenario,
  };
}
const pct = (v: number | null) => v === null ? "n/a" : `${(v * 100).toFixed(1)}%`;
const ms = (v: number | null) => v === null ? "n/a" : `${Math.round(v)}`;
const obj = (o: Record<string, number>) => Object.keys(o).length ? Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(", ") : "none";
export function renderMarkdown(a: Aggregate): string {
  const p = (name: string, x: Percentiles) => `| ${name} | ${x.n} | ${ms(x.p50)} | ${ms(x.p95)} | ${ms(x.p99)} | ${ms(x.max)} |`;
  const rows = [
    `Turns: ${a.turns} (success ${a.outcome.success}, failure ${a.outcome.failure}, abandoned ${a.outcome.abandoned}); success ${pct(a.outcome.success_rate)}.`, "",
    "| Metric | Value |", "|---|---|",
    `| Failure codes | ${obj(a.outcome.failure_codes)} |`, `| Failure phases | ${obj(a.outcome.failure_phases)} |`, `| Provider codes (failed turns) | ${obj(a.outcome.provider_codes)} |`,
    `| Narrator provider success | ${pct(a.narrator.provider_success_rate)} (${a.narrator.completed}/${a.narrator.reached}) |`,
    `| Controller provider success / parse | ${pct(a.controller.provider_success_rate)} / ${pct(a.controller.parse_success_rate)} |`,
    `| Proposals / authorized / rejected | ${a.controller.proposed_total} / ${a.controller.authorized_total} / ${a.controller.rejected_total} (authorized ${pct(a.controller.authorized_proposal_rate)}) |`,
    `| Audit issue rate / issues per turn | ${pct(a.audit.issue_rate)} / ${a.audit.issues_per_turn === null ? "n/a" : a.audit.issues_per_turn.toFixed(2)} |`, `| Issue kinds | ${obj(a.audit.issue_kinds)} |`,
    `| Reconciliation / clean / still bad | ${pct(a.audit.reconciliation_rate)} / ${a.audit.reconciliation_clean} / ${a.audit.reconciliation_still_bad} |`, `| Redaction | ${pct(a.audit.redaction_rate)} |`,
    `| Retry (turns) / first-attempt success | ${pct(a.retry.retry_rate)} / ${pct(a.retry.first_attempt_success_rate)} |`, `| Retry reasons / recovered calls / unrecovered | ${obj(a.retry.retry_reasons)} / ${a.retry.recovered_calls} / ${a.retry.unrecovered_retried_calls} |`,
    `| Retrieval triggered / modes / lexical fallbacks | ${pct(a.retrieval.triggered_rate)} / ${obj(a.retrieval.modes)} / ${a.retrieval.fallback_to_lexical} |`,
    `| Commit success | ${pct(a.commit.commit_success_rate)} |`,
    `| Tokens (narrator in/out, controller in/out) | ${a.tokens.narrator_prompt}/${a.tokens.narrator_completion}, ${a.tokens.controller_prompt}/${a.tokens.controller_completion} |`,
    `| Estimated cost (USD) | ${a.estimated_cost_usd === null ? "n/a (prices not supplied)" : a.estimated_cost_usd.toFixed(4)} |`, "",
    "| Latency (ms) | n | p50 | p95 | p99 | max |", "|---|---:|---:|---:|---:|---:|",
    p("narrator (incl. retries)", a.latency_ms.narrator), p("controller (incl. retries)", a.latency_ms.controller), p("reconciliation", a.latency_ms.reconciliation), p("total turn", a.latency_ms.total_turn), "",
    "| Scenario | Turns | Success | Issues | Reconciled | Redacted | Retried |", "|---|---:|---:|---:|---:|---:|---:|",
    ...Object.entries(a.by_scenario).map(([k, v]) => `| ${k} | ${v.turns} | ${v.success} | ${v.turns_with_issues} | ${v.reconciliation} | ${v.redaction} | ${v.retried} |`),
  ];
  return rows.join("\n") + "\n";
}
export function parseJsonl(text: string): EvalRecord[] {
  return text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line) as unknown).filter(value => !(value && typeof value === "object" && (value as Record<string, unknown>).kind === "header")).map((value, i) => {
    if (!value || typeof value !== "object") throw new Error(`line ${i + 1}: not an object`);
    const o = value as Record<string, unknown>;
    if (o.diagnostics && typeof o.diagnostics === "object") return o as unknown as EvalRecord;
    if (typeof o.turn_id === "string") return { diagnostics: o as unknown as TurnDiagnostics };
    throw new Error(`line ${i + 1}: neither an EvalRecord nor a TurnDiagnostics`);
  });
}
