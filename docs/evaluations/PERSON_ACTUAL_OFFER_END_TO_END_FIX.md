# Person Actual Offer — end-to-end fix (trade card, explicit Accept, forced Campaign NPC)

Base: main d4e9e22. Nothing committed or pushed. `npm run typecheck` and `npm run build` clean; suite 3278/3278 (the known flaky image test passed in the final run). Raw live evidence of the final run: `docs/evaluations/person_offer_live/run.json`. Harness: `src/dev/person-offer-live-cert.ts`. Deterministic suite: `tests/person-offer-e2e.test.ts` with the real playthrough in `tests/fixtures/person-offer-playthrough.ts`.

## 1. Verdict
**Fixed on the engine side and certified live on the final code** (card appears, price moves, a spoken "done deal" does not settle, explicit Accept debits, the woman becomes a Campaign NPC shown as "Slave", her later name updates the SAME entity). Two caveats are listed in sections 12 and 13: the live detection of a person offer is still a reading of free narration (it needed several fixes before the live run passed), and the movement bug is separate and untouched.

## 2. Root cause: why no card appeared
The person offer is read deterministically from the Narrator's delivered text (`resolvePersonOffers`), never from the Controller. In the real transcript the reading returned **nothing**, for three independent reasons:
1. **Price grammar.** "Three hundred for her." has no word "gold"; "I'll go two-sixty." uses a spoken shorthand (unit + tens) that `numberPhraseValue` rejects. Neither was read as a price.
2. **Subject.** The woman was never a "captive": captives needed a captivity marker next to a person noun, and Korvin only pointed at "the other woman" among two.
3. **Verbal agreement.** With no offer on file there was nothing to settle, so "260G it is then, it's a done deal" and "pays Korvin 260G" were prose only, which is correct, but the player saw no card, so the purchase was narrated as if it had happened.

## 3. Exact parser failures (and fixes), `src/turn/person-offers.ts`
- `priceMatches` / `pricesOf`: new price forms — `N for her/him/them/that one/the woman…`, quote-only `"N"`, a bargain verb + N (`I'll go`, `make it`, `how about`…), `N's the number/price`, and a bare number sentence unless the next sentence rejects it ("Two hundred. You're a full third off." is the buyer's figure, not an offer). `shorthandValue` reads "two-sixty" as 260, "nine-fifty" as 950.
- `pointedCaptive`: when the seller prices a person in quoted speech and no captive was detected, the person pointed at becomes the offer subject. Evidence needed: held evidence in the last three exchanges (captivity marker, "two women", or the seller's pitch such as fieldwork/kitchen/"the young one"), a sex taken from the player's own purchase request or the seller's pronoun, and the descriptor ("the young one") choosing which narrated woman the facts come from. It never re-points at a named person already promoted.
- `NON_GOLD` no longer treats the word "marks" (scars: "no marks") as currency.
- `trade-authorization.ts`: a Controller **goods** offer whose line is a person ("The debt-settlement one", "the laundress") is rejected (`goods_is_a_person`). A live run bought a woman as goods for 1200 through that path before this guard.

## 4. 300g detection and 260g supersession
"Three hundred for her." creates an active BUY — PERSON offer of 300 (card "Slave", 300 gold, ACCEPT). "I'll go two-sixty." supersedes it with a new active offer of 260; the old one is `superseded`. The subject is **the same**: when the earlier unsettled offer registered a narrated captive, the new offer reuses its planned character id (`campaign_character_r{rev}_…`), so there is one stable subject across the old and new offer, the person transaction and the later Campaign NPC. Only the 260 offer is acceptable (tests P2–P4).

## 5. Verbal deal and prose payment
"260G it is then, it's a done deal", "pays Korvin 260G Name's Nicco…" and "give him 260 golds" change nothing: funds, offer status and characters are identical before and after (P5/P17). No purchase-by-prose was reintroduced.

## 6. Accept path
`POST /api/trade/accept` takes only `{ref, expected_revision}`. `GameSession.acceptTradeOffer` commits `accept_trade_offer` once: validate the active offer, revision and funds; debit the exact price; apply the stored plan (`register_character` for a narrated captive, `set_legal_status`, `transfer_person` with payment); mark the offer accepted; write the ledger transaction. A double accept, a stale revision, a wrong ref and insufficient funds leave the campaign byte-identical (P7–P10).

Found and fixed on the way (`src/campaign/trade.ts`): a **canonical** person (a seeded NPC such as Mistress Elara) sold by her holder was invalidated at the moment of creation with `person_unavailable`, because the check required her to be in `characters`; canonical NPCs live in `npc_locations`. P12 pins the fix.

## 7. Funds
Test fixture: 500 → 240 after a 260 Accept in CampaignState, in `SessionView.player.gold` and in the UI payload. Live run: 2000 → 900 after a 1100 Accept (the live seller set the price; the purse was raised to 2000 as an evaluation fixture because he asked 950–1200).

## 8. NPC materialization and the "Slave" policy
Accept forces a persistent Campaign NPC: it reuses an existing character (P11, no duplicate) or a canonical one (P12, same objective identity, no generic Slave beside her), or creates one from the authoritative subject with the stable id. An unknown name is shown as **"Slave"** in the sidebar and household (`player-character-view.ts`, `session-view.ts`); the card shows the safe descriptor ("Woman Slave"). No personal name is ever invented. The card carries no hidden name, internal id or lore (P1).

## 9. Name replacement, same entity
A later self-introduction renames the SAME character: same id, location, appearance, legal holder and transaction subject; count unchanged; the UI shows the new name at once (P6, P6b, P6c). Three narration shapes had to be taught to `narrated-captives.ts`: a name-first attributed line ("Maren. If it doesn't matter."), a line that is only a name answering the name question ("Lira.") and the same line when the speaker binder tags it with a wrong speaker (the player or a capitalised word such as "Rain"). A bare name answering a direct name question names the scene's one unnamed present person (sex-compatible); with zero or several unnamed people nothing changes, so the old negative tests still hold.

## 10. UI refresh, save/load
The Accept response carries the new view; gold, receipt and the Campaign NPC appear without a reload. Save/load preserves the NPC as "Slave" and, after the rename, as the new name, with one transaction (P18/P20).

## 11. Live validation (`person-offer-live-cert`)
Production Narrator (`z-ai/glm-5.2`) and Controller (`openai/gpt-6-luna`) through the real GameSession. Final run (9 narrator calls, 8 controller calls; 48,254 narrator and 54,494 controller tokens): Korvin lists two women; "I want the younger one…" → card "Woman Slave"; haggling moves the price (the seller decides: 800/950/1100/1200 across runs); "Done, it's a deal." → funds unchanged; Accept → 2000→900, receipt "Bought Woman Slave for 1100 gold", sidebar "Slave"; asking her name → she says "Lira" → the **same id** (`campaign_character_r4_woman`) is now "Lira", still one created character. The seller never accepted exactly 260 in a live run; that exact figure is covered by the deterministic playthrough.

Honest count: this was **run 9**, not one run. Runs 1–8 were diagnostic and each exposed a real defect now fixed and pinned by a test: seller pricing two women with "the young one" (no card); "no marks" read as currency; the pitch without a pronoun ("The debt-settlement one… Twelve hundred gold") which the Controller turned into a goods offer; "Got one right here"; "Nine-fifty's the number"; a wrong sex taken from the seller's "he's"; and the rename forking a second person ("Lira", "Lirien"). Because the Narrator's wording changes every run, this detection remains heuristic reading of prose; expect further phrasing to need teaching.

## 12. Movement ("Alright Maren, I just purchased you, let's go home")
Maren exists authoritatively before the move (the rename was committed in the previous turn). After the turn Nicco is at the Heartstone but she stays at the market and `scene.present` is empty. This is a **separate companion/group movement bug**, not a trade or identity problem; it is documented in the test ("movement follow-up") and not fixed here.

## 13. Known limits
- Person offers still depend on reading seller speech; a wording with no pronoun, no pitch word and no sex in the player's request will not produce a card (nothing is bought wrongly, the player simply sees no card).
- The speaker binder sometimes tags a line with a capitalised first word ("Rain") as speaker; the bare-name rule tolerates it, other flows may not.

## 14. Files
`src/turn/person-offers.ts`, `src/turn/narrated-captives.ts`, `src/turn/trade-authorization.ts`, `src/campaign/trade.ts`, `src/app/player-character-view.ts`, `src/app/session-view.ts`, `src/dev/person-offer-live-cert.ts`, `tests/person-offer-e2e.test.ts`, `tests/fixtures/person-offer-playthrough.ts`, `docs/evaluations/person_offer_live/run.json`.
