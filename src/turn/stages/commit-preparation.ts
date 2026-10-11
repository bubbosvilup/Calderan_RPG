import type { PreparedCampaignChange } from "../../campaign/campaign-state.js";
import type { CampaignCommand } from "../../campaign/types.js";
import type { WorldStore } from "../../world/world-store.js";
import { buildTurnContext } from "../context-builder.js";
import { contextRelevance } from "./intent.js";
import { establishNames, type IdentityResolution } from "../name-establishment.js";
import { contractCommands } from "../character-contracts.js";
import { resolvePersonOffers } from "../person-offers.js";
import { establishedCanonicalDisclosure } from "../canonical-name-disclosure.js";
import { learnCanonicalName } from "../../campaign/identity-knowledge.js";
import type { PlayerIntent, TransactionDiagnostic } from "../player-intent.js";
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
  /** Actual Offer V1: what the person-offer reader decided this turn (diagnostics only). */
  readonly offers?: readonly TransactionDiagnostic[];
}
export function prepareCommit(i: { readonly world: WorldStore; readonly prepare: (proposal: unknown) => PreparedCampaignChange; readonly prepared: PreparedCampaignChange;
  readonly commands: readonly CampaignCommand[]; readonly finalized: readonly RecentExchange[]; readonly player_input: string; readonly delivered: string;
  readonly scene: SceneParticipantPlan; readonly base_revision: number;
  readonly disclosure_intent?: PlayerIntent;
  /** Hardening H1: a turn in which Nicco changed location never promotes a newly named person (`location_changed`). */
  readonly location_changed: boolean;
  readonly on_skip: (reason: string) => void }): CommitPlan {
  const offerDiagnostics: TransactionDiagnostic[] = [];
  try {
    const context = buildTurnContext(i.world, i.prepared.snapshot, contextRelevance(i.player_input, i.finalized));
    const resolved = establishNames([...i.finalized, { player: i.player_input, narration: i.delivered, status: "finalized", location_id: i.prepared.snapshot.runtime.scene.player_location }],
      context, i.world, i.prepared.snapshot, i.scene.participants, i.base_revision, { location_changed: i.location_changed });
    const disclosed = i.location_changed ? undefined : establishedCanonicalDisclosure(context, i.player_input, i.finalized, i.delivered, i.scene, i.disclosure_intent);
    const discovery = disclosed ? learnCanonicalName(i.world, i.prepared.snapshot, disclosed, { acquisition_kind: "told", source_character_id: disclosed, learned_at: i.prepared.snapshot.runtime.scene.world_time.world_minute }) : [];
    const batch = [...i.commands, ...resolved.commands, ...discovery];
    let receipt = resolved.commands.length || discovery.length ? i.prepare({ expected_revision: i.base_revision, commands: batch }) : i.prepared;
    // The command list `receipt` was prepared from (a person offer is appended to exactly this list).
    let applied: readonly CampaignCommand[] = batch;
    // NPC+ Pass 2: explicit self-descriptions of present active NPC+ in the DELIVERED narration become set-once campaign contracts,
    // committed with the turn. A contract that cannot be prepared is dropped (observably), never the turn or its identity changes.
    const contracts = contractCommands(i.delivered, context, i.prepared.snapshot);
    if (contracts.length) try { receipt = i.prepare({ expected_revision: i.base_revision, commands: [...batch, ...contracts] }); applied = [...batch, ...contracts]; } catch (error) { i.on_skip(`contracts: ${error instanceof Error ? error.message : String(error)}`); }
    // Actual Offer V1: a person offer is READ from the delivered narration (the seller's stated price for one resolvable person). It only records an
    // offer: nothing is paid, promoted or transferred until the player accepts it. Skipped when the turn already carries a goods offer; a plan that
    // cannot be prepared is dropped observably, never the turn.
    if (!applied.some(c => c.kind === "propose_trade_offer")) {
      try {
        const after = buildTurnContext(i.world, receipt.snapshot, contextRelevance(i.player_input, i.finalized));
        const exchanges = [...i.finalized, { player: i.player_input, narration: i.delivered, status: "finalized" as const, location_id: receipt.snapshot.runtime.scene.player_location }];
        const offers = resolvePersonOffers(i.player_input, after, receipt.snapshot, exchanges, i.base_revision, { world: i.world, participants: i.scene.participants });
        offerDiagnostics.push(...offers.diagnostics.map((d): TransactionDiagnostic => ({ kind: "offer", status: d.status === "offered" ? "resolved" : d.status,
          ...(typeof d.detail.reason === "string" ? { reason: d.detail.reason } : {}), ...(typeof d.detail.price === "number" ? { price: d.detail.price } : {}) })));
        if (offers.commands.length) {
          receipt = i.prepare({ expected_revision: i.base_revision, commands: [...applied, ...offers.commands] });
        }
      } catch (error) { i.on_skip(`person_offer: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { receipt, identity: { promoted: resolved.promoted, named: resolved.named, skipped: resolved.skipped }, ...(offerDiagnostics.length ? { offers: offerDiagnostics } : {}) };
  } catch (error) {
    // Unresolvable identity: do nothing rather than promote the wrong person; the turn still commits.
    const reason = error instanceof Error ? error.message : String(error);
    i.on_skip(reason);
    return { receipt: i.prepared, identity: { promoted: [], named: [], skipped: [] }, identity_skipped: reason };
  }
}
