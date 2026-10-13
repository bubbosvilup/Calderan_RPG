/**
 * NPC+ Pass 10 — deterministic adversarial corpus for follow grammar (implicitFollows / narratedMovements / follow_not_done).
 * Pure generators, no randomness: every sentence is derived from fixed lists so a failure names an exact sentence.
 */
export interface Case { readonly family: string; readonly text: string }
const cross = <T>(...lists: readonly (readonly T[])[]): T[][] => lists.reduce<T[][]>((acc, l) => acc.flatMap(a => l.map(x => [...a, x])), [[]]);
const LEADS = ["", "A moment later, ", "Behind him, ", "Shortly after, ", "Soon, ", "A step behind him, ", "Then "] as const;
const ADVERBS = ["", "quietly ", "slowly ", "silently ", "wordlessly "] as const;
const ENDINGS = [".", "!", ", catching the door he left ajar.", " and sits by the fire.", " — slow, careful.", "…"] as const;
const DESCRIPTORS = ["", "uneven ", "lighter ", "quick "] as const;
/** {S} subject, intended positives: a completed follow that resolves to Nicco's arrival. */
const POSITIVE_CLAUSES: readonly (readonly [string, string])[] = [
  ["follows", "follows him"], ["follows", "followed him"], ["follows", "follows"], ["follows", "followed"], ["trails", "trails after him"], ["trails", "trailed him"],
  ["steps", "falls into step behind him"], ["steps", "fell into step"], ["after", "comes after him"], ["after", "came after"], ["after", "walks after him"],
  ["after", "goes after him"], ["after", "descends after him"], ["after", "descended after him"], ["after", "climbs after him"], ["follows", "follows a step behind"],
  ["follows", "follows close behind"], ["follows", "follows him down the stairs"], ["follows", "follows him downstairs"], ["follows", "follows in silence"],
  ["coord", "rises and follows him"], ["coord", "rose and followed him"], ["coord", "hesitates, then follows him"], ["coord", "hesitated, then followed him"],
];
/** Step-led: "{S}'s {desc}tread follows". */
const STEP_PLURAL = [["steps", "footsteps", "footfalls"], ["follow", "followed", "come after", "came after", "followed close behind"]] as const;
const STEP_SINGULAR = [["tread"], ["follows", "followed", "comes after", "came after", "followed close behind"]] as const;

export function positiveCorpus(subject: string, possessive = subject): Case[] {
  const out: Case[] = [];
  for (const [lead, adv, [, clause], end] of cross<unknown>(LEADS, ADVERBS, POSITIVE_CLAUSES, ENDINGS) as [string, string, readonly [string, string], string][]) {
    // The adverb is only meaningful directly before the verb; the coordinated forms carry their own.
    const verbPhrase = adv && !/\b(?:and|then)\b/.test(clause) ? `${adv}${clause}` : clause;
    out.push({ family: "positive:subject-led", text: `${lead}${subject} ${verbPhrase}${end}` });
  }
  for (const [nouns, clauses] of [STEP_PLURAL, STEP_SINGULAR]) for (const [lead, noun, desc, clause] of cross<string>(LEADS, nouns, DESCRIPTORS, clauses) as [string, string, string, string][])
    out.push({ family: "positive:step-led", text: `${lead}${possessive}'s ${desc}${noun} ${clause}.` });
  return [...new Map(out.map(c => [c.text, c])).values()];
}

/** Negative families. Every sentence must move nobody. Templates use {S} for the subject name and {P} for the pronoun. */
const NEGATIVE_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  vision: ["{S}'s eyes follow him.", "{P} gaze follows him.", "{S}'s grey eyes follow the conversation.", "{S}'s eyes follow him down the stairs.", "Her gaze followed him out.", "{S} watches him go and her eyes follow him."],
  cognition: ["{S} follows his reasoning.", "{S} follows the argument.", "{S} follows what he means.", "{S} follows his meaning, nodding.", "{S} follows the thread of it.", "{S} followed the conversation closely."],
  sound: ["{S} follows the sound.", "{S} follows the voice with her eyes.", "{S} follows the sound of his steps with her eyes.", "{S} follows the creak of the stairs."],
  hypothetical: ["{S} would follow him.", "{S} might follow him.", "{S} could follow him.", "If {S} followed him, the hall would be crowded.", "Suppose {S} followed him down.", "{S} would follow him, given time.", "{S} should follow him.", "{S} may follow.", "Perhaps {S} follows.", "Maybe {S} follows him."],
  negation: ["{S} does not follow.", "{S} doesn't follow.", "{S} never follows him.", "No footsteps follow.", "{S} did not follow him.", "{S} didn't follow him down.", "{S} no longer follows him.", "Nobody follows him.", "{S} cannot follow him.", "{S} won't follow him."],
  incomplete: ["{S} almost follows him.", "{S} nearly follows him.", "{S} seems ready to follow.", "{S} looks about to follow him.", "{S} is about to follow him.", "{S} starts to follow, then stops.", "{S} tries to follow him.", "{S} thinks about following him."],
  refusal: ["{S} refuses to follow.", "{S} declines to follow him.", "{S} shakes her head instead.", "{S} refuses to follow him down the stairs.", "{S} declined to follow.", "{S} says no and stays at the window."],
  temporal: ["{S} followed him yesterday.", "{S} followed him earlier.", "{S} will follow him later.", "{S} plans to follow him tomorrow.", "Two days ago {S} followed him.", "{S} followed him last night.", "{S} used to follow him everywhere.", "{S} remembers following him.", "{S} promises to follow him soon."],
  other_destination: ["{S} follows him to the window.", "{S} follows him toward the table.", "{S} follows him across the room.", "{S} follows him into the cellar.", "{S} followed him to the door of the kitchen.", "{S} follows him through the arch to the courtyard.", "{S} follows him — to the window."],
  question: ["Does {S} follow him?", "Will {S} follow him?", "{S} follows him? No.", "Would {S} follow?"],
  habitual: ["{S} usually follows him.", "{S} normally follows him down the stairs.", "{S} typically follows him.", "{S} always follows him.", "{S} often follows him.", "{S} generally follows him.", "Every time he leaves, {S} follows him.", "Whenever Nicco goes down, {S} follows him.", "As usual, {S} follows him.", "{S} sometimes follows him, but not today."],
  other_time: ["The night before, {S} followed him down the stairs.", "Last week {S} followed him.", "That morning {S} followed him down.", "Previously, {S} followed him.", "{S} followed him once.", "Days before, {S} followed him.", "{S} had followed him.", "{S} has followed him.", "{S} is following him.", "{S} was following him."],
  dash_retraction: ["{S} follows him — no, she stays.", "{S} follows him — or does she?", "{S} follows him — not quite.", "{S} follows him — then stops at the top of the stairs.", "{S} follows him — and then hesitates.", "{S} follows him — except she doesn't.", "{S} follows him… no, she waits.", "{S} followed — slow, hesitant, and stopped at the door.", "{S} follows him — no.", "{S} follows him — instead she lingers.", "{S} follows him, then stops at the top of the stairs.", "{S} follows him, then hesitates.", "{S} follows him and then waits.", "{S} follows him, no, she stays.", "{S} follows him and stays at the door."],
  dialogue: ["\"Maren follows him,\" Brenna says.", "\"I will follow you,\" {S} says.", "\"Come along,\" he says, and {S} answers, \"Not yet.\"", "{S} says, \"I followed him once.\"", "\"Does {S} follow?\" Gerome seems to ask."],
  reported: ["Brenna tells {S} to follow him.", "{S} is asked to follow him.", "{S} asks whether she should follow him.", "{S} wonders if she ought to follow him.", "{S} has been told to follow him.", "Nicco wants {S} to follow him.", "{S} is expected to follow."],
  other_target: ["{S} follows Gerome.", "{S} follows the porter down the stairs.", "{S} follows her own thoughts.", "{S} follows him with her eyes.", "{S} follows him around the room with a cloth.", "{S} follows Brenna to the window.", "{S} follows the draught under the door."],
  ambient: ["The sound of footsteps follows him down.", "A draught follows him down the stairs.", "Silence follows.", "A pause follows, and {S} says nothing.", "The smell of bread follows him.", "Her laughter follows him down.", "Her voice follows him down the stairs.", "Her whisper follows."],
  ornate_non_follow: ["{S} followed with her eyes the line of his shoulders.", "{S} follows in her mind the path he took.", "{S} follows the rule of the house.", "{S} follows his lead in the argument.", "{S} follows the recipe she learned.", "{S} follows the line of the wall with her hand."],
};
export function negativeCorpus(subject: string): Case[] {
  const out: Case[] = [];
  for (const [family, templates] of Object.entries(NEGATIVE_TEMPLATES)) for (const t of templates) {
    const text = t.replaceAll("{S}", subject).replaceAll("{P}", "Her");
    out.push({ family: `negative:${family}`, text });
    // Mixed with leads and endings, to catch accidental acceptance through the prefix patterns.
    for (const lead of LEADS.slice(1)) out.push({ family: `negative:${family}`, text: `${lead}${text[0]!.toLowerCase() === text[0] ? text : text}` });
  }
  return out;
}
/** Different mover entirely: valid grammar for a character that must not move (not eligible, not NPC+, or not named). */
export function nonMoverCorpus(): Case[] {
  const who = ["Gerome", "The porter", "A woman", "Nicco", "Korvin", "Somebody", "He"];
  return who.flatMap(s => ["follows him", "followed him", "trails after him", "falls into step behind him"].map(v => ({ family: "negative:non-mover", text: `${s} ${v}.` })));
}

/** Narration a human would read as a follow that the grammar deliberately does NOT recognise (fail-closed false negatives; reported, never asserted as positives). */
export const UNSUPPORTED_ORNATE: readonly string[] = [
  "Heavy footfalls marked {S}'s descent.", "{S} came down the stairs after him.", "{S} went down after him.", "{S} joined him a moment later.", "{S} trailed him down.",
  "{S} followed Nicco down.", "{S} hurried after him.", "{S} slipped out and down after him.", "{S} fell in beside him.", "{S}'s steps sounded on the stairs behind him.",
  "{S} followed him out of the room.", "{S} follows him around the corner.", "He heard {S} on the stairs behind him.", "She followed.", "{S} chose to follow him.", "{S} decided to follow him down.",
];
