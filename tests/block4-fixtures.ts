import { ProviderError, type ProviderErrorCode } from "../src/llm/errors.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { retryPolicy, type ProviderRetryPolicy } from "../src/llm/retry.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { GameSession, type SessionDeps } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { metadata, transfer } from "./turn-fixtures.js";

/** One PHYSICAL narrator request. `text` + `finish` completes (finish defaults to stop); `fail` throws before any text. */
export type NarratorStep = { readonly text: string; readonly finish?: string; readonly tokens?: number } | { readonly fail: ProviderErrorCode };
export interface CountingNarrator extends NarratorProvider { readonly requests: GenerationRequest[]; calls(): number; hold?: Promise<void> }
/**
 * A narrator that mimics the production adapter's contract: a `length` ending is returned as a completed result only when the request says
 * `accept_truncated`; otherwise it is the strict provider error. The last step repeats.
 */
export function stepNarrator(steps: readonly NarratorStep[], gate?: () => Promise<void>): CountingNarrator {
  const requests: GenerationRequest[] = []; let calls = 0;
  return { requests, calls: () => calls,
    async generate() { throw new Error("unused"); },
    async *stream(request) {
      requests.push(request); const step = steps[Math.min(calls++, steps.length - 1)]!;
      if (gate) await gate();
      if ("fail" in step) { yield { type: "error", text: "", incomplete: true, error: new ProviderError(step.fail) }; return; }
      const finish = step.finish ?? "stop";
      if (finish === "length" && !request.accept_truncated) { yield { type: "error", text: step.text, incomplete: true, error: new ProviderError("invalid_provider_response", undefined, undefined, "finish_reason_length") }; return; }
      yield { type: "text_delta", text: step.text };
      yield { type: "completed", result: { text: step.text, ...metadata, usage: { prompt_tokens: 10, completion_tokens: step.tokens ?? 5, total_tokens: 10 + (step.tokens ?? 5) },
        finish_reason: finish as "stop", max_output_tokens: request.max_output_tokens ?? 768, provider: "test-provider", route: "test-route" } };
    } };
}
export interface CountingController extends StateControllerProvider { calls(): number }
export function countingController(commands: readonly CampaignCommand[] = []): CountingController {
  let calls = 0; return { calls: () => calls, async propose() { calls++; return { commands, ...metadata }; } };
}
export const fastRetry = (max_attempts = 2): ProviderRetryPolicy => retryPolicy({ max_attempts, backoff_ms: 0, max_backoff_ms: 0, sleep: async () => {} });

export function coordinatorWith(narrator: NarratorProvider, controller: StateControllerProvider = countingController(), options: { retry?: ProviderRetryPolicy | false; diagnostics?: (r: unknown) => void } = {}) {
  const fixture = turnFixture(); const service = new RetrievalService(fixture.world); const retrieval = { service, search: new HybridSearch(service) };
  const coordinator = new TurnCoordinator(fixture.world, narrator, controller, retrieval, { provider_retry: options.retry === undefined ? fastRetry() : options.retry,
    ...(options.diagnostics ? { diagnostics_sink: options.diagnostics as never } : {}) });
  return { ...fixture, retrieval, coordinator };
}
export const NARRATION = "Brenna looks up from her work and nods once.";

/**
 * A GameSession over the turn fixture with counted providers. `save_dir` makes it persistent (a real FileCampaignRepository on a temp dir);
 * `wrap` lets a test decorate the real coordinator (fault injection) without touching its private state.
 */
export function sessionWith(narrator: NarratorProvider, controller: StateControllerProvider = countingController(), options: { save_dir?: string; retry?: ProviderRetryPolicy | false; wrap?: (c: TurnCoordinator) => TurnCoordinator; autosave?: false } = {}) {
  const fixture = turnFixture(); const service = new RetrievalService(fixture.world); const retrieval = { service, search: new HybridSearch(service) };
  const repository = new FileCampaignRepository(fixture.world, options.save_dir ?? "saves/__unused_block4__");
  const make = (hooks: object) => { const c = new TurnCoordinator(fixture.world, narrator, controller, retrieval, { ...hooks, provider_retry: options.retry === undefined ? fastRetry() : options.retry }); return options.wrap ? options.wrap(c) : c; };
  const deps: SessionDeps = { world: fixture.world, repository, createCoordinator: make, ...(options.autosave === false ? { autosave: false as const } : {}) };
  const session = GameSession.fromCampaign(deps, fixture.campaign);
  return { ...fixture, session, deps, narrator, controller, repository };
}
/** Decorates a coordinator: `runTurn` is replaced, every other member stays bound to the real instance (private fields intact). */
export function withRunTurn(real: TurnCoordinator, runTurn: (real: TurnCoordinator, request: Parameters<TurnCoordinator["runTurn"]>[0]) => AsyncGenerator<TurnEvent>): TurnCoordinator {
  return new Proxy(real, { get(target, key) { if (key === "runTurn") return (request: Parameters<TurnCoordinator["runTurn"]>[0]) => runTurn(target, request);
    const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; } });
}
export { transfer };
