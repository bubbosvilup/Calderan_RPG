import { ProviderError, type ProviderErrorCode } from "../src/llm/errors.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { ControllerRequest } from "../src/llm/state-controller-provider.js";
import { retryPolicy, type ProviderRetryPolicy } from "../src/llm/retry.js";
import { metadata } from "./turn-fixtures.js";

/**
 * Hardening H5 — reusable, deterministic provider failure scripts. One step per provider call; the last step repeats.
 *   "ok"                      completes with the supplied text / commands
 *   { fail: code }            throws ProviderError(code) before any text
 *   { partial: text, fail }   streams `text`, then fails (the discarded-draft case)
 *   "empty"                   narrator: completes with empty text; controller: n/a
 *   "malformed"               controller: throws structured_output_invalid
 *   { hang: true }            waits for the request signal and fails cancelled
 */
export type Step = "ok" | "empty" | "malformed" | { readonly fail: ProviderErrorCode } | { readonly partial: string; readonly fail: ProviderErrorCode };
export const failOnce = (code: ProviderErrorCode): Step[] => [{ fail: code }, "ok"];
export const failTwice = (code: ProviderErrorCode): Step[] => [{ fail: code }, { fail: code }, "ok"];

export interface ScriptedNarrator extends NarratorProvider { readonly requests: GenerationRequest[]; calls(): number }
export function scriptedNarrator(texts: readonly string[], script: readonly Step[] = ["ok"]): ScriptedNarrator {
  const requests: GenerationRequest[] = []; let successes = 0, calls = 0;
  return { requests, calls: () => calls,
    async generate() { throw new Error("unused"); },
    async *stream(request) {
      requests.push(request); const step = script[Math.min(calls++, script.length - 1)]!;
      const text = texts[Math.min(successes, texts.length - 1)]!;
      if (step === "empty") { yield { type: "completed", result: { text: "", ...metadata } }; return; }
      if (typeof step === "object") { if ("partial" in step) yield { type: "text_delta", text: step.partial }; throw new ProviderError(step.fail); }
      if (step === "malformed") throw new ProviderError("invalid_provider_response");
      successes++;
      yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } };
    } };
}
export interface ScriptedController extends StateControllerProvider { readonly requests: ControllerRequest[]; calls(): number }
export function scriptedController(commands: readonly CampaignCommand[], script: readonly Step[] = ["ok"]): ScriptedController {
  const requests: ControllerRequest[] = []; let calls = 0;
  return { requests, calls: () => calls, async propose(request) {
    requests.push(request); const step = script[Math.min(calls++, script.length - 1)]!;
    if (step === "malformed") throw new ProviderError("structured_output_invalid");
    if (typeof step === "object") throw new ProviderError(step.fail);
    return { commands: [...commands], ...metadata };
  } };
}
/** Fake clock + sleep: delays advance virtual time and are recorded; `during` runs inside the backoff (abort / mutate hooks). */
export function fakeRetry(overrides: Partial<ProviderRetryPolicy> = {}, during?: (ms: number, signal: AbortSignal) => void) {
  let clock = 0; const sleeps: number[] = [];
  const policy = retryPolicy({ backoff_ms: 300, max_backoff_ms: 300, random: () => 0, now: () => clock,
    sleep: async (ms, signal) => { sleeps.push(ms); clock += ms; during?.(ms, signal); }, ...overrides });
  return { policy, sleeps, advance: (ms: number) => { clock += ms; }, clock: () => clock };
}
