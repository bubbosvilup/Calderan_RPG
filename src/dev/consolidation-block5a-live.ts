import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../app/index.js";
import type { SessionDeps } from "../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../app/scenarios.js";

/**
 * Consolidation Block 5A: LIVE certification (evaluation only) of the PendingConfirmation foundation + AUTH-1 on the production
 * GameSession -> TurnCoordinator -> Narrator/Controller path. One scenario, one attempt, no reroll:
 *  1. the player (Nicco) says "I hereby free you, Maren." to an enslaved person he holds -> the turn succeeds, a card exists, the legal state is UNCHANGED,
 *     the delivered prose does not claim a completed manumission;
 *  2. Confirm -> ZERO provider calls, legal state free, exactly one manumission record, card gone;
 *  3. replay of the ORIGINAL turn_key -> replayed, zero provider calls, no new card, still one manumission.
 * Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/consolidation-block5a-live.js
 */
const NARRATOR_MODEL = "z-ai/glm-5.2";
interface Wire { readonly n: number; readonly kind: "narrator" | "other"; readonly model: unknown; readonly max_tokens: unknown; readonly status?: number }
const wire: Wire[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
  const body = JSON.parse(init.body) as Record<string, any>;
  const response = await realFetch(input, init);
  wire.push({ n: wire.length + 1, kind: body.model === NARRATOR_MODEL ? "narrator" : "other", model: body.model, max_tokens: body.max_tokens, status: response.status });
  return response;
}) as typeof fetch;

async function main(): Promise<void> {
  const outDir = join("docs", "evaluations", "consolidation_block5a_live"), saveDir = join("saves", "consolidation_block5a_live");
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off" });
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
  const deps: SessionDeps = { ...rest, autosave: false, unsafe_trace: true };

  const MAREN = "campaign_character_maren";
  const campaign = SLAVE_MARKET_V1.create(deps.world, `block5a_${Date.now()}`);
  const where = "calderan_slave_market";
  const placed = campaign.apply({ expected_revision: campaign.revision, commands: [
    { kind: "register_character", character: { id: MAREN, origin: { kind: "created" }, profile: { name: "Maren", age: { kind: "exact", years: 19 } }, current: { current_location: where, status: "active" } } },
    { kind: "set_legal_status", character_id: MAREN, status: "enslaved", holder_id: "nicco" }] });
  if (!placed.changed) throw new Error("setup failed");
  const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
  const legal = () => campaign.exportSnapshot().legal_statuses.find(l => l.character_id === MAREN);
  const manumissions = () => campaign.exportSnapshot().transactions.filter(t => t.kind === "manumission").length;
  const input = "I hereby free you, Maren. You are no longer mine.";
  const key = `block5a_live_${Date.now().toString(36)}`, revision = campaign.revision;

  const m1 = wire.length;
  const turn = await session.submitPlayerInput(input, { turn_key: key, expected_revision: revision });
  const turnCalls = wire.slice(m1), narration = turn.ok ? turn.narration : "";
  const cardView = session.getConfirmationView(), card = cardView.cards[0];
  const afterTurn = { ok: turn.ok, error: turn.ok ? null : turn.error, legal: legal()?.status, manumissions: manumissions(), cards: cardView.cards.length, card_title: card?.title, narration };
  const usage = JSON.stringify(turn.ok ? turn.trace?.usage ?? {} : {}); let tokens = 0, cost = 0;
  for (const m of usage.matchAll(/"total_tokens":(\d+)/g)) tokens += Number(m[1]); for (const m of usage.matchAll(/"cost(?:_usd)?":([\d.]+)/g)) cost += Number(m[1]);

  let confirm: Record<string, unknown> = { skipped: true }, replay: Record<string, unknown> = { skipped: true };
  if (card) {
    const m2 = wire.length;
    const c = session.confirmPending({ ref: card.ref, expected_revision: campaign.revision });
    confirm = { ok: c.ok, status: c.ok ? c.status : null, provider_calls: wire.length - m2, legal: legal()?.status, holder_cleared: legal()?.holder_id === undefined, manumissions: manumissions(), cards_after: session.getConfirmationView().cards.length };
    const m3 = wire.length, again = await session.submitPlayerInput(input, { turn_key: key, expected_revision: revision });
    replay = { ok: again.ok, replayed: again.ok ? again.replayed === true : false, provider_calls: wire.length - m3, cards_after: session.getConfirmationView().cards.length, manumissions: manumissions(), legal: legal()?.status };
  }
  const COMPLETED = /\b(is|are|was|were|now|finally)\b[^.!?]{0,30}\b(free|freed|manumitted|emancipated)\b|\byou are free\b/i;
  const verdict = {
    turn_ok: afterTurn.ok === true, card_created: afterTurn.cards === 1, legal_unchanged_after_words: afterTurn.legal === "enslaved", no_manumission_after_words: afterTurn.manumissions === 0,
    prose_has_no_completed_claim: !COMPLETED.test(narration), confirm_zero_provider_calls: confirm.provider_calls === 0, confirm_freed: confirm.legal === "free" && confirm.manumissions === 1,
    replay_zero_calls: replay.provider_calls === 0 && replay.replayed === true, replay_no_new_card_no_second_manumission: replay.cards_after === 0 && replay.manumissions === 1,
  };
  await session.shutdown({ discard_unsaved: true });
  const run = { verdict, afterTurn, turn_provider_calls: turnCalls, narrator_requests: turnCalls.filter(w => w.kind === "narrator").length, other_requests: turnCalls.filter(w => w.kind === "other").length, confirm, replay, total_provider_requests: wire.length, total_tokens: tokens, cost_usd: cost };
  await writeFile(join(outDir, "run.json"), JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ verdict, narration, confirm, replay, calls: wire.length, tokens, cost }, null, 1));
}
await main();
