import { transferRecipient } from "../../campaign/item-transfer.js";
import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import { parseControllerProposal } from "../../llm/controller-schema.js";
import type { ControllerResult } from "../../llm/state-controller-provider.js";
import { characterMovementsFromFacts, departureClaimsFromFacts, departuresFromFacts, presenceClaimsFromFacts } from "../movement-evidence.js";
import { characterLocation, doorDestinationFromPlaces, npcPlusEntrants, uniqueVerticalNeighbour, type MovableCharacter } from "../character-movement.js";
import { createFactSource, type NarrationFactSource } from "../narration-facts/index.js";
import { movementFactScope } from "../movement-scope.js";
import type { TurnContext } from "../context-builder.js";
import { authorizeWithEvidence, verifyEvidence, type EvidenceMode } from "../evidence-authorization.js";
import { deriveTurnEvidence, type TurnEvidence } from "../turn-evidence.js";
import { activeNpcPlus } from "../../campaign/premium-characters.js";
import { followCandidates, followerIds } from "../follow-candidates.js";
import { sentencesOf } from "../language/text.js";
import { establishedCount, ownerEvidenced } from "../item-ownership.js";
import { resolveItemIntent, type ItemIntent } from "../item-intent.js";
import { authorizeTradeProposals, isTradeProposal, reframeOwnItemPurchase, vetoSettlementThroughItems } from "../trade-authorization.js";
const itemKey = (name: string) => name.trim().toLowerCase().replace(/^(?:the|a|an)\s+/, "");
const EXACT_REPEAT_KINDS: ReadonlySet<CampaignCommand["kind"]> = new Set(["transfer_item", "place_item", "set_knowledge", "set_condition", "schedule_event", "leave_scene", "join_household", "leave_household", "add_household_rule"]);
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
  /** The turn's shared NarrationFacts source (the audit reads the same one). Omitted: one is built from these inputs. */
  readonly facts?: NarrationFactSource;
  readonly debug_base: { readonly campaign_id: string; readonly base_revision: number; readonly player_input: string } }): AuthorizationOutcome {
  const parsed = parseControllerProposal(JSON.stringify({ commands: i.controller.commands }));
  // D-14: an identical (mover, destination) pair proposed twice is one proposal. First occurrence wins (stable order); the controller's
  // per-index evidence quotes are filtered with the same indexes, so each kept command keeps its own quote.
  // Pass B: an exact repeat of a state-describing command is the same proposal, not a second effect. Authorization validates every command against
  // the same pre-turn state, so a repeated transfer_item would pass twice and then fail the sequential preparation, failing the whole turn.
  // adjust_relationship and create_item are excluded: repeating them could be two distinct steps/objects, never silently merged.
  const seenMoves = new Map<string, Set<string>>(), keep: number[] = [];
  parsed.forEach((c, k) => {
    if (c.kind === "move_character") { const to = seenMoves.get(c.character_id) ?? new Set<string>(); if (to.has(c.location_id)) return; to.add(c.location_id); seenMoves.set(c.character_id, to); }
    else if (EXACT_REPEAT_KINDS.has(c.kind) && keep.some(j => isDeepStrictEqual(parsed[j], c))) return;
    // Pass C: the same object materialized twice in one proposal (same normalized name, same position) is one object. The authorizer
    // checks each create_item against the pre-turn state, so a repeat would otherwise create two items. Distinct names stay distinct.
    // Debt Zero: unless the narration explicitly establishes several identical copies ("two identical iron cups"), up to that many are kept.
    else if (c.kind === "create_item" && keep.filter(j => { const o = parsed[j]!; return o.kind === "create_item" && itemKey(o.name) === itemKey(c.name) && isDeepStrictEqual(o.position, c.position); }).length >= establishedCount(c.name, i.draft)) return;
    keep.push(k);
  });
  const controllerProposal = keep.map(k => parsed[k]!), duplicates_removed = parsed.length - keep.length;
  const kept = new Set(keep), quotes = duplicates_removed ? i.controller.evidence?.filter((_, k) => kept.has(k)) : i.controller.evidence;
  const facts = (i.facts ?? createFactSource(movementFactScope(i.projected, i.world, i.context, [i.origin, i.arrival]))).of(i.draft);
  const grammarMoves = characterMovementsFromFacts(facts, [...i.movable, ...npcPlusEntrants(i.projected, i.world, [i.origin, i.arrival])], { origin: i.origin, arrival: i.arrival, locate: id => characterLocation(i.projected, i.world, id) }, i.context, i.world, followerIds(followCandidates(i.projected, i.movable, i.debug_base.player_input)));
  // Final movement closure: a completed stair exit that states its direction ("crosses to the stairs and descends", "her footsteps fading as she
  // climbed") of an active NPC+ with Nicco, while Nicco stays, goes to the ONE structured neighbour in that direction. No unique neighbour: no
  // movement (the audit withdraws the claim). Same evidence path as any other narrated movement.
  const npcPlusIds = activeNpcPlus(i.projected);
  const stairMoves = i.origin !== i.arrival ? [] : departuresFromFacts(facts, i.context, "persistent", { stairs: true }).flatMap(d => {
    const dir = npcPlusIds.has(d.character_id) && !grammarMoves.some(m => m.character_id === d.character_id) && characterLocation(i.projected, i.world, d.character_id) === i.arrival ? d.fact.direction : undefined;
    const to = dir ? uniqueVerticalNeighbour(i.world, i.arrival, dir) : undefined;
    return to ? [{ character_id: d.character_id, location_id: to, source_sentence: d.source_sentence }] : [];
  });
  // A completed door exit that names no place, where the draft's nearby door wording names exactly one directly connected known place ("the courtyard door").
  const doorMoves = i.origin !== i.arrival ? [] : departuresFromFacts(facts, i.context, "persistent").flatMap(d => {
    const taken = grammarMoves.some(m => m.character_id === d.character_id) || stairMoves.some(m => m.character_id === d.character_id);
    const here = characterLocation(i.projected, i.world, d.character_id);
    const to = npcPlusIds.has(d.character_id) && !taken && here === i.arrival && !d.fact.direction ? doorDestinationFromPlaces(d.fact.door_places, here, i.context, i.world) : undefined;
    return to ? [{ character_id: d.character_id, location_id: to, source_sentence: d.source_sentence }] : [];
  });
  const turn_evidence: TurnEvidence = { ...deriveTurnEvidence(i.intent, i.draft, i.context, facts), character_movements: [...grammarMoves, ...stairMoves, ...doorMoves] };
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
  const npcDepartures = departuresFromFacts(facts, i.context, "persistent").filter(d => npcPlus.has(d.character_id) && !moving.has(d.character_id) && !d.fact.stairs_mentioned
    && !(i.origin === i.arrival && d.fact.follows_player) // a conjoined "follows him" exit depends on Nicco, who did not go: never OFF_SCENE evidence
    && characterLocation(i.projected, i.world, d.character_id) === i.arrival);
  const presentIds = new Set(i.context.characters.map(c => c.id));
  const claims = departureClaimsFromFacts(facts, undefined, presentIds).filter(d => !npcPlus.has(d.character_id));
  const canonicalActors = i.context.characters.filter(c => c.origin.kind === "canonical" && c.id !== "nicco").map(c => ({ id: c.id, names: [c.profile.name ?? c.id] }));
  const knownMoves = characterMovementsFromFacts(facts, canonicalActors, { origin: i.origin, arrival: i.arrival, locate: id => characterLocation(i.projected, i.world, id) }, i.context, i.world);
  const canonicalDepartures = new Set(claims.map(d => d.character_id)).size !== 1 ? [] : claims.filter(d => !d.ambiguous && i.origin === i.arrival
    && characterLocation(i.projected, i.world, d.character_id) === i.arrival && !presenceClaimsFromFacts(facts, d.character_id).length
    && !knownMoves.some(m => m.character_id === d.character_id) && !doorDestinationFromPlaces(d.fact.door_places, i.arrival, i.context, i.world)
    && !d.fact.stairs_mentioned && !d.fact.follows_player);
  const departures = [...npcDepartures, ...canonicalDepartures];
  const evidenceWithDepartures: TurnEvidence = departures.length ? { ...turn_evidence, departures: [...(turn_evidence.departures ?? []), ...departures] } : turn_evidence;
  const departureProposals = [...new Set(departures.map(d => d.character_id))].filter(id => !controllerProposal.some(c => c.kind === "leave_scene" && c.character_id === id)).map(character_id => ({ kind: "leave_scene" as const, character_id }));
  // Explicit item intent (pickup / put-down of ONE tracked item). It binds item and placement; it never proves success. A Controller that
  // omitted the bound command gets it proposed here as a DERIVED proposal, which authorization still decides on a verified receipt.
  const itemIntent = resolveItemIntent(i.debug_base.player_input, i.context);
  const isIntentKind = (c: CampaignCommand): c is Extract<CampaignCommand, { kind: "place_item" }> => c.kind === "place_item" && !!itemIntent && (itemIntent.kind === "pickup" ? c.position.kind === "carried" && c.position.character_id === "nicco" : c.position.kind === "stored");
  const itemDerived: CampaignCommand[] = itemIntent?.status === "bound" && !controllerProposal.some(isIntentKind) ? [itemIntent.command] : [];
  const proposal = [...controllerProposal, ...derived, ...departureProposals, ...itemDerived];
  // Derived proposals are appended after the controller's, so the controller's per-index evidence quotes stay aligned (derived: none).
  // Actual Offer V1: trade proposals take their own evidence path; the ordinary grammar knows nothing about them. A purchase or sale is settled by
  // its offer alone, so ordinary item commands for the same goods are withdrawn.
  const isTrade = proposal.map(isTradeProposal), ordinary = proposal.filter((_, k) => !isTrade[k]);
  const ordinaryQuotes = quotes ? quotes.filter((_, k) => !isTrade[k]) : quotes;
  const tradeDecided = authorizeTradeProposals(proposal.flatMap((command, k) => isTrade[k] ? [{ command: reframeOwnItemPurchase(command, i.projected, i.debug_base.player_input), quote: quotes?.[k] }] : []), i.draft, i.context, i.projected, i.world, i.facts);
  const ordinaryDecided = authorizeWithEvidence(ordinary, ordinaryQuotes, evidenceWithDepartures, i.draft, i.context, i.projected, i.mode, i.world, facts);
  let tradeAt = 0, ordinaryAt = 0;
  const decided = vetoSettlementThroughItems(proposal.map((_, k) => isTrade[k] ? tradeDecided[tradeAt++]! : ordinaryDecided[ordinaryAt++]!), i.projected);
  const ownerNames = (id: string): readonly string[] => { const e = i.world.getEntity(id); const c = i.projected.characters.find(x => x.id === id);
    return [id, ...(e?.type === "character" ? [e.name, ...e.aliases] : []), ...(c?.profile.name ? [c.profile.name] : [])]; };
  const diagnostics = rejectConflictingItemMutations(enforceItemTriangle(decided, itemIntent, isIntentKind)).map(d => d.authorized && d.command.kind === "create_item" && typeof d.command.owner_id === "string" && !ownerEvidenced(d.command, i.draft, i.debug_base.player_input, ownerNames(d.command.owner_id))
    ? { ...d, command: (({ owner_id: _o, ...rest }) => rest)(d.command) as CampaignCommand, signals: [...(d.signals ?? []), "ownership_not_evidenced"] } : d);
  // Controller Reliability Pass 1 (debug only, never events): normalized outputs, and deterministic candidates with verified
  // narration evidence that the controller did not propose. Nothing is synthesized; this only measures omissions.
  if (i.sink) {
    const sink = i.sink, base = i.debug_base;
    if (i.controller.normalization) sink({ kind: "controller_normalized", ...base, normalization: i.controller.normalization });
    const spans = sentencesOf(i.draft).flatMap(s => s.length <= 240 ? [s] : s.split(/(?<=[,;:])\s+/));
    i.intent.candidates.forEach((candidate, index) => {
      const proposed = proposal.some(p => isDeepStrictEqual(p, candidate) || p.kind === "transfer_item" && candidate.kind === "transfer_item" && p.item_id === candidate.item_id && transferRecipient(p) === transferRecipient(candidate));
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
    if (c.kind !== "transfer_item" || c.mode !== "gift" || transferRecipient(c) !== "nicco" || c.acquisition) return c;
    const item = i.projected.items.find(it => it.id === c.item_id);
    const from = item && (item.position.kind === "carried" || item.position.kind === "equipped") ? item.position.character_id : undefined;
    return from ? { ...c, acquisition: { acquisition_kind: "gift" as const, from_character_id: from, acquired_at: minute } } : c;
  });
  return { authorized, commands: [...i.intent.runtime, ...authorized] };
}

/**
 * The intent / receipt / proposal triangle for an explicit item action. INTENT says which tracked item the player meant; the receipt (checked by
 * authorization) says what happened; the Controller's proposal must name that same item. A proposal for another item, or any proposal when the
 * player's phrase was ambiguous or matched nothing, is rejected with a precise code and mutates nothing. Without an item intent nothing changes
 * (autonomous NPC pickups keep their evidence path).
 */
function enforceItemTriangle(decided: readonly AuthorizationDiagnostic[], intent: ItemIntent | undefined, isIntentKind: (c: CampaignCommand) => boolean): readonly AuthorizationDiagnostic[] {
  // An attempt authorizes nothing by itself, and a phrase that matches no tracked item here binds nothing: neither is evidence about which item the Controller meant.
  if (!intent || intent.status === "attempt" || intent.status === "absent") return decided;
  return decided.map(d => {
    if (!isIntentKind(d.command) || d.command.kind !== "place_item") return d;
    if (intent.status === "bound" && d.command.item_id === intent.item_id) return d;
    const code = intent.status === "ambiguous" ? "ambiguous_item" : "controller_item_mismatch";
    const reason = intent.status === "ambiguous" ? "rejected_ambiguous_reference" as const : "rejected_controller_mismatch" as const;
    return d.authorized ? { ...d, authorized: false, reason, source: "rejected" as const, code } : { ...d, code };
  });
}
/** The position a placement-like command leaves its item in (a transfer leaves it carried by the recipient). */
const resultingPosition = (c: CampaignCommand) => c.kind === "place_item" ? { position: c.position } : c.kind === "transfer_item" ? { mode: c.mode, position: c.position } : undefined;
/**
 * One item can end an atomic proposal in only ONE position. Among AUTHORIZED placement-like commands on the same item: identical resulting
 * positions are one command (a harmless duplicate: the later one is dropped, never applied twice); different resulting positions are a
 * contradiction, so EVERY command on that item is rejected before commit and the item stays exactly as it was. Unrelated authorized commands
 * are independent (each was validated against the same pre-turn state and CampaignState prepares the batch atomically), so they still commit.
 */
function rejectConflictingItemMutations(decided: readonly AuthorizationDiagnostic[]): readonly AuthorizationDiagnostic[] {
  const byItem = new Map<string, number[]>();
  decided.forEach((d, n) => { const c = d.command; if (d.authorized && (c.kind === "place_item" || c.kind === "transfer_item")) byItem.set(c.item_id, [...(byItem.get(c.item_id) ?? []), n]); });
  const out = [...decided];
  for (const [, indexes] of byItem) {
    if (indexes.length < 2) continue;
    const results = indexes.map(n => resultingPosition(decided[n]!.command));
    if (results.every(r => isDeepStrictEqual(r, results[0]))) {
      for (const n of indexes.slice(1)) out[n] = { ...decided[n]!, authorized: false, reason: "rejected_already_established", source: "rejected", code: "duplicate_command_deduped", signals: ["duplicate_command_deduped"] };
    } else for (const n of indexes) out[n] = { ...decided[n]!, authorized: false, reason: "rejected_conflicting_mutations", source: "rejected", code: "conflicting_item_mutations" };
  }
  return out;
}
