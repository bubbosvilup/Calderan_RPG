import { isDeepStrictEqual } from "node:util";
import type { ContextCompressorProvider, CompressionCandidate, CompressionReason, CompressionResponse } from "../llm/context-compressor-provider.js";
import type { Usage } from "../llm/types.js";
import { ContextBudgetManager, type ContextBudgetSnapshot } from "./context-budget.js";
import { COMPRESSION_SCHEMA_VERSION, COMPRESSION_POLICY_VERSION, contextHash, narratorPackOf, renderCandidateRequest, type KnowledgeUnit, type NarratorPack } from "./narrator-pack.js";
import type { NarratorRequest } from "./stages/narration.js";
import { REQUEST_RESOURCE_CHARACTERS } from "../types/resource-limits.js";
export type CompactionReason = CompressionReason;
export interface CompactionDiagnostics {
  readonly before_estimated_tokens: number; readonly after_estimated_tokens: number;
  readonly before_usage_percent: number; readonly after_usage_percent: number; readonly compression_ratio: number;
  readonly source_hash: string; readonly cache_hit: boolean; readonly compressor_model?: string;
  readonly compression_level: number; readonly target_budget_tokens: number; readonly duration_ms: number;
  readonly usage?: Usage; readonly cost_usd?: number;
}
export interface CompactionResult {
  readonly status: "success" | "no_op" | "failed" | "insufficient" | "unavailable";
  readonly reason: CompactionReason; readonly detail: string; readonly diagnostics?: CompactionDiagnostics;
}
export interface ContextCompactionService {
  compact(input: { readonly reason: CompactionReason; readonly request: NarratorRequest; readonly current?: () => NarratorRequest | undefined; readonly signal?: AbortSignal }): Promise<CompactionResult>;
  /** Sync reuse only; NEVER calls a provider in an active player turn. */
  apply?(request: NarratorRequest): NarratorRequest;
}
export const unavailableCompactor: ContextCompactionService = { async compact({ reason }) { return { status: "unavailable", reason, detail: "No context compressor model/provider is configured." }; } };
export const DEFAULT_COMPACTION_POLICY = Object.freeze({ normal_ratio: 0.65, strong_ratio: 0.5, manual_ratio: 0.95, min_saving_tokens: 64, max_attempts: 2, cache_capacity: 32, timeout_ms: 20_000 });
export type CompactionPolicy = { readonly [K in keyof typeof DEFAULT_COMPACTION_POLICY]: number };
const tokens = (text: string) => text.match(/[\p{L}\p{N}_]+|[^\s]/gu) ?? [];
const semanticTokens = (text: string) => tokens(text).filter(t => t !== "the");
function minimumExtractiveText(text: string, names: readonly string[]): string {
  const protectedSpans = [...text.matchAll(/["\u201c][^"\u201d]+["\u201d]/g)].map(m => [m.index, m.index + m[0].length] as const);
  for (const name of names) { if (!name) continue; let at = 0; while ((at = text.indexOf(name, at)) >= 0) { protectedSpans.push([at, at + name.length]); at += name.length; } }
  return text.replace(/\bthe\b\s*|\s+/g, (match, at: number) => protectedSpans.some(([start, end]) => at >= start && at < end) ? match : match.startsWith("the") ? "" : " ").trim() || text;
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean { return Object.keys(value).length === allowed.length && allowed.every(k => Object.hasOwn(value, k)); }
/** Restricted extractive schema: every meaningful token/punctuation stays in order; scope, truth and IDs match exactly.
 * Deliberately rejects free paraphrase until a semantic fidelity oracle exists. */
export function validateCompressionCandidate(value: unknown, pack: NarratorPack): CompressionCandidate {
  if (typeof value === "string") { if (value.length > REQUEST_RESOURCE_CHARACTERS) throw new Error("candidate_resource_limit"); value = JSON.parse(value); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("candidate_schema");
  const v = value as Record<string, unknown>;
  if (!keys(v, ["version", "source_hash", "context_identity", "units"]) || v.version !== COMPRESSION_SCHEMA_VERSION || v.source_hash !== pack.source_hash || v.context_identity !== pack.source.context_identity || !Array.isArray(v.units) || v.units.length !== pack.source.units.length) throw new Error("candidate_identity_or_schema");
  if (JSON.stringify(v).length > REQUEST_RESOURCE_CHARACTERS) throw new Error("candidate_resource_limit");
  for (let i = 0; i < v.units.length; i++) {
    const u = v.units[i] as KnowledgeUnit;
    if (!u || typeof u !== "object" || !keys(u as unknown as Record<string, unknown>, ["id", "ref", "source", "text", "truth", "player_access", "private_holders", "scope"]) || typeof u.text !== "string" || !u.text.trim()) throw new Error("candidate_unit_schema");
    const { text, ...tags } = u, { text: original, ...expected } = pack.source.units[i]!;
    if (!isDeepStrictEqual(tags, expected)) throw new Error("candidate_scope_or_epistemology");
    if (!isDeepStrictEqual(semanticTokens(text), semanticTokens(original))) throw new Error("candidate_semantic_tokens");
    for (const phrase of [...pack.access.characters.map(c => c.name), ...(original.match(/["\u201c][^"\u201d]+["\u201d]/g) ?? [])]) {
      if (phrase && original.split(phrase).length !== text.split(phrase).length) throw new Error("candidate_subject_or_quote");
    }
    // Articles may only be deleted, never inserted/repeated. No invented names or new lexical material.
    let at = 0; const source = tokens(original);
    for (const token of tokens(text)) { while (at < source.length && source[at] !== token && source[at] === "the") at++; if (source[at++] !== token) throw new Error("candidate_new_text"); }
  }
  return structuredClone(v) as unknown as CompressionCandidate;
}
interface CachedCandidate { readonly candidate: CompressionCandidate; readonly target: number; readonly level: number }
export class NarratorContextCompactor implements ContextCompactionService {
  readonly #cache = new Map<string, CachedCandidate>();
  readonly #active = new Map<string, string>();
  #busy = false;
  constructor(readonly provider: ContextCompressorProvider | undefined, readonly manager = new ContextBudgetManager(), readonly policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY) {
    if (!(0 < policy.strong_ratio && policy.strong_ratio < policy.normal_ratio && policy.normal_ratio < manager.policy.auto && 0 < policy.manual_ratio && policy.manual_ratio < 1) || ![policy.min_saving_tokens, policy.cache_capacity, policy.timeout_ms, policy.max_attempts].every(n => Number.isSafeInteger(n) && n > 0) || policy.max_attempts > 2) throw new Error("Invalid compaction policy");
  }
  #key(pack: NarratorPack, target: number, level: number): string { return contextHash({ source_hash: pack.source_hash, identity: pack.source.context_identity, revision: pack.source.revision, model: this.provider?.model_id, schema: COMPRESSION_SCHEMA_VERSION, policy: COMPRESSION_POLICY_VERSION, targets: this.policy, budget: this.manager.policy, target, level }); }
  apply(request: NarratorRequest): NarratorRequest {
    const pack = narratorPackOf(request); if (!pack) return request;
    const key = this.#active.get(pack.source_hash), entry = key ? this.#cache.get(key) : undefined;
    if (!entry || key !== this.#key(pack, entry.target, entry.level)) return request;
    try {
      const candidate = validateCompressionCandidate(entry.candidate, pack), active = renderCandidateRequest(pack, candidate.units);
      const before = this.manager.measure(request), after = this.manager.measure(active);
      return after.estimated_tokens < before.estimated_tokens && !after.hard_limit_reached && this.#resourceSafe(active) ? active : request;
    } catch { this.#active.delete(pack.source_hash); return request; }
  }
  #resourceSafe(request: NarratorRequest): boolean { return JSON.stringify(request).length <= REQUEST_RESOURCE_CHARACTERS; }
  async compact(input: { reason: CompactionReason; request: NarratorRequest; current?: () => NarratorRequest | undefined; signal?: AbortSignal }): Promise<CompactionResult> {
    if (this.#busy) return { status: "failed", reason: input.reason, detail: "Compaction is already in progress." };
    this.#busy = true;
    try { return await this.#compact(input); } finally { this.#busy = false; }
  }
  async #compact(input: { reason: CompactionReason; request: NarratorRequest; current?: () => NarratorRequest | undefined; signal?: AbortSignal }): Promise<CompactionResult> {
    const started = performance.now(), pack = narratorPackOf(input.request), old = this.apply(input.request), before = this.manager.measure(old);
    let after: ContextBudgetSnapshot = before, cache_hit = false, level = 0, target = 0, usage: Usage | undefined, cost_usd: number | undefined;
    const result = (status: CompactionResult["status"], detail: string): CompactionResult => ({ status, reason: input.reason, detail, diagnostics: {
      before_estimated_tokens: before.estimated_tokens, after_estimated_tokens: after.estimated_tokens, before_usage_percent: before.usage_percent, after_usage_percent: after.usage_percent,
      compression_ratio: before.estimated_tokens ? after.estimated_tokens / before.estimated_tokens : 1, source_hash: pack?.source_hash ?? "", cache_hit,
      ...(this.provider ? { compressor_model: this.provider.model_id } : {}), compression_level: level, target_budget_tokens: target, duration_ms: performance.now() - started,
      ...(usage ? { usage } : {}), ...(cost_usd === undefined ? {} : { cost_usd }),
    } });
    if (!this.provider) return result("unavailable", "No independent compressor model/provider is configured.");
    if (!pack || !pack.source.units.length) return result("no_op", "No compactable knowledge units are present.");
    if (old !== input.request) { cache_hit = true; return result("no_op", "A cached validated candidate is already active; no provider call."); }
    const raw = this.manager.measure(input.request);
    if (input.reason === "auto" && !before.compaction_required) return result("no_op", "Active context is below the automatic threshold.");
    const manualTarget = Math.floor(before.estimated_tokens * this.policy.manual_ratio);
    for (level = 1; level <= this.policy.max_attempts; level++) {
      target = Math.floor(raw.usable_budget_tokens * (level === 1 ? this.policy.normal_ratio : this.policy.strong_ratio));
      if (input.reason === "manual") target = Math.min(target, manualTarget);
      const key = this.#key(pack, target, level), cached = this.#cache.get(key);
      const minimum = renderCandidateRequest(pack, pack.source.units.map(u => ({ ...u, text: minimumExtractiveText(u.text, pack.access.characters.map(c => c.name)) })));
      if (before.estimated_tokens - this.manager.measure(minimum).estimated_tokens < this.policy.min_saving_tokens) return result("no_op", "There is no material safe knowledge reduction available.");
      try {
        let response: CompressionResponse;
        if (cached) { cache_hit = true; response = { candidate: cached.candidate }; }
        else response = await this.#generate(pack, input, target, level);
        if (response.usage) usage = { prompt_tokens: (usage?.prompt_tokens ?? 0) + (response.usage.prompt_tokens ?? 0), completion_tokens: (usage?.completion_tokens ?? 0) + (response.usage.completion_tokens ?? 0), total_tokens: (usage?.total_tokens ?? 0) + (response.usage.total_tokens ?? 0) };
        if (response.cost_usd !== undefined) cost_usd = (cost_usd ?? 0) + response.cost_usd;
        const candidate = validateCompressionCandidate(response.candidate, pack), next = renderCandidateRequest(pack, candidate.units), measured = this.manager.measure(next);
        const current = input.current?.();
        if (input.signal?.aborted || (input.current && (!current || narratorPackOf(current)?.source_hash !== pack.source_hash || contextHash(current) !== contextHash(input.request)))) return result("failed", "Source changed or compaction was cancelled; candidate discarded.");
        if (!this.#resourceSafe(next) || measured.hard_limit_reached || measured.estimated_tokens > target || before.estimated_tokens - measured.estimated_tokens < this.policy.min_saving_tokens) continue;
        // No await/callback from the freshness check through activation. Old active representation remains intact until here.
        this.#cache.set(key, { candidate, target, level }); this.#active.set(pack.source_hash, key);
        while (this.#cache.size > this.policy.cache_capacity) { const first = this.#cache.keys().next().value!; this.#cache.delete(first); for (const [hash, active] of this.#active) if (active === first) this.#active.delete(hash); }
        after = measured;
        return result("success", "Validated knowledge candidate activated atomically.");
      } catch { return result("failed", "Compressor/validation failed; previous active context retained."); }
    }
    level = this.policy.max_attempts;
    return result("insufficient", "Bounded compression could not meet the target; previous active context retained.");
  }
  async #generate(pack: NarratorPack, input: { reason: CompactionReason; signal?: AbortSignal }, target: number, level: number): Promise<CompressionResponse> {
    const abort = new AbortController(); let rejectCancel: (error: Error) => void = () => {};
    const cancelled = new Promise<never>((_, reject) => { rejectCancel = reject; });
    const cancel = () => { abort.abort(); rejectCancel(new Error("cancelled")); }; input.signal?.addEventListener("abort", cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (input.signal?.aborted) throw new Error("cancelled");
      return await Promise.race([cancelled, this.provider!.compress({ source_pack: structuredClone(pack.source), source_hash: pack.source_hash, context_identity: pack.source.context_identity, target_budget_tokens: target, level, reason: input.reason, signal: abort.signal }), new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error("timeout")); }, this.policy.timeout_ms); })]);
    } finally { clearTimeout(timer); abort.abort(); input.signal?.removeEventListener("abort", cancel); }
  }
}
