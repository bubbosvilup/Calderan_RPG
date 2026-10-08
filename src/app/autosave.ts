/**
 * Save/Load v1 autosave scheduler (deliberate policy; docs/architecture/PERSISTENCE.md). Pure scheduling: the session supplies
 * whether the campaign is dirty (a committed revision is unsaved), whether it is safe to save now (idle: no turn, post-turn step,
 * compaction, portrait batch, save, load or session swap), and the save itself.
 *
 *   - debounce: a save starts `debounce_ms` after the last notification, but never later than `max_wait_ms` after the first unsaved one;
 *   - single flight: one save at a time; a mutation during a save keeps the campaign dirty and schedules exactly one follow-up;
 *   - not ready at the deadline: the save waits for the next notification (the session notifies when it becomes idle again);
 *   - ordinary failures retry with bounded backoff (`retry_ms`), then wait for the next mutation; fatal failures (corrupt slot,
 *     incompatible state, lock lost) STOP autosave until the session is recovered. Nothing ever overwrites a slot blindly: the
 *     repository's own checks run on every save.
 */
export interface AutosaveTimers { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void; now(): number }
export interface AutosaveOptions { readonly debounce_ms?: number; readonly max_wait_ms?: number; readonly retry_ms?: readonly number[]; readonly timers?: AutosaveTimers }
export type AutosaveResult = { readonly ok: true } | { readonly ok: false; readonly fatal: boolean };
export type AutosaveState = "idle" | "scheduled" | "waiting" | "saving" | "retrying" | "failed" | "stopped";
const realTimers: AutosaveTimers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>), now: () => Date.now() };

export class AutosaveScheduler {
  readonly #debounce: number; readonly #maxWait: number; readonly #retry: readonly number[]; readonly #timers: AutosaveTimers;
  readonly #hooks: { dirty(): boolean; ready(): boolean; save(): Promise<AutosaveResult> };
  #state: AutosaveState = "idle"; #timer: unknown; #firstDirty: number | undefined; #failures = 0; #inflight: Promise<void> | undefined; #saves = 0;
  constructor(options: AutosaveOptions, hooks: { dirty(): boolean; ready(): boolean; save(): Promise<AutosaveResult> }) {
    this.#debounce = options.debounce_ms ?? 2000; this.#maxWait = options.max_wait_ms ?? 10_000; this.#retry = options.retry_ms ?? [2000, 10_000, 30_000];
    this.#timers = options.timers ?? realTimers; this.#hooks = hooks;
  }
  get state(): AutosaveState { return this.#state; }
  /** Completed autosaves (diagnostics/tests). */
  get saves(): number { return this.#saves; }
  /** A committed mutation happened, or the session became idle. Viewing or reading never calls this. */
  notify(): void {
    if (this.#state === "stopped" || this.#state === "saving") return;
    if (!this.#hooks.dirty()) { this.#clear(); this.#firstDirty = undefined; if (this.#state !== "failed") this.#state = "idle"; return; }
    if (this.#state === "retrying") return;
    const now = this.#timers.now();
    if (this.#state === "failed") { this.#failures = 0; }
    // The deadline already passed while the session was busy: save as soon as it is ready.
    if (this.#state === "waiting") { this.#arm(0); return; }
    this.#firstDirty ??= now;
    const due = Math.min(now + this.#debounce, this.#firstDirty + this.#maxWait);
    this.#arm(Math.max(0, due - now));
  }
  /** Stop for good (session closing) or until resumed (recovery required / session swap). Waits for an in-flight save. */
  async stop(): Promise<void> { this.#clear(); this.#state = "stopped"; await this.#inflight; }
  resume(): void { if (this.#state === "stopped") { this.#state = "idle"; this.#failures = 0; this.notify(); } }
  /** Settles when no autosave is running. */
  async idle(): Promise<void> { await this.#inflight; }
  #clear(): void { if (this.#timer !== undefined) this.#timers.clearTimeout(this.#timer); this.#timer = undefined; }
  #arm(ms: number): void { this.#clear(); this.#state = this.#state === "retrying" ? "retrying" : "scheduled"; this.#timer = this.#timers.setTimeout(() => { this.#timer = undefined; this.#fire(); }, ms); }
  #fire(): void {
    if (this.#state === "stopped") return;
    if (!this.#hooks.dirty()) { this.#state = "idle"; this.#firstDirty = undefined; return; }
    if (!this.#hooks.ready()) { this.#state = "waiting"; return; }
    this.#state = "saving";
    this.#inflight = (async () => {
      let result: AutosaveResult;
      try { result = await this.#hooks.save(); } catch { result = { ok: false, fatal: false }; }
      if (this.#state === "stopped") return;
      if (result.ok) {
        this.#saves++; this.#failures = 0; this.#firstDirty = undefined; this.#state = "idle";
        if (this.#hooks.dirty()) this.notify(); // a mutation committed during the save: exactly one follow-up
        return;
      }
      if (result.fatal) { this.#state = "stopped"; return; }
      this.#failures++;
      if (this.#failures > this.#retry.length) { this.#state = "failed"; return; }
      this.#state = "retrying"; this.#arm(this.#retry[this.#failures - 1]!);
    })().finally(() => { this.#inflight = undefined; });
  }
}
