import type { ProviderFailureClass } from '../llm/errors.js';
/** Reflection-only serialization, pacing and cooldown. No player-turn or extractor scheduling changes. */
export class ReflectionPacing {
    private tail: Promise<unknown> = Promise.resolve();
    private lastLaunch = -Infinity;
    private lastEnd = -Infinity;
    private cooldownUntil = -Infinity;
    constructor(readonly now: () => number = () => performance.now(), readonly sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) { }
    async serialized<T>(run: () => Promise<T>): Promise<T> { const result = this.tail.then(run, run); this.tail = result.catch(() => { }); return result; }
    async launch(deadline: number, checkpoint: () => void): Promise<boolean> {
        checkpoint();
        const wait = Math.max(0, this.lastLaunch + 1000 - this.now(), this.lastEnd + 250 - this.now(), this.cooldownUntil - this.now());
        if (this.now() + wait + 5000 > deadline)
            return false;
        if (wait)
            await this.sleep(wait);
        checkpoint();
        this.lastLaunch = this.now();
        return true;
    }
    completed() { this.lastEnd = this.now(); }
    rateLimited(attempt: number, retryAfterMs?: number) { this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + (retryAfterMs ?? Math.min(12000, 6000 * 2 ** (attempt - 1)))); }
}
export const reflectionPacing = new ReflectionPacing();
export interface StructuredReflectionAttempt {
    readonly attempt: number;
    readonly model: string;
    readonly provider: string;
    readonly failure_family?: ProviderFailureClass | 'citation_visibility_invalid';
    readonly wire_valid?: boolean;
    readonly canonical_valid?: boolean;
    readonly visibility_valid?: boolean;
    readonly elapsed_ms: number;
    readonly cost_usd?: number;
}
