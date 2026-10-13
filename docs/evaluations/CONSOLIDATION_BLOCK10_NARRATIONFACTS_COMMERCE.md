# Consolidation Block 10 - NarrationFacts, commerce slice

Status: implemented, NOT committed. Baseline `9d15212` (main, Block 9 pushed). Facts are descriptive; policy stays engine-owned; explicit UI Accept remains the only settlement authority.

## 1. Baseline

`9d15212`, clean tree, typecheck and build clean, `npm test` 3578 (known flaky `generation lifecycle` only), `npm run benchmark:modern` 28 scenarios (27 PASS + KPG-1).

Final: typecheck and build clean, `npm test` **3599/3599** (baseline 3578; +21 = commerce fact/source tests and benchmark scenarios C1-C8), `npm run benchmark:modern` 36 scenarios, 34 PASS, 2 KNOWN PRODUCT GAPS (I4, C8), 0 FAIL.

## 2. Reader inventory (TEXT READER -> OUTPUT -> CONSUMER -> POLICY DECISION)

| Reader (before) | Output | Consumer | Policy decision | Now |
| --- | --- | --- | --- | --- |
| `person-offers.ts` `pricesOf` / `amountsIn` / `NOT_AN_OFFER` | amounts per sentence | person Actual Offer construction | seller binding, subject, last price wins | commerce facts via `commerce-evidence.ts` (`sellerQuotes`, `actionableQuote`) |
| `trade-authorization.ts` `statedGold`, `HYPOTHETICAL`, `WITHDRAWAL`, `unsupportedCurrency`, `fractionalPrice` | amounts, hypothetical / withdrawn / currency verdicts of the Controller's verbatim quote | goods offer and withdrawal authorization | quote must state the proposed price, not hypothetical | facts of the quote (`source.quote`) + facts of the draft |
| `narration-audit.ts` `householdIssues` (`PAY`, `GOODS`, `DONE`, `PAID`) | payment / hand-over / closed-deal sentences | `asserts_uncommitted_purchase` while an offer stands or a negotiation runs | withdraw the claim, never settle | `settlementClaims(facts, ...)` |
| `trade-price.ts` `readPrices` | one sentence -> numbers | all of the above | none | stays as the ONE low-level numeric helper, called only by the commerce extractor |
| `grounding-audit.ts` `invented_price` | non-gold currency grounding | prompt grounding | outside the commerce slice | unchanged (documented, section 16) |
| `narration-audit.ts` item `assertedBy` / `turn-evidence.ts` / `evidence-authorization.ts` item transfer wording | item hand-over claims | item transfer audit | outside this slice (items, not offers) | unchanged (section 16) |

## 3. Fact schema (`src/turn/narration-facts/types.ts`)

`PriceQuoteFact` (form, amount, currency gold, `quote_role` seller_ask | seller_counter | player_counter | ambiguous_quote, `quote_kind` current | past_cost | group_or_each, voice narration | speech | player_input), `UnsupportedMoneyFact` (currency | fraction), `OfferWithdrawnFact`, `PaymentClaimFact` (pay_verb | coin_motion | hands_changed; narration voice only), `TransferClaimFact` (goods_handover | belongs_to_player | yours | document), `SettlementClaimFact` (deal_done). Every fact carries span, sentence, modality, polarity, confidence, ambiguity, provenance (`extractor: "commerce"`), referents and `source_text` (the unit used to bind a fact to a consumer's text). No fact has an authorized / accepted / should_* field.

## 4. Price extraction rules

Seller ask 100; player counter 90 (a typed figure is always `player_counter`; in narration the speaker resolving to the player is too); seller counter 95 ("I'll go", "make it", "final", ...); "If you had 150, maybe" and "Would a hundred suit you?" are conditional/questioned (not completed); "I wouldn't take 80" is negated; "not a coin less" is an emphatic floor, not a negation; "He paid 95 gold" is a payment_claim and emits no quote; "paid four for her" is a `past_cost` quote; "She's twenty, worked five years, asking 100" yields 100 only (ages and tenures are not prices); several different prices in one statement group are ambiguous (`several_prices`, no offer).

## 5. Seller / subject binding

Unchanged policy and fail-closed: the commerce facts own the price semantics; the scene reader (`narrated-captives.ts`, Block 11) still attributes speech to a seller and a person. `seller_authority_unestablished` is kept. Same provisional identity across repricing is pinned by C2, C3, C7.

## 6. Shadow parity findings

The legacy readers ran beside the facts over the whole suite (3578 tests, `COMMERCE_SHADOW=1`). Result: 10 differences, all one class - hypothetical goods quotes ("Would fifteen gold for the halberd suit you?", "If you wanted it, fifteen gold for the halberd.") were accepted by the legacy price reader and are now rejected (deliberate improvement; pinned by F2). Mismatches fixed during the migration: paragraph-level voice misread mixed starred/plain text (replaced by per-run asterisk masking); "not a coin less" negated a firm ask; conditional ownership ("you walk her out that gate, she's yours") flagged as a claim; past cost in the unit ("paid four for her") was not visible as a non-current quote; "pays Nicco ninety-five gold" (hyphenated amount) was not a payment verb. Final shadow: zero unexplained differences. The shadow module was deleted.

## 7. Supersession policy

The trade state machine (`src/campaign/trade.ts`, unchanged) still keeps ONE global active offer and supersedes it when a new one is proposed. The facts decide which quote is proposed: only a seller-voiced, current, completed quote; the latest group wins; a player counter is negotiation evidence only. 100/90/95 -> only 95 active (C2); 400/250/275 -> only 275 (C3); live C went 400 -> 350 -> 275 with only 275 active.

## 8. Actual Offer migration

`resolvePersonOffers` receives the turn's fact source (`prepareCommit` gets it from the coordinator). Creation never settles, pays, persists or materializes. Player "deal" / "I pay 95" / "done" is never seller acceptance (C4, live D). Goods authorization reads the same facts (`authorizeTradeProposals(..., facts)`), and rejects a quote the narration attributes to the player (`player_counter_not_offer`), hypothetical or questioned quotes, unsupported currency and fractions.

## 9. Settlement audit migration

`householdIssues` no longer owns a payment / hand-over / done parser. While an offer stands, `settlementClaims(facts, {standing: true, words})` flags payment, goods/person hand-over, "she's yours", bill of sale and finished-deal claims as `asserts_uncommitted_purchase`; in a negotiation without a standing offer, payment and finished-deal claims. Existing revision / redaction applies; no new confirmation mechanism. C4: no gold change, no legal transfer, no materialization, issue flagged, "She's yours" not delivered. (On the pre-migration baseline the same text was delivered unchanged: the C4 expectation fails there.)

## 10. Person-trade identity continuity

C7: quote -> counter -> 95 -> explicit Accept (95 debited, gold 405) -> the later "My name is Maren" binds the SAME persistent character (one created character, one transaction, one offer subject). P1/P2 and the Block 5B tests are unchanged and green.

## 11. Deleted legacy grammar

`statedGold`, `pricesInText`, `goldAmounts`, `fractionalPrice`, `unsupportedCurrency` (trade-price exports), `pricesOf`, `amountsIn`, `NOT_AN_OFFER`, `HYPOTHETICAL`, `WITHDRAWAL` (trade-authorization), `PAY` / `GOODS` / `DONE` / `PAID` (audit), the temporary shadow. Source-level tests (`tests/narration-facts-commerce.test.ts`): no banned name remains anywhere in `src`; `readPrices` is called only by the commerce extractor; authorization, Actual Offer and audit all consume the shared facts; narration-facts imports no campaign / authorization / audit code. Authored data kept: DOCUMENTED / UNDOCUMENTED paper vocabulary and AUCTION in `person-offers.ts`.

## 12. Ambiguity / fail-closed cases (tests)

Two people with different prices in one statement (C6, unit); age/quantity beside a price; conditional; negation; question; player "I'll give you 90 gold" (never an offer); seller "95. Final." (counter); unsupported silver / fractions.

## 13. Benchmark additions

C1 direct seller person quote -> offer 100; C2 100/90/95; C3 400/250/275; C4 premature settlement narration; C5 player counter alone creates nothing; C6 ambiguous subject + price; C7 identity continuity through Accept and name; C8 KPG-2 (known gap, replay of the real live narration). Block 8 / 9 scenarios unchanged. Benchmark: 36 scenarios, 34 PASS + 2 KNOWN PRODUCT GAPS (I4, C8), 0 FAIL. The scenario cap in `tests/modern-benchmark.test.ts` is now 17-40.

## 14. Live A / B / C / D (paid; one attempt each; Korvin's name seeded; evidence `docs/evaluations/consolidation_block10_live/`)

- A (seller says 100): PASS. Card person 100, one subject, no payment / creation.
- B (100 / 90 / 95): NOT REACHED. The model's first price arrived as an unattributed plain paragraph ("Hundred gold. She's plain labor...") after a starred Korvin beat; the price is read, but the seller is not bound (`seller_authority_unestablished`, fail closed). The later 95 did become an offer, but the intended 100 -> 90 -> 95 chain was not reached, so no verdict.
- C (400 / 250 / 275): PASS. 400 superseded by the model's own 350, then 275 active; one subject; the player's 250 never became an offer; audit flagged `asserts_uncommitted_purchase` and `uncommitted_condition` on the model's drafts.
- D (premature settlement): PASS, reached naturally. Player set the gold on the table and asked for a bill of sale; the audit raised `asserts_uncommitted_purchase`; gold 500, nothing created, no transaction, the 100 offer still active. The delivered text keeps a conditional "After that she's yours" (an authentic condition, not a claim).
- Cost: first run 30 wire calls, ~165k tokens (cost not reported by the trace). Two further Accept-run attempts (A, then B) were NOT REACHED (5 and 9 wire calls).

## 15. One end-to-end Accept

NOT achieved live: both labelled Accept-run attempts ended NOT REACHED for the same seller-binding reason (KPG-2). I stopped (no further rerolls). The end-to-end Accept through the real `GameSession.acceptTradeOffer` path is covered deterministically (C7, P1, P2, T1, T2, tests/person-offer-e2e) and was last certified live in Block 8.

## 16. Remaining debt

KPG-2: unattributed plain speech after a starred beat is not bound to the seller (Block 11, speaker attribution in `narrated-captives.ts`; replayed as C8). `grounding-audit.ts` `invented_price` and the item-transfer wording readers stay outside this slice. TRD-11 (generic goods ledger) still open. `goods_handover` facts are noisy by design (the generic hand-over verb); policy filters by the standing offer's goods words.

## 17. Block 11 handoff

Block 11 (identity / names) should move speaker attribution onto a shared fact so the commerce seller binding can read it (fixing KPG-2), keep `seller_authority_unestablished` as the fail-closed default, and keep the rule that a narrated name never creates a character (AUTH-2). The commerce facts already expose `source_text` so a speaker fact can bind to them without a second text parse.

## Invariants (tested)

A player counteroffer is not a seller offer. The latest concrete seller quote supersedes. Narration cannot settle. Explicit UI Accept remains the settlement authority. Actual Offer creation does not materialize a person. Person Accept materializes the SAME provisional identity. Commerce facts are descriptive only.
