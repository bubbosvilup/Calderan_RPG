# P8 — ECONOMIC BASELINE / PRICE AUTHORITY V1

**Status:** **CLOSED / IMPLEMENTED (V1)**. This is a plausibility baseline, not an economic simulation.
**Date:** 2026-10-06

## Summary

- Caldrevan now has an authored Gold/Silver economy (10S = 1G, whole units only) and one compact anchor table: [config/economy.yaml](config/economy.yaml).
- Each canonical seller gets a persisted, campaign-specific Personal Price Index.
- A single selective path puts the relevant anchors in front of the narrator **only on turns that involve price or value**. The same decision lets the grounding audit accept concrete Gold/Silver asks on those turns.
- Purchase, purse and transaction authority are unchanged. There is no haggle engine, resale formula or dynamic economy.

## 1. Existing economy / transaction audit

This builds on the earlier [P3/P8 price audit](docs/evaluations/P3_NAME_KNOWLEDGE_FIX_P8_PRICE_AUDIT.md). Re-verified state before this change:

| Area | Finding (unchanged by P8 unless stated) |
|---|---|
| Purse | `FundsRecord.gold`, a whole-gold integer. Nicco starts with 500G ([opening-state.ts](src/campaign/opening-state.ts)). Exposed to the narrator as "Nicco's money". |
| Payment validation | `transfer_person` in [legal.ts](src/campaign/legal.ts) atomically moves gold, holder and papers, and rejects `insufficient funds` and replays. |
| Purchase resolver | [person-transactions.ts](src/turn/person-transactions.ts): a seller's latest offer plus explicit player acceptance/payment yields a validated `transfer_person` proposal. Asking price, offer and paid price stay distinct stages. |
| Unnamed captives | [narrated-captives.ts](src/turn/narrated-captives.ts): ephemeral captives and their sellers are read from delivered narration. |
| Price redaction | [grounding-audit.ts](src/turn/grounding-audit.ts) flags any number+currency not present in state, retrieval or player input (`invented_price` → one revision → redaction). Gold is exempt during a recognized person-trade negotiation. |
| Static narrator rule | "Prices: never state an exact price or number of coins unless canon, state or the player's own words supply it." The earlier audit identified this as the main reason for vague prices. |
| Authored prices | None. Canon describes price levels only qualitatively. |
| Auctions | No lot, bid or reserve state anywhere. The market location authors daytime auctions only as prose. Auction/lot continuity is tracked separately as **P9** and stays open. |

## 2. Currency model

- **Gold and Silver only. 10 Silver = 1 Gold.** No copper and no decimals. The loader rejects any other conversion rate.
- Internally, anchors are stored in **Silver** (`3G 4S` = 34S). `formatSilver` renders `15 → 1G 5S`, `20 → 2G`, `9 → 9S`, and throws on fractional or negative values.
- The design heuristic (1S ≈ 4 EUR, 1G ≈ 40 EUR) appears only as a YAML comment. It is never in a prompt and never diegetic.
- **The persisted purse remains whole gold.** Moving funds to silver would change transaction authority and the save schema, which is out of P8 V1 scope (§16).

## 3. Economic baseline YAML

[config/economy.yaml](config/economy.yaml) sits **outside** the hashed `data/` world dataset. `loadWorld` validates every file under `data/` as a canon entity, and the dataset hash gates strict save compatibility, so keeping the table outside leaves every existing save loadable. `parseEconomy` validates it strictly:
- whole numbers only;
- silver below one gold;
- known categories only;
- the 10:1 rate;
- a valid index range;
- no duplicate setters.

| Anchor | Value | Category |
|---|---|---|
| common bread (1 kg) | 1S | food |
| mug of beer | 1S | food |
| simple hot meal | 3S | food |
| good monthly food budget | 8G 5S | food |
| large dinner with spiced wine | 1G 5S | food |
| simple inn room per night | 5S | lodging |
| good dagger or simple weapon | 2G | equipment |
| tempered steel greatsword | 12G | equipment |
| full knightly plate | 200G | equipment |
| mercenary / armed guard per day | 4G | services |
| average slave | 640G | slaves |
| good / valuable slave | 1000G | slaves |

## 4. Income references

| Class | Monthly |
|---|---|
| Poor / precarious (~2S/day) | 6G |
| Farmhand / unskilled | 8–10G |
| Skilled artisan | 12–14G |
| Lower bourgeoisie | 18–20G |
| Middle bourgeoisie | 38–40G |
| Upper bourgeoisie | 60G+ |

Great merchants, financiers and high nobility are intentionally absent. Incomes reach the narrator only when the turn is about wages or earnings.

## 5. Slave baseline rationale

There are only two anchors: **average ~640G** and **good/valuable ~1000G**. The block adds one sentence of guidance:
- an ordinary person sits near the average anchor;
- a noticeably skilled one sits near the good anchor;
- an exceptional specialist may exceed it;
- an injured, sick, old or untrained person may fall below it, using only what the scene supplies.

There are no ladders and no multipliers for sex, beauty, species, age, health, profession, obedience, combat, skill or rarity.

> **Design consequence to note.** Nicco's opening purse is 500G, so an *ordinary* slave at anchor scale is now beyond it, and the existing purse authority will block such a sale. That follows directly from the agreed numbers. Cheap outliers remain possible when the scene supplies a reason, as in the historical sick-captive purchase.

## 6. Personal Price Index design

- **Scope.** One whole-percent tendency per canonical price-setter, in **−30..+30**. It is a soft directional nudge: rough anchor = P × (1 + index). Large anchors are rounded to whole Gold; anything under 10G is rounded to whole Silver.
  - Example: 640G at +20% gives **768G**. A 3S meal at +22% gives **4S**.
- **Price-setters.** These are listed explicitly in the YAML, after an audit of all 48 canonical character entities by occupation:
  - slavers: Korvin, Mistress Elara, Bartolomhew;
  - commercial intermediaries: Blackthorn, Dren;
  - shopkeepers, innkeepers and craft sellers: Bram Kessel, Hadrik Voss, Jessa Rook, Marta Pell, Livia Marr, Mira Thorne, Niles Vanner, Orla Fen, Arwen Woodsigner;
  - the transport contractor Rufus Tern.
  - Officials, nobles, clergy and guild *representatives* do not get one.
- **Randomness.** No campaign RNG existed (mannerisms use hashing). The smallest deterministic implementation is `sha256("caldrevan-p8-price-index:<campaign_id>:<character_id>")` mapped onto the range. It is reproducible, campaign-specific, and needs no `Math.random`.

## 7. Initialization / persistence

- **Storage.** New optional snapshot domain `price_indices`, an additive extension like `mannerism_learning`, so there's no schema bump and pre-P8 saves still validate. It's written by a new `set_price_index` command inside the **opening proposal**: one per setter present in canon.
- **No reroll.** A second `set_price_index` for the same character is rejected (`price index already established`).
- **The controller cannot touch it.** Its wire schema cannot express the command (a proposal fails closed as `structured_output_invalid`), and the authorizer rejects unlisted kinds by default.
- **Save/load.** The record round-trips exactly through `serializeSave`/`decodeSave`, twice. A different campaign ID yields different indices.
- **Pre-P8 saves** have no records. Their context derives the same deterministic value from the campaign ID, so it is stable on every load, and nothing is rewritten on load.

## 8. Selective economic-context injection

[economic-context.ts](src/turn/economic-context.ts) holds **one decision**, used by both the prompt builder and the audit stage.

**Commercial trigger.** A turn is economic if any of these holds:
- the player input matches a commerce cue: buy/sell, price/cost/"how much", pay/overpay/afford, worth/value/appraise, haggle/bargain, hire/wage/fee/rent, bribe/debt, auction/bid, "what do you want for…", "for sale", "too much", or an amount such as "20 gold";
- one of the last two finalized exchanges matched a cue (so "Too much." keeps its anchors);
- an enslaved person held by a present seller makes an active trade.

**Mentions alone never inject.** These all stay non-economic: "Are you hungry?", eating stew, "gold light", "Thanks a lot", "*charges at the bandit*".

**Categories.** Only the matched categories are included: food, lodging, equipment, services, slaves. If none match, location decides: slaves at the market, food and lodging at inns, otherwise a small default.

**The block** sits after the legal/household state, inside the masked prompt. It contains:
- the currency line and the relevant anchors;
- a seller tendency for **foreground** sellers only, with their adjusted anchors (P6 background sellers stay baseline);
- slave-quality guidance;
- an auction line;
- a "Nicco is selling" buyer framing;
- the freedom wording (§11).

**Measured size:** ~215–315 tokens on economic turns, **zero** on every other turn. The static system prompt is unchanged.

## 9. Buy/sell integration

| Turn | Narrator receives |
|---|---|
| "I'd like to buy a hot meal" (inn) | food anchors (meal ~3S, beer ~1S…), no slaves or weapons |
| "How much for a room for the night?" | lodging ~5S |
| "How much for a tempered steel greatsword?" (Blackiron) | equipment: greatsword ~12G, dagger ~2G, plate ~200G |
| "I want to sell this dagger. What would you pay?" | dagger ~2G plus "Nicco is selling: the other party is the buyer and may offer below or around ordinary value", with no resale percentage |
| Korvin, name known: "how much for a slave who can cook?" | 640G / 1000G anchors plus Korvin's adjusted anchors |

Identity masking applies. An unknown seller who is the conversation partner appears by observable descriptor ("the unfamiliar woman…"), never by canonical name.

## 10. Slave auction integration

Any auction or bidding cue injects the slave anchors plus: *let opening bids, bidding and the closing price move naturally around these anchors for the lot's apparent quality; no arbitrary extremes (an ordinary slave never goes for a few gold or many thousands) without a reason the scene supplies.*

No auction-house index is authored; the canonical sellers do not run the public auction. There is no bidder AI, reserve, bid steps, demand or scheduling. Lot and bid continuity remain **P9**.

**Plausibility validation.** I chose not to add a numeric price-range validator. A naive "within N× of an anchor" check would wrongly flag legitimate small amounts in the same scene (a tip or a deposit), and every flag costs a revision call. Prompt grounding is the V1 mechanism, and live calls confirmed it (§15).

## 11. Narrator freedom / prompt wording

The final block line:

> These anchors keep prices economically plausible. They are approximate, not fixed: seller judgment, quality, condition, urgency and negotiation may move a concrete ask or offer around them, and a character may state a concrete Gold/Silver price this turn. Do not mechanically quote an anchor, never mention anchors, indexes or tendencies, keep a price already quoted in this negotiation as its starting point, and do not invent taxes, tariffs, guild rules or market systems.

The explicit permission to state a concrete price this turn deliberately overrides the static qualitative-price rule, and only on economic turns. That keeps the static prompt (and the Character Performance pilot's goldens and budget calibration) untouched.

**Audit alignment.** On economic turns, `groundingIssues` admits any Gold/Silver amount. Copper, crowns, marks and every other denomination are still `invented_price`, with the correction: *"Caldrevan uses only Gold and Silver… restate in whole Gold and Silver near the supplied anchors."* Non-economic turns keep the original protection exactly.

## 12. Continuity behavior

No quote state was added. A quoted ask such as "Seven hundred and eighty gold." persists through existing `RecentConversation` (NPC dialogue) and P12.1 scene narration. The follow-up "Too much." stays an economic turn through the two-exchange window, so the anchors and the "keep a price already quoted as its starting point" instruction come with it. A regression test pins this.

The test also surfaced a real gap. "What do you want for her?" initially matched no cue, so the 780G ask was redacted as an invented price. The cue list was extended; that sentence is now a regression case.

## 13. Existing transaction authority

**Unchanged:** the purse, `transfer_person`, payment validation, offer/acceptance resolution, legal transitions, receipts, the uncommitted-purchase audit and the controller schema. A test re-proves that a 780G sale against 500G fails with `insufficient funds` and a 450G sale leaves 50G.

**Historical TODO.** *"KNOWN over-redaction: a seller's price for an unnamed narrated captive is flagged as an invented price"* now **passes** (node still reports it under TODO, so the count stays 4). "How much for the girl?" is an economic turn, so the anchors legitimately ground an asking price. This is the exact path P8 must change for narrator price freedom. The historical test file and its TODO marker were **not edited**; promoting it to an ordinary test is left to the owner.

Note that its fixture price ("Three gold for the girl") is implausible against the anchors yet still delivered, because no plausibility validator exists (§10).

## 14. Tests

[tests/p8-economic-baseline.test.ts](tests/p8-economic-baseline.test.ts) has 18 deterministic tests covering the brief's items 1–17:

| Test | Brief item(s) |
|---|---|
| Currency | 1 |
| YAML load/validation and decimal rejection | 2 |
| Index generation, range, save/reload and different campaigns | 3 |
| Pre-P8 save stability | 3 |
| Controller cannot set or reroll an index | 3 |
| Non-economic turns, and cue coverage | 4 |
| Food and lodging | 5–6 |
| Greatsword ~12G | 7 |
| Average ~640G / good ~1000G | 8–9 |
| Korvin's adjusted anchor and the no-exposure instruction | 10–11 |
| Masking of unknown sellers | 11 |
| Foreground-only sellers | — |
| Auction | 12 |
| Audit (Gold/Silver admitted, copper flagged, non-economic flagged) | 13 |
| Negotiation continuity | 14 |
| Selling | 15 |
| Purse | 16 |

Item 17 (no regression) is covered by the full suites below.

**Results:**
- Typecheck: pass.
- `npm test`: **2,353 tests, 2,349 pass, 0 fail, 4 TODO** (previously 2,335).
- Playthrough: 25/25.
- Focused set (P8, household, legal, person transactions, grounding/narration audit, P3/P6/P11/P12, golden, RPG format, identity, NarrativeContext, persistence): 479 tests, 475 pass, 0 fail, 4 TODO.
- Golden pipeline traces were unchanged.

## 15. Live calls / cost

- **Declared before calling.** The unknown was whether GLM prices plausibly around the anchors and keeps the mechanics out of the prose. Deterministic tests prove the anchors arrive, not how they are used. The decision at stake was whether the block wording needed strengthening.
- **Run:** 3 scenes × 2 samples via [scripts/p8-economy-live.mjs](scripts/p8-economy-live.mjs).
- **Route:** `z-ai/glm-5.2` via `z-ai/fp8`, fallbacks off, reasoning off, 512 output tokens.
- **Result: 6 calls, all Z.AI, $0.035659.** Evidence: [requests.json](docs/evaluations/p8-economy/requests.json), [live-ledger.json](docs/evaluations/p8-economy/live-ledger.json).

| Scene | Anchor supplied | Narrated |
|---|---|---|
| Korvin (index −27%), ordinary cook | ~467G | "Four hundred sixty gold, give or take" (both samples) |
| Auction, healthy young laborer | 640G / 1000G | Opens at 600, climbs 620→670; "Six-twelve, six-thirty, six-forty" |
| Inn, hot meal and room | meal ~3S, room ~4S (−12%) | "Meal's three silver. Room for the night, four." Bundles at 7S and 5S |

- **Plausibility and secrecy:** no mechanics leaked (no "index", "anchor", "tendency" or %), and every amount was in Gold/Silver.
- **Two block flaws found and fixed** afterwards, with deterministic regressions:
  1. Tendency lines were listed for P6 *background* sellers too (Elara and Blackthorn as long observable labels in the Korvin scene).
  2. "Labor" in slave talk pulled in the mercenary/day anchor.
- **No re-run.** Both fixes only remove lines, and plausibility was already established.

## 16. Remaining limitations

- **Gold-only purse.** Silver-scale purchases (meals, rooms, beer) are priced in narration but are not committed money changes; no such commit path existed before P8 either. Sub-gold payments are not tracked.
- **Seller tendencies need a foreground seller.** An unknown canonical seller addressed only by role or description ("the innkeeper", "the short man") is not foregrounded by existing P6 focus, so they get baseline anchors. This is the same descriptor-binding gap recorded in the Character Performance pilot.
- **Promoted sellers.** Narrator-created sellers later promoted to campaign characters receive no index in V1 and use the baseline directly. Initializing one would mean touching the promotion path.
- **Cue-based relevance.** Relevance is lexical. Unusual phrasings can miss, in which case the old qualitative-price protection applies and nothing breaks. Rare false positives cost ~250 tokens and relax Gold/Silver flagging for that turn only.
- **No plausibility validator.** An absurd narrated price would not be caught deterministically.
- **Small live sample.** One market, one auction and one inn, 2 samples each.

## 17. Explicit future expansions NOT implemented

Not built:
- dynamic economy, inflation, regional prices, scarcity, stock, demand curves;
- profession, beauty, species or age multipliers;
- relationship or fame discounts;
- fixed bargaining ranges or bargain floors;
- resale percentage, merchant margins, depreciation, condition multipliers;
- taxes and tariffs;
- auction bidder simulation, reserves, bid steps, auction scheduling or lot state (P9);
- merchant profit optimization;
- a persistent quote state;
- a silver-denominated purse.
