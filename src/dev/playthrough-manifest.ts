import type { CampaignCommand } from "../campaign/types.js";
export interface CuratedLabel { readonly row: number; readonly category: string; readonly interpretation: string; readonly expected: readonly CampaignCommand[]; readonly notes: string; readonly evaluation_suitability: readonly string[] }
const label = (row: number, category: string, interpretation: string, notes: string, expected: readonly CampaignCommand[] = []): CuratedLabel => ({ row, category, interpretation, notes, expected, evaluation_suitability: row === 39 ? ["state_gold"] : row === 115 ? ["state_gold", "narrative_gold"] : [43, 53, 169, 171, 173].includes(row) ? ["narrative_gold", "mixed"] : ["context_dependent", "mixed"] });
/** Explicit agent-authored labels after reading each source pair. Human ratification remains separate. */
export const CURATED_LABELS: readonly CuratedLabel[] = [
  label(3, "pure_dialogue", "Look around; no durable mutation.", "Old market prose is not imported into canon."),
  label(11, "character_continuity", "Observe illness and physique; no profile writes.", "Established fixture traits override historical physical description."),
  label(25, "equipment", "Ring is placed on a finger; exact slot remains unestablished.", "No invented finger/slot ID; conservative no-op under current vocabulary."),
  label(35, "player_agency", "Request supplies; no explicit player destination.", "Old response moves Nicco on its own. Must not authorize that movement."),
  label(39, "time", "Exactly one hour of care passes.", "Explicit player duration; a positive runtime case. Original wording is retained.", [{ kind: "runtime_delta", delta: { time_advance_minutes: 60 } }]),
  label(43, "multi_npc", "Discussion with silent Gerome in Brenna's presence.", "No inventory creation or autonomous supply retrieval."),
  label(47, "ambiguous_time", "Rest for a few hours; no exact duration or dawn conversion.", "Do not invent a scheduled event or mana recovery."),
  label(49, "player_agency", "Continue scene without authorizing time or profile changes.", "Historical narration advances hours and changes health without an exact player instruction."),
  label(53, "knowledge", "Introduces Gerome and current location.", "No registered matching durable fact in bounded fixture; do not invent fact IDs."),
  label(55, "pure_dialogue", "Explain help and freedom; no trust mutation.", "Social implications remain prose, not numeric relationship changes."),
  label(57, "pure_dialogue", "Ask whether assistance is needed.", "No commanded durable change."),
  label(65, "ambiguous_time", "A couple of hours is contradicted by old response's three hours.", "No exact conversion; reject prose-derived timing."),
  label(87, "household", "Ask for a shopping list.", "No household policy, dynamic items or task domain added."),
  label(111, "movement", "Goes upstairs, destination not specified by canonical ID.", "Do not treat historical floors as current canonical routes."),
  label(115, "ownership", "Three established pink garments are handed to Brenna, not equipped.", "Agent-mapped fixture IDs; original pronoun-rich player input retained. Measures conservative false negatives.", ["pink_cotton", "pink_fluffy", "pink_shorts"].map(item_id => ({ kind: "transfer_item", item_id, owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } }))),
  label(117, "equipment", "Brenna dresses in layered shirts and shorts.", "Layered slot allocation is unresolved; no guessed equipment slots."),
  label(169, "household", "Household rules expressed in dialogue.", "No household membership or automatic removal of existing footwear."),
  label(171, "knowledge", "Mentions secrets without revealing their contents.", "Reject new knowledge/trust edges."),
  label(173, "knowledge", "Considers telling secrets; actual fact is not disclosed.", "Old assistant invents anecdote; do not canonize it."),
  label(185, "ambiguous_time", "Around an hour is approximate.", "No exact time increment; no unrequested NPC movement persistence."),
  label(425, "item_continuity", "Clarifies prop material; does not explicitly transfer ownership.", "No item-description updates; old response pockets props without a player handover."),
  label(443, "knowledge", "Asks for discretion about magic.", "No existing secret fact is disclosed to new recipients; travel target lacks a direct route."),
  label(509, "scheduled_event", "Dock deadline in eight days is discussed.", "No absolute date anchor/event ID agreed in the isolated pair; no calendar guessing."),
  label(591, "multi_npc", "Corrects Maren's name and discusses recovery.", "No identity/profile/health mutation from informal dialogue."),
];
