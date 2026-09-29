import type { GenerationMetadata, GenerationRequest } from "./types.js";
import type { ProviderError } from "./errors.js";
export interface NarratorResult extends GenerationMetadata { readonly text: string }
export type NarratorStreamEvent =
  | { readonly type: "text_delta"; readonly text: string }
  | { readonly type: "completed"; readonly result: NarratorResult }
  | { readonly type: "error"; readonly text: string; readonly incomplete: true; readonly error: ProviderError };
export interface NarratorProvider {
  generate(request: GenerationRequest): Promise<NarratorResult>;
  stream(request: GenerationRequest): AsyncIterable<NarratorStreamEvent>;
}
