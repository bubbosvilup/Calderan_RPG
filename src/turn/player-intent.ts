import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { TurnError } from "./turn-types.js";
import { resolveTransferIntent, type ResolvedReference } from "./reference-resolution.js";
import { resolveNaturalActions, reachable, resolveDestination, resolveMovement, DESTINATION_END, type NaturalActionResolution } from "./natural-actions.js";
import { GATES } from "./language/gates.js";
import { blankQuotes, sentencesOf } from "./language/text.js";
import type { EphemeralSceneParticipant } from "./scene-participants.js";

export interface PlayerIntent { readonly candidates: readonly CampaignCommand[]; readonly runtime: readonly CampaignCommand[]; readonly resolved_references?: readonly ResolvedReference[]; readonly ambiguous_reference?: boolean;
  /** Phase 1S natural action resolution (diagnostics and narrator action lines); absent for command-grammar turns. */
  readonly natural?: NaturalActionResolution;
  /** Household Pass 1: authoritative narrator notes for resolved or blocked person transactions. */
  readonly notes?: readonly string[];
  /** Household Pass 1: the player's explicit household-rule declarations this turn. */
  readonly rule_declarations?: readonly string[] }
function normalize(text: string): string { return text.trim().replace(/[.!]$/, "").replace(/^the /i, "").toLowerCase(); }
function resolve(text: string, entries: readonly { readonly id: string; readonly name?: string | undefined }[]): string | undefined {
  const found = entries.filter(e => [e.id, e.name].some(n => n && normalize(n) === normalize(text)));
  return found.length === 1 ? found[0]!.id : undefined;
}
/**
 * H5.1: unmarked first-person player movement ("I go down to the main hall", "I leave the room and go downstairs to the main hall",
 * "Let's go down to the main hall together"). A bounded clause grammar around an explicit destination phrase, tried only after the
 * strict command forms. The movement clause may start with "I" / "let's", or continue an earlier first-person clause of the same
 * sentence ("I leave the room and go…"); another subject ends first-person continuity. Quoted speech and *action* segments are
 * excluded (natural-actions.ts owns those). Negation, modality, intention, plans, hypotheticals, questions and other-day framing
 * anywhere before the movement in its sentence veto it (GATES.player_movement_not_done). Destinations must be explicit and resolve
 * through the shared destination and route rules: "I go downstairs", "I leave" or "I wander off" move nobody, an unknown place moves
 * nobody (free prose is not a command, so no error), and an unreachable one is blocked, never teleported. "Let's" commits only
 * Nicco: whoever he addresses moves only if narration establishes their own following (character-movement.ts).
 */
const FP_VERB = "(?:go|head|walk|run|hurry|climb|step|return|move|wander|stroll|make my way|make our way)";
const FP_PARTICLE = "(?:back\\s+)?(?:(?:down|up|over|out|across)(?:\\s+the\\s+(?:stairs|steps|staircase))?\\s+|downstairs\\s+|upstairs\\s+)?";
const FP_SUBJECT = /^(?:i|let['’]?s|let us)\b/i;
const FP_MOVE = new RegExp(`^(?:(?:i|let['’]?s|let us)\\s+)?(?:then\\s+|also\\s+|quietly\\s+|slowly\\s+|just\\s+|finally\\s+)?${FP_VERB}\\s+${FP_PARTICLE}(?:to|into)\\s+(.+)$`, "i");
const FP_TAIL = /\s+(?:alone|together|now|again|quickly|at once|right away|by myself|with\s.*)$/i;
function firstPersonMovement(text: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore) {
  const prose = blankQuotes(text.replace(/\*[^*]*\*/g, " ")).replace(/[“”"]/g, " ");
  for (const sentence of sentencesOf(prose)) {
    let firstPerson = false, offset = 0;
    // Captured split: even entries are clauses, odd entries the separators between them (kept to track offsets).
    for (const [index, raw] of sentence.split(/(,\s*(?:and\s+then\s+|and\s+|then\s+)?|;\s*|\s+(?:and then|then|and)\s+)/i).entries()) {
      const at = offset; offset += raw.length;
      const clause = raw.trim();
      if (index % 2 === 1 || !clause) continue;
      if (FP_SUBJECT.test(clause)) firstPerson = true;
      else if (!/^[a-z]/.test(clause)) firstPerson = false; // a capitalized lead is another subject, a name or an imperative
      const m = clause.match(FP_MOVE);
      if (!m || !firstPerson || GATES.player_movement_not_done.test(sentence.slice(0, at + raw.length))) continue;
      let phrase = m[1]!.replace(/[.!?…]+$/, "").split(DESTINATION_END)[0]!.trim();
      while (FP_TAIL.test(phrase)) phrase = phrase.replace(FP_TAIL, "").trim();
      return resolveMovement(clause, phrase, snapshot.runtime.scene.player_location, context, world);
    }
  }
  return undefined;
}
/** Explicit durations only: no inferred duration, fractions, daypart or event targets. */
function explicitWaitMinutes(text: string): number | undefined {
  const command = text.match(/^\/wait (\d+)$/i);
  if (command) return Number(command[1]);
  const duration = text.match(/^(?:I )?wait (\d+) (minutes?|hours?)\.?$/i)
    ?? text.match(/^\*waits (\d+) (minutes?|hours?)\*$/i)
    ?? text.match(/^\*he spent (\d+) (hours?|minutes?) [^*]+\*$/i);
  if (duration) return Number(duration[1]) * (duration[2]!.toLowerCase().startsWith("hour") ? 60 : 1);
  if (/^(?:I )?wait (?:an|one) hour\.?$/i.test(text)) return 60;
  return undefined;
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
  const waitMinutes = explicitWaitMinutes(text);
  if ((m = text.match(/^(?:\/go |go to |walk back to |head to |I go to |I go downstairs to |I go upstairs to )(.+?)\.?$/i))) {
    const destination = resolveDestination(m[1]!, context, world);
    const route = destination && reachable(destination, snapshot.runtime.scene.player_location, world);
    if (!route || !route.target) throw new TurnError("invalid_runtime_intent");
    runtime.push({ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } });
  } else if (waitMinutes !== undefined) {
    const minutes = waitMinutes;
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
    // H5.1: unmarked first-person movement, only when no *action* already moved Nicco.
    const spoken = natural.runtime.some(c => c.kind === "runtime_delta" && !!c.delta.player_location) ? undefined : firstPersonMovement(text, context, snapshot, world);
    const merged = spoken?.actions.length ? Object.freeze({ ...natural, actions: Object.freeze([...natural.actions, ...spoken.actions]), runtime: Object.freeze([...natural.runtime, ...spoken.runtime]), notes: Object.freeze([...natural.notes, ...spoken.notes]) }) : natural;
    return { candidates: [...candidates, ...merged.candidates], runtime: [...runtime, ...merged.runtime], natural: merged };
  }
  return { candidates, runtime };
}
