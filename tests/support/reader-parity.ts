import { isDeepStrictEqual } from "node:util";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignSnapshot } from "../../src/campaign/types.js";
import type { DeepReadonly } from "../../src/types/readonly.js";
import type { WorldStore } from "../../src/world/world-store.js";
import type { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import type { TurnRequest, TurnResult } from "../../src/turn/turn-types.js";
import type { RecentExchange } from "../../src/turn/recent-conversation.js";
import { buildTurnContext, type TurnContext } from "../../src/turn/context/context-builder.js";
import { contextRelevance } from "../../src/turn/stages/intent.js";
import { createFactSource, type NarrationFactSource } from "../../src/turn/narration-facts/index.js";
import { movementFactScope } from "../../src/turn/movement/movement-scope.js";
import { establishNames } from "../../src/turn/identity/name-establishment.js";
import { partnerNameConflict } from "../../src/turn/identity/partner-identity-guard.js";
import { contractCommands } from "../../src/turn/authorization/character-contracts.js";
import { detectHouseholdChoices } from "../../src/turn/authorization/household-evidence.js";
import { attributedSpeech } from "../../src/turn/identity/attributed-speech.js";
import { AUTHORITY_LANES, type AuthorityLane } from "../../src/turn/authorization/authority-lanes.js";

/**
 * Block B5 (AUD-2): reader parity. A tapped coordinator records every completed turn with the state it started from; `turnParity` rebuilds, from that
 * state and the turn's own result, the inputs the turn's readers saw (the projected context and the turn's ONE fact source, the prepared snapshot after
 * the TRD-2 drop), proves the rebuild faithful against what the turn actually did, and then reads each AUD-2 reader twice: its fallback reading (its own
 * people, no shared source) and its reading through the turn's shared NarrationFacts source. Test code only; nothing here runs in a turn.
 */
export interface TappedTurn {
  readonly world: WorldStore; readonly player_input: string; readonly before: DeepReadonly<CampaignSnapshot>; readonly after: DeepReadonly<CampaignSnapshot>;
  readonly finalized: readonly RecentExchange[]; readonly result: TurnResult;
}
/** Wraps `coordinator.runTurn` so every turn that completes is handed to `sink` (events pass through unchanged). */
export function tapCoordinator(coordinator: TurnCoordinator, world: WorldStore, sink: (turn: TappedTurn) => void): void {
  const run = coordinator.runTurn.bind(coordinator);
  (coordinator as { runTurn: TurnCoordinator["runTurn"] }).runTurn = async function* (request: TurnRequest) {
    const before = request.campaign.exportSnapshot(), finalized = [...coordinator.recent(request.campaign).finalized()];
    for await (const event of run(request)) {
      if (event.type === "turn_completed" && event.result.base_revision === before.revision)
        sink({ world, player_input: request.player_input, before, after: request.campaign.exportSnapshot(), finalized, result: event.result });
      yield event;
    }
  };
}

const EARLY: ReadonlySet<AuthorityLane> = new Set(["player_runtime", "preferred_authorization", "trade"]);
const plain = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;
export interface ReaderCheck { readonly reader: "late_naming" | "character_contract" | "household_speech"; readonly text: string; readonly fallback: unknown; readonly shared: unknown; readonly equal: boolean; readonly exercised: boolean }
export interface TurnParity { readonly self_check: readonly string[]; readonly checks: readonly ReaderCheck[] }

/** Parity of the AUD-2 readers for one tapped turn. `self_check` lists every way the rebuilt inputs failed to reproduce the turn (empty: faithful). */
export function turnParity(t: TappedTurn): TurnParity {
  const { world, result: r, player_input: input } = t, self: string[] = [];
  const base = CampaignState.restore(world, plain(t.before)), revision = t.before.revision;
  // B: the committed list is exactly the receipt's: preparing it from the base reproduces the committed state.
  const replay = base.prepare({ expected_revision: revision, commands: r.committed.map(c => c.command) }).snapshot;
  if (!isDeepStrictEqual(plain(replay), plain(t.after))) self.push("committed list does not reproduce the committed state");
  for (const c of r.committed) { const kinds = AUTHORITY_LANES[c.lane].kinds; if (kinds && !kinds.includes(c.command.kind)) self.push(`lane ${c.lane} emitted ${c.command.kind}`); }
  // The projection and the turn's ONE fact source, as the coordinator built them.
  const runtime = r.committed.filter(c => c.lane === "player_runtime").map(c => c.command);
  const projected = runtime.length ? base.prepare({ expected_revision: revision, commands: runtime }).snapshot : t.before;
  const relevance = contextRelevance(input, t.finalized), context = buildTurnContext(world, projected, relevance);
  const origin = t.before.runtime.scene.player_location, arrival = projected.runtime.scene.player_location;
  const facts: NarrationFactSource = createFactSource(movementFactScope(projected, world, context, [origin, arrival], input));
  const draft = r.narration_reconciliation?.draft ?? r.narration, delivered = r.narration;
  const checks: ReaderCheck[] = [];
  // Household and relationship evidence read the attributed speech of the draft (authorization) and of a revision (re-derived evidence).
  const fallbackChoices = detectHouseholdChoices(draft, context);
  if (!isDeepStrictEqual(plain(fallbackChoices), plain(r.turn_evidence.household_choices ?? []))) self.push("household choices differ from the turn's evidence");
  for (const text of new Set([draft, delivered])) {
    const fallback = attributedSpeech(text, context).lines, shared = attributedSpeech(text, context, { units: facts.of(text).dialogue }).lines;
    checks.push({ reader: "household_speech", text, fallback, shared, equal: isDeepStrictEqual(plain(fallback), plain(shared)), exercised: fallback.length > 0 || shared.length > 0 });
  }
  // Commit preparation reads the prepared snapshot after the TRD-2 drop.
  if (r.identity_skipped) return { self_check: self, checks };
  const prepared = base.prepare({ expected_revision: revision, commands: r.committed.filter(c => EARLY.has(c.lane)).map(c => c.command) }).snapshot;
  const after: TurnContext = buildTurnContext(world, prepared, relevance), scene = r.scene_participants!.plan, location_changed = origin !== arrival;
  const exchanges: RecentExchange[] = [...t.finalized, { player: input, narration: delivered, status: "finalized", location_id: prepared.runtime.scene.player_location }];
  const partner_conflict = location_changed ? undefined : partnerNameConflict({ context: after, world, snapshot: prepared, finalized: t.finalized, player_input: input, delivered, scene, facts });
  const options = { location_changed, ...(partner_conflict ? { partner_conflict } : {}) };
  const names = establishNames(exchanges, after, world, prepared, scene.participants, revision, options);
  const { commands: _c, ...identity } = names;
  if (!isDeepStrictEqual(plain(identity), plain(r.identity))) self.push("late naming differs from the turn's identity result");
  const sharedNames = establishNames(exchanges, after, world, prepared, scene.participants, revision, { ...options, facts });
  checks.push({ reader: "late_naming", text: delivered, fallback: names, shared: sharedNames, equal: isDeepStrictEqual(plain(names), plain(sharedNames)),
    exercised: names.commands.length + names.provisional.length + names.skipped.length + sharedNames.commands.length + sharedNames.provisional.length + sharedNames.skipped.length > 0 });
  const contracts = contractCommands(delivered, after, prepared), sharedContracts = contractCommands(delivered, after, prepared, facts.of(delivered).dialogue);
  const committedContracts = r.committed.filter(c => c.lane === "character_contract").map(c => c.command);
  if (committedContracts.length && !isDeepStrictEqual(plain(committedContracts), plain(contracts))) self.push("contracts differ from the committed contracts");
  checks.push({ reader: "character_contract", text: delivered, fallback: contracts, shared: sharedContracts, equal: isDeepStrictEqual(plain(contracts), plain(sharedContracts)), exercised: contracts.length + sharedContracts.length > 0 });
  return { self_check: self, checks };
}
