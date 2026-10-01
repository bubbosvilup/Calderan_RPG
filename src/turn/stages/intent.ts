import type { PreparedCampaignChange } from "../../campaign/campaign-state.js";
import type { CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import { buildTurnContext, type TurnContext } from "../context-builder.js";
import { playerIntent, type PlayerIntent } from "../player-intent.js";
import { resolvePersonTransactions, type TradeResolution } from "../person-transactions.js";
import { movableCharacters, resolvePlayerCarry, type MovableCharacter } from "../character-movement.js";
import { extractRuleDeclarations } from "../household-evidence.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "../scene-participants.js";

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
}
/** The player's resolved intent with authoritative narrator notes and rule declarations. */
export type TurnIntent = PlayerIntent & { readonly notes: readonly string[]; readonly rule_declarations: readonly string[] };
export interface ResolvedIntent {
  readonly base_context: TurnContext;
  readonly base_plan: SceneParticipantPlan;
  readonly intent: TurnIntent;
  /** Promotion Pass 1.1: the narrated captive a prevalidated purchase promotes, if any. */
  readonly promotion: TradeResolution["promotion"];
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
  const natural = [...spoken.runtime, ...carry.runtime];
  // Household Pass 1: player-authored person transactions (purchase, manumission) are resolved deterministically and prevalidated
  // against the real preparation before narration; a rejected transaction is dropped and the narrator is told nothing changed.
  // Promotion Pass 1.1: a narrator-invented captive of this scene may be the subject; promotion, initial legal state and sale form
  // one proposal, prevalidated here as a whole, so the narrator is never told of a purchase that promotion would make fail.
  const trade = resolvePersonTransactions(i.player_input, base_context, i.snapshot, i.finalized, i.base_revision, { world: i.world, participants: base_plan.participants });
  const tradeValid = !trade.commands.length || prevalidates(i, [...natural, ...trade.commands]);
  const tradeCommands = tradeValid ? trade.commands : [];
  const tradeNotes = tradeValid ? trade.notes : ["The attempted transaction is not valid under current ownership or funds: nothing is paid and no legal status changes this turn."];
  const intent: TurnIntent = { ...spoken, runtime: [...natural, ...tradeCommands], notes: [...carry.notes, ...tradeNotes], rule_declarations: extractRuleDeclarations(i.player_input) };
  return { base_context, base_plan, intent, promotion: tradeValid ? trade.promotion : undefined };
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
  /** Scene participants for this turn, with a just-promoted participant retired so nobody appears twice. */
  readonly scene: SceneParticipantPlan;
}

/**
 * Part 2 (failure mapping: `invalid_runtime_intent` when there are runtime effects — the coordinator sets it before calling —
 * otherwise `context_invalid`). Validate player-controlled runtime effects before spending tokens. The receipt is never committed:
 * its detached snapshot is the projected state (Phase 1S). Durable state changes only at finalization, when runtime and authorized
 * commands are prepared together from the base revision.
 */
export function projectTurnIntent(i: IntentStageInput, resolved: ResolvedIntent): ProjectedTurn {
  const { intent, base_context, base_plan, promotion } = resolved;
  const projected = intent.runtime.length ? i.prepare({ expected_revision: i.base_revision, commands: intent.runtime }).snapshot : i.snapshot;
  const context = projected === i.snapshot ? base_context : buildTurnContext(i.world, projected, contextRelevance(i.player_input, i.finalized));
  const origin = i.snapshot.runtime.scene.player_location, arrival = projected.runtime.scene.player_location;
  const movable = movableCharacters(projected, [origin, arrival]);
  const leftBehind = arrival === origin ? [] : movable.filter(m => projected.characters.find(c => c.id === m.id)?.current.current_location === origin);
  const prompt_intent: TurnIntent = leftBehind.length ? { ...intent, notes: [...intent.notes, `Nicco leaves ${i.world.getEntity(origin)?.display_name ?? origin}. ${leftBehind.map(m => m.names[0]).join(", ")} stay${leftBehind.length === 1 ? "s" : ""} there: do not have Nicco bring or carry them. Someone comes along only if they themselves clearly follow him, narrated explicitly.`] } : intent;
  const planned = context.primary.scene.player_location?.id === base_context.primary.scene.player_location?.id ? base_plan : i.plan(i.player_input, context);
  // A promoted person is now persistent: the temporary participant they were is retired, so nobody appears twice.
  const scene = promotion?.participant_id ? Object.freeze({ ...planned, participants: planned.participants.filter(p => p.id !== promotion.participant_id), focus: planned.focus === promotion.participant_id ? null : planned.focus }) : planned;
  return { projected, context, origin, arrival, movable, prompt_intent, scene };
}
