import { boundedFetch, decodeImage, IMAGE_LIMITS, ImageGenerationError, type GeneratedImage, type ImageGenerationRequest, type ImageGeneratorIdentity, type PortraitImageGenerator } from "../image-generator.js";

/**
 * Portrait Image Generation V1 OpenRouter client (POST /api/v1/images). KEPT FOR COMPATIBILITY ONLY: production image generation uses
 * the Hugging Face-routed fal-ai client (src/llm/huggingface/fal-image-client.ts, image stack in src/app/image-stack.ts).
 * Implements the provider-neutral PortraitImageGenerator contract (src/llm/image-generator.ts). OpenRouter's Image API takes an
 * aspect ratio and resolution tier, no pixel size, no seed and no negative prompt, so those request fields are ignored here.
 */
export { decodeImage, sniffImage, ImageGenerationError, type ImageReference, type GeneratedImage, type PortraitImageGenerator } from "../image-generator.js";
export interface PortraitImageConfig { readonly model: string; readonly resolution: string; readonly aspect_ratio: string; readonly n: 1 }
export const DEFAULT_PORTRAIT_IMAGE_CONFIG: PortraitImageConfig = Object.freeze({ model: "bytedance-seed/seedream-5-0-flash", resolution: "1K", aspect_ratio: "2:3", n: 1 });
/** CALDREVAN_PORTRAIT_MODEL / _RESOLUTION / _ASPECT_RATIO override the defaults (validated on use). OpenRouter path only. */
export function portraitImageConfig(env: Readonly<Record<string, string | undefined>> = process.env): PortraitImageConfig {
  return Object.freeze({ model: env.CALDREVAN_PORTRAIT_MODEL?.trim() || DEFAULT_PORTRAIT_IMAGE_CONFIG.model, resolution: env.CALDREVAN_PORTRAIT_RESOLUTION?.trim() || DEFAULT_PORTRAIT_IMAGE_CONFIG.resolution,
    aspect_ratio: env.CALDREVAN_PORTRAIT_ASPECT_RATIO?.trim() || DEFAULT_PORTRAIT_IMAGE_CONFIG.aspect_ratio, n: 1 });
}
const TIMEOUT_MS = 120_000, CAPABILITY_TIMEOUT_MS = 20_000;

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
  readonly identity: ImageGeneratorIdentity;
  readonly #fetch: typeof fetch; readonly #key: () => string | undefined; readonly #base: string; readonly #timeout: number;
  #capabilities: Promise<Capabilities> | undefined;
  constructor(config: PortraitImageConfig = portraitImageConfig(), options: { readonly fetch?: typeof fetch; readonly api_key?: () => string | undefined; readonly base_url?: string; readonly timeout_ms?: number } = {}) {
    this.config = config; this.identity = Object.freeze({ provider: "openrouter", model: config.model });
    this.#fetch = options.fetch ?? fetch; this.#key = options.api_key ?? (() => process.env.OPENROUTER_API_KEY);
    this.#base = options.base_url ?? "https://openrouter.ai/api/v1"; this.#timeout = options.timeout_ms ?? TIMEOUT_MS;
  }
  /** Live per-endpoint capability record, fetched once per client (in-process cache; a failed lookup is retried next time). */
  capabilities(): Promise<Capabilities> {
    this.#capabilities ??= (async () => {
      const response = await boundedFetch(this.#fetch, `${this.#base}/images/models/${this.config.model.split("/").map(encodeURIComponent).join("/")}/endpoints`, { method: "GET" }, CAPABILITY_TIMEOUT_MS);
      if (response.status === 404) throw new ImageGenerationError("invalid_request", 404);
      if (!response.ok) throw httpError(response.status);
      const body = await readJson(response) as { endpoints?: { supported_parameters?: Record<string, Descriptor> }[] };
      if (!Array.isArray(body.endpoints) || !body.endpoints.length) throw new ImageGenerationError("invalid_request");
      return Object.freeze({ endpoints: body.endpoints.map(e => Object.freeze({ ...(e.supported_parameters ?? {}) })) });
    })().catch(error => { this.#capabilities = undefined; throw error; });
    return this.#capabilities;
  }
  /** invalid_request unless some endpoint accepts the configured resolution, aspect ratio, n and reference count; `n` only if advertised. */
  async validate(referenceCount = 0): Promise<{ readonly send_n: boolean }> {
    const { endpoints } = await this.capabilities();
    const accepting = endpoints.filter(p => accepts(p, "resolution", this.config.resolution) && accepts(p, "aspect_ratio", this.config.aspect_ratio) && (!p.n || accepts(p, "n", this.config.n))
      && (referenceCount === 0 || accepts(p, "input_references", referenceCount)));
    if (!accepting.length) throw new ImageGenerationError("invalid_request");
    return { send_n: accepting.some(p => !!p.n) };
  }
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const key = this.#key()?.trim();
    if (!key) throw new ImageGenerationError("configuration_error");
    if (!request.prompt.trim() || request.prompt.length > IMAGE_LIMITS.max_prompt_characters) throw new ImageGenerationError("invalid_request");
    const references = request.references ?? [];
    const { send_n } = await this.validate(references.length);
    const body = { model: this.config.model, prompt: request.prompt, ...(send_n ? { n: this.config.n } : {}), resolution: this.config.resolution, aspect_ratio: this.config.aspect_ratio,
      ...(references.length ? { input_references: references.map(r => ({ type: "image_url", image_url: { url: `data:${r.media_type};base64,${Buffer.from(r.bytes).toString("base64")}` } })) } : {}) };
    const started = performance.now();
    const response = await boundedFetch(this.#fetch, `${this.#base}/images`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }, this.#timeout, request.signal);
    if (!response.ok) throw httpError(response.status);
    const parsed = await readJson(response) as { data?: { b64_json?: unknown; media_type?: unknown }[]; usage?: { cost?: unknown } };
    if (!Array.isArray(parsed.data) || parsed.data.length !== 1 || !parsed.data[0] || typeof parsed.data[0] !== "object") throw new ImageGenerationError("malformed_response");
    const image = decodeImage(parsed.data[0].b64_json, parsed.data[0].media_type);
    const cost = parsed.usage?.cost;
    return Object.freeze({ ...image, provider: "openrouter", model: this.config.model, ...(typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? { cost_usd: cost } : {}),
      latency_ms: Math.round(performance.now() - started) });
  }
}

async function readJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > IMAGE_LIMITS.max_response_bytes) throw new ImageGenerationError("malformed_response");
  let text: string;
  try { text = await response.text(); } catch { throw new ImageGenerationError("transient_provider_error"); }
  if (text.length > IMAGE_LIMITS.max_response_bytes) throw new ImageGenerationError("malformed_response");
  try { const value = JSON.parse(text); if (!value || typeof value !== "object") throw new Error(); return value; } catch { throw new ImageGenerationError("malformed_response"); }
}
function httpError(status: number): ImageGenerationError {
  return new ImageGenerationError(status === 401 || status === 403 ? "auth_error" : status === 402 ? "insufficient_credits" : status === 429 ? "rate_limited"
    : status === 400 || status === 404 || status === 413 ? "invalid_request" : status === 408 || status === 502 || status === 503 || status === 504 || status === 524 || status === 529 ? "transient_provider_error"
    : status >= 500 ? "provider_error" : "malformed_response", status);
}
