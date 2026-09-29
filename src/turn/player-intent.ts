import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { TurnError } from "./turn-types.js";
import { resolveTransferIntent, type ResolvedReference } from "./reference-resolution.js";
import { resolveNaturalActions, type NaturalActionResolution } from "./natural-actions.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";

export interface PlayerIntent { readonly candidates: readonly CampaignCommand[]; readonly runtime: readonly CampaignCommand[]; readonly resolved_references?: readonly ResolvedReference[]; readonly ambiguous_reference?: boolean;
  /** Phase 1S natural action resolution (diagnostics and narrator action lines); absent for command-grammar turns. */
  readonly natural?: NaturalActionResolution }
function normalize(text: string): string { return text.trim().replace(/[.!]$/, "").replace(/^the /i, "").toLowerCase(); }
function resolve(text: string, entries: readonly { readonly id: string; readonly name?: string | undefined }[]): string | undefined {
  const found = entries.filter(e => [e.id, e.name].some(n => n && normalize(n) === normalize(text)));
  return found.length === 1 ? found[0]!.id : undefined;
}
/** Small documented player command grammar, not an attempt to parse arbitrary narration. */
export function playerIntent(input: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, participants: readonly EphemeralSceneParticipant[] = [], participantTurn = 0): PlayerIntent {
  const text = input.trim();
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
    candidates: transfer.recipient && transfer.items ? transfer.items.ids.map(item_id => ({ kind: "transfer_item", item_id, owner_id: transfer.recipient!.ids[0]!, position: { kind: "carried", character_id: transfer.recipient!.ids[0]! } })) : [], runtime,
    resolved_references: [transfer.recipient, transfer.items].filter((r): r is ResolvedReference => !!r), ambiguous_reference: transfer.unresolved,
  };
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(?:\/go |I go to |I go downstairs to |I go upstairs to )(.+?)\.?$/i))) {
    const destination = resolve(m[1]!, world.getEntitiesByType("location").filter(e => e.knowledge?.visibility.player && e.knowledge.visibility.narrator));
    const current = world.getEntity(snapshot.runtime.scene.player_location);
    if (!destination || current?.type !== "location" || !current.connections.some(c => c.target === destination)) throw new TurnError("invalid_runtime_intent");
    runtime.push({ kind: "runtime_delta", delta: { player_location: destination } });
  } else if ((m = text.match(/^(?:\/wait (\d+)|I wait (\d+) minutes\.?|\*he spent (\d+) (hours?|minutes?) [^*]+\*)$/i))) {
    const minutes = Number(m[1] ?? m[2] ?? m[3]) * (m[4]?.toLowerCase().startsWith("hour") ? 60 : 1);
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) throw new TurnError("invalid_runtime_intent");
    runtime.push({ kind: "runtime_delta", delta: { time_advance_minutes: minutes } });
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
    return { candidates: [...candidates, ...natural.candidates], runtime: [...runtime, ...natural.runtime], natural };
  }
  return { candidates, runtime };
}
