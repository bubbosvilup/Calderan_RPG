import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { DEFAULT_RETRY_POLICY, NO_RETRY_POLICY, type ProviderRetryPolicy } from "../llm/retry.js";
import { NARRATOR_PROVIDER_ROUTING } from "../llm/openrouter/minimax-narrator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { TurnEvent } from "../turn/turn-types.js";
import { aggregate, renderMarkdown, type EvalRecord } from "./diagnostics-aggregate.js";
import { buildScenario, FIXTURE_SECRET, LIVE_SCENARIOS, type LiveScenario } from "./live-eval-scenarios.js";
import { NARRATOR_OUTPUT_TOKENS, onlineCoordinator, selectedModels } from "./turn-services.js";

/**
 * Hardening H5 — bounded live evaluation. Paid provider calls happen ONLY here, only with an API key present, and only up to the caps
 * below. `--dry` runs the identical harness against scripted offline providers (no network) to validate the machinery.
 *
 *   node .build/src/dev/eval-live-h5.js --runs 5 [--scenarios A_conversation,E_handover] [--no-retry] [--semantic] [--dry]
 *        [--max-turns 120] [--max-tokens 600000] [--price-narrator-in … --price-narrator-out … --price-controller-in … --price-controller-out …] [--budget-usd 3]
 *        [--out docs/evaluations/h5-live/<label>.jsonl]
 *
 * Output: one JSONL header line (reproducibility: date, models, routing, reasoning, token caps, retry policy), then one line per turn:
 * { scenario_id, run, turn_index, diagnostics, checks }. No prompts, no full narration (only a ≤400-character excerpt of a FLAGGED turn
 * for HUMAN REVIEW), no canon text, no credentials. Exit code 3 = BLOCKED (no key).
 */
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const has = (name: string) => args.includes(name);
const dry = has("--dry"), runs = Number(flag("--runs") ?? 5), semantic = has("--semantic"), noRetry = has("--no-retry");
const label = flag("--label") ?? (dry ? "dry" : "live");
const out = flag("--out") ?? `docs/evaluations/h5-live/${label}-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
const maxTurns = Number(flag("--max-turns") ?? 120), maxTokens = Number(flag("--max-tokens") ?? 600_000), budgetUsd = flag("--budget-usd") === undefined ? undefined : Number(flag("--budget-usd"));
const num = (name: string) => { const v = flag(name); return v === undefined ? undefined : Number(v); };
const prices = { narrator_input: num("--price-narrator-in"), narrator_output: num("--price-narrator-out"), controller_input: num("--price-controller-in"), controller_output: num("--price-controller-out") };
const priced = Object.values(prices).every(v => v !== undefined);
const selected = flag("--scenarios")?.split(",") ?? LIVE_SCENARIOS.map(s => s.id);
const scenarios = selected.map(id => LIVE_SCENARIOS.find(s => s.id === id) ?? (() => { throw new Error(`unknown scenario ${id}`); })());
if (!Number.isSafeInteger(runs) || runs < 1 || runs > 50) throw new Error("--runs must be 1..50");
const plannedTurns = scenarios.reduce((n, s) => n + s.turns.length, 0) * runs;
if (!dry && !process.env.OPENROUTER_API_KEY?.trim()) { console.error(JSON.stringify({ status: "BLOCKED", reason: "OPENROUTER_API_KEY is not set; no live provider call was made", planned_turns: plannedTurns })); process.exit(3); }
if (!dry && semantic && !process.env.VOYAGE_API_KEY?.trim() && !process.env.CALDREVAN_EMBEDDING_ADAPTER) { console.error(JSON.stringify({ status: "BLOCKED", reason: "--semantic needs VOYAGE_API_KEY (or an embedding adapter)" })); process.exit(3); }
if (plannedTurns > maxTurns) { console.error(JSON.stringify({ status: "REFUSED", reason: `planned ${plannedTurns} turns exceeds --max-turns ${maxTurns}; raise it explicitly or reduce --runs/--scenarios`, planned_turns: plannedTurns })); process.exit(2); }

const retryPolicy: ProviderRetryPolicy = noRetry ? NO_RETRY_POLICY : DEFAULT_RETRY_POLICY;
const models = selectedModels();
const header = { kind: "header", label, dry, date: new Date().toISOString(), models, narrator_provider_routing: NARRATOR_PROVIDER_ROUTING[models.narrator] ?? "openrouter default",
  narrator_reasoning: "disabled", narrator_max_output_tokens: NARRATOR_OUTPUT_TOKENS, controller_max_output_tokens: 512, temperature: "provider default (not set by the engine)",
  retry: noRetry ? "disabled" : { max_attempts: retryPolicy.max_attempts, backoff_ms: [retryPolicy.backoff_ms, retryPolicy.max_backoff_ms], turn_budget_ms: retryPolicy.turn_budget_ms, min_retry_window_ms: retryPolicy.min_retry_window_ms },
  semantic_retrieval: semantic, runs, scenarios: scenarios.map(s => s.id), planned_turns: plannedTurns, caps: { max_turns: maxTurns, max_tokens: maxTokens, budget_usd: budgetUsd ?? null } };
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(header) + "\n");

const AGENCY = /\bNicco\s+(?:\w+ly\s+)?(?:agrees|accepts|nods|follows|attacks|answers|replies|thinks|feels|decides|smiles|says|speaks|whispers|steps|draws|grabs|reaches|takes|refuses|hesitates|shrugs|laughs|sighs)\b/i;
interface Checks { unexpected_commit_kinds: string[]; secret_sentinel_in_narration: boolean; nicco_agency_candidate: boolean; review_excerpt?: string }
function check(s: LiveScenario, events: readonly TurnEvent[]): Checks {
  const done = events.at(-1), narration = events.filter(e => e.type === "narration_completed").map(e => e.type === "narration_completed" ? e.text : "").join(" ");
  const kinds = done?.type === "turn_completed" ? done.result.authorized_commands.map(c => c.kind) : [];
  const unexpected = [...new Set(kinds.filter(k => !s.allowed_commit_kinds.includes(k)))];
  const secret = narration.includes(FIXTURE_SECRET), agency = AGENCY.test(narration);
  return { unexpected_commit_kinds: unexpected, secret_sentinel_in_narration: secret, nicco_agency_candidate: agency, ...(unexpected.length || secret || agency || s.human_review ? { review_excerpt: narration.slice(0, 400) } : {}) };
}
async function coordinatorFor(world: ConstructorParameters<typeof RetrievalService>[0], sink: (d: TurnDiagnostics) => void): Promise<TurnCoordinator> {
  if (!dry) return onlineCoordinator(world, semantic, p => p, { narrator_client: new OpenRouterClient(), controller_client: new OpenRouterClient(), diagnostics_sink: r => sink(structuredClone(r) as TurnDiagnostics), provider_retry: retryPolicy });
  const service = new RetrievalService(world), meta = { model: "dry-offline", usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }, latency: { request_started_at: new Date().toISOString(), headers_ms: 1, time_to_first_token_ms: 1, completed_at: new Date().toISOString(), elapsed_total_ms: 2 } };
  const text = "The room is quiet. Brenna glances up, then back to her hands.";
  return new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...meta } }; } },
    { async propose() { return { commands: [], ...meta }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: r => sink(structuredClone(r) as TurnDiagnostics), provider_retry: retryPolicy });
}

const records: EvalRecord[] = [];
let spentTokens = 0, spentUsd = 0, stopped: string | undefined, executed = 0;
const stoppedBy = () => spentTokens >= maxTokens ? `max-tokens ${maxTokens}` : budgetUsd !== undefined && priced && spentUsd >= budgetUsd ? `budget-usd ${budgetUsd}` : undefined;
outer: for (let run = 1; run <= runs; run++) for (const scenario of scenarios) {
  const { world, campaign } = await buildScenario(scenario, run);
  const captured: TurnDiagnostics[] = [];
  const coordinator = await coordinatorFor(world, d => { captured.push(d); });
  for (const [turn_index, input] of scenario.turns.entries()) {
    if ((stopped = stoppedBy())) break outer;
    captured.length = 0;
    const events: TurnEvent[] = [];
    for await (const event of coordinator.runTurn({ campaign, player_input: input })) events.push(event);
    const current = captured.at(-1);
    if (!current) throw new Error("diagnostics sink was not called");
    executed++;
    const u = [current.narrator?.usage, current.revision_narrator?.usage], c = current.controller?.usage;
    const np = u.reduce((n, x) => n + (x?.prompt_tokens ?? 0), 0), nc = u.reduce((n, x) => n + (x?.completion_tokens ?? 0), 0), cp = c?.prompt_tokens ?? 0, cc = c?.completion_tokens ?? 0;
    spentTokens += np + nc + cp + cc;
    if (priced) spentUsd += (np * prices.narrator_input! + nc * prices.narrator_output! + cp * prices.controller_input! + cc * prices.controller_output!) / 1e6;
    const record = { scenario_id: scenario.id, run, turn_index, diagnostics: current, checks: check(scenario, events) };
    records.push({ scenario_id: scenario.id, run, diagnostics: current });
    await appendFile(out, JSON.stringify(record) + "\n");
    if (events.at(-1)?.type === "turn_failed") break; // the scenario's later turns would be built on a failed premise
  }
}
const summary = aggregate(records, priced ? prices : {});
const summaryPath = out.replace(/\.jsonl$/, ".summary.md");
await writeFile(summaryPath, renderMarkdown(summary));
console.log(JSON.stringify({ status: stopped ? "STOPPED_BY_BUDGET" : "OK", stopped_by: stopped ?? null, out, summary: summaryPath, executed_turns: executed, planned_turns: plannedTurns, tokens: spentTokens, usd: priced ? spentUsd : null }));
