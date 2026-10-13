import type { PreparedCampaignChange } from "../../campaign/campaign-state.js";
import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { AuthorizationDiagnostic } from "../turn-types.js";
import type { NarrationFactSource } from "../narration-facts/index.js";
import { authorizeTradeProposals } from "../trade-authorization.js";
import type { WorldStore } from "../../world/world-store.js";
import { buildTurnContext } from "../context-builder.js";
import { contextRelevance } from "./intent.js";
import { establishNames, type IdentityResolution } from "../name-establishment.js";
import { contractCommands } from "../character-contracts.js";
import { resolvePersonOffers } from "../person-offers.js";
import { establishedCanonicalDisclosure } from "../canonical-name-disclosure.js";
import { partnerNameConflict } from "../partner-identity-guard.js";
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
  readonly scene: SceneParticipantPlan; readonly base_revision: number; readonly facts?: NarrationFactSource;
  readonly disclosure_intent?: PlayerIntent;
  /** TRD-2: the authorization diagnostics and pre-turn snapshot, so goods/item offers are re-checked against the DELIVERED text. */
  readonly trade_recheck?: { readonly diagnostics: readonly AuthorizationDiagnostic[]; readonly projected: DeepReadonly<CampaignSnapshot> };
  /** Hardening H1: a turn in which Nicco changed location never promotes a newly named person (`location_changed`). */
  readonly location_changed: boolean;
  readonly on_skip: (reason: string) => void }): CommitPlan {
  const offerDiagnostics: TransactionDiagnostic[] = [];
  // TRD-2: authorization read the DRAFT. Audit/reconciliation/redaction may have removed or changed the quoted sentence, and a card whose
  // quote is gone from what the player actually reads must not exist. Each goods/items offer is re-decided (same validator, same Controller
  // quote) against the delivered narration; a failure drops that offer and the batch is re-prepared. Only the offer is dropped, never the turn.
  let commands = i.commands, prepared = i.prepared;
  const recheck = i.trade_recheck;
  if (recheck) {
    const inputs = commands.filter(c => c.kind === "propose_trade_offer" && c.subject.kind !== "person").map(command => ({ command,
      quote: recheck.diagnostics.find(d => d.authorized && isDeepStrictEqual(d.command, command))?.evidence?.quote ?? undefined }));
    if (inputs.length) {
      try {
        const context = buildTurnContext(i.world, recheck.projected, contextRelevance(i.player_input, i.finalized));
        const decided = authorizeTradeProposals(inputs, i.delivered, context, recheck.projected, i.world, i.facts);
        const dropped = new Set(inputs.filter((_, k) => !decided[k]!.authorized).map((x): CampaignCommand => x.command));
        if (dropped.size) {
          offerDiagnostics.push(...decided.filter(d => !d.authorized).map((): TransactionDiagnostic => ({ kind: "offer", status: "blocked", reason: "quote_not_in_delivered_text" })));
          commands = commands.filter(c => !dropped.has(c));
          prepared = i.prepare({ expected_revision: i.base_revision, commands });
        }
      } catch (error) { i.on_skip(`trade_recheck: ${error instanceof Error ? error.message : String(error)}`); commands = i.commands; prepared = i.prepared; }
    }
  }
  i = { ...i, commands, prepared };
  try {
    const context = buildTurnContext(i.world, i.prepared.snapshot, contextRelevance(i.player_input, i.finalized));
    const partner_conflict = i.location_changed ? undefined : partnerNameConflict({ context, world: i.world, snapshot: i.prepared.snapshot, finalized: i.finalized, player_input: i.player_input, delivered: i.delivered, scene: i.scene });
    const resolved = establishNames([...i.finalized, { player: i.player_input, narration: i.delivered, status: "finalized", location_id: i.prepared.snapshot.runtime.scene.player_location }],
      context, i.world, i.prepared.snapshot, i.scene.participants, i.base_revision, { location_changed: i.location_changed, ...(partner_conflict ? { partner_conflict } : {}) });
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
        const offers = resolvePersonOffers(i.player_input, after, receipt.snapshot, exchanges, i.base_revision, { world: i.world, participants: i.scene.participants, ...(i.facts ? { facts: i.facts } : {}) });
        offerDiagnostics.push(...offers.diagnostics.map((d): TransactionDiagnostic => ({ kind: "offer", status: d.status === "offered" ? "resolved" : d.status,
          ...(typeof d.detail.reason === "string" ? { reason: d.detail.reason } : {}), ...(typeof d.detail.price === "number" ? { price: d.detail.price } : {}) })));
        if (offers.commands.length) {
          receipt = i.prepare({ expected_revision: i.base_revision, commands: [...applied, ...offers.commands] });
        }
      } catch (error) { i.on_skip(`person_offer: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { receipt, identity: { provisional: resolved.provisional, named: resolved.named, skipped: resolved.skipped }, ...(offerDiagnostics.length ? { offers: offerDiagnostics } : {}) };
  } catch (error) {
    // Unresolvable identity: do nothing rather than promote the wrong person; the turn still commits.
    const reason = error instanceof Error ? error.message : String(error);
    i.on_skip(reason);
    return { receipt: i.prepared, identity: { provisional: [], named: [], skipped: [] }, identity_skipped: reason };
  }
}
