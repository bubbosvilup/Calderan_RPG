import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import type { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import type { WorldStore } from "../../src/world/world-store.js";
import { activeTradeOffer } from "../../src/campaign/trade.js";
import { readOffer } from "./offer-fixtures.js";
import type { RecentExchange } from "../../src/turn/recent-conversation.js";

/**
 * Block B4 (P0): a deterministic scale campaign for persistence measurements, built only from valid commands on the real `data/` world (no providers).
 * Default shape: the Master Roadmap's 200 characters / 500 facts / 100 items plus 1,000 trade offers, about 30 percent person offers. Offers come in
 * negotiations (each new price supersedes the standing quote, the haggling churn of TRD-12); some negotiations are accepted (people are materialized,
 * goods become items), the rest are withdrawn. Characters and items include those the accepted offers created.
 */
export interface ScaleShape { readonly characters: number; readonly facts: number; readonly items: number; readonly offers: number; readonly person_share: number }
export const ROADMAP_SCALE: ScaleShape = Object.freeze({ characters: 200, facts: 500, items: 100, offers: 1000, person_share: 0.3 });
const MARKET = "calderan_slave_market";
const SYLLABLES = ["ar", "be", "cor", "da", "el", "fen", "gra", "hal", "ir", "jo", "ka", "lin", "mor", "na", "os", "pel", "qui", "ren", "sa", "tor", "ul", "ve", "wyn", "ys"];
const nameOf = (n: number) => { const a = SYLLABLES[n % 24]!, b = SYLLABLES[Math.floor(n / 24) % 24]!, c = SYLLABLES[Math.floor(n / 576) % 24]!; const s = a + b + c; return s[0]!.toUpperCase() + s.slice(1); };
const pad = (n: number) => String(n).padStart(4, "0");
const at = (narration: string, player: string): RecentExchange => ({ player, narration, status: "finalized", location_id: MARKET });

/** The person offer the real reader produces for one priced captive at the slave market; later person offers are this command with fresh ids. */
function personTemplate(world: WorldStore, campaign: CampaignState): CampaignCommand {
  const r = readOffer(world, campaign.exportSnapshot(), "How much for the woman?", [
    at('Korvin leads Nicco to the last cage, where a woman sits chained behind the bars.\nThe woman lifts her head. "My name is Brenna," she says. "I can cook and keep accounts. I kept the ledgers of a river trader for six years before the debt took me."', "*checks the cages*"),
    at('Korvin taps his ledger. "Five for her. Papers included. She reads, she writes, she counts."\nThe woman does not look away.', "How much for the woman?")], campaign.revision);
  const command = r.commands.find(c => c.kind === "propose_trade_offer");
  if (!command) throw new Error(`scale fixture: no person offer template (${JSON.stringify(r.diagnostics)})`);
  return command;
}
function personOffer(template: CampaignCommand, n: number, price: number): CampaignCommand {
  const name = nameOf(n + 7), text = JSON.stringify(template).replaceAll("campaign_character_r3_brenna", `campaign_character_scale_p${pad(n)}`)
    .replaceAll("campaign_transaction_r2_r3_brenna", `campaign_transaction_scale_p${pad(n)}`).replaceAll("narrated:brenna", `narrated:${name.toLowerCase()}`).replaceAll("Brenna", name);
  const command = JSON.parse(text) as Extract<CampaignCommand, { kind: "propose_trade_offer" }>;
  const transfer = command.subject.kind === "person" ? command.subject.plan.find(c => c.kind === "transfer_person") : undefined;
  if (transfer?.kind === "transfer_person" && transfer.payment) transfer.payment.gold = price;
  return { ...command, price_gold: price };
}
function goodsOffer(n: number, price: number): CampaignCommand {
  const lines = Array.from({ length: 1 + (n % 3) }, (_, i) => ({ name: `${nameOf(n * 3 + i)} cloth`, description: `A bolt of dyed cloth from the ${nameOf(n + i)} looms, folded twice and tied with cord.`,
    visual_description: `A folded bolt of ${["indigo", "ochre", "madder red"][i % 3]} wool cloth tied with a hemp cord.`, category: "material" as const }));
  return { kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty: { kind: "anonymous", label: `the ${nameOf(n)} cloth seller` }, subject: { kind: "goods", lines }, evidence: `${price} gold for the lot.` };
}

export function buildScaleCampaign(world: WorldStore, campaignId = "scale_fixture", shape: ScaleShape = ROADMAP_SCALE): CampaignState {
  const campaign = createOpeningCampaign(world, campaignId);
  const apply = (...commands: CampaignCommand[]) => { if (commands.length) campaign.apply({ expected_revision: campaign.revision, commands }); };
  apply({ kind: "runtime_delta", delta: { player_location: MARKET } }, { kind: "set_funds", character_id: "nicco", gold: 1_000_000 });
  const template = personTemplate(world, campaign);
  const personOffers = Math.round(shape.offers * shape.person_share), goodsOffers = shape.offers - personOffers;
  // Negotiations: people 3 quotes each, goods 2 quotes each; the accepted ones are spread evenly.
  const peopleDeals = Math.ceil(personOffers / 3), goodsDeals = Math.ceil(goodsOffers / 2);
  const bought = Math.min(peopleDeals, Math.round(shape.characters / 5)), boughtGoods = Math.min(goodsDeals, Math.round(shape.items * 0.4));
  let proposed = 0, accepted = 0, acceptedGoods = 0;
  const settle = (accept: boolean) => {
    const offer = activeTradeOffer(campaign.exportSnapshot().trade_offers);
    if (!offer) return;
    if (accept) campaign.commit(campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "accept_trade_offer", offer_id: offer.id }] }));
    else apply({ kind: "withdraw_trade_offer", offer_id: offer.id });
  };
  for (let deal = 0; deal < peopleDeals && proposed < personOffers; deal++) {
    for (let quote = 0; quote < 3 && proposed < personOffers; quote++, proposed++) apply(personOffer(template, deal, 9 - quote * 2));
    const accept = accepted < bought && deal % Math.max(1, Math.floor(peopleDeals / bought)) === 0;
    settle(accept); if (accept) accepted++;
  }
  for (let deal = 0, quotes = 0; deal < goodsDeals && quotes < goodsOffers; deal++) {
    for (let quote = 0; quote < 2 && quotes < goodsOffers; quote++, quotes++) apply(goodsOffer(deal, 4 - quote));
    const accept = acceptedGoods < boughtGoods && deal % Math.max(1, Math.floor(goodsDeals / boughtGoods)) === 0;
    settle(accept); if (accept) acceptedGoods++;
  }
  // The rest of the shape: created characters, created items, campaign facts with one knowledge row each.
  const snapshot = campaign.exportSnapshot(), locations = world.listEntities().filter(e => e.type === "location").map(e => e.id).slice(0, 40);
  const missingCharacters = Math.max(0, shape.characters - snapshot.characters.length);
  for (let start = 0; start < missingCharacters; start += 20) apply(...Array.from({ length: Math.min(20, missingCharacters - start) }, (_, k): CampaignCommand => {
    const n = start + k, name = nameOf(n + 100);
    return { kind: "register_character", character: { id: `campaign_character_scale_c${pad(n)}`, origin: { kind: "created" }, profile: { name, aliases: [`${name} of ${nameOf(n)}`],
      appearance: { hair: { color: ["black", "brown", "copper"][n % 3]! }, eyes: ["gray", "green", "brown"][n % 3]! } }, current: { current_location: locations[n % locations.length]!, conditions: n % 4 ? [] : ["tired"] } } };
  }));
  const missingItems = Math.max(0, shape.items - campaign.exportSnapshot().items.length);
  for (let start = 0; start < missingItems; start += 20) apply(...Array.from({ length: Math.min(20, missingItems - start) }, (_, k): CampaignCommand => {
    const n = start + k;
    return { kind: "create_item", name: `${nameOf(n + 300)} knife`, description: `A short knife with a ${["horn", "bone", "ash"][n % 3]} handle, its blade worn thin by years of sharpening.`,
      visual_description: `A short steel knife with a pale ${["horn", "bone", "ash"][n % 3]} handle wrapped in leather.`, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } };
  }));
  const people = campaign.exportSnapshot().characters.map(c => c.id);
  for (let start = 0; start < shape.facts; start += 25) apply(...Array.from({ length: Math.min(25, shape.facts - start) }, (_, k) => start + k).flatMap((n): CampaignCommand[] => [
    { kind: "create_fact", fact: { id: `campaign_fact_scale_${pad(n)}`, content: { kind: "campaign", statement: `${nameOf(n)} owes ${n % 17 + 2} silver to a ${nameOf(n + 50)} moneylender in the lower market.`, truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: people[n % people.length]!, fact_id: `campaign_fact_scale_${pad(n)}`, status: n % 3 ? "knows" : "suspects" } }]));
  return campaign;
}
