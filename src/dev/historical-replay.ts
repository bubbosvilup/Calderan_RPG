import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../app/index.js";
import type { SessionDeps } from "../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../app/scenarios.js";
import type { CampaignSnapshot } from "../campaign/types.js";
import type { CampaignState } from "../campaign/campaign-state.js";
import { isTransactionAct } from "../turn/commerce/transaction-acts.js";
import { anchoredIds, groundedNarrator, renderAnchorBlock, travelCompanions, travelReferents, validateAnchors, type AnchorFile } from "./historical-anchors.js";

/**
 * Historical campaign replay harness (evaluation only). Feeds the historical player messages, in order, through the real
 * production GameSession -> TurnCoordinator -> Narrator/Controller path from a fresh campaign. It never injects expected state,
 * never conditions on a turn number and never replays historical narrator text as narration. It records per-turn telemetry
 * (JSONL, resumable) and a final snapshot summary; comparison against the frozen oracle lives in historical-replay-compare.ts.
 *
 * Usage: node .build/src/dev/historical-replay.js --iter N --messages <user_messages.txt> [--from 1] [--to 421] [--resume] [--label text]
 */
/** Input that physically takes a person along or away; with an unresolved payment this is the transaction gap the replay must show, not hide. */
const HANDOVER = /\b(?:carr(?:y|ies|ying)|lifts?|puts? (?:her|him|them) on (?:his|my) back|piggy|leads? (?:her|him|them)|takes? (?:her|him|them) (?:with|home|out)|walks? (?:her|him|them) (?:out|away|home))\b/i;
export interface ReplayTurnInput { readonly turn: number; readonly timestamp: string; readonly text: string }

export function parseHistoricalMessages(raw: string): ReplayTurnInput[] {
  const blocks = raw.replace(/\r\n/g, "\n").split(/^### (\d+) \| (\S+)\n/m);
  const turns: ReplayTurnInput[] = [];
  for (let i = 1; i < blocks.length; i += 3) {
    const text = (blocks[i + 2] ?? "").replace(/\n-{20,}\s*$/s, "").replace(/\n+$/, "").replace(/^\n+/, "");
    turns.push({ turn: Number(blocks[i]), timestamp: blocks[i + 1]!, text });
  }
  return turns;
}

const TRANSIENT = new Set(["network_error", "timeout", "rate_limited", "provider_unavailable"]);
function arg(name: string): string | undefined { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; }

/** Compact, comparator-friendly state summary (no prose). */
export function summarizeSnapshot(s: CampaignSnapshot): Record<string, unknown> {
  const players = new Set(s.player_characters.map(p => p.character_id));
  return {
    revision: s.revision, location: s.runtime.scene.player_location, world_minute: s.runtime.scene.world_time.world_minute,
    funds: s.funds.map(f => ({ id: f.character_id, gold: f.gold })),
    characters: s.characters.map(c => ({ id: c.id, name: c.profile.name, origin: c.origin.kind, location: c.current.current_location, status: c.current.status, conditions: c.current.conditions ?? [] })),
    households: s.households.map(h => ({ id: h.id, name: h.name, members: h.members.map(m => ({ id: m.character_id, status: m.status, role: m.role ?? null })), rules: (h.rules ?? []).filter(r => r.active).map(r => r.text) })),
    premium: s.premium_characters.map(p => (p as unknown as { character_id: string }).character_id),
    items: s.items.map(i => ({ id: i.id, name: i.name, category: i.category, owner: i.owner_id ?? null, position: i.position })),
    legal: s.legal_statuses,
    npc_locations: s.runtime.npc_locations.filter(n => !players.has(n.character_id)).length,
    facts: s.facts.length, knowledge: s.knowledge.length, relationships: s.relationships.length, goals: s.goals.length,
    transactions: s.transactions.length,
  };
}

/** Per-turn compact state for first-divergence analysis (ids and counts, no prose). */
export function turnState(s: CampaignSnapshot): Record<string, unknown> {
  return {
    funds: Object.fromEntries(s.funds.map(f => [f.character_id, f.gold])),
    characters: s.characters.map(c => `${c.id}|${c.profile.name}|${c.origin.kind}|${c.current.current_location ?? ""}`),
    members: (s.households[0]?.members ?? []).filter(m => m.status === "member").map(m => m.character_id),
    premium: s.premium_characters.map(p => (p as unknown as { character_id: string }).character_id),
    items: s.items.map(i => `${i.name}|${i.owner_id ?? ""}|${i.position.kind}${"character_id" in i.position ? ":" + (i.position as { character_id: string }).character_id : ""}`),
    transactions: s.transactions.map(t => `${t.kind}|${t.subject_id}|${t.payer_id ?? ""}|${t.gold ?? 0}|${t.payee_id ?? ""}|${t.from_holder_id ?? (t.from_counterparty ? "counterparty" : "")}`),
    legal: s.legal_statuses.map(l => `${l.character_id}:${l.status}`),
  };
}

async function main(): Promise<void> {
  const iter = Number(arg("iter") ?? "1"), tag = String(iter).padStart(2, "0");
  const messages = arg("messages"); if (!messages) throw new Error("--messages <file> is required");
  const from = Number(arg("from") ?? "1"), to = Number(arg("to") ?? "421"), resume = process.argv.includes("--resume");
  const turns = parseHistoricalMessages(await readFile(messages, "utf8")).filter(t => t.turn >= from && t.turn <= to);
  const outDir = join("artifacts", "local", "evaluations", "historical_replay", `iteration_${tag}`), saveDir = join("saves", "historical_replay", `iteration_${tag}`);
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const dump = process.argv.includes("--dump-prompts");
  const prompts: unknown[] = [];
  // Historical turn anchors (evaluation grounding for the Narrator only; see historical-anchors.ts). Absent = the plain input-only replay.
  const anchorPath = arg("anchors");
  const anchors: AnchorFile | undefined = anchorPath ? JSON.parse(await readFile(anchorPath, "utf8")) as AnchorFile : undefined;
  if (anchors) { const problems = validateAnchors(anchors); if (problems.length) throw new Error(`invalid anchors: ${problems.join("; ")}`); }
  let currentBlock: string | undefined;
  const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off", ...(anchors ? { narrator_wrapper: provider => groundedNarrator(provider, () => currentBlock) } : {}), ...(dump ? { prepared_narrator_observer: (request: unknown) => { prompts.push(request); } } : {}) });
  // No image generation or sprite credits; no autosave (the harness saves explicitly).
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base;
  void _pg; void _sr; void _as;
  const unsafe = process.argv.includes("--unsafe-trace");
  const deps: SessionDeps = { ...rest, autosave: false, ...(unsafe ? { unsafe_trace: true } : {}) };
  const campaignId = `historical_replay_${tag}`;
  let session: GameSession, startTurn = from, campaign: CampaignState | undefined;
  const progressPath = join(outDir, "progress.json");
  if (resume) {
    const loaded = await GameSession.loadCampaign(deps, campaignId);
    if (!loaded.ok) throw new Error(`cannot resume: ${loaded.error.code}`);
    session = loaded.session;
    campaign = (await deps.repository.loadCampaign(campaignId, "current")).campaign;
    const progress = JSON.parse(await readFile(progressPath, "utf8")) as { last_turn: number };
    startTurn = progress.last_turn + 1;
  } else {
    campaign = SLAVE_MARKET_V1.create(deps.world, campaignId);
    session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
    const first = await session.save({ reason: "create" });
    if (!first.ok) throw new Error(`cannot save: ${first.error.code}`);
    await writeFile(join(outDir, "turns.jsonl"), ""); await writeFile(join(saveDir, "narration.jsonl"), "");
  }
  const assistPath = arg("assist");
  // Travel referents of the anchors replace the ad-hoc assist file; either way the official manual correction is used only when the normal travel contract did not move the player.
  const assists: Record<string, string> = anchors ? travelReferents(anchors) : assistPath ? (JSON.parse(await readFile(assistPath, "utf8")) as { assists: Record<string, string> }).assists : {};
  const companions: Record<string, readonly string[]> = anchors ? travelCompanions(anchors) : {};
  const t0 = Date.now(); let requests = { narrator: 0, controller: 0 }, failures = 0;
  const label = arg("label") ?? `iteration ${tag}`;
  let lastSummary: Record<string, unknown> | undefined, openGap = false;
  for (const t of turns) {
    if (t.turn < startTurn) continue;
    let outcome, attempts = 0, assist: { from: string; to: string; ok: boolean; companions?: string[] } | undefined;
    const target = assists[String(t.turn)];
    if (target) {
      const here = session.getView().scene.location.id;
      // Same test a player gets: already inside the target (or a descendant) needs no correction.
      if (here !== target && !deps.world.getAncestors(here).some(a => a.id === target)) {
        const corrected = session.overridePlayerLocation({ target, expected_revision: session.getView().session.revision });
        assist = { from: here, to: target, ok: corrected.ok };
        // People who walked with Nicco in the historical turn (the normal travel grammar refuses the one-word referent "the tower"):
        // the same manual correction applies to them, through the ordinary move_character command, and is logged with the assist.
        if (corrected.ok && campaign) for (const name of companions[String(t.turn)] ?? []) {
          const snap = campaign.exportSnapshot(), who = snap.characters.find(c => c.profile.name?.toLowerCase() === name.toLowerCase() && c.current.current_location === here);
          if (who) { campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "move_character", character_id: who.id, location_id: target }] }); (assist.companions ??= []).push(name); }
        }
      }
    }
    currentBlock = anchors ? renderAnchorBlock(anchors, t.turn) : undefined;
    const started = Date.now();
    for (;;) {
      attempts++;
      outcome = await session.submitPlayerInput(t.text);
      if (outcome.ok || attempts >= 3) break;
      const code = outcome.error.provider_code ?? "";
      // One controlled retry class only: provider transients that did not change state.
      if (!(TRANSIENT.has(code) && !outcome.error.turn_state_changed)) break;
    }
    const view = session.getView();
    const trace = outcome.ok ? outcome.trace : undefined;
    const gapNow = isTransactionAct(t.text) && !(trace?.committed_command_kinds ?? []).includes("transfer_person");
    const record = {
      iteration: label, turn: t.turn, attempts, ...(assist ? { assist: { ...assist, kind: "ASSISTED_LOCATION" } } : {}), ...(anchors ? { anchors: anchoredIds(anchors, t.turn), anchor_block_chars: currentBlock?.length ?? 0 } : {}), ok: outcome.ok, error: outcome.ok ? null : { code: outcome.error.code, provider_code: outcome.error.provider_code ?? null, state_changed: outcome.error.turn_state_changed ?? null },
      revision: view.session.revision, location: view.scene.location.id, world_minute: view.scene.time.world_minute,
      committed: trace?.committed_command_kinds ?? [], rejected: trace?.rejected_command_kinds ?? [], audit: trace?.audit_issue_kinds ?? [], revision_issues: trace?.revision_issue_kinds ?? [],
      person_transactions: trace?.person_transactions ?? [],
      // Diagnostics, never state: an unhedged payment act that committed no sale, and a later handover while that gap is still open.
      ...(isTransactionAct(t.text) && !(trace?.committed_command_kinds ?? []).includes("transfer_person") ? { payment_gap: (trace?.person_transactions ?? []).map(x => x.reason ?? x.status).join("|") || "silent" } : {}),
      ...(openGap && HANDOVER.test(t.text) ? { handover_gap: true } : {}),
      narration_status: trace?.narration_status ?? null, models: trace?.models ?? null, usage: trace?.usage ?? null, ms: Date.now() - started, input_chars: t.text.length,
      state: campaign ? turnState(campaign.exportSnapshot() as unknown as CampaignSnapshot) : null,
    };
    if (gapNow) openGap = true; else if ((trace?.committed_command_kinds ?? []).includes("transfer_person")) openGap = false;
    if (!outcome.ok) failures++;
    requests.narrator += attempts; requests.controller += attempts;
    await appendFile(join(outDir, "turns.jsonl"), JSON.stringify(record) + "\n");
    await appendFile(join(saveDir, "narration.jsonl"), JSON.stringify({ turn: t.turn, input: t.text, narration: outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null, ...(currentBlock ? { anchor_block: currentBlock } : {}), ...(unsafe && trace ? { unsafe: trace.unsafe } : {}) }) + "\n");
    await writeFile(progressPath, JSON.stringify({ iteration: label, last_turn: t.turn, failures, elapsed_ms: Date.now() - t0, updated_at: new Date().toISOString() }, null, 2));
    if (dump) { await appendFile(join(saveDir, "prompts.jsonl"), JSON.stringify({ turn: t.turn, requests: prompts.splice(0) }) + "\n"); }
    if (t.turn % 10 === 0) await session.save();
    console.log(JSON.stringify({ turn: t.turn, ok: outcome.ok, attempts, committed: record.committed.length, rejected: record.rejected.length, ms: record.ms }));
  }
  const saved = await session.save();
  const reloaded = await GameSession.loadCampaign(deps, campaignId);
  const roundTrip = saved.ok && reloaded.ok;
  const finalView = reloaded.ok ? reloaded.session.getView() : session.getView();
  // The final snapshot is read through the repository (what a load produces), never from a separate source of truth.
  const loadedCampaign = await deps.repository.loadCampaign(campaignId, "current");
  const snapshot = loadedCampaign.campaign.exportSnapshot();
  await writeFile(join(saveDir, "final_snapshot.json"), JSON.stringify(snapshot, null, 2));
  lastSummary = summarizeSnapshot(snapshot as unknown as CampaignSnapshot);
  await writeFile(join(outDir, "final_state_summary.json"), JSON.stringify({ iteration: label, save_load_round_trip: roundTrip, revision_after_reload: finalView.session.revision, ...lastSummary }, null, 2));
  await writeFile(join(outDir, "duration_and_requests.json"), JSON.stringify({ iteration: label, duration_ms: Date.now() - t0, turns_run: turns.filter(t => t.turn >= startTurn).length, failed_turns: failures, approx_provider_calls: requests, note: "narrator+controller call counts are lower bounds (one narrator and one controller attempt per submitted turn; revision/fallback calls are not separately counted here)" }, null, 2));
  console.log(JSON.stringify({ done: true, round_trip: roundTrip, failures }));
  await session.shutdown({ discard_unsaved: true });
}

if (process.argv[1] && /historical-replay\.js$/.test(process.argv[1])) await main();
