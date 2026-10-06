import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import type { RecentExchange } from "../turn/recent-conversation.js";

/**
 * P8 Economic Baseline V1. One authored reference table (config/economy.yaml), one selective narrator injection path and one
 * persisted per-seller Personal Price Index. Anchors are plausibility references, never mandated prices: there is no haggle
 * engine, no resale formula, no dynamic economy. Committed money stays in the existing whole-gold purse and transactions.
 */
export const ECONOMY_CATEGORIES = ["food", "lodging", "equipment", "services", "slaves"] as const;
export type EconomyCategory = typeof ECONOMY_CATEGORIES[number];
export interface ReferencePrice { readonly key: string; readonly label: string; readonly category: EconomyCategory; readonly silver: number }
export interface IncomeBaseline { readonly key: string; readonly label: string; readonly min_gold: number; readonly max_gold: number | null }
export interface EconomyTable {
  readonly silver_per_gold: number; readonly incomes: readonly IncomeBaseline[]; readonly prices: readonly ReferencePrice[];
  readonly index_range: { readonly min: number; readonly max: number }; readonly price_setters: readonly string[];
}

const fail = (path: string, reason: string): never => { throw new Error(`economy.yaml ${path}: ${reason}`); };
const record = (v: unknown, path: string) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail(path, "expected mapping");
const whole = (v: unknown, path: string, min = 0) => Number.isSafeInteger(v) && (v as number) >= min ? v as number : fail(path, `expected whole number >= ${min}`);
const label = (v: unknown, path: string) => typeof v === "string" && v.trim() && v.length <= 120 ? v : fail(path, "expected short label");
const KEY = /^[a-z][a-z0-9_]*$/;

/** Strict shape validation; whole Gold/Silver only (decimals are rejected). */
export function parseEconomy(text: string): EconomyTable {
  const doc = parseDocument(text, { uniqueKeys: true, strict: true });
  if (doc.errors.length) fail("$", doc.errors[0]!.message);
  const root = record(doc.toJS(), "$");
  if (root.schema_version !== 1) fail("schema_version", "expected 1");
  const silver_per_gold = whole(record(root.currency, "currency").silver_per_gold, "currency.silver_per_gold", 1);
  if (silver_per_gold !== 10) fail("currency.silver_per_gold", "Caldrevan canon is 10 Silver = 1 Gold");
  const incomes = Object.entries(record(root.income_baselines, "income_baselines")).map(([key, raw]) => {
    const r = record(raw, `income_baselines.${key}`), min_gold = whole(r.min_gold, `income_baselines.${key}.min_gold`);
    const max_gold = r.max_gold === null ? null : whole(r.max_gold, `income_baselines.${key}.max_gold`, min_gold);
    if (!KEY.test(key)) fail(`income_baselines.${key}`, "invalid key");
    return { key, label: label(r.label, `income_baselines.${key}.label`), min_gold, max_gold };
  });
  const prices = Object.entries(record(root.reference_prices, "reference_prices")).map(([key, raw]) => {
    const r = record(raw, `reference_prices.${key}`), category = r.category as EconomyCategory;
    if (!KEY.test(key)) fail(`reference_prices.${key}`, "invalid key");
    if (!ECONOMY_CATEGORIES.includes(category)) fail(`reference_prices.${key}.category`, `expected one of ${ECONOMY_CATEGORIES.join(", ")}`);
    const silver = whole(r.gold, `reference_prices.${key}.gold`) * silver_per_gold + whole(r.silver, `reference_prices.${key}.silver`);
    if (silver <= 0 || whole(r.silver, `reference_prices.${key}.silver`) >= silver_per_gold) fail(`reference_prices.${key}`, "expected a positive price with silver below one gold");
    return { key, label: label(r.label, `reference_prices.${key}.label`), category, silver };
  });
  const range = record(root.price_index_range_percent, "price_index_range_percent");
  const index_range = { min: Number.isSafeInteger(range.min) ? range.min as number : fail("price_index_range_percent.min", "expected integer"), max: Number.isSafeInteger(range.max) ? range.max as number : fail("price_index_range_percent.max", "expected integer") };
  if (index_range.min > 0 || index_range.max < 0 || index_range.min < -90) fail("price_index_range_percent", "expected a range containing 0, never below -90");
  const setters = Array.isArray(root.price_setters) ? root.price_setters : fail("price_setters", "expected list");
  const price_setters = setters.map((s, i) => typeof s === "string" && KEY.test(s) ? s : fail(`price_setters[${i}]`, "expected character id"));
  if (new Set(price_setters).size !== price_setters.length) fail("price_setters", "duplicate id");
  return Object.freeze({ silver_per_gold, incomes, prices, index_range, price_setters });
}
/** Repository root: the nearest ancestor holding config/economy.yaml (works from src/ and from the compiled .build/src/). */
function economyPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++, dir = resolve(dir, "..")) if (existsSync(join(dir, "config", "economy.yaml"))) return join(dir, "config", "economy.yaml");
  return fail("$", "config/economy.yaml not found");
}
let cached: EconomyTable | undefined;
export function economy(): EconomyTable { return cached ??= parseEconomy(readFileSync(economyPath(), "utf8")); }

// ------------------------------------------------------------------------------------------------ currency
/** Whole units only. 34 Silver → "3G 4S"; 20 → "2G"; 9 → "9S". Internal unit: Silver. */
export function formatSilver(silver: number, perGold = 10): string {
  if (!Number.isSafeInteger(silver) || silver < 0) throw new Error("silver amount must be a non-negative whole number");
  const g = Math.floor(silver / perGold), s = silver % perGold;
  return g && s ? `${g}G ${s}S` : g ? `${g}G` : `${s}S`;
}
export const toSilver = (gold: number, silver = 0, perGold = 10) => gold * perGold + silver;

// ------------------------------------------------------------------------------------------------ Personal Price Index
/** Deterministic, campaign-specific seller tendency in whole percent (generated once; persisted by set_price_index). */
export function generatePriceIndex(campaignId: string, characterId: string, range = economy().index_range): number {
  const n = createHash("sha256").update(`caldrevan-p8-price-index:${campaignId}:${characterId}`).digest().readUInt32BE(0);
  return range.min + (n % (range.max - range.min + 1));
}
/** rough anchor = P × (1 + index), rounded to whole Gold at 10G and above, otherwise to whole Silver. */
export function adjustedSilver(silver: number, percent: number, perGold = 10): number {
  const raw = silver * (100 + percent) / 100;
  return raw >= 10 * perGold ? Math.round(raw / perGold) * perGold : Math.max(1, Math.round(raw));
}

// ------------------------------------------------------------------------------------------------ selective relevance
/** Commercial exchange, not mere mention of food or an object. Bare "gold" is not money (hair, light). */
const COMMERCE = /\b(?:what (?:do|would|will|did) you (?:want|take|ask)(?: in return)? for|for sale|going rate|too much|too steep|buy\w*|bought|sell\w*|sold|purchas\w*|price\w*|pric(?:y|ey)|cost\w*|how much|pay\w*|paid|overpa\w*|afford\w*|worth|value\w*|apprais\w*|haggl\w*|bargain\w*|barter\w*|hire\w*|hiring|wages?|salar\w*|fees?|rent\w*|bribe\w*|debts?|auction\w*|bid\w*|bidding|deal|cheap\w*|expensive|discount\w*|coins?|purse|\d+\s*(?:gold|silver|g|s)\b|(?:a|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand) (?:gold|silver)\b)/i;
const CATEGORY: Readonly<Record<EconomyCategory, RegExp>> = {
  food: /\b(?:meal|food|eat\w*|dinner|supper|breakfast|lunch|stew|soup|bread|loaf|beer|ale|mead|wine|drinks?|mug|tankard|bowl)\b/i,
  lodging: /\b(?:room|rooms|bed|lodging|lodge|stay\w* the night|for the night|per night|a night|nights)\b/i,
  equipment: /\b(?:sword|greatsword|blade|dagger|knife|axe|spear|mace|bow|crossbow|weapons?|armou?r|plate|mail|helm\w*|shield|gear|equipment)\b/i,
  services: /\b(?:hire\w*|hiring|guards?|bodyguard|mercenar\w*|sellswords?|escort|wages?|salar\w*|services?)\b/i,
  slaves: /\b(?:slaves?|slaver\w*|captives?|enslaved|auction\w*|bid\w*|pens?|cages?|chained|bonded|bondsm[ae]n|household help|servants?)\b/i,
};
const AUCTION = /\b(?:auction\w*|bid\w*|bidding|auctioneer)\b/i;
const NICCO_SELLS = /\b(?:i(?:'d| would| want to| wanna)? (?:like to )?sell|sell (?:you|him|her|them) (?:my|this|these)|what (?:would|will) you (?:give|pay)|how much (?:would|will) you (?:give|pay))\b/i;
const INCOME = /\b(?:wages?|salar\w*|income|earn\w*|per month|a month|monthly|living)\b/i;

export interface EconomicSignals {
  readonly input: string; readonly recent: readonly RecentExchange[];
  /** Short location id/name, for the unmatched-category default. */ readonly location: string;
  /** An enslaved person held by a present seller (existing trade negotiation state). */ readonly trade_negotiation: boolean;
}
export interface EconomicRelevance { readonly categories: readonly EconomyCategory[]; readonly auction: boolean; readonly nicco_selling: boolean; readonly income: boolean }
/**
 * Whether this turn involves price or value, and which categories. Signals: the player's input, the last two finalized exchanges
 * (an ongoing negotiation such as "Too much." keeps its anchors) and an active person-trade. Mentions without commerce
 * ("Are you hungry?") never inject. Null means: no economic reference this turn.
 */
export function economicRelevance(s: EconomicSignals): EconomicRelevance | null {
  const window = s.recent.filter(e => e.status === "finalized").slice(-2).map(e => `${e.player}\n${e.narration}`);
  const commercial = COMMERCE.test(s.input) || window.some(t => COMMERCE.test(t)) || s.trade_negotiation;
  if (!commercial) return null;
  const text = [s.input, ...window].join("\n");
  const categories = ECONOMY_CATEGORIES.filter(c => CATEGORY[c].test(s.input) || window.some(t => CATEGORY[c].test(t)));
  if (s.trade_negotiation && !categories.includes("slaves")) categories.push("slaves");
  if (!categories.length) categories.push(...(/slave|market_slave|pens/i.test(s.location) ? ["slaves" as const]
    : /\b(?:inn|tavern|rest|grind|alehouse)\b|_inn\b|_rest\b/i.test(s.location) ? ["food" as const, "lodging" as const] : ["food" as const, "lodging" as const, "equipment" as const]));
  return { categories: ECONOMY_CATEGORIES.filter(c => categories.includes(c)), auction: AUCTION.test(text), nicco_selling: NICCO_SELLS.test(s.input), income: INCOME.test(text) };
}
export interface SellerTendency { readonly name: string; readonly percent: number }
/** Concise narrator block. Only relevant anchors; seller tendencies are directional guidance, never dialogue material. */
export function renderEconomicReference(r: EconomicRelevance, sellers: readonly SellerTendency[], table = economy()): string {
  const f = (silver: number) => formatSilver(silver, table.silver_per_gold);
  const prices = table.prices.filter(p => r.categories.includes(p.category));
  const lines = [`[ECONOMIC REFERENCE — APPROXIMATE ANCHORS, NOT FIXED PRICES]`,
    `Currency: Gold and Silver only; 10 Silver = 1 Gold. Use whole Gold/Silver amounts (no copper, no decimals, no other coins).`,
    `Relevant anchors: ${prices.map(p => `${p.label} ~${f(p.silver)}`).join("; ")}.`];
  if (r.income) lines.push(`Monthly incomes: ${table.incomes.map(i => `${i.label} ~${i.max_gold === null ? `${i.min_gold}G+` : i.min_gold === i.max_gold ? `${i.min_gold}G` : `${i.min_gold}–${i.max_gold}G`}`).join("; ")}.`);
  for (const s of sellers.slice(0, 3)) {
    const direction = s.percent > 0 ? `prices above the usual (about +${s.percent}%)` : s.percent < 0 ? `prices below the usual (about ${s.percent}%)` : "prices at about the usual level";
    lines.push(`Seller tendency: ${s.name} ${direction}; their rough anchors: ${prices.map(p => `${p.label} ~${f(adjustedSilver(p.silver, s.percent, table.silver_per_gold))}`).join("; ")}.`);
  }
  if (r.categories.includes("slaves")) lines.push("Slaves: an ordinary, unremarkable person sits near the average anchor; a noticeably skilled or valuable one near the good anchor; an exceptional specialist may exceed it; an injured, sick, old or untrained one may fall below it. Use only what the scene supplies to place them.");
  if (r.auction) lines.push("Auction: let opening bids, bidding and the closing price move naturally around these anchors for the lot's apparent quality; no arbitrary extremes (an ordinary slave never goes for a few gold or many thousands) without a reason the scene supplies.");
  if (r.nicco_selling) lines.push("Nicco is selling: the other party is the buyer and may offer below or around ordinary value.");
  lines.push("These anchors keep prices economically plausible. They are approximate, not fixed: seller judgment, quality, condition, urgency and negotiation may move a concrete ask or offer around them, and a character may state a concrete Gold/Silver price this turn. Do not mechanically quote an anchor, never mention anchors, indexes or tendencies, keep a price already quoted in this negotiation as its starting point, and do not invent taxes, tariffs, guild rules or market systems.");
  return lines.join("\n");
}
