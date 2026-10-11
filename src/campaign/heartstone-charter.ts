/**
 * Heartstone household canon (normative). The three household rules and the canonical rite oath are CANONICAL DISPLAY TEXT: stable strings that
 * authored canon (`data/world/cultures/heartstone_household_charter.yaml`) and the starting item repeat verbatim, and that a test pins to each
 * other. Rite EVIDENCE MATCHING (turn/household-evidence.ts) is separate and semantic: it recognises equivalent voluntary wording by essential meaning,
 * never by byte equality. The rules are social/familial principles accepted by the Keeper, not magical commands; the oath is a voluntary promise.
 */
export const HEARTSTONE_HOUSEHOLD_RULES = [
  "No lies or secrets within the family.",
  "Protect the family.",
  "Barefoot inside. Shoes outside.",
] as const;
/** The canonical core oath; `[name]` is replaced by the candidate's own name. */
export const HEARTSTONE_CANONICAL_OATH = [
  "I, [name], choose to stay and become a member of the Heartstone.",
  "I swear to be loyal to and protect my family,",
  "and to stand faithfully beside the Keeper.",
] as const;
export const HEARTSTONE_KEEPER_ACCEPTANCE = "I accept you as a member of the Heartstone.";
export const HEARTSTONE_CHARTER_ITEM = {
  id: "campaign_item_heartstone_household_charter",
  name: "Heartstone Household Charter",
  /** Deliberately short: the item is listed every turn. The full wording is canon, retrieved when the charter is inspected. */
  description: "The charter of the Heartstone household: its three rules and the instructions for the household rite.",
  visual_description: "A folded sheet of aged cream parchment covered in dense, careful handwriting, bound with a plain dark cord.",
} as const;
export const openingOathText = (name: string): string => HEARTSTONE_CANONICAL_OATH.join(" ").replace("[name]", name);
/**
 * The second opening document. A physical paper, nothing more: holding it is not owning Heartstone (there is no property state it could move), and
 * its provenance is deliberately unexplained. Full wording is authored canon (`heartstone_deed_of_ownership`), retrieved when it is read or inspected.
 */
export const HEARTSTONE_DEED_ITEM = {
  id: "campaign_item_heartstone_deed_of_ownership",
  name: "Deed of Ownership — Heartstone Tower",
  description: "A legal deed naming Nicco as owner of Heartstone Tower, its residence and enclosed courtyard.",
  visual_description: "A stiff sheet of heavy off-white paper with a ruled border, neat formal script, a pressed wax seal at the foot and a registry stamp in the margin.",
} as const;
export const OPENING_DOCUMENTS = [HEARTSTONE_DEED_ITEM, HEARTSTONE_CHARTER_ITEM] as const;
