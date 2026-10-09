import { withHistoricalContext } from "./historical-context.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { buildTurnContext } from "../turn/context-builder.js";
import { checkNarrative } from "./narrative-checks.js";
import type { GenerationRequest } from "../llm/types.js";
import { turnFixture } from "./turn-fixture.js";
import { onlineCoordinator, selectedModels } from "./turn-services.js";
import type { SourcePair } from "./playthrough-csv.js";
import type { CuratedLabel } from "./playthrough-manifest.js";
import type { TurnEvent } from "../turn/turn-types.js";
import type { CampaignCommand } from "../campaign/types.js";

const narrative = process.argv.includes("--narrative");
const history = JSON.parse(await readFile("tests/playthrough/historical-windows.json", "utf8")) as Record<string, { source_player_record: number; source_assistant_record: number; player_message: string; assistant_response: string }[]>;
const smoke = process.argv.includes("--smoke");
const corpus = JSON.parse(await readFile("tests/playthrough/curated.json", "utf8")) as { fixtures: (CuratedLabel & SourcePair)[] };
const defaultRows = [3, 11, 25, 35, 39, 43, 47, 53, 115, 169, 173, 509];
const countFlag = process.argv.indexOf("--count"), count = countFlag < 0 ? 12 : Number(process.argv[countFlag + 1]);
if (!Number.isSafeInteger(count) || count < 1 || count > corpus.fixtures.length) throw new Error("Explicit count must be 1..24; full source corpus replay is unsupported");
const handover: CampaignCommand = { kind: "transfer_item", mode: "handoff", item_id: "boots",  position: { kind: "carried", character_id: "brenna" } };
const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
type EvalCase = { id: string; input: string; expected: readonly CampaignCommand[]; source_row?: number };
const cases: EvalCase[] = smoke ? [
  { id: "dialogue", input: "Hello, Brenna. How are you feeling?", expected: [] },
  { id: "handover", input: "I give boots to Brenna.", expected: [handover] },
  { id: "knowledge", input: "/tell campaign_fact_bridge_closed to brenna", expected: [knowledge] },
  { id: "lore", input: "What do I know about Ironbound?", expected: [] },
  { id: "explicit_time", input: "/wait 1", expected: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] },
] : narrative ? [...[43, 53, 25, 115, 169, 173, 591].map(row => corpus.fixtures.find(f => f.row === row)!).map(f => ({ id: String(f.row), source_row: f.row, input: f.player_message, expected: f.expected })), { id: "lore", input: "What do I know about Ironbound?", expected: [] }] : [...defaultRows.map(row => corpus.fixtures.find(f => f.row === row)!), ...corpus.fixtures.filter(f => !defaultRows.includes(f.row))].slice(0, count).map(f => ({ id: String(f.row), source_row: f.row, input: f.player_message, expected: f.expected }));
const banner = { phase: "1L.1", evaluation_mode: narrative ? "narrative_continuity" : "state_fixture", historical_context_policy: "evaluation-only narrator input, never controller evidence", fixture_115_grounding: "Only Brenna present; pink cotton shirt, pink fluffy shirt, pink shorts explicitly named. Original labels/input unchanged; Phase 1L fixture lacked these reference grounds.", online_paid: true, models: selectedModels(), started_at: new Date().toISOString(), cases: cases.length, corpus: smoke ? "synthetic smoke" : "historical pairs recontextualized in isolated synthetic state", label_review: "agent_authored_pending_human_review" };
console.log(JSON.stringify(banner));
const records = [];
for (const fixture of cases) {
  const { world, campaign } = turnFixture(fixture.source_row === 115);
  const context = buildTurnContext(world, campaign.exportSnapshot());
  const window = narrative ? history[String(fixture.source_row ?? 53)] ?? [] : [];
  let narratorRequest: GenerationRequest | undefined;
  const coordinator = await onlineCoordinator(world, false, provider => {
    const decorate = (request: GenerationRequest): GenerationRequest => {
      const decorated = withHistoricalContext(request, window);
      narratorRequest = decorated; return decorated;
    };
    return { generate: request => provider.generate(decorate(request)), stream: request => provider.stream(decorate(request)) };
  });
  const events: TurnEvent[] = [];
  for await (const event of coordinator.runTurn({ campaign, player_input: fixture.input })) events.push(event);
  const last = events.at(-1)!, result = last.type === "turn_completed" ? last.result : undefined;
  const actual = result?.authorized_commands ?? [];
  const tp = fixture.expected.filter(e => actual.some(c => isDeepStrictEqual(c, e))).length;
  const fp = actual.filter(c => !fixture.expected.some(e => isDeepStrictEqual(c, e))).length;
  const fn = fixture.expected.filter(e => !actual.some(c => isDeepStrictEqual(c, e))).length;
  const narration = events.filter(e => e.type === "narration_delta").map(e => e.text).join("");
  const findings = checkNarrative(narration, fixture.input, context, result?.retrieval.ids ?? [], true);
  const correctRejected = result?.authorization.filter(d => !d.authorized && fixture.expected.some(e => isDeepStrictEqual(e, d.command))) ?? [];
  const controllerOmitted = fixture.expected.filter(e => e.kind !== "runtime_delta" && !result?.controller_proposal.some(c => isDeepStrictEqual(c, e)));
  const record = { ...fixture, historical_window: window, narrator_prompt: narratorRequest && { system_prompt: narratorRequest.system_prompt, messages: narratorRequest.messages },
    qualitative_findings: findings, controller_correct_authorizer_rejected: correctRejected, controller_omitted_expected: controllerOmitted,
    controller_incorrect: result?.controller_proposal.filter(c => !fixture.expected.some(e => isDeepStrictEqual(e, c))) ?? [], narration_completed: events.some(e => e.type === "narration_completed"), finalized: !!result,
    controller_proposal_valid: !!result || events.some(e => e.type === "state_proposed"), player_agency: "pending_manual_review", narrative_quality: "pending_manual_review", true_positive_commands: tp, false_positive_commands: fp, false_negative_commands: fn,
    outcome: last, narration: events.filter(e => e.type === "narration_delta").map(e => e.text).join(""),
    final_state: { revision: campaign.revision, runtime: campaign.exportSnapshot().runtime, items: campaign.exportSnapshot().items.map(i => ({ id: i.id, owner_id: i.owner_id, position: i.position })), knowledge: campaign.exportSnapshot().knowledge.filter(k => k.fact_id !== "campaign_fact_private_secret") } };
  records.push(record);
  console.log(JSON.stringify({ case: fixture.id, finalized: !!result, tp, fp, fn, latency: result?.latency, ...(last.type === "turn_failed" ? { failure: last.code, provider_code: last.provider_code } : {}) }));
}
const median = (numbers: number[]) => { numbers.sort((a, b) => a - b); return numbers.length ? (numbers[Math.floor((numbers.length - 1) / 2)]! + numbers[Math.floor(numbers.length / 2)]!) / 2 : null; };
const successes = records.flatMap(r => r.outcome.type === "turn_completed" ? [r.outcome.result] : []);
const tp = records.reduce((n, r) => n + r.true_positive_commands, 0), fp = records.reduce((n, r) => n + r.false_positive_commands, 0), fn = records.reduce((n, r) => n + r.false_negative_commands, 0);
const summary = { state_metrics_applicable: !narrative, qualitative_findings: records.flatMap(r => r.qualitative_findings), controller_correct_authorizer_rejected: records.reduce((n,r) => n + r.controller_correct_authorizer_rejected.length, 0), controller_omitted_expected: records.reduce((n,r) => n + r.controller_omitted_expected.length, 0), evaluated: records.length, finalized: successes.length, failed_turns: records.length - successes.length, true_positive_commands: narrative ? null : tp, false_positive_commands: narrative ? null : fp, false_negative_commands: narrative ? null : fn,
  precision: !narrative && tp + fp ? tp / (tp + fp) : null, recall: !narrative && tp + fn ? tp / (tp + fn) : null, player_agency_failures: "pending_manual_review",
  median_ttft_ms: median(successes.flatMap(r => r.latency.narrator_ttft_ms === null ? [] : [r.latency.narrator_ttft_ms])),
  median_narrator_ms: median(successes.map(r => r.latency.narrator_total_ms)), median_controller_tail_ms: median(successes.map(r => r.latency.controller_tail_ms)), median_turn_ms: median(successes.map(r => r.latency.coordinator_total_ms)),
  measured_successful_request_tokens: successes.reduce((n, r) => ({ prompt: n.prompt + (r.narrator.usage.prompt_tokens ?? 0) + (r.controller.usage.prompt_tokens ?? 0), completion: n.completion + (r.narrator.usage.completion_tokens ?? 0) + (r.controller.usage.completion_tokens ?? 0) }), { prompt: 0, completion: 0 }) };
await mkdir("docs/evaluations", { recursive: true });
const output = `docs/evaluations/phase-1l1-${smoke ? "smoke" : narrative ? "narrative" : `state-${count}`}-${Date.now()}.json`;
await writeFile(output, JSON.stringify({ ...banner, completed_at: new Date().toISOString(), summary, records }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, summary }));
if (summary.failed_turns || fp) process.exitCode = 1;
