import { ProviderError, type ProviderErrorCode } from "./errors.js";

/**
 * Hardening H5 — bounded transient-failure retry for provider calls. Transport classification only: a retry is a NEW request with the
 * same content, made before any commit, so it can never duplicate a state change. Nothing here knows about campaigns or revisions;
 * the coordinator supplies a `checkpoint` that throws on cancellation/stale revision, and that runs before every attempt and after
 * every backoff.
 *
 * Exact provider codes (src/llm/openrouter/client.ts maps the wire to these):
 *   RETRYABLE      rate_limited (HTTP 429) · timeout (attempt timer) · network_error (fetch rejection, connection reset, any
 *                  non-ProviderError) · provider_unavailable (HTTP >=500: 500/502/503/504, or an SSE error event with such a code)
 *   NON_RETRYABLE  cancelled · authentication_error (401/403) · configuration_error · structured_output_invalid · model_refusal ·
 *                  invalid_provider_response (HTTP 4xx other than 401/403/429, empty/oversized/truncated/malformed body, non-stop finish)
 * plus, outside this table, TurnError cancelled/stale_turn/invalid_input and every deterministic local error.
 * One narrator-only extra (see narrator stage): an empty or stream-inconsistent completion is retried, as it is a provider content fault.
 */
export const RETRYABLE_PROVIDER_CODES: ReadonlySet<ProviderErrorCode> = new Set<ProviderErrorCode>(["rate_limited", "timeout", "network_error", "provider_unavailable"]);
export type RetryClass = "retryable" | "non_retryable";
export function classifyProviderCode(code: ProviderErrorCode): RetryClass { return RETRYABLE_PROVIDER_CODES.has(code) ? "retryable" : "non_retryable"; }
/** The retry reason for a thrown value, or undefined when it must not be retried. */
export function providerRetryReason(error: unknown): string | undefined {
  return error instanceof ProviderError && classifyProviderCode(error.code) === "retryable" ? error.code : undefined;
}

export interface ProviderRetryPolicy {
  /** Total attempts including the first. 1 disables retry. Clamped to 1..3. */
  readonly max_attempts: number;
  /** Backoff before a retry is uniform in [backoff_ms, max_backoff_ms] (random injectable). */
  readonly backoff_ms: number;
  readonly max_backoff_ms: number;
  /** Provider wall time (calls + backoff) allowed per turn across narrator, controller and reconciliation. Each attempt's timeout is capped by what remains. */
  readonly turn_budget_ms: number;
  /** A retry starts only if at least this much budget remains after the backoff. */
  readonly min_retry_window_ms: number;
  /** A retry that follows a TIMEOUT gets at most this long (the provider is slow; a second full wait is not a "short retry"). Other failures fail fast and keep the full remaining budget. */
  readonly retry_after_timeout_cap_ms: number;
  /** The largest timeout any provider is configured with. An attempt timeout is passed to the provider only when the budget makes it SMALLER than this, so an unconstrained call sends no (clock-dependent) value. */
  readonly max_attempt_ms: number;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly now: () => number;
  readonly random: () => number;
}
/** Resolves early (never rejects) when the signal aborts; the caller's checkpoint then reports the cancellation. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}
/** Production default: one retry, 250–500 ms backoff, 120 s per-turn provider budget (the old chain could reach ~140 s), and a retry after a timeout capped at 30 s. */
export const DEFAULT_RETRY_POLICY: ProviderRetryPolicy = Object.freeze({ max_attempts: 2, backoff_ms: 250, max_backoff_ms: 500, turn_budget_ms: 120_000,
  min_retry_window_ms: 5_000, retry_after_timeout_cap_ms: 30_000, max_attempt_ms: 60_000, sleep: abortableSleep, now: () => performance.now(), random: Math.random });
/** Retry disabled: exactly one attempt, no budget capping beyond the provider's own timeout. */
export const NO_RETRY_POLICY: ProviderRetryPolicy = Object.freeze({ ...DEFAULT_RETRY_POLICY, max_attempts: 1, turn_budget_ms: Number.MAX_SAFE_INTEGER });
export function retryPolicy(overrides: Partial<ProviderRetryPolicy> = {}): ProviderRetryPolicy { return { ...DEFAULT_RETRY_POLICY, ...overrides }; }

/** Per-turn provider time budget. Created when the first provider call starts. */
export class ProviderBudget {
  readonly #deadline: number;
  constructor(private readonly policy: ProviderRetryPolicy) { this.#deadline = policy.now() + policy.turn_budget_ms; }
  remaining(): number { return Math.max(0, this.#deadline - this.policy.now()); }
}

/** What happened across the attempts of ONE logical provider call. No request content. */
export interface ProviderAttemptRecord {
  attempts: number; retry_reasons: string[]; recovered: boolean;
  /** Cumulative wall time of all attempts (excludes backoff). */
  provider_ms: number;
  /** "success" or the final failure code (ProviderErrorCode, or a local code such as narrator_failed / cancelled / stale_turn). */
  final_outcome: string;
}
export interface RetryRun<T> {
  readonly policy: ProviderRetryPolicy; readonly budget: ProviderBudget; readonly signal: AbortSignal;
  /** Throws TurnError on cancellation / stale revision; called before every attempt and after every backoff. */
  readonly checkpoint: () => void;
  /** Maps a thrown value to a retry reason, or undefined when it must not be retried. */
  readonly reason?: (error: unknown) => string | undefined;
  /** Called before every attempt (including the first) so callers can discard per-attempt buffers. */
  readonly attempt_started?: (attempt: number) => void;
  /** `timeout_ms` is undefined when the budget does not constrain the attempt. */
  readonly run: (attempt: number, timeout_ms: number | undefined) => Promise<T>;
  readonly record: (record: ProviderAttemptRecord) => void;
}
const codeOf = (error: unknown): string => error instanceof ProviderError ? error.code : error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "error";
export async function withProviderRetry<T>(i: RetryRun<T>): Promise<T> {
  const max = Math.min(3, Math.max(1, Math.trunc(i.policy.max_attempts) || 1));
  const rec: ProviderAttemptRecord = { attempts: 0, retry_reasons: [], recovered: false, provider_ms: 0, final_outcome: "pending" };
  const publish = () => i.record({ ...rec, retry_reasons: [...rec.retry_reasons] });
  let previous: string | undefined;
  for (let attempt = 1; ; attempt++) {
    try { i.checkpoint(); } catch (error) { rec.final_outcome = codeOf(error); publish(); throw error; }
    const remaining = i.budget.remaining();
    if (remaining < 1) { rec.final_outcome = "timeout"; publish(); throw new ProviderError("timeout"); }
    i.attempt_started?.(attempt);
    rec.attempts = attempt;
    const started = i.policy.now();
    try {
      const allowed = previous === "timeout" ? Math.min(remaining, i.policy.retry_after_timeout_cap_ms) : remaining;
      const result = await i.run(attempt, allowed < i.policy.max_attempt_ms ? Math.max(1, Math.floor(allowed)) : undefined);
      rec.provider_ms += i.policy.now() - started; rec.recovered = attempt > 1; rec.final_outcome = "success"; publish();
      return result;
    } catch (error) {
      rec.provider_ms += i.policy.now() - started;
      const reason = i.signal.aborted ? undefined : (i.reason ?? providerRetryReason)(error);
      const delay = Math.min(i.policy.max_backoff_ms, i.policy.backoff_ms + i.policy.random() * Math.max(0, i.policy.max_backoff_ms - i.policy.backoff_ms));
      if (!reason || attempt >= max || i.budget.remaining() - delay < i.policy.min_retry_window_ms) { rec.final_outcome = codeOf(error); publish(); throw error; }
      rec.retry_reasons.push(reason); previous = reason;
      await i.policy.sleep(delay, i.signal);
    }
  }
}
