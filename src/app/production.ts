import { type CompactionPolicy } from "../turn/context-compaction.js";
import { LosslessContextCompactor } from "../turn/lossless-context-compaction.js";
import { ContextBudgetManager } from "../turn/context-budget.js";
import { OpenRouterLosslessCompressor } from "../llm/openrouter/lossless-compressor.js";
import { DEFAULT_CONTEXT_POLICY, type ContextPolicy } from "../turn/context-budget.js";
import { FileCampaignRepository } from "../persistence/campaign-repository.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { OpenRouterReflectionProvider, DEFAULT_REFLECTION_MODEL } from "../llm/openrouter/reflection-provider.js";
import { OpenRouterMannerismExtractor } from "../llm/openrouter/mannerism-extractor.js";
import { loadWorld } from "../world/loader.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { SemanticIndex } from "../retrieval/semantic-index.js";
import type { EmbeddingProvider } from "../retrieval/embedding-provider.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { NARRATOR_OUTPUT_TOKENS, selectedModels, contextCompressorModel, mannerismExtractorModel } from "./provider-config.js";
import type { SessionDeps } from "./game-session.js";
import type { ProviderStatus } from "./session-view.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { DeepReadonly } from "../types/readonly.js";

/**
 * Environment-based provider configuration (current policy; there is no settings UI yet):
 *   OPENROUTER_API_KEY          required for live play; read per request by the client and never copied anywhere.
 *   OPENROUTER_NARRATOR_MODEL   optional narrator model id.
 *   OPENROUTER_CONTROLLER_MODEL optional controller model id.
 *   CALDREVAN_REFLECTION_MODE  optional off (default) or shadow; neither exposes notes to narration.
 *   OPENROUTER_REFLECTION_MODEL optional reflection model id (retains its pre-controller-migration default).
 *   MANNERISM_EXTRACTOR_MODEL  optional independent observation model id (validated D-10 default).
 *   Semantic retrieval is opt-in: pass an `embedding_provider` (VOYAGE_API_KEY applies to the Voyage provider).
 * The returned status holds model ids and a boolean only, so it is safe to show in a UI and to put in diagnostics.
 */
export function readProviderStatus(env: Readonly<Record<string, string | undefined>> = process.env): ProviderStatus {
  const models = selectedModels();
  return { mode: "live", configured: !!env.OPENROUTER_API_KEY?.trim(), narrator_model: models.narrator, controller_model: models.controller, reflection_model: env.OPENROUTER_REFLECTION_MODEL?.trim() || process.env.OPENROUTER_CONTROLLER_MODEL || DEFAULT_REFLECTION_MODEL };
}
export type ReflectionMode = "off" | "shadow";
/** D-09 is deferred. Shadow records qualified notes during real play without narrator exposure. */
export function readReflectionMode(env: Readonly<Record<string, string | undefined>> = process.env): ReflectionMode {
  const mode = env.CALDREVAN_REFLECTION_MODE?.trim() || "off";
  if (mode !== "off" && mode !== "shadow") throw new Error("CALDREVAN_REFLECTION_MODE must be off or shadow");
  return mode;
}
export interface ProductionOptions { /** Defaults to off; shadow enables synchronous diagnostic post-turn maintenance only. */ readonly reflection_mode?: ReflectionMode; readonly context_policy?: ContextPolicy; readonly compaction_policy?: CompactionPolicy; readonly data_dir?: string; readonly save_dir?: string; /** Enabled by default after D-10 live calibration; explicit false disables extraction. */ readonly enable_emergent_mannerisms?: boolean; /** Optional production embedding provider; omitted means lexical retrieval only. */ readonly embedding_provider?: EmbeddingProvider }
/** Real wiring for a player-facing build: canonical world, file saves, live OpenRouter providers. No fixture, no dev harness. */
export async function createProductionDeps(options: ProductionOptions = {}): Promise<SessionDeps> {
  const reflection_mode = options.reflection_mode ?? readReflectionMode();
  const context_policy = { ...DEFAULT_CONTEXT_POLICY, output_tokens: NARRATOR_OUTPUT_TOKENS, ...options.context_policy };
  const compressor_model = contextCompressorModel();
  const compaction_service = new LosslessContextCompactor(compressor_model ? new OpenRouterLosslessCompressor(compressor_model) : undefined, new ContextBudgetManager(context_policy), options.compaction_policy);
  const world = await loadWorld(options.data_dir ?? "data");
  let sink: ((record: DeepReadonly<TurnDiagnostics>) => unknown) | undefined;
  const status = readProviderStatus(), service = new RetrievalService(world);
  const indexes = options.embedding_provider ? [await SemanticIndex.build(service.indexSource(), options.embedding_provider, "narrator")] : [];
  // Production narrator requests always disable hidden reasoning (Phase 1M.1); the controller uses the selected model and default retry policy.
  const coordinator = new TurnCoordinator(world, new MiniMaxNarratorProvider(undefined, { model: status.narrator_model!, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true }),
    new OpenRouterStateControllerProvider(undefined, { model: status.controller_model! }), { service, search: new HybridSearch(service, indexes) }, { context_policy, context_compaction: compaction_service, diagnostics_sink: record => sink?.(record) });
  return { world, context_policy, compaction_service, repository: new FileCampaignRepository(world, options.save_dir ?? "saves"), provider_status: status,
    ...(options.enable_emergent_mannerisms !== false ? { mannerism_extractor: new OpenRouterMannerismExtractor(new OpenRouterClient(), { model: mannerismExtractorModel() }) } : {}),
    // One coordinator is shared; the live session owns the diagnostics hook. A UI runs one session at a time.
    createCoordinator: hooks => { sink = hooks.diagnostics_sink; return coordinator; },
    ...(reflection_mode === "shadow" ? { reflection_provider: new OpenRouterReflectionProvider(new OpenRouterClient(), { ...(status.reflection_model ? { model: status.reflection_model } : {}) }) } : {}) };
}
