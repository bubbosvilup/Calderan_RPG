import { freezeSnapshot } from "../campaign/validation.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { ReflectionRun } from "./reflection.js";

const MAX_CHARACTERS = 32;
export interface ReflectionDiagnostics {
  readonly base_revision: number; readonly final_revision: number; readonly due_characters: readonly string[]; readonly due_count: number; readonly deferred_count: number;
  readonly attempted: number; readonly skipped_reason?: "not_due";
  readonly elapsed_ms: number;
  readonly characters: readonly { readonly character_id: string; readonly status: ReflectionRun["status"]; readonly provider_success: boolean;
    readonly skipped_reason?: "no_evidence"; readonly parsed_proposals: number; readonly accepted_proposals: number; readonly rejected_by_reason: Partial<Record<string, number>>;
    readonly logical_reflection_id?:string;readonly source_revision?:number;readonly model?:string;readonly provider?:string;readonly cost_usd?:number;readonly attempt_details?:readonly import("./reflection-pacing.js").StructuredReflectionAttempt[];readonly semantic_result?:ReflectionRun["semantic_result"];
    readonly attempts?: ReflectionRun["attempts"];
    readonly stale_drop: boolean; readonly committed_revision?: number; readonly input_tokens?: number; readonly output_tokens?: number;
    readonly elapsed_ms: number; readonly provider_ms: number; readonly new_notes: number; readonly updated_notes: number }[];
}
export type ReflectionDiagnosticsSink = (record: DeepReadonly<ReflectionDiagnostics>) => unknown;
export function emitReflectionDiagnostics(sink: ReflectionDiagnosticsSink | undefined, base: number, final: number, due: readonly string[], runs: readonly ReflectionRun[], elapsed_ms: number): void {
  if (!sink) return;
  try {
    const characters = runs.slice(0, MAX_CHARACTERS).map(r => {
      const rejected_by_reason: Partial<Record<string, number>> = {};
      for (const rejection of r.rejected) rejected_by_reason[rejection.reason] = (rejected_by_reason[rejection.reason] ?? 0) + 1;
      const usage = r.usage && typeof r.usage === "object" ? r.usage as Record<string, unknown> : {};
      const tokens = (key: string) => typeof usage[key] === "number" && Number.isSafeInteger(usage[key]) && (usage[key] as number) >= 0 ? usage[key] as number : undefined;
      const input_tokens = tokens("prompt_tokens"), output_tokens = tokens("completion_tokens");
      return { ...(r.attempts ? { attempts: r.attempts } : {}),...(r.logical_reflection_id?{logical_reflection_id:r.logical_reflection_id}:{}),...(r.source_revision!==undefined?{source_revision:r.source_revision}:{}),...(r.model?{model:r.model}:{}),...(r.provider?{provider:r.provider}:{}),...(r.cost_usd!==undefined?{cost_usd:r.cost_usd}:{}),...(r.attempt_details?{attempt_details:r.attempt_details}:{}),...(r.semantic_result?{semantic_result:r.semantic_result}:{}),character_id: r.character_id, status: r.status, provider_success: r.status !== "provider_failed" && r.status !== "no_evidence" && r.status !== "malformed",
        ...(r.status === "no_evidence" ? { skipped_reason: "no_evidence" as const } : {}), parsed_proposals: r.parsed_proposals ?? 0,
        accepted_proposals: r.accepted.length, rejected_by_reason, stale_drop: r.status === "stale", ...(r.committed_revision !== undefined ? { committed_revision: r.committed_revision } : {}),
        ...(input_tokens !== undefined ? { input_tokens } : {}), ...(output_tokens !== undefined ? { output_tokens } : {}),
        elapsed_ms: r.elapsed_ms ?? 0, provider_ms: r.provider_ms ?? 0, new_notes: r.new_notes ?? 0, updated_notes: r.updated_notes ?? 0 };
    });
    const record: ReflectionDiagnostics = { base_revision: base, final_revision: final, due_characters: due.slice(0, MAX_CHARACTERS), due_count: due.length,
      deferred_count: Math.max(0, due.length - runs.length), attempted: runs.filter(r => r.status !== "no_evidence").length,
      ...(!due.length ? { skipped_reason: "not_due" as const } : {}), elapsed_ms, characters };
    const result = sink(freezeSnapshot(record));
    if (result instanceof Promise) void result.catch(() => {});
  } catch { /* Optional diagnostics cannot change reflection or gameplay. */ }
}
