import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { entityMentions } from "./retrieval-policy.js";
import { stem } from "../retrieval/lexical-index.js";
import { tokenize } from "../retrieval/tokenizer.js";
import { participantForNoun, type EphemeralSceneParticipant } from "./scene-participants.js";

/**
 * Natural player action resolution (Phase 1S). Deterministic, bounded, player-authored only.
 *
 * - Only text inside *asterisks* is an action; everything else is Nicco's speech, and speech never changes state
 *   ("I'm barefoot", "I'm at the market", "I gave her the boots yesterday").
 * - An action segment is split into ordered clauses. A clause is Nicco's own action only when it has no other subject.
 *   Hedged clauses (almost, pretends, reaches for, wants to, modal/negated/future) resolve nothing.
 * - Player-controlled effects become runtime commands: prepared before narration on a detached projection, committed only
 *   when the turn finalizes (the existing runtime-intent path). They are movement through an established connection, and
 *   removing an item Nicco is actually wearing.
 * - Outcome-dependent effects (another person accepting an item) stay controller candidates that need narration evidence
 *   and authorization. Offers to temporary scene participants cannot become durable (no durable recipient exists).
 * - Movement to a known destination without an established connection is reported as blocked: no teleport, and the
 *   narrator is told Nicco has not arrived.
 */
export type NaturalActionKind = "movement" | "equipment_removal" | "offer" | "intention";
export type NaturalActionStatus = "resolved" | "blocked" | "unresolved" | "outcome_dependent" | "unsupported_durable_recipient" | "no_state_effect";
export interface NaturalAction { readonly clause: string; readonly kind: NaturalActionKind; readonly status: NaturalActionStatus; readonly detail: Readonly<Record<string, unknown>> }
export interface NaturalActionResolution {
  readonly actions: readonly NaturalAction[];
  /** Player-controlled, ordered; prepared before narration, committed only at turn finalization. */
  readonly runtime: readonly CampaignCommand[];
  /** Outcome-dependent; authorized only from narration evidence. */
  readonly candidates: readonly CampaignCommand[];
  /** Narrator-facing action lines ([PLAYER ACTION]); never diagnostics wording. */
  readonly notes: readonly string[];
}

const HEDGE = /\b(?:almost|nearly|pretends?|pretending|considers?|considering|thinks? about|wants? to|wanting to|would like to|plans? to|about to|tries to|trying to|starts? to|begins? to|reaches? for|reaching for|imagines?|dreams? of|doesn'?t|does not|didn'?t|never|won'?t|will|would|could|might|should|if|someday|maybe|yesterday|earlier)\b/i;
const SUBJECT = "(?:(?:he|nicco|i)\\s+)?(?:then\\s+|also\\s+|slowly\\s+|quietly\\s+)?";
const MOVE = new RegExp(`^${SUBJECT}(?:walks?|walked|walking|strolls?|strolled|strolling|goes|go|went|going|heads?|headed|heading|returns?|returned|returning|wanders?|wandered|wandering|hurries|hurried|hurrying|runs?|ran|running|makes? his way|made his way|steps?|stepped|moves?|moved|travels?|travell?ed|crosses|crossed)\\s+(?:back\\s+)?(?:over\\s+|down\\s+|up\\s+|out\\s+|across\\s+)?(?:to|towards?|into|inside|in to|through)\\s+(.+)$`, "i");
const DESTINATION_END = /\s+(?:looking|searching|hoping|in search|to (?:buy|see|find|look|purchase)|for\b|with\b|nearby|near\b|while\b|as\b|where\b)/i;
const REMOVE = [
  new RegExp(`^${SUBJECT}(?:takes?|took|taking|pulls?|pulled|pulling|slips?|slipped|slipping|kicks?|kicked|kicking|tugs?|tugged)\\s+off\\s+(.+)$`, "i"),
  new RegExp(`^${SUBJECT}(?:takes?|took|taking|pulls?|pulled|pulling|slips?|slipped|kicks?|kicked)\\s+(.+?)\\s+off$`, "i"),
  new RegExp(`^${SUBJECT}(?:removes?|removed|removing|doffs?|doffed)\\s+(.+)$`, "i"),
];
const TAKE_OUT = new RegExp(`^${SUBJECT}(?:takes?|took|taking)\\s+out\\s+(.+)$`, "i");
const OFFER = new RegExp(`^${SUBJECT}(?:gives?|gave|giving|gifts?|gifted|gifting|offers?|offered|offering|hands?|handed|handing|holds?\\s+out|held\\s+out|presents?|presented)\\s+(.+?)\\s+to\\s+(.+)$`, "i");
const INTENTION = /\b(?:looking|searching|hoping)\s+(?:for|to)\b[^,]*|\bto\s+(?:buy|purchase|sell)\b[^,]*/i;

const words = (s: string) => tokenize(s).map(stem).filter(w => !["the", "his", "my", "a", "an", "of", "pair", "her", "their"].includes(w));
export function actionSegments(input: string): readonly string[] { return [...input.matchAll(/\*([^*]+)\*/g)].map(m => m[1]!.trim()).filter(Boolean); }
function clauses(segment: string): readonly string[] {
  return segment.split(/,\s*(?:and\s+then\s+|and\s+|then\s+)?|;\s*|\s+(?:and then|then|and|when|before|after)\s+/i).map(c => c.trim()).filter(Boolean);
}
/** Destination phrase → location: explicit/near canon names, then a unique head noun among locations, features and aliases in the scene's city. */
export function resolveDestination(phrase: string, context: TurnContext, world: WorldStore): string | undefined {
  const locations = world.getEntitiesByType("location").filter(e => e.knowledge?.visibility.narrator && e.knowledge.visibility.player);
  const mentions = [...entityMentions(phrase, context, world)].filter(([id]) => locations.some(l => l.id === id)).sort((a, b) => b[1] - a[1]);
  if (mentions.length && (mentions.length === 1 || mentions[0]![1] > mentions[1]![1])) return mentions[0]![0];
  const head = words(phrase).at(-1);
  if (!head) return undefined;
  const city = context.primary.scene.location_ancestry[0]?.id;
  const heads = (l: (typeof locations)[number]) => [l.name, ...l.aliases, ...l.features.map(f => f.name)].map(n => words(n).at(-1));
  const found = locations.filter(l => heads(l).includes(head) && (!city || l.id === city || world.getAncestors(l.id).some(a => a.id === city)));
  return found.length === 1 ? found[0]!.id : undefined;
}
/** A destination container (a tower) is entered through its descendant directly connected to the current location. */
function reachable(destination: string, here: string, world: WorldStore): { readonly target?: string; readonly via_container?: boolean } {
  const current = world.getEntity(here);
  const connections = current?.type === "location" ? current.connections.map(c => c.target) : [];
  if (connections.includes(destination)) return { target: destination };
  const inside = connections.filter(t => world.getAncestors(t).some(a => a.id === destination));
  return inside.length === 1 ? { target: inside[0]!, via_container: true } : {};
}
const display = (id: string, world: WorldStore) => world.getEntity(id)?.display_name ?? id;

export function resolveNaturalActions(input: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore,
  participants: readonly EphemeralSceneParticipant[] = [], participantTurn = 0): NaturalActionResolution {
  const actions: NaturalAction[] = [], runtime: CampaignCommand[] = [], candidates: CampaignCommand[] = [], notes: string[] = [];
  const here = snapshot.runtime.scene.player_location;
  const worn = context.items.filter(i => i.position.kind === "equipped" && i.position.character_id === "nicco" && i.owner_id === "nicco");
  const itemFor = (phrase: string, pool: readonly (typeof context.items)[number][]) => {
    const head = words(phrase).at(-1); if (!head) return undefined;
    const matches = pool.filter(i => words(i.name ?? i.id).includes(head));
    return matches.length === 1 ? matches[0] : undefined;
  };
  let moved = false;
  for (const segment of actionSegments(input)) {
    const parts = clauses(segment);
    let lastItem: (typeof context.items)[number] | undefined;
    const removed = new Set<string>();
    for (const [index, clause] of parts.entries()) {
      if (HEDGE.test(clause)) continue;
      let m: RegExpMatchArray | null;
      if ((m = clause.match(MOVE)) && !moved) {
        const phrase = m[1]!.split(DESTINATION_END)[0]!.trim();
        const destination = resolveDestination(phrase, context, world);
        if (INTENTION.test(clause)) actions.push({ clause, kind: "intention", status: "no_state_effect", detail: { text: clause.match(INTENTION)![0] } });
        if (!destination) { actions.push({ clause, kind: "movement", status: "unresolved", detail: { phrase, reason: "unknown_destination" } }); continue; }
        const route = reachable(destination, here, world);
        if (destination === here || world.getAncestors(here).some(a => a.id === destination) && !route.target) {
          actions.push({ clause, kind: "movement", status: "no_state_effect", detail: { phrase, destination, reason: "already_here" } }); continue;
        }
        if (route.target) {
          moved = true;
          runtime.push({ kind: "runtime_delta", delta: { player_location: route.target } });
          actions.push({ clause, kind: "movement", status: "resolved", detail: { phrase, destination, target: route.target, via_container: !!route.via_container } });
        } else {
          actions.push({ clause, kind: "movement", status: "blocked", detail: { phrase, destination, reason: "no_travel_connection", from: here } });
          notes.push(`Nicco sets out for ${display(destination, world)}, but no route there from ${display(here, world)} is established yet: he has not arrived and is still at ${display(here, world)}. Do not describe him at ${display(destination, world)}.`);
        }
        continue;
      }
      const removal = REMOVE.map(r => clause.match(r)).find(Boolean) ?? null;
      const takeOut = removal ? null : clause.match(TAKE_OUT);
      if (removal || takeOut) {
        const phrase = (removal ?? takeOut)![1]!;
        const item = itemFor(phrase, worn);
        // "takes out X" means removal only for a worn item that the same segment then offers away.
        const offeredAfter = takeOut && item ? parts.slice(index + 1).some(c => { const o = c.match(OFFER); return !!o && !HEDGE.test(c) && (/^(?:it|them|those|these)$/i.test(o[1]!.trim()) || itemFor(o[1]!, [item]) !== undefined); }) : false;
        if (item && (removal || offeredAfter) && !removed.has(item.id)) {
          removed.add(item.id); lastItem = item;
          runtime.push({ kind: "place_item", item_id: item.id, position: { kind: "carried", character_id: "nicco" } });
          actions.push({ clause, kind: "equipment_removal", status: "resolved", detail: { item_id: item.id, from: item.position, to: { kind: "carried", character_id: "nicco" }, form: removal ? "remove" : "take_out_then_offer" } });
        } else actions.push({ clause, kind: "equipment_removal", status: "unresolved", detail: { phrase, reason: item ? "take_out_without_offer" : "no_worn_item_matches" } });
        continue;
      }
      if ((m = clause.match(OFFER))) {
        const itemPhrase = m[1]!.trim(), recipientPhrase = m[2]!.trim();
        const carried = context.items.filter(i => i.owner_id === "nicco" && (i.position.kind === "carried" || i.position.kind === "equipped") && i.position.character_id === "nicco");
        const item = /^(?:it|them|those|these)$/i.test(itemPhrase) ? lastItem : itemFor(itemPhrase, carried);
        const noun = words(recipientPhrase).at(-1) ?? "";
        const persistent = context.characters.filter(c => c.id !== "nicco" && words(c.profile.name ?? c.id).includes(noun));
        const ephemeral = noun ? participantForNoun(recipientPhrase.replace(/^(?:the|that|this|same)\s+/i, "").replace(/\s+/g, " ").toLowerCase().split(" ").at(-1)!.replace(/^passerby$/, "passer-by"), participants, participantTurn) : undefined;
        if (!item) { actions.push({ clause, kind: "offer", status: "unresolved", detail: { itemPhrase, recipientPhrase, reason: "no_item" } }); continue; }
        if (persistent.length === 1) {
          const to = persistent[0]!.id;
          candidates.push({ kind: "transfer_item", item_id: item.id, owner_id: to, position: { kind: "carried", character_id: to } });
          actions.push({ clause, kind: "offer", status: "outcome_dependent", detail: { item_id: item.id, recipient: to } });
        } else if (ephemeral) {
          actions.push({ clause, kind: "offer", status: "unsupported_durable_recipient", detail: { item_id: item.id, recipient: ephemeral.id, ref: ephemeral.ref } });
          notes.push(`Nicco offers ${item.name ?? item.id} to ${ephemeral.ref} ${ephemeral.display_name}. A temporary person cannot keep items: they may decline, hesitate or leave the offer unresolved, but must not take or keep ${item.name ?? item.id}; it stays Nicco's.`);
        } else actions.push({ clause, kind: "offer", status: "unresolved", detail: { itemPhrase, recipientPhrase, reason: "unknown_recipient" } });
        continue;
      }
      if (INTENTION.test(clause)) actions.push({ clause, kind: "intention", status: "no_state_effect", detail: { text: clause.match(INTENTION)![0] } });
    }
  }
  return Object.freeze({ actions: Object.freeze(actions), runtime: Object.freeze(runtime), candidates: Object.freeze(candidates), notes: Object.freeze(notes) });
}
