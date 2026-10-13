import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../app/index.js";
import type { SessionDeps } from "../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../app/scenarios.js";
import type { CampaignSnapshot } from "../campaign/types.js";

/**
 * Person Actual Offer end-to-end: ONE focused LIVE validation (evaluation only) through the real production GameSession/Narrator/Controller path.
 * Korvin offers the captive woman, the price is haggled to 260, the card exists, the player accepts through the real acceptTradeOffer path, funds drop,
 * the purchased person appears as "Slave", the player asks her name and the SAME entity takes the disclosed name. No reroll of the playthrough.
 *
 * Usage: NODE_USE_ENV_PROXY=1 node .build/src/dev/person-offer-live-cert.js
 */
const TRANSIENT = new Set(["network_error", "timeout", "rate_limited", "provider_unavailable"]);
const outDir = join("artifacts", "local", "evaluations", "person_offer_live"), saveDir = join("saves", "person_offer_live");
async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const requests: unknown[] = [];
  const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off", prepared_narrator_observer: (r: unknown) => { requests.push(r); } });
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
  const deps: SessionDeps = { ...rest, autosave: false };
  const campaign = SLAVE_MARKET_V1.create(deps.world, "person_offer_live");
  const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
  // Evaluation fixture: the live seller sets the price (1000+ for a young woman), so the purse is raised to let the real Accept path run. Nothing else is staged.
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "set_funds", character_id: "nicco", gold: 2000 }] });
  const log: unknown[] = []; let narratorCalls = 0, controllerCalls = 0;
  const snap = () => campaign.exportSnapshot() as unknown as CampaignSnapshot;
  const gold = () => session.getView().player.gold;
  const say = async (text: string) => {
    let outcome, attempts = 0;
    for (;;) { attempts++; outcome = await session.submitPlayerInput(text); if (outcome.ok || attempts >= 2) break; if (!(TRANSIENT.has(outcome.error.provider_code ?? "") && !outcome.error.turn_state_changed)) break; }
    const sent = requests.splice(0); narratorCalls += sent.length; controllerCalls += attempts;
    const card = session.getTradeView().offer;
    const created = snap().characters.filter(c => c.origin.kind === "created").map(c => ({ id: c.id, name: c.profile.name ?? null }));
    log.push({ input: text, ok: outcome.ok, narration: outcome.ok ? outcome.narration : null, error: outcome.ok ? null : outcome.error, card: card ? { lines: card.lines, ref_present: !!card.ref } : null,
      usage: outcome.ok ? outcome.trace?.usage ?? null : null, created, present: session.getView().scene.present });
    console.log(JSON.stringify({ input: text, ok: outcome.ok, card: card?.lines ?? null, created }));
    return outcome;
  };
  const priced = () => { const o = session.getTradeView().offer; return o && /BUY/i.test(o.lines.join(" ")) ? o : undefined; };
  await say("looks for private licensed sellers");
  for (const t of ["asks Korvin whether he has a woman for sale, and how much", "I want the younger one. Sell her to me, price?"]) { if (priced()) break; await say(t); }
  const first = priced()?.lines.join(" | ") ?? null;
  const price = () => { const m = priced()?.lines.join(" ").match(/(\d[\d,]*)\s*(?:gold|g\b)/i); return m ? Number(m[1]!.replace(/,/g, "")) : undefined; };
  const prices: (number | undefined)[] = [price()];
  const bids = ["Too much. Two hundred sixty for the younger one, take it or leave it.", "Meet me at four hundred and I pay on the spot.", "Seven hundred, final. I pay now."];
  for (const bid of bids) { if (prices.length >= 3 && prices.at(-1)! < prices[0]!) break; await say(bid); prices.push(price()); }
  const beforeGold = gold(), card = session.getTradeView().offer;
  let accept: unknown = null, afterGold: unknown = null, slave: unknown = null, renamed: unknown = null;
  if (card) {
    await say("Done, it's a deal."); // verbal deal must not settle
    const verbalGold = gold();
    log.push({ verbal_deal_gold_unchanged: verbalGold === beforeGold });
    const live = session.getTradeView().offer;
    if (live) {
      const r = session.acceptTradeOffer({ ref: live.ref, expected_revision: session.getView().session.revision });
      accept = { ok: r.ok, receipt: r.ok ? (r as { receipt?: unknown }).receipt ?? null : (r as { error?: unknown }).error };
      afterGold = gold();
      slave = session.getView().scene.present.filter(p => /slave/i.test(p.name)).map(p => ({ id: p.id, name: p.name }));
      for (const t of ["asks the woman: what is your name?", "tells her you will keep her safe and asks again for her name"]) {
        const id = snap().characters.find(c => c.origin.kind === "created")?.id; const n = id ? snap().characters.find(c => c.id === id)?.profile.name : undefined;
        if (n) break; await say(t);
      }
      const created = snap().characters.filter(c => c.origin.kind === "created");
      renamed = created.map(c => ({ id: c.id, name: c.profile.name ?? null, same_id_as_slave: Array.isArray(slave) && slave.some((s: { id: string }) => s.id === c.id) }));
    }
  }
  const summary = { first_card: first, price_trail: prices, card_before_accept: card?.lines ?? null, gold_before: beforeGold, gold_after: afterGold, accept, slave_in_sidebar: slave, after_name: renamed, narrator_calls: narratorCalls, controller_calls: controllerCalls };
  console.log(JSON.stringify(summary));
  await writeFile(join(outDir, "run.json"), JSON.stringify({ summary, log }, null, 2));
  await session.shutdown({ discard_unsaved: true });
}
await main();
