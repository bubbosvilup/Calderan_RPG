import { OpenRouterClient } from "../llm/openrouter/client.js";
import { OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { diagnoseMutation, type MutationDiagnostic } from "../turn/mutation-diagnostics.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { StateControllerProvider } from "../llm/state-controller-provider.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { TurnDebugRecord, TurnEvent, TurnResult } from "../turn/turn-types.js";
import { turnFixture } from "./turn-fixture.js";

/**
 * Consolidation Pass B dev harness. Runs ONE turn offline through the real TurnCoordinator (real intent resolution, real grammar,
 * real evidence verification, real campaign.prepare/commit) with a scripted Narrator and a scripted Controller, and prints the
 * whole mutation path: INPUT / NARRATION / CONTROLLER PROPOSAL / PARSED COMMANDS / AUTHORIZATION / PREPARE / COMMIT / REVISION DELTA.
 * No provider call, no key, no persistence outside the in-memory fixture.
 *
 * The Controller script goes through the REAL OpenRouter controller provider (stubbed wire), so strict-envelope parsing, the legacy
 * shape, normalization and `structured_output_invalid` behave exactly as in production.
 */
export type ControllerScript =
  | { readonly kind: "commands"; readonly commands: readonly CampaignCommand[]; readonly evidence?: readonly string[] }
  /** `{"commands":[]}` */
  | { readonly kind: "none" }
  /** Raw text as the model would return it (for malformed / wrong-shape outputs). */
  | { readonly kind: "raw"; readonly text: string }
  /** Test double for conditions the wire cannot express (for example a stale revision during the controller call). */
  | { readonly kind: "provider"; readonly provider: StateControllerProvider };
export interface DiagnosticScenario {
  readonly id: string; readonly title: string; readonly input: string; readonly narration: string; readonly controller: ControllerScript;
  /** Fixture mutation applied before the turn (register items, set conditions, move people). */
  readonly setup?: (f: ReturnType<typeof turnFixture>) => void;
  /** Replaces the synthetic turn fixture (for example the real world with the opening campaign); `setup` then receives this fixture. */
  readonly fixture?: () => ReturnType<typeof turnFixture>;
  readonly ground_garments?: boolean;
  readonly evidence_authorization?: "shadow" | "hybrid";
}
export interface ScenarioRun {
  readonly scenario: DiagnosticScenario; readonly events: readonly TurnEvent[]; readonly result?: TurnResult;
  readonly failed?: Extract<TurnEvent, { type: "turn_failed" }>; readonly debug: readonly TurnDebugRecord[]; readonly record?: TurnDiagnostics;
  readonly diagnostic: MutationDiagnostic; readonly controller_wire?: string; readonly fetch_count: number;
}
const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 2, completed_at: "2026-01-01T00:00:01Z", elapsed_total_ms: 3 } };
function narrator(text: string): NarratorProvider {
  return { async generate() { return { text, ...metadata }; }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
/** The production OpenRouter controller provider over a stubbed wire. Returns the provider and a counter of simulated HTTP requests. */
function wireController(content: string): { provider: StateControllerProvider; fetches: () => number } {
  let n = 0;
  const fetchStub = (async () => { n++; return Response.json({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 } }); }) as typeof fetch;
  return { provider: new OpenRouterStateControllerProvider(new OpenRouterClient({ api_key: () => "offline-not-a-key", fetch: fetchStub })), fetches: () => n };
}
export function controllerWire(script: ControllerScript): string | undefined {
  if (script.kind === "none") return JSON.stringify({ commands: [] });
  if (script.kind === "raw") return script.text;
  if (script.kind === "commands") return JSON.stringify({ commands: script.commands.map((command, i) => ({ command, evidence_quote: script.evidence?.[i] ?? "" })) });
  return undefined;
}
export async function runScenario(s: DiagnosticScenario): Promise<ScenarioRun> {
  const f = s.fixture ? s.fixture() : turnFixture(!!s.ground_garments); s.setup?.(f);
  const service = new RetrievalService(f.world), retrieval = { service, search: new HybridSearch(service) };
  const wire = controllerWire(s.controller);
  const controller = s.controller.kind === "provider" ? { provider: s.controller.provider, fetches: () => 0 } : wireController(wire!);
  const debug: TurnDebugRecord[] = []; let record: TurnDiagnostics | undefined;
  const coordinator = new TurnCoordinator(f.world, narrator(s.narration), controller.provider, retrieval,
    { debug_sink: r => debug.push(r), diagnostics_sink: r => { record = r as TurnDiagnostics; }, ...(s.evidence_authorization ? { evidence_authorization: s.evidence_authorization } : {}) });
  const events: TurnEvent[] = [];
  for await (const event of coordinator.runTurn({ campaign: f.campaign, player_input: s.input })) events.push(event);
  const last = events.at(-1);
  const result = last?.type === "turn_completed" ? last.result : undefined, failed = last?.type === "turn_failed" ? last : undefined;
  const diagnostic = diagnoseMutation({ ...(result ? { result } : {}), ...(failed ? { failed } : {}), ...(record ? { diagnostics: record } : {}), debug });
  return { scenario: s, events, ...(result ? { result } : {}), ...(failed ? { failed } : {}), debug, ...(record ? { record } : {}), diagnostic, ...(wire ? { controller_wire: wire } : {}), fetch_count: controller.fetches() };
}
/** Human-readable trace of one run. Contains no secrets: the stubbed key is never printed. */
export function renderRun(run: ScenarioRun): string {
  const d = run.diagnostic, out: string[] = [`=== ${run.scenario.id}: ${run.scenario.title}`];
  const j = (v: unknown) => JSON.stringify(v);
  out.push(`INPUT: ${run.scenario.input}`, `NARRATION: ${run.scenario.narration}`);
  out.push(`CONTROLLER PROPOSAL (wire): ${run.controller_wire ?? "(provider double)"}`);
  out.push(`PARSED COMMANDS: ${run.result ? j(run.result.controller_proposal) : "(none: turn failed before authorization)"}`);
  out.push(`INTENDED (player intents): ${j(d.intended)}`);
  if (run.result) for (const a of run.result.authorization) out.push(`AUTHORIZATION: ${a.authorized ? "ACCEPT" : "REJECT"} ${a.command.kind}${"item_id" in a.command ? ` ${a.command.item_id}` : ""} reason=${a.reason} source=${a.source ?? "-"} grammar=${a.grammar ? `${a.grammar.authorized}/${a.grammar.reason}` : "-"} evidence=${a.evidence ? `${a.evidence.verified}/${a.evidence.check}` : "-"}`);
  const state = run.events.find(e => e.type === "state_committed");
  out.push(`PREPARE RESULT: ${run.failed ? (d.code === "prepare_failure" || d.code === "campaign_validation_failure" ? "REJECTED" : "not reached/other") : "ok"}${run.record?.commit.prepare_changed === undefined ? "" : ` changed=${run.record.commit.prepare_changed} commands=${run.record.commit.command_count}`}`);
  out.push(`COMMIT RESULT: ${state && state.type === "state_committed" ? `committed revision=${state.revision} changed=${state.changed}` : run.failed ? `no commit (${run.failed.code}${run.failed.provider_code ? `/${run.failed.provider_code}` : ""})` : "no commit"}`);
  out.push(`REVISION DELTA: ${d.revision_before} -> ${d.revision_after}`);
  out.push(`DIAGNOSIS: stage=${d.stage} verdict=${d.verdict} code=${d.code ?? "-"}`);
  for (const r of d.rejected) out.push(`  rejected ${r.command.kind}: ${r.code ?? "-"} | ${r.detail}`);
  for (const n of d.notes) out.push(`  note: ${n}`);
  for (const r of run.debug) out.push(`  debug: ${r.kind}`);
  return out.join("\n");
}
const sword = (owner = "nicco", carrier = "nicco") => (f: ReturnType<typeof turnFixture>) => {
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_item", item: { id: "campaign_item_sword", origin: { kind: "created" }, name: "Sword", owner_id: owner, position: { kind: "carried", character_id: carrier } } }] });
};
export const handoffSword: CampaignCommand = { kind: "transfer_item", mode: "handoff", item_id: "campaign_item_sword", position: { kind: "carried", character_id: "brenna" } };
/** The six reproduction cases of Pass B (E2E1 "I hand Brenna the sword"). */
const garment = (item_id: string): CampaignCommand => ({ kind: "transfer_item", mode: "handoff", item_id, position: { kind: "carried", character_id: "brenna" } });
export const OFFER = "*gives her the two pink shirt, one fluffy and thick one made of probably cotton, the shorts are also pink and should be alright for her narrow waist*";
export const E2E1_CASES: readonly DiagnosticScenario[] = [
  { id: "A", title: "Controller proposes nothing", input: "*hands Brenna the sword*", narration: "Brenna takes the sword from Nicco and weighs it in her hands.", controller: { kind: "none" }, setup: sword() },
  { id: "B", title: "Correct transfer, no evidence quote", input: "*hands Brenna the sword*", narration: "Brenna takes the sword from Nicco and weighs it in her hands.", controller: { kind: "commands", commands: [handoffSword] }, setup: sword(), evidence_authorization: "hybrid" },
  { id: "B2", title: "Correct transfer, quote verbatim but the receipt is narrated without a recognised receipt verb", input: "*hands Brenna the sword*", narration: "Brenna's fingers close around the hilt and she weighs the blade.", controller: { kind: "commands", commands: [handoffSword], evidence: ["Brenna's fingers close around the hilt"] }, setup: sword() },
  { id: "C", title: "Correct transfer with valid evidence", input: "*hands Brenna the sword*", narration: "Nicco offers the hilt first. Brenna takes the sword and weighs it in her hands.", controller: { kind: "commands", commands: [handoffSword], evidence: ["Brenna takes the sword"] }, setup: sword() },
  { id: "D", title: "Ambiguous narration", input: "*hands Brenna the sword*", narration: "Brenna eyes the sword. Maybe she will take it, maybe not.", controller: { kind: "commands", commands: [handoffSword], evidence: ["Maybe she will take it, maybe not."] }, setup: sword() },
  { id: "E", title: "Recipient refuses", input: "*hands Brenna the sword*", narration: "Brenna refuses the sword and pushes the hilt back toward Nicco.", controller: { kind: "commands", commands: [handoffSword], evidence: ["Brenna refuses the sword"] }, setup: sword() },
  { id: "F", title: "Narration accepts only part of an offered set (controller proposes the whole offer)", input: OFFER, ground_garments: true,
    narration: "Brenna looks over the offer. She took the pink cotton shirt next. She turned the thick fluffy shirt over in her large hands, then set it aside. The shorts stayed folded.",
    controller: { kind: "commands", commands: ["pink_cotton", "pink_fluffy", "pink_shorts"].map(garment), evidence: ["She took the pink cotton shirt next.", "She took the pink cotton shirt next.", "She took the pink cotton shirt next."] } },
  { id: "G", title: "Mode differs from the player's resolved intent (return instead of handoff)", input: "*hands Brenna the sword*", narration: "Nicco offers the hilt first. Brenna takes the sword and weighs it in her hands.", setup: sword("brenna", "nicco"),
    controller: { kind: "commands", commands: [{ ...handoffSword, mode: "return" }], evidence: ["Brenna takes the sword"] } },
];
async function main(): Promise<void> {
  const only = process.argv[2];
  for (const s of E2E1_CASES.filter(c => !only || c.id === only)) console.log(`${renderRun(await runScenario(s))}\n`);
}
if (process.argv[1] && /controller-authorization-diagnostics\.js$/.test(process.argv[1])) await main();
