import { turnFixture } from "../src/dev/turn-fixture.js";
import { metadata, collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { characterLocation } from "../src/turn/character-movement.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnEvent, TurnResult } from "../src/turn/turn-types.js";

/** NPC+ Pass 10 shared offline harness: the Pass 9 household fixture plus a scripted narrator/controller that records every request. */
export function household(members: readonly string[] = ["brenna", "maren"], extra: readonly CampaignCommand[] = [], geography: { readonly courtyard?: boolean; readonly secondStairs?: boolean } = {}) {
  const f = turnFixture(false, geography);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...members.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })),
    ...extra,
  ] });
  return f;
}
export interface PlayOptions { members?: readonly string[]; commands?: readonly CampaignCommand[]; evidence?: readonly string[]; extra?: readonly CampaignCommand[]; fixture?: ReturnType<typeof household> }
export async function play(narration: string, input = "I go down to the main hall. Maren, come with me.", o: PlayOptions = {}) {
  const f = o.fixture ?? household(o.members, o.extra), service = new RetrievalService(f.world), requests: GenerationRequest[] = [];
  const narrator = { async generate(r: GenerationRequest) { requests.push(r); return { text: narration, ...metadata }; },
    async *stream(r: GenerationRequest) { requests.push(r); yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; } };
  const coordinator = new TurnCoordinator(f.world, narrator, { async propose() { return { commands: o.commands ?? [], evidence: o.evidence ?? [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events: TurnEvent[] = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: input }));
  const done = events.find(e => e.type === "turn_completed");
  const snapshot = f.campaign.exportSnapshot();
  const where = (id: string) => characterLocation(snapshot, f.world, id);
  const moved = (id: string) => snapshot.premium_characters.find(p => p.character_id === id)?.dynamic.recent_developments.filter(e => e.kind === "moved") ?? [];
  const prompt = requests[0]?.messages.map(m => m.content).join("\n") ?? "";
  return { f, events, result: done && done.type === "turn_completed" ? done.result as TurnResult : undefined, snapshot, where, moved, prompt, requests, system: requests[0]?.system_prompt ?? "" };
}

import { buildTurnContext } from "../src/turn/context-builder.js";
import { movableCharacters, narratedMovements } from "../src/turn/character-movement.js";
import { activeNpcPlus } from "../src/campaign/premium-characters.js";
export interface GrammarSetting { members?: readonly string[]; niccoMoves?: boolean; marenAtHall?: boolean }
/** Pure follow-grammar probe: the exact `narratedMovements` call the authorization stage makes, on the projected arrival context. */
export function grammarProbe(o: GrammarSetting = {}) {
  const f = household(o.members ?? ["maren"]);
  const moves = o.niccoMoves ?? true;
  const cmds: CampaignCommand[] = [];
  if (o.marenAtHall) cmds.push({ kind: "move_character", character_id: "maren", location_id: "test_hall" });
  if (moves) cmds.push({ kind: "runtime_delta", delta: { player_location: "test_hall", time_advance_minutes: 1 } });
  if (cmds.length) f.campaign.apply({ expected_revision: f.campaign.revision, commands: cmds });
  const snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  const arrival = moves ? "test_hall" : "test_room";
  const movable = movableCharacters(snapshot, ["test_room", "test_hall"], f.world), followers = activeNpcPlus(snapshot);
  return (narration: string) => narratedMovements(narration, movable, { origin: "test_room", arrival, locate: id => characterLocation(snapshot, f.world, id) }, context, f.world, followers).map(m => `${m.character_id}->${m.location_id}`);
}
