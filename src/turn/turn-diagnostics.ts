import { freezeSnapshot } from "../campaign/validation.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { GenerationMetadata } from "../llm/types.js";
import type { TurnContext } from "./context-builder.js";
import { CONTEXT_LIMITS, contextSerializedCharacters } from "./context-builder.js";
import { RETRIEVAL_LIMITS } from "./retrieval-policy.js";
import type { AuthorizationDiagnostic, TurnFailure } from "./turn-types.js";

export type DiagnosticPhase = "input_intent" | "projection" | "retrieval" | "prompt_composition" | "narrator" | "reconciliation_narrator" | "controller" | "authorization" | "preparation" | "audit" | "reconciliation" | "reconciliation_audit" | "commit_preparation" | "commit" | "publication";
export interface TurnDiagnostics {
  turn_id: string; base_revision: number; final_revision: number; outcome: "running" | "success" | "failure" | "abandoned";
  failure_code?: TurnFailure; failure_phase?: DiagnosticPhase; provider_code?: string;
  stage_timings: Partial<Record<DiagnosticPhase, { deterministic_ms: number; provider_ms: number }>>;
  retrieval?: { triggered: boolean; mode: string; ids: readonly string[]; reference_count: number; fetched_count: number; payload_characters: number; latency_ms: number; lexical_used: boolean; fallback_to_lexical?: boolean; fallback_reason?: string; limits: typeof RETRIEVAL_LIMITS; query?: string; failure_code?: string };
  context?: { serialized_characters: number; max_characters: number; people_shown: number; items_shown: number; facts_total: number; facts_shown: number; events_total: number; events_shown: number; relationships_total: number; relationships_shown: number; omitted_non_present_household_members: number; knowledge_access_compaction_used?: boolean; projection?: TurnContext["projection"] };
  context_too_large_cause?: DiagnosticPhase;
  narrator?: { model?: string; usage?: GenerationMetadata["usage"]; latency_ms?: number; completed: boolean; streamed_characters: number; final_text_characters: number };
  revision_narrator?: TurnDiagnostics["narrator"];
  controller?: { model: string; usage: GenerationMetadata["usage"]; latency_ms: number; parse_success: boolean; proposed_count: number; command_kinds: readonly string[]; normalization_used: boolean };
  authorization?: { proposed_count: number; authorized_count: number; rejected_count: number; decisions: readonly { kind: string; authorized: boolean; reason: string; evidence_check?: string }[] };
  audit?: { issue_count: number; issue_kinds: readonly string[]; reconciliation_attempted: boolean; revision_issue_count: number; revision_issue_kinds: readonly string[]; redaction_used: boolean; delivered: string };
  commit: { attempted: boolean; succeeded: boolean; prepare_changed?: boolean; command_count?: number; command_kinds?: readonly string[]; identity_promotion_count?: number; identity_skipped?: boolean; location_changed_naming_skip?: boolean };
}
export type TurnDiagnosticsSink = (record: DeepReadonly<TurnDiagnostics>) => unknown;
let sequence = 0;
/** Opt-in observer; never passed to prompts, campaign state or save serialization. */
export class TurnDiagnosticObserver {
  readonly #frames: { phase: DiagnosticPhase; start: number; children: number }[] = [];
  phase: DiagnosticPhase = "input_intent";
  readonly record: TurnDiagnostics;
  constructor(revision: number) {
    this.record = { turn_id: `turn-${++sequence}`, base_revision: revision, final_revision: revision, outcome: "running", stage_timings: {}, commit: { attempted: false, succeeded: false } };
  }
  sync<T>(phase: DiagnosticPhase, action: () => T): T {
    const frame = this.begin(phase); let completed = false;
    try { const result = action(); completed = true; return result; } finally { this.finish(frame, false, completed); }
  }
  async async<T>(phase: DiagnosticPhase, action: () => Promise<T>, provider = false): Promise<T> {
    const frame = this.begin(phase); let completed = false;
    try { const result = await action(); completed = true; return result; } finally { this.finish(frame, provider, completed); }
  }
  private begin(phase: DiagnosticPhase) {
    this.phase = phase; const frame = { phase, start: performance.now(), children: 0 }; this.#frames.push(frame); return frame;
  }
  private finish(frame: { phase: DiagnosticPhase; start: number; children: number }, provider: boolean, completed: boolean): void {
    const duration = performance.now() - frame.start;
    this.#frames.pop(); const parent = this.#frames.at(-1);
    if (parent) { parent.children += duration; if (completed) this.phase = parent.phase; }
    this.addElapsed(frame.phase, Math.max(0, duration - frame.children), provider);
  }
  elapsed(phase: DiagnosticPhase, start: number, provider: boolean): void {
    this.addElapsed(phase, performance.now() - start, provider);
  }
  private addElapsed(phase: DiagnosticPhase, duration: number, provider: boolean): void {
    const timing = this.record.stage_timings[phase] ??= { deterministic_ms: 0, provider_ms: 0 };
    timing[provider ? "provider_ms" : "deterministic_ms"] += duration;
  }
  context(context: TurnContext): void {
    this.record.context = { serialized_characters: contextSerializedCharacters(context), max_characters: CONTEXT_LIMITS.serialized_characters,
      people_shown: context.characters.length, items_shown: context.items.length, facts_total: context.projection?.facts?.total ?? context.facts.length,
      facts_shown: context.facts.length, events_total: context.projection?.scheduled_events?.total ?? context.scheduled_events.length, events_shown: context.scheduled_events.length,
      relationships_total: context.projection?.relationships?.total ?? context.social.relationships.length, relationships_shown: context.social.relationships.length,
      omitted_non_present_household_members: context.projection?.household_members_not_present?.omitted ?? 0,
      ...(context.projection ? { projection: context.projection } : {}) };
  }
  authorization(decisions: readonly AuthorizationDiagnostic[]): void {
    const count = decisions.filter(d => d.authorized).length;
    this.record.authorization = { proposed_count: decisions.length, authorized_count: count, rejected_count: decisions.length - count,
      decisions: decisions.map(d => ({ kind: d.command.kind, authorized: d.authorized, reason: d.reason, ...(d.evidence ? { evidence_check: d.evidence.check } : {}) })) };
  }
  emit(sink: TurnDiagnosticsSink, revision: number): void {
    this.record.final_revision = revision;
    if (this.record.outcome === "running") this.record.outcome = "abandoned";
    try {
      const emission = sink(freezeSnapshot(structuredClone(this.record)));
      if (emission instanceof Promise) void emission.catch(() => { /* Async sink rejection is equally non-authoritative. */ });
    } catch { /* Observability cannot change gameplay. */ }
  }
}
