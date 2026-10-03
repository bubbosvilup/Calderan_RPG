import { isDeepStrictEqual as equal } from "node:util";
import type { CampaignCommand } from "../campaign/types.js";

/** Identity-blind multiset scoring; optional engine-owned commands never inflate controller recall. */
export function scoreControllerCommands(proposed: readonly CampaignCommand[], expected: readonly CampaignCommand[], optional: readonly CampaignCommand[] = []) {
  const remaining = [...expected], optionalRemaining = [...optional];
  const true_positives: CampaignCommand[] = [], false_positives: CampaignCommand[] = [], engine_owned_proposals: CampaignCommand[] = [], duplicate_proposals: CampaignCommand[] = [];
  proposed.forEach((command, index) => {
    if (proposed.slice(0, index).some(c => equal(c, command))) duplicate_proposals.push(command);
    const i = remaining.findIndex(c => equal(c, command));
    if (i >= 0) { true_positives.push(command); remaining.splice(i, 1); return; }
    const j = optionalRemaining.findIndex(c => equal(c, command));
    if (j >= 0) { engine_owned_proposals.push(command); optionalRemaining.splice(j, 1); return; }
    false_positives.push(command);
  });
  return { true_positives, false_positives, false_negatives: remaining, engine_owned_proposals, duplicate_proposals, exact_match: !remaining.length && !false_positives.length };
}

export type ProposalSeverity = "severe" | "moderate" | "low";
/** Severity never erases errors. Invented IDs, wrong actors and unsupported knowledge remain severe even when rejected. */
export function falseProposalSeverity(command: CampaignCommand, knownIds: ReadonlySet<string>, duplicate: boolean, expected: readonly CampaignCommand[] = [], alreadyEstablished = false): ProposalSeverity {
  const ids: string[] = [];
  const walk = (v: unknown): void => { if (!v || typeof v !== "object") return; for (const [k, x] of Object.entries(v)) { if (k.endsWith("_id") && typeof x === "string") ids.push(x); else walk(x); } };
  walk(command);
  if (ids.some(id => !knownIds.has(id))) return "severe";
  if (duplicate || alreadyEstablished) return "moderate";
  const subject = (c: CampaignCommand): string | undefined => c.kind === "adjust_relationship" ? `${c.from_character_id}:${c.to_character_id}` : c.kind === "set_knowledge" ? c.knowledge.character_id : "character_id" in c ? c.character_id : c.kind === "transfer_item" ? `${c.item_id}:${c.owner_id}` : undefined;
  const sameKind = expected.filter(e => e.kind === command.kind);
  if (sameKind.length && subject(command) && sameKind.every(e => subject(e) !== subject(command))) return "severe";
  if (command.kind === "set_knowledge") return "severe";
  if (command.kind === "adjust_relationship") return "moderate";
  if (command.kind === "move_character" || command.kind === "leave_scene") return "moderate";
  return command.kind === "place_item" || command.kind === "schedule_event" ? "low" : "severe";
}

export function latencyStats(values: readonly number[]) {
  if (!values.length) return { n: 0, mean_ms: null, median_ms: null, p95_ms: null };
  const v = [...values].sort((a, b) => a - b), n = v.length;
  return { n, mean_ms: v.reduce((s, x) => s + x, 0) / n, median_ms: (v[Math.floor((n - 1) / 2)]! + v[Math.floor(n / 2)]!) / 2, p95_ms: v[Math.ceil(n * .95) - 1]! };
}
