import type { CampaignCommand } from "../campaign/types.js";
import type { GenerationMetadata } from "./types.js";
export interface ControllerRequest {
  readonly player_action: string;
  readonly prior_state: string;
  readonly final_narration: string;
  readonly signal?: AbortSignal;
}
/** evidence[i] is the controller-supplied verbatim quote for commands[i] (Phase 1O); absent for legacy or mock controllers. */
export interface ControllerResult extends GenerationMetadata { readonly commands: readonly CampaignCommand[]; readonly evidence?: readonly string[] }
export interface StateControllerProvider { propose(request: ControllerRequest): Promise<ControllerResult> }
