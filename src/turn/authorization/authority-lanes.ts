import type { CampaignCommand } from "../../campaign/types.js";

/**
 * Block B5 (PIPE-6): every producer that puts a command into a turn's commit, declared by name. A turn's commit is ONE batch assembled from these lanes,
 * and `TurnResult.committed` records, for each command of the batch the receipt was prepared from, the lane that produced it. Declaration only: no lane
 * decides differently because it is named here, and nothing outside this list adds a command to a turn's commit.
 *
 *   player_runtime           the player's own act (travel, time, mana, carry, held-person escort), resolved and prevalidated before any provider call
 *   preferred_authorization  Controller proposals and derived proposals decided by the grammar and a verified quote (authorizeWithEvidence)
 *   trade                    goods and item offers and withdrawals on their own evidence path; goods offers are re-decided on the delivered text (TRD-2)
 *   late_naming              commit preparation: a present unnamed persistent character's own self-introduction in the delivered text names that record
 *   name_knowledge           commit preparation: Nicco learns a canonical name the delivered text discloses under the disclosure gate
 *   character_contract       commit preparation: a quoted first-person self-description of a present active NPC+ becomes a set-once contract
 *   person_offer             commit preparation: the seller's stated price for one resolvable person becomes an offer card (nothing settles before Accept)
 *
 * The four commit-preparation lanes read the DELIVERED text and bypass authorizeWithEvidence by design: they are not Controller proposals and have no
 * Controller quote. Explicit player actions outside a turn (Accept, Keep track, confirmations, the Heartstone rite, editors) are not turn lanes.
 */
export type AuthorityLane = "player_runtime" | "preferred_authorization" | "trade" | "late_naming" | "name_knowledge" | "character_contract" | "person_offer";
export interface LaneDeclaration {
  readonly stage: "intent" | "authorization" | "commit_preparation";
  /** The text the lane decides on. */
  readonly reads: "player_input" | "draft" | "delivered";
  /** The only command kinds the lane may emit; absent for the preferred path, which decides the Controller vocabulary. */
  readonly kinds?: readonly CampaignCommand["kind"][];
}
export const AUTHORITY_LANES: Readonly<Record<AuthorityLane, LaneDeclaration>> = {
  player_runtime: { stage: "intent", reads: "player_input", kinds: ["runtime_delta", "move_character"] },
  preferred_authorization: { stage: "authorization", reads: "draft" },
  trade: { stage: "authorization", reads: "draft", kinds: ["propose_trade_offer", "withdraw_trade_offer"] },
  late_naming: { stage: "commit_preparation", reads: "delivered", kinds: ["set_profile"] },
  name_knowledge: { stage: "commit_preparation", reads: "delivered", kinds: ["create_fact", "set_knowledge"] },
  character_contract: { stage: "commit_preparation", reads: "delivered", kinds: ["establish_character_contract"] },
  person_offer: { stage: "commit_preparation", reads: "delivered", kinds: ["propose_trade_offer"] },
};
/** One command of a turn's commit and the lane that produced it. */
export interface LaneCommand {
  readonly lane: AuthorityLane;
  readonly command: CampaignCommand;
  /** The quote or sentence the lane decided on, when it has one (diagnostic only). */
  readonly evidence?: string;
}
export const laneCommands = (lane: AuthorityLane, commands: readonly CampaignCommand[], evidence: (command: CampaignCommand, index: number) => string | undefined = () => undefined): LaneCommand[] =>
  commands.map((command, k) => { const e = evidence(command, k); return { lane, command, ...(e ? { evidence: e } : {}) }; });
