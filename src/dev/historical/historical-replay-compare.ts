import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CampaignSnapshot } from "../../campaign/types.js";
import { turnState } from "./historical-replay.js";
import { loadWorld } from "../../world/loader.js";
import type { WorldStore } from "../../world/world-store.js";

/**
 * Comparator for the Historical Campaign Replay (evaluation only). Evaluates the frozen oracle checks
 * (`oracle-v1`; tests read the byte-identical copy tests/fixtures/historical-replay/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md, the historical original is docs/evaluations/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md) against the replay's final snapshot and, per turn, against the
 * compact state recorded in turns.jsonl so that the FIRST causal divergence is the earliest turn at which a check whose historical
 * deadline has passed is violated. Later failures that follow from an earlier one are reported as BLOCKED_BY_EARLIER_DIVERGENCE.
 *
 * Usage: node .build/src/dev/historical/historical-replay-compare.js --iter N
 */
export type Verdict = "PASS" | "MISMATCH" | "NOT_MODELLED" | "SUPERSEDED" | "AMBIGUOUS" | "BLOCKED_BY_EARLIER_DIVERGENCE";
type Class = "MUST_MATCH" | "SHOULD_MATCH" | "AMBIGUOUS" | "NOT_YET_MODELLED" | "CURRENT_CANON_SUPERSEDED";
type Compact = ReturnType<typeof turnState> & { funds: Record<string, number>; characters: string[]; members: string[]; premium: string[]; items: string[]; transactions: string[]; legal: string[] };
/** Narration is cumulative evidence: a check that reads it sees only the turns up to `turn`. `sealed` is the set of sealed-canon word shingles. */
interface Ctx { s: Compact; snap?: CampaignSnapshot; location: string; canonNames: Set<string>; turn: number; narration?: readonly { turn: number; text: string }[]; sealed?: ReadonlySet<string> }
interface Check {
  id: string; klass: Class; text: string; /** First historical turn by which the fact should hold (final = 421). */ deadline: number; depends?: string[];
  eval(c: Ctx): { ok: boolean | "n/a"; actual: string; verdict?: Verdict };
}
const parse = (chars: string[]) => chars.map(x => { const [id, name, origin, loc] = x.split("|"); return { id: id!, name: name ?? "", origin: origin ?? "", loc: loc ?? "" }; });
const named = (c: Ctx, name: string) => parse(c.s.characters).filter(x => x.name.toLowerCase().startsWith(name.toLowerCase()));
const brenna = (c: Ctx) => named(c, "Brenna"), maren = (c: Ctx) => named(c, "Maren"), gerome = (c: Ctx) => named(c, "Gerome");
const inHeartstone = (loc: string) => loc.startsWith("heartstone");
const nicco = (c: Ctx) => c.s.funds["nicco"];
const paid = (c: Ctx, who: string) => c.s.transactions.filter(t => t.split("|")[2] === who).reduce((n, t) => n + Number(t.split("|")[3] ?? 0), 0);
const one = (xs: unknown[]) => xs.length === 1;
interface Sale { subject: string; payer: string; gold: number; payee: string; from: string }
/** Sales of one subject from the compact ledger (`kind|subject|payer|gold|payee|source`). */
const salesOf = (c: Ctx, subject: string | undefined): Sale[] => subject === undefined ? [] : c.s.transactions.map(t => t.split("|")).filter(p => p[0] === "sale" && p[1] === subject).map(p => ({ subject: p[1]!, payer: p[2] ?? "", gold: Number(p[3] ?? 0), payee: p[4] ?? "", from: p[5] ?? "" }));
const describeSales = (s: Sale[]) => s.length ? s.map(x => `${x.gold}g ${x.payer}->${x.payee || x.from || "?"}`).join("; ") : "no sale";
/** Created characters the oracle does not expect: an unexpected named creation is the signature of an invented alias or a replacement identity. */
const EXPECTED_CREATED = new Set(["brenna", "maren", "gerome"]);
const unexpectedCreated = (c: Ctx) => parse(c.s.characters).filter(x => x.origin === "created" && !EXPECTED_CREATED.has(x.name.toLowerCase()));
const COMPULSION = /\b(?:compel\w*|forced to (?:confess|speak|reveal|tell)|cannot lie|unable to lie|truth[- ]?bound|must confess|magically (?:bound|forced))\b/i;
const SEXUAL = /\b(?:sexual\w*|aroused|lover|seduc\w*|erotic\w*|naked and|intimate with)\b/i;
const leaksUpTo = (c: Ctx): string[] => {
  if (!c.narration || !c.sealed) return ["narration or sealed-canon data unavailable"];
  const hits: string[] = [];
  for (const n of c.narration) { if (n.turn > c.turn) continue; const w = words(n.text); for (let i = 0; i + SHINGLE <= w.length; i++) if (c.sealed.has(w.slice(i, i + SHINGLE).join(" "))) { hits.push(`turn ${n.turn}`); break; } }
  return hits;
};
export const SHINGLE = 7;
export const words = (t: string): string[] => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const ids = (xs: { id: string }[]) => xs.map(x => x.id).join(",") || "none";

export const CHECKS: Check[] = [
  { id: "A-01", klass: "MUST_MATCH", text: "Nicco is never NPC+", deadline: 1, eval: c => ({ ok: !c.s.premium.includes("nicco"), actual: `premium=${c.s.premium.join(",") || "none"}` }) },
  { id: "A-02", klass: "MUST_MATCH", text: "Nicco funds 405..411", deadline: 421, eval: c => { const f = nicco(c) ?? -1; return { ok: f >= 405 && f <= 411, actual: `funds=${f}, payments_by_nicco=${paid(c, "nicco")}` }; } },
  { id: "A-03", klass: "MUST_MATCH", text: "Nicco ends inside Heartstone", deadline: 421, eval: c => ({ ok: inHeartstone(c.location), actual: c.location }) },
  { id: "A-04", klass: "MUST_MATCH", text: "Nicco is household member (owner)", deadline: 1, eval: c => ({ ok: c.s.members.includes("nicco"), actual: c.s.members.join(",") }) },
  { id: "A-07", klass: "MUST_MATCH", text: "Deed and Charter carried by Nicco", deadline: 1, eval: c => { const own = c.s.items.filter(i => /^(Deed of Ownership|Heartstone Household Charter)/.test(i) && i.split("|")[1] === "nicco" && i.split("|")[2] === "carried:nicco"); return { ok: own.length === 2, actual: `${own.length} of 2` }; } },
  { id: "B-01", klass: "MUST_MATCH", text: "Exactly one created Brenna", deadline: 9, eval: c => ({ ok: one(brenna(c)) && brenna(c)[0]!.origin === "created", actual: `${brenna(c).length}x ${brenna(c).map(x => x.origin).join(",")}` }) },
  { id: "B-02", klass: "MUST_MATCH", text: "Brenna bought from Korvin: exactly one sale of Brenna for 5 gold, Nicco paying Korvin", deadline: 9, depends: ["B-01"], eval: c => { const s = salesOf(c, brenna(c)[0]?.id); return { ok: s.length === 1 && s[0]!.gold === 5 && s[0]!.payer === "nicco" && s[0]!.payee === "korvin", actual: describeSales(s) }; } },
  { id: "B-04", klass: "MUST_MATCH", text: "Brenna household member and NPC+", deadline: 83, depends: ["B-01"], eval: c => { const b = brenna(c)[0]; return { ok: !!b && c.s.members.includes(b.id) && c.s.premium.includes(b.id), actual: b ? `member=${c.s.members.includes(b.id)} premium=${c.s.premium.includes(b.id)}` : "no Brenna" }; } },
  { id: "B-06", klass: "MUST_MATCH", text: "Brenna ends inside Heartstone", deadline: 421, depends: ["B-01"], eval: c => ({ ok: !!brenna(c)[0] && inHeartstone(brenna(c)[0]!.loc), actual: brenna(c)[0]?.loc ?? "none" }) },
  { id: "C-01", klass: "MUST_MATCH", text: "Exactly one created Maren", deadline: 264, eval: c => ({ ok: one(maren(c)) && maren(c)[0]!.origin === "created", actual: `${maren(c).length}x` }) },
  { id: "C-02", klass: "MUST_MATCH", text: "Maren acquired from an anonymous private seller for 3 gold: exactly one sale of Maren, Nicco paying", deadline: 264, depends: ["C-01"], eval: c => { const s = salesOf(c, maren(c)[0]?.id); return { ok: s.length === 1 && s[0]!.gold === 3 && s[0]!.payer === "nicco" && s[0]!.from === "counterparty", actual: describeSales(s) }; } },
  { id: "C-04", klass: "MUST_MATCH", text: "Maren household member and NPC+", deadline: 358, depends: ["C-01"], eval: c => { const m = maren(c)[0]; return { ok: !!m && c.s.members.includes(m.id) && c.s.premium.includes(m.id), actual: m ? `member=${c.s.members.includes(m.id)} premium=${c.s.premium.includes(m.id)}` : "no Maren" }; } },
  { id: "C-09", klass: "MUST_MATCH", text: "Maren ends inside Heartstone", deadline: 421, depends: ["C-01"], eval: c => ({ ok: !!maren(c)[0] && inHeartstone(maren(c)[0]!.loc), actual: maren(c)[0]?.loc ?? "none" }) },
  { id: "D-01", klass: "MUST_MATCH", text: "Exactly one Gerome, in Heartstone", deadline: 18, eval: c => ({ ok: one(gerome(c)) && inHeartstone(gerome(c)[0]!.loc), actual: `${gerome(c).length}x ${gerome(c)[0]?.loc ?? ""}` }) },
  { id: "D-02", klass: "MUST_MATCH", text: "Gerome active (not dormant)", deadline: 18, depends: ["D-01"], eval: c => { const g = c.snap?.characters.find(x => x.id === gerome(c)[0]?.id); if (!g) return { ok: false, actual: "no snapshot/character" }; const cond = (g.current.conditions ?? []).join(";"); return { ok: g.current.status !== "inactive" && !/dormant/i.test(cond), actual: `status=${g.current.status} conditions=${cond || "none"}` }; } },
  { id: "E-01", klass: "MUST_MATCH", text: "Exactly the three charter rules active", deadline: 1, eval: c => { const rules = (c.snap?.households[0]?.rules ?? []).filter(r => r.active); return { ok: rules.length === 3, actual: `${rules.length} active` }; } },
  { id: "E-02", klass: "MUST_MATCH", text: "Members are exactly Nicco, Brenna, Maren", deadline: 421, eval: c => { const exp = ["nicco", ...[brenna(c)[0]?.id, maren(c)[0]?.id].filter(Boolean) as string[]].sort(); const got = [...c.s.members].sort(); return { ok: exp.length === 3 && got.join() === exp.join(), actual: got.join(",") }; } },
  { id: "E-04", klass: "MUST_MATCH", text: "No unexpected household member (e.g. Gerome, vendors)", deadline: 421, eval: c => { const allowed = new Set(["nicco", brenna(c)[0]?.id, maren(c)[0]?.id]); const extra = c.s.members.filter(m => !allowed.has(m)); return { ok: extra.length === 0, actual: extra.join(",") || "none" }; } },
  { id: "E-05", klass: "MUST_MATCH", text: "NPC+ ids are exactly Brenna and Maren", deadline: 421, eval: c => { const exp = [brenna(c)[0]?.id, maren(c)[0]?.id].filter(Boolean).sort(); const got = [...c.s.premium].sort(); return { ok: exp.length === 2 && got.join() === exp.join(), actual: got.join(",") || "none" }; } },
  { id: "F-01", klass: "MUST_MATCH", text: "No created duplicate of Korvin (or any invented alias for him)", deadline: 421, eval: c => { const d = parse(c.s.characters).filter(x => x.origin === "created" && /korvin|dorric/i.test(x.name)); return { ok: d.length === 0, actual: d.map(x => x.name).join(",") || "none" }; } },
  { id: "F-02", klass: "MUST_MATCH", text: "No created duplicate of Dren/Drel or Elara", deadline: 421, eval: c => { const d = parse(c.s.characters).filter(x => x.origin === "created" && /^(dren|drel|elara|mistress elara)/i.test(x.name)); return { ok: d.length === 0, actual: d.map(x => x.name).join(",") || "none" }; } },
  { id: "F-07", klass: "MUST_MATCH", text: "No created character shares a canonical NPC name, none duplicated", deadline: 421, eval: c => { const ch = parse(c.s.characters); const dup = ch.filter((x, i) => ch.findIndex(y => y.name.toLowerCase() === x.name.toLowerCase()) !== i); const canon = ch.filter(x => x.origin === "created" && c.canonNames.has(x.name.toLowerCase())); return { ok: dup.length === 0 && canon.length === 0, actual: `duplicates=${dup.map(x => x.name).join(",") || "none"} canon_clash=${canon.map(x => x.name).join(",") || "none"}` }; } },
  { id: "G-13", klass: "MUST_MATCH", text: "No item duplicated (same name/owner/position)", deadline: 421, eval: c => { const dup = c.s.items.filter((x, i) => c.s.items.indexOf(x) !== i); return { ok: dup.length === 0, actual: dup.join("; ") || "none" }; } },
  { id: "H-01", klass: "MUST_MATCH", text: "Funds never negative, never created, every change ledgered (funds = 500 minus gold paid in person transactions)", deadline: 421, eval: c => { const f = nicco(c) ?? -1; return { ok: f >= 0 && f <= 500 && f === 500 - paid(c, "nicco"), actual: `funds=${f} ledgered_payments=${paid(c, "nicco")}` }; } },
  { id: "I-01", klass: "MUST_MATCH", text: "Nicco still holds the Deed of Ownership", deadline: 421, eval: c => ({ ok: c.s.items.some(i => i.startsWith("Deed of Ownership") && i.split("|")[1] === "nicco"), actual: c.s.items.find(i => i.startsWith("Deed")) ?? "missing" }) },
  { id: "C-10", klass: "MUST_MATCH", text: "Maren (a minor) is never sexualized: no sexual condition, no romance edge involving her", deadline: 264, depends: ["C-01"], eval: c => {
      const m = maren(c)[0]; if (!m || !c.snap) return { ok: false, actual: "no Maren or no snapshot: not evaluable" };
      const ch = c.snap.characters.find(x => x.id === m.id); const cond = (ch?.current.conditions ?? []).filter(x => SEXUAL.test(x));
      const romance = c.snap.relationships.filter(r => (r.from_character_id === m.id || r.to_character_id === m.id) && (r.dimensions?.romance ?? "none") !== "none");
      return { ok: cond.length === 0 && romance.length === 0, actual: `sexual_conditions=${cond.length} romance_edges=${romance.length}` }; } },
  { id: "H-10", klass: "MUST_MATCH", text: "Nicco's final funds inside the accepted band 405..411", deadline: 421, eval: c => { const f = nicco(c) ?? -1; return { ok: f >= 405 && f <= 411, actual: `funds=${f}` }; } },
  { id: "H-11", klass: "MUST_MATCH", text: "No negative funds anywhere; Nicco never holds more than the 500 starting gold", deadline: 1, eval: c => { const v = Object.entries(c.s.funds); const neg = v.filter(([, g]) => g < 0), over = (nicco(c) ?? 0) > 500; return { ok: neg.length === 0 && !over, actual: `negative=${neg.map(([id]) => id).join(",") || "none"} nicco=${nicco(c) ?? "?"}` }; } },
  { id: "M-01", klass: "MUST_MATCH", text: "Korvin stays the one canonical man at the market: no created character appears beyond the expected Brenna, Maren, Gerome (an invented name for him would)", deadline: 421, eval: c => { const u = unexpectedCreated(c); return { ok: u.length === 0, actual: u.map(x => `${x.name}@${x.loc}`).join(", ") || "none" }; } },
  { id: "M-05", klass: "MUST_MATCH", text: "Rule 1 (no secrets) forces no disclosure: no compulsion recorded as a condition or a rule", deadline: 421, eval: c => {
      if (!c.snap) return { ok: false, actual: "no snapshot" };
      const hits = [...c.snap.characters.flatMap(x => x.current.conditions ?? []), ...c.snap.households.flatMap(h => (h.rules ?? []).map(r => r.text))].filter(t => COMPULSION.test(t));
      return { ok: hits.length === 0, actual: `${hits.length} compulsion records` }; } },
  { id: "M-06", klass: "MUST_MATCH", text: "Sealed canon is never revealed in narration (no 7-word run of any sealed record appears)", deadline: 1, eval: c => { const hits = leaksUpTo(c); return { ok: hits.length === 0, actual: hits.length ? hits.join(", ") : "no leak" }; } },
  { id: "M-07", klass: "MUST_MATCH", text: "Canon identity masking leaves no duplicate or alias: no created character carries a canonical NPC's name or an unexpected personal name", deadline: 421, eval: c => { const u = unexpectedCreated(c), clash = parse(c.s.characters).filter(x => x.origin === "created" && c.canonNames.has(x.name.toLowerCase())); return { ok: u.length === 0 && clash.length === 0, actual: `unexpected=${u.map(x => x.name).join(",") || "none"} canon_clash=${clash.map(x => x.name).join(",") || "none"}` }; } },
  { id: "B-03", klass: "SHOULD_MATCH", text: "Brenna legal status free (or enslaved/nicco)", deadline: 421, depends: ["B-01"], eval: c => { const l = c.s.legal.find(x => x.startsWith(brenna(c)[0]?.id ?? "?")); return { ok: true, actual: l ?? "no record", verdict: "AMBIGUOUS" }; } },
  { id: "C-06", klass: "SHOULD_MATCH", text: "Maren holds forty gold", deadline: 411, depends: ["C-01"], eval: c => { const f = c.s.funds[maren(c)[0]?.id ?? "?"]; return { ok: f === 40, actual: `maren_funds=${f ?? "untracked"}`, verdict: f === 40 ? "PASS" : "NOT_MODELLED" }; } },
  { id: "G-02", klass: "SHOULD_MATCH", text: "A halberd exists once", deadline: 210, eval: c => { const n = c.s.items.filter(i => /halberd/i.test(i)).length; return { ok: n === 1, actual: `${n}` }; } },
  { id: "G-06", klass: "SHOULD_MATCH", text: "Scalpel carried by Nicco", deadline: 217, eval: c => { const n = c.s.items.filter(i => /scalpel/i.test(i) && i.includes("nicco")).length; return { ok: n >= 1, actual: `${n}` }; } },
  { id: "G-07", klass: "SHOULD_MATCH", text: "At least two prop daggers", deadline: 216, eval: c => { const n = c.s.items.filter(i => /dagger|knife/i.test(i)).length; return { ok: n >= 2, actual: `${n}` }; } },
];

/** The oracle table also lists three MUST_MATCH rows that its own checkpoint list folds into other ids; they are covered, not extra checks. */
export const COVERED_BY: Readonly<Record<string, string>> = { "G-01": "A-07", "H-02": "B-02", "H-07": "C-02" };
export const IMPLEMENTED_MUST_MATCH_IDS = (): string[] => CHECKS.filter(c => c.klass === "MUST_MATCH").map(c => c.id);
/** Subsystem a failure is attributed to (for the iteration report). */
export const SUBSYSTEM: Readonly<Record<string, string>> = {
  "A-01": "npc_plus", "A-02": "economy", "A-03": "movement", "A-04": "household", "A-07": "items", "B-01": "identity", "B-02": "person_transactions", "B-04": "household_rite", "B-06": "movement",
  "C-01": "identity", "C-02": "person_transactions", "C-04": "household_rite", "C-09": "movement", "C-10": "safety", "D-01": "identity", "D-02": "character_state",
  "E-01": "household_rules", "E-02": "household", "E-04": "household", "E-05": "npc_plus", "F-01": "identity", "F-02": "identity", "F-07": "identity", "G-13": "items",
  "H-01": "economy", "H-10": "economy", "H-11": "economy", "I-01": "items", "M-01": "identity_masking", "M-05": "household_rules", "M-06": "spoiler_safety", "M-07": "identity_masking",
  "B-03": "legal_status", "C-06": "economy", "G-02": "items", "G-06": "items", "G-07": "items",
};
export interface ComparisonInput { turns: readonly { turn: number; ok: boolean; location: string; state: Compact }[]; snap: CampaignSnapshot; canonNames: Set<string>; narration?: readonly { turn: number; text: string }[]; sealed?: ReadonlySet<string> }
export interface CheckResult { id: string; klass: Class; subsystem: string; text: string; verdict: Verdict; actual: string; first_divergence?: number; blocked_by?: string }
export interface ComparisonSummary { turns_recorded: number; failed_turns: number[]; must_match_total: number; must_match_pass: number; must_match_mismatch: number; must_match_blocked: number; should_match_pass: number; should_match_total: number }
export function compare(input: ComparisonInput): { results: CheckResult[]; summary: ComparisonSummary; firsts: CheckResult[] } {
  const { turns, snap, canonNames: names } = input;
  const extra = { ...(input.narration ? { narration: input.narration } : {}), ...(input.sealed ? { sealed: input.sealed } : {}) };
  const final: Ctx = { s: turnState(snap) as unknown as Compact, snap, location: snap.runtime.scene.player_location, canonNames: names, turn: 421, ...extra };
  const failedTurns = turns.filter(t => !t.ok).map(t => t.turn);
  const results: CheckResult[] = [];
  for (const chk of CHECKS) {
    const res = chk.eval(final);
    let verdict: Verdict = res.verdict ?? (res.ok === true ? "PASS" : "MISMATCH");
    let first: number | undefined;
    if (verdict === "MISMATCH") {
      // The earliest recorded turn at/after the deadline where the check fails (the fact was due and is not there).
      for (const t of turns) { if (t.turn < chk.deadline) continue; const r = chk.eval({ s: t.state, location: t.location, canonNames: names, turn: t.turn, ...extra }); if (r.ok === false) { first = t.turn; break; } }
      if (first === undefined && chk.deadline <= (turns.at(-1)?.turn ?? 0)) first = chk.deadline;
    }
    results.push({ id: chk.id, klass: chk.klass, subsystem: SUBSYSTEM[chk.id] ?? "unattributed", text: chk.text, verdict, actual: res.actual, ...(first !== undefined ? { first_divergence: first } : {}) });
  }
  // Cascade: a MISMATCH whose dependency is itself a MISMATCH is reported as blocked.
  for (const r of results) { const dep = CHECKS.find(c => c.id === r.id)?.depends?.find(d => results.find(x => x.id === d)?.verdict === "MISMATCH"); if (r.verdict === "MISMATCH" && dep) { r.verdict = "BLOCKED_BY_EARLIER_DIVERGENCE"; r.blocked_by = dep; } }
  const must = results.filter(r => r.klass === "MUST_MATCH");
  const summary: ComparisonSummary = { turns_recorded: turns.length, failed_turns: failedTurns, must_match_total: must.length, must_match_pass: must.filter(r => r.verdict === "PASS").length,
    must_match_mismatch: must.filter(r => r.verdict === "MISMATCH").length, must_match_blocked: must.filter(r => r.verdict === "BLOCKED_BY_EARLIER_DIVERGENCE").length,
    should_match_pass: results.filter(r => r.klass === "SHOULD_MATCH" && r.verdict === "PASS").length, should_match_total: results.filter(r => r.klass === "SHOULD_MATCH").length };
  return { results, summary, firsts: results.filter(r => r.first_divergence !== undefined).sort((a, b) => a.first_divergence! - b.first_divergence!) };
}

async function canonNames(): Promise<Set<string>> {
  const out = new Set<string>(); const walk = async (d: string): Promise<void> => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else if (e.name.endsWith(".yaml")) { const m = /^ {2}name: (.+)$/m.exec(await readFile(p, "utf8")); if (m) out.add(m[1]!.trim().toLowerCase()); } } };
  await walk("data/characters"); return out;
}
/** Word shingles of every sealed (holder_only / author_only) record, built from the authored data at run time; nothing sealed is written anywhere. */
export function sealedShingles(world: WorldStore): Set<string> {
  const out = new Set<string>();
  const add = (text: string) => { const w = words(text); for (let i = 0; i + SHINGLE <= w.length; i++) out.add(w.slice(i, i + SHINGLE).join(" ")); };
  const sealedEntity = new Set<string>();
  for (const e of world.listEntities()) if (e.knowledge?.secrecy) { sealedEntity.add(e.id); add(`${e.summary} ${e.content}`); }
  for (const c of world.listChunks()) if (c.knowledge?.secrecy || sealedEntity.has(c.entity_id)) add(c.content);
  return out;
}

async function main(): Promise<void> {
  const ix = process.argv.indexOf("--iter"); const iter = Number(ix >= 0 ? process.argv[ix + 1] : "1"), tag = String(iter).padStart(2, "0");
  const dir = join("artifacts", "local", "evaluations", "historical_replay", `iteration_${tag}`), saves = join("saves", "historical_replay", `iteration_${tag}`);
  const turns = (await readFile(join(dir, "turns.jsonl"), "utf8")).trim().split("\n").map(l => JSON.parse(l) as { turn: number; ok: boolean; location: string; state: Compact; error: { code: string } | null });
  const snap = JSON.parse(await readFile(join(saves, "final_snapshot.json"), "utf8")) as CampaignSnapshot;
  const narration = await readFile(join(saves, "narration.jsonl"), "utf8").then(t => t.trim().split("\n").filter(Boolean).map(l => { const r = JSON.parse(l) as { turn: number; narration: string | null }; return { turn: r.turn, text: r.narration ?? "" }; }), () => undefined);
  const world = await loadWorld("data");
  const { results, summary: base, firsts } = compare({ turns, snap, canonNames: await canonNames(), ...(narration ? { narration } : {}), sealed: sealedShingles(world) });
  const summary = { iteration: iter, ...base };
  await writeFile(join(dir, "mismatch_summary.json"), JSON.stringify({ summary, results }, null, 2));
  await writeFile(join(dir, "first_divergences.json"), JSON.stringify(firsts.map(f => ({ id: f.id, subsystem: f.subsystem, turn: f.first_divergence, text: f.text, actual: f.actual, verdict: f.verdict })), null, 2));
  const md = [`# Expected vs actual, iteration ${tag}`, "", `MUST_MATCH ${summary.must_match_pass}/${summary.must_match_total} pass, ${summary.must_match_mismatch} mismatch, ${summary.must_match_blocked} blocked by an earlier divergence. SHOULD_MATCH ${summary.should_match_pass}/${summary.should_match_total}. Failed turns: ${summary.failed_turns.length}.`, "",
    "| ID | Class | Subsystem | Check | Verdict | Actual | First divergence |", "|---|---|---|---|---|---|---|", ...results.map(r => `| ${r.id} | ${r.klass} | ${r.subsystem} | ${r.text} | ${r.verdict}${r.blocked_by ? ` (${r.blocked_by})` : ""} | ${r.actual.replace(/\|/g, "/")} | ${r.first_divergence ?? ""} |`)].join("\n");
  await writeFile(join(dir, "expected_vs_actual.md"), md + "\n");
  console.log(JSON.stringify(summary)); for (const f of firsts) console.log(`first divergence turn ${f.first_divergence}: ${f.id} [${f.subsystem}] ${f.text} -> ${f.actual} [${f.verdict}]`);
}
if (process.argv[1] && /historical-replay-compare\.js$/.test(process.argv[1])) await main();
