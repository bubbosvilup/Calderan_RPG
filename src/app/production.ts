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
import { DEFAULT_CONTROLLER_FALLBACK_MODELS } from "../llm/openrouter/state-controller.js";
import type { SessionDeps, SessionHooks } from "./game-session.js";
import type { ProviderStatus } from "./session-view.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { FalImageClient } from "../llm/huggingface/fal-image-client.js";
import { RAENA_IMAGE_STACK } from "./image-stack.js";
import { PortraitAssetStore } from "./portrait-store.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { DeepReadonly } from "../types/readonly.js";
import { observePreparedNarrator } from "./narrator-alternatives.js";

/**
 * Environment-based provider configuration (current policy; there is no settings UI yet):
 *   OPENROUTER_API_KEY          required for live play; read per request by the client and never copied anywhere.
 *   OPENROUTER_NARRATOR_MODEL   optional narrator model id.
 *   OPENROUTER_CONTROLLER_MODEL optional controller model id; default openai/gpt-6-luna.
 *   OPENROUTER_CONTROLLER_FALLBACK_MODELS optional comma list for OpenRouter `models` fallback, or "none"; default anthropic/claude-haiku-5.5.
 *   CALDREVAN_REFLECTION_MODE  optional off (default) or shadow; neither exposes notes to narration.
 *   OPENROUTER_REFLECTION_MODEL optional reflection model id; the qualified adapter accepts only its default (anthropic/claude-haiku-5.5).
 *   MANNERISM_EXTRACTOR_MODEL  optional independent observation model id; default openai/gpt-6-luna.
 *   HF_TOKEN                    portrait images (image generation v1): Raelina/Raena-Qwen-Image on fal-ai via the Hugging Face router
 *                               (src/app/image-stack.ts). Read per request, never logged. Absent = generation fails with a clear message.
 *                               OpenRouter is not used for images.
 *   Semantic retrieval is opt-in: pass an `embedding_provider` (VOYAGE_API_KEY applies to the Voyage provider).
 * The returned status holds model ids and a boolean only, so it is safe to show in a UI and to put in diagnostics.
 */
export function readProviderStatus(env: Readonly<Record<string, string | undefined>> = process.env): ProviderStatus {
  const models = selectedModels();
  return { mode: "live", configured: !!env.OPENROUTER_API_KEY?.trim(), narrator_model: models.narrator, controller_model: models.controller, reflection_model: env.OPENROUTER_REFLECTION_MODEL?.trim() || DEFAULT_REFLECTION_MODEL };
}
/** Controller model fallback (OpenRouter `models`): OPENROUTER_CONTROLLER_FALLBACK_MODELS is a comma list, or "none" to disable; unset = Claude Haiku 5.5. */
export function controllerFallbackModels(env: Readonly<Record<string, string | undefined>> = process.env): readonly string[] {
  const raw = env.OPENROUTER_CONTROLLER_FALLBACK_MODELS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_CONTROLLER_FALLBACK_MODELS;
  return raw.toLowerCase() === "none" ? [] : raw.split(",").map(model => model.trim()).filter(Boolean);
}
export type ReflectionMode = "off" | "shadow";
/** D-09 is deferred. Shadow records qualified notes during real play without narrator exposure. */
export function readReflectionMode(env: Readonly<Record<string, string | undefined>> = process.env): ReflectionMode {
  const mode = env.CALDREVAN_REFLECTION_MODE?.trim() || "off";
  if (mode !== "off" && mode !== "shadow") throw new Error("CALDREVAN_REFLECTION_MODE must be off or shadow");
  return mode;
}
export interface ProductionOptions {
  /** Optional session-local playtest capture after prompt preparation; never part of a save. */
  readonly prepared_narrator_observer?: (request: import("../llm/types.js").GenerationRequest) => void;
  /** Defaults to off; shadow enables synchronous diagnostic post-turn maintenance only. */ readonly reflection_mode?: ReflectionMode; readonly context_policy?: ContextPolicy; readonly compaction_policy?: CompactionPolicy; readonly data_dir?: string; readonly save_dir?: string; /** Enabled by default after D-10 live calibration; explicit false disables extraction. */ readonly enable_emergent_mannerisms?: boolean; /** Optional production embedding provider; omitted means lexical retrieval only. */ readonly embedding_provider?: EmbeddingProvider;
  /**
   * Save/Load v1 persistent campaigns: saves AND portraits under `<save_dir>/campaigns/<campaign_id>/` (portraits/ inside each campaign),
   * autosave on, engine version recorded. Off (default) keeps the original layout (`<save_dir>/<id>/`, portraits in `<save_dir>/portraits`).
   */
  readonly persistent_campaigns?: boolean;
}
/** Real wiring for a player-facing build: canonical world, file saves, live OpenRouter providers. No fixture, no dev harness. */
export async function createProductionDeps(options: ProductionOptions = {}): Promise<SessionDeps & { readonly repository: FileCampaignRepository }> {
  const reflection_mode = options.reflection_mode ?? readReflectionMode();
  const context_policy = { ...DEFAULT_CONTEXT_POLICY, output_tokens: NARRATOR_OUTPUT_TOKENS, ...options.context_policy };
  const compressor_model = contextCompressorModel();
  const compaction_service = new LosslessContextCompactor(compressor_model ? new OpenRouterLosslessCompressor(compressor_model) : undefined, new ContextBudgetManager(context_policy), options.compaction_policy);
  const world = await loadWorld(options.data_dir ?? "data");
  let narratorSetup: SessionHooks["narrator_request_setup"];
  let sink: ((record: DeepReadonly<TurnDiagnostics>) => unknown) | undefined;
  const status = readProviderStatus(), service = new RetrievalService(world);
  const indexes = options.embedding_provider ? [await SemanticIndex.build(service.indexSource(), options.embedding_provider, "narrator")] : [];
  // Production narrator requests always disable hidden reasoning (Phase 1M.1); the controller uses the selected model and default retry policy.
  const narrator = new MiniMaxNarratorProvider(undefined, { model: status.narrator_model!, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
  const coordinator = new TurnCoordinator(world, options.prepared_narrator_observer ? observePreparedNarrator(narrator, options.prepared_narrator_observer, NARRATOR_OUTPUT_TOKENS) : narrator,
    new OpenRouterStateControllerProvider(undefined, { model: status.controller_model!, fallback_models: controllerFallbackModels() }), { service, search: new HybridSearch(service, indexes) }, { context_policy, context_compaction: compaction_service, narrator_request_setup: request => narratorSetup?.(request) ?? request, diagnostics_sink: record => sink?.(record) });
  const saveDir = options.save_dir ?? "saves", campaignsRoot = join(saveDir, "campaigns"), persistent = options.persistent_campaigns === true;
  const engine_version = await readFile("package.json", "utf8").then(text => (JSON.parse(text) as { version?: unknown }).version, () => undefined);
  return { world, context_policy, compaction_service, repository: new FileCampaignRepository(world, persistent ? campaignsRoot : saveDir), provider_status: status,
    ...(persistent ? { autosave: {} } : {}), ...(typeof engine_version === "string" && /^[0-9A-Za-z.+_-]{1,40}$/.test(engine_version) ? { engine_version } : {}),
    // Image generation v1: the Raena stack via the Hugging Face router (fal-ai pinned, HF_TOKEN read per request); portrait files live
    // inside each campaign folder (persistent mode) or beside the saves (legacy), never inside a save file. Diagnostics carry a code, HTTP status and retry kind only (never bodies, prompts or tokens).
    portrait_generator: new FalImageClient(RAENA_IMAGE_STACK, { api_key: () => process.env.HF_TOKEN }), portrait_stack: RAENA_IMAGE_STACK, portrait_store: persistent ? new PortraitAssetStore(campaignsRoot, { layout: "campaign" }) : new PortraitAssetStore(join(saveDir, "portraits")),
    portrait_log: entry => console.warn(`[portrait] generation failed: ${entry.code}${entry.status ? ` (HTTP ${entry.status})` : ""}${entry.recovery ? `; retrying once (${entry.recovery === "reseed" ? "new seed" : "same seed"})` : ""}`),
    ...(options.enable_emergent_mannerisms !== false ? { mannerism_extractor: new OpenRouterMannerismExtractor(new OpenRouterClient(), { model: mannerismExtractorModel() }) } : {}),
    // One coordinator is shared; the live session owns the diagnostics hook. A UI runs one session at a time.
    createCoordinator: hooks => { sink = hooks.diagnostics_sink; narratorSetup = hooks.narrator_request_setup; return coordinator; },
    ...(reflection_mode === "shadow" ? { reflection_provider: new OpenRouterReflectionProvider(new OpenRouterClient(), { ...(status.reflection_model ? { model: status.reflection_model } : {}) }) } : {}) };
}
