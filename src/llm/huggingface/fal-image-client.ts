import { boundedFetch, IMAGE_LIMITS, ImageGenerationError, validateImageBytes, decodeImage, type GeneratedImage, type ImageGenerationRequest, type ImageGeneratorIdentity, type PortraitImageGenerator } from "../image-generator.js";

/**
 * Hugging Face-routed fal-ai text-to-image client (production portrait generation). Raw fetch, no SDK; the request shape is the one
 * validated by the LORA_AND_POSE_AUDIT benchmark:
 *   POST {router_base}/fal-ai/{endpoint}   Authorization: Bearer HF_TOKEN
 *   { prompt, negative_prompt, seed, image_size: { width, height }, loras: [{ path, scale }] }
 * → { images: [{ url, width, height, content_type }], seed, has_nsfw_concepts: [bool] }, billing in `x-fal-billable-units`.
 * The provider is pinned (never "auto"); the HF_TOKEN is read per request, never logged, never placed in errors. The image URL the
 * provider returns is downloaded without credentials, only over https from an allowed host suffix.
 */
export interface FalImageStackConfig {
  /** Hugging Face router origin, e.g. https://router.huggingface.co */
  readonly router_base: string;
  /** Pinned inference provider (path segment on the router). */
  readonly provider: "fal-ai";
  /** fal application id, e.g. fal-ai/qwen-image */
  readonly endpoint: string;
  /** Base model id recorded as `model` (e.g. Qwen/Qwen-Image). */
  readonly base_model: string;
  /** Style adapter id recorded as `style_id` (e.g. Raelina/Raena-Qwen-Image). */
  readonly style_id: string;
  /** Resolved LoRA weights URL (from the HF provider mapping; fixed in config, never rediscovered per generation). */
  readonly lora_url: string;
  readonly lora_scale: number;
  /** Host suffixes the generated image may be downloaded from. */
  readonly download_hosts: readonly string[];
}
export interface FalImageClientOptions {
  readonly fetch?: typeof fetch;
  readonly api_key?: () => string | undefined;
  readonly timeout_ms?: number;
  readonly download_timeout_ms?: number;
}
const TIMEOUT_MS = 180_000, DOWNLOAD_TIMEOUT_MS = 60_000, MAX_SIDE = 2048, MIN_SIDE = 256;

export class FalImageClient implements PortraitImageGenerator {
  readonly identity: ImageGeneratorIdentity;
  readonly #config: FalImageStackConfig; readonly #fetch: typeof fetch; readonly #key: () => string | undefined; readonly #timeout: number; readonly #downloadTimeout: number;
  constructor(config: FalImageStackConfig, options: FalImageClientOptions = {}) {
    this.#config = config; this.identity = Object.freeze({ provider: config.provider, model: config.base_model, style_id: config.style_id });
    this.#fetch = options.fetch ?? fetch; this.#key = options.api_key ?? (() => process.env.HF_TOKEN);
    this.#timeout = options.timeout_ms ?? TIMEOUT_MS; this.#downloadTimeout = options.download_timeout_ms ?? DOWNLOAD_TIMEOUT_MS;
  }
  /** The exact JSON body sent to the router (exposed for tests and diagnostics; contains no credential). */
  requestBody(request: ImageGenerationRequest): Record<string, unknown> {
    return { prompt: request.prompt, ...(request.negative_prompt ? { negative_prompt: request.negative_prompt } : {}), seed: request.seed,
      image_size: { width: request.width, height: request.height }, loras: [{ path: this.#config.lora_url, scale: this.#config.lora_scale }] };
  }
  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const key = this.#key()?.trim();
    if (!key) throw new ImageGenerationError("configuration_error");
    if (!request.prompt.trim() || request.prompt.length > IMAGE_LIMITS.max_prompt_characters || (request.negative_prompt?.length ?? 0) > IMAGE_LIMITS.max_prompt_characters
      || !side(request.width) || !side(request.height) || !Number.isSafeInteger(request.seed) || request.seed < 0) throw new ImageGenerationError("invalid_request");
    const started = performance.now();
    const url = `${this.#config.router_base.replace(/\/+$/, "")}/${this.#config.provider}/${this.#config.endpoint}`;
    const response = await boundedFetch(this.#fetch, url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(this.requestBody(request)) }, this.#timeout, request.signal);
    const billable_units = units(response.headers.get("x-fal-billable-units"));
    if (!response.ok) throw await httpError(response);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    let image: { bytes: Buffer; media_type: GeneratedImage["media_type"] }, provider_seed: number | undefined;
    if (contentType.startsWith("image/")) image = validateImageBytes(await readBytes(response), contentType.split(";")[0]!.trim());
    else {
      const parsed = await readJson(response) as { images?: { url?: unknown; content_type?: unknown }[]; seed?: unknown; has_nsfw_concepts?: unknown };
      if (Array.isArray(parsed.has_nsfw_concepts) && parsed.has_nsfw_concepts.some(flag => flag === true)) throw new ImageGenerationError("content_refusal");
      const first = Array.isArray(parsed.images) && parsed.images.length >= 1 ? parsed.images[0] : undefined;
      if (!first || typeof first !== "object" || typeof first.url !== "string") throw new ImageGenerationError("malformed_response");
      image = await this.#download(first.url, request.signal);
      if (typeof parsed.seed === "number" && Number.isSafeInteger(parsed.seed) && parsed.seed >= 0) provider_seed = parsed.seed;
    }
    return Object.freeze({ ...image, provider: this.#config.provider, model: this.#config.base_model, style_id: this.#config.style_id,
      ...(provider_seed !== undefined ? { provider_seed } : {}), ...(billable_units !== undefined ? { billable_units } : {}), latency_ms: Math.round(performance.now() - started) });
  }
  async #download(raw: string, signal?: AbortSignal): Promise<{ bytes: Buffer; media_type: GeneratedImage["media_type"] }> {
    const data = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(raw);
    if (data) return decodeImage(data[2], data[1]);
    let target: URL;
    try { target = new URL(raw); } catch { throw new ImageGenerationError("malformed_response"); }
    const host = target.hostname.toLowerCase();
    if (target.protocol !== "https:" || target.username || target.password || !this.#config.download_hosts.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) throw new ImageGenerationError("malformed_response");
    const response = await boundedFetch(this.#fetch, target.href, { method: "GET" }, this.#downloadTimeout, signal);
    if (!response.ok) throw response.status >= 500 || response.status === 408 || response.status === 429 ? new ImageGenerationError("transient_provider_error", response.status) : new ImageGenerationError("malformed_response", response.status);
    return validateImageBytes(await readBytes(response));
  }
}

function side(value: number): boolean { return Number.isInteger(value) && value >= MIN_SIDE && value <= MAX_SIDE && value % 8 === 0; }
function units(header: string | null): number | undefined {
  if (header === null || !/^\s*\d+(?:\.\d+)?\s*$/.test(header)) return undefined;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 && value <= 1000 ? value : undefined;
}
async function readBytes(response: Response): Promise<Buffer> {
  if (Number(response.headers.get("content-length") ?? 0) > IMAGE_LIMITS.max_image_bytes) throw new ImageGenerationError("invalid_image");
  let bytes: Buffer;
  try { bytes = Buffer.from(await response.arrayBuffer()); } catch { throw new ImageGenerationError("transient_provider_error"); }
  if (bytes.length > IMAGE_LIMITS.max_image_bytes) throw new ImageGenerationError("invalid_image");
  return bytes;
}
async function readText(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > IMAGE_LIMITS.max_response_bytes) throw new ImageGenerationError("malformed_response");
  let text: string;
  try { text = await response.text(); } catch { throw new ImageGenerationError("transient_provider_error"); }
  if (text.length > IMAGE_LIMITS.max_response_bytes) throw new ImageGenerationError("malformed_response");
  return text;
}
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await readText(response);
  try { const value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; } catch { throw new ImageGenerationError("malformed_response"); }
}
/** fal 422 `content_policy_violation` (prompt or output checker; not billed) → content_refusal. Bodies are inspected, never surfaced. */
async function httpError(response: Response): Promise<ImageGenerationError> {
  const status = response.status;
  if (status === 401 || status === 403) return new ImageGenerationError("auth_error", status);
  if (status === 402) return new ImageGenerationError("insufficient_credits", status);
  if (status === 429) return new ImageGenerationError("rate_limited", status);
  if (status === 408 || status === 502 || status === 503 || status === 504 || status === 524 || status === 529) return new ImageGenerationError("transient_provider_error", status);
  if (status >= 500) return new ImageGenerationError("provider_error", status);
  if (status === 422 || status === 400) {
    let refused = false;
    try { refused = contentPolicy(JSON.parse(await readText(response))); } catch { refused = false; }
    if (refused) return new ImageGenerationError("content_refusal", status);
  }
  return new ImageGenerationError(status >= 400 && status < 500 ? "invalid_request" : "malformed_response", status);
}
function contentPolicy(body: unknown): boolean {
  const detail = body && typeof body === "object" ? (body as { detail?: unknown; error?: unknown }).detail ?? (body as { error?: unknown }).error : undefined;
  const entries = Array.isArray(detail) ? detail : detail ? [detail] : [];
  return entries.some(entry => entry && typeof entry === "object" && (entry as { type?: unknown }).type === "content_policy_violation");
}
