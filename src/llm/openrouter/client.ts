import { ProviderError, providerError, type ProviderErrorCode, type ProviderHttpDiagnostic } from "../errors.js";
import { REQUEST_RESOURCE_CHARACTERS } from "../../types/resource-limits.js";
import {failureClass} from "../reliability.js";
import type { GenerationMetadata, Usage } from "../types.js";

export interface ClientConfig {
  readonly base_url?: string;
  readonly fetch?: typeof fetch;
  readonly api_key?: () => string | undefined;
  readonly max_request_characters?: number;
}
export interface TransportRequest {
  /** The requested (primary) model. With `models`, it must equal models[0] and is NOT sent: OpenRouter's documented fallback shape is `models` alone. */
  readonly model: string;
  /** OpenRouter native model fallback, priority order, primary first (at most 3). */
  readonly models?: readonly string[];
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly max_tokens: number;
  readonly response_format?: unknown;
  readonly provider?: unknown;
  readonly reasoning?: unknown;
}
const SAFE_TOKEN = /^[A-Za-z0-9 ._:/~()\-]{1,120}$/;
/** A short identifier or undefined; anything else (free text, provider raw output) is dropped. */
function safeToken(value: unknown, max = 80): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length <= max && SAFE_TOKEN.test(trimmed) ? trimmed : undefined;
}
const generationId = (value: unknown): string | undefined => typeof value === "string" && /^gen-[A-Za-z0-9_-]{1,100}$/.test(value) ? value : undefined;
function retryAfter(value: string | null): number | undefined {
  if (!value || !/^\d{1,6}$/.test(value.trim())) return undefined;
  return Math.min(86_400, Number(value.trim()));
}
/** Whitelisted classification of an OpenRouter error object (HTTP error body or in-band error). Message/raw/body are never read out. */
function httpDiagnostic(status: number, error: unknown, requested_models: readonly string[], headers?: Headers): ProviderHttpDiagnostic {
  const metadata = error && typeof error === "object" && !Array.isArray(error) ? (error as Record<string, unknown>).metadata : undefined;
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const error_type = safeToken(m.error_type), provider_name = safeToken(m.provider_name), limit_source = safeToken(m.limit_source), provider_code = safeToken(m.provider_code, 40);
  const retry_after_s = retryAfter(headers?.get("retry-after") ?? null), generation_id = generationId(headers?.get("x-generation-id"));
  return { status, ...(error_type ? { error_type } : {}), ...(provider_name ? { provider_name } : {}), ...(limit_source ? { limit_source } : {}),
    ...(provider_code ? { provider_code } : {}), ...(typeof m.is_byok === "boolean" ? { is_byok: m.is_byok } : {}),
    ...(retry_after_s === undefined ? {} : { retry_after_s }), ...(generation_id ? { generation_id } : {}), requested_models: [...requested_models] };
}
/** Reads at most `limit` bytes of an error body for classification; the text never leaves this module. */
async function boundedErrorObject(response: Response, limit = 16_384): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) { const part = await reader.read(); if (part.done) break; chunks.push(part.value); size += part.value.length; }
  } catch { return undefined; } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  try { const parsed = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks).subarray(0, limit))) as Record<string, unknown>; return parsed?.error; } catch { return undefined; }
}
function validModels(body: TransportRequest): boolean {
  if (body.models === undefined) return true;
  return body.models.length >= 1 && body.models.length <= 3 && body.models[0] === body.model && new Set(body.models).size === body.models.length
    && body.models.every(model => typeof model === "string" && SAFE_TOKEN.test(model) && !model.includes(" "));
}
export type TransportEvent = { type: "text_delta"; text: string } | { type: "completed"; metadata: GenerationMetadata };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError("invalid_provider_response");
  return value as Record<string, unknown>;
}
function statusCode(status: number): ProviderErrorCode {
  return status === 401 || status === 403 ? "authentication_error" : status === 429 ? "rate_limited" : status >= 500 ? "provider_unavailable" : "invalid_provider_response";
}
function parse(text: string): Record<string, unknown> {
  try { return record(JSON.parse(text)); } catch { throw new ProviderError("invalid_provider_response",undefined,undefined,"malformed_envelope"); }
}
function usage(value: unknown): Usage {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, number> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const n = (value as Record<string, unknown>)[key];
    if (typeof n === "number" && Number.isSafeInteger(n) && n >= 0) result[key] = n;
  }
  return result;
}
/** Transport only. No retries: callers decide whether a new request is appropriate. */
export class OpenRouterClient {
  readonly #config: ClientConfig;
  constructor(config: ClientConfig = {}) { this.#config = config; }
  async *request(body: TransportRequest, streaming: boolean, timeout_ms: number, signal?: AbortSignal): AsyncGenerator<TransportEvent> {
    const key = (this.#config.api_key ?? (() => process.env.OPENROUTER_API_KEY))();
    if (!key?.trim()) throw new ProviderError("configuration_error");
    if (!Number.isSafeInteger(timeout_ms) || timeout_ms <= 0 || timeout_ms > 2_147_483_647 || !Number.isSafeInteger(body.max_tokens) || body.max_tokens <= 0 || !validModels(body)) throw new ProviderError("configuration_error");
    const requested_models = body.models ?? [body.model];
    let endpoint: URL;
    try { endpoint = new URL(`${(this.#config.base_url ?? "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`); }
    catch { throw new ProviderError("configuration_error"); }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new ProviderError("configuration_error");
    const { model: _primary, models, ...rest } = body;
    const payload = JSON.stringify({ ...(models ? { models: [...models] } : { model: body.model }), ...rest, stream: streaming, ...(streaming ? { stream_options: { include_usage: true } } : {}) });
    const maxCharacters = this.#config.max_request_characters ?? REQUEST_RESOURCE_CHARACTERS;
    if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0 || payload.length > maxCharacters) throw new ProviderError("configuration_error");
    const started = performance.now(), request_started_at = new Date().toISOString();
    let headers_ms: number | null = null, first: number | null = null, tokens: Usage = {}, finished = false, text = "";
    const abort = new AbortController();
    let timedOut = false;
    const cancel = () => abort.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, timeout_ms);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let upstream_provider: string | undefined, response_model: string | undefined, generation_id: string | undefined;
    let cost_usd: number | undefined;
    const consume = (event: Record<string, unknown>): string => {
      if (typeof event.provider === "string" && event.provider.trim()) upstream_provider ??= event.provider.trim().slice(0, 80);
      response_model ??= safeToken(event.model, 120);
      generation_id ??= generationId(event.id);
      if (event.error) {
        const code = record(event.error).code;
        throw new ProviderError(typeof code === "number" ? statusCode(code) : "provider_unavailable",undefined,undefined,typeof code==="number"&&code<500&&code!==429?"http_nonretryable":"http_retryable",
          httpDiagnostic(typeof code === "number" && Number.isSafeInteger(code) ? code : 0, event.error, requested_models));
      }
      if (event.usage) {
        tokens = usage(event.usage);
        const cost = (event.usage as Record<string, unknown>).cost;
        if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) cost_usd = cost;
      }
      if (!Array.isArray(event.choices)) throw new ProviderError("invalid_provider_response");
      if (!event.choices.length) return "";
      const choice = record(event.choices[0]);
      const message = record(streaming ? choice.delta : choice.message);
      if (message.refusal || choice.finish_reason === "content_filter") throw new ProviderError("model_refusal");
      if (choice.finish_reason != null) {
        if (choice.finish_reason !== "stop") throw new ProviderError("invalid_provider_response",undefined,undefined,choice.finish_reason==="length"?"finish_reason_length":"invalid_provider_response");
        finished = true;
      }
      const delta = message.content;
      if (delta != null && typeof delta !== "string") throw new ProviderError("invalid_provider_response");
      if (typeof delta === "string" && delta.length) {
        first ??= performance.now() - started;
        text += delta;
        if (text.length > 100_000) throw new ProviderError("invalid_provider_response");
        return delta;
      }
      return "";
    };
    try {
      if (abort.signal.aborted) throw new ProviderError("cancelled");
      const response = await (this.#config.fetch ?? fetch)(endpoint, {
        method: "POST", redirect: "error", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: payload, signal: abort.signal,
      });
      headers_ms = performance.now() - started;
      generation_id = generationId(response.headers.get("x-generation-id"));
      if (!response.ok) {
        const http = httpDiagnostic(response.status, await boundedErrorObject(response), requested_models, response.headers);
        throw new ProviderError(statusCode(response.status),undefined,undefined,response.status===429||response.status>=500?"http_retryable":"http_nonretryable",http);
      }
      if (!response.body) throw new ProviderError("invalid_provider_response");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", doneMarker = false, bytes = 0;
      while (!doneMarker) {
        const part = await reader.read();
        if (abort.signal.aborted) throw new ProviderError("cancelled");
        bytes += part.value?.length ?? 0;
        if (bytes > 2_000_000) throw new ProviderError("invalid_provider_response");
        buffer += decoder.decode(part.value, { stream: !part.done });
        if (streaming) {
          let boundary: RegExpExecArray | null;
          while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
            const block = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
            if (!data) continue;
            if (data === "[DONE]") { doneMarker = true; break; }
            const delta = consume(parse(data));
            if (delta) yield { type: "text_delta", text: delta };
          }
        }
        if (part.done) break;
      }
      if (!streaming) { const delta = consume(parse(buffer)); if (delta) yield { type: "text_delta", text: delta }; }
      if (!finished || !text.trim() || (streaming && !doneMarker)) throw new ProviderError("invalid_provider_response",undefined,undefined,!text.trim()?"empty_output":"invalid_provider_response");
      yield { type: "completed", metadata: { model: body.model, ...(response_model ? { response_model } : {}), ...(generation_id ? { generation_id } : {}), ...(upstream_provider ? { provider: upstream_provider } : {}), ...(cost_usd === undefined ? {} : { cost_usd }), usage: tokens, latency: {
        request_started_at, headers_ms, time_to_first_token_ms: streaming ? first : null,
        completed_at: new Date().toISOString(), elapsed_total_ms: performance.now() - started,
      } } };
    } catch (error) {
      throw new ProviderError(timedOut ? "timeout" : signal?.aborted ? "cancelled" : providerError(error).code, {
        request_started_at, headers_ms, time_to_first_token_ms: streaming ? first : null,
        completed_at: new Date().toISOString(), elapsed_total_ms: performance.now() - started,
      },undefined,timedOut?"timeout":signal?.aborted?undefined:failureClass(error),timedOut||signal?.aborted?undefined:providerError(error).http);
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel); abort.abort();
      await reader?.cancel().catch(() => {}); reader?.releaseLock();
    }
  }
}
