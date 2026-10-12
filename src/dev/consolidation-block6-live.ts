import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GameSession, type SessionDeps } from "../app/game-session.js";
import { mannerismFixture } from "./d10-mannerism-corpus.js";
import { FileCampaignRepository } from "../persistence/campaign-repository.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { OpenRouterMannerismExtractor } from "../llm/openrouter/mannerism-extractor.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { NARRATOR_OUTPUT_TOKENS, mannerismExtractorModel } from "../app/provider-config.js";
import { readProviderStatus, controllerFallbackModels } from "../app/production.js";
import { resolveOptionalServices } from "../app/optional-services.js";

/**
 * Consolidation Block 6: minimal LIVE certification (evaluation only) of the core / optional split on the production GameSession -> TurnCoordinator path.
 *  LIVE A  mannerism-eligible turns with learning ON: the extractor batch (4th finalized turn) is launched only AFTER the core turn_completed event, the
 *          session is idle when the turn returns, and the next turn is not blocked.
 *  LIVE B  the same scenario with Mannerism OFF: zero extractor wire calls, every core turn succeeds.
 * One attempt per scenario, no reroll. Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/consolidation-block6-live.js
 */
interface Wire { readonly n: number; readonly model: unknown; readonly start_ms: number; end_ms?: number; status?: number }
const T0 = Date.now(), now = () => Date.now() - T0, wire: Wire[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
  const entry: Wire = { n: wire.length + 1, model: (JSON.parse(init.body) as { model?: unknown }).model, start_ms: now() }; wire.push(entry);
  const response = await realFetch(input, init); entry.end_ms = now(); entry.status = response.status; return response;
}) as typeof fetch;

async function scenario(label: string, mannerism: boolean, outDir: string) {
  const f = mannerismFixture(), service = new RetrievalService(f.world), status = readProviderStatus();
  const narrator = new MiniMaxNarratorProvider(undefined, { model: status.narrator_model!, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
  const controller = new OpenRouterStateControllerProvider(undefined, { model: status.controller_model!, fallback_models: controllerFallbackModels() });
  const extractorModel = mannerismExtractorModel(), runs: unknown[] = [];
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, join(outDir, `saves_${label}`)), autosave: false,
    optional_services: resolveOptionalServices({ mannerism_learning: mannerism, reflection: false, portrait_generation: false, item_sprite_generation: false, sprite_qa: false }, {}),
    ...(mannerism ? { mannerism_extractor: new OpenRouterMannerismExtractor(new OpenRouterClient(), { model: extractorModel }), mannerism_diagnostics_sink: (r: unknown) => runs.push(r) } : {}),
    createCoordinator: (hooks: Parameters<SessionDeps["createCoordinator"]>[0]) => new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { diagnostics_sink: hooks.diagnostics_sink }) } as never, f.campaign);
  const inputs = ["Brenna, sit with me a moment. I am waiting for the kiln to cool.", "I wait quietly, watching Brenna and Maren.", "Brenna, what are you thinking while we wait?", "I keep waiting beside Brenna."];
  const turns: Record<string, unknown>[] = [];
  for (const [i, input] of inputs.entries()) {
    const mark = wire.length, started = now(); let completedAt = -1;
    const outcome = await session.submitPlayerInput(input, { onEvent: e => { if (e.type === "turn_completed") completedAt = now(); } });
    const returnedAt = now(), idle = session.status === "idle";
    turns.push({ n: i + 1, ok: outcome.ok, error: outcome.ok ? null : outcome.error, started_ms: started, turn_completed_ms: completedAt, returned_ms: returnedAt, idle_at_return: idle,
      core_wire_calls: wire.slice(mark).map(w => ({ n: w.n, model: w.model, start_ms: w.start_ms, end_ms: w.end_ms ?? null })) });
    if (i < inputs.length - 1) await session.optionalSettled();
  }
  const extractorCalls = wire.filter(w => w.model === extractorModel && w.n > 0);
  await session.optionalSettled();
  const health = session.getOptionalServices();
  return { label, mannerism, extractor_model: extractorModel, turns, extractor_calls: wire.filter(w => w.model === extractorModel).map(w => ({ ...w })), health, extractor_called_before_settle: extractorCalls.length, runs_recorded: runs.length };
}
async function main(): Promise<void> {
  const outDir = join("docs", "evaluations", "consolidation_block6_live"); await mkdir(outDir, { recursive: true });
  const A = await scenario("a_mannerism_on", true, outDir);
  const markB = wire.length;
  const B = await scenario("b_mannerism_off", false, outDir);
  const extractorB = wire.slice(markB).filter(w => w.model === A.extractor_model);
  const lastA = A.turns[3] as { turn_completed_ms: number; returned_ms: number; idle_at_return: boolean; ok: boolean };
  const firstExtractor = A.extractor_calls[0];
  const verdict = {
    A_all_turns_ok: A.turns.every(t => t.ok === true), A_idle_at_return: A.turns.every(t => t.idle_at_return === true),
    A_extractor_called: A.extractor_calls.length >= 1,
    A_extractor_started_after_core_completed: !!firstExtractor && firstExtractor.start_ms >= lastA.turn_completed_ms,
    A_extractor_end_after_turn_return: !!firstExtractor && (firstExtractor.end_ms ?? 0) >= lastA.returned_ms,
    B_all_turns_ok: B.turns.every(t => t.ok === true), B_zero_extractor_calls: extractorB.length === 0, B_service_disabled: B.health.find(s => s.service === "mannerism_learning")?.enabled === false,
  };
  const out = { generated_at: new Date().toISOString(), wire_total: wire.length, verdict, A, B };
  await writeFile(join(outDir, "result.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ wire_total: wire.length, verdict }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
