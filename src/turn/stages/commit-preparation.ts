import type { PreparedCampaignChange } from "../../campaign/campaign-state.js";
import type { CampaignCommand } from "../../campaign/types.js";
import type { WorldStore } from "../../world/world-store.js";
import { buildTurnContext } from "../context-builder.js";
import { contextRelevance } from "./intent.js";
import { establishNames, type IdentityResolution } from "../name-establishment.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "../scene-participants.js";

/**
 * Hardening H2 — CommitPreparation. The last detached step before the authoritative commit: deterministic, name-driven identity
 * establishment on the DELIVERED narration (Persistence Pass 1.2 — no controller or importance decision). Its commands join the
 * already-validated batch and the WHOLE batch is re-prepared against the captured base revision; if that fails, identity changes are
 * dropped, never the turn (Hardening H1: observably — `identity_skipped` + a debug record).
 *
 * Sync. Never commits: the coordinator keeps `checkpoint(); campaign.commit(receipt)` visibly adjacent.
 */
export interface CommitPlan {
  /** The receipt the coordinator commits: the identity-extended batch, or the final preparation unchanged. */
  readonly receipt: PreparedCampaignChange;
  readonly identity: Omit<IdentityResolution, "commands">;
  /** Hardening H1: why identity establishment was skipped (diagnostic only; never authoritative). */
  readonly identity_skipped?: string;
}
export function prepareCommit(i: { readonly world: WorldStore; readonly prepare: (proposal: unknown) => PreparedCampaignChange; readonly prepared: PreparedCampaignChange;
  readonly commands: readonly CampaignCommand[]; readonly finalized: readonly RecentExchange[]; readonly player_input: string; readonly delivered: string;
  readonly scene: SceneParticipantPlan; readonly base_revision: number;
  /** Hardening H1: a turn in which Nicco changed location never promotes a newly named person (`location_changed`). */
  readonly location_changed: boolean;
  readonly on_skip: (reason: string) => void }): CommitPlan {
  try {
    const resolved = establishNames([...i.finalized, { player: i.player_input, narration: i.delivered, status: "finalized", location_id: i.prepared.snapshot.runtime.scene.player_location }],
      buildTurnContext(i.world, i.prepared.snapshot, contextRelevance(i.player_input, i.finalized)), i.world, i.prepared.snapshot, i.scene.participants, i.base_revision, { location_changed: i.location_changed });
    const receipt = resolved.commands.length ? i.prepare({ expected_revision: i.base_revision, commands: [...i.commands, ...resolved.commands] }) : i.prepared;
    return { receipt, identity: { promoted: resolved.promoted, named: resolved.named, skipped: resolved.skipped } };
  } catch (error) {
    // Unresolvable identity: do nothing rather than promote the wrong person; the turn still commits.
    const reason = error instanceof Error ? error.message : String(error);
    i.on_skip(reason);
    return { receipt: i.prepared, identity: { promoted: [], named: [], skipped: [] }, identity_skipped: reason };
  }
}
