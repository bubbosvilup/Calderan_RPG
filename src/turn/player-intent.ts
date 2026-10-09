import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { TurnError } from "./turn-types.js";
import { resolveTransferIntent, type ResolvedReference } from "./reference-resolution.js";
import { resolveNaturalActions, reachable, type NaturalActionResolution } from "./natural-actions.js";
import { playerDestination } from "./player-travel.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";
import { MAX_TEMPORAL_ADVANCE_MINUTES, parseTemporalAction, type TemporalAction } from "./temporal-action.js";

export interface PlayerIntent { readonly candidates: readonly CampaignCommand[]; readonly runtime: readonly CampaignCommand[]; readonly resolved_references?: readonly ResolvedReference[]; readonly ambiguous_reference?: boolean;
  /** Phase 1S natural action resolution (diagnostics and narrator action lines); absent for command-grammar turns. */
  readonly natural?: NaturalActionResolution;
  /** Household Pass 1: authoritative narrator notes for resolved or blocked person transactions. */
  readonly notes?: readonly string[];
  /** Household Pass 1: the player's explicit household-rule declarations this turn. */
  readonly rule_declarations?: readonly string[];
  /** Temporal Action Resolver V1: the resolved wait/sleep/nap/rest request behind this turn's time advance, if any. */
  readonly temporal?: Extract<TemporalAction, { kind: "advance" }> }
function normalize(text: string): string { return text.trim().replace(/[.!]$/, "").replace(/^the /i, "").toLowerCase(); }
function resolve(text: string, entries: readonly { readonly id: string; readonly name?: string | undefined }[]): string | undefined {
  const found = entries.filter(e => [e.id, e.name].some(n => n && normalize(n) === normalize(text)));
  return found.length === 1 ? found[0]!.id : undefined;
}
/** The `/wait N` command and the P11 starred "spent N hours <activity>" form; natural wait/sleep/nap/rest is temporal-action.ts. */
function explicitWaitMinutes(text: string): number | undefined {
  const command = text.match(/^\/wait (\d+)$/i);
  if (command) return Number(command[1]);
  const duration = text.match(/^\*he spent (\d+) (hours?|minutes?) [^*]+\*$/i);
  if (duration) return Number(duration[1]) * (duration[2]!.toLowerCase().startsWith("hour") ? 60 : 1);
  return undefined;
}
/** Small documented player command grammar, not an attempt to parse arbitrary narration. */
export function playerIntent(input: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, participants: readonly EphemeralSceneParticipant[] = [], participantTurn = 0): PlayerIntent {
  const text = input.trim();
  if (/^\/location(?:\s|$)/i.test(text)) throw new TurnError("invalid_input");
  if (text.includes("\n") && text.split("\n").every(line => line.trim().startsWith("/"))) {
    const lines = text.split("\n"); if (lines.length > 4) throw new TurnError("invalid_input");
    const intents = lines.map(line => playerIntent(line, context, snapshot, world));
    // Multiple runtime moves would require route-by-route projection; defer that syntax.
    if (intents.filter(i => i.runtime.length).length > 1) throw new TurnError("invalid_runtime_intent");
    return { candidates: intents.flatMap(i => i.candidates), runtime: intents.flatMap(i => i.runtime), resolved_references: intents.flatMap(i => i.resolved_references ?? []), ambiguous_reference: intents.some(i => i.ambiguous_reference) };
  }
  const candidates: CampaignCommand[] = [], runtime: CampaignCommand[] = [];
  const people = context.characters.map(c => ({ id: c.id, name: c.profile.name }));
  const transfer = resolveTransferIntent(input, context);
  if (transfer) return {
    candidates: transfer.recipient && transfer.items ? transfer.items.ids.map(item_id => ({ kind: "transfer_item", mode: transfer.mode === "gift" && snapshot.items.find(i => i.id === item_id)?.owner_id === "nicco" ? "gift" : "handoff", item_id,  position: { kind: "carried", character_id: transfer.recipient!.ids[0]! } })) : [], runtime,
    resolved_references: [transfer.recipient, transfer.items].filter((r): r is ResolvedReference => !!r), ambiguous_reference: transfer.unresolved,
  };
  let m: RegExpMatchArray | null;
  const now = snapshot.runtime.scene.world_time.world_minute;
  const temporal = text.startsWith("/") || explicitWaitMinutes(text) !== undefined ? undefined
    : parseTemporalAction(text, now, context.characters.filter(c => c.id !== "nicco").flatMap(c => c.profile.name ? [c.profile.name] : []));
  if (temporal?.kind === "invalid") throw new TurnError("invalid_runtime_intent");
  const waitMinutes = explicitWaitMinutes(text) ?? temporal?.minutes;
  if ((m = text.match(/^(?:\/go )(.+?)\.?$/i))) {
    const destination = (/^(?:the )?center$/i.test(m[1]!.trim()) && (snapshot.runtime.scene.player_location === "calderan" || world.getAncestors(snapshot.runtime.scene.player_location).some(a => a.id === "calderan")) ? "calderan_center" : playerDestination(m[1]!, world));
    const route = destination && reachable(destination, snapshot.runtime.scene.player_location, world);
    if (!route || !route.target) throw new TurnError("invalid_runtime_intent");
    runtime.push({ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } });
  } else if (waitMinutes !== undefined) {
    const minutes = waitMinutes;
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_TEMPORAL_ADVANCE_MINUTES) throw new TurnError("invalid_runtime_intent");
    runtime.push({ kind: "runtime_delta", delta: { time_advance_minutes: minutes } });
    if (temporal) {
      // A compound action ("drinks the tea and sleeps for 5 hours") keeps its ordinary effects at no extra time; travel in the same
      // input would charge route minutes on top of the request, so that combination is rejected rather than double-charged.
      const natural = resolveNaturalActions(text, context, snapshot, world, participants, participantTurn);
      if (natural.runtime.length) throw new TurnError("invalid_runtime_intent");
      return { candidates: [...candidates, ...natural.candidates], runtime, natural, temporal };
    }
  } else if ((m = text.match(/^\/mana (-?\d+)$/))) {
    const delta = Number(m[1]);
    // Explicit developer action; no spell-effect or recovery inference from prose.
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > snapshot.runtime.mana.max) throw new TurnError("invalid_runtime_intent");
    runtime.push({ kind: "runtime_delta", delta: { mana_delta: delta } });
  } else if ((m = text.match(/^\/equip (\S+)(?: for (\S+))? (\S+) (worn|held)$/))) {
    const item = resolve(m[1]!, context.items);
    const target = m[2] ? resolve(m[2], people) : "nicco";
    if (item && target) candidates.push({ kind: "place_item", item_id: item, position: { kind: "equipped", character_id: target, slot: m[3]!, mode: m[4] as "worn" | "held" } });
  } else if ((m = text.match(/^(?:\/tell |I tell )(.+?) to (.+?)\.?$/i))) {
    const fact = resolve(m[1]!, context.facts), recipient = resolve(m[2]!, people);
    if (fact && recipient) candidates.push({ kind: "set_knowledge", knowledge: { character_id: recipient, fact_id: fact, status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } });
  } else if ((m = text.match(/^\/schedule (\S+) "([^"\n]{1,160})" at (\d+) with ([a-z0-9_,]+)$/))) {
    const minute = Number(m[3]);
    if (Number.isSafeInteger(minute) && minute > snapshot.runtime.scene.world_time.world_minute) candidates.push({ kind: "schedule_event", id: m[1]!, title: m[2]!, scheduled_world_minute: minute, participants: m[4]!.split(",") });
  } else if (/^\/(go|wait|mana|give|equip|tell|schedule)\b/.test(text)) throw new TurnError("invalid_input");
  else {
    // Phase 1S: natural *action* text resolves into the same runtime/candidate intents; speech never does.
    const natural = resolveNaturalActions(text, context, snapshot, world, participants, participantTurn);
    if (/^(?:go to |walk back to |head to |I go to |I go downstairs to |I go upstairs to )/i.test(text)
      && natural.actions.some(a => a.kind === "movement" && (a.status === "blocked" || a.status === "unresolved"))) throw new TurnError("invalid_runtime_intent");
    return { candidates: [...candidates, ...natural.candidates], runtime: [...runtime, ...natural.runtime], natural };
  }
  return { candidates, runtime };
}
