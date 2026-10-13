import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../../app/index.js";
import type { SessionDeps } from "../../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../../app/scenarios.js";

/**
 * Consolidation Block 5B: focused LIVE certification (evaluation only) of AUTH-2 on the production GameSession -> TurnCoordinator -> Narrator/Controller path.
 *  LIVE A  narration-only introduction: the Narrator is asked to introduce a named stranger; afterwards NO persistent CampaignCharacter may exist for them.
 *  LIVE B  explicit-authority materialization: the player haggles for a woman; the person Actual Offer card appears (no persistent person yet); the explicit Accept
 *          materializes exactly ONE persistent Slave. One attempt per scenario, no reroll. Merge/retire are NOT run live.
 * Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/historical/consolidation-block5b-live.js
 */
const NARRATOR_MODEL = "z-ai/glm-5.2";
interface Wire { readonly n: number; readonly kind: "narrator" | "other"; readonly model: unknown; readonly status?: number }
const wire: Wire[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
  const body = JSON.parse(init.body) as Record<string, any>;
  const response = await realFetch(input, init);
  wire.push({ n: wire.length + 1, kind: body.model === NARRATOR_MODEL ? "narrator" : "other", model: body.model, status: response.status });
  return response;
}) as typeof fetch;

async function main(): Promise<void> {
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block5b_live"), saveDir = join("saves", "consolidation_block5b_live");
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off" });
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
  const deps: SessionDeps = { ...rest, autosave: false, unsafe_trace: true };
  const usageOf = (trace: unknown) => { const usage = JSON.stringify((trace as { usage?: unknown } | undefined)?.usage ?? {}); let tokens = 0, cost = 0;
    for (const m of usage.matchAll(/"total_tokens":(\d+)/g)) tokens += Number(m[1]); for (const m of usage.matchAll(/"cost(?:_usd)?":([\d.]+)/g)) cost += Number(m[1]); return { tokens, cost }; };
  let tokens = 0, cost = 0;
  const create = (label: string) => { const campaign = SLAVE_MARKET_V1.create(deps.world, `block5b_${label}_${Date.now()}`); return { campaign, session: GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text }) }; };
  const created = (c: ReturnType<typeof create>["campaign"]) => c.exportSnapshot().characters.filter(x => x.origin.kind === "created");
  const turn = async (session: GameSession, campaign: ReturnType<typeof create>["campaign"], text: string) => {
    const mark = wire.length, key = `b5b_${Math.random().toString(36).slice(2, 12)}`;
    const outcome = await session.submitPlayerInput(text, { turn_key: key, expected_revision: campaign.revision });
    const u = usageOf(outcome.ok ? outcome.trace : undefined); tokens += u.tokens; cost += u.cost;
    return { text, ok: outcome.ok, error: outcome.ok ? null : outcome.error, narration: outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null,
      provisional: outcome.ok ? (outcome.trace as { identity_provisional_count?: number } | undefined)?.identity_provisional_count ?? null : null, provider_calls: wire.length - mark };
  };

  // ---------------- LIVE A: narration-only introduction
  const A = create("a");
  const a1 = await turn(A.session, A.campaign, 'I turn to the nearest vendor behind a stall and ask him, "Who are you, friend? What is your name?"');
  const a2 = await turn(A.session, A.campaign, 'I nod and say, "Pleased to meet you. I am Nicco. Tell me, how long have you worked this market?"');
  const aCreated = created(A.campaign);
  const aVerdict = { turns_ok: a1.ok && a2.ok, no_persistent_character_created: aCreated.length === 0, created_ids: aCreated.map(c => c.profile.name ?? "(unnamed)") };
  await A.session.shutdown({ discard_unsaved: true });

  // ---------------- LIVE B: person Actual Offer Accept
  const B = create("b");
  const turns = [] as Awaited<ReturnType<typeof turn>>[];
  const inputs = ["I walk to the cages and ask Korvin which women he has for sale.", "I want the younger one. What is your price, Korvin?", "Three hundred for her."];
  let card: { ref: string } | undefined;
  let cardAfter = -1;
  const createdBeforeCard: number[] = [];
  for (const [i, input] of inputs.entries()) {
    turns.push(await turn(B.session, B.campaign, input));
    card = B.session.getTradeView().offer ?? undefined;
    createdBeforeCard.push(created(B.campaign).length);
    if (card) { cardAfter = i; break; }
  }
  let accept: Record<string, unknown> = { skipped: true };
  if (card) {
    const fundsBefore = B.campaign.exportSnapshot().funds.find(f => f.character_id === "nicco")?.gold, mark = wire.length, rev = B.campaign.revision;
    const r = B.session.acceptTradeOffer({ ref: card.ref, expected_revision: B.campaign.revision });
    const persons = created(B.campaign), legal = B.campaign.exportSnapshot().legal_statuses.filter(l => l.holder_id === "nicco" && l.status === "enslaved");
    accept = { ok: r.ok, revision_delta: B.campaign.revision - rev, provider_calls: wire.length - mark, funds_before: fundsBefore, funds_after: B.campaign.exportSnapshot().funds.find(f => f.character_id === "nicco")?.gold,
      persistent_persons: persons.length, slaves_held: legal.length, same_person: persons.length === 1 && legal[0]?.character_id === persons[0]?.id, provenance: persons[0]?.origin_snapshot?.ephemeral_ref ?? null };
  }
  const bVerdict = { card_reached: !!card, no_persistent_person_before_accept: createdBeforeCard.every(n => n === 0), accept_materialized_exactly_one: accept.persistent_persons === 1 && accept.same_person === true && accept.revision_delta === 1, accept_zero_provider_calls: accept.provider_calls === 0 };
  await B.session.shutdown({ discard_unsaved: true });

  const run = { A: { verdict: aVerdict, turns: [a1, a2] }, B: { verdict: bVerdict, turns, card_after_turn: cardAfter + 1, accept }, total_provider_requests: wire.length, narrator_requests: wire.filter(w => w.kind === "narrator").length,
    other_requests: wire.filter(w => w.kind === "other").length, total_tokens: tokens, cost_usd: cost };
  await writeFile(join(outDir, "run.json"), JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ A: aVerdict, B: bVerdict, accept, calls: wire.length, tokens, cost }, null, 1));
}
await main();
