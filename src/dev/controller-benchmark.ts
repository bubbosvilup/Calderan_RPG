/**
 * State Controller benchmark (development only). Reusable across OpenRouter models without touching fixtures:
 *
 *   npm run benchmark:controller -- prepare   [--out DIR]
 *   npm run benchmark:controller -- run       [--out DIR] [--runs N] [--cases id,id] <model> [<model>...]
 *   npm run benchmark:controller -- summarize [--out DIR]
 *
 * prepare freezes every case: it builds the exact production controller request through the real TurnCoordinator, replays the gold
 * proposal through the real authorization/commit path and stores the gold authoritative state. run calls each model DIRECTLY (no
 * model fallback; provider routing {require_parameters, allow_fallbacks} as in production) through the production controller provider
 * and the shared production retry policy, sequentially, then replays the answer through the same engine path and compares states.
 * Output lives under the git-ignored saves/ tree. Prompts and keys are never written: only request hashes, model outputs and safe
 * transport metadata.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual as equal } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import type { DeepReadonly } from "../types/readonly.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import { learnCanonicalName } from "../campaign/identity-knowledge.js";
import { loadWorld } from "../world/loader.js";
import type { WorldStore } from "../world/world-store.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import type { TurnEvent, TurnResult } from "../turn/turn-types.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { ControllerRequest, ControllerResult } from "../llm/state-controller-provider.js";
import { CONTROLLER_POLICY, OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { CONTROLLER_EVIDENCE_SCHEMA, parseControllerEvidenceProposal, parseControllerProposal } from "../llm/controller-schema.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { DEFAULT_RETRY_POLICY, ProviderBudget, withProviderRetry, type ProviderAttemptRecord } from "../llm/retry.js";
import { ProviderError } from "../llm/errors.js";
import { turnFixture } from "./turn-fixture.js";
import { BENCHMARK_CASES, DELL, DELL_MARSH, HOME, BRENNA_MARKET, type BenchmarkCase, type BenchmarkFixture } from "./controller-benchmark-cases.js";

const metadata = { model: "benchmark-replay", usage: {}, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "2026-01-01T00:00:00Z", elapsed_total_ms: 0 } };
/** Frozen values went through JSON (undefined keys dropped); live values are compared in the same canonical form. */
export const jsonCanonical = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
export const sha256 = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
let canonicalWorld: Promise<WorldStore> | undefined;
const canonical = () => canonicalWorld ??= loadWorld("data");

// ------------------------------------------------------------------------------------------------ fixtures and replay
export async function buildFixture(f: BenchmarkFixture): Promise<{ world: WorldStore; campaign: CampaignState }> {
  if (f.kind === "household") {
    const { world, campaign } = turnFixture(!!f.garments);
    const created = (id: string, name: string, description: string, presentation: string): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" },
      profile: { name, age: { kind: "exact", years: 38 }, sex: "male", species: "Human", appearance: { description } }, current: { current_location: "test_room", status: "active", presentation } } });
    campaign.apply({ expected_revision: campaign.revision, commands: [
      { kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } },
      ...["maren", "brenna"].map(character_id => ({ kind: "join_household" as const, household_id: HOME, character_id })),
      ...(f.maren_at_hall ? [{ kind: "move_character" as const, character_id: "maren", location_id: "test_hall" }] : []),
      ...(f.brenna_knows ? [{ kind: "set_knowledge" as const, knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows" as const } }] : []),
      ...(f.dell ? [created(DELL, "Dell Harrow", "A thick-armed dockworker in a salt-stained coat.", "Sour-tempered and loud after a long shift.")] : []),
      ...(f.dell_marsh ? [created(DELL_MARSH, "Dell Marsh", "A thin carter with ink-stained fingers.", "Quiet, nursing a cup at the table.")] : []),
    ] });
    return { world, campaign };
  }
  const world = await canonical(), campaign = createOpeningCampaign(world, "controller_benchmark");
  const brenna = (location: string, holder: string): CampaignCommand[] => [
    { kind: "register_character", character: { id: BRENNA_MARKET, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: location, status: "active" } } },
    { kind: "set_legal_status", character_id: BRENNA_MARKET, status: "enslaved", holder_id: holder }];
  if (f.kind === "market") campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } },
    ...learnCanonicalName(world, campaign.exportSnapshot(), "korvin"), ...brenna("calderan_slave_market", "korvin")] });
  else if (f.kind === "canonical_scene") campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { character_movements: f.npcs.map(id => ({ character_id: id, current_location: "heartstone_square" })) } }] });
  else campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }, ...brenna("heartstone_lr", "nicco")] });
  return { world, campaign };
}
function fixedNarrator(text: string): NarratorProvider {
  return { async generate() { return { text, ...metadata }; }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
/** Order- and wording-insensitive where the engine is: event ids/titles are free text, condition lists are sets, rules compare normalized. */
export function normalizeCommand(command: CampaignCommand): unknown {
  if (command.kind === "schedule_event") return { kind: command.kind, scheduled_world_minute: command.scheduled_world_minute, participants: [...(command.participants ?? [])].sort() };
  if (command.kind === "set_condition") return { ...command, conditions: [...command.conditions].sort() };
  if (command.kind === "add_household_rule") return { ...command, text: command.text.toLowerCase().replace(/[\s.!"']+$/g, "").replace(/\s+/g, " ").trim() };
  return command;
}
export const sameCommand = (a: CampaignCommand, b: CampaignCommand) => equal(normalizeCommand(a), normalizeCommand(b));
/** Authoritative domains only; revision counters and free-text event ids/titles removed. */
export function stateProjection(s: DeepReadonly<CampaignSnapshot>): unknown {
  const scrub = (v: unknown): unknown => Array.isArray(v) ? v.map(scrub) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => !/revision$/.test(k)).map(([k, x]) => [k, scrub(x)])) : v;
  const events = s.scheduled_events.map(({ id: _id, title: _title, ...e }) => ({ ...e, participants: [...(e.participants ?? [])].sort() }));
  const characters = s.characters.map(c => ({ ...c, current: { ...c.current, ...(c.current.conditions ? { conditions: [...c.current.conditions].sort() } : {}) } }));
  return scrub({ characters, items: s.items, households: s.households, facts: s.facts, knowledge: s.knowledge, relationships: s.relationships, goals: s.goals, scheduled_events: events, funds: s.funds, legal_statuses: s.legal_statuses, transactions: s.transactions, runtime: s.runtime });
}
export interface Replay { readonly request: Omit<ControllerRequest, "signal" | "timeout_ms">; readonly result: TurnResult | null; readonly failure: string | null; readonly state: unknown }
/** One real turn: frozen narration, the given controller answer (or a thrown provider error), real authorization and commit. */
export async function replay(c: BenchmarkCase, answer: ControllerResult | ProviderError, onRequest?: (r: Replay["request"]) => void): Promise<Replay> {
  const f = await buildFixture(c.fixture), service = new RetrievalService(f.world);
  let request: Replay["request"] | undefined;
  const co = new TurnCoordinator(f.world, fixedNarrator(c.narration), { async propose(r) {
    request = { player_action: r.player_action, prior_state: r.prior_state, final_narration: r.final_narration }; onRequest?.(request);
    if (answer instanceof ProviderError) throw answer; return answer;
  } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  for (const e of c.recent ?? []) co.recent(f.campaign).add(e);
  const events: TurnEvent[] = [];
  for await (const e of co.runTurn({ campaign: f.campaign, player_input: c.input })) events.push(e);
  const done = events.find(e => e.type === "turn_completed"), failed = events.find(e => e.type === "turn_failed");
  if (!request) throw new Error(`Controller not reached for ${c.id}: ${JSON.stringify(failed)}`);
  return { request, result: done && done.type === "turn_completed" ? done.result : null, failure: failed && failed.type === "turn_failed" ? failed.code : null, state: stateProjection(f.campaign.exportSnapshot()) };
}
const goldAnswer = (c: BenchmarkCase, commands: readonly CampaignCommand[], quotes: readonly string[]): ControllerResult => ({ ...metadata, commands: [...commands], evidence: [...quotes] });

// ------------------------------------------------------------------------------------------------ prepare
export interface PreparedCase { readonly id: string; readonly group: string; readonly tags: readonly string[]; readonly adult_prose: boolean; readonly source: string;
  readonly expected: readonly CampaignCommand[]; readonly optional: readonly CampaignCommand[]; readonly engine_supplied: readonly CampaignCommand[];
  readonly request_hash: string; readonly prior_state_characters: number; readonly gold_state: unknown; readonly gold_state_hash: string; readonly baseline_equals_gold: boolean }
export async function prepareCase(c: BenchmarkCase): Promise<PreparedCase> {
  const quotes = c.gold_quotes ?? c.expected.map(() => c.narration);
  const gold = await replay(c, goldAnswer(c, c.expected, quotes));
  if (!gold.result) throw new Error(`Gold replay failed ${c.id}: ${gold.failure}`);
  for (const e of c.expected) {
    const decision = gold.result.authorization.find(a => sameCommand(a.command, e));
    if (!decision?.authorized) throw new Error(`Gold command not authorized ${c.id}: ${JSON.stringify(e)} ${JSON.stringify(decision ?? gold.result.authorization)}`);
  }
  const again = await replay(c, goldAnswer(c, c.expected, quotes));
  if (!equal(again.state, gold.state) || !equal(again.request, gold.request)) throw new Error(`Nondeterministic fixture ${c.id}`);
  if (c.optional.length) {
    const withOptional = await replay(c, goldAnswer(c, [...c.expected, ...c.optional], [...quotes, ...c.optional.map(() => c.narration)]));
    if (!equal(withOptional.state, gold.state)) throw new Error(`Optional commands change gold state ${c.id}`);
  }
  const baseline = await replay(c, goldAnswer(c, [], []));
  // Expected commands the engine commits without any controller proposal are engine-owned: allowed, never counted as model recall.
  const baseline_equals_gold = equal(baseline.state, gold.state);
  const engine_supplied = c.expected.length && baseline_equals_gold ? c.expected : [];
  return { id: c.id, group: c.group, tags: c.tags, adult_prose: !!c.adult_prose, source: c.source, expected: engine_supplied.length ? [] : c.expected, optional: [...c.optional, ...engine_supplied], engine_supplied,
    request_hash: sha256(gold.request), prior_state_characters: gold.request.prior_state.length, gold_state: gold.state, gold_state_hash: sha256(gold.state), baseline_equals_gold };
}
/** Model-independent invariant: a proposal answered after a concurrent commit is rejected as stale and commits nothing. */
export async function staleRevisionInvariant(): Promise<boolean> {
  const c = BENCHMARK_CASES.find(x => x.id === "r2_d02_repeated_item")!, f = await buildFixture(c.fixture), service = new RetrievalService(f.world);
  const before = f.campaign.exportSnapshot().items.find(i => i.id === "ring")!.owner_id;
  const co = new TurnCoordinator(f.world, fixedNarrator(c.narration), { async propose() {
    f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] });
    return goldAnswer(c, c.expected, c.gold_quotes!);
  } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const events: TurnEvent[] = [];
  for await (const e of co.runTurn({ campaign: f.campaign, player_input: c.input })) events.push(e);
  const last = events.at(-1);
  return last?.type === "turn_failed" && last.code === "stale_turn" && f.campaign.exportSnapshot().items.find(i => i.id === "ring")!.owner_id === before;
}

// ------------------------------------------------------------------------------------------------ live calls
type Opt<T> = T | undefined;
export interface AttemptRecord { attempt: number; http_status: number | null; headers_ms: number | null; total_ms: number; provider?: Opt<string>; response_model?: Opt<string>; generation_id?: Opt<string>; finish_reason?: Opt<string>;
  usage?: { prompt_tokens?: Opt<number>; completion_tokens?: Opt<number>; total_tokens?: Opt<number>; cost?: Opt<number>; reasoning_tokens?: Opt<number> }; error?: { code?: Opt<number>; error_type?: Opt<string>; limit_source?: Opt<string>; provider_name?: Opt<string>; retry_after?: Opt<string> }; transport_error?: string; content?: Opt<string> }
const short = (v: unknown, n = 80) => typeof v === "string" ? v.slice(0, n) : typeof v === "number" ? String(v) : undefined;
/** Wraps fetch to record safe per-attempt metadata. Never records request bodies or headers. */
function recordingFetch(attempts: AttemptRecord[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const started = performance.now(), a: AttemptRecord = { attempt: attempts.length + 1, http_status: null, headers_ms: null, total_ms: 0 };
    attempts.push(a);
    try {
      const res = await fetch(url, init);
      a.http_status = res.status; a.headers_ms = performance.now() - started;
      const text = await res.clone().text().catch(() => "");
      a.total_ms = performance.now() - started;
      let body: Record<string, any> | undefined; try { body = JSON.parse(text); } catch { /* not JSON */ }
      if (res.status !== 200 || body?.error) {
        const m = body?.error?.metadata ?? {};
        a.error = { ...(typeof body?.error?.code === "number" ? { code: body.error.code } : {}), ...(short(m.error_type) ? { error_type: short(m.error_type) } : {}), ...(short(m.limit_source) ? { limit_source: short(m.limit_source) } : {}),
          ...(short(m.provider_name) ? { provider_name: short(m.provider_name) } : {}), ...(res.headers.get("retry-after") ? { retry_after: short(res.headers.get("retry-after")) } : {}) };
      }
      if (body?.choices) {
        a.provider = short(body.provider); a.response_model = short(body.model, 120); a.generation_id = short(body.id); a.finish_reason = short(body.choices?.[0]?.finish_reason);
        const u = body.usage ?? {};
        a.usage = { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens, cost: u.cost, reasoning_tokens: u.completion_tokens_details?.reasoning_tokens };
        a.content = typeof body.choices?.[0]?.message?.content === "string" ? body.choices[0].message.content.slice(0, 8000) : undefined;
      }
      return res;
    } catch (error) { a.total_ms = performance.now() - started; a.transport_error = (error as Error)?.name ?? "error"; throw error; }
  }) as typeof fetch;
}
export interface Cell { model: string; case_id: string; run: number; group: string; tags: readonly string[]; adult_prose: boolean; started_at: string;
  call_ok: boolean; error_code?: string; failure_class?: string; retry: ProviderAttemptRecord | null; attempts: AttemptRecord[]; e2e_ms: number;
  json_valid: boolean; schema_valid: boolean; legacy_shape: boolean; normalization_used: boolean;
  proposed: CampaignCommand[]; evidence: string[] | null; decisions: { command: CampaignCommand; authorized: boolean; reason: string; class: "tp" | "optional" | "fp" }[];
  expected: readonly CampaignCommand[]; optional: readonly CampaignCommand[];
  proposed_tp: number; proposed_fp: number; accepted_tp: number; accepted_fp: number; rejected: number; fn: number; turn_failure: string | null; state_match: boolean }
/** Pure scoring of one replayed proposal against the frozen case. */
export function scoreCell(p: Pick<PreparedCase, "expected" | "optional" | "gold_state">, proposed: readonly CampaignCommand[], replayed: Replay | null) {
  const remaining = [...p.expected], optional = [...p.optional];
  const decisions: Cell["decisions"] = proposed.map(command => {
    const decision = replayed?.result?.authorization.find(a => sameCommand(a.command, command));
    const authorized = !!decision?.authorized, reason = decision ? (decision.authorized ? "authorized" : decision.evidence?.check ?? decision.grammar?.reason ?? decision.source ?? "rejected") : "not_evaluated";
    const i = remaining.findIndex(e => sameCommand(e, command));
    if (i >= 0) { remaining.splice(i, 1); return { command, authorized, reason, class: "tp" as const }; }
    const j = optional.findIndex(e => sameCommand(e, command));
    if (j >= 0) { optional.splice(j, 1); return { command, authorized, reason, class: "optional" as const }; }
    return { command, authorized, reason, class: "fp" as const };
  });
  const tp = decisions.filter(d => d.class === "tp"), fp = decisions.filter(d => d.class === "fp");
  return { decisions, proposed_tp: tp.length, proposed_fp: fp.length, accepted_tp: tp.filter(d => d.authorized).length, accepted_fp: fp.filter(d => d.authorized).length,
    rejected: decisions.filter(d => !d.authorized).length, fn: p.expected.length - tp.filter(d => d.authorized).length,
    turn_failure: replayed?.failure ?? null, state_match: !!replayed && equal(jsonCanonical(replayed.state), jsonCanonical(p.gold_state)) };
}
export async function liveCell(model: string, c: BenchmarkCase, p: PreparedCase, run: number): Promise<Cell> {
  const frozen = await replay(c, goldAnswer(c, [], []));
  if (sha256(frozen.request) !== p.request_hash) throw new Error(`Frozen request changed for ${c.id}`);
  const attempts: AttemptRecord[] = [], started_at = new Date().toISOString(), started = performance.now();
  // Direct single-model call through the production provider: same policy, schema, max_tokens, reasoning and routing; no fallback models.
  const provider = new OpenRouterStateControllerProvider(new OpenRouterClient({ fetch: recordingFetch(attempts) }), { model });
  let result: ControllerResult | undefined, error: unknown, retry: ProviderAttemptRecord | null = null;
  try {
    result = await withProviderRetry({ policy: DEFAULT_RETRY_POLICY, budget: new ProviderBudget(DEFAULT_RETRY_POLICY), signal: new AbortController().signal, checkpoint() {}, record: r => { retry = r; },
      run: (_attempt, timeout_ms) => provider.propose({ ...frozen.request, ...(timeout_ms ? { timeout_ms } : {}) }) });
  } catch (e) { error = e; }
  const e2e_ms = performance.now() - started, content = attempts.filter(a => a.http_status === 200).at(-1)?.content ?? "";
  let json_valid = false, schema_valid = false, legacy_shape = false;
  try { JSON.parse(content); json_valid = true; } catch { /* invalid */ }
  try { parseControllerEvidenceProposal(content); schema_valid = true; } catch { try { parseControllerProposal(content); legacy_shape = true; } catch { /* invalid */ } }
  const replayed = result ? await replay(c, result) : null;
  const proposed = [...(result?.commands ?? [])];
  return { model, case_id: c.id, run, group: c.group, tags: c.tags, adult_prose: !!c.adult_prose, started_at, call_ok: !!result,
    ...(error instanceof ProviderError ? { error_code: error.code, ...(error.failure_class ? { failure_class: error.failure_class } : {}) } : error ? { error_code: "local_error" } : {}),
    retry, attempts, e2e_ms, json_valid, schema_valid, legacy_shape, normalization_used: !!result?.normalization, proposed, evidence: result?.evidence ? [...result.evidence] : null,
    expected: p.expected, optional: p.optional, ...scoreCell(p, proposed, replayed) };
}

// ------------------------------------------------------------------------------------------------ summary
const pct = (a: number, b: number) => b ? +(100 * a / b).toFixed(1) : null;
export function percentiles(values: readonly number[]) {
  const v = [...values].sort((a, b) => a - b), at = (q: number) => v.length ? Math.round(v[Math.min(v.length - 1, Math.ceil(q * v.length) - 1)]!) : null;
  return { n: v.length, min: v.length ? Math.round(v[0]!) : null, p50: at(0.5), p90: at(0.9), p95: at(0.95), max: v.length ? Math.round(v.at(-1)!) : null };
}
export function aggregate(cells: readonly Cell[]) {
  const ok = cells.filter(c => c.call_ok), sum = (f: (c: Cell) => number, from = ok) => from.reduce((s, c) => s + f(c), 0);
  const expected = sum(c => c.expected.length), proposed = sum(c => c.proposed.length), optionalProposed = sum(c => c.decisions.filter(d => d.class === "optional").length);
  const attempts = cells.flatMap(c => c.attempts), good = attempts.filter(a => a.http_status === 200 && a.content !== undefined);
  const cost = attempts.reduce((s, a) => s + (a.usage?.cost ?? 0), 0);
  return {
    cells: cells.length, calls_ok: ok.length, full_case_success: cells.filter(c => c.state_match).length, full_case_accuracy_pct: pct(cells.filter(c => c.state_match).length, cells.length),
    accuracy_given_output_pct: pct(ok.filter(c => c.state_match).length, ok.length),
    expected_mutations: expected, accepted_tp: sum(c => c.accepted_tp), recall_pct: pct(sum(c => c.accepted_tp), expected),
    proposed: proposed, proposed_tp: sum(c => c.proposed_tp), precision_pct: pct(sum(c => c.proposed_tp), proposed - optionalProposed),
    false_positives: sum(c => c.proposed_fp), accepted_false_positives: sum(c => c.accepted_fp), false_negatives: sum(c => c.fn),
    cases_with_fp: ok.filter(c => c.proposed_fp > 0).length, cases_with_fn: ok.filter(c => c.fn > 0).length,
    authorization_rejections: sum(c => c.rejected), authorization_rejection_rate_pct: pct(sum(c => c.rejected), proposed),
    json_valid: ok.filter(c => c.json_valid).length, schema_valid: ok.filter(c => c.schema_valid).length, legacy_shape: ok.filter(c => c.legacy_shape).length,
    normalization_used: ok.filter(c => c.normalization_used).length, structured_failures: cells.filter(c => c.error_code === "structured_output_invalid").length,
    finish_length_failures: cells.filter(c => c.failure_class === "finish_reason_length").length, rate_limited_calls: cells.filter(c => c.error_code === "rate_limited").length,
    http_attempts: attempts.length, http_200: attempts.filter(a => a.http_status === 200).length, http_429: attempts.filter(a => a.http_status === 429).length,
    http_5xx: attempts.filter(a => (a.http_status ?? 0) >= 500).length, http_other_error: attempts.filter(a => a.http_status !== null && a.http_status !== 200 && a.http_status !== 429 && a.http_status < 500).length,
    in_band_errors: attempts.filter(a => a.http_status === 200 && a.error).length, transport_errors: attempts.filter(a => a.transport_error).length,
    timeouts: cells.filter(c => c.error_code === "timeout").length + cells.filter(c => c.retry?.retry_reasons.includes("timeout")).length,
    retries: cells.reduce((s, c) => s + (c.retry?.retry_reasons.length ?? 0), 0), failed_calls: cells.filter(c => !c.call_ok).map(c => `${c.case_id}#${c.run}:${c.error_code}`),
    rate_limit_details: attempts.filter(a => a.http_status === 429 || a.error?.code === 429).map(a => a.error),
    providers: Object.fromEntries([...new Set(good.map(a => a.provider ?? "?"))].map(p => [p, good.filter(a => (a.provider ?? "?") === p).length])),
    response_models: [...new Set(good.map(a => a.response_model ?? "?"))],
    latency_attempt_ms: percentiles(good.map(a => a.total_ms)), latency_headers_ms: percentiles(good.map(a => a.headers_ms ?? 0)), latency_logical_ms: percentiles(ok.map(c => c.e2e_ms)),
    prompt_tokens: good.reduce((s, a) => s + (a.usage?.prompt_tokens ?? 0), 0), completion_tokens: good.reduce((s, a) => s + (a.usage?.completion_tokens ?? 0), 0),
    reasoning_tokens: good.reduce((s, a) => s + (a.usage?.reasoning_tokens ?? 0), 0), cost_usd: +cost.toFixed(6), cost_reported_attempts: attempts.filter(a => typeof a.usage?.cost === "number").length,
    cost_per_successful_case_usd: ok.length ? +(cost / ok.length).toFixed(7) : null, cost_per_100_turns_usd: ok.length ? +(100 * cost / ok.length).toFixed(4) : null,
  };
}
const GROUP_ORDER = ["items", "ownership", "economy", "relationships", "knowledge", "conditions", "movement_time", "household_legal", "ambiguous_language", "multi_mutation", "no_op"];
export async function summarize(dir: string) {
  const prepared = JSON.parse(await readFile(join(dir, "prepared.json"), "utf8")) as { cases: PreparedCase[] };
  const cells: Cell[] = [];
  for (const f of (await readdir(join(dir, "cells"))).filter(f => f.endsWith(".json"))) cells.push(JSON.parse(await readFile(join(dir, "cells", f), "utf8")));
  const models = [...new Set(cells.map(c => c.model))], runs = [...new Set(cells.map(c => c.run))].sort();
  const per = models.map(model => {
    const mine = cells.filter(c => c.model === model);
    return { model, ...aggregate(mine), per_run: Object.fromEntries(runs.map(r => [r, (({ full_case_accuracy_pct, recall_pct, precision_pct, false_positives, accepted_false_positives, http_429, cells }) => ({ cells, full_case_accuracy_pct, recall_pct, precision_pct, false_positives, accepted_false_positives, http_429 }))(aggregate(mine.filter(c => c.run === r)))])),
      groups: Object.fromEntries(GROUP_ORDER.map(g => { const a = aggregate(mine.filter(c => c.group === g)); return [g, { cells: a.cells, accuracy_pct: a.full_case_accuracy_pct, recall_pct: a.recall_pct, fp: a.false_positives, fn: a.false_negatives }]; })),
      adult_prose: (({ cells, full_case_accuracy_pct, false_positives, structured_failures }) => ({ cells, full_case_accuracy_pct, false_positives, structured_failures }))(aggregate(mine.filter(c => c.adult_prose))),
      unstable_cases: prepared.cases.filter(p => new Set(mine.filter(c => c.case_id === p.id && c.call_ok).map(c => c.state_match)).size > 1).map(p => p.id) };
  });
  const brief = (c: Cell | undefined) => !c ? "missing" : !c.call_ok ? `call failed: ${c.error_code}` : c.decisions.length ? c.decisions.map(d => `${d.authorized ? "ACCEPTED" : `REJECTED(${d.reason})`} ${JSON.stringify(d.command)}`).join(" | ") : "no commands";
  const disagreements = prepared.cases.flatMap(p => {
    const outcomes = models.map(m => cells.filter(c => c.model === m && c.case_id === p.id));
    const verdicts = outcomes.map(list => list.map(c => c.state_match));
    if (new Set(verdicts.flat()).size <= 1) return [];
    return [{ case_id: p.id, group: p.group, expected: p.expected, optional: p.optional, per_model: Object.fromEntries(models.map((m, i) => [m, outcomes[i]!.map(c => ({ run: c.run, state_match: c.state_match, result: brief(c) }))])) }];
  });
  const summary = { analyzed_at: new Date().toISOString(), cases: prepared.cases.length, runs, models, results: per, disagreements };
  await writeFile(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  const csv = ["model,case_id,run,group,call_ok,error_code,state_match,expected,proposed,proposed_tp,proposed_fp,accepted_tp,accepted_fp,rejected,fn,json_valid,schema_valid,normalization,attempts,http_statuses,provider,e2e_ms,prompt_tokens,completion_tokens,cost_usd",
    ...cells.map(c => { const last = c.attempts.filter(a => a.http_status === 200).at(-1); return [c.model, c.case_id, c.run, c.group, c.call_ok, c.error_code ?? "", c.state_match, c.expected.length, c.proposed.length, c.proposed_tp, c.proposed_fp, c.accepted_tp, c.accepted_fp, c.rejected, c.fn, c.json_valid, c.schema_valid, c.normalization_used, c.attempts.length, c.attempts.map(a => a.http_status ?? a.transport_error).join("|"), last?.provider ?? "", Math.round(c.e2e_ms), last?.usage?.prompt_tokens ?? "", last?.usage?.completion_tokens ?? "", c.attempts.reduce((s, a) => s + (a.usage?.cost ?? 0), 0)].join(","); })];
  await writeFile(join(dir, "cells.csv"), csv.join("\n") + "\n");
  const row = (r: (typeof per)[number]) => `| ${r.model} | ${r.full_case_accuracy_pct}% | ${r.accuracy_given_output_pct}% | ${r.recall_pct}% | ${r.precision_pct}% | ${r.false_positives} (${r.accepted_false_positives} accepted) | ${r.false_negatives} | ${r.authorization_rejection_rate_pct}% | ${r.structured_failures + r.finish_length_failures} | ${r.http_429} | ${r.cells - r.calls_ok - r.structured_failures - r.finish_length_failures - r.rate_limited_calls} failed / ${r.timeouts} timeout | ${r.latency_logical_ms.p50} | ${r.latency_logical_ms.p95} | $${r.cost_per_100_turns_usd} |`;
  const md = [`# Controller benchmark summary`, ``, `${prepared.cases.length} cases × runs ${runs.join(",")} × ${models.length} models.`, ``,
    `| Model | Full-case accuracy | Accuracy given output | Recall | Precision | FP | FN | Auth rejects | JSON/schema/length fail | HTTP 429 attempts | Other failures | p50 ms | p95 ms | Cost / 100 turns |`, `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`, ...per.map(row), ``,
    `## Category accuracy (state match %)`, ``, `| Model | ${GROUP_ORDER.join(" | ")} |`, `|---|${GROUP_ORDER.map(() => "---:").join("|")}|`, ...per.map(r => `| ${r.model} | ${GROUP_ORDER.map(g => `${r.groups[g]!.accuracy_pct}`).join(" | ")} |`), ``,
    `## Disagreements (${disagreements.length})`, ``, ...disagreements.map(d => `- **${d.case_id}** (${d.group}) expected ${JSON.stringify(d.expected)}\n${Object.entries(d.per_model).map(([m, list]) => `  - ${m}: ${list.map(x => `run ${x.run} ${x.state_match ? "✓" : "✗"} ${x.result}`).join(" ; ")}`).join("\n")}`)].join("\n");
  await writeFile(join(dir, "summary.md"), md + "\n");
  return summary;
}

// ------------------------------------------------------------------------------------------------ CLI
async function main(argv: readonly string[]) {
  const [command, ...rest] = argv, flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const dir = flag("--out") ?? "saves/controller-benchmark/default", runs = Number(flag("--runs") ?? 1), subset = flag("--cases")?.split(",");
  const models = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));
  if (command === "prepare") {
    await mkdir(join(dir, "cells"), { recursive: true });
    const cases: PreparedCase[] = [], failures: string[] = [];
    for (const c of BENCHMARK_CASES) { try { cases.push(await prepareCase(c)); } catch (error) { failures.push((error as Error).message); } }
    if (failures.length) throw new Error(`Gold validation failed for ${failures.length} case(s):\n${failures.join("\n")}`);
    if (!await staleRevisionInvariant()) throw new Error("Stale-revision invariant failed");
    const counts = Object.fromEntries(GROUP_ORDER.map(g => [g, cases.filter(c => c.group === g).length]));
    await writeFile(join(dir, "prepared.json"), JSON.stringify({ prepared_at: new Date().toISOString(), policy_sha256: sha256(CONTROLLER_POLICY), schema_sha256: sha256(CONTROLLER_EVIDENCE_SCHEMA), stale_revision_invariant: true, groups: counts, cases }, null, 2));
    console.log(JSON.stringify({ cases: cases.length, groups: counts, expected_mutations: cases.reduce((s, c) => s + c.expected.length, 0), abstention_cases: cases.filter(c => !c.expected.length).length,
      engine_supplied: cases.filter(c => c.engine_supplied.length).map(c => c.id), adult_prose: cases.filter(c => c.adult_prose).length }, null, 2));
  } else if (command === "run") {
    if (!models.length) throw new Error("Name at least one OpenRouter model");
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      const { exactBenchmarkCredential } = await import("./reflection-benchmark.js");
      process.env.OPENROUTER_API_KEY = exactBenchmarkCredential({ fileText: await readFile("APIKEY.env", "utf8") });
    }
    const prepared = JSON.parse(await readFile(join(dir, "prepared.json"), "utf8")) as { policy_sha256: string; schema_sha256: string; cases: PreparedCase[] };
    if (prepared.policy_sha256 !== sha256(CONTROLLER_POLICY) || prepared.schema_sha256 !== sha256(CONTROLLER_EVIDENCE_SCHEMA)) throw new Error("Controller contract changed after freezing");
    const cases = BENCHMARK_CASES.filter(c => !subset || subset.includes(c.id));
    for (let run = 1; run <= runs; run++) for (const [index, c] of cases.entries()) {
      // Sequential; the model order rotates per case and run so time-of-day and ordering effects are shared.
      const order = models.map((_, i) => models[(i + index + run) % models.length]!);
      for (const model of order) {
        const path = join(dir, "cells", `${model.replace(/[^A-Za-z0-9.-]+/g, "_")}__${c.id}__r${run}.json`);
        try { await readFile(path); continue; } catch { /* not yet run */ }
        const cell = await liveCell(model, c, prepared.cases.find(p => p.id === c.id)!, run);
        await writeFile(path, JSON.stringify(cell, null, 2), { flag: "wx" });
        console.log(`${c.id} r${run} ${model}: ${cell.call_ok ? `${cell.state_match ? "MATCH" : "MISMATCH"} tp=${cell.accepted_tp} fp=${cell.proposed_fp} fn=${cell.fn}` : `FAILED ${cell.error_code}`} attempts=${cell.attempts.map(a => a.http_status ?? a.transport_error).join("/")} ${Math.round(cell.e2e_ms)}ms`);
      }
    }
    await summarize(dir);
  } else if (command === "rescore") {
    // Offline: re-replays every stored proposal through the current engine/scoring code. No provider calls.
    const prepared = JSON.parse(await readFile(join(dir, "prepared.json"), "utf8")) as { cases: PreparedCase[] };
    let changed = 0;
    for (const f of (await readdir(join(dir, "cells"))).filter(f => f.endsWith(".json"))) {
      const cell = JSON.parse(await readFile(join(dir, "cells", f), "utf8")) as Cell, c = BENCHMARK_CASES.find(x => x.id === cell.case_id)!, p = prepared.cases.find(x => x.id === cell.case_id)!;
      const replayed = cell.call_ok ? await replay(c, { ...metadata, commands: cell.proposed, ...(cell.evidence ? { evidence: cell.evidence } : {}) }) : null;
      const next = { ...cell, ...scoreCell(p, cell.proposed, replayed) };
      if (next.state_match !== cell.state_match) { changed++; console.log(`rescored ${f}: ${cell.state_match} -> ${next.state_match}`); }
      await writeFile(join(dir, "cells", f), JSON.stringify(next, null, 2));
    }
    console.log(`rescored; ${changed} verdict(s) changed`);
    await summarize(dir);
  } else if (command === "summarize") {
    const s = await summarize(dir);
    console.log(JSON.stringify(s.results.map(({ groups, per_run, unstable_cases, rate_limit_details, failed_calls, ...r }) => r), null, 2));
  } else throw new Error("Usage: benchmark:controller -- prepare|run|summarize [--out DIR] [--runs N] [--cases a,b] [models...]");
}
if (process.argv[1] && /controller-benchmark\.js$/.test(process.argv[1])) await main(process.argv.slice(2));
