import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import { parseControllerProposal } from "../../llm/controller-schema.js";
import type { ControllerResult } from "../../llm/state-controller-provider.js";
import { characterLocation, narratedMovements, type MovableCharacter } from "../character-movement.js";
import type { TurnContext } from "../context-builder.js";
import { authorizeWithEvidence, verifyEvidence, type EvidenceMode } from "../evidence-authorization.js";
import { deriveTurnEvidence, type TurnEvidence } from "../turn-evidence.js";
import { activeNpcPlus } from "../../campaign/premium-characters.js";
import { sentencesOf } from "../language/text.js";
import type { AuthorizationDiagnostic, TurnDebugSink } from "../turn-types.js";
import type { TurnIntent } from "./intent.js";

/**
 * Hardening H2 — AuthorizationStage. Turns a controller PROPOSAL into an authorization decision per command, using deterministic
 * evidence derived from the player's intent and the narration draft. Sync. Never mutates state: a decision here is still only a
 * candidate until CampaignState validates the whole batch at final preparation.
 */
export interface AuthorizationOutcome {
  /** The controller's commands after strict local parsing (still a proposal). */
  readonly proposal: readonly CampaignCommand[];
  readonly turn_evidence: TurnEvidence;
  /** One decision (authorized or rejected with a reason) per proposed command. */
  readonly diagnostics: readonly AuthorizationDiagnostic[];
  /** D-14: identical controller move_character proposals collapsed to one before authorization (diagnostic only). */
  readonly duplicates_removed: number;
}
/**
 * Failure mapping: the coordinator still holds `controller_failed` (a proposal that fails strict parsing is a controller failure).
 * The optional debug sink receives controller-normalization and omission-candidate records only; nothing is synthesized.
 */
export function authorizeTurn(i: { readonly controller: ControllerResult; readonly intent: TurnIntent; readonly draft: string; readonly context: TurnContext;
  readonly projected: DeepReadonly<CampaignSnapshot>; readonly movable: readonly MovableCharacter[]; readonly origin: string; readonly arrival: string;
  readonly world: WorldStore; readonly mode: EvidenceMode; readonly sink: TurnDebugSink | undefined;
  readonly debug_base: { readonly campaign_id: string; readonly base_revision: number; readonly player_input: string } }): AuthorizationOutcome {
  const parsed = parseControllerProposal(JSON.stringify({ commands: i.controller.commands }));
  // D-14: an identical (mover, destination) pair proposed twice is one proposal. First occurrence wins (stable order); the controller's
  // per-index evidence quotes are filtered with the same indexes, so each kept command keeps its own quote.
  const seenMoves = new Map<string, Set<string>>(), keep: number[] = [];
  parsed.forEach((c, k) => {
    if (c.kind === "move_character") { const to = seenMoves.get(c.character_id) ?? new Set<string>(); if (to.has(c.location_id)) return; to.add(c.location_id); seenMoves.set(c.character_id, to); }
    keep.push(k);
  });
  const controllerProposal = keep.map(k => parsed[k]!), duplicates_removed = parsed.length - keep.length;
  const kept = new Set(keep), quotes = duplicates_removed ? i.controller.evidence?.filter((_, k) => kept.has(k)) : i.controller.evidence;
  const turn_evidence: TurnEvidence = { ...deriveTurnEvidence(i.intent, i.draft, i.context), character_movements: narratedMovements(i.draft, i.movable, { origin: i.origin, arrival: i.arrival }, i.context, i.world, activeNpcPlus(i.projected)) };
  // NPC+ Pass 3 proposal recall: a completed narrated movement of an eligible mover (created, or active authored NPC+ — the `movable`
  // set) that the controller did not propose becomes a move_character PROPOSAL. Authorization is unchanged and still decides; a mover
  // already at that destination, a request, refusal, hesitation, membership or ownership yields no evidence and so no proposal.
  // Pass 10: only a controller proposal for the SAME destination suppresses the derived one. A controller move to another place is rejected
  // by authorization (the evidence names a different destination), and suppressing the derived proposal then lost a valid narrated follow.
  const derived = turn_evidence.character_movements!.filter(m => !controllerProposal.some(c => c.kind === "move_character" && c.character_id === m.character_id && c.location_id === m.location_id)
    && characterLocation(i.projected, i.world, m.character_id) !== m.location_id).map(m => ({ kind: "move_character" as const, character_id: m.character_id, location_id: m.location_id }));
  const proposal = [...controllerProposal, ...derived];
  // Derived proposals are appended after the controller's, so the controller's per-index evidence quotes stay aligned (derived: none).
  const diagnostics = authorizeWithEvidence(proposal, quotes, turn_evidence, i.draft, i.context, i.projected, i.mode);
  // Controller Reliability Pass 1 (debug only, never events): normalized outputs, and deterministic candidates with verified
  // narration evidence that the controller did not propose. Nothing is synthesized; this only measures omissions.
  if (i.sink) {
    const sink = i.sink, base = i.debug_base;
    if (i.controller.normalization) sink({ kind: "controller_normalized", ...base, normalization: i.controller.normalization });
    const spans = sentencesOf(i.draft).flatMap(s => s.length <= 240 ? [s] : s.split(/(?<=[,;:])\s+/));
    i.intent.candidates.forEach((candidate, index) => {
      const proposed = proposal.some(p => isDeepStrictEqual(p, candidate) || p.kind === "transfer_item" && candidate.kind === "transfer_item" && p.item_id === candidate.item_id && p.owner_id === candidate.owner_id);
      if (proposed) return;
      const evidenceSentence = turn_evidence.narrator_confirmations.find(c => c.command_indexes.includes(index))?.source_sentence ?? spans.find(s => verifyEvidence(candidate, s, i.draft, i.context, turn_evidence.player_intents).verified);
      if (evidenceSentence) sink({ kind: "controller_omission_candidate", ...base, candidate, evidence: evidenceSentence, proposal_size: proposal.length });
    });
  }
  return { proposal, turn_evidence, diagnostics, duplicates_removed };
}

export interface TurnCommands {
  /** Authorized controller commands (inbound gifts carry deterministic acquisition provenance). */
  readonly authorized: readonly CampaignCommand[];
  /** The whole candidate batch for final preparation: player runtime effects first, then authorized commands. */
  readonly commands: readonly CampaignCommand[];
}
/** Sync, pure. Failure mapping: still `controller_failed` in the coordinator (pre-H2 order). */
export function assembleTurnCommands(i: { readonly diagnostics: readonly AuthorizationDiagnostic[]; readonly intent: TurnIntent; readonly projected: DeepReadonly<CampaignSnapshot> }): TurnCommands {
  // Inbound gifts record their provenance deterministically (the controller vocabulary has no acquisition field).
  const minute = i.projected.runtime.scene.world_time.world_minute;
  const authorized = i.diagnostics.filter(d => d.authorized).map(d => {
    const c = d.command;
    if (c.kind !== "transfer_item" || c.owner_id !== "nicco" || c.acquisition) return c;
    const item = i.projected.items.find(it => it.id === c.item_id);
    const from = item && (item.position.kind === "carried" || item.position.kind === "equipped") ? item.position.character_id : undefined;
    return from ? { ...c, acquisition: { acquisition_kind: "gift" as const, from_character_id: from, acquired_at: minute } } : c;
  });
  return { authorized, commands: [...i.intent.runtime, ...authorized] };
}
