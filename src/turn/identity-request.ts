/**
 * Direct identity requests and self-introductions in the player's own words. Shared by canonical name disclosure (who may truthfully
 * introduce themselves) and canonical casting (a weak description is enough to cast the one canonical candidate it fits, but ONLY
 * when the player is asking who that person is).
 */
export const NAME_REQUEST = /\b(?:who am i (?:speaking|talking) (?:with|to)|who are you|your name|introduce yourself|what (?:are you called|should i call you)|(?:u|you) said you are named)\b/i;
export const SELF_INTRODUCTION = /\b(?:my name(?:['’]s| is)|(?:name['’]s|i(?:['’]m| am))\s+Nicco)\b/i;
export const isIdentityRequest = (text: string): boolean => NAME_REQUEST.test(text) || SELF_INTRODUCTION.test(text);
