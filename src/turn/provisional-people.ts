import type { CampaignCharacter, CharacterOriginSnapshot, NameSource } from "../campaign/types.js";
import { buildPromotedCharacter } from "../campaign/promotion.js";
import { establishedFacts, type NarratedPerson } from "./narrated-captives.js";

/**
 * Block 5B (AUTH-2): the PROVISIONAL person. Narration may introduce people and may even name them; that alone is NOT persistence authority.
 * A provisional person is a scene-local identity that is never a CampaignCharacter and owns nothing durable (no ownership, legal state,
 * household, trade history or NPC+). It is not stored: it is the deterministic reading of the finalized exchange window (`readScene`), keyed by a
 * stable `ref` (`narrated:<name|noun>`, or the linked ephemeral scene participant's id), so the SAME person referred to again in the same
 * interaction resolves to the SAME ref and never to a second record.
 *
 * Becoming persistent (materialization) happens only inside an action that already has explicit authority and needs a durable person; today that is
 * the person Actual Offer Accept (src/turn/person-offers.ts plans the register command, settled atomically with the purchase). Nothing else materializes.
 *
 * Boundary (PER-2 stays separate): provisional identity is NOT saved. After a reload, or once the person leaves the recent-exchange window, they
 * are simply absent: no CampaignCharacter is created, no duplicate can appear, and a later narration may introduce them again.
 */
export interface ProvisionalPerson {
  readonly ref: string;
  readonly label: string;
  /** The established name, when narration (or the person) gave one. Naming never materializes. */
  readonly name?: string;
  readonly name_source?: NameSource;
  readonly noun?: string;
  readonly location_id: string;
  readonly captive: boolean;
  /** Facts narration established about them (appearance, sex, age, ...; never invented) and the verbatim source sentences. */
  readonly established: CharacterOriginSnapshot["established"];
  readonly evidence: readonly string[];
  /** The ephemeral scene participant this person is linked to, when the player addressed them. */
  readonly participant_id?: string;
}

/** How a provisional person's name was learned (their own self-introduction wins; else narration's voice; else another speaker's quote). */
export function nameSourceOf(p: NarratedPerson): NameSource | undefined {
  const other = (speaker?: string) => !!speaker && speaker !== "nicco" && !p.keys.includes(speaker);
  if (p.introductions.some(i => i.kind === "self")) return "self_disclosed";
  if (p.introductions.some(i => i.kind === "pattern" && i.narration_voice)) return "narrator_introduced";
  if (p.introductions.some(i => i.kind === "pattern" && other(i.speaker))) return "introduced_by_other";
  return undefined;
}
export interface MaterializeInput {
  readonly person: NarratedPerson;
  readonly label: string;
  /** The speaker key of a seller who described this person (only that seller's words donate background claims). */
  readonly seller_key?: string;
  readonly name_of: (id: string) => string;
  readonly keep_claim?: (text: string) => boolean;
  readonly role?: string;
  readonly location_id: string;
  readonly trigger: CharacterOriginSnapshot["trigger"];
  /** The revision the authorizing action commits at minus one (the character is recorded at `base_revision + 1`). */
  readonly base_revision: number;
  readonly world_minute: number;
  readonly ephemeral_ref: string;
  readonly name_source?: NameSource;
}
/**
 * THE single builder of the minimum durable character from a provisional person (materialization). It preserves the SAME logical person: the
 * established name, the facts narration established (never invented), where they stand, the ephemeral ref as provenance, and the evidence. It
 * adds no personality, relationship or household role. It is only ever called by an action that already carries explicit authority
 * (today: the person Actual Offer plan, settled by the player's Accept); the result is a COMMAND payload, not a state change.
 */
export function materializeProvisional(i: MaterializeInput): CampaignCharacter {
  const facts = establishedFacts(i.person, i.seller_key, i.name_of, i.keep_claim);
  return buildPromotedCharacter({ label: i.label, established: { ...facts.established, ...(i.role ? { role: i.role } : {}) }, evidence: facts.evidence, location_id: i.location_id, trigger: i.trigger,
    promoted_revision: i.base_revision + 1, world_minute: i.world_minute, ephemeral_ref: i.ephemeral_ref, ...(i.name_source ? { name_source: i.name_source } : {}) });
}
