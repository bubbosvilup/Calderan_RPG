import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { WorldStore } from "../world/world-store.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { SemanticIndex } from "../retrieval/semantic-index.js";
import { configuredEmbeddingProvider } from "./embedding-configuration.js";
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_MODEL } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterStateControllerProvider, DEFAULT_CONTROLLER_MODEL } from "../llm/openrouter/state-controller.js";
import type { OpenRouterClient } from "../llm/openrouter/client.js";
import { TurnCoordinator, type TurnDebugRecord } from "../turn/turn-coordinator.js";
import type { RecentContextMode } from "../turn/prompt-builder.js";
import type { TurnDiagnosticsSink } from "../turn/turn-diagnostics.js";
import type { ProviderRetryPolicy } from "../llm/retry.js";
import type { EvidenceMode } from "../turn/evidence-authorization.js";
import { NARRATOR_OUTPUT_TOKENS, selectedModels } from "../app/provider-config.js";
export { NARRATOR_OUTPUT_TOKENS, selectedModels };
/** Evaluation-only narrator substitution. The controller model, policy and clients are never derived from these fields. */
export interface NarratorOverride { readonly model?: string; readonly disable_reasoning?: boolean; readonly narrator_client?: OpenRouterClient; readonly controller_client?: OpenRouterClient; readonly recent_context?: RecentContextMode; readonly evidence_authorization?: EvidenceMode; readonly debug_sink?: (record: TurnDebugRecord) => void; readonly diagnostics_sink?: TurnDiagnosticsSink; readonly provider_retry?: ProviderRetryPolicy | false }
export function narratorConfig(override: NarratorOverride = {}) {
  // Production narrator requests always disable hidden reasoning explicitly (Phase 1M.1); only evaluation may pass false.
  return { model: override.model ?? selectedModels().narrator, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: override.disable_reasoning ?? true };
}
export async function onlineCoordinator(world: WorldStore, semantic = false, wrapNarrator: (provider: NarratorProvider) => NarratorProvider = p => p, override: NarratorOverride = {}) {
  const service = new RetrievalService(world);
  const provider = semantic ? await configuredEmbeddingProvider() : undefined;
  if (semantic && !provider) throw new Error("No configured production embedding provider");
  const indexes = provider ? [await SemanticIndex.build(service.indexSource(), provider, "narrator")] : [];
  return new TurnCoordinator(world, wrapNarrator(new MiniMaxNarratorProvider(override.narrator_client, narratorConfig(override))), new OpenRouterStateControllerProvider(override.controller_client, { model: selectedModels().controller }), { service, search: new HybridSearch(service, indexes) }, { ...(override.recent_context ? { recent_context: override.recent_context } : {}), ...(override.evidence_authorization ? { evidence_authorization: override.evidence_authorization } : {}), ...(override.debug_sink ? { debug_sink: override.debug_sink } : {}), ...(override.diagnostics_sink ? { diagnostics_sink: override.diagnostics_sink } : {}), ...(override.provider_retry !== undefined ? { provider_retry: override.provider_retry } : {}) });
}
