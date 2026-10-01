import type { NarratorProvider, NarratorResult } from "../../llm/narrator-provider.js";
import type { GenerationRequest } from "../../llm/types.js";
import type { TurnContext } from "../context-builder.js";
import { buildNarratorPrompt, type NarratorPromptOptions } from "../prompt-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "../scene-participants.js";
import { TurnError } from "../turn-types.js";
import type { TurnIntent } from "./intent.js";

/**
 * Hardening H2 — NarrationStage. The narrator writes a DRAFT: it is buffered and never delivered until the controller, authorization,
 * final preparation and the audit/reconciliation have resolved the turn (Repair 1, authoritative narration order). No retry, no
 * fallback model, no timeout policy here (H5).
 */

export type NarratorRequest = Pick<GenerationRequest, "system_prompt" | "messages">;
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
 */
export function createDraftGenerator(narrator: NarratorProvider, signal: AbortSignal, checkpoint: () => void, on_delta?: (characters: number) => void): DraftGenerator {
  return async request => {
    let buffer = "", result: NarratorResult | undefined;
    for await (const event of narrator.stream({ ...request, signal })) {
      checkpoint();
      if (event.type === "error") throw event.error;
      if (event.type === "text_delta") { buffer += event.text; on_delta?.(event.text.length); if (buffer.length > 24_000) throw new TurnError("context_too_large"); }
      else { if (event.result.text !== buffer || !buffer.trim()) throw new TurnError("narrator_failed"); result = event.result; }
    }
    if (!result) throw new TurnError("narrator_failed");
    return { text: buffer, result };
  };
}

