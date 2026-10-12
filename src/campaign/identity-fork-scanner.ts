import type { CampaignCharacter, CampaignSnapshot } from "./types.js";
import type { DeepReadonly } from "../types/readonly.js";
import { isRetiredCharacter } from "./character-lifecycle.js";
import { mergeConflicts, type RepairConflict } from "./character-repair.js";

/**
 * Block 5B: READ-ONLY, deterministic suspicious identity-fork scanner. It looks at a snapshot and reports pairs of active persistent characters that MAY be
 * one person recorded twice (the AUTH-2 / Korvin-style fork). It is diagnostics, nothing else:
 *   - it never writes, never bumps a revision, never creates a PendingConfirmation and never proposes a repair on its own;
 *   - the same NAME alone is never enough: a pair is reported only with at least two independent non-name signals;
 *   - `confidence` is DIAGNOSTIC ONLY (it counts and weights signals); it is never an input of retire/merge, which re-check hard preconditions themselves;
 *   - every finding is marked HUMAN REVIEW REQUIRED, and `mergeability` is the read-only conflict preflight a human would see if they chose to request a merge.
 * The player character and retired characters are never part of a pair. No model is called and no prose is interpreted beyond tokenizing descriptions.
 */
type Snap = DeepReadonly<CampaignSnapshot>;
type Char = DeepReadonly<CampaignCharacter>;
export type ForkSignalKind = "name" | "same_location" | "descriptor" | "origin_provenance" | "canonical_name" | "legal_context" | "promotion_proximity";
export interface ForkSignal { readonly kind: ForkSignalKind; readonly detail: string }
export type ForkConfidence = "low" | "medium" | "high";
export interface ForkCandidate {
  readonly id: string; readonly name: string | null; readonly origin: string; readonly location: string | null; readonly promoted_revision: number | null; readonly label: string | null;
}
export interface ForkFinding {
  readonly review: "HUMAN REVIEW REQUIRED";
  readonly automatic_repair: false;
  readonly confidence: ForkConfidence;
  readonly score: number;
  /** The record created LATER (higher promotion revision, else later in the snapshot) is listed as the suspected duplicate; a human decides the direction. */
  readonly suspected_duplicate: ForkCandidate;
  readonly suspected_original: ForkCandidate;
  readonly signals: readonly ForkSignal[];
  /** Read-only preflight if the human requested `merge_character` with the suggested direction. Never executed here. */
  readonly mergeability: { readonly mergeable: boolean; readonly conflicts: readonly RepairConflict[] };
}
export interface ForkScanReport {
  readonly scanner: "identity_fork_scanner_v1";
  readonly read_only: true;
  readonly campaign_id: string;
  readonly revision: number;
  readonly characters_considered: number;
  readonly pairs_examined: number;
  readonly findings: readonly ForkFinding[];
  readonly note: "Diagnostic only. Same name alone is not evidence. Confidence is not an authority. No repair was performed or proposed.";
}

const lc = (s: string | undefined) => s?.trim().toLowerCase();
const STOP = new Set(["the", "a", "an", "and", "of", "with", "her", "his", "their", "she", "he", "is", "in", "on", "at", "to", "very", "has", "have", "long", "short"]);
const tokens = (c: Char): Set<string> => {
  const a = c.profile.appearance, parts = [a?.description, a?.build, a?.eyes, a?.skin, a?.hair?.color, a?.hair?.texture, a?.hair?.description, ...(a?.distinctive_traits ?? []), ...(a?.distinguishing_marks ?? []),
    ...(c.origin_snapshot?.established.appearance ?? []), c.origin_snapshot?.established.descriptor];
  return new Set(parts.filter((x): x is string => !!x).flatMap(x => x.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(t => !STOP.has(t)));
};
const overlap = (a: Set<string>, b: Set<string>): number => { if (!a.size || !b.size) return 0; let n = 0; for (const t of a) if (b.has(t)) n++; return n / Math.min(a.size, b.size); };
const candidate = (c: Char): ForkCandidate => ({ id: c.id, name: c.profile.name ?? null, origin: c.origin.kind, location: c.current.current_location ?? null,
  promoted_revision: c.origin_snapshot?.promoted_revision ?? null, label: c.origin_snapshot?.label ?? null });
const legalKey = (snapshot: Snap, id: string) => { const l = snapshot.legal_statuses.find(x => x.character_id === id); return l ? `${l.status}:${l.holder_id ?? ""}` : "none"; };

export function scanIdentityForks(snapshot: Snap, canonicalNames: ReadonlySet<string> = new Set()): ForkScanReport {
  const active = snapshot.characters.filter(c => c.id !== "nicco" && !snapshot.player_characters.some(p => p.character_id === c.id) && !isRetiredCharacter(c) && c.current.status !== "dead" && c.origin.kind === "created");
  const order = new Map(snapshot.characters.map((c, i) => [c.id, i] as const));
  const findings: ForkFinding[] = [];
  let pairs = 0;
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    pairs++;
    const x = active[i]!, y = active[j]!, signals: ForkSignal[] = [];
    const nx = lc(x.profile.name), ny = lc(y.profile.name);
    const sameName = !!nx && nx === ny, oneUnnamed = (!nx) !== (!ny);
    if (sameName) signals.push({ kind: "name", detail: `both are named "${x.profile.name}"` });
    else if (oneUnnamed) signals.push({ kind: "name", detail: "one record is named and the other is unnamed" });
    // A pair with two different proper names is two people (names are not identity, but two distinct names are positive evidence of distinctness).
    if (nx && ny && nx !== ny) continue;
    const corroboration: ForkSignal[] = [];
    if (x.current.current_location && x.current.current_location === y.current.current_location) corroboration.push({ kind: "same_location", detail: `both are at ${x.current.current_location}` });
    const sexOk = !x.profile.sex || !y.profile.sex || lc(x.profile.sex) === lc(y.profile.sex), speciesOk = !x.profile.species || !y.profile.species || lc(x.profile.species) === lc(y.profile.species);
    if (!sexOk || !speciesOk) continue;
    const sim = overlap(tokens(x), tokens(y));
    if (sim >= 0.5 && tokens(x).size >= 2 && tokens(y).size >= 2) corroboration.push({ kind: "descriptor", detail: `description overlap ${Math.round(sim * 100)}%` });
    const rx = x.origin_snapshot?.ephemeral_ref, ry = y.origin_snapshot?.ephemeral_ref, lx = lc(x.origin_snapshot?.label), ly = lc(y.origin_snapshot?.label);
    if ((rx && rx === ry) || (lx && lx === ly)) corroboration.push({ kind: "origin_provenance", detail: rx && rx === ry ? "same narrated origin reference" : `same promotion label "${x.origin_snapshot?.label}"` });
    const px = x.origin_snapshot?.promoted_revision, py = y.origin_snapshot?.promoted_revision;
    if (px !== undefined && py !== undefined && Math.abs(px - py) <= 3 && x.id !== y.id) corroboration.push({ kind: "promotion_proximity", detail: `promoted within ${Math.abs(px - py)} revision(s) of each other` });
    const kx = legalKey(snapshot, x.id), ky = legalKey(snapshot, y.id);
    if (kx !== ky && (kx !== "none" || ky !== "none") && corroboration.some(s => s.kind === "same_location")) corroboration.push({ kind: "legal_context", detail: "same place, but only one of them carries a legal status (typical of a bought person recorded twice)" });
    if (nx && canonicalNames.has(nx)) corroboration.push({ kind: "canonical_name", detail: "the name belongs to an authored canonical character" });
    // The name alone is NOT enough: at least two independent non-name signals are required.
    const distinct = new Set(corroboration.map(s => s.kind));
    if (distinct.size < 2) continue;
    const all = [...signals, ...corroboration];
    const score = (sameName ? 2 : oneUnnamed ? 1 : 0) + corroboration.length;
    const confidence: ForkConfidence = score >= 6 ? "high" : score >= 4 ? "medium" : "low";
    const [original, duplicate] = (px ?? Infinity) !== (py ?? Infinity) ? ((px ?? Infinity) < (py ?? Infinity) ? [x, y] : [y, x]) : ((order.get(x.id) ?? 0) < (order.get(y.id) ?? 0) ? [x, y] : [y, x]);
    let pre: readonly RepairConflict[];
    try { pre = mergeConflicts(snapshot, duplicate.id, original.id).conflicts; } catch { pre = [{ code: "preflight_unavailable", detail: "the snapshot is too incomplete for a merge preflight" }]; }
    findings.push({ review: "HUMAN REVIEW REQUIRED", automatic_repair: false, confidence, score, suspected_duplicate: candidate(duplicate), suspected_original: candidate(original), signals: all,
      mergeability: { mergeable: pre.length === 0, conflicts: pre } });
  }
  findings.sort((a, b) => b.score - a.score || a.suspected_duplicate.id.localeCompare(b.suspected_duplicate.id) || a.suspected_original.id.localeCompare(b.suspected_original.id));
  return { scanner: "identity_fork_scanner_v1", read_only: true, campaign_id: snapshot.campaign_id, revision: snapshot.revision, characters_considered: active.length, pairs_examined: pairs, findings,
    note: "Diagnostic only. Same name alone is not evidence. Confidence is not an authority. No repair was performed or proposed." };
}

export function renderForkReportMarkdown(reports: readonly ForkScanReport[]): string {
  const out = ["# Identity fork scan (read-only diagnostics)", "", "Every finding is **HUMAN REVIEW REQUIRED**. Confidence is diagnostic only. Nothing was changed and no repair was proposed.", ""];
  for (const r of reports) {
    out.push(`## ${r.campaign_id} @ revision ${r.revision}`, "", `Characters considered: ${r.characters_considered}; pairs examined: ${r.pairs_examined}; findings: ${r.findings.length}.`, "");
    if (!r.findings.length) { out.push("No suspicious pair.", ""); continue; }
    for (const f of r.findings) {
      out.push(`- **${f.confidence}** (score ${f.score}) suspected duplicate \`${f.suspected_duplicate.id}\` (${f.suspected_duplicate.name ?? "unnamed"}) of \`${f.suspected_original.id}\` (${f.suspected_original.name ?? "unnamed"}) - HUMAN REVIEW REQUIRED`,
        ...f.signals.map(s => `  - ${s.kind}: ${s.detail}`), `  - merge preflight: ${f.mergeability.mergeable ? "no hard conflict" : f.mergeability.conflicts.map(c => c.code).join(", ")}`);
    }
    out.push("");
  }
  return out.join("\n");
}
