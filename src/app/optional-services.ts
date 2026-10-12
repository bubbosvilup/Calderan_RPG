import type { SessionDeps } from "./game-session.js";

/**
 * Consolidation block 6: the OPTIONAL SERVICE boundary. One small, application-layer place that owns which optional services are available.
 *
 * CORE ENGINE (CampaignState, persistence, turn authority, identity, movement, items, trade, legal state, household/NPC+, PendingConfirmation, the Narrator
 * and Controller contracts) sits INSIDE the correctness boundary. Optional services sit OUTSIDE it: Reflection, Mannerism learning, portrait generation,
 * item sprite generation, sprite QA, semantic retrieval. An optional service is never an authority path: it may add enrichment or media, it can never be
 * required for a valid turn, a save/load, or an authoritative output.
 *
 * Availability is RUNTIME CONFIGURATION (constructor options / environment). It is never CampaignState and never saved. The flags are resolved ONCE here and
 * consumed at the application/composition boundary; no domain module reads a provider-specific feature flag.
 *
 * "OFF" means the service stops PRODUCING new enrichment. It does not invalidate core state, nor previously promoted/validated durable enrichment
 * (see OFF_CONTRACT).
 */
export const OPTIONAL_SERVICE_NAMES = ["reflection", "mannerism_learning", "portrait_generation", "item_sprite_generation", "sprite_qa", "semantic_retrieval"] as const;
export type OptionalServiceName = typeof OPTIONAL_SERVICE_NAMES[number];
export type OptionalServiceConfig = Readonly<Record<OptionalServiceName, boolean>>;

/** The decided production policy. Reflection stays off (D-09 deferred), Sprite QA is off by default, semantic retrieval is parked (lexical retrieval is the core path). */
export const OPTIONAL_SERVICE_DEFAULTS: OptionalServiceConfig = Object.freeze({
  reflection: false, mannerism_learning: true, portrait_generation: true, item_sprite_generation: true, sprite_qa: false, semantic_retrieval: false,
});

const ENV_KEYS: Readonly<Record<OptionalServiceName, string>> = Object.freeze({
  reflection: "CALDREVAN_REFLECTION_MODE", mannerism_learning: "CALDREVAN_MANNERISM_LEARNING", portrait_generation: "CALDREVAN_PORTRAIT_GENERATION",
  item_sprite_generation: "CALDREVAN_ITEM_SPRITES", sprite_qa: "CALDREVAN_SPRITE_QA", semantic_retrieval: "CALDREVAN_SEMANTIC_RETRIEVAL",
});
const ON = new Set(["on", "true", "1", "yes", "shadow"]), OFF = new Set(["off", "false", "0", "no", "none"]);
function readFlag(env: Readonly<Record<string, string | undefined>>, name: OptionalServiceName): boolean | undefined {
  const raw = env[ENV_KEYS[name]]?.trim().toLowerCase();
  if (!raw) return undefined;
  if (ON.has(raw)) return true;
  if (OFF.has(raw)) return false;
  throw new Error(`${ENV_KEYS[name]} must be on or off`);
}
/** The one canonical resolution: defaults, then environment, then explicit overrides. Deterministic and independent of any campaign. */
export function resolveOptionalServices(overrides: Partial<OptionalServiceConfig> = {}, env: Readonly<Record<string, string | undefined>> = process.env): OptionalServiceConfig {
  const out = { ...OPTIONAL_SERVICE_DEFAULTS } as Record<OptionalServiceName, boolean>;
  for (const name of OPTIONAL_SERVICE_NAMES) { const fromEnv = readFlag(env, name), explicit = overrides[name]; out[name] = explicit ?? fromEnv ?? out[name]; }
  return Object.freeze(out);
}
/**
 * The session's effective configuration. An explicit `optional_services` wins; without it (tests, embedders) a service is available when its provider is
 * wired, which is the pre-block-6 behaviour. A flag can only switch a wired service OFF, never invent a provider.
 */
export function effectiveOptionalServices(deps: Pick<SessionDeps, "optional_services" | "reflection_provider" | "mannerism_extractor" | "portrait_generator" | "portrait_store" | "item_sprite_reviewer">): OptionalServiceConfig {
  const wired: OptionalServiceConfig = { reflection: !!deps.reflection_provider, mannerism_learning: !!deps.mannerism_extractor, portrait_generation: !!deps.portrait_generator && !!deps.portrait_store,
    item_sprite_generation: !!deps.portrait_generator && !!deps.portrait_store, sprite_qa: !!deps.item_sprite_reviewer, semantic_retrieval: true };
  const set = deps.optional_services;
  return Object.freeze(Object.fromEntries(OPTIONAL_SERVICE_NAMES.map(n => [n, wired[n] && (n === "semantic_retrieval" ? !!set?.semantic_retrieval : set ? set[n] : true)])) as Record<OptionalServiceName, boolean>);
}

/** The normative OFF semantics, typed so tests and docs share one source. */
export interface OffContract {
  /** May the service produce NEW enrichment while OFF? */ readonly produces_new: false;
  /** Is previously validated/persisted enrichment still readable while OFF? */ readonly reads_existing: boolean;
  /** Does previously validated enrichment still reach the Narrator while OFF? */ readonly narrator_sees_existing: boolean;
  /** Is it still displayed by the UI while OFF? */ readonly ui_shows_existing: boolean;
  /** Can the service be switched on again later with its stored enrichment intact? */ readonly re_enableable: true;
  readonly note: string;
}
export const OFF_CONTRACT: Readonly<Record<OptionalServiceName, OffContract>> = Object.freeze({
  reflection: { produces_new: false, reads_existing: true, narrator_sees_existing: true, ui_shows_existing: true, re_enableable: true,
    note: "SOFT-PROMOTED: validated persisted notes stay Narrator-visible; no call, no new note, no maintenance." },
  mannerism_learning: { produces_new: false, reads_existing: true, narrator_sees_existing: true, ui_shows_existing: true, re_enableable: true,
    note: "Promoted/established mannerisms keep reaching the Narrator; raw observations and candidates are never a runtime substitute; no extractor call." },
  portrait_generation: { produces_new: false, reads_existing: true, narrator_sees_existing: false, ui_shows_existing: true, re_enableable: true,
    note: "No new generation request; generated media and the selected avatar/full-body stay renderable; the request declines cleanly." },
  item_sprite_generation: { produces_new: false, reads_existing: true, narrator_sees_existing: false, ui_shows_existing: true, re_enableable: true,
    note: "No automatic sprite job (not even a pending marker); existing sprites render; items work without a sprite." },
  sprite_qa: { produces_new: false, reads_existing: true, narrator_sees_existing: false, ui_shows_existing: true, re_enableable: true,
    note: "No reviewer call; sprite generation (if enabled) accepts its first valid image deterministically; accepted sprites stay usable." },
  semantic_retrieval: { produces_new: false, reads_existing: false, narrator_sees_existing: false, ui_shows_existing: false, re_enableable: true,
    note: "No embedding or model call; lexical retrieval is the core production grounding path." },
});

/** Runtime service metadata. NOT campaign state: recording anything here never changes a revision. */
export interface OptionalServiceHealth {
  readonly service: OptionalServiceName; readonly enabled: boolean; readonly running: number;
  readonly last_success_at?: string; readonly last_error?: { readonly at: string; readonly code: string };
}
export class OptionalServiceMonitor {
  readonly #running = new Map<OptionalServiceName, number>();
  readonly #ok = new Map<OptionalServiceName, string>();
  readonly #err = new Map<OptionalServiceName, { at: string; code: string }>();
  constructor(readonly config: OptionalServiceConfig) {}
  begin(name: OptionalServiceName): void { this.#running.set(name, (this.#running.get(name) ?? 0) + 1); }
  succeed(name: OptionalServiceName): void { this.#end(name); this.#ok.set(name, new Date().toISOString()); }
  fail(name: OptionalServiceName, error: unknown): void { this.#end(name); this.#err.set(name, { at: new Date().toISOString(), code: errorCode(error) }); }
  /** A refusal to apply a write because the core had priority (stale or busy): diagnostic, not a failure of the service. */
  discarded(name: OptionalServiceName, reason: string): void { this.#end(name); this.#err.set(name, { at: new Date().toISOString(), code: reason }); }
  #end(name: OptionalServiceName): void { this.#running.set(name, Math.max(0, (this.#running.get(name) ?? 0) - 1)); }
  get running(): number { let n = 0; for (const v of this.#running.values()) n += v; return n; }
  snapshot(): readonly OptionalServiceHealth[] {
    return OPTIONAL_SERVICE_NAMES.map(service => ({ service, enabled: this.config[service], running: this.#running.get(service) ?? 0,
      ...(this.#ok.has(service) ? { last_success_at: this.#ok.get(service)! } : {}), ...(this.#err.has(service) ? { last_error: this.#err.get(service)! } : {}) }));
  }
}
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && /^[a-z0-9_]{1,60}$/.test(code) ? code : "optional_service_error";
}
