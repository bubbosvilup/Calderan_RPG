import type { MannerismDefinition } from "./types.js";

/** Conservative supported vocabulary. Unknown micro-behaviors abstain rather than become permanent interpretation. */
export const MANNERISM_ACTIONS = ["gaze_lower", "two_finger_tap", "lips_press", "clothing_smooth", "object_grip", "speech_pause", "door_glance"] as const;
export const MANNERISM_TRIGGERS = ["none", "before_lie", "before_disagreement", "while_waiting", "after_awkwardness", "when_visibly_tense", "before_name", "when_voice_raised"] as const;
export type MannerismAction = typeof MANNERISM_ACTIONS[number];
export type MannerismTrigger = typeof MANNERISM_TRIGGERS[number];
export interface MannerismConcept { action: MannerismAction; trigger: MannerismTrigger }
export const MANNERISM_LEARNING_POLICY = Object.freeze({ batch_turns: 4, candidates_per_npc: 8, expiry_turns: 40, evidence_per_candidate: 5, journal_turns: 16, observations_per_batch: 32, owned_per_request: 128 });
export const MANNERISM_THRESHOLDS = Object.freeze({ 2: 3, 3: 4, 4: 5 });
export function requiredMannerismEvidence(occupied: number): number { return occupied < 2 ? MANNERISM_THRESHOLDS[2] : occupied === 2 ? MANNERISM_THRESHOLDS[3] : MANNERISM_THRESHOLDS[4]; }
export const MANNERISM_INFERENCE = /\b(?:because|showing|revealing|means that|in order to|wants?|fears?|feels?|vulnerability|guarded|affection|trust\w*|teasing|protect\w*|loves?|dislikes?|authority|submiss\w*|domina\w*|reassurance|jealous\w*|values?|honesty|sexual\w*|arous\w*|consent\w*|attract\w*|kink\w*|willing\w*|desire\w*|insecurity|personality|motivat\w*)\b/i;
const ACTION: Record<MannerismAction, RegExp> = {
  gaze_lower: /\b(?:lowers?|lowered|drops?|dropped)\b[^.!?;]{0,35}\b(?:gaze|eyes)\b|\b(?:looks?|looked) down\b/i,
  two_finger_tap: /\b(?:taps?|tapped|drums?|drummed)\b[^.!?;]{0,25}\b(?:two|2) (?:finger(?:tip)?s)\b|\b(?:two|2) finger(?:tip)?s\b[^.!?;]{0,20}\b(?:tap|drum)\b/i,
  lips_press: /\b(?:presses|pressed|press|purses|pursed)\b[^.!?;]{0,20}\blips\b/i,
  clothing_smooth: /\b(?:smooths?|smoothed|straightens?|straightened)\b[^.!?;]{0,30}\b(?:sleeves?|shirt|garment|clothes|clothing|dress|coat|tunic)\b/i,
  object_grip: /\b(?:grips?|gripped|clutches?|clutched|clasps?|clasped)\b/i,
  speech_pause: /\b(?:pauses?|paused|leaves? a (?:short|small) pause)\b/i,
  door_glance: /\b(?:looks?|looked|glances?|glanced)\b[^.!?;]{0,30}\bdoor\b/i,
};
const TRIGGER: Record<Exclude<MannerismTrigger, "none">, RegExp> = {
  before_lie: /\bbefore\b[^.!?;]{0,40}\b(?:lie|lying|lies)\b/i,
  before_disagreement: /\bbefore\b[^.!?;]{0,35}\b(?:disagree\w*|objecting|objection)\b/i,
  while_waiting: /\b(?:while|when|as)\b[^.!?;]{0,15}\bwait\w*\b/i,
  after_awkwardness: /\bafter\b[^.!?;]{0,35}\bawkward\w*\b/i,
  when_visibly_tense: /\b(?:when|while|as)\b[^.!?;]{0,15}\bvisibly tense\b/i,
  before_name: /\bbefore\b[^.!?;]{0,45}\bname\b/i,
  when_voice_raised: /\b(?:when|whenever|as)\b[^.!?;]{0,45}\b(?:raises? (?:their|his|her|a) voice|raised voice|voice is raised)\b/i,
};
/** Quotes are finite observable clauses, never mood/personality diagnoses or future/hypothetical actions. */
export function supportsMannerismConcept(text: string, c: MannerismConcept): boolean {
  if (MANNERISM_INFERENCE.test(text) || /\b(?:not|never|doesn't|didn't|would|might|could|will|pretends?|imagines?|tries|almost|stops herself)\b|["\u201c\u201d]/i.test(text)) return false;
  if (!ACTION[c.action].test(text)) return false;
  if (c.trigger === "none") return c.action === "two_finger_tap" || c.action === "object_grip";
  return TRIGGER[c.trigger].test(text);
}
/** Deterministic synonym normalization independently checks the extractor's semantic duplicate decisions. */
export function mannerismConceptOf(d: Pick<MannerismDefinition, "text" | "canonical_key">): MannerismConcept | undefined {
  const key = d.canonical_key.match(/^emergent_(gaze_lower|two_finger_tap|lips_press|clothing_smooth|object_grip|speech_pause|door_glance)_(none|before_lie|before_disagreement|while_waiting|after_awkwardness|when_visibly_tense|before_name|when_voice_raised)(?:_|$)/);
  if (key) return { action: key[1] as MannerismAction, trigger: key[2] as MannerismTrigger };
  for (const action of MANNERISM_ACTIONS) for (const trigger of MANNERISM_TRIGGERS) if (supportsMannerismConcept(d.text, { action, trigger })) return { action, trigger };
  return undefined;
}
export function equivalentMannerismConcepts(a: MannerismConcept, b: MannerismConcept): boolean {
  return a.action === b.action && (a.trigger === b.trigger || a.trigger === "none" || b.trigger === "none");
}
export function mannerismConceptText(c: MannerismConcept, itemName?: string): string {
  const action: Record<MannerismAction, string> = { gaze_lower: "Lowers their gaze", two_finger_tap: "Taps two fingertips", lips_press: "Presses their lips together", clothing_smooth: `Smooths ${itemName ?? "their garment"}`, object_grip: `Grips ${itemName ?? "their item"}`, speech_pause: "Leaves a short pause", door_glance: "Glances toward the door" };
  const trigger: Record<MannerismTrigger, string> = { none: "", before_lie: " before an obvious lie", before_disagreement: " before disagreeing", while_waiting: " while waiting", after_awkwardness: " after an awkward moment", when_visibly_tense: " when visibly tense", before_name: " before addressing someone by name", when_voice_raised: " when someone raises their voice" };
  return `${action[c.action]}${trigger[c.trigger]}.`;
}
