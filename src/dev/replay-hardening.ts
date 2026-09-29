import { readFile, writeFile } from "node:fs/promises";
import { turnFixture } from "./turn-fixture.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { TurnResult } from "../turn/turn-types.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { checkNarrative } from "./narrative-checks.js";
import { buildTurnContext } from "../turn/context-builder.js";

const path = process.argv[2];
if (!path) throw new Error("Supply a recorded evaluation JSON; this replay makes no network requests");
const source = JSON.parse(await readFile(path, "utf8")) as { records: { id: string; source_row?: number; input: string; narration: string; outcome: { type: string; result?: TurnResult } }[] };
const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
const fixtures = source.records.filter(r => r.outcome.type === "turn_completed").map(r => ({ id: r.id, ground: r.source_row === 115, input: r.input, narration: r.narration, commands: r.outcome.result!.controller_proposal, origin: "recorded_live_response", retrieval_ids: r.outcome.result!.retrieval.ids }));
for (const [id, narration] of [["explicit_knowledge", "Brenna reacts after hearing that the eastern bridge is closed."], ["emotional_only", "Brenna looks worried."]]) fixtures.push({ id: id!, ground: false, input: "/tell campaign_fact_bridge_closed to brenna", narration: narration!, commands: [knowledge], origin: "offline_control", retrieval_ids: [] });
const records = [];
for (const fixture of fixtures) {
  const { world, campaign } = turnFixture(fixture.ground), service = new RetrievalService(world);
  const metadata = { model: "offline-recorded-evidence", usage: {}, latency: { request_started_at: "offline", headers_ms: null, time_to_first_token_ms: null, completed_at: "offline", elapsed_total_ms: 0 } };
  const context = buildTurnContext(world, campaign.exportSnapshot());
  const coordinator = new TurnCoordinator(world, {
    async generate() { return { text: fixture.narration, ...metadata }; },
    async *stream() { yield { type: "text_delta", text: fixture.narration }; yield { type: "completed", result: { text: fixture.narration, ...metadata } }; },
  }, { async propose() { return { commands: fixture.commands, ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events = [];
  for await (const event of coordinator.runTurn({ campaign, player_input: fixture.input })) events.push(event);
  records.push({ ...fixture, outcome: events.at(-1), qualitative_findings: checkNarrative(fixture.narration, fixture.input, context, fixture.retrieval_ids, true), committed_state: { revision: campaign.revision, items: campaign.exportSnapshot().items, knowledge: campaign.exportSnapshot().knowledge.filter(k => k.fact_id !== "campaign_fact_private_secret") } });
}
const output = `docs/evaluations/phase-1l1-replay-${Date.now()}.json`;
await writeFile(output, JSON.stringify({ online_paid: false, source_report: path, purpose: "Final deterministic grammar replay of recorded live text/proposals; not a new provider evaluation or latency sample", records }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, records: records.map(r => ({ id: r.id, outcome: r.outcome?.type, authorized: r.outcome?.type === "turn_completed" ? r.outcome.result.authorized_commands.length : null })) }));
