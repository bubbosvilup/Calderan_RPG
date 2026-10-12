import { join } from "node:path";
import { promises as fs } from "node:fs";
import type { CampaignCommand } from "../../src/campaign/types.js";
import type { TradeOfferRecord } from "../../src/campaign/types.js";
import { establishNames } from "../../src/turn/name-establishment.js";
import { buildTurnContext } from "../../src/turn/context-builder.js";
import type { RecentExchange } from "../../src/turn/recent-conversation.js";
import { makeRig, whereIs, type Rig, type RigSpec } from "./harness.js";

/**
 * The modern regression benchmark format. A scenario is a small, independent, readable record:
 *
 *   id / category / purpose            what it protects
 *   mode                               "deterministic" (scripted Narrator + Controller, runs offline) or "live_only" (documented, never run by the suite)
 *   known_gap                          set ONLY when the scenario states the DESIRED behavior that the product does not have yet
 *   initial                            the world and the authoritative starting state (setup commands, funds)
 *   steps                              player inputs (with the Narrator text and Controller proposals they are paired with) and player UI actions
 *   expect / each step's expect        named observables, compared with deep equality (see OBSERVABLES)
 *
 * Every scenario builds its OWN rig (real GameSession + TurnCoordinator + file repository in a private temp directory): nothing leaks between scenarios.
 * `revision_delta` is always relative to the revision at the START of the scenario.
 */
export type Category = "movement" | "identity" | "trade" | "person_trade" | "household" | "persistence" | "authority" | "fail_closed";
export const CATEGORIES: readonly Category[] = ["movement", "identity", "trade", "person_trade", "household", "persistence", "authority", "fail_closed"];

/** Every observable a scenario can assert on. A scenario names only the ones it cares about. */
export interface Observables {
  /** Revision now minus the revision when the scenario started. */
  revision_delta: number;
  gold: number;
  /** Location of each named character ("nicco" is the player). Only the ids named in the expectation are read. */
  at: Record<string, string | undefined>;
  /** Legal status of each named character: "free", "none" (no record) or "enslaved:<holder>". */
  legal: Record<string, string>;
  /** Display names of the persistent characters CREATED during play (origin "created"; "(unnamed)" when no personal name is known), sorted. */
  created: string[];
  /** Ids (and retirement) of retired characters, "<id>→<merged_into|retired>". */
  retired: string[];
  /** PROVISIONAL people the finalized exchanges of the scenario so far establish (the deterministic scene reading; never saved): refs "narrated:<name|noun>" and names. */
  provisional_refs: string[];
  provisional_names: string[];
  /** Commands the identity reader derives from those exchanges (late naming of an existing record only; never a new character). */
  identity_commands: number;
  /** Ephemeral scene participants the player's input introduced (never saved). */
  scene_participants: number;
  /** Active offers as "<direction>:<subject kind>:<price>". Direction is the player's: buy = the player buys. */
  offers_active: string[];
  /** Count of offers per status. */
  offers_by_status: Record<string, number>;
  /** The Actual Offer card the interface would show, or null. */
  card: { kind: string; price_gold: number } | null;
  /** Distinct person subjects across ALL offers (1 = the same subject through every reprice). */
  offer_subjects: number;
  /** True when every created persistent character is an offer subject, i.e. the SAME identity the offer named (no fork). */
  created_are_offer_subjects: boolean;
  transactions: number;
  /** Names of the items the player owns that did not exist when the scenario started, sorted. */
  inventory: string[];
  /** Persons the player holds as enslaved (legal status enslaved, holder nicco). */
  held_by_player: number;
  /** Distinct audit issue kinds raised for the last turn's draft, sorted. */
  audit_kinds: string[];
  /** True per named phrase when the narration the player was shown (last turn) contains it. */
  delivered_contains: Record<string, boolean>;
  /** Titles of the PendingConfirmation cards currently offered. */
  confirmations: string[];
  /** NPC+ (premium) character ids. */
  npc_plus: string[];
  /** Household members other than the owner. */
  household: string[];
  /** Provider (scripted fixture) calls so far. */
  calls: { narrator: number; controller: number };
  /** Persistence: "saved" | "unsaved" according to the SessionView. */
  save_state: string;
  /** Reflection notes / portrait versions / mannerism observations currently in the live composed state. */
  reflection_notes: number;
  portrait_versions: number;
  mannerism_records: number;
  /** On-disk facts: the optional side store exists / carries the optional state / the semantic save does not. */
  disk: Partial<{ learning_store: boolean; media_store: boolean; note_in_store: boolean; note_in_snapshot: boolean; saved_revision: number }>;
}
export type Expect = Partial<{ [K in keyof Observables]: Observables[K] }>;

export type OptionalWrite = "reflection" | "mannerism" | "portrait";
export type Step = (
  /** A player input with the Narrator text it is paired with and the Controller proposals for that turn. `fails` = the turn is refused (default: it succeeds). */
  | { do: "turn"; player: string; narration: string; controller?: readonly CampaignCommand[]; evidence?: readonly string[]; fails?: boolean; key?: string; stale_revision?: boolean }
  /** The player presses Accept on the Actual Offer card (`stale`: with an out-of-date revision, which must be refused and change nothing). */
  | { do: "accept"; stale?: boolean; fails?: boolean }
  /** The player presses Confirm / Cancel on the first PendingConfirmation card. */
  | { do: "confirm"; fails?: boolean }
  | { do: "cancel" }
  /** The operator/UI requests a human repair (retire or merge); it creates a PendingConfirmation card. */
  | { do: "repair"; operation: "retire" | "merge"; character_id: string; target_id?: string }
  /** The player presses "Promote to NPC+" (the Heartstone rite) on a character. */
  | { do: "promote_npc_plus"; character_id: string; fails?: boolean }
  /** Save, then restore from disk into a brand-new session. */
  | { do: "save_reload" }
  /** Save only (no reload). */
  | { do: "save" }
  /** No action: only the step's own `expect` is evaluated (a checkpoint). */
  | { do: "check" }
  /** Replays the same turn_key a second time: must answer the stored result with zero provider calls and no commit. */
  | { do: "replay_turn"; key: string; player: string }
  /** A background optional-service write (Reflection note, Mannerism observation, portrait batch): changes the side store, never the semantic revision. */
  | { do: "optional_write"; what: OptionalWrite }
) & { label?: string; expect?: Expect };

export interface Scenario {
  readonly id: string; readonly category: Category; readonly purpose: string;
  readonly mode: "deterministic" | "live_only";
  /** The DESIRED behavior is not implemented: the scenario reports KNOWN PRODUCT GAP while it fails, and FAILS (update the benchmark) the day it unexpectedly passes. */
  readonly known_gap?: string;
  readonly initial: RigSpec & { readonly note?: string };
  readonly steps: readonly Step[];
  /** Expected final observables. */
  readonly expect: Expect;
  /** Documented expectation about failure/ambiguity handling, printed in the report. */
  readonly failure_behavior?: string;
}

export type Verdict = "PASS" | "FAIL" | "KNOWN PRODUCT GAP";
export interface ScenarioResult { readonly id: string; readonly category: Category; readonly verdict: Verdict; readonly failures: readonly string[]; readonly ms: number; readonly gap?: string; readonly mode: Scenario["mode"] }

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as object).sort(([a], [b]) => a < b ? -1 : 1)) : x);
const offersOf = (rig: Rig): readonly TradeOfferRecord[] => (rig.campaign.exportSnapshot().trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
const subjectOf = (o: TradeOfferRecord) => o.subject.kind === "person" ? o.subject.subject_character_id : undefined;

const baseline = new WeakMap<Rig, ReadonlySet<string>>();
const readIdentity = (rig: Rig, recent: readonly RecentExchange[]) => { const snap = rig.campaign.exportSnapshot(); return establishNames(recent, buildTurnContext(rig.world, snap), rig.world, snap, [], rig.campaign.revision); };

/** Reads ONLY the observables named in `want`. `start` is the revision at scenario start. */
export async function observe(rig: Rig, want: Expect, start: number, recent: readonly RecentExchange[] = []): Promise<Record<string, unknown>> {
  const snap = rig.campaign.exportSnapshot(), out: Record<string, unknown> = {}, offers = offersOf(rig);
  const created = () => snap.characters.filter(c => c.origin.kind === "created");
  for (const key of Object.keys(want) as (keyof Observables)[]) {
    switch (key) {
      case "revision_delta": out[key] = rig.campaign.revision - start; break;
      case "gold": out[key] = snap.funds.find(f => f.character_id === "nicco")?.gold; break;
      case "at": out[key] = Object.fromEntries(Object.keys(want.at!).map(id => [id, whereIs(rig, id)])); break;
      case "legal": out[key] = Object.fromEntries(Object.keys(want.legal!).map(id => { const l = snap.legal_statuses.find(x => x.character_id === id); return [id, !l ? "none" : l.status === "enslaved" ? `enslaved:${l.holder_id}` : l.status]; })); break;
      case "created": out[key] = created().map(c => c.profile.name ?? "(unnamed)").sort(); break;
      case "retired": out[key] = snap.characters.filter(c => c.retirement).map(c => `${c.id}→${c.retirement!.merged_into ?? "retired"}`).sort(); break;
      case "provisional_refs": out[key] = readIdentity(rig, recent).provisional.map(p => p.ref).sort(); break;
      case "provisional_names": out[key] = readIdentity(rig, recent).provisional.flatMap(p => p.name ? [p.name] : []).sort(); break;
      case "identity_commands": out[key] = readIdentity(rig, recent).commands.length; break;
      case "scene_participants": out[key] = rig.coordinator.participants(rig.campaign).active().length; break;
      case "offers_active": out[key] = offers.filter(o => o.status === "active").map(o => `${o.direction}:${o.subject.kind}:${o.price_gold}`); break;
      case "offers_by_status": { const m: Record<string, number> = {}; for (const o of offers) m[o.status] = (m[o.status] ?? 0) + 1; out[key] = m; break; }
      case "card": { const c = rig.session.getTradeView().offer; out[key] = c ? { kind: c.kind, price_gold: c.price_gold } : null; break; }
      case "offer_subjects": out[key] = new Set(offers.flatMap(o => { const s = subjectOf(o); return s ? [s] : []; })).size; break;
      case "created_are_offer_subjects": { const ids = new Set(offers.flatMap(o => { const s = subjectOf(o); return s ? [s] : []; })); out[key] = created().length > 0 && created().every(c => ids.has(c.id)); break; }
      case "transactions": out[key] = snap.transactions.length; break;
      case "inventory": out[key] = snap.items.filter(i => i.owner_id === "nicco" && !baseline.get(rig)?.has(i.id)).map(i => i.name ?? "(item)").sort(); break;
      case "held_by_player": out[key] = snap.legal_statuses.filter(l => l.status === "enslaved" && l.holder_id === "nicco").length; break;
      case "confirmations": out[key] = rig.session.getConfirmationView().cards.map(c => c.title); break;
      case "npc_plus": out[key] = snap.premium_characters.map(p => p.character_id).sort(); break;
      case "household": out[key] = snap.households.flatMap(h => h.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id)).sort(); break;
      case "audit_kinds": out[key] = [...new Set(rig.last.audit)].sort(); break;
      case "delivered_contains": out[key] = Object.fromEntries(Object.keys(want.delivered_contains!).map(k => [k, rig.last.narration.includes(k)])); break;
      case "calls": out[key] = rig.calls(); break;
      case "save_state": out[key] = rig.session.getView().session.save.state; break;
      case "reflection_notes": out[key] = snap.premium_reflections.reduce((n, r) => n + r.notes.length, 0); break;
      case "portrait_versions": out[key] = (snap.portraits ?? []).reduce((n, p) => n + p.versions.length, 0); break;
      case "mannerism_records": out[key] = (snap.mannerism_learning?.candidates?.length ?? 0) + (snap.mannerism_learning?.journal?.length ?? 0); break;
      case "disk": {
        const id = snap.campaign_id, exists = (p: string) => fs.stat(p).then(() => true, () => false);
        const base = join(rig.dir, id);
        const save = JSON.parse(await fs.readFile(join(base, "save.json"), "utf8").catch(() => "{}")) as { snapshot?: { premium_reflections?: unknown[]; revision?: number } };
        const learning = await fs.readFile(join(base, "optional", "learning.json"), "utf8").catch(() => "");
        out[key] = { learning_store: await exists(join(base, "optional", "learning.json")), media_store: await exists(join(base, "optional", "media.json")),
          note_in_store: /watchful regard/.test(learning), note_in_snapshot: (save.snapshot?.premium_reflections?.length ?? 0) > 0, saved_revision: save.snapshot?.revision ?? -1 };
        break;
      }
    }
  }
  return out;
}

/** Compares only the keys the expectation names (and, for `at`/`legal`, only the ids it names). */
export function diff(expected: Expect, actual: Record<string, unknown>, where: string): string[] {
  const problems: string[] = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key];
    // `disk` and objects with several fields compare only the fields the expectation lists.
    const comparable = (key === "disk" && want && typeof want === "object") ? Object.fromEntries(Object.keys(want as object).map(k => [k, (got as Record<string, unknown> | undefined)?.[k]])) : got;
    if (stable(want) !== stable(comparable)) problems.push(`${where}: ${key}\n      expected ${stable(want)}\n      actual   ${stable(comparable)}`);
  }
  return problems;
}

async function reflectionWrite(rig: Rig, what: OptionalWrite): Promise<void> {
  const c = rig.campaign, rev = c.revision;
  if (what === "reflection") c.apply({ expected_revision: rev, commands: [{ kind: "record_reflection", character_id: "maren", reflected_revision: rev,
    notes: [{ id: `r${rev}_stance_1`, kind: "stance", label: "stance_1", text: "Maren holds a steady, watchful regard for Nicco.", evidence_refs: ["npcmem:maren:history:r3.0"], confidence: "medium", created_revision: rev, updated_revision: rev }] }] });
  else if (what === "mannerism") {
    c.maintainMannerisms({ kind: "finalized", expected_revision: c.revision, source: { turn_id: "bench_t1", narration_hash: "a".repeat(64), narration_length: 400, character_ids: ["maren"], available_items: [] } });
    c.maintainMannerisms({ kind: "observations", expected_revision: c.revision, through_sequence: 1, observations: [{ character_id: "maren", sequence: 1, action: "lips_press", trigger: "while_waiting", span_start: 0, span_end: 20, equivalent_owned_ids: [] }] });
  } else c.apply({ expected_revision: rev, commands: [{ kind: "record_portrait_batch", character_id: "nicco",
    versions: [{ version_id: "portrait_v1", prompt_version: "portrait-prompt-v2-anime", prompt_fingerprint: "0123456789abcdef", model: "image-model", created_at: "2026-10-12T10:00:00.000Z", media_type: "image/png", asset_file: "portrait_v1.png", kind: "avatar", seed: 1, cost_usd: 0.01 }] }] });
}

/** Runs one scenario in a private rig and returns PASS / FAIL / KNOWN PRODUCT GAP with expected-vs-actual diffs. Never throws. */
export async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const t0 = Date.now(), failures: string[] = [];
  let rig: Rig | undefined;
  try {
    rig = await makeRig(scenario.initial, scenario.id);
    const start = rig.campaign.revision;
    baseline.set(rig, new Set(rig.campaign.exportSnapshot().items.map(i => i.id)));
    let n = 0;
    const recent: RecentExchange[] = [];
    for (const step of scenario.steps) {
      n++;
      const tag = `${scenario.id} step ${n} (${step.label ?? step.do})`;
      let ok = true;
      switch (step.do) {
        case "turn": {
          const r = await rig.say(step.player, step.narration, step.controller ?? [], { ...(step.evidence ? { evidence: step.evidence } : {}), ...(step.key ? { turn_key: step.key } : {}), ...(step.stale_revision ? { expected_revision: rig.campaign.revision - 1 } : {}) });
          if (r.ok) recent.push({ player: step.player, narration: step.narration, status: "finalized", location_id: rig.campaign.exportSnapshot().runtime.scene.player_location });
          ok = r.ok; if (ok === !!step.fails) failures.push(`${tag}: turn ${step.fails ? "should have been refused" : "failed"}${r.error ? ` (${r.error.slice(0, 200)})` : ""}`);
          break;
        }
        case "accept": {
          const card = rig.session.getTradeView().offer;
          if (!card) { failures.push(`${tag}: no Actual Offer card to accept`); ok = false; break; }
          const r = rig.session.acceptTradeOffer({ ref: card.ref, expected_revision: rig.session.getView().session.revision - (step.stale ? 1 : 0) });
          ok = r.ok; if (ok === !!(step.fails || step.stale)) failures.push(`${tag}: accept ${ok ? "succeeded but should have been refused" : "was refused"}`);
          break;
        }
        case "confirm": case "cancel": {
          const card = rig.session.getConfirmationView().cards[0];
          if (!card) { failures.push(`${tag}: no confirmation card`); ok = false; break; }
          const request = { ref: card.ref, expected_revision: rig.session.getView().session.revision };
          const r = step.do === "confirm" ? rig.session.confirmPending(request) : rig.session.cancelPending(request);
          ok = r.ok; if (!ok && !(step.do === "confirm" && step.fails)) failures.push(`${tag}: refused`);
          break;
        }
        case "repair": {
          const r = rig.session.requestRepair({ operation: step.operation, character_id: step.character_id, ...(step.target_id ? { target_id: step.target_id } : {}), expected_revision: rig.session.getView().session.revision });
          ok = r.ok; if (!ok) failures.push(`${tag}: repair request refused`);
          break;
        }
        case "promote_npc_plus": {
          const view = rig.session.getPlayUiView(), card = [...view.participants.flatMap(p => p.card ? [p.card] : []), ...view.household.flatMap(h => h.members)].find(c => (c as { id?: string }).id === step.character_id || c.name === step.character_id);
          const ref = card?.ref;
          if (!ref) { if (!step.fails) failures.push(`${tag}: no promotion card for ${step.character_id}`); ok = false; break; }
          const r = rig.session.completeHeartstoneRite({ ref, expected_revision: rig.session.getView().session.revision });
          ok = r.ok; if (ok === !!step.fails) failures.push(`${tag}: rite ${ok ? "succeeded but should have been refused" : "was refused"}`);
          break;
        }
        case "check": break;
        case "save": { const r = await rig.session.save(); ok = r.ok; if (!ok) failures.push(`${tag}: save failed`); break; }
        case "save_reload": await rig.reload(); break;
        case "replay_turn": {
          const before = rig.calls(), rev = rig.campaign.revision;
          const r = await rig.say(step.player, "REPLAY MUST NOT BE USED", [], { turn_key: step.key });
          const after = rig.calls();
          if (!r.ok) failures.push(`${tag}: replay refused`);
          if (after.narrator !== before.narrator || after.controller !== before.controller) failures.push(`${tag}: replay called a provider`);
          if (rig.campaign.revision !== rev) failures.push(`${tag}: replay committed`);
          break;
        }
        case "optional_write": await reflectionWrite(rig, step.what); break;
      }
      if (step.expect) failures.push(...diff(step.expect, await observe(rig, step.expect, start, recent), tag));
    }
    failures.push(...diff(scenario.expect, await observe(rig, scenario.expect, start, recent), `${scenario.id} final`));
  } catch (error) {
    failures.push(`${scenario.id}: threw ${error instanceof Error ? (error.stack ?? error.message).split("\n").slice(0, 4).join(" | ") : String(error)}`);
  } finally { await rig?.release(); }
  const ms = Date.now() - t0;
  const base = { id: scenario.id, category: scenario.category, failures, ms, mode: scenario.mode, ...(scenario.known_gap ? { gap: scenario.known_gap } : {}) };
  if (scenario.known_gap) return failures.length ? { ...base, verdict: "KNOWN PRODUCT GAP" } : { ...base, verdict: "FAIL", failures: [`${scenario.id}: the known product gap now PASSES — the gap is closed, remove known_gap and update the report`] };
  return { ...base, verdict: failures.length ? "FAIL" : "PASS" };
}
