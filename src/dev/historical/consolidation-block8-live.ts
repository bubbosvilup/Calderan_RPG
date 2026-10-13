import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../../app/index.js";
import type { SessionDeps } from "../../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../../app/scenarios.js";
import type { CampaignSnapshot, TradeOfferRecord } from "../../campaign/types.js";
import { learnCanonicalName } from "../../campaign/identity-knowledge.js";

/**
 * Consolidation Block 8, phase 4: three BOUNDED live Actual Offer trigger regressions (evaluation only) on the production GameSession -> TurnCoordinator path.
 *  LIVE A  the seller shows exactly one person and says "This one is 100 gold."          -> the card: player buys, the SAME subject, 100.
 *  LIVE B  seller 100, player 90, seller 95                                                 -> the actionable card is the SELLER's 95; 100 superseded; no 90 offer.
 *  LIVE C  seller 400, player 250, seller 275                                               -> the actionable card is 275.
 * Precondition seeded for all three: Nicco knows Korvin by name (without it the narration says "the man" and a person offer fails closed: seller_authority_unestablished).
 * One bounded attempt per scenario, at most three numeric price exchanges, no reroll (a single retry only for a provider transient that changed no state).
 * If the model's wording prevents the intended numeric exchange, the scenario is recorded NOT REACHED, never retried. One OPTIONAL end-to-end Accept (B preferred).
 * ACCEPT_RUN=1 (with A): the separately-labelled optional end-to-end Accept run.
 * Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/historical/consolidation-block8-live.js [A] [B] [C]
 */
interface Wire { readonly n: number; readonly model: unknown; readonly status?: number }
const wire: Wire[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
  const entry = { n: wire.length + 1, model: (JSON.parse(init.body) as { model?: unknown }).model } as { n: number; model: unknown; status?: number }; wire.push(entry);
  const response = await realFetch(input, init); entry.status = response.status; return response;
}) as typeof fetch;

const TRANSIENT = new Set(["network_error", "timeout", "rate_limited", "provider_unavailable"]);
const SETUP = "goes to Korvin, among the private licensed sellers";
interface Plan { readonly id: "A" | "B" | "C"; readonly purpose: string; readonly turns: readonly { readonly say: string; readonly numeric: string; readonly want_active: number | null }[] }
const PLANS: readonly Plan[] = [
  { id: "A", purpose: "one provisional person, seller says 100", turns: [
    { say: "I tell Korvin I want to see exactly one woman from his stock, only one, and ask his price. Korvin looks over one woman in the pens and says plainly: \"This one is 100 gold.\"", numeric: "seller 100", want_active: 100 }] },
  { id: "B", purpose: "seller 100, player 90, seller 95", turns: [
    { say: "I tell Korvin I want to see exactly one woman from his stock, only one, and ask his price. Korvin looks over one woman in the pens and says plainly: \"This one is 100 gold.\"", numeric: "seller 100", want_active: 100 },
    { say: "I answer: \"Ninety.\"", numeric: "player 90", want_active: null },
    { say: "I hold at ninety. Korvin sighs and says: \"Ninety-five. That's my last word on her.\"", numeric: "seller 95", want_active: 95 }] },
  { id: "C", purpose: "seller 400, player 250, seller 275", turns: [
    { say: "I tell Korvin I want to see exactly one woman from his stock, only one, and ask his price. Korvin looks over one woman in the pens and says plainly: \"This one is 400 gold.\"", numeric: "seller 400", want_active: 400 },
    { say: "I answer: \"Two hundred fifty.\"", numeric: "player 250", want_active: null },
    { say: "I hold at two hundred fifty. Korvin sighs and says: \"Two hundred seventy-five. That's my last word on her.\"", numeric: "seller 275", want_active: 275 }] },
];
// Informational only (a human reads the narration): wording that CLAIMS a completed payment or transfer. Never a pass/fail criterion by itself; the committed state is.
const COMPLETION = /\b(?:(?:Nicco|he|you) (?:pays|paid|counts out)|counts? out (?:the |\d+ |some )?(?:coins?|gold)|hands? over (?:the )?(?:coins?|gold)|pockets? the (?:coins?|gold)|she'?s yours|(?:she|it) is sold|deal is done|it'?s a deal)\b/i;

async function main(): Promise<void> {
  const acceptRun0 = process.env.ACCEPT_RUN === "1";
  const want = process.argv.slice(2).map(s => s.toUpperCase()), plans = PLANS.filter(p => !want.length || want.includes(p.id));
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block8_live"); await mkdir(outDir, { recursive: true });
  const results: Record<string, unknown>[] = []; let tokens = 0, cost = 0, acceptedOnce: string | undefined;
  for (const plan of plans) {
    const saveDir = await mkdtemp(join(tmpdir(), `caldrevan-block8-live-${plan.id.toLowerCase()}-`));
    const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off" });
    const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
    const deps: SessionDeps = { ...rest, autosave: false };
    const campaign = SLAVE_MARKET_V1.create(deps.world, `block8_live_${plan.id.toLowerCase()}`);
    // Precondition (seeded, not asked of the model): Nicco already knows the private seller by name, so the delivered narration names Korvin as the speaker.
    campaign.apply({ expected_revision: campaign.revision, commands: learnCanonicalName(deps.world, campaign.exportSnapshot(), "korvin") });
    const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
    const wire0 = wire.length, turns: Record<string, unknown>[] = [];
    const snap = () => campaign.exportSnapshot() as unknown as CampaignSnapshot;
    const offers = () => (snap().trade_offers ?? []) as unknown as readonly TradeOfferRecord[];
    const gold = () => snap().funds.find(f => f.character_id === "nicco")!.gold;
    const created = () => snap().characters.filter(c => c.origin.kind === "created");
    let failed: string | undefined;
    for (const [index, t] of [{ say: SETUP, numeric: "setup (no number)", want_active: null as number | null }, ...plan.turns].entries()) {
      let outcome, attempts = 0;
      for (;;) {
        attempts++; outcome = await session.submitPlayerInput(t.say);
        if (outcome.ok || attempts >= 2) break;
        const code = outcome.error.provider_code ?? "";
        if (!(TRANSIENT.has(code) && !outcome.error.turn_state_changed)) break;
      }
      const trace = outcome.ok ? outcome.trace : undefined, usage = JSON.stringify(trace?.usage ?? {}); let tk = 0, cs = 0;
      for (const m of usage.matchAll(/"total_tokens":(\d+)/g)) tk += Number(m[1]); for (const m of usage.matchAll(/"cost(?:_usd)?":([\d.]+)/g)) cs += Number(m[1]);
      tokens += tk; cost += cs;
      const narration = outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null, card = session.getTradeView().offer;
      turns.push({ turn: index + 1, numeric: t.numeric, input: t.say, ok: outcome.ok, attempts, error: outcome.ok ? null : outcome.error, narration,
        narration_mentions_completed_payment_or_ownership: index > 0 && typeof narration === "string" && COMPLETION.test(narration),
        audit: trace?.audit_issue_kinds ?? [], committed: trace?.committed_command_kinds ?? [], rejected: trace?.rejected_command_kinds ?? [],
        card: card ? { kind: card.kind, price_gold: card.price_gold, lines: card.lines } : null,
        offers: offers().map(o => ({ id: o.id, direction: o.direction, status: o.status, price_gold: o.price_gold, subject: o.subject.kind, subject_id: o.subject.kind === "person" ? o.subject.subject_character_id : null })),
        gold: gold(), created: created().length, transactions: snap().transactions.length, tokens: tk, cost_usd: cs });
      console.log(JSON.stringify({ plan: plan.id, turn: index + 1, ok: outcome.ok, card: card?.price_gold ?? null, offers: offers().map(o => `${o.direction}:${o.price_gold}:${o.status}`) }));
      if (!outcome.ok) { failed = `turn ${index + 1} failed: ${JSON.stringify(outcome.error)}`; break; }
    }
    // ---- evaluation (deterministic reading of the committed state; the model's wording decided whether the exchange was reached)
    const all = offers(), active = all.filter(o => o.status === "active"), last = plan.turns[plan.turns.length - 1]!;
    const subjects = new Set(all.flatMap(o => o.subject.kind === "person" ? [o.subject.subject_character_id] : []));
    const card = session.getTradeView().offer;
    const problems: string[] = [];
    if (failed) problems.push(failed);
    // NOT REACHED = the model's wording did not deliver the intended numeric exchange as a priced PERSON (the final price, or in B/C the first seller price, never became an offer).
    const reachedPrice = all.some(o => o.price_gold === last.want_active) && (plan.id === "A" || all.some(o => o.price_gold === plan.turns[0]!.want_active)), notReached = !failed && !reachedPrice;
    if (!notReached && !failed) {
      if (active.length !== 1) problems.push(`expected exactly one active offer, got ${active.length}`);
      if (active[0]?.price_gold !== last.want_active) problems.push(`active price ${active[0]?.price_gold}, wanted ${last.want_active}`);
      if (active[0]?.direction !== "buy" || active[0]?.subject.kind !== "person") problems.push(`wrong direction/subject: ${active[0]?.direction}/${active[0]?.subject.kind}`);
      if (!card || card.price_gold !== last.want_active || card.kind !== "person") problems.push("the card is missing or shows another price");
      if (subjects.size !== 1) problems.push(`offers name ${subjects.size} different subjects`);
      if (plan.id !== "A") {
        const stale = all.find(o => o.price_gold === plan.turns[0]!.want_active);
        if (!stale || stale.status !== "superseded") problems.push("the first seller price is not marked superseded");
        const playerPrice = plan.id === "B" ? 90 : 250;
        if (all.some(o => o.price_gold === playerPrice)) problems.push(`the player's own ${playerPrice} became an offer`);
      }
      if (gold() !== 500 || created().length !== 0 || snap().transactions.length !== 0 || snap().legal_statuses.some(l => l.status === "enslaved" && l.holder_id === "nicco")) problems.push("payment / materialization / legal transfer happened before Accept");
      if (turns.some(t => t.narration_mentions_completed_payment_or_ownership)) problems.push("a delivered numeric-turn narration matches the completed-payment wording (read it: informational unless the state moved)");
    }
    const verdict = failed ? "ERROR" : notReached ? "NOT REACHED" : problems.length ? "FAIL" : "PASS";
    const result: Record<string, unknown> = { id: plan.id, purpose: plan.purpose, verdict, problems, wire_calls: wire.length - wire0, subjects: subjects.size, turns };
    // ---- optional end-to-end Accept: exactly ONE scenario, B preferred (else the first PASS)
    const acceptRun = process.env.ACCEPT_RUN === "1";
    if (!acceptedOnce && (acceptRun ? !!card && active.length === 1 : verdict === "PASS" && (plan.id === "B" || !plans.some(p => p.id === "B")))) {
      const before = { gold: gold(), offer: active[0]!, revision: session.getView().session.revision };
      const r = card ? session.acceptTradeOffer({ ref: card.ref, expected_revision: before.revision }) : undefined;
      const accepted = offers().find(o => o.id === before.offer.id), person = created();
      const accept = { scenario: plan.id, ok: r?.ok === true, error: r && !r.ok ? r.error : null, price_deducted: before.gold - gold(), expected_price: before.offer.price_gold, gold_after: gold(), characters_created: person.length,
        created_is_the_offer_subject: person.length === 1 && before.offer.subject.kind === "person" && person[0]!.id === before.offer.subject.subject_character_id,
        legal: snap().legal_statuses.filter(l => l.status === "enslaved").map(l => `${l.character_id}:${l.holder_id}`), transactions: snap().transactions.length,
        offer_status: accepted?.status, settlement: accepted?.settlement ?? null, revision_delta: session.getView().session.revision - before.revision };
      result.accept = accept; acceptedOnce = plan.id;
      console.log(JSON.stringify({ accept }));
    }
    results.push(result);
    await session.shutdown({ discard_unsaved: true }).catch(() => undefined); await rm(saveDir, { recursive: true, force: true });
  }
  const out = { generated_at: new Date().toISOString(), wire_total: wire.length, wire_by_model: Object.fromEntries([...new Set(wire.map(w => String(w.model)))].map(m => [m, wire.filter(w => String(w.model) === m).length])),
    tokens, cost_usd: Number(cost.toFixed(5)), accept_completed_in: acceptedOnce ?? null, results };
  await writeFile(join(outDir, acceptRun0 ? "result_ACCEPT_RUN.json" : `result_${plans.map(p => p.id).join("")}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ wire_total: wire.length, tokens, cost_usd: out.cost_usd, verdicts: results.map(r => `${String(r.id)}:${String(r.verdict)}`), accept: acceptedOnce ?? null }, null, 1));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
