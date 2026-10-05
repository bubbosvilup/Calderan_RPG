import { narratorIdentityGate } from "../narrator-identity.js";
import type { CampaignCommand, CampaignSnapshot } from "../../campaign/types.js";
import type { DeepReadonly } from "../../types/readonly.js";
import type { WorldStore } from "../../world/world-store.js";
import type { TurnContext } from "../context-builder.js";
import { auditNarration, outcomeLines, redactNarration, revisionRequest, type AuditIssue } from "../narration-audit.js";
import { projectKnowledgeAccess, type NarrativeKnowledgeAccess } from "../narrative-authority.js";
import { relevanceSignals } from "../prompt-builder.js";
import type { RecentExchange } from "../recent-conversation.js";
import type { SceneParticipantPlan } from "../scene-participants.js";
import { characterView } from "../../campaign/projections.js";
import { escapeRegExp } from "../language/text.js";
import { deriveTurnEvidence, type TurnEvidence } from "../turn-evidence.js";
import type { AuthorizationDiagnostic } from "../turn-types.js";
import type { TurnIntent } from "./intent.js";
import type { DraftGenerator, NarratorRequest } from "./narration.js";

/**
 * Hardening H2 — AuditStage. Owns narration validation and reconciliation: the delivered narration must not assert what the engine
 * rejected, voice facts a character cannot use, place absent people in the scene, or establish unrecorded consequences (grounding,
 * transfers, purchases, household, conditions, constraints, presence, departures — all inside auditNarration). One bounded revision
 * with the authoritative outcome; if the revision still fails, deterministic redaction. This stage NEVER changes state: it runs on
 * the already-prepared candidate and only decides which text is delivered.
 */

/** What is delivered, and how it got there. */
export interface TurnDelivery {
  /** The narrator's original draft. */
  readonly draft: string;
  /** Audit issues found in the draft. */
  readonly issues: readonly AuditIssue[];
  /** "draft": clean; "revision": the reconciliation revision passed; "redacted": the revision failed and was redacted. */
  readonly delivered: "draft" | "revision" | "redacted";
  /** The final delivered narration. */
  readonly text: string;
  /** The reconciliation revision, when one was requested. */
  readonly revision?: string;
  /** Audit issues found in the revision ([] when none was requested). */
  readonly revision_issues: readonly AuditIssue[];
  /** D-13: committed arrivals the revision (or its redaction) did not mention; one deterministic sentence each was appended to `text`. */
  readonly repaired_arrivals?: readonly string[];
}

export interface NarrationAuditor {
  /** Knowledge-access projection used by the audit (also measured in TurnResult.context_characters). */
  readonly access: NarrativeKnowledgeAccess;
  /** Sync, pure: audit issues for a narration against the prepared candidate. */
  check(narration: string, evidence: TurnEvidence): readonly AuditIssue[];
  /** Sync, pure: the authoritative outcome lines for a revision request and for redaction prose. */
  outcome(issues: readonly AuditIssue[]): { readonly revision: readonly string[]; readonly prose: readonly string[] };
  /** D-13: authorized followers who arrived with Nicco this turn (they were not already in the arrival scene): committed state the text must not omit. */
  arrivals(): readonly { readonly name: string; readonly place: string }[];
}
/** Sync. Failure mapping: the coordinator holds `campaign_validation_failed` (pre-H2 order). */
export function createNarrationAuditor(i: { readonly base_revision: number; readonly context: TurnContext; readonly world: WorldStore; readonly retrieved: unknown;
  readonly player_input: string; readonly recent: readonly RecentExchange[]; readonly intent: TurnIntent; readonly scene: SceneParticipantPlan;
  readonly turn_evidence: TurnEvidence; readonly diagnostics: readonly AuthorizationDiagnostic[]; readonly authorized: readonly CampaignCommand[];
  readonly prepared: DeepReadonly<CampaignSnapshot>; readonly origin?: string }): NarrationAuditor {
  const access = projectKnowledgeAccess(i.context, i.retrieved, relevanceSignals(i.player_input, i.recent, i.intent), i.scene);
  // Runtime Continuity Repair 1: authoritative state/canon text that may supply prices or procedures, and delivered history.
  const authoritative_text = JSON.stringify({ context: i.context, retrieved: i.retrieved });
  return {
    access,
    check: (narration, evidence) => auditNarration({ base_revision: i.base_revision, narration, context: i.context, world: i.world, access, evidence, diagnostics: i.diagnostics,
      committed: i.authorized, prepared: i.prepared, scene: i.scene, player_input: i.player_input, recent: i.recent, authoritative_text, ...(i.origin ? { origin: i.origin } : {}) }),
    outcome: issues => outcomeLines(i.context, i.turn_evidence, i.diagnostics, i.authorized, i.prepared, issues, i.player_input,
      { person: id => characterView(i.prepared, i.world, id).profile.name ?? i.prepared.characters.find(c => c.id === id)?.origin_snapshot?.label, place: id => i.world.getEntity(id)?.display_name }),
    arrivals: () => {
      const here = i.prepared.runtime.scene.player_location, place = i.world.getEntity(here)?.display_name ?? here, already = new Set(i.context.characters.map(c => c.id));
      return [...new Map(i.authorized.flatMap(c => c.kind === "move_character" && c.location_id === here && !already.has(c.character_id)
        ? [[c.character_id, { name: characterView(i.prepared, i.world, c.character_id).profile.name ?? i.prepared.characters.find(x => x.id === c.character_id)?.origin_snapshot?.label ?? c.character_id, place }] as const] : [])).values()];
    },
  };
}

/** A draft delivered as is: with no issues, or (internally) before reconciliation is decided. */
export function deliverDraft(draft: string, issues: readonly AuditIssue[]): TurnDelivery {
  return { draft, issues, delivered: "draft", text: draft, revision_issues: [] };
}

/**
 * Async: one reconciliation narrator call. Failure mapping: the coordinator holds `narrator_failed` for the call, the revision audit and
 * redaction (pre-H2 order). `checkpoint` runs after the revision, so a stale or cancelled turn never delivers it.
 */
export async function reconcileNarration(i: { readonly auditor: NarrationAuditor; readonly generate: DraftGenerator; readonly checkpoint: () => void;
  readonly prompt: NarratorRequest; readonly draft: string; readonly issues: readonly AuditIssue[]; readonly outcome: { readonly revision: readonly string[]; readonly prose: readonly string[] };
  readonly intent: TurnIntent; readonly context: TurnContext }): Promise<TurnDelivery> {
  const revisionPrompt = { ...i.prompt, ...revisionRequest(i.prompt, i.draft, i.outcome.revision, i.issues) };
  const identityGate = narratorIdentityGate(i.context);
  const revision = (await i.generate(identityGate ? { ...revisionPrompt, messages: revisionPrompt.messages.map(m => ({ ...m, content: identityGate.mask(m.content) })) } : revisionPrompt)).text;
  i.checkpoint();
  const revision_issues = i.auditor.check(revision, deriveTurnEvidence(i.intent, revision, i.context));
  const text = revision_issues.length ? redactNarration(revision, revision_issues, i.outcome.prose) : revision;
  // D-13: a committed arrival is state; if the revision or its redaction no longer mentions the mover, say so deterministically (never roll state back).
  const omitted = i.auditor.arrivals().filter(a => !new RegExp(`\\b${escapeRegExp(a.name)}\\b`, "i").test(text));
  const repaired_arrivals = omitted.map(a => `${a.name} has followed Nicco to ${a.place}.`);
  return { draft: i.draft, issues: i.issues, delivered: revision_issues.length ? "redacted" : "revision",
    text: repaired_arrivals.length ? `${text.trimEnd()} ${repaired_arrivals.join(" ")}`.trim() : text, revision, revision_issues, ...(repaired_arrivals.length ? { repaired_arrivals } : {}) };
}
