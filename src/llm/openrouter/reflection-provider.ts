import { ProviderError } from '../errors.js';
import { OpenRouterClient } from './client.js';
import type { ReflectionProvider, ReflectionRequest } from '../../turn/reflection.js';
import { E1_SYSTEM } from '../../turn/structured/reflection-v23-cvc-e1.js';
/**
 * Qualified reflection maintenance configuration (2026-10-08): Claude Haiku 5.5, validated live on the unchanged prompt/strict schema.
 * Replaces qwen/qwen3.8-flash and its Alibaba-only pin (Alibaba shared-pool 429s); GPT-6 Luna rejects this schema's string length
 * keywords. Single model, no fallback; `require_parameters` keeps only structured-output endpoints. No changes to other provider roles.
 */
export const DEFAULT_REFLECTION_MODEL = 'anthropic/claude-haiku-5.5';
export interface ReflectionConfig {
    readonly model?: string;
    readonly max_output_tokens?: number;
    readonly timeout_ms?: number;
    readonly fetch?: typeof fetch;
    readonly api_key?: () => string | undefined;
}
export class ReflectionProviderError extends ProviderError {
    readonly retry_after_ms?: number;
    constructor(error: ProviderError, retryAfter?: number) { super(error.code, error.latency, undefined, error.failure_class); if (retryAfter !== undefined)
        this.retry_after_ms = retryAfter; }
}
function retryAfter(value: string | null): number | undefined { if (value === null)
    return undefined; const s = value.trim(); if (/^\d+(\.\d+)?$/.test(s))
    return Number(s) * 1000; const date = Date.parse(s); return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined; }
export class OpenRouterReflectionProvider implements ReflectionProvider {
    constructor(private readonly injectedClient?: OpenRouterClient, private readonly config: ReflectionConfig = {}) { }
    async reflect(request: ReflectionRequest): Promise<{
        text: string;
        usage?: unknown;
        model?: string;
        provider?: string;
        cost_usd?: number;
    }> {
        if ((this.config.model !== undefined && this.config.model !== DEFAULT_REFLECTION_MODEL) || (this.config.max_output_tokens !== undefined && this.config.max_output_tokens !== 600) || !request.wire_schema)
            throw new ProviderError('configuration_error');
        let retry_after_ms: number | undefined, text = '';
        const client = this.injectedClient ?? new OpenRouterClient({ ...(this.config.api_key ? { api_key: this.config.api_key } : {}), fetch: async (url, init) => { const response = await (this.config.fetch ?? fetch)(url, init); if (response.status === 429)
                retry_after_ms = retryAfter(response.headers.get('retry-after')); return response; } });
        try {
            for await (const event of client.request({ model: DEFAULT_REFLECTION_MODEL, max_tokens: 600, messages: [{ role: 'system', content: E1_SYSTEM }, { role: 'user', content: JSON.stringify({ character: request.character, evidence: request.evidence, existing_notes: request.existing }) }], response_format: { type: 'json_schema', json_schema: { name: 'npc_reflection_v23_cvc_e1', strict: true, schema: request.wire_schema } }, provider: { require_parameters: true }, reasoning: { enabled: false, exclude: true } }, false, Math.min(20000, this.config.timeout_ms ?? 20000, request.timeout_ms ?? 20000))) {
                if (event.type === 'text_delta')
                    text += event.text;
                else {
                    return { text, usage: event.metadata.usage, model: event.metadata.model, ...(event.metadata.provider ? { provider: event.metadata.provider } : {}), ...(event.metadata.cost_usd !== undefined ? { cost_usd: event.metadata.cost_usd } : {}) };
                }
            }
            throw new ProviderError('invalid_provider_response');
        }
        catch (error) {
            if (error instanceof ProviderError && error.code === 'rate_limited')
                throw new ReflectionProviderError(error, retry_after_ms);
            throw error;
        }
    }
}
