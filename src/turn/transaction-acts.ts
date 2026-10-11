import { GATES } from "./language/gates.js";

/** The player's own acceptance or payment act in a person trade ("deal", "pays up", "I'll take her"). Shared by purchase resolution and partner continuity. */
export const ACCEPT = /\b(?:done|deal|agreed|sold|i'?ll take (?:her|him|them)|i take (?:her|him|them)|i'?ll buy (?:her|him|them)|pays?(?!\s+(?:(?:him|her|them)\s+)?(?:a\s+)?(?:visit|attention|respects?|heed|mind|back|homage|tribute)\b)(?:\s+(?:up|him|her|them|the \w+))?|paid|hands? over the (?:gold|coins?)|gives? (?:him|her|them) the (?:gold|coins?)|counts? out the (?:gold|coins?))\b/i;
/** Price talk that continues a negotiation with the person already being dealt with (not an act: no commitment is implied). */
export const PRICE_TALK_CUE = /\b(?:price|how much|cost|costs|gold|silver|coins?|buy|bought|sell|sold|offer|haggle|bargain|deal|pay|pays|paid|payment)\b/i;
/** An unhedged acceptance/payment act. */
export const isTransactionAct = (input: string): boolean => ACCEPT.test(input) && !GATES.transaction_hedge.test(input);
/** A turn that continues dealing with the current counterpart: an act, or price talk. */
export const continuesTransaction = (input: string): boolean => isTransactionAct(input) || PRICE_TALK_CUE.test(input);
