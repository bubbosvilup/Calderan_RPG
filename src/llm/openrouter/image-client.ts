import type { PortraitMediaType } from "../../campaign/types.js";

/**
 * Portrait Image Generation V1: the one server-side OpenRouter Image API client (POST /api/v1/images). Narrow by design: validate the
 * configured model/options against the live capability record, send the caller's prompt unchanged (plus at most the given
 * references), map errors, decode and validate the returned bytes. It knows nothing about campaigns, characters, appearance,
 * storage or UI. The API key is read per request from the environment and never logged, returned or stored.
 *
 * Verified against the official docs and the live catalog on 2026-10-07 (see PORTRAIT_IMAGE_GENERATION_V1.md): the Image API has no
 * normalized negative-prompt field and the default model's endpoint advertises none, so no negative prompt is sent.
 */
export interface PortraitImageConfig { readonly model: string; readonly resolution: string; readonly aspect_ratio: string; readonly n: 1 }
export const DEFAULT_PORTRAIT_IMAGE_CONFIG: PortraitImageConfig = Object.freeze({ model: "bytedance-seed/seedream-5-0-flash", resolution: "1K", aspect_ratio: "2:3", n: 1 });
/** Application-level config: CALDREVAN_PORTRAIT_MODEL / _RESOLUTION / _ASPECT_RATIO override the defaults (validated on use). */
export function portraitImageConfig(env: Readonly<Record<string, string | undefined>> = process.env): PortraitImageConfig {
  return Object.freeze({ model: env.CALDREVAN_PORTRAIT_MODEL?.trim() || DEFAULT_PORTRAIT_IMAGE_CONFIG.model, resolution: env.CALDREVAN_PORTRAIT_RESOLUTION?.trim() || DEFAULT_PORTRAIT_IMAGE_CONFIG.resolution,
    aspect_ratio: env.CALDREVAN_PORTRAIT_ASPECT_RATIO?.trim() || DEFAULT_PORTRAIT_IMAGE_CONFIG.aspect_ratio, n: 1 });
}
export const IMAGE_LIMITS = Object.freeze({ timeout_ms: 120_000, capability_timeout_ms: 20_000, max_image_bytes: 15 * 1024 * 1024, max_response_bytes: 30 * 1024 * 1024, max_prompt_characters: 4000 });

export type ImageGenerationErrorCode = "configuration_error" | "authentication_error" | "insufficient_credits" | "rate_limited" | "timeout" | "provider_unavailable"
  | "unsupported_configuration" | "invalid_request" | "invalid_provider_response" | "invalid_image" | "network_error";
/** Never carries response bodies, headers or credentials: a code and (for HTTP failures) the status only. */
export class ImageGenerationError extends Error {
  constructor(readonly code: ImageGenerationErrorCode, readonly status?: number) { super(`Portrait generation failed: ${code}${status ? ` (HTTP ${status})` : ""}`); this.name = "ImageGenerationError"; }
}
export interface ImageReference { readonly media_type: PortraitMediaType; readonly bytes: Uint8Array }
export interface GeneratedImage { readonly bytes: Buffer; readonly media_type: PortraitMediaType; readonly model: string; readonly cost_usd?: number; readonly latency_ms: number }
/** The seam the application depends on; tests inject a local fake. */
export interface PortraitImageGenerator {
  readonly config: PortraitImageConfig;
  generate(request: { readonly prompt: string; readonly references?: readonly ImageReference[]; readonly signal?: AbortSignal }): Promise<GeneratedImage>;
}

/** Detected from the bytes' signature; the provider's declared type must agree. */
export function sniffImage(bytes: Uint8Array): PortraitMediaType | undefined {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return undefined;
}
/** Strict base64 decode + signature check + size bound. */
export function decodeImage(b64: unknown, declared?: unknown): { bytes: Buffer; media_type: PortraitMediaType } {
  if (typeof b64 !== "string" || !b64.length || b64.length > Math.ceil(IMAGE_LIMITS.max_image_bytes / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64.replace(/\s+/g, ""))) throw new ImageGenerationError("invalid_image");
  const bytes = Buffer.from(b64.replace(/\s+/g, ""), "base64");
  if (!bytes.length || bytes.length > IMAGE_LIMITS.max_image_bytes) throw new ImageGenerationError("invalid_image");
  const media_type = sniffImage(bytes);
  if (!media_type) throw new ImageGenerationError("invalid_image");
  if (declared !== undefined && declared !== media_type) throw new ImageGenerationError("invalid_image");
  return { bytes, media_type };
}

type Descriptor = { type: "enum"; values: string[] } | { type: "range"; min: number; max: number } | { type: "boolean" };
interface Capabilities { readonly endpoints: readonly Readonly<Record<string, Descriptor>>[] }
function accepts(params: Readonly<Record<string, Descriptor>>, key: string, value: string | number): boolean {
  const d = params[key];
  if (!d) return false;
  if (d.type === "enum") return d.values.includes(String(value));
  if (d.type === "range") return typeof value === "number" && value >= d.min && value <= d.max;
  return true;
}

export class OpenRouterImageClient implements PortraitImageGenerator {
  readonly config: PortraitImageConfig;
  readonly #fetch: typeof fetch; readonly #key: () => string | undefined; readonly #base: string; readonly #timeout: number;
  #capabilities: Promise<Capabilities> | undefined;
  constructor(config: PortraitImageConfig = portraitImageConfig(), options: { readonly fetch?: typeof fetch; readonly api_key?: () => string | undefined; readonly base_url?: string; readonly timeout_ms?: number } = {}) {
    this.config = config; this.#fetch = options.fetch ?? fetch; this.#key = options.api_key ?? (() => process.env.OPENROUTER_API_KEY);
    this.#base = options.base_url ?? "https://openrouter.ai/api/v1"; this.#timeout = options.timeout_ms ?? IMAGE_LIMITS.timeout_ms;
  }
  /** Live per-endpoint capability record, fetched once per client (in-process cache; a failed lookup is retried next time). */
  capabilities(): Promise<Capabilities> {
    this.#capabilities ??= (async () => {
      const response = await this.#request(`${this.#base}/images/models/${this.config.model.split("/").map(encodeURIComponent).join("/")}/endpoints`, { method: "GET" }, IMAGE_LIMITS.capability_timeout_ms);
      if (response.status === 404) throw new ImageGenerationError("unsupported_configuration", 404);
      if (!response.ok) throw this.#httpError(response.status);
      const body = await this.#json(response) as { endpoints?: { supported_parameters?: Record<string, Descriptor> }[] };
      if (!Array.isArray(body.endpoints) || !body.endpoints.length) throw new ImageGenerationError("unsupported_configuration");
      return Object.freeze({ endpoints: body.endpoints.map(e => Object.freeze({ ...(e.supported_parameters ?? {}) })) });
    })().catch(error => { this.#capabilities = undefined; throw error; });
    return this.#capabilities;
  }
  /** Throws unsupported_configuration unless some endpoint accepts the configured resolution, aspect ratio, n and reference count. */
  async validate(referenceCount = 0): Promise<void> {
    const { endpoints } = await this.capabilities();
    const ok = endpoints.some(p => accepts(p, "resolution", this.config.resolution) && accepts(p, "aspect_ratio", this.config.aspect_ratio) && (!p.n || accepts(p, "n", this.config.n))
      && (referenceCount === 0 || accepts(p, "input_references", referenceCount)));
    if (!ok) throw new ImageGenerationError("unsupported_configuration");
  }
  async generate(request: { readonly prompt: string; readonly references?: readonly ImageReference[]; readonly signal?: AbortSignal }): Promise<GeneratedImage> {
    const key = this.#key()?.trim();
    if (!key) throw new ImageGenerationError("configuration_error");
    if (!request.prompt.trim() || request.prompt.length > IMAGE_LIMITS.max_prompt_characters) throw new ImageGenerationError("invalid_request");
    const references = request.references ?? [];
    await this.validate(references.length);
    const body = { model: this.config.model, prompt: request.prompt, n: this.config.n, resolution: this.config.resolution, aspect_ratio: this.config.aspect_ratio,
      ...(references.length ? { input_references: references.map(r => ({ type: "image_url", image_url: { url: `data:${r.media_type};base64,${Buffer.from(r.bytes).toString("base64")}` } })) } : {}) };
    const started = performance.now();
    const response = await this.#request(`${this.#base}/images`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }, this.#timeout, request.signal);
    if (!response.ok) throw this.#httpError(response.status);
    const parsed = await this.#json(response) as { data?: { b64_json?: unknown; media_type?: unknown }[]; usage?: { cost?: unknown } };
    if (!Array.isArray(parsed.data) || parsed.data.length !== 1 || !parsed.data[0] || typeof parsed.data[0] !== "object") throw new ImageGenerationError("invalid_provider_response");
    const image = decodeImage(parsed.data[0].b64_json, parsed.data[0].media_type);
    const cost = parsed.usage?.cost;
    return Object.freeze({ ...image, model: this.config.model, ...(typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? { cost_usd: cost } : {}), latency_ms: Math.round(performance.now() - started) });
  }
  async #request(url: string, init: RequestInit, timeout: number, signal?: AbortSignal): Promise<Response> {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(new ImageGenerationError("timeout")), timeout);
    const onAbort = () => abort.abort(new ImageGenerationError("timeout"));
    signal?.addEventListener("abort", onAbort, { once: true });
    // Raced against the abort so the bound holds even if the transport ignores the signal.
    const aborted = new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new ImageGenerationError("timeout")), { once: true }));
    try { return await Promise.race([this.#fetch(url, { ...init, redirect: "error", signal: abort.signal }), aborted]); }
    catch (error) { if (abort.signal.aborted) throw new ImageGenerationError("timeout"); throw error instanceof ImageGenerationError ? error : new ImageGenerationError("network_error"); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
  }
  async #json(response: Response): Promise<unknown> {
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > IMAGE_LIMITS.max_response_bytes) throw new ImageGenerationError("invalid_provider_response");
    let text: string;
    try { text = await response.text(); } catch { throw new ImageGenerationError("network_error"); }
    if (text.length > IMAGE_LIMITS.max_response_bytes) throw new ImageGenerationError("invalid_provider_response");
    try { const value = JSON.parse(text); if (!value || typeof value !== "object") throw new Error(); return value; } catch { throw new ImageGenerationError("invalid_provider_response"); }
  }
  #httpError(status: number): ImageGenerationError {
    return new ImageGenerationError(status === 401 || status === 403 ? "authentication_error" : status === 402 ? "insufficient_credits" : status === 429 ? "rate_limited"
      : status === 400 || status === 404 || status === 413 ? "unsupported_configuration" : status === 408 || status === 524 ? "timeout" : status >= 500 ? "provider_unavailable" : "invalid_provider_response", status);
  }
}
