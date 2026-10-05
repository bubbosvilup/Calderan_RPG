import type { TurnContext } from "./context-builder.js";
import { escapeRegExp } from "./language/text.js";
import { canonicalInteractionTargets } from "./canonical-interaction-targets.js";

/**
 * Ephemeral scene participants (Phase 1P): session-local people who exist in the current scene but are not CampaignState
 * characters (a passer-by, a street merchant, an unnamed guard). They are never persisted, never promoted automatically and
 * never create durable mutations; they exist so every character who may speak has a narrator-facing knowledge scope and a
 * minimal continuity record. Creation comes only from the resolved player input (deterministic), never from the controller.
 *
 * Adopted rules:
 * - IDs: scene_npc_<n>, a per-session counter that is never reused. No randomness.
 * - Creation: an interaction verb plus an indefinite role phrase in the player input ("stops an ordinary passer-by"). A definite
 *   phrase ("the guard") addresses an existing participant with that role or noun, or creates one if none exists.
 * - Addressing: a definite reference; or, when nobody else is referenced or named, direct speech/second person continues the
 *   current conversation partner (continuity is preferred over silently creating a new person).
 * - Expiry: scene change; a narrated departure followed by a turn that does not address them; or no address for
 *   INACTIVE_EXPIRY_TURNS consecutive turns.
 * - Capacity: MAX_SCENE_PARTICIPANTS. On overflow the least recently addressed participant not addressed this turn is evicted
 *   (lowest last-addressed turn, then lowest ID); if none is evictable, no participant is created (fail safe).
 * - Continuity: only a narrated appositive after the role ("The passer-by, a middle-aged woman, ...") is captured, first one wins.
 *   Otherwise only the role is kept. Incorrect metadata is worse than sparse metadata.
 */
export const MAX_SCENE_PARTICIPANTS = 4;
export const INACTIVE_EXPIRY_TURNS = 2;

/** ordinary_local: generic local role, may use public and local:<ancestor> canon. foreign: public only. unknown: public only. */
export type ParticipantStanding = "ordinary_local" | "foreign" | "unknown";
export interface EphemeralSceneParticipant {
  readonly id: string; readonly ref: string; readonly role: string; readonly display_name: string;
  readonly descriptor?: string; readonly standing: ParticipantStanding;
  /** Scene location at creation plus its containment ancestry (captured, not re-derived). */
  readonly location_id: string; readonly locality: readonly string[];
  readonly created_turn: number; readonly last_addressed_turn: number; readonly departed: boolean;
}
export interface SceneParticipantPlan {
  readonly turn: number; readonly participants: readonly EphemeralSceneParticipant[]; readonly focus: string | null;
  readonly created: string | null; readonly addressed: readonly string[]; readonly expired: readonly string[];
  /** Canonical partner continuity is session-local; names remain authoritative in CampaignState knowledge. */
  readonly canonical_location_id?: string;
}

interface RoleSpec { readonly pattern: string; readonly role: string; readonly label?: string; readonly standing: ParticipantStanding }
const ROLES: readonly RoleSpec[] = [
  { pattern: "passer-?by|passersby|passers-by|pedestrian", role: "passer_by", label: "Passer-by", standing: "ordinary_local" },
  { pattern: "citizen|townsman|townswoman|resident|local", role: "citizen", label: "Citizen", standing: "ordinary_local" },
  { pattern: "customer|shopper", role: "customer", label: "Customer", standing: "ordinary_local" },
  { pattern: "merchant|vendor|stallholder|trader|peddler|hawker|shopkeeper", role: "street_merchant", label: "Merchant", standing: "ordinary_local" },
  { pattern: "waiter|waitress|server|barmaid|barkeep|innkeeper", role: "waiter", label: "Waiter", standing: "ordinary_local" },
  { pattern: "laborer|labourer|worker|porter|dockworker", role: "laborer", label: "Laborer", standing: "ordinary_local" },
  { pattern: "guard|guardsman|watchman", role: "guard", label: "Guard", standing: "ordinary_local" },
  { pattern: "man|woman|boy|girl|child|person", role: "person", standing: "ordinary_local" },
  { pattern: "slave|servant", role: "slave", label: "Slave", standing: "unknown" },
  { pattern: "stranger", role: "stranger", label: "Stranger", standing: "unknown" },
  { pattern: "traveler|traveller|foreigner|newcomer|visitor|pilgrim|tourist", role: "traveler", label: "Traveler", standing: "foreign" },
];
const ROLE_ALT = ROLES.map(r => r.pattern).join("|");
const FOREIGN = /\b(?:foreign|visiting|travell?ing|newly arrived|out-of-town|from abroad)\b/i;
/**
 * Interaction verbs with explicit morphology (Phase 1S): base, -s, -ed/irregular past and -ing forms, plus a particle.
 * Only these verbs create participants; arbitrary verbs never do.
 */
const VERB_FORMS: readonly (readonly [readonly string[], string])[] = [
  [["stop", "stops", "stopped", "stopping"], ""], [["approach", "approaches", "approached", "approaching"], ""],
  [["greet", "greets", "greeted", "greeting"], ""], [["hail", "hails", "hailed", "hailing"], ""],
  [["address", "addresses", "addressed", "addressing"], ""], [["ask", "asks", "asked", "asking"], ""],
  [["talk", "talks", "talked", "talking"], " to"], [["speak", "speaks", "spoke", "speaking"], " to"],
  [["turn", "turns", "turned", "turning"], "(?: back)? to"], [["call", "calls", "called", "calling"], "(?: out)? to"],
  [["wave", "waves", "waved", "waving"], " (?:at|to)"], [["tap", "taps", "tapped", "tapping"], ""], [["nudge", "nudges", "nudged", "nudging"], ""],
  [["flag", "flags", "flagged", "flagging"], " down"], [["walk", "walks", "walked", "walking"], " up to"], [["go", "goes", "went", "going"], " up to"],
  [["point", "points", "pointed", "pointing"], " at"], [["look", "looks", "looked", "looking"], " at"], [["face", "faces", "faced", "facing"], ""],
  [["follow", "follows", "followed", "following"], ""], [["catch", "catches", "caught", "catching"], ""],
];
const VERB = `(?:${VERB_FORMS.map(([forms, particle]) => `(?:${forms.join("|")})${particle}`).join("|")})`;
/**
 * Player-authored scene setup where the temporary person is the grammatical subject acting on Nicco (Phase 1S):
 * "a guard stops him", "a merchant calls out to him", "a passer-by bumps into him". Only ever applied to player input.
 */
const NPC_VERB = "(?:stops|stopped|approaches|approached|addresses|addressed|hails|hailed|greets|greeted|calls(?: out)? to|called(?: out)? to|bumps into|bumped into|blocks|blocked|confronts|confronted|grabs|grabbed|steps in front of|stepped in front of|waves at|waved at|speaks to|spoke to|shouts at|shouted at|walks up to|walked up to)";
const NPC_SUBJECT = new RegExp(`\\b(an?|one|another|some)\\s+((?:[a-z][a-z'-]*,?\\s+){0,3}?)(${ROLE_ALT})\\s+${NPC_VERB}\\s+(?:him|nicco|me)\\b`, "gi");
const INTRO = new RegExp(`\\b${VERB}\\s+(an?|one|another|some|the|that|this|same)\\s+((?:[a-z][a-z'-]*,?\\s+){0,3}?)(${ROLE_ALT})\\b`, "gi");
/** Phase 1R: remove participant-introduction phrases ("stops an ordinary passer-by") from text used as a retrieval query. */
export function stripParticipantIntroductions(text: string): string { return text.replace(INTRO, " ").replace(NPC_SUBJECT, " "); }
const DEFINITE = (noun: string) => new RegExp(`\\b(?:the|that|this|same)\\s+(?:[a-z][a-z'-]*\\s+){0,2}?${noun}\\b`, "i");
const PERSON_NOUN = "woman|man|girl|boy|youth|lad|lass|elder|matron|crone|dwarf|elf|human";
const DEPART = /\b(?:hurr(?:y|ies|ied)|walk(?:s|ed)?|mov(?:es|ed)|continu(?:es|ed)|go(?:es)?|went|head(?:s|ed)|slip(?:s|ped)?|strides?|strode|steps?|stepped|turn(?:s|ed)?)\b[^.!?]{0,50}?\b(?:away|off|past|onward|on (?:her|his|their) (?:way|path)|down the|into the crowd|out of sight|around the corner|gone)\b|\b(?:leaves|left|departs|departed|disappears|disappeared|vanishes|vanished|is gone)\b/i;

const specFor = (noun: string) => ROLES.find(r => new RegExp(`^(?:${r.pattern})$`, "i").test(noun))!;
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** Nouns that refer to this participant: its role (a generic person only by its own noun) and its established descriptor noun. */
const nounsOf = (p: EphemeralSceneParticipant) => [p.role === "person" ? p.display_name.toLowerCase() : ROLES.find(r => r.role === p.role)!.pattern, ...(p.descriptor ? [p.descriptor.split(/\s+/).at(-1)!] : [])];

/**
 * Stable replay label (Phase 1Q): the single participant, already existing at `turn`, that a speaker noun ("passer-by",
 * "woman") refers to. Ambiguous or unknown nouns return undefined so callers keep their generic label.
 */
export function participantForNoun(noun: string, participants: readonly EphemeralSceneParticipant[], turn: number): EphemeralSceneParticipant | undefined {
  const matches = participants.filter(p => p.created_turn <= turn && nounsOf(p).some(n => new RegExp(`^(?:${n})$`, "i").test(noun)));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Session-local registry, one per campaign session (held by the coordinator beside RecentConversation). */
export class SceneParticipants {
  #list: EphemeralSceneParticipant[] = [];
  #next = 1;
  #turn = 0;
  #focus: string | null = null;
  #focusLocation: string | null = null;
  active(): readonly EphemeralSceneParticipant[] { return Object.freeze([...this.#list]); }

  /** Deterministic pre-narration plan. Nothing changes until commit(); a failed turn simply discards the plan. */
  plan(input: string, context: TurnContext): SceneParticipantPlan {
    const turn = this.#turn + 1, location = context.primary.scene.player_location?.id ?? "unestablished";
    const locality = [location, ...context.primary.scene.location_ancestry.map(a => a.id)];
    const carried = this.#list.filter(p => p.location_id === location);
    const expired = this.#list.filter(p => p.location_id !== location).map(p => p.id);
    const text = input.toLowerCase();
    const canonicalTargets = canonicalInteractionTargets(context, input);
    const addressed = new Set<string>(canonicalTargets);
    if (!canonicalTargets.size) for (const p of carried) if (nounsOf(p).some(n => DEFINITE(`(?:${n})`).test(text))) addressed.add(p.id);
    let created: EphemeralSceneParticipant | undefined;
    // Persistence Pass 1.2: a definite reference ("the slave", "the girl") to a present persistent person who began as a narrator-
    // created person is that person, never a new temporary participant.
    const covered = new Set(context.characters.flatMap(c => {
      const o = c.established_origin;
      return o ? [o.descriptor, /\b(?:enslaved|captive)\b/.test(o.role ?? "") ? "slave" : undefined, o.label.startsWith("the ") ? o.label.slice(4) : undefined].filter((x): x is string => !!x) : [];
    }));
    for (const m of [...input.matchAll(INTRO), ...input.matchAll(NPC_SUBJECT)].sort((a, b) => a.index - b.index)) {
      const article = m[1]!.toLowerCase(), adjectives = m[2] ?? "", noun = m[3]!.toLowerCase(), spec = specFor(noun);
      // The same observable actor already exists in canon. Never create a second generic identity.
      // "another"/"some"/"one" explicitly establish a distinct person, regardless of overlapping appearance.
      if (!["another", "some", "one"].includes(article) && canonicalTargets.size === 1
        && canonicalInteractionTargets(context, m[0]).size === 1) continue;
      if (["the", "that", "this", "same"].includes(article) && covered.has(noun)) continue;
      if (["the", "that", "this", "same"].includes(article) && carried.some(p => addressed.has(p.id) && nounsOf(p).some(n => new RegExp(`^(?:${n})$`, "i").test(noun)))) continue;
      const id = `scene_npc_${this.#next}`;
      created = { id, ref: `P${this.#next}`, role: spec.role, display_name: spec.label ?? capital(noun), standing: FOREIGN.test(adjectives) ? "foreign" : spec.standing,
        location_id: location, locality, created_turn: turn, last_addressed_turn: turn, departed: false };
      break; // one introduction per turn keeps identity unambiguous
    }
    const namesPersistent = context.characters.some(c => c.id !== "nicco" && new RegExp(`\\b${escapeRegExp(c.profile.name ?? c.id)}\\b`, "i").test(input));
    const explicitPerson = [...input.matchAll(INTRO), ...input.matchAll(NPC_SUBJECT)].length > 0;
    const shifted = /\b(?:walk\w*|go(?:es|ing)?|move\w*|return\w*|join\w*|turn\w*|look\w*|focus\w*|wait\w*)\b/i.test(input);
    const canonicalPartner = this.#focusLocation === location && context.characters.some(c => c.id === this.#focus);
    if (!created && !addressed.size && !namesPersistent && !explicitPerson && !shifted && this.#focus
      && (canonicalPartner || carried.some(p => p.id === this.#focus))
      && (/["“]/.test(input) || /\b(?:you|your)\b/i.test(input) || /who am i (?:speaking|talking) (?:with|to)/i.test(input))) addressed.add(this.#focus);
    let kept = carried.filter(p => {
      if (addressed.has(p.id)) return true;
      if (p.departed || turn - p.last_addressed_turn >= INACTIVE_EXPIRY_TURNS) { expired.push(p.id); return false; }
      return true;
    }).map(p => addressed.has(p.id) ? { ...p, last_addressed_turn: turn } : p);
    if (created) {
      while (kept.length >= MAX_SCENE_PARTICIPANTS) {
        const victim = kept.filter(p => !addressed.has(p.id)).sort((a, b) => a.last_addressed_turn - b.last_addressed_turn || Number(a.id.slice(10)) - Number(b.id.slice(10)))[0];
        if (!victim) { created = undefined; break; }
        expired.push(victim.id); kept = kept.filter(p => p.id !== victim.id);
      }
    }
    const participants = created ? [...kept, created] : kept;
    const canonicalFocus = !created && addressed.size === 1 && context.characters.some(c => c.id === [...addressed][0] && c.id !== "nicco") ? [...addressed][0]! : null;
    const focus = created?.id ?? canonicalFocus ?? [...addressed].find(id => participants.some(p => p.id === id)) ?? null;
    return Object.freeze({ turn, participants: Object.freeze(participants.map(p => Object.freeze(p))), focus, created: created?.id ?? null, addressed: Object.freeze([...addressed]), expired: Object.freeze(expired), ...(canonicalFocus ? { canonical_location_id: location } : {}) });
  }

  /** Persistence Pass 1.2: participants who became persistent characters leave the temporary registry (no duplicate identity). */
  retire(ids: readonly string[]): readonly EphemeralSceneParticipant[] {
    if (ids.length) { this.#list = this.#list.filter(p => !ids.includes(p.id)); if (this.#focus && ids.includes(this.#focus)) this.#focus = null; }
    return this.active();
  }
  /** Apply a finalized turn: capture a conservative descriptor and a departure beat for the conversation partner. */
  commit(plan: SceneParticipantPlan, narration: string): readonly EphemeralSceneParticipant[] {
    this.#list = plan.participants.map(p => {
      if (p.id !== plan.focus) return p;
      const role = nounsOf(p)[0]!;
      const appositive = p.descriptor ? undefined : narration.match(new RegExp(`\\b(?:the|a|an)\\s+(?:${role})\\s*(?:,|—|–|\\s-\\s)\\s*(?:a|an)\\s+((?:[a-z][a-z'-]*,?\\s+){0,2}?(?:${PERSON_NOUN}))\\b`, "i"))?.[1]?.replace(/,/g, "").replace(/\s+/g, " ").toLowerCase();
      const subject = `(?:she|he|they|the\\s+(?:${nounsOf(p).join("|")}))`;
      const departed = narration.split(/(?<=[.!?])\s+/).some(s => DEPART.test(s) && new RegExp(`\\b${subject}\\b`, "i").test(s.slice(0, s.search(DEPART) + 1)));
      const standing = appositive && FOREIGN.test(appositive) ? "foreign" : p.standing;
      return Object.freeze({ ...p, ...(appositive ? { descriptor: appositive } : {}), standing, departed });
    });
    const used = plan.created ? Number(plan.created.slice(10)) + 1 : this.#next;
    this.#next = Math.max(this.#next, used);
    this.#turn = plan.turn; this.#focus = plan.focus;
    this.#focusLocation = plan.canonical_location_id ?? plan.participants.find(p => p.id === plan.focus)?.location_id ?? null;
    return this.active();
  }
}

/** Narrator-facing continuity block. Never names implementation IDs. */
export function renderSceneParticipants(plan: SceneParticipantPlan | undefined, context: TurnContext): string | null {
  if (!plan?.participants.length) return null;
  const place = (ids: readonly string[]) => context.primary.scene.location_ancestry.find(a => ids.includes(a.id) && a.id !== ids[0])?.display_name;
  const lines = plan.participants.map(p => {
    const standing = p.standing === "ordinary_local" ? `ordinary local${place(p.locality) ? ` of ${place(p.locality)}` : ""}` : p.standing === "foreign" ? "not local" : "origin unestablished";
    return `${p.ref} - ${p.display_name}${p.id === plan.focus ? " (current conversation partner)" : ""}. Temporary; ${standing}.${p.role === "guard" ? " Affiliation unestablished (a generic guard, not by default a member of any canonical body)." : ""}${p.descriptor ? ` Established: ${p.descriptor}.` : ""}`;
  });
  return `[SCENE PARTICIPANTS]\nTemporary people in this scene, not persistent characters. Keep established details; anything not listed (name, occupation, history, appearance) is unestablished and must not contradict earlier narration of the same person.\n${lines.join("\n")}`;
}
