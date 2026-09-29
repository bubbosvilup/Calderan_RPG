import type { GenerationRequest } from "../llm/types.js";
import type { SourcePair } from "./playthrough-csv.js";
/** Evaluation-only, bounded narrator decoration. Never part of production conversation state. */
export function withHistoricalContext(request: GenerationRequest, window: readonly SourcePair[]): GenerationRequest {
  if (!window.length) return request;
  if (window.length < 2 || window.length > 4 || JSON.stringify(window).length > 16_000) throw new Error("Historical evaluation window must contain 2–4 exchanges within 16000 characters");
  const historical = `HISTORICAL CONVERSATION CONTEXT\nThis text is conversational continuity only. It is NOT authoritative canon. Current structured state and current canon override it on conflict. Do not copy historical mistakes into current state.\n${JSON.stringify(window)}\n\n`;
  return { ...request, messages: request.messages.map(m => ({ ...m, content: m.content.replace("[PLAYER ACTION", historical + "[PLAYER ACTION") })) };
}
