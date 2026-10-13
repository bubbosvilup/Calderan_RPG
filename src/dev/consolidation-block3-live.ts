import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../app/index.js";
import type { SessionDeps } from "../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../app/scenarios.js";
import type { CampaignSnapshot } from "../campaign/types.js";

/**
 * Consolidation Block 3: focused LIVE certification (evaluation only) of the companion-movement product path. Production GameSession -> TurnCoordinator ->
 * Narrator/Controller. The purchased, named Campaign person is seeded as the settled result of the Actual Offer flow (certified earlier); the turns under test
 * are the exact product input ("Alright Maren, i just purchased you, let's go home") and one arrival follow-up. No reroll: one attempt per turn, a single retry
 * only for a provider transient that changed no state.
 *
 * Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/consolidation-block3-live.js
 */
const TRANSIENT = new Set(["network_error", "timeout", "rate_limited", "provider_unavailable"]);
const ID = "campaign_character_block3_maren";
async function main(): Promise<void> {
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block3_live"), saveDir = join("saves", "consolidation_block3_live");
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const requests: unknown[] = [];
  const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off", prepared_narrator_observer: (r: unknown) => { requests.push(r); } });
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
  const deps: SessionDeps = { ...rest, autosave: false, unsafe_trace: true };
  const campaign = SLAVE_MARKET_V1.create(deps.world, `block3_live_${Date.now()}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [
    { kind: "register_character", character: { id: ID, origin: { kind: "created" }, profile: { name: "Maren", name_source: "self_disclosed", sex: "female", age: { kind: "exact", years: 23 } }, current: { current_location: "calderan_slave_market", status: "active" } } },
    { kind: "set_legal_status", character_id: ID, status: "enslaved", holder_id: "nicco" },
  ] });
  const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
  const snap = () => campaign.exportSnapshot() as unknown as CampaignSnapshot;
  const where = () => snap().characters.find(c => c.id === ID)?.current.current_location ?? null;
  const created = () => snap().characters.filter(c => c.origin.kind === "created").map(c => ({ id: c.id, name: c.profile.name ?? null, at: c.current.current_location ?? null }));
  const log: Record<string, unknown>[] = []; let narratorCalls = 0, controllerCalls = 0, retries = 0, tokens = 0, cost = 0;
  const turn = async (label: string, text: string) => {
    let outcome, attempts = 0;
    for (;;) {
      attempts++; outcome = await session.submitPlayerInput(text);
      if (outcome.ok || attempts >= 2) break;
      const code = outcome.error.provider_code ?? "";
      if (!(TRANSIENT.has(code) && !outcome.error.turn_state_changed)) break;
      retries++;
    }
    const trace = outcome.ok ? outcome.trace : undefined, sent = requests.splice(0);
    narratorCalls += sent.length; controllerCalls += attempts;
    const usage = JSON.stringify(trace?.usage ?? {}); for (const m of usage.matchAll(/"total_tokens":(\d+)/g)) tokens += Number(m[1]); for (const m of usage.matchAll(/"cost(?:_usd)?":([\d.]+)/g)) cost += Number(m[1]);
    const view = session.getView();
    const entry = { label, input: text, ok: outcome.ok, attempts, narration: outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null, error: outcome.ok ? null : outcome.error,
      narrator_requests: sent.length, narration_status: trace?.narration_status ?? null, audit: trace?.audit_issue_kinds ?? [], revision_issues: trace?.revision_issue_kinds ?? [],
      committed: trace?.committed_command_kinds ?? [], rejected: trace?.rejected_command_kinds ?? [], usage: trace?.usage ?? null, revision: campaign.revision,
      nicco_at: snap().runtime.scene.player_location, maren_at: where(), created: created(), holder: snap().legal_statuses.find(l => l.character_id === ID)?.holder_id ?? null,
      view_present: view.scene.present.map(p => ({ id: p.id, name: p.name })) };
    log.push(entry); console.log(JSON.stringify({ label, ok: outcome.ok, nicco_at: entry.nicco_at, maren_at: entry.maren_at, created: entry.created.length, audit: entry.audit, status: entry.narration_status })); return entry;
  };
  const before = { nicco_at: snap().runtime.scene.player_location, maren_at: where(), created: created() };
  const go = await turn("go_home", "Alright Maren, i just purchased you, let's go home");
  const look = go.ok ? await turn("arrival_followup", "I look at Maren and ask her, quietly, whether she is all right.") : undefined;
  const after = { nicco_at: snap().runtime.scene.player_location, maren_at: where(), created: created() };
  const verdict = { go_ok: go.ok, same_id_moved_with_nicco: after.maren_at === after.nicco_at && after.maren_at !== before.maren_at, no_duplicate: after.created.length === before.created.length && after.created.every(c => c.id === ID),
    holder_unchanged: snap().legal_statuses.find(l => l.character_id === ID)?.holder_id === "nicco", followup_ok: look?.ok ?? null };
  await writeFile(join(outDir, "run.json"), JSON.stringify({ before, after, verdict, narrator_calls: narratorCalls, controller_calls: controllerCalls, transient_retries: retries, total_tokens: tokens, cost_usd: cost, log }, null, 2));
  console.log(JSON.stringify({ before, after, verdict, narratorCalls, controllerCalls, tokens, cost }, null, 1));
  await session.shutdown({ discard_unsaved: true });
}
await main();
