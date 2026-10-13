import { createHash } from "node:crypto";
import type { NarratorProvider } from "../../llm/narrator-provider.js";
import type { GenerationRequest } from "../../llm/types.js";

/**
 * Historical turn anchors (EVALUATION ONLY). A historical player message often depends on a fact the OLD narrator established in
 * the previous reply (a quoted price, who the seller is, where "the tower" is). Replaying the player text alone changes its meaning.
 * An anchor records, per player turn N, the minimal semantic precondition of that input, derived from historical reply N-1 and input N.
 *
 *  - It is a SCENARIO CONSTRAINT for the Narrator, never a state cheat: the schema has no field for funds, items, households, NPC+,
 *    commands or transactions, and a validator rejects them. The normal engine still resolves, authorizes and commits everything.
 *  - It preserves the PREMISE, not the OUTCOME: "the seller quotes five gold" is not "the sale completes".
 *  - It is applied only through ProductionOptions.narrator_wrapper in the replay harness. Production never reads an anchor, a turn
 *    number, a file name or an oracle value.
 *  - Anchor text never names an unintroduced canonical person: counterparts are described by role ("the seller Nicco is dealing with").
 */
export type AnchorKind = "interlocutor" | "transaction" | "premise" | "travel_referent";
export interface AnchorEvidence { /** Historical assistant reply the premise comes from. */ readonly assistant_turn: number; /** A short verbatim excerpt (audit trail). */ readonly excerpt: string }
export interface HistoricalAnchor {
  readonly id: string;
  /** The historical PLAYER turn whose meaning depends on this precondition. */
  readonly turn: number;
  readonly kind: AnchorKind;
  /** Neutral, role-based statement of what must be true BEFORE this player turn (continuity; narrator-facing at turn N). */
  readonly before: string;
  /** What the reply to turn N-1 must have established (narrator-facing at turn N-1); absent when the premise is already scene state. */
  readonly establish_in_previous_reply?: string;
  readonly transaction?: { readonly counterparty_role: string; readonly subject_label: string; readonly quoted_price_gold?: number; readonly status: "offered_not_completed" };
  /** `companions`: names of campaign people who physically travel with Nicco in the historical turn (the replay relocates them only when the manual location correction was needed). */
  readonly travel?: { readonly referent: string; readonly destination_location_id: string; readonly companions?: readonly string[] };
  readonly evidence: AnchorEvidence;
}
export interface AnchorFile { readonly version: 1; readonly note: string; readonly anchors: readonly HistoricalAnchor[] }

const ALLOWED = new Set(["id", "turn", "kind", "before", "establish_in_previous_reply", "transaction", "travel", "evidence"]);
const FORBIDDEN = /\b(?:funds?|money|inventory|household|members?|premium|npc_?plus|commands?)\b|\b(?:transfer|set|create|add|register)_[a-z_]+|gold_delta/i;
/** Structural validation: anchors may constrain a scene, never write campaign state. Returns the problems (empty = valid). */
export function validateAnchors(file: AnchorFile): string[] {
  const problems: string[] = [], seen = new Set<string>();
  if (file.version !== 1) problems.push("unsupported version");
  for (const a of file.anchors) {
    if (seen.has(a.id)) problems.push(`${a.id}: duplicate id`); seen.add(a.id);
    for (const key of Object.keys(a)) if (!ALLOWED.has(key)) problems.push(`${a.id}: field "${key}" is not an allowed anchor field`);
    if (!Number.isInteger(a.turn) || a.turn < 1) problems.push(`${a.id}: bad turn`);
    if (!a.before.trim()) problems.push(`${a.id}: empty precondition`);
    for (const [field, value] of [["before", a.before], ["establish_in_previous_reply", a.establish_in_previous_reply ?? ""]] as const)
      if (FORBIDDEN.test(value)) problems.push(`${a.id}: ${field} mentions state ("${FORBIDDEN.exec(value)![0]}")`);
    if (a.travel?.companions?.some(c => !/^[A-Z][a-z]{2,20}$/.test(c))) problems.push(`${a.id}: companions are plain first names`);
    if (a.transaction && a.transaction.status !== "offered_not_completed") problems.push(`${a.id}: a transaction anchor carries no outcome (status must stay offered_not_completed)`);
    if (!a.evidence?.excerpt || a.evidence.excerpt.length > 200) problems.push(`${a.id}: evidence excerpt missing or longer than 200 characters`);
  }
  return problems;
}
/** Every anchor's evidence excerpt must occur in the named historical assistant reply (whitespace-insensitive). */
export function verifyAnchorEvidence(file: AnchorFile, assistantReplies: Readonly<Record<number, string>>): string[] {
  const norm = (s: string) => s.replace(/[*\s]+/g, " ").trim().toLowerCase();
  return file.anchors.filter(a => !norm(assistantReplies[a.evidence.assistant_turn] ?? "").includes(norm(a.evidence.excerpt))).map(a => `${a.id}: excerpt not found in assistant reply ${a.evidence.assistant_turn}`);
}
export const anchorsSha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The narrator-facing block for one replay turn, or undefined. Establishing lines come from anchors of turn+1, continuity lines from this turn's. */
export function renderAnchorBlock(file: AnchorFile, turn: number): string | undefined {
  const establish = file.anchors.filter(a => a.turn === turn + 1 && a.establish_in_previous_reply).map(a => `- ${a.establish_in_previous_reply}`);
  const before = file.anchors.filter(a => a.turn === turn && a.kind !== "travel_referent").map(a => `- ${a.before}`);
  if (!establish.length && !before.length) return undefined;
  return ["[HISTORICAL SCENARIO ANCHOR — replay evaluation only]",
    "Scenario constraints for this reply. They preserve the premise of the scene; they do not decide any outcome. Narrate nothing as paid, handed over or completed unless Nicco's action this turn does it.",
    ...(establish.length ? ["In this reply, establish naturally:", ...establish] : []),
    ...(before.length ? ["Continuity (already true before this turn):", ...before] : [])].join("\n");
}
export const anchoredIds = (file: AnchorFile, turn: number): string[] => file.anchors.filter(a => a.turn === turn || (a.turn === turn + 1 && a.establish_in_previous_reply)).map(a => a.id);
export const travelReferents = (file: AnchorFile): Record<string, string> => Object.fromEntries(file.anchors.filter(a => a.travel).map(a => [String(a.turn), a.travel!.destination_location_id]));

/** Narrator wrapper: appends the current turn's anchor block to the context message; every other request field is untouched. */
export function groundedNarrator(provider: NarratorProvider, current: () => string | undefined): NarratorProvider {
  const ground = (request: GenerationRequest): GenerationRequest => {
    const block = current();
    if (!block || !request.messages.length) return request;
    const messages = request.messages.map((m, i) => i === request.messages.length - 1 && m.role === "user" ? { ...m, content: `${m.content}\n\n${block}` } : m);
    return { ...request, messages };
  };
  return { generate: request => provider.generate(ground(request)), stream: request => provider.stream(ground(request)) };
}

/** Companion names per travel turn (only anchors that list some). */
export const travelCompanions = (file: AnchorFile): Record<string, readonly string[]> => Object.fromEntries(file.anchors.filter(a => a.travel?.companions?.length).map(a => [String(a.turn), a.travel!.companions!]));
