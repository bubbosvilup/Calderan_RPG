import { ProviderError } from "../llm/errors.js";
import type { FinishReason, GenerationMetadata } from "../llm/types.js";

/**
 * Consolidation block 4 (NARR-1) — the Narrator call ledger of ONE logical player turn.
 *
 * LOGICAL generations (at most 2): `primary`, then exactly one more — either the truncation `recovery` regeneration or the audit `revision`.
 * PHYSICAL provider attempts (at most 3, hard): every request sent to the Narrator provider, whichever generation or infrastructure retry
 * caused it. Retries and regenerations draw from the SAME budget, so they can never multiply (3 = 1 + one retry + one regeneration, or
 * 1 + one regeneration + one retry, never 4).
 *
 * The ledger is also the observability record: one entry per physical attempt (outcome, finish reason, tokens, model, provider, route).
 * It holds no prompt and no prose.
 */
export const NARRATOR_PHYSICAL_ATTEMPT_BUDGET = 3;
export const NARRATOR_LOGICAL_GENERATION_BUDGET = 2;
/** The cap of the single truncation-recovery regeneration. The ordinary cap (768) lives in the provider configuration; a recovery is never sent with it. */
export const NARRATOR_RECOVERY_OUTPUT_TOKENS = 1024;
export type NarratorGeneration = "primary" | "recovery" | "revision";
export type NarratorAttemptOutcome = "stop" | "length" | "content_filter" | "malformed" | "provider_error" | "cancelled" | "pending";
export interface NarratorAttemptTrace {
  readonly index: number; readonly generation: NarratorGeneration; outcome: NarratorAttemptOutcome;
  finish_reason?: FinishReason | undefined; error_code?: string | undefined;
  max_output_tokens?: number | undefined; completion_tokens?: number | undefined; total_tokens?: number | undefined; cost_usd?: number | undefined;
  model?: string | undefined; response_model?: string | undefined; provider?: string | undefined; route?: string | undefined; generation_id?: string | undefined;
}
export type TruncationRecovery = "not_needed" | "succeeded" | "failed" | "budget_exhausted";
export interface NarratorGenerationTrace {
  readonly logical_generations: number; readonly physical_attempts: number;
  readonly max_logical_generations: number; readonly max_physical_attempts: number;
  readonly attempts: readonly NarratorAttemptTrace[];
  readonly truncation: { readonly detected: boolean; readonly recovery_attempted: boolean; readonly recovery_result: TruncationRecovery };
}
/** Raised when a Narrator call would exceed the turn's budget. Never retried, never reaches the provider. */
export class NarratorBudgetExhausted extends Error { constructor(readonly kind: "physical" | "logical") { super(`Narrator ${kind} budget exhausted`); } }

export function attemptOutcomeOf(error: unknown): { readonly outcome: NarratorAttemptOutcome; readonly error_code?: string } {
  if (error instanceof ProviderError) {
    if (error.code === "cancelled") return { outcome: "cancelled", error_code: error.code };
    if (error.code === "model_refusal") return { outcome: "content_filter", error_code: error.code };
    if (error.code === "invalid_provider_response" || error.code === "structured_output_invalid") return { outcome: "malformed", error_code: error.code };
    return { outcome: "provider_error", error_code: error.code };
  }
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (code === "narrator_failed" || code === "context_too_large") return { outcome: "malformed", error_code: String(code) };
  return { outcome: "provider_error", error_code: "error" };
}

export class NarratorLedger {
  readonly #attempts: NarratorAttemptTrace[] = [];
  readonly #generations: NarratorGeneration[] = [];
  #detected = false; #recovery: TruncationRecovery = "not_needed"; #recoveryAttempted = false;
  constructor(readonly max_physical: number = NARRATOR_PHYSICAL_ATTEMPT_BUDGET, readonly max_logical: number = NARRATOR_LOGICAL_GENERATION_BUDGET) {}
  get physical(): number { return this.#attempts.length; }
  get logical(): number { return this.#generations.length; }
  physicalRemaining(): number { return Math.max(0, this.max_physical - this.#attempts.length); }
  logicalRemaining(): number { return Math.max(0, this.max_logical - this.#generations.length); }
  /** Opens a logical generation (the first physical attempt of a call). Throws when the turn already used its second one. */
  beginGeneration(kind: NarratorGeneration): void {
    if (this.#generations.length >= this.max_logical) throw new NarratorBudgetExhausted("logical");
    if (this.#attempts.length >= this.max_physical) throw new NarratorBudgetExhausted("physical");
    this.#generations.push(kind);
    if (kind === "recovery") this.#recoveryAttempted = true;
  }
  /** Reserves one physical provider request for the current generation. */
  beginAttempt(generation: NarratorGeneration, max_output_tokens?: number): NarratorAttemptTrace {
    if (this.#attempts.length >= this.max_physical) throw new NarratorBudgetExhausted("physical");
    const attempt: NarratorAttemptTrace = { index: this.#attempts.length + 1, generation, outcome: "pending", ...(max_output_tokens !== undefined ? { max_output_tokens } : {}) };
    this.#attempts.push(attempt);
    return attempt;
  }
  complete(attempt: NarratorAttemptTrace, metadata: Partial<GenerationMetadata> & { readonly finish_reason?: FinishReason | undefined }, outcome: "stop" | "length" | "malformed"): void {
    attempt.outcome = outcome; attempt.finish_reason = metadata.finish_reason;
    attempt.completion_tokens = metadata.usage?.completion_tokens; attempt.total_tokens = metadata.usage?.total_tokens; attempt.cost_usd = metadata.cost_usd;
    attempt.model = metadata.model; attempt.response_model = metadata.response_model; attempt.provider = metadata.provider; attempt.generation_id = metadata.generation_id;
    attempt.max_output_tokens = metadata.max_output_tokens ?? attempt.max_output_tokens; attempt.route = metadata.route;
    if (outcome === "length") this.#detected = true;
  }
  fail(attempt: NarratorAttemptTrace, error: unknown): void { const { outcome, error_code } = attemptOutcomeOf(error); attempt.outcome = outcome; attempt.error_code = error_code; }
  recovery(result: TruncationRecovery): void { this.#recovery = result; }
  get recoveryAttempted(): boolean { return this.#recoveryAttempted; }
  snapshot(): NarratorGenerationTrace {
    return { logical_generations: this.#generations.length, physical_attempts: this.#attempts.length, max_logical_generations: this.max_logical, max_physical_attempts: this.max_physical,
      attempts: this.#attempts.map(a => ({ ...a })), truncation: { detected: this.#detected, recovery_attempted: this.#recoveryAttempted, recovery_result: this.#recovery } };
  }
}
