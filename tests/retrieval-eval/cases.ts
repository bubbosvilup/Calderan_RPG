import type { RetrievalFilter } from "../../src/retrieval/types.js";

export interface EvaluationCase {
  readonly query: string;
  readonly top1?: string;
  readonly relevant: readonly string[];
  readonly filters?: RetrievalFilter;
  readonly diagnostic?: string;
  readonly failure_category?: "scoring problem" | "tokenization problem" | "authoring vocabulary gap" | "semantic gap" | "inherently ambiguous";
  readonly failure_note?: string;
}
/** Expectations are external to canon. Multi-answer cases do not impose an arbitrary order. */
export const evaluationCases: readonly EvaluationCase[] = [
  { query: "capital of West", top1: "calderan", relevant: ["calderan"] },
  { query: "capital of Center", top1: "zul_rath", relevant: ["zul_rath"] },
  { query: "capital of East", top1: "vaelrost", relevant: ["vaelrost"] },
  { query: "eastern coastal city", top1: "skardgard", relevant: ["skardgard"] },
  { query: "mountains between Center and East", top1: "dragons_teeth_mountains", relevant: ["dragons_teeth_mountains"] },
  { query: "border fortress", top1: "ironbound", relevant: ["ironbound"] },
  { query: "iron coal mining", top1: "frostspire", relevant: ["frostspire"] },
  { query: "pirate city", relevant: ["blackwater", "sandspear"], failure_category: "authoring vocabulary gap", failure_note: "Pirate/pirates/piracy and corsair/corsairs are separate exact tokens." },
  { query: "corsair stronghold", top1: "sandspear", relevant: ["sandspear"] },
  { query: "major western port", top1: "davenport", relevant: ["davenport"] },
  { query: "mages guild", top1: "learned_arts_guild", relevant: ["learned_arts_guild"] },
  { query: "church investigators", top1: "inquisition", relevant: ["inquisition"], failure_category: "authoring vocabulary gap", failure_note: "Investigators may not occur literally; Church and Inquisition are separate named institutions." },
  { query: "merchant political institution", top1: "merchants_guild", relevant: ["merchants_guild"], failure_category: "authoring vocabulary gap", failure_note: "Merchant/merchants and political wording may not share exact surface forms." },
  { query: "legendary rare magic", top1: "light_and_shadow", relevant: ["light_and_shadow"], failure_category: "inherently ambiguous", failure_note: "Magic overview also explicitly discusses rare practitioners and legendary magic (including negation)." },
  { query: "who has mana", top1: "mana", relevant: ["mana"] },
  { query: "fire water earth air", top1: "elemental_magic", relevant: ["elemental_magic"] },
  { query: "magic specializations", top1: "magic_subschools", relevant: ["magic_subschools"], failure_category: "semantic gap", failure_note: "Specializations is absent; relevant canon uses specialized subschools/styles/branches. Magic is a generic shared term." },
  { query: "beastfolk slavery west", relevant: ["beastfolk", "west_slavery"] },
  { query: "elves uncommon", top1: "elves", relevant: ["elves"] },
  { query: "dwarves craftsmanship", top1: "dwarves", relevant: ["dwarves"] },
  { query: "legal slave port", top1: "davenport", relevant: ["davenport"] },
  { query: "slave market border", relevant: ["khar_dune", "ironbound"], failure_category: "authoring vocabulary gap", failure_note: "Khar-Dune uses markets (plural); Ironbound lacks market. Broad West/slavery records cover more literal tokens; Ironbound falls outside five." },
  { query: "illegal slaves pirates", top1: "blackwater", relevant: ["blackwater"] },
  { query: "slave trade West", relevant: ["west_slavery", "davenport", "calderan"], failure_category: "authoring vocabulary gap", failure_note: "West Slavery and Calderan describe legal market/control without the literal token trade; illicit-trade records cover all three tokens." },
  { query: "food storage cellar", top1: "heartstone_u1", relevant: ["heartstone_u1"] },
  { query: "medical recovery room", top1: "heartstone_f1", relevant: ["heartstone_f1"] },
  { query: "courtyard medicine plants", top1: "heartstone_cy", relevant: ["heartstone_cy"] },
  { query: "living room hearth sofa", top1: "heartstone_lr", relevant: ["heartstone_lr"] },
  ...[
    ["Blackwater", "blackwater"], ["The Unchained Haven", "blackwater"],
    ["Davenport", "davenport"], ["The Port of Chains", "davenport"],
    ["Ironbound", "ironbound"], ["The Fortress on the Edge", "ironbound"],
    ["Sandspear", "sandspear"], ["Frostspire", "frostspire"],
  ].map(([query, id]) => ({ query: query!, top1: id!, relevant: [id!] })),
  { query: "city on the border with Center", top1: "ironbound", relevant: ["ironbound"] },
  { query: "where do pirates operate?", relevant: ["blackwater", "sandspear"], failure_category: "authoring vocabulary gap", failure_note: "Natural question words and exact pirates versus corsairs forms do not encode the intended concept." },
  { query: "Blackwater rivalry", relevant: ["blackwater", "sandspear"] },
  { query: "border", filters: { entity_types: ["location"], parent_ids: ["west"] }, top1: "ironbound", relevant: ["ironbound"] },
  { query: "dragon ruler", relevant: [], diagnostic: "Token overlap with Dragon's Teeth is not evidence of a dragon ruler; inspect partial coverage, never infer a ruler." },
  { query: "mages guild headquarters", relevant: [], diagnostic: "Only real canonical IDs may appear. Learned Arts may match the explicit denial of a separate Mages Guild; headquarters is not established." },
  { query: "Blackwater black water", relevant: [], diagnostic: "Blackwater and literal water tokens may retrieve different records; no combined fact about black-colored water is created." },
  { query: "quasarxylophone", relevant: [], diagnostic: "No lexical overlap must return zero results." },
];
