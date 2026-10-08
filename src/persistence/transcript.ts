/**
 * Save/Load v1 campaign transcript: narrative HISTORY, never canonical state and never continuity input. One JSON object per line
 * (`transcript.jsonl` in the campaign folder), appended only after a canonical save succeeded, so every entry belongs to a saved
 * revision. Each line is independently parseable; a damaged line is skipped and never makes a campaign unloadable.
 *
 * Rollback: loading an older slot or backup means later lines describe abandoned history. The next append then writes a
 * `{kind:"rollback", revision}` marker first; readers hide earlier entries above that revision. History is append-only: nothing is
 * rewritten or deleted.
 */
export type TranscriptRole = "player" | "narrator" | "system";
export interface TranscriptEntry { readonly i: number; readonly at: string; readonly role: TranscriptRole; readonly text: string; readonly revision: number; readonly turn_id?: string }
export interface TranscriptRollback { readonly i: number; readonly at: string; readonly kind: "rollback"; readonly revision: number }
export type TranscriptRecord = TranscriptEntry | TranscriptRollback;
export const TRANSCRIPT_LIMITS = Object.freeze({ text: 16_000, read_bytes: 8 * 1024 * 1024, entries: 500 });
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, TURN = /^[a-z0-9_:]{1,200}$/;

export function serializeTranscriptRecords(records: readonly TranscriptRecord[]): string {
  return records.map(r => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}
function record(value: unknown): TranscriptRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (!Number.isSafeInteger(v.i) || (v.i as number) < 0 || typeof v.at !== "string" || !TIME.test(v.at) || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0) return undefined;
  if (v.kind === "rollback") return Object.keys(v).length === 4 ? { i: v.i as number, at: v.at, kind: "rollback", revision: v.revision as number } : undefined;
  if (v.role !== "player" && v.role !== "narrator" && v.role !== "system" || typeof v.text !== "string" || v.text.length > TRANSCRIPT_LIMITS.text) return undefined;
  if (v.turn_id !== undefined && (typeof v.turn_id !== "string" || !TURN.test(v.turn_id))) return undefined;
  if (Object.keys(v).some(k => !["i", "at", "role", "text", "revision", "turn_id"].includes(k))) return undefined;
  return { i: v.i as number, at: v.at, role: v.role, text: v.text, revision: v.revision as number, ...(v.turn_id ? { turn_id: v.turn_id as string } : {}) };
}
/** Visible history (rollbacks applied), the next index, and how many lines were unusable. A truncated read drops its partial first line. */
export function parseTranscript(text: string, truncated = false, maxEntries: number = TRANSCRIPT_LIMITS.entries): { entries: TranscriptEntry[]; next_index: number; invalid_lines: number; max_revision: number } {
  const lines = text.split("\n");
  if (truncated) lines.shift();
  let entries: TranscriptEntry[] = [], next = 0, invalid = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: TranscriptRecord | undefined;
    try { parsed = record(JSON.parse(line)); } catch { parsed = undefined; }
    if (!parsed) { invalid++; continue; }
    next = Math.max(next, parsed.i + 1);
    if ("kind" in parsed) { const to = parsed.revision; entries = entries.filter(e => e.revision <= to); continue; }
    entries.push(parsed);
    if (entries.length > maxEntries * 2) entries = entries.slice(-maxEntries);
  }
  return { entries: entries.slice(-maxEntries), next_index: next, invalid_lines: invalid, max_revision: entries.reduce((m, e) => Math.max(m, e.revision), -1) };
}
