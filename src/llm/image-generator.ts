import type { PortraitMediaType } from "../campaign/types.js";

/**
 * Provider-neutral portrait image generation contract. The application (GameSession batches, Gallery, UI) depends only on this
 * module; provider clients (Hugging Face-routed fal-ai in production, OpenRouter kept for compatibility) implement it. Nothing
 * here knows about HF, fal, request shapes, campaigns or storage.
 */
export const IMAGE_LIMITS = Object.freeze({ max_image_bytes: 15 * 1024 * 1024, max_response_bytes: 30 * 1024 * 1024, max_prompt_characters: 4000 });

/** One image request. `seed` is sent explicitly for traceability (providers may still return different pixels for the same seed). */
export interface ImageGenerationRequest {
  readonly prompt: string;
  readonly negative_prompt?: string;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Optional reference images; providers that cannot consume them must ignore them (the v1 Raena path never sends any). */
  readonly references?: readonly ImageReference[];
  readonly signal?: AbortSignal;
}
export interface ImageReference { readonly media_type: PortraitMediaType; readonly bytes: Uint8Array }
export interface GeneratedImage {
  readonly bytes: Buffer;
  readonly media_type: PortraitMediaType;
  readonly provider: string;
  readonly model: string;
  /** Style adapter (LoRA) identity, when the provider applied one. */
  readonly style_id?: string;
  /** Seed the provider reports having used, when it reports one. */
  readonly provider_seed?: number;
  /** Provider billing units, only when the provider returns them (never invented). */
  readonly billable_units?: number;
  readonly cost_usd?: number;
  readonly latency_ms: number;
}
/** What the application needs to know about a generator before calling it (recorded in portrait metadata). */
export interface ImageGeneratorIdentity { readonly provider: string; readonly model: string; readonly style_id?: string }
/** The seam the application depends on; tests inject local fakes. */
export interface PortraitImageGenerator {
  readonly identity: ImageGeneratorIdentity;
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
}

/**
 * Structured failure codes. `content_refusal`: the provider's content checker refused the request or its output (not billed).
 * `transient_provider_error`: 502/503/504/524/529, timeouts and network failures. `rate_limited`: 429.
 */
export type ImageGenerationErrorCode = "configuration_error" | "auth_error" | "insufficient_credits" | "rate_limited" | "transient_provider_error"
  | "provider_error" | "invalid_request" | "malformed_response" | "invalid_image" | "content_refusal";
/** Never carries response bodies, headers or credentials: a code and (for HTTP failures) the status only. */
export class ImageGenerationError extends Error {
  constructor(readonly code: ImageGenerationErrorCode, readonly status?: number) { super(`Portrait generation failed: ${code}${status ? ` (HTTP ${status})` : ""}`); this.name = "ImageGenerationError"; }
}
/**
 * The one recovery an image may receive. `reseed`: content refusal → retry once with a NEW seed. `same_seed`: transport/provider
 * failure (any 5xx/timeout/network/429) → retry once with the SAME seed. `none`: auth, credits, invalid request, malformed output.
 */
export function recoveryFor(code: ImageGenerationErrorCode | undefined): "reseed" | "same_seed" | "none" {
  if (code === "content_refusal") return "reseed";
  if (code === "transient_provider_error" || code === "rate_limited" || code === "provider_error") return "same_seed";
  return "none";
}

/** Detected from the bytes' signature; a declared type must agree. */
export function sniffImage(bytes: Uint8Array): PortraitMediaType | undefined {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return undefined;
}
/** Raw bytes → validated image (size bound + signature; a declared type must agree). */
export function validateImageBytes(bytes: Buffer, declared?: unknown): { bytes: Buffer; media_type: PortraitMediaType } {
  if (!bytes.length || bytes.length > IMAGE_LIMITS.max_image_bytes) throw new ImageGenerationError("invalid_image");
  const media_type = sniffImage(bytes);
  if (!media_type) throw new ImageGenerationError("invalid_image");
  if (declared !== undefined && declared !== null && declared !== media_type) throw new ImageGenerationError("invalid_image");
  return { bytes, media_type };
}
/** Strict base64 decode + signature check + size bound. */
export function decodeImage(b64: unknown, declared?: unknown): { bytes: Buffer; media_type: PortraitMediaType } {
  if (typeof b64 !== "string" || !b64.length || b64.length > Math.ceil(IMAGE_LIMITS.max_image_bytes / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64.replace(/\s+/g, ""))) throw new ImageGenerationError("invalid_image");
  return validateImageBytes(Buffer.from(b64.replace(/\s+/g, ""), "base64"), declared);
}
/** fetch raced against a bound; timeouts and network failures become transient_provider_error. */
export async function boundedFetch(fetcher: typeof fetch, url: string, init: RequestInit, timeout_ms: number, signal?: AbortSignal): Promise<Response> {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeout_ms);
  const onAbort = () => abort.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const aborted = new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new ImageGenerationError("transient_provider_error")), { once: true }));
  try { return await Promise.race([fetcher(url, { ...init, redirect: "error", signal: abort.signal }), aborted]); }
  catch (error) { throw error instanceof ImageGenerationError ? error : new ImageGenerationError("transient_provider_error"); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}
