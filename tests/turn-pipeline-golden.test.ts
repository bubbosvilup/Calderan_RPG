import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { WorldStore } from "../src/world/world-store.js";
import { TurnCoordinator, type TurnDebugRecord } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { ProviderError } from "../src/llm/errors.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { metadata } from "./turn-fixtures.js";

/**
 * Hardening H2: golden end-to-end pipeline characterization. Generated from the PRE-H2 TurnCoordinator and pinned, so any stage
 * reordering, extra/missing preparation, changed prompt, changed controller request, changed audit/reconciliation path, changed
 * commit count or changed TurnResult is a visible diff. Volatile wall-clock timings are normalized to 0; everything else is exact.
 * Regenerate only deliberately: H2_UPDATE_GOLDEN=1 npm test (and justify the diff in review).
 */
const GOLDEN = "tests/golden/turn-pipeline.json";
const world = await loadWorld("data");

interface Script { readonly narrations: readonly string[]; readonly commands?: readonly CampaignCommand[]; readonly controllerError?: unknown;
  readonly duringNarrator?: (call: number) => void; readonly duringController?: () => void; readonly duringRetrieval?: () => void }
async function traced(w: WorldStore, campaign: CampaignState, input: string, script: Script) {
  const trace: unknown[] = [];
  const prepare = campaign.prepare.bind(campaign), commit = campaign.commit.bind(campaign);
  campaign.prepare = (p: unknown) => { const r = prepare(p); trace.push({ op: "prepare", kinds: (p as { commands: CampaignCommand[] }).commands.map(c => c.kind), changed: r.changed }); return r; };
  campaign.commit = (r: unknown) => { const out = commit(r); trace.push({ op: "commit", revision: out.revision, changed: out.changed }); return out; };
  const service = new RetrievalService(w), search = new HybridSearch(service);
  const retrieval = {
    service: { get: (...a: Parameters<RetrievalService["get"]>) => { trace.push({ op: "retrieval.get", ref: a[0] }); return service.get(...a); } },
    search: { searchWithDiagnostics: async (...a: Parameters<HybridSearch["searchWithDiagnostics"]>) => { trace.push({ op: "retrieval.search", query: (a[0] as { query?: string }).query }); script.duringRetrieval?.(); return search.searchWithDiagnostics(...a); } },
  };
  let call = 0;
  const narrator = { async generate(): Promise<never> { throw new Error("unused"); },
    async *stream(request: GenerationRequest) {
      const n = call++; trace.push({ op: "narrator.stream", call: n, system_prompt: request.system_prompt, messages: request.messages });
      script.duringNarrator?.(n);
      const text = script.narrations[Math.min(n, script.narrations.length - 1)]!;
      yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } };
    } };
  const controller = { async propose(r: { player_action: string; prior_state: string; final_narration: string }) {
    trace.push({ op: "controller.propose", player_action: r.player_action, prior_state: JSON.parse(r.prior_state), final_narration: r.final_narration });
    script.duringController?.();
    if (script.controllerError) throw script.controllerError;
    return { commands: [...(script.commands ?? [])], ...metadata };
  } };
  const debug: TurnDebugRecord[] = [];
  const co = new TurnCoordinator(w, narrator, controller, retrieval as never, { debug_sink: r => debug.push(r), provider_retry: false }); // The golden pins the single-attempt pre-H2 trace; retry traces live in provider-retry-h5.test.ts.
  const events: TurnEvent[] = [];
  for await (const e of co.runTurn({ campaign, player_input: input })) { events.push(e); trace.push({ op: "event", type: e.type }); }
  return { trace, events, debug, recent: co.recent(campaign).entries(), final_revision: campaign.revision };
}
const VOLATILE = new Set(["coordinator_total_ms", "controller_tail_ms", "elapsed_ms", "retrieval_ms"]);
const normalize = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (k, v) => VOLATILE.has(k) && typeof v === "number" ? 0 : v));

const SQUARE = OPENING_LOCATION, M = "campaign_character_maren", T = "campaign_character_tomas";
const person = (id: string, name: string, location: string, sex = "female"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex }, current: { current_location: location, status: "active" } } });
const transfer: CampaignCommand = { kind: "transfer_item", item_id: "boots", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } };

const SCENARIOS: Readonly<Record<string, () => Promise<unknown>>> = {
  /** Authorized handover + an uncommitted second handover in the draft -> audit -> reconciliation -> revision delivered -> one changed commit. */
  success_reconciled_handover: async () => { const f = turnFixture(); return traced(f.world, f.campaign, "I give boots to Brenna.",
    { narrations: ["Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.", "Brenna accepts boots from Nicco."], commands: [transfer] }); },
  /** Deterministic carry: prevalidation + projection prepares, travel, left-behind note, final prepare, commit. */
  success_carry_travel: async () => {
    const c = createOpeningCampaign(world, "h2_golden_carry");
    c.apply({ expected_revision: c.revision, commands: [person(M, "Maren", SQUARE), person(T, "Tomas", SQUARE, "male"), { kind: "set_legal_status", character_id: M, status: "enslaved", holder_id: "nicco" }] });
    return traced(world, c, "*picks Maren up and carries her into Heartstone*", { narrations: ["Nicco lifts Maren and carries her through the heavy door into the tower."] });
  },
  /** Retrieval phase: lore question -> search + fetch -> narration -> no-op commit. */
  success_retrieval_noop: async () => { const f = turnFixture(); return traced(f.world, f.campaign, "What do I know about Ironbound?", { narrations: ["Ironbound is a guild of smiths."] }); },
  /** Failure: controller provider error after narration -> no final prepare, no commit, state_failed history entry. */
  failure_controller_timeout: async () => { const f = turnFixture(); return traced(f.world, f.campaign, "I give boots to Brenna.",
    { narrations: ["Brenna accepts boots from Nicco."], commands: [transfer], controllerError: new ProviderError("timeout") }); },
  /** Failure: campaign mutated during the reconciliation call -> stale_turn after preparation; nothing commits. */
  failure_stale_during_reconciliation: async () => { const f = turnFixture(); return traced(f.world, f.campaign, "I give boots to Brenna.", {
    narrations: ["Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.", "Brenna accepts boots from Nicco."], commands: [transfer],
    duringNarrator: n => { if (n === 1) f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); } }); },
};

const actual: Record<string, unknown> = {};
for (const [name, run] of Object.entries(SCENARIOS)) actual[name] = normalize(await run());
if (process.env.H2_UPDATE_GOLDEN === "1") { await mkdir("tests/golden", { recursive: true }); await writeFile(GOLDEN, JSON.stringify(actual, null, 1) + "\n"); }
const golden = JSON.parse(await readFile(GOLDEN, "utf8")) as Record<string, unknown>;

for (const name of Object.keys(SCENARIOS)) {
  test(`golden pipeline: ${name} is byte-identical to the pre-H2 trace`, () => { assert.deepEqual(actual[name], golden[name]); });
}
test("golden pipeline: the contractual stage order holds in the successful reconciled turn", () => {
  const ops = (golden.success_reconciled_handover as { trace: { op: string; type?: string; call?: number }[] }).trace
    .map(t => t.op === "event" ? `event:${t.type}` : t.op === "narrator.stream" ? `narrator#${t.call}` : t.op);
  assert.deepEqual(ops, ["event:turn_started", "narrator#0", "event:controller_started", "controller.propose", "event:state_proposed", "prepare", "narrator#1",
    "event:narration_delta", "event:narration_completed", "commit", "event:state_committed", "event:turn_completed"]);
});
