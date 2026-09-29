import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
export const metadata = { model: "offline-mock", usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, latency: { request_started_at: "2026-01-01T00:00:00Z", headers_ms: 1, time_to_first_token_ms: 2, completed_at: "2026-01-01T00:00:01Z", elapsed_total_ms: 3 } };
export const transfer: CampaignCommand = { kind: "transfer_item", item_id: "boots", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } };
export function mockNarrator(text: string, inspect?: (request: GenerationRequest) => void): NarratorProvider {
  return { async generate(request) { inspect?.(request); return { text, ...metadata }; }, async *stream(request) { inspect?.(request); yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
export function mockController(commands: readonly CampaignCommand[], before?: () => void): StateControllerProvider { return { async propose() { before?.(); return { commands, ...metadata }; } }; }
export function setup(text = "Brenna smiles.", commands: readonly CampaignCommand[] = [], groundGarments = false) {
  const fixture = turnFixture(groundGarments); const service = new RetrievalService(fixture.world); const retrieval = { service, search: new HybridSearch(service) };
  return { ...fixture, retrieval, coordinator: new TurnCoordinator(fixture.world, mockNarrator(text), mockController(commands), retrieval) };
}
export async function collect<T>(events: AsyncIterable<T>): Promise<T[]> { const result: T[] = []; for await (const event of events) result.push(event); return result; }
