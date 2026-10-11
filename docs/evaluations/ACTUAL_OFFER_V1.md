# Actual Offer V1: unified player trade offers for goods and people

Base: main 1cae42e. Uncommitted, unpushed. Zero live provider calls. Historical replay not run.

## 1. Verdict
ACTUAL_OFFER_V1_COMPLETE_WITH_DOCUMENTED_LIMITATIONS. Full suite 3242/3242, typecheck and build clean, offline browser check 21/21.

## 2. Product model
LLM interprets. Engine structures. UI exposes. Player confirms. Engine settles deterministically. A TradeOffer is a proposal, never a transaction.

## 3. TradeOffer schema
`TradeOfferRecord` (`src/campaign/types.ts`): id, direction (buy/sell), counterparty (character or anonymous label), price_gold (whole number), subject (`goods` lines, `items` ids, or `person` plan with subject id), status (active, accepted, superseded, withdrawn, invalidated), created/resolved revision, invalid_reason, and `settlement` `{gold, revision, world_minute, created_item_ids?, removed_item_ids?, removed_item_names?, transaction_id?}`.

## 4. Lifecycle
active → accepted | superseded | withdrawn | invalidated. Only `active` is acceptable.

## 5. Persistence
Optional additive snapshot field `trade_offers`; offers survive save/load (tested).

## 6. One-active-offer rule
At most one active offer. Creating a new one supersedes the previous.

## 7. Controller role
The Controller proposes create/update/withdraw for goods offers (`src/turn/trade-authorization.ts`, evidence-checked). It never settles. Deviation: person offers are read deterministically from delivered narration (`src/turn/person-offers.ts`), not proposed by the Controller.

## 8. Narrator role
The Narrator learns the state through authoritative notes (`src/turn/trade-notes.ts`): TRADE OFFER PENDING (nothing paid or transferred) and TRADE COMPLETED. It must not narrate payment as done while pending.

## 9. UI design
Compact inline card after the newest Narrator response, BUY ▼ / SELL ▲ by text and icon, ♟ Person marker, no shop, no modal, no Counteroffer button. Accept posts only `{ref, expected_revision}` to `POST /api/trade/accept`. Errors inline; notice on withdraw/lapse; receipt after settlement.

## 10. BUY
Atomic gold debit and creation of separate items (bundles supported): owner player, carried, conservative category with miscellaneous fallback, no auto-equip.

## 11. SELL
Only an existing authoritative CampaignItem. On acceptance the item is removed and gold credited.

## 12. Goods settlement
`accept_trade_offer` in `src/campaign/trade.ts`, one revision per accepted action, authorized only from `GameSession.acceptTradeOffer`.

## 13. Person settlement
Stored plan (`register_character` / `set_legal_status` / `transfer_person`) re-stamped at the committing revision and minute, then the existing person-transaction settlement. A funds precheck yields a safe `insufficient_funds`.

## 14. Counteroffers
Stay in chat. No button. A new concrete price from the seller becomes a new offer.

## 15. Supersession
A new concrete offer supersedes the old; the old ref is no longer acceptable (browser check E).

## 16. Withdrawal
Fiction may withdraw (Controller `withdraw`). Deterministic invalidation when the item is gone, the person invalid, the counterparty absent, or the scene changes.

## 17. Gold-only policy
Whole-number gold only. Silver, fractions, questions and hypotheticals create no offer.

## 18. Bundles
Multi-line goods offers settle into separate items per unit line.

## 19. Sold-item deletion policy
V1: a sold item leaves the tracked campaign scope (it is removed from `items`; this does not mean it ceases to exist in the fiction) (name kept in `removed_item_names` for the receipt and the Narrator note). No transfer to the buyer's inventory.

## 20. Identity masking
Absolute. The card never carries a hidden name, id, canonical id, avatar token or lore. Descriptors come from a closed lexicon (`visibleDescriptor`). Opaque `ref` = sha256 of campaign and offer id.

## 21. Unknown-slave presentation
"Slave" or "<descriptor> Slave" (browser check C: "Slave").

## 22. Name reveal
The SAME offer (same ref, no alias) re-renders with the name after a legitimate reveal (browser check D: Brenna).

## 23. Counterparty masking
The counterparty label follows the same knowledge-aware projection.

## 24. Atomicity
Debit, item creation/removal and status change commit in one `campaign.commit`; a failed precheck changes nothing.

## 25. Idempotency
Accepting a non-active offer is refused (`offer_accepted` etc.); no double charge.

## 26. Revision handling
`expected_revision` is checked. Item sprite jobs may commit metadata revisions after a settlement, so one stale click is possible; the response carries refreshed state and the player retries.

## 27. Save/load
Active, accepted and closed offers round-trip (tests in `actual-offer-v1.test.ts`).

## 28. Auction House exclusion
Auction bids never create offers (negative test). Unsupported in V1.

## 29. Vendor-system exclusion
No catalog, stock or shop. Offers come only from narrated fiction.

## 30. Old person-transaction cleanup
| Item | Class |
|---|---|
| Semantic acceptance/payment detection that settled a person sale | REMOVE (settlement by prose) |
| Player-stated price setting the price | REMOVE |
| Identity establishment, seller binding, legal transfer, `transfer_person` settlement | KEEP |
| `narrated-captives.ts` subject reading | KEEP (feeds person offers) |
| `transaction-acts.ts` ACCEPT | SIMPLIFY (continuity-only) |
| `asserts_uncommitted_purchase` audit | KEEP (reconciles narrated payment) |
| Phase/evaluation reports describing in-turn purchase | HISTORICAL ONLY |
| `historical-replay.ts` `payment_gap` expecting in-turn `transfer_person` | HISTORICAL ONLY (not run; needs adaptation before next replay) |

## 31. Tests added
`actual-offer-v1.test.ts` (G1–G20, SELL, lifecycle, N1–N8, auction/silver/question/hypothetical/fraction negatives, P1–P16, masking security regression, GameSession and HTTP route, ref opacity, schema optionality) and `actual-offer-ui.test.ts` (7 client tests). Legacy purchase-by-prose tests adapted to offer + explicit accept. Suite: 3205 → 3242.

## 32. Browser validation
`scripts/actual-offer-browser-check.mjs`, real TurnCoordinator with scripted narrator/controller, 21/21: A BUY Halberd 15g, B SELL Old Rusty Sword 5g, C unknown name → Slave, D reveal → Brenna, E 20g then 15g with old offer not acceptable, F extra. Zero live calls.

## 33. Schema impact
Optional additive `trade_offers`; snapshot schema 6, save schema 5 unchanged; no migration. Controller policy/schema hashes re-pinned.

## 34. Docs updated
CURRENT_STATE, ARCHITECTURE, UI, UI_ENGINE_CONTRACT, TESTING, ROADMAP, architecture/ITEM_DOMAIN, TRANSFER_DOMAIN_V1, TURN_COORDINATOR. Historical reports untouched.

## 35. Remaining limitations
- Person offers are read from narration, not Controller-proposed.
- One possible stale click after sprite metadata commits.
- Sold items are deleted; person SELL unsupported.
- Replay harness `payment_gap` needs adapting before the next historical replay.
- No Auction House, no vendor, no silver or fractions.

## 36. Recommended next step
Review and commit/push on request; then adapt the replay harness to offer + accept and run a small live validation.

## Documentation reconciliation
- Normative docs changed: README (index), CURRENT_STATE, ARCHITECTURE (§2b, authority table), ROADMAP, UI, UI_ENGINE_CONTRACT, TESTING, HEARTSTONE (NPC+ terminology note), architecture/PERSISTENCE, ITEM_DOMAIN, TRANSFER_DOMAIN_V1, TURN_COORDINATOR (person-purchase text marked superseded).
- New normative doc: `docs/architecture/ACTUAL_OFFER.md`.
- Principle documented: player-authorized state transitions (selective, not "everything gets a button"); Heartstone rite and trade accept as the two cases.
- Obsolete semantic-rite references: the Heartstone docs already described the explicit action; remaining normative hits for semantic person-purchase settlement were updated or marked superseded.
- Documented: lifecycle, pending offer vs transaction, identity masking with the Brenna example, AH exclusion, vendor exclusion, gold-only, idempotency, atomicity, benchmark policy and action-log format.
- Left intentionally: `ENGINE_CAPABILITIES_PRE_UI.md` (already HISTORICAL/SUPERSEDED), Phase-era docs and all evaluation reports; `premium_characters` naming is documented, not renamed.
