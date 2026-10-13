# Actual Offer V1 (player-authorized trade)

Status: **NORMATIVE**. Implemented and covered by tests (`tests/commerce/actual-offer.test.ts`, `tests/ui/actual-offer-card.test.ts`, `tests/commerce/person-offer-playthrough.regression.test.ts` (spoken price forms, stable subject, Slave NPC on Accept, rename), offline browser check `scripts/browser/actual-offer-browser-check.mjs`). Source of truth: `src/campaign/trade.ts`, `src/turn/commerce/trade-authorization.ts`, `src/turn/commerce/person-offers.ts`, `src/turn/commerce/trade-notes.ts`, `src/app/trade-offer-view.ts`, `GameSession.acceptTradeOffer`, `POST /api/trade/accept`. Implementation report (evaluation material, not normative): [ACTUAL_OFFER_V1](../evaluations/ACTUAL_OFFER_V1.md).

## 1. What it is
An **Actual Offer** is a `TradeOffer`: a structured, authoritative *pending proposal* to buy or sell goods or a person for whole-number gold. Creating one changes **no** campaign state (no gold, item or legal change). It becomes a **transaction** only when the player explicitly accepts it. Acceptance is the boundary between the two.

## 2. Lifecycle
fiction establishes a concrete offer → the Controller proposes a structured `TradeOffer` (goods) or the engine reads one from the delivered narration (person) → engine validates and stores the active offer → the UI shows the card → the player may keep negotiating in chat → a later concrete offer **supersedes** the old one → the player clicks Accept → the engine settles atomically.

Statuses: `active`, `accepted`, `superseded`, `withdrawn`, and `invalidated` (the engine closed it: item gone, person unavailable, counterparty gone, scene changed). Only `active` can settle. At most **one** offer is active at a time. Fiction can withdraw an offer (Controller `withdraw`).

## 3. Who does what
| Actor | Responsibility |
| --- | --- |
| Narrator | Describes the negotiation; may make, change or withdraw commercial terms in free prose. Prose alone never settles: it is told by an authoritative note (`trade-notes.ts`) when an offer is pending or completed and must not narrate payment or handover before acceptance. |
| Controller | Recognizes a concrete goods offer and proposes create/update/withdraw (direction, subject, counterparty, price), checked by evidence authorization. It never accepts or settles. |
| Engine | Validates the current offer and `expected_revision`, settles deterministically, records the transaction, commits atomically. |
| UI | Shows exactly what the engine understood; BUY/SELL distinct; one Accept button; never owns price or subject truth. |
| Player | Verifies the interpreted offer, negotiates in chat, accepts explicitly. |

Person offers are the one place the Controller does not propose: they are read deterministically from the delivered narration (`person-offers.ts`), reusing the narrated-captive and seller-authority rules. Since consolidation blocks 10 and 11 the reading is NarrationFacts ([NarrationFacts](NARRATION_FACTS.md)): the price is a `price_quote` commerce fact, **the speaker of the price line is the shared dialogue attribution** (explicit tag including the post-hoc delivery tag `*He says it flat.*`, direct name, adjacent action beat, continued speaker; never the weak recent-subject fallback; a plural beat or two candidates is ambiguous and yields no offer), and **a price explicitly addressed to somebody other than Nicco** (`*Korvin says to Brenna:*`, a vocative `Brenna, a hundred…` in the price's own sentence) or to an ambiguous "her" is not an offer to the player (`commerce-evidence.ts`, recipient facts). Commerce keeps no speaker grammar of its own. This closed KPG-2.

## 4. Human verification layer
The card is also a verification surface: the player sees direction, subject, price and a safe counterparty label **before** settlement. If the interpretation is wrong, the player does not accept. A semantic misreading therefore cannot become permanent state on its own.

## 5. Counteroffers
There is no counteroffer UI. The player negotiates in chat, the Narrator answers, the Controller may structure a new concrete offer, and the engine supersedes the old one (the old ref is no longer acceptable).

## 6. Goods (V1)
- **BUY:** subtract player gold; create the purchased `CampaignItem`(s) (bundles supported; one item per unit, conservative category with `miscellaneous` fallback); owner = player; position = `carried(player)`; never auto-equipped; record the transaction; close the offer.
- **SELL:** the referenced item must already exist authoritatively, be held by the player AND be owned by the player (`owner_id === player`; unknown, null or foreign owner → `item_not_owned`, checked at proposal, in Controller authorization and again at Accept). Acceptance is ONE revision that **transfers the same item** (identity preserved, never deleted): to a persistent counterparty character (`position: carried(buyer)`, `owner_id = buyer`, `acquisition: purchase from the player`), or, for an anonymous counterparty, to the generic **external custody** (`position: unknown`, `owner_id: null`; no character, merchant inventory or wallet is invented). Gold is credited once and the offer becomes `accepted` in the same revision; `settlement` records `removed_item_ids` (= left the player's custody), `removed_item_names` and `custody` (`character` | `external`). Any failed precondition (owner, holder, existence, counterparty, revision) mutates nothing.
- No merchant inventory, wallet, stock, restock, catalog, shop UI or supply/demand. Any valid counterparty may trade; no `NPC_vendor` type exists. These may be layered on top later.

## 7. People (V1)
People and goods share the same offer envelope (lifecycle, confirmation, price, direction, counterparty presentation). Settlement stays **domain-specific**: a person offer stores a plan (`register_character` when the person was narrated into being, `set_legal_status`, `transfer_person`) and acceptance runs the existing person-transaction / legal-transfer system. People are not items and are never routed through goods settlement. Only buying a person is supported (no person SELL).

**Person offers, spoken forms and stable subject (end-to-end fix).** The seller's price is read from prose, including "Three hundred for her.", "I'll go two-sixty.", "Nine-fifty's the number."; a repeated buyer figure is not an offer. A new offer for the same narrated person reuses the planned character id of the earlier unsettled offer, so supersession never forks the subject. A verbal "done deal" or narrated payment never settles; only `POST /api/trade/accept` does. Accept always leaves a persistent Campaign NPC (reused, canonical, or created from the authoritative subject) shown as "Slave" while the name is unknown; a later self-introduction renames the same entity. A Controller goods offer whose line is a person is rejected. See `docs/evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md`.

## 8. Identity masking
The trade UI uses **player-visible identity only**. For an unknown enslaved or captive person the card shows `Slave`, `<player-known descriptor> Slave` (descriptor from a closed lexicon of visible traits), or another safe current presentation label. It never carries a hidden real or canonical name, an internal id, a hidden descriptor, avatar metadata or lore. The counterparty is masked by the same rule. The offer `ref` is an opaque hash, never the internal id.

Example. Internal identity: Brenna. The player does not know the name → the card reads *Red-haired Slave, 5 gold*. After a legitimate name reveal → *Brenna, 5 gold*. Same person id, same offer ref: no duplicate, no alias, and objective identity never changed.

## 9. UI and request boundary
Compact inline card after the newest Narrator response: explicit `ACTUAL OFFER` label, `▼ BUY` or `▲ SELL` (text and icon, never colour alone), a `♟ Person` marker for people, price, safe subject lines, Accept; no Counteroffer button. Accepting sends **only** `{ref, expected_revision}`; the client never resends price, subject, buyer, seller or item identity: the server loads them from the authoritative offer. Stale, superseded, lapsed or unaffordable requests are refused with a safe inline message and the refreshed state. See [UI](../UI.md) and [UI engine contract](../UI_ENGINE_CONTRACT.md).

## 10. Atomicity, idempotency, revisions
- GOODS BUY: funds + items + transaction + offer status commit all-or-nothing. GOODS SELL: funds + item transfer + settlement record + offer status. PERSON: funds + person transfer/legal state + transaction + offer status.
- A failed acceptance mutates nothing and creates no revision.
- One offer settles **at most once**: retries, double clicks and duplicate requests cannot double-debit, double-credit, duplicate an item, a transfer or a transaction.
- `expected_revision` guards staleness. Item sprite jobs commit metadata revisions after item creation, so a click can occasionally be stale once; the response carries the refreshed state and the player retries.

## 11. Persistence
`TradeOffer` records live in the optional additive snapshot field `trade_offers`. Snapshot schema stays **6** and save schema **5**; no migration (absent field = no offers). An active offer survives save/load if still valid; closed and accepted offers stay closed and cannot be re-accepted after reload. See [Persistence](PERSISTENCE.md).

## 12. Currency and limits
Whole-number **gold only**. Not supported and never silently rounded or converted: silver, decimal gold, exchange rates, multi-currency. Questions, hypotheticals and fractions create no offer.

## 13. Auction House is not Actual Offer
Actual Offer V1 is a 1:1 negotiated offer. An Auction House needs a different future model (lot → bid → competing bidders → current bid → close condition → winner → settlement). Bids never create offers, and auction scenes intentionally have no authoritative trade mechanics.

## 14. Retired logic
Semantic "the player paid, therefore the transaction is complete" detection and the player's stated amount setting the price are removed. Kept: identity establishment, seller binding, legal transfer, `transfer_person` settlement and the `asserts_uncommitted_purchase` audit (narrated payment with no committed settlement). `transaction-acts` ACCEPT is continuity-only.

## Delivered-text recheck (TRD-2)

Controller goods/item offers are first authorized on the Narrator draft. After audit, reconciliation and redaction, `prepareCommit` re-runs the same validator (`authorizeTradeProposals`) with the same Controller quote against the DELIVERED narration. A card whose quote is no longer verbatim in the delivered text (price removed, price or subject changed) is dropped and the batch re-prepared; only the offer is lost, never the turn. A `TransactionDiagnostic` (`kind: "offer"`, `status: "blocked"`, `reason: "quote_not_in_delivered_text"`) records it. Withdrawals are not re-verified against the delivered text (residual). Tests: `tests/commerce/trade-offer-authorization.test.ts`.

## Shared price grammar (TRD-3 / TRD-4)
One reader, `src/turn/commerce/trade-price.ts`, serves goods authorization and person offers (the person reader keeps its own *detection* heuristics for which sentence concerns which person, but every amount comes from this grammar). A number is a price only when it is **attached to gold** (`300 gold`, `300g`, `three hundred gold pieces`, `15 gp`) or **scoped by a concrete-offer form** that needs a resolved offer context (`fifteen gold for the halberd`, `for 260`, `three hundred for her`, `I\'ll go two-sixty`, `I\'ll take 260`, `two hundred and sixty`, `the halberd is fifteen` only when the subject is named, a bare numeric sentence only when no neighbour makes it an age/duration/rejected figure). Ages (`twenty-two years old`), durations (`ten minutes`), quantities (`three swords`) and dates are never prices. Each reading carries `{amount, currency: gold, span, form}` as evidence. Currency is a **unit on a number or a coin noun** (`ten silver`, `5 copper pieces`, `three marks`, `a silver coin`), never a material or adjective (`silver locket for ten gold`, `silver-haired woman, twenty gold` are gold offers). Real non-gold money and fractions (`two and a half gold`, `2.5 gold`) are reported `unsupported` and create no offer; nothing is ever converted (ECO-1 stays a future product decision). Auction wording (bid, lot, high bid, increments, hammer) is rejected by the same module for both paths. Known limit: a bare numeric sentence inside a concrete person-price exchange with no age/duration cue in its neighbours is still read as a price.

## Offer identity (TRD-5)
`tradeTermsDigest` compares **terms**: direction, price, counterparty identity and subject identity (goods: normalized line names; items: item ids; person: stable subject key). Descriptions, visual descriptions, casing and articles are cosmetic: re-proposing the same terms keeps the same offer and ref and changes nothing. A different price or subject supersedes.

## Pending-offer narration guard (TRD-10)
While ANY offer is active (goods, items or person) and nothing settled this turn, narration outside dialogue must not show gold being paid or handed over, the goods being handed over, or the deal being done (`asserts_uncommitted_purchase`: reconcile, then redact). Settlement is only ever the explicit Accept action.

## Ledger (TRD-11, deferred)
Goods settlement is recorded on the offer's own `settlement`; no separate `transactions` row exists because `PersonTransaction` is person-typed (subject, legal documentation, counts in the summary). A goods ledger needs a generic economy-ledger type and a snapshot schema change, which is a design decision (ECO-1), not a local addition.

## Own-item purchase reframing, put-down veto and price support (live-certification fixes)
- If the player's words say he is selling and every line of a Controller goods BUY maps to exactly one distinct held-and-owned item, `reframeOwnItemPurchase` turns it into the SELL of those items before validation (the Controller sometimes mis-encodes "a party pays Nicco for his sword" as a buy). Without the sell cue nothing is reframed: buying a second copy of something one holds is legitimate, and the card is shown before any gold moves (residual: a mis-encoded BUY without a sell cue is a card the player can decline).
- `place_item` and `transfer_item` of an item that belongs to a pending SELL offer are vetoed (`trade_settles_through_offer`).
- The price of an active offer counts as authoritative support in the grounding audit (it is no `invented_price`).
- The pending-offer narration guard also catches completion wording that names no hand-over verb (coins landing or vanishing into a pouch, fingers closing on coins, a coin dropped in the player's palm, "the transaction is closed").
