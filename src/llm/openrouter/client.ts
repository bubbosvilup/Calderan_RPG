import { ProviderError, providerError, type ProviderErrorCode } from "../errors.js";
import type { GenerationMetadata, Usage } from "../types.js";

export interface ClientConfig {
  readonly base_url?: string;
  readonly fetch?: typeof fetch;
  readonly api_key?: () => string | undefined;
  readonly max_request_characters?: number;
}
export interface TransportRequest {
  readonly model: string;
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly max_tokens: number;
  readonly response_format?: unknown;
  readonly provider?: unknown;
  readonly reasoning?: unknown;
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
  try { return record(JSON.parse(text)); } catch { throw new ProviderError("invalid_provider_response"); }
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
    if (!Number.isSafeInteger(timeout_ms) || timeout_ms <= 0 || timeout_ms > 2_147_483_647 || !Number.isSafeInteger(body.max_tokens) || body.max_tokens <= 0) throw new ProviderError("configuration_error");
    let endpoint: URL;
    try { endpoint = new URL(`${(this.#config.base_url ?? "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`); }
    catch { throw new ProviderError("configuration_error"); }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new ProviderError("configuration_error");
    const payload = JSON.stringify({ ...body, stream: streaming, ...(streaming ? { stream_options: { include_usage: true } } : {}) });
    const maxCharacters = this.#config.max_request_characters ?? 100_000;
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
    const consume = (event: Record<string, unknown>): string => {
      if (event.error) {
        const code = record(event.error).code;
        throw new ProviderError(typeof code === "number" ? statusCode(code) : "provider_unavailable");
      }
      if (event.usage) tokens = usage(event.usage);
      if (!Array.isArray(event.choices)) throw new ProviderError("invalid_provider_response");
      if (!event.choices.length) return "";
      const choice = record(event.choices[0]);
      const message = record(streaming ? choice.delta : choice.message);
      if (message.refusal || choice.finish_reason === "content_filter") throw new ProviderError("model_refusal");
      if (choice.finish_reason != null) {
        if (choice.finish_reason !== "stop") throw new ProviderError("invalid_provider_response");
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
      if (!response.ok) { await response.body?.cancel(); throw new ProviderError(statusCode(response.status)); }
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
      if (!finished || !text.trim() || (streaming && !doneMarker)) throw new ProviderError("invalid_provider_response");
      yield { type: "completed", metadata: { model: body.model, usage: tokens, latency: {
        request_started_at, headers_ms, time_to_first_token_ms: streaming ? first : null,
        completed_at: new Date().toISOString(), elapsed_total_ms: performance.now() - started,
      } } };
    } catch (error) {
      throw new ProviderError(timedOut ? "timeout" : signal?.aborted ? "cancelled" : providerError(error).code, {
        request_started_at, headers_ms, time_to_first_token_ms: streaming ? first : null,
        completed_at: new Date().toISOString(), elapsed_total_ms: performance.now() - started,
      });
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel); abort.abort();
      await reader?.cancel().catch(() => {}); reader?.releaseLock();
    }
  }
}
