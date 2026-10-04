import { createHash } from "node:crypto";
import type { CharacterMannerism, MannerismEpistemicState } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { mannerismEpistemicState } from "../campaign/mannerisms.js";
import { escapeRegExp } from "./language/text.js";

export type PortrayalRule = "OUT_OF_TRIGGER" | "UNSUPPORTED_RECURRENCE" | "UNSUPPORTED_AWARENESS";
export interface PackedMannerism {
  character_id: string; character_name: string; mannerism: DeepReadonly<CharacterMannerism>;
  /** Already-authorized local presentation; never arbitrary campaign/private lore. */
  local_evidence?: string | undefined;
}
export interface PortrayalGateInput {
  turn_id: string; revision: number; narration: string; cues: readonly PackedMannerism[];
  characters: readonly { id: string; name: string }[]; player_input: string;
  /** Evaluation/debug only. Ordinary diagnostics retain action-only spans and structured reasons. */
  include_local_text?: boolean;
}
export interface PortrayalFinding {
  event_id: string; turn_id: string; revision: number; character_id: string; character_name: string;
  mannerism_id: string; canonical_key: string; mannerism_text: string; mannerism_source: CharacterMannerism["source"];
  epistemic_state_at_generation: MannerismEpistemicState; known_by_at_generation: readonly string[];
  gate_rule: PortrayalRule; matched_narration_span: string; local_context: string; narration_hash: string;
  expected_trigger: string; trigger_evidence_found: boolean; recurrence_claim_found: boolean;
  awareness_speaker_id?: string; reason: "explicit_silent_preword_pause" | "explicit_confirmation_not_correction" | "explicit_no_lie" | "habit_claim_without_established_recurrence" | "recognition_without_authorized_observer";
}
export interface PortrayalGateDiagnostics {
  mode: "shadow"; status: "inspected" | "invalid_input";
  mannerism_cues_packed: number; conditional_cues_packed: number;
  epistemic_states_packed: Record<MannerismEpistemicState, number>;
  gate_findings_total: number; findings_by_rule: Record<PortrayalRule, number>; findings: readonly PortrayalFinding[];
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
type Family = "name_pause" | "spoken_correction" | "obvious_lie";
function family(text: string): Family | undefined {
  if (/pause.*before.*(?:address|name)/i.test(text)) return "name_pause";
  if (/level.*head.*before.*correct.*spoken/i.test(text)) return "spoken_correction";
  if (/lower.*gaze.*before.*obvious lie/i.test(text)) return "obvious_lie";
  return undefined;
}
/** Finite, conservative shadow observer. It has no mutation, delivery, reconciliation or provider capability. */
export class MannerismPortrayalGate {
  inspect(input: PortrayalGateInput): PortrayalGateDiagnostics {
    const result: PortrayalGateDiagnostics = { mode: "shadow", status: "inspected", mannerism_cues_packed: 0, conditional_cues_packed: 0,
      epistemic_states_packed: { emergent: 0, observed: 0, established: 0 }, gate_findings_total: 0,
      findings_by_rule: { OUT_OF_TRIGGER: 0, UNSUPPORTED_RECURRENCE: 0, UNSUPPORTED_AWARENESS: 0 }, findings: [] };
    // Defensive failure is diagnostics only; it never escapes into the turn lifecycle.
    try {
      if (typeof input.narration !== "string" || input.narration.length > 24000 || !Array.isArray(input.cues) || input.cues.length > 256) throw new Error("bounded input required");
      const findings: PortrayalFinding[] = [];
      for (const cue of input.cues) {
        const m = cue.mannerism, state = mannerismEpistemicState(m), f = family(m.text);
        result.mannerism_cues_packed++; result.epistemic_states_packed[state]++;
        if (/\b(?:before|after|when|while|during)\b/i.test(m.text)) result.conditional_cues_packed++;
        if (!f) continue; // Unsupported families are exposures, not invented semantic detections.
        const verb = f === "name_pause" ? "(?:leaves?|left)\\s+(?:a\\s+)?(?:short|brief)\\s+pause|pauses?|paused" : f === "spoken_correction" ? "levels?\\s+(?:her|his|their)\\s+head|leveled\\s+(?:her|his|their)\\s+head" : "(?:lowers?|lowered|drops?|dropped)\\s+(?:her|his|their|its)\\s+(?:gaze|eyes)|(?:stony\\s+)?gaze\\s+(?:dips?|drops?)";
        const pattern = new RegExp(`\\b(${escapeRegExp(cue.character_name)}|She|He|Then the construct)\\s+(?:${verb})\\b`, "gi");
        for (const match of input.narration.matchAll(pattern)) {
          const offset = match.index!, paragraphStart = input.narration.lastIndexOf("\n\n", offset) + 2;
          const start = Math.max(0, paragraphStart === 1 ? 0 : paragraphStart), endMarker = input.narration.indexOf("\n\n", offset);
          const paragraph = input.narration.slice(start, endMarker < 0 ? input.narration.length : endMarker);
          if (match[1]!.toLowerCase() !== cue.character_name.toLowerCase()) {
            const subjects = input.characters.filter(c => new RegExp(`\\b${escapeRegExp(c.name)}\\b`, "i").test(input.narration.slice(start, offset)));
            if (subjects.length !== 1 || subjects[0]!.id !== cue.character_id) continue;
          }
          // Reported/quoted actions are not the narrator performing this cue.
          const beforeAction = paragraph.slice(0, offset - start);
          if ((beforeAction.match(/"/g)?.length ?? 0) % 2 || beforeAction.lastIndexOf("?") > beforeAction.lastIndexOf("?")) continue;
          const local = paragraph.slice(Math.max(0, offset - start - 240), offset - start + match[0].length + 420);
          const context = `${input.player_input} ${cue.local_evidence ?? ""}`;
          const quoted = [...paragraph.matchAll(/["“]([^"”]+)["”]/g)].map(q => q[1]!).join(" ");
          const namedAddress = new RegExp(`["“]\\s*(?:${input.characters.filter(c => c.id !== cue.character_id).map(c => escapeRegExp(c.name)).join("|") || "(?!)"})\\b`, "i").test(paragraph);
          const correction = /\b(?:corrects?|correcting|mistaken|false statement)\b/i.test(quoted) || /about to correct/i.test(cue.local_evidence ?? "");
          const lie = /\b(?:knowingly false|obvious (?:nonverbal )?lie|before (?:telling )?(?:an obvious |a )lie)\b/i.test(context) || /\b(?:tells?|telling) (?:an obvious |a )lie\b/i.test(local);
          const trigger = f === "name_pause" ? namedAddress : f === "spoken_correction" ? correction : lie;
          const actionClause = paragraph.slice(offset - start, offset - start + match[0].length + 160).split(/[.!?\n]/, 1)[0]!;
          const habit = /\b(?:habitual|usual (?:gesture|pause|movement)|familiar (?:gesture|movement)|always does|does that sometimes)\b/i.test(actionClause);
          let reason: PortrayalFinding["reason"] | undefined;
          if (!trigger && f === "name_pause" && /no(?:body| one).*?(?:speaking|address)|no conversation/i.test(context) && /(?:habitual|precede words|before speak)/i.test(local) && !quoted) reason = "explicit_silent_preword_pause";
          if (!trigger && f === "spoken_correction" && /factually correct|accurate|no mistaken detail/i.test(context) && /\b(?:agrees?|confirm(?:ing|ation)?|it is|another day)\b/i.test(local)) reason = "explicit_confirmation_not_correction";
          if (!trigger && f === "obvious_lie" && /no (?:false claim|lie)|sincere thanks/i.test(context)) reason = "explicit_no_lie";
          const add = (rule: PortrayalRule, why: PortrayalFinding["reason"], speaker?: string) => {
            if (findings.length >= 64) return;
            findings.push({ event_id: `${input.turn_id}:portrayal:${findings.length + 1}`, turn_id: input.turn_id, revision: input.revision,
              character_id: cue.character_id, character_name: cue.character_name, mannerism_id: m.id, canonical_key: m.canonical_key, mannerism_text: m.text,
              mannerism_source: m.source, epistemic_state_at_generation: state, known_by_at_generation: Object.freeze([...(m.known_by_character_ids ?? [])]),
              gate_rule: rule, matched_narration_span: match[0], local_context: input.include_local_text ? local : `${match[0]}; reason=${why}`,
              narration_hash: hash(input.narration), expected_trigger: f, trigger_evidence_found: trigger, recurrence_claim_found: habit,
              ...(speaker ? { awareness_speaker_id: speaker } : {}), reason: why });
          };
          if (reason) add("OUT_OF_TRIGGER", reason);
          if (habit && state !== "established") add("UNSUPPORTED_RECURRENCE", "habit_claim_without_established_recurrence");
          // Only explicitly bound speaker + habitual reference in the same local paragraph; no guessed pronoun antecedents.
          for (const speaker of input.characters.filter(c => c.id !== cue.character_id)) {
            const awareness = new RegExp(`${escapeRegExp(speaker.name)}\\s+(?:says|said)[^"“]{0,30}["“][^"”]{0,160}\\b(?:always does that|does that sometimes|usual gesture)\\b`, "i");
            if (awareness.test(local) && !(m.known_by_character_ids ?? []).includes(speaker.id)) add("UNSUPPORTED_AWARENESS", "recognition_without_authorized_observer", speaker.id);
          }
        }
      }
      result.findings = Object.freeze(findings.map(f => Object.freeze(f)));
      result.gate_findings_total = findings.length;
      for (const f of findings) result.findings_by_rule[f.gate_rule]++;
    } catch { result.status = "invalid_input"; result.findings = []; result.gate_findings_total = 0; }
    return result;
  }
}
