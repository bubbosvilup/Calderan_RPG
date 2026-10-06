import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import type { NaturalAction, NaturalActionResolution } from "./natural-actions.js";
import { reachable } from "./travel-resolution.js";
import { blankQuotes, sentencesOf } from "./language/text.js";
import { GATES } from "./language/gates.js";

/** Player-only reference: never installed as a global/NPC alias. */
export const PLAYER_HOME_LOCATION = "heartstone";
export const locationLabel = (text: string) => text.trim().replace(/[.!]+$/, "").replace(/^the\s+/i, "").toLowerCase();
/** Complete labels only. No mentions, feature heads, fuzzy matching or final-token inference. */
export function playerDestination(phrase: string, world: WorldStore): string | undefined {
  if (locationLabel(phrase) === "home") {
    const home = world.getEntity(PLAYER_HOME_LOCATION);
    return home?.type === "location" && home.knowledge?.visibility.player && home.knowledge.visibility.narrator ? PLAYER_HOME_LOCATION : undefined;
  }
  const matches = world.getEntitiesByType("location").filter(e => e.knowledge?.visibility.player && e.knowledge.visibility.narrator
    && [e.id, e.name, e.display_name, ...e.aliases].some(n => locationLabel(n) === locationLabel(phrase)));
  if (matches.length) return matches.length === 1 ? matches[0]!.id : undefined;
  // Complete multiword suffix label, e.g. "Slave Market" for "Calderan Slave Market".
  // Never a feature or a one-word head such as market, tower, room or clerk.
  const label = locationLabel(phrase);
  if (label.split(/\s+/).length < 2) return undefined;
  const short = world.getEntitiesByType("location").filter(e => e.knowledge?.visibility.player && e.knowledge.visibility.narrator
    && [e.name, e.display_name].some(n => locationLabel(n).endsWith(` ${label}`)));
  return short.length === 1 ? short[0]!.id : undefined;
}
const VERB = "(?:go|goes|went|going|walks?|walked|walking|heads?|headed|heading|returns?|returned|returning|travels?|travell?ed|travelling|traveling|runs?|ran|running|hurr(?:y|ies|ied|ying)|strolls?|strolled|strolling|wanders?|wandered|wandering|steps?|stepped|climbs?|climbed|moves?|moved|crosses|crossed|makes? (?:my|his|our) way|made (?:my|his|our) way)";
const MOVE = new RegExp(`^${VERB}\\s+(?:back\\s+)?(?:(?:over|up|down|out|across|downstairs|upstairs)(?:\\s+the\\s+(?:stairs|steps|staircase))?\\s+)?(?:with\\s+(.+?)\\s+)?(?:together\\s+)?(?:(?:to|into|inside|in to|through|towards?)\\s+(.+)|((?:the\\s+)?home))$`, "i");
const TAIL = /\s+(?:with\s+.+|alone|together|now|again|quickly|at once|right away|by myself|looking\b.*|searching\b.*|hoping\b.*|to (?:buy|see|find|look|purchase)\b.*|while\b.*)$/i;
/** One bounded player-inclusive travel act per turn. Group wording grants no NPC authority. */
export function resolvePlayerTravel(input: string, here: string, context: TurnContext, world: WorldStore): Pick<NaturalActionResolution, "actions" | "runtime" | "notes"> {
  const acts: { clause: string; phrase: string; destination?: string }[] = [];
  // Protect coordinated subjects before clause splitting; only a uniquely present named actor qualifies.
  const protectedText = blankQuotes(input).replace(/\bNicco\s+and\s+(.+?)\s+(?=(?:walk|go|head|return|travel)\b)/gi, (whole, actor: string) => {
    const found = context.characters.filter(c => c.id !== "nicco" && c.current.current_location === here && [c.profile.name, ...(c.profile.aliases ?? [])].some(n => n && locationLabel(n) === locationLabel(actor)));
    return found.length === 1 ? "Nicco " : whole.replace(/\s+and\s+/i, " & ");
  });
  const segments = [...protectedText.matchAll(/\*([^*]+)\*/g)].map(m => ({ text: m[1]!, action: true }));
  segments.push({ text: protectedText.replace(/\*[^*]*\*/g, " "), action: false });
  for (const segment of segments) for (const sentence of sentencesOf(segment.text)) {
    if (GATES.player_movement_not_done.test(sentence) || /\?|\b(?:tell|tells|told|ask|asks|asked|order|orders|ordered)\b/i.test(sentence)) continue;
    let continuing = segment.action;
    for (const [index, raw] of sentence.split(/;|,\s*(?:and then\s+|and\s+|then\s+)?|\s+(?:and then|then|and|when|before|after)\s+/i).entries()) {
      let clause = raw.trim().replace(/[.!]+$/, "");
      const subject = clause.match(/^(?:i|nicco|we|let['’]?s|let us|they both|he)\s+/i);
      if (subject) { continuing = /^(?:i|let)/i.test(subject[0]); clause = clause.slice(subject[0].length); }
      else if ((!continuing && index > 0) || !continuing && !new RegExp(`^${VERB}\\b`, "i").test(clause)) { continuing = false; continue; }
      clause = clause.replace(/^(?:then|also|quietly|slowly|just|finally)\s+/i, "");
      const m = clause.match(MOVE);
      if (!m) { if (!subject && !/^leave\b/i.test(clause)) continuing = false; continue; }
      let phrase = (m[2] ?? m[3]!).trim();
      while (TAIL.test(phrase)) phrase = phrase.replace(TAIL, "").trim();
      const destination = playerDestination(phrase, world);
      continuing = true;
      acts.push({ clause: raw.trim(), phrase, ...(destination ? { destination } : {}) });
    }
  }
  const stay = `Nicco remains at ${world.getEntity(here)?.display_name ?? here}; he has not arrived elsewhere; no player travel was committed. Do not narrate an arrival elsewhere.`;
  if (acts.length > 1) return { actions: acts.map(a => ({ clause: a.clause, kind: "movement", status: "ambiguous", detail: { phrase: a.phrase, reason: "multiple_travel_acts" } })), runtime: [], notes: [stay] };
  const act = acts[0];
  if (!act) return { actions: [], runtime: [], notes: [] };
  const intention = act.clause.match(/\b(?:looking|searching|hoping)\s+(?:for|to)\b[^,]*|\bto\s+(?:buy|purchase|sell)\b[^,]*/i);
  const intentions: NaturalAction[] = intention ? [{ clause: act.clause, kind: "intention", status: "no_state_effect", detail: { text: intention[0] } }] : [];
  const action = (status: NaturalAction["status"], detail: Record<string, unknown>): NaturalAction => ({ clause: act.clause, kind: "movement", status, detail: { phrase: act.phrase, ...detail } });
  if (!act.destination) return { actions: [...intentions, action("unresolved", { reason: "unknown_or_ambiguous_destination" })], runtime: [], notes: [stay] };
  const route = reachable(act.destination, here, world);
  if (act.destination === here || route.target === here || world.getAncestors(here).some(a => a.id === act.destination) && !route.target)
    return { actions: [...intentions, action("no_state_effect", { destination: act.destination, reason: "already_here" })], runtime: [], notes: [] };
  if (!route.target) return { actions: [...intentions, action("blocked", { destination: act.destination, reason: "no_travel_connection", from: here })], runtime: [], notes: [`No route to ${world.getEntity(act.destination)?.display_name ?? act.destination} is established. ${stay}`] };
  return { actions: [...intentions, action("resolved", { destination: act.destination, target: route.target, via_container: !!route.via_container, route: route.route })],
    runtime: [{ kind: "runtime_delta", delta: { player_location: route.target, time_advance_minutes: route.route!.minutes } }], notes: [] };
}
