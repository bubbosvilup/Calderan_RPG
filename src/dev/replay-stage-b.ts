import { readFile, writeFile } from "node:fs/promises";
import { turnFixture } from "./turn-fixture.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { buildTurnContext } from "../turn/context-builder.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { TurnEvent } from "../turn/turn-types.js";
import { diagnoseStageB } from "./narrator-bakeoff.js";

/**
 * Offline: replays recorded Phase 1M Stage B narration + recorded DeepSeek proposals through the current TurnEvidence
 * grammar and authorizer. Isolates grammar changes from prompt/fixture/model changes. No network, no new prose.
 */
const path = process.argv[2];
if (!path) throw new Error("Supply a Phase 1M Stage B export (docs/evaluations/phase-1m-stage-b-*.json)");
const source = JSON.parse(await readFile(path, "utf8")) as { records: { key: string; alias: string; input: string; expected: CampaignCommand[]; narration: string; controller_proposal: CampaignCommand[] | null; case_id: string; per_expected: { diagnosis: string }[] }[] };
const records: { key: string; alias: string; case_id: string; before: string[]; after: string[]; true_positive: number; false_positive_durable: readonly CampaignCommand[]; turn_evidence: unknown; revision: number }[] = [];
for (const r of source.records.filter(r => r.controller_proposal)) {
  const { world, campaign } = turnFixture(r.case_id === "r115"), service = new RetrievalService(world);
  const before = campaign.exportSnapshot(), context = buildTurnContext(world, before);
  const metadata = { model: "offline-recorded-evidence", usage: {}, latency: { request_started_at: "offline", headers_ms: null, time_to_first_token_ms: null, completed_at: "offline", elapsed_total_ms: 0 } };
  const coordinator = new TurnCoordinator(world, {
    async generate() { return { text: r.narration, ...metadata }; },
    async *stream() { yield { type: "text_delta", text: r.narration }; yield { type: "completed", result: { text: r.narration, ...metadata } }; },
  }, { async propose() { return { commands: r.controller_proposal!, ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events: TurnEvent[] = [];
  for await (const event of coordinator.runTurn({ campaign, player_input: r.input })) events.push(event);
  const last = events.at(-1)!, result = last.type === "turn_completed" ? last.result : undefined;
  const diagnosis = diagnoseStageB(r.expected, result, context, before);
  records.push({ key: r.key, alias: r.alias, case_id: r.case_id, before: r.per_expected.map(p => p.diagnosis), after: diagnosis.per_expected.map(p => p.diagnosis + ("authorizer_reason" in p ? `:${p.authorizer_reason}` : "")),
    true_positive: diagnosis.true_positive, false_positive_durable: diagnosis.false_positive_durable, turn_evidence: result?.turn_evidence ?? null, revision: campaign.revision });
}
const output = `docs/evaluations/phase-1m1-grammar-replay-${Date.now()}.json`;
await writeFile(output, JSON.stringify({ online_paid: false, source_report: path, purpose: "Recorded Phase 1M Stage B narration and DeepSeek proposals replayed through the Phase 1M.1 TurnEvidence grammar; not a new provider sample", records }, null, 2) + "\n", { flag: "wx" });
const sum = (alias: string, k: "before" | "after") => records.filter(r => r.alias === alias).flatMap(r => r[k]).filter(d => d.startsWith("true_positive")).length;
console.log(JSON.stringify({ output, tp_before_after: Object.fromEntries(["kimi", "qwen", "minimax"].map(a => [a, [sum(a, "before"), sum(a, "after")]])), false_positive_durable: records.reduce((n, r) => n + r.false_positive_durable.length, 0) }));
for (const r of records.filter(r => ["r115", "knowledge_tell"].includes(r.case_id))) console.log(r.key, r.alias, JSON.stringify(r.after), "rev", r.revision);
