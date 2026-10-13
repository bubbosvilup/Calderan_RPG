import { createProductionDeps } from "../../app/index.js";
import type { SessionDeps, TurnOutcome } from "../../app/game-session.js";

/**
 * Shared infrastructure of the current live certifications (Repository Cleanup E): the session setup, the one-retry rule, the usage totals and the
 * OpenRouter wire recorder that each harness used to copy. Evaluation only. Importing this module makes no provider call; the harnesses do.
 * Scenario steps, verdicts and output shapes stay in each harness.
 */

/** Provider failures that may be retried once, and only when the failed turn changed no state. */
export const TRANSIENT_PROVIDER_CODES: ReadonlySet<string> = new Set(["network_error", "timeout", "rate_limited", "provider_unavailable"]);

/** Production session deps for a live run: no portrait generator, no sprite reviewer, no autosave, Reflection off. */
export async function liveSessionDeps(save_dir: string, prepared_narrator_observer?: (request: unknown) => void): Promise<SessionDeps> {
  const base = await createProductionDeps({ save_dir, persistent_campaigns: true, reflection_mode: "off", ...(prepared_narrator_observer ? { prepared_narrator_observer } : {}) });
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
  return { ...rest, autosave: false };
}

/** One player turn with no reroll: a single retry, only for a transient provider failure that did not change the turn state. */
export async function submitWithTransientRetry(session: { submitPlayerInput(input: string): Promise<TurnOutcome> }, input: string): Promise<{ readonly outcome: TurnOutcome; readonly attempts: number }> {
  let outcome: TurnOutcome, attempts = 0;
  for (;;) {
    attempts++; outcome = await session.submitPlayerInput(input);
    if (outcome.ok || attempts >= 2) break;
    if (!(TRANSIENT_PROVIDER_CODES.has(outcome.error.provider_code ?? "") && !outcome.error.turn_state_changed)) break;
  }
  return { outcome, attempts };
}

/** Sums every `total_tokens` and `cost` / `cost_usd` figure anywhere in a turn trace's usage record. */
export function usageTotals(usage: unknown): { readonly tokens: number; readonly cost_usd: number } {
  const text = JSON.stringify(usage ?? {}); let tokens = 0, cost_usd = 0;
  for (const m of text.matchAll(/"total_tokens":(\d+)/g)) tokens += Number(m[1]);
  for (const m of text.matchAll(/"cost(?:_usd)?":([\d.]+)/g)) cost_usd += Number(m[1]);
  return { tokens, cost_usd };
}

export interface WireEntry { readonly n: number; readonly model: unknown; status?: number }

/** Wraps `globalThis.fetch` once and records the model and HTTP status of every OpenRouter request; other requests pass through untouched. */
export function recordOpenRouterWire(): WireEntry[] {
  const wire: WireEntry[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
    const entry: WireEntry = { n: wire.length + 1, model: (JSON.parse(init.body) as { model?: unknown }).model }; wire.push(entry);
    const response = await realFetch(input, init); entry.status = response.status; return response;
  }) as typeof fetch;
  return wire;
}
