import { findRoute, travelDestination, type TravelRoute } from "../world/travel.js";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { entityMentions } from "./retrieval-policy.js";
import { stem } from "../retrieval/lexical-index.js";
import { tokenize } from "../retrieval/tokenizer.js";
import { participantForNoun, type EphemeralSceneParticipant } from "./scene-participants.js";
import type { PhysicalInteraction } from "./physical-interaction.js";
import { GATES } from "./language/gates.js";
import { escapeRegExp } from "./language/text.js";

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
 *
 * Live NPC Regression Repair 1:
 * - Give-back language ("give them back", "give them back the boots", "hand them back to her", "return the boots", "offers them
 *   back") is an outcome-dependent offer. An attempt/decision frame ("decides to", "tries to", "attempts to") performs the
 *   attempt; hedges ("thinks about", "almost", negation, modal/future) still resolve nothing. Pronouns resolve only against
 *   bounded context: the item's acquisition source when present in the scene, else a single present character or single item.
 *   Anything still ambiguous resolves nothing: no guessing.
 * - Inbound gifts: a player-directed act by a present character who owns and holds the item ("Korvin gives Nicco the boots",
 *   "*Korvin hands him the boots*") and Nicco's own acceptance ("*he takes the boots from Korvin*") become NPC → Nicco
 *   candidates. They are outcome-dependent: the narration must establish the handover and the NPC may refuse. An NPC *offer*
 *   ("Korvin offers Nicco the boots") is not a transfer: the item stays with the NPC until Nicco accepts it.
 * - Unmarked input counts as a scene direction only when it is entirely third-person narration: every sentence starts with a
 *   present character's name or he/she and it has no first/second-person words, asterisks or quotes. Otherwise it stays speech.
 * - Physical interactions (strike, shove, grab, release) with a single present persistent character are recorded as
 *   outcome-dependent acts; their consequences need authorization (see physical-interaction.ts).
 */
export type NaturalActionKind = "movement" | "equipment_removal" | "offer" | "intention" | "inbound_transfer" | "npc_offer" | "physical";
export type NaturalActionStatus = "resolved" | "blocked" | "unresolved" | "outcome_dependent" | "unsupported_durable_recipient" | "no_state_effect" | "awaiting_player_acceptance" | "ambiguous";
export interface NaturalAction { readonly clause: string; readonly kind: NaturalActionKind; readonly status: NaturalActionStatus; readonly detail: Readonly<Record<string, unknown>> }
export interface NaturalActionResolution {
  readonly actions: readonly NaturalAction[];
  /** Player-controlled, ordered; prepared before narration, committed only at turn finalization. */
  readonly runtime: readonly CampaignCommand[];
  /** Outcome-dependent; authorized only from narration evidence. */
  readonly candidates: readonly CampaignCommand[];
  /** Narrator-facing action lines ([PLAYER ACTION]); never diagnostics wording. */
  readonly notes: readonly string[];
  /** Repair 1: player-initiated physical acts on present characters; consequences are authorized separately. */
  readonly physical?: readonly PhysicalInteraction[];
}

const HEDGE = GATES.natural_action_hedge;
const SUBJECT = "(?:(?:he|nicco|i)\\s+)?(?:then\\s+|also\\s+|slowly\\s+|quietly\\s+)?";
const MOVE = new RegExp(`^${SUBJECT}(?:walks?|walked|walking|strolls?|strolled|strolling|goes|go|went|going|heads?|headed|heading|returns?|returned|returning|wanders?|wandered|wandering|hurries|hurried|hurrying|runs?|ran|running|makes? his way|made his way|steps?|stepped|moves?|moved|travels?|travell?ed|crosses|crossed)\\s+(?:back\\s+)?(?:over\\s+|down\\s+|up\\s+|out\\s+|across\\s+|downstairs\\s+|upstairs\\s+)?(?:to|towards?|into|inside|in to|through)\\s+(.+)$`, "i");
export const DESTINATION_END = /\s+(?:looking|searching|hoping|in search|to (?:buy|see|find|look|purchase)|for\b|with\b|nearby|near\b|while\b|as\b|where\b)/i;
const REMOVE = [
  new RegExp(`^${SUBJECT}(?:takes?|took|taking|pulls?|pulled|pulling|slips?|slipped|slipping|kicks?|kicked|kicking|tugs?|tugged)\\s+off\\s+(.+)$`, "i"),
  new RegExp(`^${SUBJECT}(?:takes?|took|taking|pulls?|pulled|pulling|slips?|slipped|kicks?|kicked)\\s+(.+?)\\s+off$`, "i"),
  new RegExp(`^${SUBJECT}(?:removes?|removed|removing|doffs?|doffed)\\s+(.+)$`, "i"),
];
const TAKE_OUT = new RegExp(`^${SUBJECT}(?:takes?|took|taking)\\s+out\\s+(.+)$`, "i");
const OFFER = new RegExp(`^${SUBJECT}(?:gives?|gave|giving|gifts?|gifted|gifting|offers?|offered|offering|hands?|handed|handing|holds?\\s+out|held\\s+out|presents?|presented)\\s+(.+?)\\s+to\\s+(.+)$`, "i");
const INTENTION = /\b(?:looking|searching|hoping)\s+(?:for|to)\b[^,]*|\bto\s+(?:buy|purchase|sell)\b[^,]*/i;
/** Repair 1 give-back/return forms. GIVE_BACK_* capture item and recipient phrases; order matters (see resolveGiveBack). */
const GIVE_VERB = "gives?|gave|giving|hands?|handed|handing|offers?|offered|offering|passes?|passed|passing|holds?\\s+out|held\\s+out|holding\\s+out";
const GIVE_BACK_TO = new RegExp(`^${SUBJECT}(?:${GIVE_VERB})\\s+(.+?)\\s+back(?:\\s+to\\s+(.+))?$`, "i");
const GIVE_BACK_LEADING = new RegExp(`^${SUBJECT}(?:${GIVE_VERB})\\s+back\\s+(.+?)(?:\\s+to\\s+(.+))?$`, "i");
const GIVE_BACK_DOUBLE = new RegExp(`^${SUBJECT}(?:${GIVE_VERB})\\s+(him|her|them|[A-Z][\\w'-]*(?:\\s+[A-Z][\\w'-]*)*)\\s+back\\s+(?!to\\b)(.+)$`, "i");
const RETURN = new RegExp(`^${SUBJECT}(?:returns?|returned|returning)\\s+(.+?)(?:\\s+to\\s+(.+))?$`, "i");
/** A decision/attempt frame performs the attempt; it is stripped only before a transfer form. */
const ATTEMPT = /^(?:(?:he|nicco|i)\s+)?(?:then\s+|also\s+|finally\s+|quietly\s+|simply\s+)?(?:decides?|decided|deciding|chooses?|chose|choosing|tries|tried|trying|attempts?|attempted|attempting)\s+to\s+/i;
const RELATIVE = /^(?:after which|after that|and then|which|who|and|so|then)\s+/i;
/** Nicco accepting or taking an item a present character holds. */
const RECEIVE = new RegExp(`^${SUBJECT}(?:takes?|took|taking|accepts?|accepted|accepting|receives?|received|receiving)\\s+(.+?)(?:\\s+from\\s+(.+))?$`, "i");
/** Physical acts on a present person. Removal forms ("kicks off his boots") are matched earlier. */
const PHYSICAL: readonly (readonly [PhysicalInteraction["interaction"], RegExp])[] = [
  ["strike", new RegExp(`^${SUBJECT}(?:punch(?:es|ed|ing)?|hits?|hitting|strikes?|struck|striking|slaps?|slapped|slapping|kicks?|kicked|kicking|headbutts?|headbutted|elbows?|elbowed|knees?|kneed)\\s+(.+)$`, "i")],
  ["shove", new RegExp(`^${SUBJECT}(?:shoves?|shoved|shoving|push(?:es|ed|ing)?)\\s+(.+)$`, "i")],
  ["grab", new RegExp(`^${SUBJECT}(?:grabs?|grabbed|grabbing|seizes?|seized|seizing|restrains?|restrained|restraining|pins?|pinned|pinning|tackles?|tackled|tackling)\\s+(.+)$`, "i")],
  ["release", new RegExp(`^${SUBJECT}(?:releases?|released|releasing|lets?\\s+go\\s+of|letting\\s+go\\s+of)\\s+(.+)$`, "i")],
];
const TARGET_TAIL = /\s+(?:(?:directly|squarely|hard|again|suddenly|without warning)\b.*|(?:in|on|across|into|against|by)\s+(?:the\s+|his\s+|her\s+|their\s+)?(?:face|jaw|nose|mouth|chin|cheek|head|stomach|gut|belly|chest|ribs?|shoulders?|arms?|back|throat|collar|wrists?)\b.*)$/i;
/** Third-person player-directed acts by a present character (Repair 1): completed gives and non-committal offers. */
const NPC_GIVE_VERB = "gives|gave|hands|handed|passes|passed|presses|pressed|tosses|tossed";
const NPC_OFFER_VERB = "offers|offered|holds out|held out|extends|extended";
const FIRST_SECOND = /\b(?:i|me|my|mine|myself|you|your|yours|we|us|our)\b/i;

const words = (s: string) => tokenize(s).map(stem).filter(w => !["the", "his", "my", "a", "an", "of", "pair", "her", "their"].includes(w));
export function actionSegments(input: string): readonly string[] { return [...input.matchAll(/\*([^*]+)\*/g)].map(m => m[1]!.trim()).filter(Boolean); }
function clauses(segment: string): readonly string[] {
  return segment.split(/,\s*(?:and\s+then\s+|and\s+|then\s+)?|;\s*|\s+(?:and then|then|and|when|before|after)\s+/i).map(c => c.trim()).filter(Boolean);
}
/** Whole canonical names win; local person/object heads veto incidental place mentions.
 * A bare destination noun may use the existing city-scoped feature fallback. */
export function resolveDestination(phrase: string, context: TurnContext, world: WorldStore): string | undefined {
  if (/^(?:the )?center$/i.test(phrase.trim()) && (context.primary.scene.player_location?.id === "calderan" || context.primary.scene.location_ancestry.some(a => a.id === "calderan"))) return "calderan_center";
  const locations = world.getEntitiesByType("location").filter(e => e.knowledge?.visibility.narrator && e.knowledge.visibility.player);
  const exactText = (text: string) => text.trim().replace(/[.!]$/, "").replace(/^the /i, "").toLowerCase();
  const exact = locations.filter(e => [e.id, e.name, e.display_name, ...e.aliases].some(n => exactText(n) === exactText(phrase)));
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) return undefined;
  const target = exactText(phrase).replace(/^(?:a|an|that|this)\s+/i, "");
  if (/^(?:(?:young|old|nearby|other|waiting|standing|seated|licensed|private)\s+)*(?:man|woman|person|seller|guard|merchant|passerby|stranger|table|pen|stall|wagon|door|window)\b/i.test(target)
    || context.characters.some(c => [c.profile.name, ...(c.profile.aliases ?? [])].some(n => n && new RegExp(`^${escapeRegExp(n)}(?:\\b|$)`, "i").test(target)))) return undefined;
  const mentions = [...entityMentions(phrase, context, world)].filter(([id]) => locations.some(l => l.id === id)).sort((a, b) => b[1] - a[1]);
  if (mentions.length && (mentions.length === 1 || mentions[0]![1] > mentions[1]![1])) return mentions[0]![0];
  // Never mine the last word of a longer description for a destination.
  const tokens = words(phrase);
  const head = tokens.length === 1 ? tokens[0] : undefined;
  if (!head) return undefined;
  const city = context.primary.scene.location_ancestry[0]?.id;
  const heads = (l: (typeof locations)[number]) => [l.name, ...l.aliases, ...l.features.map(f => f.name)].map(n => words(n).at(-1));
  const found = locations.filter(l => heads(l).includes(head) && (!city || l.id === city || world.getAncestors(l.id).some(a => a.id === city)));
  return found.length === 1 ? found[0]!.id : undefined;
}
/** Shared weighted routing for natural movement and explicit carrying. */
export function reachable(destination: string, here: string, world: WorldStore): { readonly target?: string; readonly via_container?: boolean; readonly route?: TravelRoute } {
  const target = travelDestination(world, destination);
  const route = findRoute(world, here, target);
  return route ? { target, via_container: target !== destination, route } : {};
}
const display = (id: string, world: WorldStore) => world.getEntity(id)?.display_name ?? id;
/**
 * One movement clause → its outcome through the shared destination and route rules (no teleport): resolved (one runtime delta with
 * the route's minutes), blocked (no established connection; the narrator is told Nicco has not arrived), already here, or unresolved.
 * Shared by natural *action* clauses and, since H5.1, by unmarked first-person movement (player-intent.ts).
 */
export function resolveMovement(clause: string, phrase: string, here: string, context: TurnContext, world: WorldStore):
  { readonly actions: readonly NaturalAction[]; readonly runtime: readonly CampaignCommand[]; readonly notes: readonly string[] } {
  const actions: NaturalAction[] = [];
  const destination = resolveDestination(phrase, context, world);
  if (INTENTION.test(clause)) actions.push({ clause, kind: "intention", status: "no_state_effect", detail: { text: clause.match(INTENTION)![0] } });
  if (!destination) return { actions: [...actions, { clause, kind: "movement", status: "unresolved", detail: { phrase, reason: "unknown_destination" } }], runtime: [], notes: [] };
  const route = reachable(destination, here, world);
  if (destination === here || world.getAncestors(here).some(a => a.id === destination) && !route.target)
    return { actions: [...actions, { clause, kind: "movement", status: "no_state_effect", detail: { phrase, destination, reason: "already_here" } }], runtime: [], notes: [] };
  if (route.target) return { actions: [...actions, { clause, kind: "movement", status: "resolved", detail: { phrase, destination, target: route.target, via_container: !!route.via_container, route: route.route } }],
    runtime: [{ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } }], notes: [] };
  return { actions: [...actions, { clause, kind: "movement", status: "blocked", detail: { phrase, destination, reason: "no_travel_connection", from: here } }], runtime: [],
    notes: [`Nicco sets out for ${display(destination, world)}, but no route there from ${display(here, world)} is established yet: he has not arrived and is still at ${display(here, world)}. Do not describe him at ${display(destination, world)}.`] };
}

export function resolveNaturalActions(input: string, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore,
  participants: readonly EphemeralSceneParticipant[] = [], participantTurn = 0): NaturalActionResolution {
  const actions: NaturalAction[] = [], runtime: CampaignCommand[] = [], candidates: CampaignCommand[] = [], notes: string[] = [], physical: PhysicalInteraction[] = [];
  const here = snapshot.runtime.scene.player_location;
  const worn = context.items.filter(i => i.position.kind === "equipped" && i.position.character_id === "nicco" && i.owner_id === "nicco");
  type Item = (typeof context.items)[number];
  const itemFor = (phrase: string, pool: readonly Item[]) => {
    const head = words(phrase).at(-1); if (!head) return undefined;
    const matches = pool.filter(i => words(i.name ?? i.id).includes(head));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const npcs = context.characters.filter(c => c.id !== "nicco");
  const nameOf = (id: string) => npcs.find(c => c.id === id)?.profile.name ?? id;
  const holderOf = (i: Item) => i.position.kind === "carried" || i.position.kind === "equipped" ? i.position.character_id : undefined;
  const niccoCarried = () => context.items.filter(i => i.owner_id === "nicco" && holderOf(i) === "nicco");
  /** Items a present character both owns and holds: the only items an inbound gift can move. */
  const heldBy = (id: string) => context.items.filter(i => i.owner_id === id && holderOf(i) === id);
  const PRONOUN = /^(?:it|them|those|these|the pair|that|this)$/i, PERSON_PRONOUN = /^(?:him|her|them)$/i;
  const personFor = (phrase: string) => {
    const noun = words(phrase).at(-1) ?? "";
    const found = npcs.filter(c => words(c.profile.name ?? c.id).includes(noun) || (c.profile.aliases ?? []).some(a => words(a).includes(noun)));
    return found.length === 1 ? found[0]!.id : undefined;
  };
  const inbound = (item: Item) => ({ kind: "transfer_item" as const, item_id: item.id, owner_id: "nicco", position: { kind: "carried" as const, character_id: "nicco" } });
  /**
   * Give-back target resolution from bounded context only. A pronoun recipient is the item's acquisition source when present,
   * else the single present character. A pronoun item is the segment's last item, else the single carried item from that
   * recipient, else the single carried item. Returns ambiguous rather than guessing.
   */
  const resolveGiveBack = (itemPhrase: string, recipientPhrase: string | undefined, lastItem: Item | undefined): { item?: Item; recipient?: string; reason?: string } => {
    const carried = niccoCarried();
    const source = (i: Item) => { const from = i.acquisition?.from_character_id; return from && npcs.some(c => c.id === from) ? from : undefined; };
    const implicitRecipient = !recipientPhrase || PERSON_PRONOUN.test(recipientPhrase.trim());
    const named = implicitRecipient ? undefined : personFor(recipientPhrase!);
    if (!implicitRecipient && !named) return { reason: "unknown_recipient" };
    let item: Item | undefined;
    if (!PRONOUN.test(itemPhrase.trim())) item = itemFor(itemPhrase, carried);
    else if (lastItem) item = lastItem;
    else {
      const pool = named ? carried.filter(i => source(i) === named) : carried.filter(i => source(i));
      item = pool.length === 1 ? pool[0] : carried.length === 1 ? carried[0] : undefined;
      if (!item) return { reason: carried.length ? "ambiguous_item" : "no_item" };
    }
    if (!item) return { reason: "no_item" };
    const recipient = named ?? source(item) ?? (npcs.length === 1 ? npcs[0]!.id : undefined);
    return recipient ? { item, recipient } : { item, reason: "ambiguous_recipient" };
  };
  let moved = false;
  const direction = actionSegments(input).length ? [] : sceneDirection(input, context);
  for (const segment of [...actionSegments(input), ...direction]) {
    const parts = clauses(segment);
    let lastItem: (typeof context.items)[number] | undefined;
    const removed = new Set<string>();
    for (const [index, raw] of parts.entries()) {
      let clause = raw.replace(RELATIVE, "");
      // Repair 1: "decides to / tries to give them back" performs the attempt; the outcome still depends on the recipient.
      const attempt = clause.match(ATTEMPT);
      if (attempt) { const rest = clause.slice(attempt[0].length); if (isTransferForm(rest) && !HEDGE.test(rest)) clause = rest; }
      if (HEDGE.test(clause)) continue;
      let m: RegExpMatchArray | null;
      if ((m = clause.match(MOVE)) && !moved) {
        const outcome = resolveMovement(clause, m[1]!.split(DESTINATION_END)[0]!.trim(), here, context, world);
        actions.push(...outcome.actions); runtime.push(...outcome.runtime); notes.push(...outcome.notes);
        moved = outcome.runtime.length > 0;
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
      // Repair 1: give-back / return. Checked before OFFER, which would misread "gives them back to her".
      const back = clause.match(GIVE_BACK_TO) ?? clause.match(GIVE_BACK_LEADING);
      const double = back ? null : clause.match(GIVE_BACK_DOUBLE);
      const ret = back || double ? null : clause.match(RETURN);
      if (back || double || ret) {
        const [itemPhrase, recipientPhrase] = double ? [double[2]!, double[1]!] : [(back ?? ret)![1]!, (back ?? ret)![2]];
        const found = resolveGiveBack(itemPhrase.trim(), recipientPhrase?.trim(), lastItem);
        if (found.item && found.recipient) {
          lastItem = found.item;
          candidates.push({ kind: "transfer_item", item_id: found.item.id, owner_id: found.recipient, position: { kind: "carried", character_id: found.recipient } });
          actions.push({ clause, kind: "offer", status: "outcome_dependent", detail: { item_id: found.item.id, recipient: found.recipient, form: "give_back", attempt: !!attempt } });
        } else {
          // Repair 1.1 return premise: if Nicco holds no matching item but exactly one present person holds it, the narrator is told
          // the real holder, so the text cannot assume the earlier handover happened.
          const elsewhere = context.items.filter(i => holderOf(i) && holderOf(i) !== "nicco" && npcs.some(c => c.id === holderOf(i)));
          const heldElsewhere = found.reason === "no_item" || found.reason === "ambiguous_item" ? (PRONOUN.test(itemPhrase.trim()) ? (elsewhere.length === 1 ? elsewhere[0] : undefined) : itemFor(itemPhrase, elsewhere)) : undefined;
          actions.push({ clause, kind: "offer", status: found.reason?.startsWith("ambiguous") ? "ambiguous" : "unresolved", detail: { itemPhrase, recipientPhrase: recipientPhrase ?? null, reason: found.reason ?? "unresolved", form: "give_back", ...(heldElsewhere ? { premise: "not_held_by_nicco", item_id: heldElsewhere.id, holder: holderOf(heldElsewhere) } : {}) } });
          if (heldElsewhere) {
            const h = nameOf(holderOf(heldElsewhere)!), it = heldElsewhere.name ?? heldElsewhere.id;
            notes.push(`Nicco does not have ${it}: ${h} still has it, because the earlier handover never happened. Do not narrate Nicco holding, offering or returning it, it staying in his hands, or ${h} taking it back. Nicco's words may be heard; the objects stay where they are.`);
          }
        }
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
      // Repair 1: a present character's player-directed give (completed) or offer (not a transfer until Nicco accepts).
      const npcAct = npcActClause(clause, npcs.map(c => c.profile.name ?? c.id));
      if (npcAct) {
        const giver = personFor(npcAct.giver), item = giver ? itemFor(npcAct.itemPhrase, heldBy(giver)) : undefined;
        if (!giver || !item) { actions.push({ clause, kind: npcAct.offer ? "npc_offer" : "inbound_transfer", status: "unresolved", detail: { giver: giver ?? null, itemPhrase: npcAct.itemPhrase, reason: giver ? "giver_does_not_hold_item" : "unknown_giver" } }); continue; }
        lastItem = item;
        if (npcAct.offer) {
          actions.push({ clause, kind: "npc_offer", status: "awaiting_player_acceptance", detail: { item_id: item.id, giver } });
          notes.push(`${nameOf(giver)} offers ${item.name ?? item.id} to Nicco. Nicco has not accepted it: it remains ${nameOf(giver)}'s unless Nicco himself accepts it in a later action.`);
        } else {
          candidates.push(inbound(item));
          actions.push({ clause, kind: "inbound_transfer", status: "outcome_dependent", detail: { item_id: item.id, giver, form: "npc_give" } });
        }
        continue;
      }
      if ((m = clause.match(RECEIVE))) {
        // Nicco accepting/taking something a present character holds. Only resolved items produce an action.
        const from = m[2] ? personFor(m[2]) : undefined;
        const pool = from ? heldBy(from) : npcs.flatMap(c => heldBy(c.id));
        const item = PRONOUN.test(m[1]!.trim()) ? (pool.length === 1 ? pool[0] : undefined) : itemFor(m[1]!, pool);
        if (item && (!m[2] || from)) {
          lastItem = item;
          candidates.push(inbound(item));
          actions.push({ clause, kind: "inbound_transfer", status: "outcome_dependent", detail: { item_id: item.id, giver: holderOf(item), form: "nicco_accepts" } });
          continue;
        }
      }
      const hit = PHYSICAL.map(([kind, r]) => [kind, clause.match(r)] as const).find(([, match]) => !!match);
      if (hit) {
        const phrase = hit[1]![1]!.replace(TARGET_TAIL, "").trim();
        const target = PERSON_PRONOUN.test(phrase) ? (npcs.length === 1 ? npcs[0]!.id : undefined) : personFor(phrase);
        if (target) {
          physical.push({ actor: "nicco", target, interaction: hit[0] });
          actions.push({ clause, kind: "physical", status: "outcome_dependent", detail: { interaction: hit[0], target } });
          notes.push(`Nicco's ${hit[0]} against ${nameOf(target)} is his attempted action; how it lands is narrated. Only minor injury, dazed, knocked down or winded can become recorded conditions; restraint, removal from a place, detention, arrest or bans can be threatened, ordered or attempted but must not be narrated as accomplished.`);
          continue;
        }
      }
      if (INTENTION.test(clause)) actions.push({ clause, kind: "intention", status: "no_state_effect", detail: { text: clause.match(INTENTION)![0] } });
    }
  }
  return Object.freeze({ actions: Object.freeze(actions), runtime: Object.freeze(runtime), candidates: Object.freeze(candidates), notes: Object.freeze(notes), ...(physical.length ? { physical: Object.freeze(physical) } : {}) });
}
function isTransferForm(clause: string): boolean { return [GIVE_BACK_TO, GIVE_BACK_LEADING, GIVE_BACK_DOUBLE, RETURN, OFFER].some(r => r.test(clause)); }
/** "Korvin gives Nicco the boots", "Korvin hands the boots to him", "Korvin offers Nicco the boots". */
function npcActClause(clause: string, names: readonly string[]): { giver: string; itemPhrase: string; offer: boolean } | undefined {
  if (!names.length) return undefined;
  const who = `(${names.map(escapeRegExp).join("|")}|she|he)`;
  for (const [verbs, offer] of [[NPC_GIVE_VERB, false], [NPC_OFFER_VERB, true]] as const) {
    const direct = clause.match(new RegExp(`^${who}\\s+(?:${verbs})\\s+(?:nicco|him)\\s+(.+)$`, "i"));
    const to = direct ? null : clause.match(new RegExp(`^${who}\\s+(?:${verbs})\\s+(.+?)\\s+to\\s+(?:nicco|him)$`, "i"));
    const m = direct ?? to;
    if (m && !/^(?:she|he)$/i.test(m[1]!)) return { giver: m[1]!, itemPhrase: m[2]!, offer };
  }
  return undefined;
}
/**
 * Repair 1 scene direction: unmarked input that is entirely third-person narration (every sentence led by a present
 * character's name or he/she; no first/second person, asterisks or quotes) is player-directed action text, not speech.
 */
export function sceneDirection(input: string, context: TurnContext): readonly string[] {
  if (/[*"“”]/.test(input) || FIRST_SECOND.test(input)) return [];
  const names = context.characters.map(c => c.profile.name ?? c.id);
  const sentences = input.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim().replace(/[.!?]+$/, "")).filter(Boolean);
  if (!sentences.length || sentences.length > 3 || !names.length) return [];
  const lead = new RegExp(`^(?:${names.map(escapeRegExp).join("|")}|he|she)\\b`, "i");
  return sentences.every(s => lead.test(s)) ? sentences : [];
}
