import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GameSession } from "../../app/index.js";
import { SLAVE_MARKET_V1 } from "../../app/scenarios.js";
import type { CampaignSnapshot } from "../../campaign/types.js";
import { liveSessionDeps, submitWithTransientRetry } from "./support.js";

/**
 * Foreground canonical identity binding: LIVE certification (evaluation only). Runs the exact player messages of the two P0 scenarios through the real
 * production GameSession -> TurnCoordinator -> Narrator/Controller path, stops immediately after the final name question, and records, per turn, the
 * delivered narration, the pre-Narration request (the context the Narrator actually received before the FINAL call of the turn), the audit trace and the
 * campaign roster. No reroll: a single retry only for a provider transient that did not change state.
 *
 * Usage: NODE_USE_ENV_PROXY=1 node .build/src/dev/live/identity-live-cert.js <korvin|bartholomew>
 */
const SCENARIOS: Record<string, readonly string[]> = {
  korvin: ["looks for private licensed sellers", "perhaps interested in buying, what's your name?"],
  bartholomew: ["looks for private licensed sellers", "looks for other private sellers", "goes to the tall man with a blond white tonsure", "Goodmorning, my names is Nicco, what's your name?"],
};

async function main(): Promise<void> {
  const name = process.argv[2] ?? ""; const messages = SCENARIOS[name];
  if (!messages) throw new Error("usage: identity-live-cert <korvin|bartholomew>");
  const outDir = join("artifacts", "local", "evaluations", "foreground_identity_live", name), saveDir = join(outDir, "saves");
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const requests: unknown[] = [];
  const deps = await liveSessionDeps(saveDir, request => { requests.push(request); });
  const campaign = SLAVE_MARKET_V1.create(deps.world, `identity_live_${name}`);
  const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
  const turns: unknown[] = []; let narratorCalls = 0, controllerCalls = 0, retries = 0;
  for (const [index, text] of messages.entries()) {
    const { outcome, attempts } = await submitWithTransientRetry(session, text);
    retries += attempts - 1;
    const trace = outcome.ok ? outcome.trace : undefined, sent = requests.splice(0), snapshot = campaign.exportSnapshot() as unknown as CampaignSnapshot;
    narratorCalls += sent.length; controllerCalls += attempts;
    const view = session.getView();
    turns.push({ turn: index + 1, input: text, ok: outcome.ok, attempts, error: outcome.ok ? null : outcome.error,
      narration: outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null,
      narrator_requests: sent.length, final_narrator_request: sent[sent.length - 1] ?? null,
      audit: trace?.audit_issue_kinds ?? [], revision_issues: trace?.revision_issue_kinds ?? [], narration_status: trace?.narration_status ?? null,
      committed: trace?.committed_command_kinds ?? [], rejected: trace?.rejected_command_kinds ?? [], models: trace?.models ?? null, usage: trace?.usage ?? null,
      present: view.scene.present, household: view.household.flatMap(h => h.members.map(m => m.display_name)),
      created_characters: snapshot.characters.filter(c => c.origin.kind === "created").map(c => ({ id: c.id, name: c.profile.name, location: c.current.current_location })),
      canonical_name_facts: snapshot.knowledge.filter(k => k.character_id === "nicco" && /identity_name|canonical/.test(k.fact_id)).map(k => k.fact_id) });
    console.log(JSON.stringify({ turn: index + 1, ok: outcome.ok, narrator_requests: sent.length, audit: trace?.audit_issue_kinds ?? [] }));
    if (!outcome.ok) break;
  }
  await writeFile(join(outDir, "turns.json"), JSON.stringify({ scenario: name, narrator_calls: narratorCalls, controller_calls: controllerCalls, transient_retries: retries, turns }, null, 2));
  await session.shutdown({ discard_unsaved: true });
}
await main();
