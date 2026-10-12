import { COERCION, CONDITIONAL, EPISTEMIC, HABITUAL, INSTRUCTION, INTENT, MODAL, NEGATION, NEGATIVE_CONTRACTION, OBSERVATION, RECOLLECTION, REFUSAL, TEMPORAL, cueGate } from "../language/cues.js";
import type { FactModality, FactPolarity } from "./types.js";

/**
 * How the prose presents an act. The decision "is this stated as done" belongs to the form's own not-done gate (the shared cue
 * vocabulary in language/gates.ts, kept per form on purpose); this module only NAMES why a gate rejected the act, so the fact
 * says "negated" or "future" instead of silently disappearing. Guarantee: a gate that fires never yields `completed`.
 */
const GROUPS: readonly (readonly [FactModality, RegExp])[] = [
  ["requested", cueGate({ cues: [INSTRUCTION.toldTo, "(?:tells?|told|asks?|asked|begs?|begged|urges?|urged|orders?|ordered|invites?|invited|wants|wanted|needs?|needed) (?:him|her|them|nicco|\\w+) to", COERCION.must] })],
  ["negated", cueGate({ cues: [NEGATION.not, NEGATION.never, NEGATION.nor, NEGATION.cannot, NEGATION.no, NEGATION.noLonger, NEGATION.notYet, NEGATIVE_CONTRACTION.wont, ...Object.values(REFUSAL)], contraction: true })],
  ["conditional", cueGate({ cues: [CONDITIONAL.if, CONDITIONAL.unless, CONDITIONAL.whether, CONDITIONAL.until, CONDITIONAL.wereTo, CONDITIONAL.supposeAny, EPISTEMIC.maybe, EPISTEMIC.perhaps, EPISTEMIC.imagineAny, EPISTEMIC.asIf, EPISTEMIC.asThough] })],
  ["habitual", cueGate({ cues: [...Object.values(HABITUAL), RECOLLECTION.usedTo, RECOLLECTION.remember, RECOLLECTION.recall, RECOLLECTION.accordingTo, TEMPORAL.yesterday, TEMPORAL.earlier, TEMPORAL.ago, TEMPORAL.lastNight, TEMPORAL.oneDay] })],
  ["future", cueGate({ cues: [...Object.values(MODAL), INTENT.plans, INTENT.planning, INTENT.planned, INTENT.intends, INTENT.wants, INTENT.wanted, INTENT.goingTo, INTENT.aboutTo, INTENT.readyTo, INTENT.promises, INTENT.saysHell, INTENT.meansTo, TEMPORAL.later, TEMPORAL.someday, TEMPORAL.tomorrow, TEMPORAL.tonight], future: true })],
  ["oriented", cueGate({ cues: [...Object.values(OBSERVATION), INTENT.triesTo, INTENT.triedTo, INTENT.tryingTo, INTENT.startsTo, INTENT.startedTo, INTENT.beginsTo, INTENT.beganTo, INTENT.almost, INTENT.nearly, INTENT.thinks, INTENT.threaten, EPISTEMIC.seemsTo, EPISTEMIC.seemedTo], question: true })],
];

/** Name the reason `gate` rejects `text` (or `completed` when it does not). Never returns `completed` for a text the gate rejects. */
export function modalityOf(text: string, gate: RegExp): FactModality {
  if (!gate.test(text)) return "completed";
  for (const [modality, re] of GROUPS) if (re.test(text)) return modality;
  return "unrealised";
}

/** First non-completed reading among several candidate verdicts, else completed. */
export function firstNonCompleted(...verdicts: readonly FactModality[]): FactModality { return verdicts.find(v => v !== "completed") ?? "completed"; }

export const polarityOf = (modality: FactModality): FactPolarity => modality === "negated" ? "negated" : "affirmed";

/** The reason a base-form verb ("follow", "leave") is not a completed statement, or undefined when the prose gives it none (then it is not recorded). */
export function baseFormModality(prefix: string): FactModality | undefined {
  for (const [modality, re] of GROUPS) if (re.test(prefix)) return modality;
  return undefined;
}
