import type { MannerismDefinition } from "./types.js";

export type MannerismCategory = "gaze" | "hands" | "face" | "head" | "posture" | "pause" | "cadence" | "movement";
export interface MannerismSeed extends MannerismDefinition { category: MannerismCategory }
/** Authored source data, not generated at runtime. Keys name concepts, not gender or character archetypes. */
const groups: Record<MannerismCategory, readonly (readonly [string, string])[]> = {
  gaze: [
    ["gaze_lower_before_lie", "Briefly lowers their gaze before an obvious lie."],
    ["gaze_up_before_recollection", "Looks upward for a beat before recounting a remembered detail."],
    ["gaze_side_after_compliment", "Glances aside immediately after receiving a compliment."],
    ["gaze_hold_after_question", "Holds the listener's gaze for a beat after asking a question."],
    ["gaze_return_after_interruption", "Returns their gaze to the interrupted speaker before replying."],
    ["gaze_follow_departing_speaker", "Follows a departing speaker with their eyes for one extra beat."],
    ["gaze_down_after_correction", "Glances down briefly after being corrected."],
    ["gaze_shift_between_speakers", "Shifts their gaze to each speaker just before taking a turn."],
    ["gaze_still_while_listening", "Keeps their gaze unusually still during a short explanation."],
    ["gaze_corner_before_answer", "Looks from the corner of their eyes before answering a direct question."],
  ],
  hands: [
    ["thumb_press_before_disagreement", "Presses a thumb into the opposite palm before disagreeing."],
    ["fingertips_touch_while_waiting", "Touches their fingertips together while waiting to answer."],
    ["finger_uncurl_before_request", "Slowly uncurls one finger before making a request."],
    ["palm_open_during_clarification", "Opens one palm briefly when clarifying a point."],
    ["hands_fold_after_explanation", "Folds their hands together at the end of an explanation."],
    ["knuckle_brush_after_awkwardness", "Brushes a thumb across their own knuckles after an awkward exchange."],
    ["wrist_turn_before_objection", "Turns one wrist slightly before raising an objection."],
    ["finger_count_for_list", "Counts a short list on their fingers, starting with the little finger."],
    ["hands_lower_after_emphasis", "Lowers both hands together immediately after emphasizing a point."],
    ["finger_trace_own_palm", "Traces a small circle on their own palm during a conversational lull."],
  ],
  face: [
    ["lips_press_before_disagreement", "Briefly presses their lips together before disagreeing."],
    ["brow_raise_before_clarification", "Raises one eyebrow before asking for clarification."],
    ["nose_wrinkle_at_unfamiliar_word", "Wrinkles their nose slightly when repeating an unfamiliar word."],
    ["mouth_corner_after_dry_remark", "Lifts one corner of their mouth after a dry remark."],
    ["slow_blink_before_reply", "Blinks once, slowly, before replying to a direct question."],
    ["cheek_puff_during_wait", "Briefly puffs their cheeks during a pause in conversation."],
    ["jaw_shift_before_refusal", "Shifts their jaw slightly before stating a refusal."],
    ["eyes_narrow_at_small_detail", "Narrows their eyes briefly when inspecting a small visible detail."],
    ["lips_part_before_interruption", "Parts their lips a beat before interrupting, then starts speaking."],
    ["blink_twice_after_surprise", "Blinks twice in quick succession after a visibly surprising remark."],
  ],
  head: [
    ["head_tilt_at_unfamiliar_question", "Tilts their head slightly before answering an unfamiliar question."],
    ["chin_lift_before_serious_statement", "Lifts their chin a little before a serious statement."],
    ["nod_once_after_agreement", "Adds one small nod after speaking an agreement."],
    ["head_shake_after_no", "Shakes their head once after saying no, rather than before."],
    ["ear_turn_to_quiet_speaker", "Turns one ear toward a quiet speaker before answering."],
    ["chin_tuck_at_personal_question", "Tucks their chin briefly when addressed with a personal question."],
    ["head_level_before_correction", "Levels their head before correcting a spoken detail."],
    ["nod_twice_when_acknowledging", "Acknowledges a short instruction with two small nods."],
    ["head_turn_last_word", "Turns their head toward the listener on the last word of a reply."],
    ["chin_side_after_unfinished_sentence", "Moves their chin slightly to one side after leaving a sentence unfinished."],
  ],
  posture: [
    ["shoulders_square_before_request", "Squares their shoulders briefly before making a request."],
    ["lean_forward_for_quiet_reply", "Leans forward a little when giving a quiet reply."],
    ["lean_back_after_explanation", "Leans back slightly after finishing an explanation."],
    ["shoulder_drop_after_sigh", "Lets one shoulder drop just after a small sigh."],
    ["stand_still_before_greeting", "Becomes still for a beat before returning a greeting."],
    ["weight_shift_while_waiting", "Shifts their weight once from heel to toe while waiting."],
    ["elbows_close_before_refusal", "Draws their elbows closer to their sides before refusing."],
    ["spine_straight_before_formal_reply", "Straightens their posture before a formal reply."],
    ["one_shoulder_turn_to_listener", "Angles one shoulder toward the listener during a long answer."],
    ["small_shrug_after_uncertainty", "Adds a small, one-sided shrug after saying they do not know."],
  ],
  pause: [
    ["pause_before_name", "Leaves a short pause just before addressing someone by an established name."],
    ["pause_after_disagreement", "Leaves a beat of silence after a spoken disagreement."],
    ["pause_before_final_list_item", "Pauses briefly before the final item of a spoken list."],
    ["pause_between_question_and_addendum", "Waits a beat after a question before adding a qualification."],
    ["pause_after_quoted_word", "Pauses briefly after quoting a word that was just said."],
    ["pause_before_self_correction", "Stops for a beat before correcting their own wording."],
    ["silent_count_before_long_answer", "Waits through two quiet beats before a long answer."],
    ["pause_before_thanks", "Leaves a small pause before saying thank you."],
    ["pause_at_sentence_join", "Leaves a small pause between the two halves of a long sentence."],
    ["pause_after_listener_finishes", "Lets a short silence follow the listener's last word before replying."],
  ],
  cadence: [
    ["soften_last_word_of_reply", "Softens the last word of a short reply."],
    ["slow_first_word_of_correction", "Speaks the first word of a correction a little more slowly."],
    ["repeat_question_word", "Repeats one word from a question before giving the answer."],
    ["lower_volume_for_aside", "Lowers their voice slightly for a brief aside."],
    ["separate_list_items_evenly", "Spaces the items of a spoken list with an even cadence."],
    ["draw_out_opening_vowel", "Draws out the opening vowel of a hesitant reply."],
    ["clip_final_syllable_of_no", "Clips the final syllable when giving a brief refusal."],
    ["slow_down_at_quoted_phrase", "Slows slightly when repeating a phrase from the current conversation."],
    ["quiet_restart_after_interruption", "Restarts an interrupted sentence more quietly."],
    ["stress_second_word_of_thanks", "Places a light emphasis on the second word of thank you."],
  ],
  movement: [
    ["heel_lift_during_lull", "Lifts and lowers one heel during a conversational lull."],
    ["toe_turn_before_departure", "Turns one foot toward the way out before an already established departure."],
    ["half_step_after_greeting", "Takes a small half-step back after exchanging a greeting."],
    ["foot_settle_before_reply", "Settles both feet before replying at length."],
    ["hand_hover_before_pointing", "Lets a hand hover briefly before pointing to something already visible."],
    ["small_wave_after_farewell", "Adds a small, low wave after a spoken farewell."],
    ["fingertip_touch_chin_before_answer", "Touches a fingertip to their chin before answering."],
    ["hand_sweep_end_of_account", "Ends a short account with a small outward sweep of one hand."],
    ["breath_out_before_restart", "Breathes out briefly before restarting a sentence."],
    ["hand_draw_back_after_question", "Draws one hand back toward their chest after asking a question."],
  ],
};
export const MANNERISM_SEEDS: readonly Readonly<MannerismSeed>[] = Object.freeze(Object.entries(groups).flatMap(([category, rows]) =>
  rows.map(([canonical_key, text]) => Object.freeze({ canonical_key, text, category: category as MannerismCategory }))));

/** Static review guard for obvious prerequisite/inference patterns; not an arbitrary free-text semantic classifier. */
export const UNSAFE_SEED_PATTERN = /\b(?:doll|ring|jewel\w*|bracelet|necklace|weapon\w*|sword|knife|book\w*|tool\w*|pet|scar\w*|injur\w*|wound\w*|illness|mother|father|sister|brother|family|gift|uniform|sleeve\w*|clothes|clothing|prayer|rosary|guild|trade|occupation|lover|sexual|consent|attraction|submiss\w*|dominan\w*|loyal\w*|ideolog\w*)\b/i;
export function reviewMannerismSeeds(seeds: readonly Readonly<MannerismSeed>[] = MANNERISM_SEEDS) {
  const seen = new Set<string>(), duplicate_canonical_keys: string[] = [], rejected_unsafe_seeds: string[] = [];
  const categories: Record<string, number> = {};
  for (const s of seeds) {
    categories[s.category] = (categories[s.category] ?? 0) + 1;
    if (seen.has(s.canonical_key)) duplicate_canonical_keys.push(s.canonical_key); seen.add(s.canonical_key);
    if (s.requires_item_id || s.requires_entity_id || UNSAFE_SEED_PATTERN.test(s.text) || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(s.canonical_key) || !s.text.trim() || s.text.length > 160) rejected_unsafe_seeds.push(s.canonical_key);
  }
  return { seed_count: seeds.length, categories, rejected_unsafe_seeds, duplicate_canonical_keys };
}
