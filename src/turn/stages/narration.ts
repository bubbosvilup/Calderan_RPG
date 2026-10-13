import type { NarratorProvider, NarratorResult } from "../../llm/narrator-provider.js";
import type { NarratorRequest } from "../../llm/types.js";
import type { TurnContext } from "../context/context-builder.js";
import { buildNarratorPrompt, type NarratorPromptOptions } from "../context/prompt-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "../scene-participants.js";
import { TurnError } from "../turn-types.js";
import { withProviderRetry, type ProviderAttemptRecord, type ProviderBudget, type ProviderRetryPolicy } from "../../llm/retry.js";
import {providerRetryReason} from "../../llm/retry.js";
import { technicalRetryReason } from "../../llm/reliability.js";
import { ProviderError } from "../../llm/errors.js";
import { NarratorLedger, type NarratorGeneration } from "../narrator-ledger.js";
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

export interface NarratorDraft {
  readonly text: string; readonly result: NarratorResult;
  /** `stop` (or absent, for a provider that exposes none): complete. `length`: the provider cut the answer off; the text is incomplete and must never be delivered, authorized from or committed. */
  readonly finish_reason?: "stop" | "length";
}
/** Per call: which logical generation this is, an explicit output cap, and whether a `length` ending is returned (to the turn layer) instead of failing. */
export interface DraftOptions { readonly generation?: NarratorGeneration; readonly max_output_tokens?: number; readonly accept_truncated?: boolean }
export type DraftGenerator = (request: NarratorRequest, options?: DraftOptions) => Promise<NarratorDraft>;
/**
 * Async. One BUFFERED narrator generation. `checkpoint` (the coordinator's stale/cancellation check) runs on every streamed event. The text
 * is never shown to anyone: it is a draft until the controller, authorization, audit and commit have resolved the turn (PIPE-1: there is no
 * preview observer any more). Failure mapping: provider errors propagate (coordinator maps to `narrator_failed` + provider code); a draft over
 * 24,000 characters is `context_too_large`; an empty or stream-inconsistent completion is `narrator_failed`.
 * H5: with `retry`, a transient provider failure (or an empty/inconsistent completion) restarts the call from the same request with a fresh
 * buffer; a failed attempt's partial text is dropped and never enters history or the controller.
 * Block 4: every PHYSICAL request is reserved in the turn's `ledger` (hard maximum 3 per turn, retries and regenerations together) and
 * recorded there with its finish reason. A `length` ending completes (when `accept_truncated`) with `finish_reason: "length"` so the turn
 * layer, not the transport, decides; any finish reason other than stop/length is a malformed provider response.
 */
export interface DraftRetry { readonly technical_contract?:boolean; readonly policy: ProviderRetryPolicy; readonly budget: ProviderBudget; readonly record: (record: ProviderAttemptRecord) => void; readonly attempt_started?: (attempt: number) => void }
const narratorRetryReason = (error: unknown, technical=false): string | undefined => (technical?technicalRetryReason(error):providerRetryReason(error)) ?? (error instanceof TurnError && error.code === "narrator_failed" ? "empty_or_inconsistent_completion" : undefined);
export function createDraftGenerator(narrator: NarratorProvider, signal: AbortSignal, checkpoint: () => void, on_delta?: (characters: number) => void, retry?: DraftRetry, ledger: NarratorLedger = new NarratorLedger()): DraftGenerator {
  const once = async (request: NarratorRequest, options: DraftOptions, timeout_ms?: number | undefined): Promise<NarratorDraft> => {
    const attempt = ledger.beginAttempt(options.generation ?? "primary", options.max_output_tokens);
    let buffer = "", result: NarratorResult | undefined;
    try {
      for await (const event of narrator.stream({ ...request, signal, ...(timeout_ms ? { timeout_ms } : {}), ...(options.max_output_tokens ? { max_output_tokens: options.max_output_tokens } : {}), ...(options.accept_truncated ? { accept_truncated: true } : {}) })) {
        checkpoint();
        if (event.type === "error") throw event.error;
        if (event.type === "text_delta") { buffer += event.text; on_delta?.(event.text.length); if (buffer.length > 24_000) throw new TurnError("context_too_large"); }
        else { if (event.result.text !== buffer || !buffer.trim()) throw new TurnError("narrator_failed"); result = event.result; }
      }
      if (!result) throw new TurnError("narrator_failed");
      const finish = result.finish_reason ?? "stop";
      if (finish !== "stop" && finish !== "length") { ledger.complete(attempt, result, "malformed"); throw new ProviderError("invalid_provider_response", undefined, undefined, "invalid_provider_response"); }
      if (finish === "length" && !options.accept_truncated) { ledger.complete(attempt, result, "length"); throw new ProviderError("invalid_provider_response", undefined, undefined, "finish_reason_length"); }
      ledger.complete(attempt, result, finish);
      return { text: buffer, result, finish_reason: finish };
    } catch (error) { if (attempt.outcome === "pending") ledger.fail(attempt, error); throw error; }
  };
  return (request, options = {}) => {
    // A new logical generation is opened once per call; infrastructure retries inside it draw only on the physical budget.
    ledger.beginGeneration(options.generation ?? "primary");
    if (!retry) return once(request, options);
    return withProviderRetry({ ...retry, signal, checkpoint, reason: e => ledger.physicalRemaining() === 0 ? undefined : narratorRetryReason(e, retry.technical_contract), run: (_attempt, timeout_ms) => once(request, options, timeout_ms) });
  };
}


/**
 * Block 4 (NARR-1): the minimal instruction of the single truncation-recovery REGENERATION. The replacement is a complete narration of the same
 * turn, written from scratch against the same authoritative context; the discarded partial text is NOT included and nothing is stitched.
 */
export const TRUNCATION_RECOVERY_NOTICE = "OUTPUT BUDGET NOTICE: your previous answer for this same turn exceeded the output budget and was discarded. Write the complete replacement narration for this turn from the beginning. It must reach its natural ending within the new, larger budget.";
export function truncationRecoveryRequest(request: NarratorRequest): NarratorRequest {
  return { ...request, system_prompt: `${request.system_prompt}\n\n${TRUNCATION_RECOVERY_NOTICE}` };
}
