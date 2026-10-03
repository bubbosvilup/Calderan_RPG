import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import { reachable, resolveDestination } from "./natural-actions.js";
import { blankQuotes, escapeRegExp as esc, sentencesOf } from "./language/text.js";
import { GATES } from "./language/gates.js";
import { activeNpcPlus } from "../campaign/premium-characters.js";
import { edgeDirection, routeDirection } from "../world/vertical-direction.js";
import { findRoute } from "../world/travel.js";

/**
 * Location Continuity Pass 1.3. A campaign (created) character's location changes only when the current turn clearly establishes
 * that THAT character completed movement to a known location. There is no party, follower, companion or proximity model: Nicco
 * moving never moves anyone else; ownership, household membership, affection or earlier presence are never movement.
 *
 * Two sources, both deterministic:
 * - Player-authored carrying (runtime, pre-narration): Nicco physically carries a present campaign character as part of his own
 *   resolved movement ("*picks Maren up and carries her back to Heartstone*"). Transport is the player's own physical act, so the
 *   carried person moves with him to his arrival location, like his own movement. No route, no carry.
 * - Narrated completed movement (evidence for the controller's `move_character`): "Maren follows him into the courtyard", "Nicco
 *   carries her through the tower door", "Tomas walks back to the market", "They reach Heartstone, Maren still in his arms". The
 *   mover must resolve to exactly one movable character, the movement must be completed (no intention, hedge, gaze or plan), and
 *   the destination must resolve to one concrete known location. Anything else changes nothing.
 */
/** `entrant`: not in the scene Nicco is in or leaves (elsewhere or off-scene). Such a character counts only as someone ARRIVING in Nicco's scene, by name. */
export interface MovableCharacter { readonly id: string; readonly names: readonly string[]; readonly sex?: "female" | "male"; readonly entrant?: true }
export interface CharacterMovement { readonly character_id: string; readonly location_id: string; readonly source_sentence: string }

/**
 * Created, living characters currently at one of these locations (the scene Nicco is in or is leaving this turn). NPC+ Pass 1: with
 * `world`, ACTIVE authored NPC+ there too — once an authored character is an active household member, their current location is
 * runtime-authoritative and moves only through the same evidence rules (never automatically, never by request, membership or
 * ownership). Other authored NPCs stay canon-placed.
 */
export function movableCharacters(snapshot: DeepReadonly<CampaignSnapshot>, locations: readonly string[], world?: WorldStore): MovableCharacter[] {
  const created = snapshot.characters.filter(c => c.id !== "nicco" && c.origin.kind === "created" && c.current.status !== "dead" && !!c.current.current_location && locations.includes(c.current.current_location)).flatMap(c => {
    const name = c.profile.name ?? c.origin_snapshot?.label;
    if (!name) return [];
    const sex = /^(?:female|woman)$/i.test(c.profile.sex ?? "") ? "female" as const : /^(?:male|man)$/i.test(c.profile.sex ?? "") ? "male" as const : undefined;
    return [{ id: c.id, names: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(sex ? { sex } : {}) }];
  });
  if (!world) return created;
  const npcPlus = activeNpcPlus(snapshot);
  return [...created, ...persistentCharactersAt(snapshot, world, locations).filter(m => npcPlus.has(m.id) && !created.some(c => c.id === m.id))];
}

/** H5.1: where a persistent character is in a snapshot (created: its record; authored NPC: its runtime location). */
export function characterLocation(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, id: string): string | undefined {
  if (id === "nicco") return snapshot.runtime.scene.player_location;
  const created = snapshot.characters.find(c => c.id === id && c.origin.kind === "created");
  if (created) return created.current.status === "dead" ? undefined : created.current.current_location;
  // Every authored NPC with an established default is in runtime npc_locations (snapshot validation guarantees it).
  // OFF_SCENE has no current location (its last known place is not where the character is).
  return world.getEntity(id)?.type === "character" ? snapshot.runtime.npc_locations.find(n => n.character_id === id)?.current_location : undefined;
}
/**
 * Final movement closure: ACTIVE authored NPC+ whose authoritative location is NOT in these scenes (located elsewhere, or off-scene).
 * They never follow, never leave; they can only be narrated ARRIVING where Nicco is, by name (see narratedMovements).
 */
export function npcPlusEntrants(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, locations: readonly string[]): MovableCharacter[] {
  const npcPlus = activeNpcPlus(snapshot), inScope = new Set(movableCharacters(snapshot, locations, world).map(m => m.id));
  return world.getEntitiesByType("character").filter(e => e.role === "npc" && npcPlus.has(e.id) && !inScope.has(e.id) && !!e.knowledge?.visibility.narrator
    && !snapshot.characters.some(c => c.id === e.id && c.origin.kind === "created")).map(e => {
    const name = e.display_name ?? e.name ?? e.id;
    return { id: e.id, names: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(e.sex === "female" || e.sex === "male" ? { sex: e.sex } : {}), entrant: true as const };
  });
}
/**
 * The ONE location a bare vertical direction ("goes upstairs") can mean for someone standing at `from`: the single directly connected
 * location whose edge is read as that direction by the structured world graph. Zero or several candidates, or a container: undefined.
 */
export function uniqueVerticalNeighbour(world: WorldStore, from: string, direction: "UP" | "DOWN"): string | undefined {
  const place = world.getEntity(from);
  if (place?.type !== "location") return undefined;
  const hits = [...new Set(place.connections.map(c => c.target))].filter(t => edgeDirection(world, from, t) === direction);
  const only = hits.length === 1 ? hits[0]! : undefined;
  return only && !world.getChildren(only).some(e => e.type === "location") ? only : undefined;
}
/**
 * Final movement closure (live batch 3): a completed exit through a door whose own sentence names no place ("steps through and pulls it shut
 * behind her") goes to the ONE known place the draft's nearby door wording names ("the courtyard door", "the door that leads out to the
 * courtyard", "through the door into the walled courtyard"), only when that place is directly connected to where she is. Zero or several
 * candidates, a container, or a place with no direct connection: undefined (the departure stays destination-less, i.e. OFF_SCENE).
 */
export function doorDestination(narration: string, sentence: string, from: string, context: TurnContext, world: WorldStore): string | undefined {
  const all = sentencesOf(narration).map(x => blankQuotes(x));
  const at = all.findIndex(x => sentence.startsWith(x.slice(0, 40)) || x === blankQuotes(sentence));
  if (at < 0) return undefined;
  const found = new Set<string>();
  const consider = (phrase: string | undefined) => {
    const words = (phrase ?? "").trim().split(/\s+/).filter(Boolean);
    for (let len = words.length; len > 0; len--) for (let start = 0; start + len <= words.length; start++) {
      const hit = resolveDestination(words.slice(start, start + len).join(" "), context, world);
      if (hit && hit !== from) { found.add(hit); return; }
    }
  };
  for (const x of all.slice(Math.max(0, at - 4), at + 1)) {
    for (const m of x.matchAll(/\b((?:[a-z]+\s+)?[a-z]+)\s+(?:door|doorway|gate|archway)\b/gi)) consider(m[1]!.replace(/^(?:the|a|an|that|this|her|his|open|opened|heavy|wooden|oak|small|narrow|front|back|side)\s+/i, ""));
    for (const m of x.matchAll(/\b(?:door|doorway|gate|archway|passage)\b[^.;]{0,30}?\b(?:to|onto|into|toward|towards|out to|out onto|out into)\s+(?:the\s+)?((?:[a-z]+\s+){0,2}[a-z]+)/gi)) consider(m[1]);
  }
  for (const x of [at > 0 && /\b(?:door|through|steps?|stepp\w+)\b/i.test(all[at - 1]!) ? all[at - 1]! : "", all[at]!]) for (const m of x.matchAll(/\b(?:into|onto|out to|out into|out onto)\s+(?:the\s+)?((?:[a-z]+\s+){0,2}[a-z]+)/gi)) consider(m[1]);
  const place = world.getEntity(from);
  const [only] = found.size === 1 ? [...found] : [];
  return only && only !== from && place?.type === "location" && place.connections.some(c => c.target === only) && !world.getChildren(only).some(e => e.type === "location") ? only : undefined;
}

/**
 * H5.1: every persistent character (created or authored NPC) at one of these locations, by name. Used by the narration audit's
 * movement backstop only: authored NPCs are never movers for authorization (their whereabouts stay canon-owned), but narration that
 * moves them must still be detected. Authored names come from canon; sex only from a declared profile or authored sex.
 */
export function persistentCharactersAt(snapshot: DeepReadonly<CampaignSnapshot>, world: WorldStore, locations: readonly string[]): MovableCharacter[] {
  const created = movableCharacters(snapshot, locations);
  const authored = world.getEntitiesByType("character").filter(e => e.role === "npc" && !created.some(c => c.id === e.id)).flatMap(e => {
    const where = characterLocation(snapshot, world, e.id);
    if (!where || !locations.includes(where) || !e.knowledge?.visibility.narrator) return [];
    const name = e.display_name ?? e.name ?? e.id;
    return [{ id: e.id, names: [name, ...name.split(/\s+/).filter(t => t.length > 2 && /^[A-Z]/.test(t))], ...(e.sex === "female" || e.sex === "male" ? { sex: e.sex } : {}) }];
  });
  return [...created, ...authored];
}

/** Not a completed movement: modality, intention, plans, negation, gaze, questions. */
const NOT_DONE = GATES.movement_not_done;
const CARRY = "(?:carries|carried|carrying|carry|lifts|lifted|hauls|hauled|bears|bore)";
const WALK = "(?:follows|followed|walks|walked|goes|went|comes|came|heads|headed|returns|returned|limps|limped|runs|ran|hurries|hurried|steps|stepped|trails|trailed|shuffles|shuffled|staggers|staggered|slips|slipped)";
const TO = "(into|inside|through|to|back to|up to|out to|out into|onto|in through)";
/** H5.1: a stairway leg before the destination ("follows him down the stairs into the hall", "goes downstairs to the hall"). */
const STAIRS = "(?:(?:down|up)(?:\\s+the(?:\\s+[a-z]+)?\\s+(?:stairs|steps|staircase))?\\s+|downstairs\\s+|upstairs\\s+)?";
const HELD = "(?:in his arms|on his back|over his shoulder|against his (?:chest|shoulder)|slung over his shoulder)";

/** A pronoun resolves only when exactly one movable character is compatible with it (two women: "she" resolves to nobody). */
function byPronoun(movable: readonly MovableCharacter[], pronoun: string): string | undefined {
  const want = /^(?:her|she)$/i.test(pronoun) ? "female" : /^(?:him|he)$/i.test(pronoun) ? "male" : undefined;
  if (!want) return undefined;
  const fits = movable.filter(m => !m.sex || m.sex === want);
  return fits.length === 1 ? fits[0]!.id : undefined;
}
function byName(movable: readonly MovableCharacter[], token: string): string | undefined {
  const hits = movable.filter(m => m.names.some(n => n.toLowerCase() === token.toLowerCase()));
  return hits.length === 1 ? hits[0]!.id : undefined;
}
/**
 * One concrete known location for a destination phrase. A container ("Heartstone") or an entry phrase ("the tower door", "inside",
 * "home") resolves to where Nicco arrived this turn when that lies inside it; otherwise only a location with no sub-locations counts.
 */
export function concreteDestination(phrase: string, arrival: string, origin: string, context: TurnContext, world: WorldStore): string | undefined {
  const cleaned = phrase.replace(/\s+(?:with|while|as|and|where|before|after|still)\b.*$/i, "").trim();
  const dest = cleaned ? resolveDestination(cleaned, context, world) : undefined;
  if (dest) {
    if (dest === arrival || world.getAncestors(arrival).some(a => a.id === dest)) return arrival;
    return world.getChildren(dest).some(e => e.type === "location") ? undefined : dest;
  }
  return arrival !== origin && /^(?:the\s+)?(?:(?:tower|main|front|heavy|oak|wooden)\s+)?(?:door|doorway|threshold|inside|in|home|house|tower|room|hall)\b(?!\s+(?:of|to|at|into|from|next|beyond|across|near|by|on|under|behind\s+(?!him\b|them\b)|in\s+the)\b)/i.test(cleaned) ? arrival : undefined;
}

/**
 * Player-authored carrying. `natural` is the turn's already-resolved runtime (player movement); the carry clause may also carry its
 * own destination ("carries her back to Heartstone"), resolved through the same route rule as ordinary movement (no teleport).
 */
export function resolvePlayerCarry(input: string, snapshot: DeepReadonly<CampaignSnapshot>, context: TurnContext, world: WorldStore, natural: readonly CampaignCommand[]):
  { readonly runtime: readonly CampaignCommand[]; readonly notes: readonly string[]; readonly carried?: string } {
  const here = snapshot.runtime.scene.player_location;
  // H5.1: an authored NPC present in the scene can be carried too (the player's own physical act; CampaignState moves authored NPCs
  // through runtime locations). Who may move by *narration* is unchanged: authorization still accepts only created characters.
  const movable = persistentCharactersAt(snapshot, world, [here]).filter(m => context.characters.some(c => c.id === m.id));
  if (!movable.length) return { runtime: [], notes: [] };
  const names = movable.flatMap(m => m.names).map(esc).join("|");
  const flat = input.replace(/\*/g, " . ");
  const clauses = flat.split(/(?<=[.!?;])\s+|\s+(?:and then|then)\s+/);
  let consumed = 0;
  for (const clause of clauses) {
    const start = flat.indexOf(clause, consumed); consumed = start < 0 ? consumed : start + clause.length;
    const m = clause.match(new RegExp(`\\b(?:picks?|picked|pick)\\s+(${names}|her|him)\\s+up\\b|\\b${CARRY}\\s+(${names}|her|him)\\b|\\b(${names}|her|him)\\s+${HELD}`, "i"));
    if (!m || NOT_DONE.test(clause.slice(0, m.index! + m[0].length))) continue;
    const token = (m[1] ?? m[2] ?? m[3])!;
    // H5.1: a pronoun with no unique compatible person resolves to the one movable person the player named before it ("Maren has
    // twisted her ankle. I lift her…"); two different names before it resolve nobody.
    const before = flat.slice(0, Math.max(0, start) + m.index!);
    const named = [...new Set(movable.filter(p => p.names.some(n => new RegExp(`\\b${esc(n)}\\b`).test(before))).map(p => p.id))];
    const antecedent = /^(?:her|him)$/i.test(token) && named.length === 1 && byPronoun(movable.filter(p => p.id === named[0]), token) ? named[0] : undefined;
    const who = byName(movable, token) ?? byPronoun(movable, token) ?? antecedent;
    if (!who) continue;
    const moved = natural.find((c): c is Extract<CampaignCommand, { kind: "runtime_delta" }> => c.kind === "runtime_delta" && !!c.delta.player_location);
    if (moved) return { runtime: [{ kind: "move_character", character_id: who, location_id: moved.delta.player_location! }], notes: [], carried: who };
    // The carry clause itself names where he takes them.
    const rest = flat.slice(Math.max(0, start) + m.index!);
    const dest = rest.match(new RegExp(`\\b${TO}\\s+([^.;,!?*]+)`, "i"));
    if (!dest) continue;
    const target = resolveDestination(dest[2]!.trim(), context, world);
    if (!target) continue;
    const route = reachable(target, here, world);
    const name = movable.find(x => x.id === who)!.names[0]!;
    if (!route.target) return { runtime: [], notes: [`Nicco sets out carrying ${name} toward ${world.getEntity(target)?.display_name ?? target}, but no route there from ${world.getEntity(here)?.display_name ?? here} is established yet: neither of them has arrived; both are still at ${world.getEntity(here)?.display_name ?? here}.`] };
    return { runtime: [{ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } }, { kind: "move_character", character_id: who, location_id: route.target }], notes: [], carried: who };
  }
  return { runtime: [], notes: [] };
}

/**
 * NPC+ Pass 9: implicit-destination following. Narrated following usually omits "to <place>" ("Maren follows a step behind",
 * "Maren's lighter steps came after", "Gerome descends after him"). When Nicco moved this turn, such a completed follow by an active
 * NPC+ he left behind resolves to HIS same-turn arrival — never to geography. The words after the verb must be follow-manner only
 * (him, behind, a step behind, down the stairs…), so "follows the conversation", "follows his reasoning" or "follows him to the
 * window" yield nothing; the whole clause must pass the shared `follow_not_done` gate (modal, negated, refused, gazing, other-day).
 */
const FOLLOW_VERB = "(?:follows|followed|trails|trailed|falls into step|fell into step|comes after|came after|descends after|descended after|climbs after|climbed after|goes after|went after|walks after|walked after"
  // Debt closure D-12: live and ornate follow verbs that assert a completed physical following.
  + "|hurries after|hurried after|hastens after|hastened after|rushes after|rushed after|joins him|joined him|joins nicco|joined nicco|falls in (?:beside|behind) (?:him|nicco)|fell in (?:beside|behind) (?:him|nicco))";
const STEP_NOUN = "(?:footsteps|steps|footfalls|tread|treads)";
const STEP_VERB = "(?:follow|follows|followed|come after|comes after|came after|sound behind him|sounded behind him)";
// Follow-recognition closure: manner/time tails taken verbatim from live production drafts ("at her own pace", "a pace or two behind",
// "behind him on the stair", "a few moments after him"). Still manner only: no place, object or bare "later".
const FOLLOW_TAIL = /^(?:\s*(?:him|nicco|after(?: him| nicco)?|behind(?: him| nicco| her)?|a (?:step|few steps|pace|moment) (?:behind|later|after)|close behind|closely|at a distance|in silence|without a word|quietly|silently|slowly|wordlessly|shortly after|soon after|downstairs|upstairs|(?:down|up)(?: the (?:stairs|steps|staircase))?|out|there|at (?:her|his|its|their) own pace|a pace or two behind|a few (?:paces|steps|strides) (?:behind|back)|(?:a few moments|moments) (?:later|after)|on the (?:stairs?|steps)|first|at a (?:short|respectful|safe) distance|(?:a (?:moment|few moments|beat) )?after he (?:does|did|arrives|arrived|reaches (?:the )?[a-z]+(?: [a-z]+)?))\b)*\s*$/i;
/**
 * Follow-recognition closure, DOWN-only forms (live production drafts): "Maren comes down the stairs a moment later", "Maren came down a
 * moment after", "Maren appears at the bottom step / of the stair". They name no follow verb, so they are accepted ONLY when Nicco's own
 * same-turn route is a proven pure descent (`routeDirection` === "DOWN"); then "down" and "the bottom of the stairs" can only mean his
 * arrival side. Same tail, gates and eligibility as every implicit follow.
 */
const COME_DOWN = "(?:comes|came|goes|went)\\s+down(?:\\s+the\\s+(?:stairs?|steps|staircase))?";
const APPEARS_BELOW = "(?:appears|appeared)\\s+at\\s+the\\s+(?:bottom|foot)\\s+(?:step|of\\s+the\\s+(?:stairs?|steps|staircase))";
/**
 * Debt closure D-12: a NAMED character's physical completed arrival at Nicco's same-turn arrival ("Gerome ducked through the doorframe and
 * stepped into the hall", "Maren comes down into the hall a few paces behind", "Gerome descends the stairs", "Heavy footfalls marked
 * Maren's descent"). Named subjects only; the destination must resolve to the arrival (never geography) or be a proven descent.
 */
const ARRIVE_MANNER = "(?:(?:\\w+ly\\s+)|(?:(?:ducks?|ducked)\\s+(?:\\w+ly\\s+)?(?:through|under)\\s+the\\s+\\w+\\s+(?:and\\s+)?)|(?:(?:rounds?|rounded)\\s+the\\s+\\w+\\s+and\\s+))*";
const ARRIVE_VERB = "(?:steps?|stepped|walks?|walked|comes?|came|enters?|entered|arrives?|arrived|emerges?|emerged|lumbers?|lumbered|stomps?|stomped|appears?|appeared)";
const ARRIVE_TAIL = /(?:\s+(?:a (?:step|few steps|pace|pace or two|few paces|moment|few moments|beat) (?:behind|later|after)(?: him| nicco| he does| he did)?|(?:a few moments|moments) (?:later|after)|close behind|behind (?:him|nicco)|after (?:him|nicco)|first))+$/i;
const ARRIVE_VETO = /\b(?:usually|always|often|sometimes|never|rarely|typically|habitually|every|each|once|yesterday|tomorrow|later today|last (?:night|week|time|year)|memory|memories|dream\w*|imagin\w+|pretend\w*|at (?:dawn|dusk|night|noon|midnight|first light))\b/i;
const ARRIVE_STOPS = /\b(?:stops|stopped|halts|halted|turns? back|turned back|retreats?|retreated|stays?|stayed|waits?|waited|remains?|remained|lingers?|lingered)\b(?!\s+(?:at|near|by)\s+the\s+(?:bottom|foot|base)\b)/i;
/** Clause openers before the follower: time ("A moment later,") or Nicco-relative place ("Behind him,"; Pass 10: the one live follow draft opened so). */
const LEAD_IN = "(?:(?:(?:a moment|moments|a beat|seconds) later|after a (?:moment|pause|beat)|shortly after(?:ward)?|soon|(?:close |a step |a pace )?behind (?:him|nicco)|close behind|after (?:him|nicco)),?\\s+)?";
/** What may NOT trail a dash after a follow: a self-correction or a stop ("follows him — no, she stays"). The richest shared veto (`disqualify`) is applied too. */
const DASH_RETRACTS = /\b(?:stays?|stayed|waits?|waited|remains?|remained|lingers?|lingered|pauses?|paused|freezes?|froze|turns? back|turned back)\b/i;
const DASH_PLACE = /\b(?:to|into|toward|towards|through|across|onto|inside|past|around|beside|near|along|over|under|by|at)\s+(?:the|a|an|her|his|their|its|nicco|[A-Z])/;
function implicitFollows(clause: string, names: string, movable: readonly MovableCharacter[], descent: boolean, isArrival: (phrase: string) => boolean, antecedent?: MovableCharacter, niccoNamed = false): string | undefined {
  const pronoun = (token: string): string | undefined => {
    const hit = /^he$/i.test(token) ? undefined : byPronoun(movable, token), want = /^(?:her|she)$/i.test(token) ? "female" : /^(?:him|he|his)$/i.test(token) ? "male" : undefined;
    if (hit || !antecedent || !want || (antecedent.sex && antecedent.sex !== want) || (want === "male" && niccoNamed)) return hit;
    return antecedent.id;
  };
  const lead = new RegExp(`(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+|\\bas\\s+)(${names}|she|he)\\s+(?:(?:[a-z']+,?\\s+){1,3}?(?:and|then|and then)\\s+)?(?:\\w+ly\\s+)?${FOLLOW_VERB}\\b(.*)$`, "i");
  const steps = new RegExp(`(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+)(${names}|her|his)(?:'s)?\\s+(?:[a-z]+\\s+){0,2}?${STEP_NOUN}\\s+${STEP_VERB}\\b(.*)$`, "i");
  const below = new RegExp(`(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?(?:${COME_DOWN}|${APPEARS_BELOW})\\b(.*)$`, "i");
  const start = `(?:^${LEAD_IN}|^|\\band\\s+|\\bthen\\s+)`;
  const arrives = new RegExp(`${start}(${names})\\s+${ARRIVE_MANNER}${ARRIVE_VERB}\\s+(?:down\\s+(?:the\\s+(?:stairs?|steps|staircase|stairwell)\\s+)?)?(?:in)?to\\s+(.*)$`, "i");
  const descends = new RegExp(`${start}(${names})\\s+(?:\\w+ly\\s+)?(?:descends|descended)\\s+(?:the\\s+(?:stairs?|steps|staircase|stairwell))?(.*)$`, "i");
  const ducks = new RegExp(`${start}(${names})\\s+(?:ducks?|ducked)\\s+(?:\\w+ly\\s+)?(?:through|under)\\s+the\\s+\\w+\\s+at\\s+the\\s+(?:base|bottom|foot)\\s+of\\s+the\\s+(?:stairs?|steps|staircase|stairwell)(.*)$`, "i");
  const marked = new RegExp(`\\b(?:footfalls|footsteps|tread|treads|steps)\\s+marked\\s+(${names})'s\\s+(descent)\\b(.*)$`, "i");
  if (!ARRIVE_VETO.test(clause)) {
    for (const re of [arrives]) {
      const m = clause.match(re);
      if (!m) continue;
      const head = m[2]!.split(/,|\s*[—–]\s*|…|\s+(?:and|as|while|before|until|then)\s+/)[0]!.replace(/[.!…"”'\s]+$/, ""), rest = m[2]!.slice(head.length);
      const place = head.replace(ARRIVE_TAIL, "");
      if (!isArrival(place) || ARRIVE_STOPS.test(rest) || GATES.disqualify.test(rest) || GATES.follow_not_done.test(clause) || NOT_DONE.test(clause.slice(0, m.index! + m[0].length - m[2]!.length + place.length))) continue;
      const who = byName(movable, m[1]!);
      if (who) return who;
    }
    if (descent) for (const re of [descends, ducks, marked]) {
      const m = clause.match(re);
      if (!m) continue;
      const after = re === marked ? m[3]! : m[2]!, head = after.split(/,|\s*[—–]\s*|…|\s+(?:and|as|while|before|until|then)\s+/)[0]!.replace(/[.!…"”'\s]+$/, "");
      if (re !== ducks && !FOLLOW_TAIL.test(head.replace(ARRIVE_TAIL, "")) && head.trim()) continue;
      if (ARRIVE_STOPS.test(after.slice(head.length)) || DASH_PLACE.test(after.split(/\s*[—–]\s*|…/).slice(1).join(" ")) || GATES.disqualify.test(after) || GATES.follow_not_done.test(clause)) continue;
      const who = byName(movable, m[1]!);
      if (who) return who;
    }
  }
  for (const re of descent ? [lead, steps, below] : [lead, steps]) {
    const m = clause.match(re);
    if (!m) continue;
    const head = m[2]!.split(/,|\s*[—–]\s*|…|\s+(?:and|as|while|before|until|then)\s+/)[0]!, tail = head.replace(/[.!…"”'\s]+$/, "");
    // What trails the follow-manner words (after a comma, conjunction, dash or ellipsis) must not retract or stop it ("follows him — no, she
    // stays", "follows him, then stops at the top"); only a dash or ellipsis is additionally held to "no other destination". For the
    // DOWN-only forms that hold applies to a dash or ellipsis that directly ends the follow phrase (later scenery after a comma is not it).
    const rest = m[2]!.slice(head.length);
    const afterDash = re === below ? (/^\s*(?:[—–]|…)/.test(rest) ? rest.replace(/^\s*(?:[—–]|…)\s*/, "").split(/,|\s*[—–]\s*|…/)[0]! : "") : m[2]!.split(/\s*[—–]\s*|…/).slice(1).join(" ");
    if (!FOLLOW_TAIL.test(tail) || DASH_PLACE.test(afterDash) || DASH_RETRACTS.test(rest) || GATES.disqualify.test(rest) || GATES.follow_not_done.test(clause)) continue;
    const token = /^his$/i.test(m[1]!) ? "him" : m[1]!;
    return byName(movable, token) ?? pronoun(token);
  }
  return undefined;
}

/**
 * Debt closure D-11: bounded pronoun antecedent. A pronoun-led follow ("She came down after him") resolves to the ONE movable character
 * named in the previous sentence or earlier in the same sentence (quotes included, so an addressee counts as a competitor), and only when
 * the previous sentence is not itself a refusal, stay or hesitation (DASH_RETRACTS and refusal words). Two movable names in that window ("Brenna looks at Maren. She follows
 * him.") leave the pronoun unresolved; "he" additionally fails when Nicco is named in the window. No general coreference.
 */
function boundedAntecedent(previous: string | undefined, current: string, movable: readonly MovableCharacter[]): { antecedent?: MovableCharacter; nicco: boolean } {
  const scope = `${previous ?? ""} ${current}`, named = (n: string) => new RegExp(`\\b${esc(n)}(?:'s)?\\b`, "i").test(scope);
  const hits = movable.filter(m => m.names.some(named)), nicco = named("Nicco");
  if (hits.length !== 1 || (previous && (DASH_RETRACTS.test(previous) || /\b(?:refus\w+|declin\w+|hesitat\w+|shook (?:her|his) head)\b/i.test(previous)))) return { nicco };
  return { antecedent: hits[0]!, nicco };
}
/**
 * Completed movements of movable characters narrated this turn (at most one per character, first wins). `followers` (NPC+ Pass 9):
 * active NPC+ eligible for implicit-destination following — only when Nicco moved, only if not already at his arrival.
 */
export function narratedMovements(narration: string, movable: readonly MovableCharacter[], where: { readonly origin: string; readonly arrival: string; readonly locate?: (id: string) => string | undefined;
  /** Audit only (D-24): `arrival` is where the NARRATION says Nicco went but state did not take him. Reads the dependent follow forms, route-free and direction-agnostic. */
  readonly hypothetical?: boolean }, context: TurnContext, world: WorldStore,
  followers: ReadonlySet<string> = new Set()): CharacterMovement[] {
  if (!movable.length) return [];
  const names = movable.flatMap(m => m.names).map(esc).join("|");
  const local = movable.filter(m => !m.entrant); // an entrant (elsewhere/off-scene) is never a pronoun referent, a follower or a leaver
  const who = (token: string, subject: boolean) => byName(movable, token) ?? (subject && /^he$/i.test(token) ? undefined : byPronoun(local, token)); // subject "he" is usually Nicco
  const placeOf = (id: string) => where.locate ? where.locate(id) : where.origin;
  const entrantOk = (id: string, location: string) => !movable.some(m => m.id === id && m.entrant) || location === where.arrival;
  /** Never invent geography: a mover whose own location is known needs a structured route to the destination. */
  const routed = (id: string, location: string) => { if (where.hypothetical) return true; const here = placeOf(id); return !here || here === location || !!findRoute(world, here, location); };
  const patterns: readonly { readonly re: RegExp; readonly mover: number; readonly dest: number; readonly subject: boolean }[] = [
    { re: new RegExp(`\\b${CARRY}\\s+(${names}|her|him)\\b[^.;]*?\\b${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: false },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:(?:him|nicco|after him|behind him|back|close behind)\\s+)*${STAIRS}${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: true },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:is|was)\\s+(?:carried|brought|led)\\s+${TO}\\s+([^.;,]+)`, "i"), mover: 1, dest: 3, subject: true },
    { re: new RegExp(`\\b(?:reach|reaches|reached|arrive at|arrives at|arrived at|enter|enters|entered)\\s+([^,.;]+?),?\\s+(?:with\\s+)?(${names}|her|him)\\s+(?:still\\s+)?${HELD}`, "i"), mover: 2, dest: 1, subject: false },
    { re: new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:him\\s+|nicco\\s+)?(inside|in)(?=\\s*(?:[,.;!?…—–]|$|\\s+(?:and|then|after|behind|as|while)\\b))`, "i"), mover: 1, dest: 2, subject: true },
  ];
  const out: CharacterMovement[] = [];
  // Follow-recognition closure: DOWN-only follow forms need Nicco's same-turn route to be a proven descent (UNKNOWN/OTHER fail closed).
  const descent = where.origin !== where.arrival && followers.size > 0 && (where.hypothetical || routeDirection(world, where.origin, where.arrival) === "DOWN");
  const sentences = sentencesOf(narration);
  for (const [at, sentence] of sentences.entries()) {
    const plain = blankQuotes(sentence).trim();
    const { antecedent, nicco } = boundedAntecedent(sentences[at - 1], sentence, movable);
    for (const clause of plain.split(/;|,\s*(?:but|while|though|although)\s+|\s+but\s+/)) {
      for (const p of patterns) {
        const m = clause.match(p.re);
        if (!m || NOT_DONE.test(clause.slice(0, m.index! + m[0].length)) || ARRIVE_VETO.test(clause)) continue;
        const id = who(m[p.mover]!, p.subject);
        const location = id ? concreteDestination(m[p.dest]!, where.arrival, where.origin, context, world) ?? (movable.some(x => x.id === id && x.entrant) && /^(?:inside|in)$/i.test(m[p.dest]!.trim()) ? where.arrival : undefined) : undefined;
        if (id && location && entrantOk(id, location) && routed(id, location) && !out.some(o => o.character_id === id)) out.push({ character_id: id, location_id: location, source_sentence: sentence });
      }
      // A bare vertical direction ("goes upstairs"): only the unique structured neighbour in that direction, from the mover's OWN location.
      const bare = clause.match(new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(up|down)(?:stairs|\\s+the(?:\\s+[a-z]+)?\\s+(?:stairs|steps|staircase))?(?=\\s*(?:[.;!?]|$)|\\s+(?:and|then|as|while)\\b|,\\s+(?:and|then|as|while|[a-z]+ing)\\b)`, "i"))
        ?? clause.match(new RegExp(`(?:^|\\band\\s+)(${names}|she|he)\\s+(?:\\w+ly\\s+)?${WALK}\\s+(?:(up|down)stairs)(?=\\s*(?:[.;!?]|$)|\\s+(?:and|then|as|while)\\b|,\\s+(?:and|then|as|while|[a-z]+ing)\\b)`, "i"));
      if (bare && !NOT_DONE.test(clause.slice(0, bare.index! + bare[0].length)) && !ARRIVE_VETO.test(clause) && !ARRIVE_STOPS.test(clause)) {
        const id = who(bare[1]!, true), here = id ? placeOf(id) : undefined;
        const location = id && here ? uniqueVerticalNeighbour(world, here, bare[2]!.toLowerCase() === "up" ? "UP" : "DOWN") : undefined;
        if (id && location && entrantOk(id, location) && !out.some(o => o.character_id === id)) out.push({ character_id: id, location_id: location, source_sentence: sentence });
      }
      if (where.origin === where.arrival || !followers.size) continue;
      const follower = implicitFollows(clause, names, local, descent, phrase => !!phrase.trim() && concreteDestination(phrase, where.arrival, where.origin, context, world) === where.arrival, antecedent, nicco);
      if (follower && followers.has(follower) && (where.hypothetical || !context.characters.some(c => c.id === follower)) && !out.some(o => o.character_id === follower))
        out.push({ character_id: follower, location_id: where.arrival, source_sentence: sentence });
    }
  }
  return out;
}
