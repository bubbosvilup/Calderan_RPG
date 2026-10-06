import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import { parseControllerProposal } from "../../llm/controller-schema.js";
import type { ControllerResult } from "../../llm/state-controller-provider.js";
import { FOLLOWS_NICCO, narratedDepartures, stairDirection, canonicalDepartureClaims, canonicalDepartureContradiction } from "../scene-departure.js";
import { characterLocation, doorDestination, narratedMovements, npcPlusEntrants, uniqueVerticalNeighbour, type MovableCharacter } from "../character-movement.js";
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
  const grammarMoves = narratedMovements(i.draft, [...i.movable, ...npcPlusEntrants(i.projected, i.world, [i.origin, i.arrival])], { origin: i.origin, arrival: i.arrival, locate: id => characterLocation(i.projected, i.world, id) }, i.context, i.world, activeNpcPlus(i.projected));
  // Final movement closure: a completed stair exit that states its direction ("crosses to the stairs and descends", "her footsteps fading as she
  // climbed") of an active NPC+ with Nicco, while Nicco stays, goes to the ONE structured neighbour in that direction. No unique neighbour: no
  // movement (the audit withdraws the claim). Same evidence path as any other narrated movement.
  const npcPlusIds = activeNpcPlus(i.projected);
  const stairMoves = i.origin !== i.arrival ? [] : narratedDepartures(i.draft, i.context, "persistent", { stairs: true }).flatMap(d => {
    const dir = npcPlusIds.has(d.character_id) && !grammarMoves.some(m => m.character_id === d.character_id) && characterLocation(i.projected, i.world, d.character_id) === i.arrival ? stairDirection(d.source_sentence) : undefined;
    const to = dir ? uniqueVerticalNeighbour(i.world, i.arrival, dir) : undefined;
    return to ? [{ character_id: d.character_id, location_id: to, source_sentence: d.source_sentence }] : [];
  });
  // A completed door exit that names no place, where the draft's nearby door wording names exactly one directly connected known place ("the courtyard door").
  const doorMoves = i.origin !== i.arrival ? [] : narratedDepartures(i.draft, i.context, "persistent").flatMap(d => {
    const taken = grammarMoves.some(m => m.character_id === d.character_id) || stairMoves.some(m => m.character_id === d.character_id);
    const here = characterLocation(i.projected, i.world, d.character_id);
    const to = npcPlusIds.has(d.character_id) && !taken && here === i.arrival && !stairDirection(d.source_sentence) ? doorDestination(i.draft, d.source_sentence, here, i.context, i.world) : undefined;
    return to ? [{ character_id: d.character_id, location_id: to, source_sentence: d.source_sentence }] : [];
  });
  const turn_evidence: TurnEvidence = { ...deriveTurnEvidence(i.intent, i.draft, i.context), character_movements: [...grammarMoves, ...stairMoves, ...doorMoves] };
  // NPC+ Pass 3 proposal recall: a completed narrated movement of an eligible mover (created, or active authored NPC+ — the `movable`
  // set) that the controller did not propose becomes a move_character PROPOSAL. Authorization is unchanged and still decides; a mover
  // already at that destination, a request, refusal, hesitation, membership or ownership yields no evidence and so no proposal.
  // Pass 10: only a controller proposal for the SAME destination suppresses the derived one. A controller move to another place is rejected
  // by authorization (the evidence names a different destination), and suppressing the derived proposal then lost a valid narrated follow.
  const derived = turn_evidence.character_movements!.filter(m => !controllerProposal.some(c => c.kind === "move_character" && c.character_id === m.character_id && c.location_id === m.location_id)
    && characterLocation(i.projected, i.world, m.character_id) !== m.location_id).map(m => ({ kind: "move_character" as const, character_id: m.character_id, location_id: m.location_id }));
  // Final movement closure (D-07): a completed departure of an ACTIVE NPC+ present with Nicco whose destination the narration does not
  // establish is OFF_SCENE evidence. A known destination always wins (it is a movement, above), and a bare stair direction is never "unknown":
  // either it resolves to the one structured neighbour (a movement) or it fails closed (audit redacts it).
  const moving = new Set(turn_evidence.character_movements!.map(m => m.character_id)), npcPlus = activeNpcPlus(i.projected);
  const STAIR_WORD = /\b(?:down|up)stairs\b|\b(?:down|up)\s+the\s+(?:[a-z]+\s+)?(?:stairs|steps|staircase)\b/i;
  const npcDepartures = narratedDepartures(i.draft, i.context, "persistent").filter(d => npcPlus.has(d.character_id) && !moving.has(d.character_id) && !STAIR_WORD.test(d.source_sentence)
    && !(i.origin === i.arrival && FOLLOWS_NICCO.test(d.source_sentence)) // a conjoined "follows him" exit depends on Nicco, who did not go: never OFF_SCENE evidence
    && characterLocation(i.projected, i.world, d.character_id) === i.arrival);
  const claims = canonicalDepartureClaims(i.draft, i.context).filter(d => !npcPlus.has(d.character_id));
  const canonicalActors = i.context.characters.filter(c => c.origin.kind === "canonical" && c.id !== "nicco").map(c => ({ id: c.id, names: [c.profile.name ?? c.id] }));
  const knownMoves = narratedMovements(i.draft, canonicalActors, { origin: i.origin, arrival: i.arrival, locate: id => characterLocation(i.projected, i.world, id) }, i.context, i.world);
  const canonicalDepartures = new Set(claims.map(d => d.character_id)).size !== 1 ? [] : claims.filter(d => !d.ambiguous && i.origin === i.arrival
    && characterLocation(i.projected, i.world, d.character_id) === i.arrival && !canonicalDepartureContradiction(i.draft, i.context, d.character_id)
    && !knownMoves.some(m => m.character_id === d.character_id) && !doorDestination(i.draft, d.source_sentence, i.arrival, i.context, i.world)
    && !STAIR_WORD.test(d.source_sentence) && !FOLLOWS_NICCO.test(d.source_sentence));
  const departures = [...npcDepartures, ...canonicalDepartures];
  const evidenceWithDepartures: TurnEvidence = departures.length ? { ...turn_evidence, departures: [...(turn_evidence.departures ?? []), ...departures] } : turn_evidence;
  const departureProposals = [...new Set(departures.map(d => d.character_id))].filter(id => !controllerProposal.some(c => c.kind === "leave_scene" && c.character_id === id)).map(character_id => ({ kind: "leave_scene" as const, character_id }));
  const proposal = [...controllerProposal, ...derived, ...departureProposals];
  // Derived proposals are appended after the controller's, so the controller's per-index evidence quotes stay aligned (derived: none).
  const diagnostics = authorizeWithEvidence(proposal, quotes, evidenceWithDepartures, i.draft, i.context, i.projected, i.mode);
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
  return { proposal, turn_evidence: evidenceWithDepartures, diagnostics, duplicates_removed };
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
