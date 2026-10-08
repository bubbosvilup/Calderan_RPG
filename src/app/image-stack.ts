import type { FalImageStackConfig } from "../llm/huggingface/fal-image-client.js";

/**
 * The one place the v1 portrait image stack is configured (validated by the LORA_AND_POSE_AUDIT benchmark, 2026-10-08).
 * Style adapter Raelina/Raena-Qwen-Image on base Qwen/Qwen-Image, served by fal-ai through the Hugging Face router, billed to
 * HF_TOKEN. The LoRA weights URL is the HF provider mapping's adapterWeightsPath, fixed here so it is never rediscovered per call.
 * OpenRouter is NOT used for images (it remains the narrator/controller LLM provider).
 */
export interface PortraitImageStack extends FalImageStackConfig {
  /** Raena's style trigger; every prompt starts with it. */
  readonly trigger: string;
  /** fal-ai/qwen-image price per billable unit (1 unit = up to 1024×1024 pixels). Cost is recorded only when units are returned. */
  readonly price_usd_per_billable_unit: number;
  readonly avatar_size: { readonly width: number; readonly height: number };
  readonly fullbody_size: { readonly width: number; readonly height: number };
}
export const RAENA_IMAGE_STACK: PortraitImageStack = Object.freeze({
  router_base: "https://router.huggingface.co",
  provider: "fal-ai",
  endpoint: "fal-ai/qwen-image",
  base_model: "Qwen/Qwen-Image",
  style_id: "Raelina/Raena-Qwen-Image",
  lora_url: "https://huggingface.co/Raelina/Raena-Qwen-Image/resolve/main/raena_qwen_image_lora_v0.1.safetensors",
  lora_scale: 1,
  download_hosts: Object.freeze(["fal.media"]),
  trigger: "Anime illustration of",
  price_usd_per_billable_unit: 0.02,
  avatar_size: Object.freeze({ width: 992, height: 992 }),
  fullbody_size: Object.freeze({ width: 800, height: 1200 }),
});
/** Clear, token-free status for startup hints: never prints any part of HF_TOKEN. */
export function imageStackStatus(env: Readonly<Record<string, string | undefined>> = process.env): { readonly configured: boolean; readonly message: string } {
  return env.HF_TOKEN?.trim()
    ? { configured: true, message: `Portrait images: ${RAENA_IMAGE_STACK.style_id} via ${RAENA_IMAGE_STACK.provider} (Hugging Face router, HF_TOKEN set).` }
    : { configured: false, message: "Portrait images disabled: set HF_TOKEN (a Hugging Face token with Inference Providers access) to generate NPC portraits." };
}
