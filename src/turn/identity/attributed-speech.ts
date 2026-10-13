import type { TurnContext } from "../context/context-builder.js";
import { escapeRegExp } from "../language/text.js";
import { type DialogueUnit, dialogueUnits, presentPeople } from "../narration-facts/index.js";
import { rpgDialogue } from "../rpg-dialogue.js";
import { type SceneParticipantPlan, participantForNoun } from "./scene-participants.js";

/**
 * SPEAKER POLICY of the speaker-scoped consumers (Block 11): which spoken lines of a narration count as a known person's own words for the
 * recent-conversation projection (prompt-builder.ts), the audit's NPC-claim and player-agency checks (narration-audit.ts) and the household /
 * relationship evidence (household-evidence.ts). The fact layer attributes every line it can (narration-facts/dialogue-forms.ts); this policy
 * decides which attributions those consumers may rely on, and keeps no speech grammar of its own:
 *  - legacy prose only. The Narrator's RPG plain-speech lines are returned as raw lines (`rpg`) and are never a named speaker's words here: the
 *    RPG attribution (KPG-2) feeds commerce, where an Actual Offer still needs the player's Accept, and never authority or audit evidence;
 *  - a strict attribution (explicit tag, direct name, adjacent beat, continued speaker, deterministic context), never the weak recent-subject fallback;
 *  - a present person or a scene-local descriptor ("other:woman"), never an unknown capitalized word ("other:Halvar");
 *  - Nicco only by an explicit tag that names him: pronouns and beats never put words in his mouth.
 */
export interface AttributedLine {
  /** The fact layer's speaker key: a character id, "nicco", or a scene-local "other:<noun>". */
  readonly speaker: string;
  /** How the recent-conversation projection names the speaker (authored name, the unnamed label, or a scene participant). */
  readonly label: string;
  readonly text: string;
}
export interface AttributedSpeech {
  /** RPG plain speech of the narration (unattributed for these consumers), when the narration is in RPG format. */
  readonly rpg?: readonly string[];
  readonly lines: readonly AttributedLine[];
}

/** One spoken unit the policy accepts. */
export function acceptedSpeaker(u: DialogueUnit): u is DialogueUnit & { readonly speaker: string } {
  const method = u.attribution?.method;
  return u.quoted && !!u.speaker && !!method && method !== "recent_subject" && !/^other:[A-Z]/.test(u.speaker)
    && (u.speaker !== "nicco" || (method === "explicit_dialogue_tag" && u.attribution?.resolution === "name"));
}

/**
 * The attributed speech of one narration. `units`: the turn's shared dialogue reading of this narration (NarrationFactSource.of(...).dialogue);
 * default the legacy reading against the present people. `scene`/`turn` only name scene participants in labels.
 */
export function attributedSpeech(narration: string, context: TurnContext, options: { readonly units?: readonly DialogueUnit[]; readonly scene?: Pick<SceneParticipantPlan, "participants" | "turn">; readonly turn?: number } = {}): AttributedSpeech {
  // A one-line legacy beat ("Maren nods.") is prose, not an RPG speech line.
  const names = context.characters.map(c => escapeRegExp(c.profile.name ?? c.id)).join("|") || "(?!)";
  const legacyBeat = !narration.includes("*") && new RegExp(`^(?:${names}|he|she|they)\\s+(?:replies?|smiles?|shrugs?|waits?|nods?|walks?|looks?)\\b`, "i").test(narration.trim());
  const rpg = legacyBeat ? undefined : rpgDialogue(narration);
  if (rpg !== undefined) return { rpg, lines: [] };
  const label = (key: string) => {
    if (!key.startsWith("other:")) {
      const c = context.characters.find(x => x.id === key);
      const unnamed = c && !c.profile.name && "unnamed_label" in c ? String(c.unnamed_label ?? "").replace(/^(?:the|a|an)\s+/i, "") : "";
      return c?.profile.name ?? (unnamed ? unnamed[0]!.toUpperCase() + unnamed.slice(1) : key);
    }
    const noun = key.slice(6), participant = options.scene ? participantForNoun(noun, options.scene.participants, options.turn ?? 0) : undefined;
    return participant ? `${participant.ref} ${participant.display_name}` : noun[0]!.toUpperCase() + noun.slice(1);
  };
  const units = options.units ?? dialogueUnits(narration, 0, presentPeople(context));
  return { lines: units.filter(acceptedSpeaker).map(u => ({ speaker: u.speaker, label: label(u.speaker), text: u.text })) };
}
