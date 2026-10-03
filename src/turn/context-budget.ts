import { NARRATOR_OUTPUT_TOKENS } from "../app/provider-config.js";
import type { NarratorRequest } from "./stages/narration.js";
/** Operational request envelope, not a claim about any model's theoretical window. */
export const DEFAULT_CONTEXT_POLICY = Object.freeze({ request_tokens: 16_000, output_tokens: NARRATOR_OUTPUT_TOKENS, overhead_tokens: 256, safety_tokens: 512, warning: 0.8, auto: 0.9, hard: 1 });
export type ContextPolicy = { readonly [K in keyof typeof DEFAULT_CONTEXT_POLICY]: number };
export interface ContextBudgetSnapshot {
  estimated_tokens: number; usable_budget_tokens: number; fixed_instructions_tokens: number;
  usage_ratio: number; usage_percent: number; warning_threshold_ratio: number; auto_compaction_threshold_ratio: number; hard_limit_ratio: number;
  warning: boolean; compaction_required: boolean; hard_limit_reached: boolean;
}
/** No tokenizer exists in the repository. Conservative UTF-8 bytes / 4 heuristic, deterministic for Unicode too. */
export const estimateContextTokens = (text: string): number => Math.ceil(Buffer.byteLength(text, "utf8") / 4);
export class ContextBudgetManager {
  constructor(readonly policy: ContextPolicy = DEFAULT_CONTEXT_POLICY) {
    const p = policy;
    if (![p.request_tokens, p.output_tokens, p.overhead_tokens, p.safety_tokens].every(n => Number.isSafeInteger(n) && n >= 0) || !(0 < p.warning && p.warning < p.auto && p.auto < p.hard && p.hard <= 1)) throw new Error("Invalid context budget policy");
  }
  measure(request: NarratorRequest): ContextBudgetSnapshot {
    const fixed = estimateContextTokens(request.system_prompt);
    const usable = this.policy.request_tokens - this.policy.output_tokens - this.policy.overhead_tokens - this.policy.safety_tokens - fixed;
    if (usable <= 0) throw new Error("No usable narrator budget");
    const estimated = estimateContextTokens(JSON.stringify(request.messages)), ratio = estimated / usable;
    return Object.freeze({ estimated_tokens: estimated, usable_budget_tokens: usable, fixed_instructions_tokens: fixed, usage_ratio: ratio, usage_percent: ratio * 100,
      warning_threshold_ratio: this.policy.warning, auto_compaction_threshold_ratio: this.policy.auto, hard_limit_ratio: this.policy.hard,
      warning: ratio >= this.policy.warning, compaction_required: ratio >= this.policy.auto, hard_limit_reached: ratio >= this.policy.hard });
  }
}
/** Only accepts the already filtered request; never accepts a campaign/source snapshot. Exact bakeoff input. */
export function serializeContextBaseline(request: NarratorRequest, manager = new ContextBudgetManager()): string {
  return JSON.stringify({ version: 1, estimator: "utf8-bytes/4-ceil", policy: manager.policy, budget: manager.measure(request), request }, null, 2);
}
