# Actual Offer V1 (player-authorized trade)

Status: **NORMATIVE**. Implemented and covered by tests (`tests/actual-offer-v1.test.ts`, `tests/actual-offer-ui.test.ts`, `tests/person-offer-e2e.test.ts` (spoken price forms, stable subject, Slave NPC on Accept, rename), offline browser check `scripts/actual-offer-browser-check.mjs`). Source of truth: `src/campaign/trade.ts`, `src/turn/trade-authorization.ts`, `src/turn/person-offers.ts`, `src/turn/trade-notes.ts`, `src/app/trade-offer-view.ts`, `GameSession.acceptTradeOffer`, `POST /api/trade/accept`. Implementation report (evaluation material, not normative): [ACTUAL_OFFER_V1](../evaluations/ACTUAL_OFFER_V1.md).

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

Person offers are the one place the Controller does not propose: they are read deterministically from the delivered narration (`person-offers.ts`), reusing the narrated-captive and seller-authority rules.

## 4. Human verification layer
The card is also a verification surface: the player sees direction, subject, price and a safe counterparty label **before** settlement. If the interpretation is wrong, the player does not accept. A semantic misreading therefore cannot become permanent state on its own.

## 5. Counteroffers
There is no counteroffer UI. The player negotiates in chat, the Narrator answers, the Controller may structure a new concrete offer, and the engine supersedes the old one (the old ref is no longer acceptable).

## 6. Goods (V1)
- **BUY:** subtract player gold; create the purchased `CampaignItem`(s) (bundles supported; one item per unit, conservative category with `miscellaneous` fallback); owner = player; position = `carried(player)`; never auto-equipped; record the transaction; close the offer.
- **SELL:** the referenced item must already exist authoritatively, be held by the player AND be owned by the player (`owner_id === player`; unknown, null or foreign owner → `item_not_owned`, checked at proposal, in Controller authorization and again at Accept, so a change of owner between the two invalidates the offer with no partial mutation); add player gold; remove the item from tracked campaign state; record the transaction; close the offer. Removal means the item *leaves the tracked scope*, not that it ceases to exist in the fiction. The Narrator is told the item was sold.
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
- GOODS BUY: funds + items + transaction + offer status commit all-or-nothing. GOODS SELL: funds + item removal + transaction + offer status. PERSON: funds + person transfer/legal state + transaction + offer status.
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

Controller goods/item offers are first authorized on the Narrator draft. After audit, reconciliation and redaction, `prepareCommit` re-runs the same validator (`authorizeTradeProposals`) with the same Controller quote against the DELIVERED narration. A card whose quote is no longer verbatim in the delivered text (price removed, price or subject changed) is dropped and the batch re-prepared; only the offer is lost, never the turn. A `TransactionDiagnostic` (`kind: "offer"`, `status: "blocked"`, `reason: "quote_not_in_delivered_text"`) records it. Withdrawals are not re-verified against the delivered text (residual). Tests: `tests/consolidation-block1.test.ts`.
