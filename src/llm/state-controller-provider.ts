import type { CampaignCommand } from "../campaign/types.js";
import type { GenerationMetadata } from "./types.js";
export interface ControllerRequest {
  readonly player_action: string;
  readonly prior_state: string;
  readonly final_narration: string;
  readonly signal?: AbortSignal;
  /** H5: per-attempt upper bound; the provider uses the smaller of this and its configured timeout. */
  readonly timeout_ms?: number;
}
/** evidence[i] is the controller-supplied verbatim quote for commands[i] (Phase 1O); absent for legacy or mock controllers. */
export interface ControllerResult extends GenerationMetadata { readonly commands: readonly CampaignCommand[]; readonly evidence?: readonly string[];
  /** Model fallback (diagnostics only): the `models` list requested, and whether a fallback model answered (undefined when unreported). */
  readonly requested_models?: readonly string[]; readonly model_fallback?: boolean;
  /** Controller Reliability Pass 1 (debug only): set when the output parsed only after lossless normalization. */
  readonly normalization?: import("./controller-schema.js").ControllerNormalization & { readonly final_parse: string; readonly raw_text: string } }
export interface StateControllerProvider { propose(request: ControllerRequest): Promise<ControllerResult> }
