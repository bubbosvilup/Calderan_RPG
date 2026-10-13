import { OPENING_DOCUMENTS } from "../../src/campaign/heartstone-charter.js";
/** Every fresh campaign starts with two carried documents (Deed, Charter). Tests about OTHER items ignore them through these helpers. */
export const OPENING_DOC_IDS: ReadonlySet<string> = new Set(OPENING_DOCUMENTS.map(d => d.id));
export const ownItems = <T extends { readonly id: string }>(items: readonly T[]): T[] => items.filter(i => !OPENING_DOC_IDS.has(i.id));
