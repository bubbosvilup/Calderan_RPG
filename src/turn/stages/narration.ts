import type { NarratorProvider, NarratorResult } from "../../llm/narrator-provider.js";
import type { NarratorRequest } from "../../llm/types.js";
import type { TurnContext } from "../context-builder.js";
import { buildNarratorPrompt, type NarratorPromptOptions } from "../prompt-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "../scene-participants.js";
import { TurnError } from "../turn-types.js";
import { withProviderRetry, type ProviderAttemptRecord, type ProviderBudget, type ProviderRetryPolicy } from "../../llm/retry.js";
import {providerRetryReason} from "../../llm/retry.js";
import { technicalRetryReason } from "../../llm/reliability.js";
import type { TurnIntent } from "./intent.js";

/**
 * Hardening H2 — NarrationStage. The narrator writes a DRAFT: it is buffered and never delivered as final until the controller, authorization,
 * final preparation and the audit/reconciliation have resolved the turn (Repair 1, authoritative narration order). Transient-failure retry
 * fallback model, no timeout policy here (H5).
 */

export type { NarratorRequest } from "../../llm/types.js";
export interface TurnPrompt { readonly recent: readonly RecentExchange[]; readonly prompt: NarratorRequest }
/**
 * Sync. Prompt composition from the bounded context, retained finalized conversation, retrieved canon, the intent as the narrator
 * sees it and the scene participants. Failure mapping: the coordinator still holds `retrieval_failed` here (pre-H2 order).
 */
export function composeTurnPrompt(i: { readonly player_input: string; readonly context: TurnContext; readonly recent: readonly RecentExchange[]; readonly retrieved: unknown;
  readonly prompt_intent: TurnIntent; readonly options: NarratorPromptOptions; readonly scene: SceneParticipantPlan }): TurnPrompt {
  return { recent: i.recent, prompt: buildNarratorPrompt(i.player_input, i.context, i.recent, i.retrieved, i.prompt_intent, i.options, i.scene) };
}

export interface NarratorDraft { readonly text: string; readonly result: NarratorResult }
export type DraftGenerator = (request: NarratorRequest) => Promise<NarratorDraft>;
/**
 * Async. One streamed narrator generation, buffered. `checkpoint` (the coordinator's stale/cancellation check) runs on every streamed
 * event. Failure mapping: provider errors propagate (coordinator maps to `narrator_failed` + provider code); a draft over 24,000
 * characters is `context_too_large`; an empty or stream-inconsistent completion is `narrator_failed`.
 * H5: with `retry`, a transient provider failure (or an empty/inconsistent completion) restarts the call from the same request with a
 * fresh buffer; a failed attempt's partial text is dropped and never enters history or the controller. An optional visual-only
 * preview observer receives reset/delta notifications, including retries; it cannot authorize or publish a turn.
 */
export interface DraftRetry { readonly technical_contract?:boolean; readonly policy: ProviderRetryPolicy; readonly budget: ProviderBudget; readonly record: (record: ProviderAttemptRecord) => void; readonly attempt_started?: (attempt: number) => void }
const narratorRetryReason = (error: unknown, technical=false): string | undefined => (technical?technicalRetryReason(error):providerRetryReason(error)) ?? (error instanceof TurnError && error.code === "narrator_failed" ? "empty_or_inconsistent_completion" : undefined);
export function createDraftGenerator(narrator: NarratorProvider, signal: AbortSignal, checkpoint: () => void, on_delta?: (characters: number) => void, retry?: DraftRetry, preview?: (action: "start" | "delta", text: string) => void): DraftGenerator {
  const once = async (request: NarratorRequest, timeout_ms?: number | undefined): Promise<NarratorDraft> => {
    let buffer = "", result: NarratorResult | undefined;
    preview?.("start", "");
    for await (const event of narrator.stream({ ...request, signal, ...(timeout_ms ? { timeout_ms } : {}) })) {
      checkpoint();
      if (event.type === "error") throw event.error;
      if (event.type === "text_delta") { buffer += event.text; on_delta?.(event.text.length); if (buffer.length > 24_000) throw new TurnError("context_too_large"); preview?.("delta", event.text); }
      else { if (event.result.text !== buffer || !buffer.trim()) throw new TurnError("narrator_failed"); result = event.result; }
    }
    if (!result) throw new TurnError("narrator_failed");
    return { text: buffer, result };
  };
  if (!retry) return request => once(request);
  return request => withProviderRetry({ ...retry, signal, checkpoint, reason: e=>narratorRetryReason(e,retry.technical_contract), run: (_attempt, timeout_ms) => once(request, timeout_ms) });
}

