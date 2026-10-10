import type { CampaignCommand } from "../campaign/types.js";
import { isDeepStrictEqual } from "node:util";
import { transferRecipient } from "../campaign/item-transfer.js";
import { CONDITION_TERMS, PHYSICAL_CONDITIONS } from "./physical-interaction.js";
import type { TurnDiagnostics } from "./turn-diagnostics.js";
import type { AuthorizationDiagnostic, TurnDebugRecord, TurnEvent, TurnResult } from "./turn-types.js";

/**
 * Consolidation Pass B: a DERIVED, diagnostics-only reading of one finished turn that answers "why did (or didn't) this durable
 * mutation commit?" from data the pipeline already produces (TurnResult, the turn_failed event, the opt-in TurnDiagnostics record,
 * the opt-in debug records). It adds no stage, no persisted field and no provider call, is never given to the Narrator, the
 * Controller or the player, and changes no authorization decision. Pure and deterministic.
 */
export type MutationFailureCode =
  /** The Controller returned `{commands:[]}` although the player's action resolved to a durable candidate. */
  | "controller_no_command"
  /** The Controller output could not be parsed under the strict envelope (or the provider failed before one existed). */
  | "controller_parse_failure"
  /** The Controller call failed before any output existed (timeout, network, authentication, refusal): nothing to parse. */
  | "controller_provider_failure"
  /** A parsed command that is semantically wrong for this turn: not any resolved player intent, bad reference/state, unsupported shape. */
  | "controller_invalid_command"
  /** A well-formed command whose confirmation (grammar or verified quote) is missing. */
  | "insufficient_confirmation"
  /** The narration contradicts the mutation: refusal, retraction, hedge. */
  | "contradictory_evidence"
  /** The quote exists but the narration hedges, negates or leaves the act hypothetical ("maybe she will take it"). */
  | "ambiguous_evidence"
  /** The player reference itself was ambiguous, so no command can be matched to one intent. */
  | "ambiguous_reference"
  /** A command kind the authorizer never lets the Controller write (for example anything about Nicco's feelings). */
  | "unauthorized_mutation"
  /** The state already is what the command would make it; a benign no-op rather than a failure. */
  | "already_established"
  | "stale_revision"
  /** `campaign.prepare` rejected the authorized batch (the whole turn failed; nothing was committed). */
  | "prepare_failure"
  /** The commit-preparation / commit step failed. */
  | "commit_failure"
  | "campaign_validation_failure"
  /** Two commands of one proposal contradict each other (same item handed off and lent, two recipients, two positions). Observability only: if prepare rejects the batch the whole turn fails; if every command is authorized they apply in proposal order. */
  | "conflicting_commands"
  | "turn_failed_other";
export type MutationStage = "controller" | "authorization" | "prepare" | "commit" | "committed" | "none";
export interface MutationCommandOutcome {
  readonly command: CampaignCommand; readonly authorized: boolean; readonly reason: AuthorizationDiagnostic["reason"];
  readonly code?: MutationFailureCode; readonly detail: string; readonly source?: AuthorizationDiagnostic["source"];
  readonly evidence?: { readonly quote: string | null; readonly verified: boolean; readonly check: string };
}
export interface MutationDiagnostic {
  /** The stage that decided the outcome. */
  readonly stage: MutationStage;
  readonly verdict: "committed" | "nothing_intended" | "nothing_proposed" | "rejected" | "no_change" | "turn_failed";
  readonly code?: MutationFailureCode;
  /** Durable candidates the player's action resolved to (explicit intent). */
  readonly intended: readonly CampaignCommand[];
  readonly proposed: readonly CampaignCommand[];
  readonly accepted: readonly MutationCommandOutcome[];
  readonly rejected: readonly MutationCommandOutcome[];
  readonly revision_before: number; readonly revision_after: number;
  readonly notes: readonly string[];
  /** Pairs of commands in the proposal that contradict each other. Derived, diagnostics-only; empty when none. */
  readonly conflicts?: readonly CommandConflict[];
  readonly failure?: { readonly turn_failure: string; readonly provider_code?: string; readonly phase?: string };
}
export interface MutationDiagnosticInput {
  readonly result?: TurnResult;
  readonly failed?: Extract<TurnEvent, { type: "turn_failed" }>;
  readonly diagnostics?: Pick<TurnDiagnostics, "failure_phase" | "failure_code" | "provider_code">;
  readonly debug?: readonly TurnDebugRecord[];
  /** The Controller proposal, for a failed turn (a failed turn carries no result). */
  readonly proposal?: readonly CampaignCommand[];
}
export interface CommandConflict { readonly code: "conflicting_commands"; readonly subject: string; readonly detail: string; readonly indexes: readonly [number, number] }

/**
 * Pairs of commands that cannot both hold. The batch is applied atomically (no per-command partial prepare), so any such pair fails
 * the whole turn at preparation; this only names the pair. Exact repeats are not conflicts (they are deduplicated upstream).
 */
export function conflictingCommands(commands: readonly CampaignCommand[]): readonly CommandConflict[] {
  const out: CommandConflict[] = [];
  for (let a = 0; a < commands.length; a++) for (let b = a + 1; b < commands.length; b++) {
    const x = commands[a]!, y = commands[b]!;
    if (isDeepStrictEqual(x, y)) continue;
    if (x.kind === "transfer_item" && y.kind === "transfer_item" && x.item_id === y.item_id) {
      const rx = transferRecipient(x), ry = transferRecipient(y);
      out.push({ code: "conflicting_commands", subject: x.item_id, indexes: [a, b],
        detail: x.mode !== y.mode ? `item ${x.item_id} is both ${x.mode} and ${y.mode}` : rx !== ry ? `item ${x.item_id} goes to two recipients (${rx} and ${ry})` : `item ${x.item_id} has two different transfer commands` });
    } else if (x.kind === "place_item" && y.kind === "place_item" && x.item_id === y.item_id)
      out.push({ code: "conflicting_commands", subject: x.item_id, indexes: [a, b], detail: `item ${x.item_id} is placed in two different positions` });
    else if ((x.kind === "transfer_item" && y.kind === "place_item" || x.kind === "place_item" && y.kind === "transfer_item") && x.item_id === y.item_id)
      out.push({ code: "conflicting_commands", subject: x.item_id, indexes: [a, b], detail: `item ${x.item_id} is both transferred and placed` });
  }
  return out;
}

const CODE_BY_REASON: Readonly<Partial<Record<AuthorizationDiagnostic["reason"], MutationFailureCode>>> = {
  rejected_insufficient_confirmation: "insufficient_confirmation", rejected_fact_not_communicated: "insufficient_confirmation",
  rejected_incomplete_group_proposal: "insufficient_confirmation", rejected_evidence_partial_group: "insufficient_confirmation",
  rejected_recipient_refused: "contradictory_evidence", rejected_ambiguous_reference: "ambiguous_reference",
  rejected_controller_mismatch: "controller_invalid_command", rejected_reference_invalid: "controller_invalid_command",
  rejected_equipment_not_established: "controller_invalid_command", rejected_time_not_exact: "controller_invalid_command",
  rejected_command_not_allowed: "unauthorized_mutation", rejected_already_established: "already_established",
};
const HEDGE_CHECKS: ReadonlySet<string> = new Set(["sentence_hedged_negated_or_hypothetical", "transfer_not_completed", "quoted_statement_hedged_or_question"]);
function describe(d: AuthorizationDiagnostic, intended: readonly CampaignCommand[], physical?: readonly unknown[], narration = ""): string {
  const c = d.command, check = d.evidence?.check;
  if (d.authorized) return `authorized via ${d.source ?? "grammar"}${check ? ` (evidence: ${check})` : ""}`;
  // Sub-reasons that the coarse authorization reason hides. All derived from the same data the authorizer saw.
  if (c.kind === "transfer_item") {
    const sameObject = intended.find(i => i.kind === "transfer_item" && i.item_id === c.item_id && transferRecipient(i) === transferRecipient(c));
    if (sameObject && !isDeepStrictEqual(sameObject, c) && sameObject.kind === "transfer_item") return `transfer mode mismatch: proposed "${c.mode}" but the player's resolved intent is "${sameObject.mode}"`;
    if (!sameObject && intended.some(i => i.kind === "transfer_item" && i.item_id === c.item_id)) return "transfer recipient differs from the player's resolved intent";
    if (!sameObject && intended.some(i => i.kind === "transfer_item" && transferRecipient(i) === transferRecipient(c))) return "transfer item differs from the player's resolved intent";
    if (!intended.some(i => i.kind === "transfer_item")) return "no transfer was resolved from the player's action";
  }
  if (c.kind === "set_condition" && d.reason === "rejected_reference_invalid") {
    if (d.evidence?.check === "condition_not_in_vocabulary") return `condition tag outside the closed vocabulary (${PHYSICAL_CONDITIONS.join(", ")})`;
    if (!physical?.length) return "no same-turn physical interaction was resolved from the player's action (unstarred or unsupported phrasing?)";
    return "condition list drops an existing condition, adds nothing new, sets status/presentation, or the target is absent";
  }
  if (c.kind === "set_condition" && check === "condition_term_missing") {
    const present = PHYSICAL_CONDITIONS.filter(t => CONDITION_TERMS[t].test(narration));
    return `the quoted sentence has no narrated term for ${c.conditions.filter(t => !["recovering"].includes(t)).join("/")}; terms present anywhere in the draft: ${present.length ? present.join("/") : "none"}`;
  }
  if (c.kind === "set_condition" && d.reason === "rejected_insufficient_confirmation") return `condition needs a verified quote${check ? ` (${check})` : ""}`;
  return check && !d.evidence?.verified ? `evidence check failed: ${check}` : d.reason;
}

/** Classify one finished turn. Never throws; an input with neither result nor failure yields verdict "no_change". */
export function diagnoseMutation(i: MutationDiagnosticInput): MutationDiagnostic {
  const notes: string[] = [];
  if (i.failed) {
    const f = i.failed, phase = i.diagnostics?.failure_phase;
    const code: MutationFailureCode = f.code === "stale_turn" ? "stale_revision"
      : f.code === "controller_failed" ? (f.provider_code === "structured_output_invalid" ? "controller_parse_failure" : "controller_provider_failure")
      : f.code === "campaign_validation_failed" ? (phase === "preparation" || phase === "commit_preparation" ? "prepare_failure" : phase === "commit" ? "commit_failure" : "campaign_validation_failure")
      : "turn_failed_other";
    const parse = i.debug?.find(d => d.kind === "controller_parse_failure");
    if (f.code === "controller_failed") notes.push(parse ? `controller output rejected by the strict envelope (${(parse as { parse_error?: string }).parse_error?.split(":")[0] ?? f.provider_code ?? "unparseable"})` : `controller failed before a parsed proposal existed (${f.provider_code ?? "provider error"})`);
    const failedConflicts = code === "prepare_failure" || code === "campaign_validation_failure" ? conflictingCommands(i.proposal ?? []) : [];
    for (const c of failedConflicts) notes.push(`conflicting commands: ${c.detail}`);
    return { ...(failedConflicts.length ? { conflicts: failedConflicts } : {}), stage: f.code === "controller_failed" ? "controller" : code === "commit_failure" ? "commit" : code === "stale_revision" ? "prepare" : code === "turn_failed_other" ? "none" : "prepare", verdict: "turn_failed", code,
      intended: [], proposed: [], accepted: [], rejected: [], revision_before: f.base_revision, revision_after: f.final_revision, notes,
      failure: { turn_failure: f.code, ...(f.provider_code ? { provider_code: f.provider_code } : {}), ...(phase ? { phase } : {}) } };
  }
  const r = i.result;
  if (!r) return { stage: "none", verdict: "no_change", intended: [], proposed: [], accepted: [], rejected: [], revision_before: 0, revision_after: 0, notes: ["no turn result"] };
  const intended = r.turn_evidence.player_intents, proposed = r.controller_proposal;
  const outcomes = r.authorization.map((d): MutationCommandOutcome => {
    const hedged = !d.authorized && d.reason === "rejected_insufficient_confirmation" && !!d.evidence?.quote && HEDGE_CHECKS.has(d.evidence.check);
    const code = hedged ? "ambiguous_evidence" as const : CODE_BY_REASON[d.reason];
    return { command: d.command, authorized: d.authorized, reason: d.reason, ...(d.authorized || !code ? {} : { code }), detail: describe(d, intended, r.turn_evidence.physical_interactions, r.narration_reconciliation?.draft ?? r.narration),
      ...(d.source ? { source: d.source } : {}), ...(d.evidence ? { evidence: d.evidence } : {}) };
  });
  const accepted = outcomes.filter(o => o.authorized), rejected = outcomes.filter(o => !o.authorized);
  const conflicts = conflictingCommands(proposed);
  for (const c of conflicts) notes.push(`conflicting commands: ${c.detail}${r.final_revision > r.base_revision ? " (all were authorized and applied in proposal order, so the later command determined the final state)" : ""}`);
  const base = { intended, proposed, accepted, rejected, revision_before: r.base_revision, revision_after: r.final_revision, notes, ...(conflicts.length ? { conflicts } : {}) } as const;
  if (r.turn_evidence.narrator_refusals.length) notes.push(`narration refusals: ${r.turn_evidence.narrator_refusals.length}`);
  if (!proposed.length && intended.length) {
    const confirmed = intended.map((_, n) => r.turn_evidence.narrator_confirmations.some(c => c.command_indexes.includes(n)));
    const refused = intended.map((_, n) => r.turn_evidence.narrator_refusals.some(x => x.command_indexes.includes(n)));
    if (refused.every(Boolean)) notes.push("empty proposal is consistent with the narration: every intended mutation was refused");
    else if (confirmed.some(Boolean)) notes.push("CONTROLLER OMISSION: the narration grammar confirms an intended mutation that the Controller did not propose");
    else notes.push("no narration confirmation was recognised for the intended mutation; the Controller may have judged it not completed (not decidable without the narration semantics)");
    return { stage: "controller", verdict: "nothing_proposed", code: "controller_no_command", ...base };
  }
  if (!proposed.length) {
    // The audit may have redacted an uncommitted injury from the delivered text; the draft is what the Controller saw.
    const seen = r.narration_reconciliation?.draft ?? r.narration, tags = PHYSICAL_CONDITIONS.filter(t => CONDITION_TERMS[t].test(seen));
    if (r.turn_evidence.physical_interactions?.length && tags.length) {
      notes.push(`possible CONTROLLER OMISSION (condition): the player's physical act was resolved and the narration contains ${tags.join("/")} terms, but no set_condition was proposed`);
      return { stage: "controller", verdict: "nothing_proposed", code: "controller_no_command", ...base };
    }
    if (r.turn_evidence.physical_interactions?.length) notes.push("physical act resolved but the narration states no supported condition: no durable mutation expected");
    return { stage: "none", verdict: "nothing_intended", ...base };
  }
  if (r.final_revision > r.base_revision && accepted.some(a => a.reason !== "rejected_already_established")) return { stage: "committed", verdict: "committed", ...base };
  if (rejected.length) {
    const primary = rejected.find(o => o.code && o.code !== "already_established") ?? rejected[0]!;
    return { stage: "authorization", verdict: "rejected", ...(primary.code ? { code: primary.code } : {}), ...base };
  }
  return { stage: "none", verdict: "no_change", ...base };
}
