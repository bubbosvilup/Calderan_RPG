import type { DeepReadonly } from "../types/readonly.js";
import type { ProviderAttemptRecord } from "../llm/retry.js";
import type { ReflectionRun } from "../turn/reflection.js";
import type { ReflectionDiagnostics } from "../turn/reflection-diagnostics.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { TurnEvent, TurnResult } from "../turn/turn-types.js";
import type { AppError } from "./app-errors.js";

/**
 * Per-turn playtest record. NOT campaign state: it is never saved with the campaign, lives in a bounded in-memory ring of the
 * session, and holds no prompts, no drafts, no private canon and no secrets. `turn_id` is the id a player quotes in a bug report.
 */
export interface TurnTrace {
  readonly turn_id: string; readonly campaign_id: string; readonly dataset_id: string; readonly sequence: number;
  readonly revision_before: number; readonly revision_after: number; readonly player_input: string;
  readonly outcome: "completed" | "failed" | "rejected";
  readonly error?: AppError;
  /** What text was delivered: the audited draft, a one-shot revision, or a deterministic redaction. */
  readonly narration_status?: "draft" | "revision" | "redacted";
  readonly delivered_narration?: string;
  readonly audit_issue_kinds: readonly string[]; readonly revision_issue_kinds: readonly string[];
  readonly committed_command_kinds: readonly string[]; readonly rejected_command_kinds: readonly string[];
  readonly movement?: { readonly location_before: string; readonly location_after: string; readonly minutes_elapsed: number; readonly characters_moved: readonly string[] };
  readonly retrieval_ids: readonly string[]; readonly retrieval_mode?: string; readonly context_chars?: number;
  readonly models?: { readonly narrator?: string; readonly controller?: string };
  readonly usage?: { readonly narrator?: DeepReadonly<{ prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }>; readonly controller?: DeepReadonly<{ prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }> };
  readonly latency_ms?: DeepReadonly<TurnResult["latency"]>;
  readonly provider_attempts?: DeepReadonly<{ narrator?: ProviderAttemptRecord; revision_narrator?: ProviderAttemptRecord; controller?: ProviderAttemptRecord }>;
  readonly failure?: { readonly phase?: string; readonly provider_code?: string };
  readonly reflection: { readonly status: "not_run" | "skipped_not_due" | "attempted" | "failed_nonblocking"; readonly characters: readonly { readonly character_id: string; readonly status: ReflectionRun["status"]; readonly committed_revision?: number }[]; readonly revisions_added: number };
  /** Full draft text, controller proposal and authorization evidence. Present only when the session was created with `unsafe_trace`. */
  readonly unsafe?: unknown;
}
export function emptyReflection(): TurnTrace["reflection"] { return { status: "not_run", characters: [], revisions_added: 0 }; }

export function summarizeReflection(runs: readonly ReflectionRun[], record: DeepReadonly<ReflectionDiagnostics> | undefined, revisionsAdded: number): TurnTrace["reflection"] {
  const characters = runs.map(r => ({ character_id: r.character_id, status: r.status, ...(r.committed_revision !== undefined ? { committed_revision: r.committed_revision } : {}) }));
  if (record?.skipped_reason === "not_due" || (!runs.length && record && record.due_count === 0)) return { status: "skipped_not_due", characters, revisions_added: revisionsAdded };
  const failed = runs.some(r => r.status === "provider_failed" || r.status === "malformed" || r.status === "stale");
  return { status: failed ? "failed_nonblocking" : runs.length ? "attempted" : "skipped_not_due", characters, revisions_added: revisionsAdded };
}
export interface TraceInput {
  readonly sequence: number; readonly campaign_id: string; readonly dataset_id: string; readonly player_input: string; readonly revision_before: number;
  readonly outcome: TurnTrace["outcome"]; readonly error?: AppError; readonly revision_after: number;
  readonly result?: DeepReadonly<TurnResult>; readonly failure_event?: Extract<TurnEvent, { type: "turn_failed" }>; readonly diagnostics?: DeepReadonly<TurnDiagnostics>;
  readonly movement?: TurnTrace["movement"]; readonly unsafe?: boolean;
}
export const turnIdOf = (campaign_id: string, revision_before: number, sequence: number) => `${campaign_id}:r${revision_before}:t${sequence}`;
export function buildTrace(i: TraceInput): TurnTrace {
  const r = i.result, d = i.diagnostics;
  const narratorModel = r?.narrator.model ?? d?.narrator?.model, controllerModel = r?.controller.model ?? d?.controller?.model;
  const retrievalMode = r?.retrieval.mode ?? d?.retrieval?.mode;
  const rejected = r ? r.authorization.filter(a => !a.authorized).map(a => a.command.kind) : [];
  return {
    turn_id: turnIdOf(i.campaign_id, i.revision_before, i.sequence), campaign_id: i.campaign_id, dataset_id: i.dataset_id, sequence: i.sequence, revision_before: i.revision_before, revision_after: i.revision_after,
    player_input: i.player_input, outcome: i.outcome, ...(i.error ? { error: i.error } : {}),
    ...(r ? { narration_status: r.narration_reconciliation?.delivered ?? "draft" as const, delivered_narration: r.narration } : {}),
    audit_issue_kinds: [...new Set(r?.narration_reconciliation?.issues.map(x => x.kind) ?? d?.audit?.issue_kinds ?? [])],
    revision_issue_kinds: [...new Set(r?.narration_reconciliation?.revision_issues?.map(x => x.kind) ?? d?.audit?.revision_issue_kinds ?? [])],
    committed_command_kinds: r ? r.authorized_commands.map(c => c.kind) : [], rejected_command_kinds: rejected,
    ...(i.movement ? { movement: i.movement } : {}),
    retrieval_ids: [...(r?.retrieval.ids ?? d?.retrieval?.ids ?? [])], ...(retrievalMode ? { retrieval_mode: retrievalMode } : {}),
    ...(d?.context ? { context_chars: d.context.serialized_characters } : {}),
    ...(narratorModel || controllerModel ? { models: { ...(narratorModel ? { narrator: narratorModel } : {}), ...(controllerModel ? { controller: controllerModel } : {}) } } : {}),
    ...(r ? { usage: { narrator: r.narrator.usage, controller: r.controller.usage }, latency_ms: r.latency } : {}),
    ...(d?.provider_attempts ? { provider_attempts: d.provider_attempts } : {}),
    ...(i.outcome === "failed" ? { failure: { ...(d?.failure_phase ? { phase: d.failure_phase } : {}), ...(i.failure_event?.provider_code ? { provider_code: i.failure_event.provider_code } : {}) } } : {}),
    reflection: emptyReflection(),
    ...(i.unsafe && r ? { unsafe: { draft: r.narration_reconciliation?.draft, revision: r.narration_reconciliation?.revision, controller_proposal: r.controller_proposal, authorization: r.authorization } } : {}),
  };
}
export interface DebugExport { readonly format: "caldrevan-turn-debug"; readonly version: 1; readonly exported_for: string; readonly includes_unsafe_content: boolean; readonly snapshot_metadata: { readonly campaign_id: string; readonly dataset_id: string; readonly revision_before: number; readonly revision_after: number; readonly current_revision: number }; readonly trace: TurnTrace }
/** Safe by default: the trace already excludes drafts, prompts and proposals; `unsafe` content is stripped unless explicitly requested. */
export function exportTrace(trace: TurnTrace, current_revision: number, unsafe: boolean): DebugExport {
  const { unsafe: unsafeContent, ...safe } = trace;
  return { format: "caldrevan-turn-debug", version: 1, exported_for: trace.turn_id, includes_unsafe_content: unsafe && unsafeContent !== undefined,
    snapshot_metadata: { campaign_id: trace.campaign_id, dataset_id: trace.dataset_id, revision_before: trace.revision_before, revision_after: trace.revision_after, current_revision },
    trace: (unsafe && unsafeContent !== undefined ? trace : safe) as TurnTrace };
}
