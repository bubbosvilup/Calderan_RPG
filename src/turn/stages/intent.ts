import type { PreparedCampaignChange } from "../../campaign/campaign-state.js";
import type { CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import { buildTurnContext, type TurnContext } from "../context/context-builder.js";
import { playerIntent, type PlayerIntent } from "../player-intent.js";
import { resolveManumission } from "../commerce/person-transactions.js";
import { manumissionCommand, manumissionInvalidReason, type PendingProposal } from "../authorization/pending-proposals.js";
import { pendingEquivalenceKey } from "../../types/pending-confirmation.js";
import { characterLocation, movableCharacters, resolvePlayerCarry, type MovableCharacter } from "../movement/character-movement.js";
import { extractRuleDeclarations } from "../authorization/household-evidence.js";
import { invitedFollowers, leftBehindNotes } from "../movement/follow-invitation.js";
import { followCandidates, resolveHeldEscort } from "../movement/follow-candidates.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "../identity/scene-participants.js";
import { tradeStateNotes } from "../commerce/trade-notes.js";

/**
 * Hardening H2 — IntentResolutionStage. Everything the PLAYER authors this turn, resolved deterministically before any provider call.
 *
 * Sync. Never mutates CampaignState: `prepare` is used only for prevalidation and projection, and no receipt it returns is ever
 * committed here. A valid move, carry or transaction becomes visible to narration through the projected snapshot, but is not
 * authoritative until the coordinator's single final commit.
 */

/** Read-only capabilities the stage needs; no CampaignState or SceneParticipants reference is retained. */
export interface IntentStageInput {
  readonly world: WorldStore;
  readonly snapshot: DeepReadonly<CampaignSnapshot>;
  readonly base_revision: number;
  readonly player_input: string;
  /** CampaignState.prepare bound to the turn's campaign: validation only, never commit. */
  readonly prepare: (proposal: unknown) => PreparedCampaignChange;
  /** SceneParticipants.plan (pure: "nothing changes until commit()"). */
  readonly plan: (input: string, context: TurnContext) => SceneParticipantPlan;
  /** Finalized recent exchanges (the seller's latest offer, earlier namings). */
  readonly finalized: readonly RecentExchange[];
  /** Block 5A: the session's ACTIVE, still-valid pending confirmations (server-owned). */
  readonly pending_confirmations?: readonly PendingProposal[];
}
/** The player's resolved intent with authoritative narrator notes and rule declarations. */
export type TurnIntent = PlayerIntent & { readonly notes: readonly string[]; readonly rule_declarations: readonly string[] };
export interface ResolvedIntent {
  readonly base_context: TurnContext;
  readonly base_plan: SceneParticipantPlan;
  readonly intent: TurnIntent;
}

/**
 * Part 1 (failure mapping: `context_invalid`, or a TurnError such as `context_too_large` / `invalid_runtime_intent` raised by the
 * context builder or the command grammar). Base context, scene-participant plan, player intent, carry and person transactions.
 * Carry and transactions are prevalidated against the real preparation; an invalid candidate is dropped with an outcome note.
 */
/** H3: relevance signals for deterministic context selection (the player's words and recent finalized conversation). */
export const contextRelevance = (player_input: string, finalized: readonly RecentExchange[]) => ({ input: player_input, recent_text: finalized.map(e => `${e.player} ${e.narration}`).join(" ") });
export function resolveTurnIntent(i: IntentStageInput): ResolvedIntent {
  const base_context = buildTurnContext(i.world, i.snapshot, contextRelevance(i.player_input, i.finalized));
  // Deterministic, pre-narration; applied only when the turn finalizes. The controller never decides who exists.
  const base_plan = i.plan(i.player_input, base_context);
  const spoken = playerIntent(i.player_input, base_context, i.snapshot, i.world, base_plan.participants, base_plan.turn);
  // Location Continuity Pass 1.3: a campaign character Nicco physically carries along on his own movement moves with him (the
  // player's own physical act, prevalidated like his movement). Nobody else moves with him.
  const carried = resolvePlayerCarry(i.player_input, i.snapshot, base_context, i.world, spoken.runtime);
  const carry = carried.runtime.length && !prevalidates(i, [...spoken.runtime, ...carried.runtime]) ? { runtime: [], notes: [] } : carried;
  // Consolidation block 3: a person Nicco legally holds, named and led along by the player's own words, moves with him in the same atomic batch.
  const escorted = resolveHeldEscort(i.player_input, i.snapshot, base_context, i.world, spoken.runtime, carry.runtime.flatMap(c => c.kind === "move_character" ? [c.character_id] : []));
  const escort = escorted.runtime.length && !prevalidates(i, [...spoken.runtime, ...carry.runtime, ...escorted.runtime]) ? { runtime: [], notes: [] } : escorted;
  const natural = [...spoken.runtime, ...carry.runtime, ...escort.runtime];
  // Household Pass 1 / AUTH-1: the player-authored act of freeing a person is only RECOGNIZED here, as a proposal. It is validated at creation against the
  // real domain prerequisites (and a dry preparation of the deterministic command) so an impossible act produces no card, but it is never a runtime
  // command: the player confirms it in the interface. Actual Offer V1: purchases are NOT resolved here either (explicit offer, explicit Accept).
  const trade = resolveManumission(i.player_input, base_context, i.snapshot, i.base_revision);
  const creatable = trade.proposals.filter(p => proposalCreatable(i, p));
  const blocked = trade.proposals.length > creatable.length;
  const tradeNotes = blocked ? ["The attempted legal act is not valid under current ownership: no legal status changes this turn."] : trade.notes;
  const intent: TurnIntent = { ...spoken, runtime: natural, notes: [...carry.notes, ...escort.notes, ...tradeNotes, ...tradeStateNotes(i.snapshot, i.world)], rule_declarations: extractRuleDeclarations(i.player_input),
    confirmations: { recognized: creatable, pending: pendingFor(i.pending_confirmations ?? [], creatable) },
    ...(trade.diagnostics.length ? { transactions: trade.diagnostics.map(d => ({ kind: d.kind, status: blocked ? "blocked" as const : d.status, ...(blocked ? { reason: "prevalidation_rejected" } : typeof d.detail.reason === "string" ? { reason: d.detail.reason } : {}) })) } : {}) };
  return { base_context, base_plan, intent };
}
/** Create-time validation of a proposal: the shared domain prerequisites AND a dry preparation of the deterministic command (never committed). */
function proposalCreatable(i: IntentStageInput, p: PendingProposal): boolean {
  if (p.kind !== "manumission") return false;
  return manumissionInvalidReason(i.snapshot, p.subject_id, p.actor_id, p.payload) === undefined && prevalidates(i, [manumissionCommand("campaign_transaction_probe", p.subject_id, p.payload)]);
}
/** Existing active confirmations plus this turn's recognized ones: the same interpretation once; a changed payload for the same subject replaces the old one. */
function pendingFor(existing: readonly PendingProposal[], recognized: readonly PendingProposal[]): readonly PendingProposal[] {
  const kept = existing.filter(e => !recognized.some(r => r.kind === e.kind && r.subject_id === e.subject_id));
  const seen = new Set<string>();
  return [...kept, ...recognized].filter(p => { const key = pendingEquivalenceKey(p.kind, p.subject_id, p.payload); if (seen.has(key)) return false; seen.add(key); return true; });
}
function prevalidates(i: IntentStageInput, commands: readonly unknown[]): boolean {
  try { i.prepare({ expected_revision: i.base_revision, commands }); return true; } catch { return false; }
}

export interface ProjectedTurn {
  /** The detached projected snapshot narration, the controller and authorization see (the base snapshot when nothing is projected). */
  readonly projected: DeepReadonly<CampaignSnapshot>;
  readonly context: TurnContext;
  readonly origin: string;
  readonly arrival: string;
  /** Campaign characters in the scene Nicco is in or is leaving: the only ones narration can move this turn. */
  readonly movable: readonly MovableCharacter[];
  /** The intent as the narrator sees it (plus a left-behind note when Nicco leaves people behind). */
  readonly prompt_intent: TurnIntent;
  /** Scene participants for this turn, with a just-materialized participant retired so nobody appears twice. */
  readonly scene: SceneParticipantPlan;
}

/** D-15: names/aliases of every known character (canon and campaign) other than Nicco and the eligible NPC+, limited to those the input mentions. */
function knownNamesIn(input: string, world: WorldStore, snapshot: IntentStageInput["snapshot"], except: readonly string[]): readonly string[] {
  const text = input.toLowerCase(), names = new Set<string>();
  const add = (id: string, ...labels: (string | undefined)[]) => { if (id !== "nicco" && !except.includes(id)) for (const l of labels) if (l && l.length > 1 && text.includes(l.toLowerCase())) names.add(l); };
  for (const e of world.getEntitiesByType("character")) add(e.id, e.name, e.display_name, ...e.aliases);
  for (const c of snapshot.characters) add(c.id, c.profile.name, ...(c.profile.aliases ?? []));
  return [...names];
}

/**
 * Part 2 (failure mapping: `invalid_runtime_intent` when there are runtime effects — the coordinator sets it before calling —
 * otherwise `context_invalid`). Validate player-controlled runtime effects before spending tokens. The receipt is never committed:
 * its detached snapshot is the projected state (Phase 1S). Durable state changes only at finalization, when runtime and authorized
 * commands are prepared together from the base revision.
 */
export function projectTurnIntent(i: IntentStageInput, resolved: ResolvedIntent): ProjectedTurn {
  const { intent, base_context, base_plan } = resolved;
  const projected = intent.runtime.length ? i.prepare({ expected_revision: i.base_revision, commands: intent.runtime }).snapshot : i.snapshot;
  const context = projected === i.snapshot ? base_context : buildTurnContext(i.world, projected, contextRelevance(i.player_input, i.finalized));
  const origin = i.snapshot.runtime.scene.player_location, arrival = projected.runtime.scene.player_location;
  const movable = movableCharacters(projected, [origin, arrival], i.world);
  const leftBehind = arrival === origin ? [] : movable.filter(m => characterLocation(projected, i.world, m.id) === origin);
  // NPC+ Pass 9: an explicitly invited active NPC+ gets a neutral follow choice; everyone else keeps the conservative stay note.
  const candidates = followCandidates(projected, leftBehind, i.player_input), eligible = leftBehind.filter(m => candidates.has(m.id));
  const invited = invitedFollowers(i.player_input, eligible, base_context.characters.filter(c => c.id !== "nicco" && !eligible.some(m => m.id === c.id)).map(c => c.profile.name ?? c.id),
    knownNamesIn(i.player_input, i.world, projected, eligible.map(m => m.id)));
  const prompt_intent: TurnIntent = leftBehind.length ? { ...intent, notes: [...intent.notes, ...leftBehindNotes(leftBehind, invited, i.world.getEntity(origin)?.display_name ?? origin, i.world.getEntity(arrival)?.display_name ?? arrival)] } : intent;
  const planned = context.primary.scene.player_location?.id === base_context.primary.scene.player_location?.id ? base_plan : i.plan(i.player_input, context);
  const scene = planned;
  return { projected, context, origin, arrival, movable, prompt_intent, scene };
}
