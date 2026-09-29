import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { WorldStore } from "../world/world-store.js";
import { CampaignState } from "../campaign/campaign-state.js";
import type { WorldEntity } from "../types/entities.js";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { GenerationRequest } from "../llm/types.js";
import { ProviderError, type ProviderErrorCode } from "../llm/errors.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { buildTurnContext, type TurnContext } from "../turn/context-builder.js";
import { playerIntent } from "../turn/player-intent.js";
import { retrieveForTurn } from "../turn/retrieval-policy.js";
import { buildNarratorPrompt, NARRATOR_SYSTEM, NARRATOR_STATE_PRECEDENCE } from "../turn/prompt-builder.js";
import { authorizeCommands } from "../turn/command-authorizer.js";
import type { RecentExchange } from "../turn/recent-conversation.js";
import type { RetrievalDiagnostic, TurnResult } from "../turn/turn-types.js";
import { withHistoricalContext } from "./historical-context.js";
import { turnFixture } from "./turn-fixture.js";
import type { SourcePair } from "./playthrough-csv.js";
import type { RelevanceSignal } from "./narrative-checks.js";

/** Requested candidates. Slugs verified against the OpenRouter catalog before paid runs; MiniMax is the baseline. */
export const NARRATOR_CANDIDATES = [
  { alias: "minimax", model: "minimax/minimax-m2-her", baseline: true },
  { alias: "euryale", model: "sao10k/l3.3-euryale-70b", baseline: false },
  { alias: "cydonia", model: "thedrummer/cydonia-24b-v4.1", baseline: false },
  { alias: "kimi", model: "moonshotai/kimi-k2.5", baseline: false },
  { alias: "qwen", model: "qwen/qwen3.8-flash", baseline: false },
] as const;
/** Identical for every candidate: no temperature/top_p is sent (provider defaults, as in production); hidden reasoning is disabled for all. */
export const BAKEOFF_REQUEST_POLICY = { max_output_tokens: 384, sampling: "provider defaults; no temperature, top_p or penalties sent (same as production)", reasoning: { enabled: false }, timeout_ms: 60_000, streaming: true } as const;

export interface BakeoffCase {
  readonly id: string; readonly source_row?: number; readonly input: string;
  /** Key into historical-windows.json; absent means state-only context (no historical prose). */
  readonly window?: string; readonly ground_garments: boolean; readonly repeats: number;
  readonly failure_modes: readonly string[]; readonly relevance?: RelevanceSignal;
  readonly fixture_options?: { readonly brennaKnowsBridge?: boolean; readonly ironboundKnownBy?: readonly string[] };
  /** Phase 1M.1 targeted comparison: "1m" removes only the [STATE PRECEDENCE] block; "1m1" is the current prompt. */
  readonly prompt_variant?: "1m" | "1m1";
}
export const KNOWLEDGE_TELL: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
type CorpusRow = SourcePair & { readonly row: number; readonly expected: readonly CampaignCommand[] };
const row = (corpus: readonly CorpusRow[], n: number) => { const found = corpus.find(f => f.row === n); if (!found) throw new Error(`Curated row ${n} missing`); return found; };
/** Stage A: compact narrator-only set. Repeats=2 on the hard cases named in the Phase 1M brief. */
export function stageACases(corpus: readonly CorpusRow[]): BakeoffCase[] {
  const historical = (n: number, repeats: number, failure_modes: string[], relevance: RelevanceSignal): BakeoffCase => ({ id: `r${n}`, source_row: n, input: row(corpus, n).player_message, window: String(n), ground_garments: n === 115, repeats, failure_modes, relevance });
  return [
    historical(43, 2, ["gerome_silence", "multi_npc", "player_agency"], { label: "response to medic/tools remark", pattern: /\b(?:tool|medic|suppl|equipment|heal|treat|instrument)/i }),
    historical(53, 1, ["tower_introduction", "gerome_silence", "equipment_continuity"], { label: "Gerome/Heartstone/eat-drink reference", pattern: /\b(?:Gerome|Heartstone|tower|wall|eat|drink|food|water)/i }),
    historical(25, 1, ["short_context_input", "equipment", "player_agency"], { label: "ring reference", pattern: /\bring\b/i }),
    historical(115, 2, ["multi_item_handover", "relevance", "collective_acceptance"], { label: "offered garment reference", pattern: /\b(?:shirts?|shorts|pink|cloth(?:es|ing)?|garments?|fabric)\b/i }),
    historical(169, 2, ["equipment_continuity", "household_dialogue", "historical_contamination"], { label: "household-rules reference", pattern: /\b(?:rules?|family|household|barefoot|lies?|secrets?|boots?)\b/i }),
    historical(173, 2, ["secrets", "knowledge", "player_agency"], { label: "secrets/magic reference", pattern: /\b(?:secrets?|magic)\b/i }),
    historical(591, 1, ["multi_npc", "name_correction"], { label: "Maren reference", pattern: /\bMaren\b/i }),
    { id: "ironbound", input: "What do I know about Ironbound?", window: "53", ground_garments: false, repeats: 2, failure_modes: ["retrieval", "lore_adherence"], relevance: { label: "Ironbound/smiths reference", pattern: /\b(?:Ironbound|smiths?)\b/i } },
    { id: "knowledge_tell", input: "/tell campaign_fact_bridge_closed to brenna", ground_garments: false, repeats: 1, failure_modes: ["explicit_communication", "knowledge"], relevance: { label: "bridge reference", pattern: /\bbridge\b/i } },
    { id: "r35", source_row: 35, input: row(corpus, 35).player_message, ground_garments: false, repeats: 1, failure_modes: ["player_agency", "gerome_silence", "persistent_invention"], relevance: { label: "Gerome/butler instruction reference", pattern: /\b(?:Gerome|butler|serve|food|thermometer|IVs?)\b/i } },
    { id: "r3", source_row: 3, input: row(corpus, 3).player_message, ground_garments: false, repeats: 1, failure_modes: ["persistent_invention", "short_context_input"] },
  ];
}
/** The Phase 1M prompt: identical request minus the Phase 1M.1 precedence block. */
export function withoutStatePrecedence(request: GenerationRequest): GenerationRequest {
  const block = NARRATOR_STATE_PRECEDENCE + "\n\n";
  if (!request.messages[0]?.content.startsWith(block)) throw new Error("State precedence block not found");
  return { ...request, messages: request.messages.map((m, i) => i === 0 ? { ...m, content: m.content.slice(block.length) } : m) };
}
/**
 * Phase 1M.1 targeted Kimi checks (narrator-only). Equipment: state says boots equipped, history says barefoot.
 * Knowledge: only Nicco knows the bridge fact (Brenna too in one variant); the conversation makes it tempting to mention.
 * Every case runs under both prompt variants on the identical fixture.
 */
export function targetedCases(corpus: readonly CorpusRow[], repeats = 4): BakeoffCase[] {
  const supplies = "*he sighs* We need medicine from across the river. Maren, do you know any way to get supplies here quickly?";
  const base: BakeoffCase[] = [
    { id: "eq_r173", input: row(corpus, 173).player_message, window: "173", ground_garments: false, repeats, failure_modes: ["equipment_precedence"] },
    { id: "eq_r53", input: row(corpus, 53).player_message, window: "53", ground_garments: false, repeats, failure_modes: ["equipment_precedence"] },
    { id: "eq_feet", input: "*he watches her get up and cross the room to the window* How do your feet feel today? Still sore?", window: "173", ground_garments: false, repeats, failure_modes: ["equipment_precedence"] },
    { id: "kn_r43", input: row(corpus, 43).player_message, window: "43", ground_garments: false, repeats, failure_modes: ["knowledge_isolation"] },
    { id: "kn_supplies", input: supplies, window: "43", ground_garments: false, repeats, failure_modes: ["knowledge_isolation"] },
    { id: "kn_supplies_brenna_knows", input: supplies, window: "43", ground_garments: false, repeats, failure_modes: ["knowledge_isolation"], fixture_options: { brennaKnowsBridge: true } },
  ];
  return base.flatMap(c => (["1m", "1m1"] as const).map(v => ({ ...c, id: `${c.id}@${v}`, prompt_variant: v })));
}
/**
 * Phase 1N narrator-only knowledge-authority cases (Kimi). Same three Maren cases as Phase 1M.1 plus state-only direct questions:
 * Maren asked directly (no edge), asymmetric Brenna-knows/Maren-does-not, and Ironbound retrieval with canonical awareness for Brenna only.
 */
export function authorityCases(corpus: readonly CorpusRow[], repeats = 4): BakeoffCase[] {
  const supplies = "*he sighs* We need medicine from across the river. Maren, do you know any way to get supplies here quickly?";
  return [
    { id: "kn_r43", input: row(corpus, 43).player_message, window: "43", ground_garments: false, repeats, failure_modes: ["knowledge_isolation"] },
    { id: "kn_supplies", input: supplies, window: "43", ground_garments: false, repeats, failure_modes: ["knowledge_isolation"] },
    { id: "kn_supplies_brenna_knows", input: supplies, window: "43", ground_garments: false, repeats, failure_modes: ["knowledge_isolation"], fixture_options: { brennaKnowsBridge: true } },
    { id: "kn_ask_maren", input: "Maren, have you heard anything about the eastern bridge? Is it open?", ground_garments: false, repeats, failure_modes: ["knowledge_isolation", "npc_question"] },
    { id: "kn_ask_both_brenna_knows", input: "Brenna, Maren, does either of you know whether the eastern bridge is open?", ground_garments: false, repeats, failure_modes: ["asymmetric_knowledge"], fixture_options: { brennaKnowsBridge: true } },
    { id: "ib_asym_brenna_aware", input: "Brenna, Maren, what do you two know about Ironbound?", ground_garments: false, repeats, failure_modes: ["retrieval_knowledge", "asymmetric_knowledge"], fixture_options: { ironboundKnownBy: ["brenna"] } },
  ];
}
/** Stage B: the same 12 historical state cases as Phase 1L.1 plus the mandatory explicit knowledge communication case. */
export const STAGE_B_ROWS = [3, 11, 25, 35, 39, 43, 47, 53, 115, 169, 173, 509] as const;
export function stageBCases(corpus: readonly CorpusRow[], extraRepeats = { r115: 3, knowledge_tell: 3 }): (BakeoffCase & { readonly expected: readonly CampaignCommand[] })[] {
  return [
    ...STAGE_B_ROWS.map(n => ({ id: `r${n}`, source_row: n, input: row(corpus, n).player_message, ground_garments: n === 115, repeats: n === 115 ? extraRepeats.r115 : 1, failure_modes: [], expected: row(corpus, n).expected })),
    { id: "knowledge_tell", input: "/tell campaign_fact_bridge_closed to brenna", ground_garments: false, repeats: extraRepeats.knowledge_tell, failure_modes: ["explicit_communication"], expected: [KNOWLEDGE_TELL] },
  ];
}

export const fingerprint = (request: Pick<GenerationRequest, "system_prompt" | "messages">) => createHash("sha256").update(JSON.stringify({ system_prompt: request.system_prompt, messages: request.messages })).digest("hex").slice(0, 16);
export const NARRATOR_SYSTEM_SHA = createHash("sha256").update(NARRATOR_SYSTEM).digest("hex").slice(0, 16);

/**
 * Builds the narrator request exactly as TurnCoordinator does for a fresh fixture turn (empty recent conversation,
 * lexical retrieval, same prompt builder), then applies the Phase 1L.1 evaluation-only historical window.
 * Model-independent by construction: every candidate receives this identical request.
 */
export async function stageARequest(c: BakeoffCase, history: Readonly<Record<string, readonly SourcePair[]>>) {
  const { world, campaign } = turnFixture(c.ground_garments, c.fixture_options);
  const snapshot = campaign.exportSnapshot();
  const context = buildTurnContext(world, snapshot);
  const intent = playerIntent(c.input, context, snapshot, world);
  const service = new RetrievalService(world);
  const retrieved = await retrieveForTurn(c.input, context, world, { service, search: new HybridSearch(service) });
  const window = c.window ? history[c.window] ?? [] : [];
  if (c.window && !window.length) throw new Error(`Historical window ${c.window} missing`);
  const current = withHistoricalContext(buildNarratorPrompt(c.input, context, [], retrieved.data, intent), window);
  const request = c.prompt_variant === "1m" ? withoutStatePrecedence(current) : current;
  return { request, context, retrieval: retrieved.diagnostics as RetrievalDiagnostic, historical_window: window, fingerprint: fingerprint(request) };
}

/**
 * Provider-behavior probe (not historical benchmark): two clearly consenting adults, legal fictional content.
 * Uses the unchanged production prompt builder over a tiny throwaway world; nothing touches campaign state.
 */
export const ADULT_PROBES = [
  { id: "adult_initiation", input: "*kisses her deeply and begins unlacing her dress* Tell me if you want me to stop.", recent: [{ player: "*closes the door of their room behind them* Are you sure about tonight?", narration: "Sera laughs softly and pulls him close by his collar. \"I've been sure for weeks. I want this. I want you.\"", status: "finalized" }] },
  { id: "adult_continuation", input: "*lays her down on the bed, both of them undressed now, and kisses along her neck* Still good?", recent: [{ player: "*kisses her deeply and begins unlacing her dress* Tell me if you want me to stop.", narration: "Sera helps him with the last of the laces, breathless. \"Don't you dare stop,\" she whispers, pulling his shirt over his head.", status: "finalized" }] },
] as const satisfies readonly { id: string; input: string; recent: readonly RecentExchange[] }[];
export function adultProbeRequest(probe: (typeof ADULT_PROBES)[number]) {
  const base = (id: string, name: string, content: string) => ({ id, name, display_name: name, parent: null, aliases: [], summary: content, tags: [], search_context: "", content, knowledge: { visibility: { narrator: true, player: true }, known_by: [] } });
  const entities: WorldEntity[] = [
    { ...base("probe_inn_room", "Private room at the Gilded Lantern", "A rented upstairs inn room with a bed, a washstand and a shuttered window. The door is locked; only Nicco and Sera are present."), type: "location", features: [], connections: [] },
    { ...base("nicco", "Nicco", "Adult man; the player character."), type: "character", role: "player", location: null, traits: [], relationships: [] },
    { ...base("sera", "Sera", "Adult woman, 34, an innkeeper; Nicco's established romantic partner."), type: "character", role: "npc", location: "probe_inn_room", traits: ["Adult (34). Consenting, enthusiastic partner of Nicco."], relationships: [] },
  ];
  const world = new WorldStore(entities.map(entity => ({ source: `synthetic/${entity.id}.yaml`, document: { schema_version: 1, entity, chunks: [] } })));
  const campaign = new CampaignState(world, "adult_probe", { player_location: "probe_inn_room", world_time: { world_minute: 1200 } });
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  const request = buildNarratorPrompt(probe.input, context, probe.recent, { records: [], unknown: false }, playerIntent(probe.input, context, snapshot, world));
  return { request, fingerprint: fingerprint(request) };
}

/** Evaluation-side wire observation. The engine client stays unchanged; this only tees the response it already receives. */
export interface WireCapture {
  http_status?: number; upstream_provider?: string; finish_reason?: string | null; usage?: Record<string, unknown>;
  error?: { code?: unknown; message?: string }; reasoning_chars: number; settled: Promise<void>;
}
export function capturingFetch(base: typeof fetch = fetch): { fetch: typeof fetch; captures: WireCapture[] } {
  const captures: WireCapture[] = [];
  const wrapped = (async (url: string | URL | Request, init?: RequestInit) => {
    const response = await base(url, init);
    const capture: WireCapture = { http_status: response.status, reasoning_chars: 0, settled: Promise.resolve() };
    captures.push(capture);
    if (!response.body) return response;
    const [forClient, forCapture] = response.body.tee();
    const observe = (event: Record<string, unknown>) => {
      if (typeof event.provider === "string") capture.upstream_provider ??= event.provider;
      if (event.usage && typeof event.usage === "object") capture.usage = event.usage as Record<string, unknown>;
      if (event.error && typeof event.error === "object") { const e = event.error as Record<string, unknown>; capture.error = { code: e.code, ...(typeof e.message === "string" ? { message: e.message.slice(0, 300) } : {}) }; }
      const choice = Array.isArray(event.choices) ? event.choices[0] as Record<string, unknown> | undefined : undefined;
      if (!choice) return;
      if (choice.finish_reason != null) capture.finish_reason = String(choice.finish_reason);
      const delta = (choice.delta ?? choice.message) as Record<string, unknown> | undefined;
      if (typeof delta?.reasoning === "string") capture.reasoning_chars += delta.reasoning.length;
    };
    capture.settled = (async () => {
      const reader = forCapture.getReader(), decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          let boundary: RegExpExecArray | null;
          while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
            const data = buffer.slice(0, boundary.index).split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
            buffer = buffer.slice(boundary.index + boundary[0].length);
            if (data && data !== "[DONE]") try { observe(JSON.parse(data) as Record<string, unknown>); } catch { /* partial or non-JSON diagnostics are ignored */ }
          }
        }
        if (buffer.trim().startsWith("{")) try { observe(JSON.parse(buffer) as Record<string, unknown>); } catch { /* ignored */ }
      } catch { /* aborted by the client; keep what was observed */ }
    })();
    return new Response(forClient, { status: response.status, statusText: response.statusText, headers: response.headers });
  }) as typeof fetch;
  return { fetch: wrapped, captures };
}
export async function settle(capture: WireCapture | undefined): Promise<void> {
  if (capture) await Promise.race([capture.settled, new Promise(resolve => setTimeout(resolve, 3000))]);
}

export type ProviderOutcome = "success" | "truncated" | "content_filter" | "http_error" | "timeout" | "invalid_output" | "network_error" | "other_failure";
/** Infrastructure outcomes are reported separately from narrative quality. */
export function classifyOutcome(error: unknown, capture: WireCapture | undefined): ProviderOutcome {
  if (!error) return "success";
  const code: ProviderErrorCode | undefined = error instanceof ProviderError ? error.code : undefined;
  if (capture?.finish_reason === "length") return "truncated";
  if (code === "model_refusal" || capture?.finish_reason === "content_filter") return "content_filter";
  if (code === "timeout") return "timeout";
  if (capture?.http_status !== undefined && capture.http_status >= 400) return "http_error";
  if (code === "invalid_provider_response") return "invalid_output";
  if (code === "network_error") return "network_error";
  return "other_failure";
}
export function usageOf(capture: WireCapture | undefined) {
  const u = capture?.usage ?? {}, num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
  const details = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  return { prompt_tokens: num(u.prompt_tokens), completion_tokens: num(u.completion_tokens), total_tokens: num(u.total_tokens), reasoning_tokens: num(details.reasoning_tokens), provider_reported_cost_usd: num(u.cost) };
}

/** Per expected command: why it was or was not committed. Keeps narrator, controller and authorizer causes separate. */
export type ExpectedDiagnosis = "true_positive" | "turn_failed_before_commit" | "controller_correct_authorizer_rejected" | "controller_omitted_supported_by_evidence" | "controller_omitted_evidence_absent";
export function diagnoseStageB(expected: readonly CampaignCommand[], result: TurnResult | undefined, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>) {
  const actual = result?.authorized_commands ?? [];
  const per_expected = expected.map(command => {
    let diagnosis: ExpectedDiagnosis;
    if (!result) diagnosis = "turn_failed_before_commit";
    else if (actual.some(c => isDeepStrictEqual(c, command))) diagnosis = "true_positive";
    else if (result.controller_proposal.some(c => isDeepStrictEqual(c, command))) diagnosis = "controller_correct_authorizer_rejected";
    // Counterfactual: would the same TurnEvidence have authorized the gold command had the controller proposed it?
    else diagnosis = authorizeCommands([command], result.turn_evidence, context, snapshot)[0]?.authorized ? "controller_omitted_supported_by_evidence" : "controller_omitted_evidence_absent";
    const rejection = result?.authorization.find(d => isDeepStrictEqual(d.command, command) && !d.authorized)?.reason;
    return { command, diagnosis, ...(rejection ? { authorizer_reason: rejection } : {}) };
  });
  return {
    per_expected,
    true_positive: per_expected.filter(p => p.diagnosis === "true_positive").length,
    false_positive_durable: actual.filter(c => !expected.some(e => isDeepStrictEqual(c, e))),
    false_negative: per_expected.filter(p => p.diagnosis !== "true_positive").length,
    controller_incorrect_proposals: result?.controller_proposal.filter(c => !expected.some(e => isDeepStrictEqual(c, e))) ?? [],
  };
}

export const median = (values: readonly number[]) => quantile(values, 0.5);
export function quantile(values: readonly number[], q: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q, low = Math.floor(position), high = Math.ceil(position);
  return Math.round((sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low)) * 10) / 10;
}
