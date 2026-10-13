import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../../app/index.js";
import type { SessionDeps } from "../../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../../app/scenarios.js";
import type { CampaignSnapshot, TradeOfferRecord } from "../../campaign/types.js";

/**
 * Consolidation Block 2: focused LIVE certification (evaluation only). Production GameSession -> TurnCoordinator -> Narrator/Controller; the explicit Accept goes
 * through GameSession.acceptTradeOffer exactly as the UI does. No reroll: a scenario gets at most MAX_TURNS offer-eliciting turns and one risk turn; a single retry
 * only for a provider transient that changed no state.
 *
 * Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/historical/consolidation-block2-live.js <A|B>
 */
const TRANSIENT = new Set(["network_error", "timeout", "rate_limited", "provider_unavailable"]);
const MAX_TURNS = 3;
const SCENARIOS = {
  A: { elicit: ["I ask Korvin how many gold pieces he wants for a plain iron dagger from his stock. I only pay in gold.", "I ask him for his firm price in gold pieces for the iron dagger.", "I tell him I am serious and ask him to name one price in whole gold pieces for the iron dagger."],
    risk: "*I count the gold into his palm, take the dagger from the counter and tuck it into my belt.*" },
  B: { elicit: ["I want to SELL my old rusty sword to Korvin. I take it from my belt, show it to him and ask how many gold pieces he will pay me for it. I only deal in gold.", "I ask Korvin for his firm offer in gold pieces to buy my old rusty sword from me.", "I tell him I am serious about selling and ask him to name one price in whole gold pieces that he will pay me for the rusty sword."],
    risk: "*I hand him the sword across the counter and hold out my palm for the coins.*" },
} as const;

async function main(): Promise<void> {
  const key = (process.argv[2] ?? "").toUpperCase() as keyof typeof SCENARIOS;
  const plan = SCENARIOS[key]; if (!plan) throw new Error("usage: consolidation-block2-live <A|B>");
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block2_live"), saveDir = join("saves", "consolidation_block2_live", key);
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const requests: unknown[] = [];
  const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off", prepared_narrator_observer: (r: unknown) => { requests.push(r); } });
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
  const deps: SessionDeps = { ...rest, autosave: false, unsafe_trace: true };
  const campaign = SLAVE_MARKET_V1.create(deps.world, `block2_live_${key.toLowerCase()}_${Date.now()}`);
  if (key === "B") campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "create_item", name: "Old Rusty Sword", description: "A pitted blade.", visual_description: "an old rusty sword", category: "weapon", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } }] });
  const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
  const snap = () => campaign.exportSnapshot() as unknown as CampaignSnapshot;
  const gold = () => snap().funds.find(f => f.character_id === "nicco")?.gold ?? null;
  const active = () => (snap().trade_offers ?? []).find(o => o.status === "active") as TradeOfferRecord | undefined;
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
    const o = active();
    const entry = { label, input: text, ok: outcome.ok, attempts, narration: outcome.ok ? outcome.narration : outcome.uncommitted_narration ?? null, error: outcome.ok ? null : outcome.error,
      narrator_requests: sent.length, narration_status: trace?.narration_status ?? null, audit: trace?.audit_issue_kinds ?? [], revision_issues: trace?.revision_issue_kinds ?? [],
      committed: trace?.committed_command_kinds ?? [], rejected: trace?.rejected_command_kinds ?? [], usage: trace?.usage ?? null,
      revision: campaign.revision, gold: gold(), active_offer: o ? { id: o.id, direction: o.direction, price: o.price_gold, subject: o.subject, counterparty: o.counterparty } : null,
      trade_card: session.getTradeView().offer, proposal: outcome.ok ? (session.exportTurnDebug(outcome.turn_id, { unsafe: true })?.trace.unsafe as { controller_proposal?: unknown; authorization?: unknown } | undefined) : null, inventory: session.getView().player.inventory.map(i => i.name) };
    log.push(entry); console.log(JSON.stringify({ label, ok: outcome.ok, gold: entry.gold, offer: entry.active_offer?.price ?? null, audit: entry.audit, status: entry.narration_status })); return entry;
  };
  const startGold = gold(), startItems = snap().items.map(i => i.id).sort();
  for (const [i, text] of plan.elicit.entries()) { const e = await turn(`elicit_${i + 1}`, text); if (!e.ok || active()) break; }
  const offer = active();
  if (!offer) { await writeFile(join(outDir, `${key}.json`), JSON.stringify({ scenario: key, result: "NO_OFFER", log }, null, 2)); console.log("NO_OFFER"); await session.shutdown({ discard_unsaved: true }); return; }
  const itemBefore = snap().items.find(i => i.id === (offer.subject.kind === "items" ? offer.subject.item_ids[0] : "")) ?? null;
  // Pre-click state after the risk turn.
  const risk = await turn("risk", plan.risk);
  const offerAfterRisk = active();
  const pre = { offer_still_active: !!offerAfterRisk && offerAfterRisk.id === offer.id, gold_unchanged: gold() === startGold, items_unchanged_ids: JSON.stringify(snap().items.map(i => i.id).sort()) === JSON.stringify(startItems),
    sell_item_still_nicco: key === "B" ? (() => { const it = snap().items.find(i => i.id === itemBefore?.id); return it?.owner_id === "nicco" && it.position.kind === "carried"; })() : null,
    delivered_claims_payment: /\b(?:hands? (?:him|korvin|over)|counts? (?:out )?(?:the )?(?:gold|coins)|pays?|paid|pockets?)\b[^.!?]{0,60}\b(?:gold|coins?)\b|now belongs to/i.test(String(risk.narration ?? "").replace(/"[^"]*"/g, "")) };
  const card = session.getTradeView().offer;
  const revision = campaign.revision, goldBefore = gold();
  const accepted = card ? session.acceptTradeOffer({ ref: card.ref, expected_revision: revision }) : null;
  const after = snap();
  const post: Record<string, unknown> = { accept_ok: accepted?.ok ?? null, gold_before: goldBefore, gold_after: gold(), delta: (gold() ?? 0) - (goldBefore ?? 0), revision_after: campaign.revision,
    offer_status: (after.trade_offers ?? []).find(o => o.id === offer.id)?.status, receipt: accepted && accepted.ok ? accepted.receipt : null };
  if (key === "A") { const bought = after.items.filter(i => !startItems.includes(i.id)); post.new_items = bought.map(i => ({ id: i.id, name: i.name, owner_id: i.owner_id, position: i.position, acquisition: i.acquisition })); }
  else {
    const it = after.items.find(i => i.id === itemBefore?.id);
    post.item = it ? { id: it.id, owner_id: it.owner_id, position: it.position, acquisition: it.acquisition } : null; post.item_count_same = after.items.length === startItems.length;
    post.settlement = (after.trade_offers ?? []).find(o => o.id === offer.id)?.settlement ?? null;
    post.view_inventory_has_sword = session.getView().player.inventory.some(i => /sword/i.test(i.name)); post.view_equipment_has_sword = session.getView().player.equipment.some(e => JSON.stringify(e).toLowerCase().includes("sword"));
  }
  const second = card ? session.acceptTradeOffer({ ref: card.ref, expected_revision: campaign.revision }) : null;
  post.second_accept = second ? { ok: second.ok, reason: second.ok ? null : second.reason ?? null } : null; post.gold_after_second = gold();
  await writeFile(join(outDir, `${key}.json`), JSON.stringify({ scenario: key, offer, item_before: itemBefore, pre, post, narrator_calls: narratorCalls, controller_calls: controllerCalls, transient_retries: retries, total_tokens: tokens, cost_usd: cost, log }, null, 2));
  console.log(JSON.stringify({ pre, post, narratorCalls, controllerCalls, tokens, cost }, null, 1));
  await session.shutdown({ discard_unsaved: true });
}
await main();
