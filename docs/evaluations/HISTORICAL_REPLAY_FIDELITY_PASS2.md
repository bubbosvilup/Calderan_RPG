# Historical Replay Fidelity: Pass 2 (final report)

Status: evaluation report (historical once written). **No commit. No push.** Oracle: [HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md](HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md) (`oracle-v1`, frozen, sha256 in `historical_replay/ORACLE_SHA256.txt`, never edited). Pass 1 report: [HISTORICAL_CAMPAIGN_REPLAY_CERTIFICATION.md](HISTORICAL_CAMPAIGN_REPLAY_CERTIFICATION.md). Artifacts: `docs/evaluations/historical_replay/`.

## 1. Verdict
**PARTIAL. Engine integrity certified; the historical end state is NOT reproduced (best 22/32 MUST_MATCH, target 26/32 not reached).**
No corruption, no negative or invented funds, no duplicate canonical identity, no sealed-canon leak, save/load round trip clean in every full run. What Pass 2 achieved: Brenna's purchase from Korvin now resolves and commits (B-02, B-01, B-06 pass in the best run), identity requests no longer mint aliases for canonical people, the comparator now checks all 32 MUST_MATCH items, and a replay-only anchor mechanism plus a seller/partner continuity model exist. What is still missing is mostly not an engine bug: the goods-purchase subsystem, silver, Controller-made items, and a narrator that reliably voices the rite and a single clean Maren sale.

## 2. Work and replay history
Pass 1 (see its report): iteration 00 pilot (4 turns), 01 strict (aborted at 85), 02 assisted (aborted at 99), 03 assisted full (12/25), 04 assisted full (18/25 on the old comparator; **24/32** re-scored with the 32-check comparator, but with no real sale: B-02 and C-02 still failed).

Pass 2 (anchored, assisted; 19 anchors; same 421 historical Nicco messages from a fresh campaign each time):

| Iter | Label | Turns | MUST_MATCH /32 | Fail turns | Duration |
|---|---|---|---|---|---|
| 05 | pass2-anchored | 421 | 15 | 1 (T275) | 3312 s |
| 06 | anchored-b | 421 | 20 | 4 | 3396 s |
| 07 | anchored-c | 421 | 17 | 1 | 3110 s |
| 08 | anchored-d | 421 | 22 | 5 | 3501 s |
| 09 | anchored-e | 421 | **22 (best, real sale of Brenna)** | 1 (T211) | 3463 s |
| 10 | anchored-f | 421 | 18 | 1 | 3077 s |
| 11 | segment 1-84 | 84 | n/a | 1 | 655 s |
| 12 | segment 1-84 b | 84 | n/a | 1 | 640 s |

Six full anchored runs plus two 84-turn segments. A failed turn is a transient provider/controller failure the harness records and continues past. Score variance between runs of the same engine is large (15 to 22) because the narrator is non-deterministic and the later checks are chained (Maren and Brenna household/NPC+ depend on the sales). Progression: 15, 20, 17, 22, 22, 18. The loop was stopped by the 18:32 directive and the API budget, not by reaching a plateau.

## 3. Best run (iteration 09, 22/32): the 32 MUST_MATCH
PASS (22): A-01, A-03, A-04, A-07, B-01, B-02, B-06, D-01, D-02, E-01, E-04, F-01, F-02, F-07, G-13, H-01, H-11, I-01, M-01, M-05, M-06, M-07.
MISMATCH (6): A-02 funds 495 (expected 405..411), H-10 same band, B-04 Brenna member/NPC+ (rite not completed), C-01 no created Maren, E-02 members only Nicco, E-05 no NPC+.
BLOCKED_BY_EARLIER_DIVERGENCE (4): C-02, C-04, C-09, C-10 (all need Maren).
Full table: `historical_replay/best_expected_vs_actual.md`; state: `best_final_state.json`.

Causal grouping:
1. **Maren missing** (C-01, C-02, C-04, C-09, C-10, and through them E-02, E-05): the anonymous-seller sale never came together in the best run. Depends on the narrator giving an unambiguous anonymous seller and a price for the only captive; the parsing for it is fixed (section 5) but was only validated offline on stored narrations (iterations 08, 09).
2. **Rite not completed** (B-04 and part of E-02/E-05): Brenna is bought, but the Heartstone rite needs the narrator to voice the oath; anchors A082 and A357 prepare it but they were not live-validated after the last fixes.
3. **Goods purchases** (A-02, H-10): funds stay 495 instead of ~405..411 because goods purchases change nothing (documented future work, not an engine bug). Not fixed on purpose: the user ruled out inflating the economy or a multi-currency system for this pass.

## 4. Engine bugs versus missing subsystems versus historical incompatibilities
- **Engine bugs (fixed, generic):** section 5.
- **Missing subsystems:** goods purchase / money model for non-person trades; silver; Controller item creation (judgement-based, almost always empty); a rite that does not rely on the narrator's wording.
- **Historical incompatibilities:** the strict travel contract rejects "to the tower" style destinations (logged assists only); the old narrator's quoted prices (5 and 3 gold) differ from current canon price levels; the old narrator's inventions (ring, golem, medical supplies) are not canon.

## 5. Generic engine bugs and fixes (no hardcoding, no oracle values, no turn conditions, no blind rerolls)
1. Identity requests ("who am I talking with") resolved loosely and the narrator minted a personal name for a descriptor-voiced participant. Fix: name-request-scoped canonical casting (`src/turn/identity-request.ts`, `canonical-interaction-targets.ts`, EXCLUSIVE_TRAITS=2 only for identity requests). Tests: `identity-objective-vs-known.test.ts`.
2. Seller continuity: a partner voiced by descriptor ("the short man") fell out of the foreground. Fix: `#focus` partner persists on deal turns (`transaction-acts.ts: continuesTransaction`), plain RPG speech is read as speech (`rpg_speech`), partner binding from beats (`bindPartnerSpeaker`).
3. Scene reading for narrated captives (`narrated-captives.ts`): name presentations in plain speech ("Brenna. Thirty-two."), weak name patterns ("Brenna, the short man says,"), "That's her. Brenna.", captivity markers (auction/pens do not make anyone a captive merely by being mentioned), pronoun anaphora to the person narration mentioned last, a name and a description in the same exchange are one identity.
4. Person transactions: acceptance and pronoun offers for the only captive ("She's a write-off. Three gold."), anonymous-seller sales, price formats; **new in this closing step:** a person promoted by name before narration showed them held (no captive role) is still the captive when the scene later narrates a captive under the same noun, so no unnamed duplicate is created (`person-transactions.ts`, regression in `seller-continuity.test.ts`, last test). Found in iteration 12, where Brenna (promoted T4) was left unsold and an unnamed duplicate was sold at T7.
5. Number grammar for multi-word prices and the narrator "resolve a paid quote" prompt rule (Pass 1).
6. Household rule restatement rejection and the Nicco avatar UI fix (Pass 1).
7. Replay-only seams: `ProductionOptions.narrator_wrapper`, the anchor block, assisted location corrections (also moving named companions through the ordinary `move_character` command), the 32-check comparator.

## 6. Files changed
Production (generic): `src/app/production.ts`, `src/app/turn-trace.ts`, `src/campaign/social.ts`, `src/turn/{canonical-interaction-targets,canonical-name-disclosure,narrated-captives,person-transactions,player-intent,prompt-builder,scene-participants,turn-types}.ts`, `src/turn/language/numbers.ts`, `src/turn/stages/{intent,result}.ts`, `src/ui/client.js`; new `src/turn/identity-request.ts`, `src/turn/transaction-acts.ts`.
Replay-only (dev): `src/dev/historical-replay.ts`, `historical-replay-compare.ts`, `historical-anchors.ts`.
Docs: `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/TESTING.md`, this report, the pass 1 report, the oracle.
Data: `historical_replay/` (iterations 00-12, probes, anchors JSON and sha256, assists, ledger, status, best state).

## 7. Tests added and final count
Added: `tests/seller-continuity.test.ts` (15), `historical-anchors.test.ts` (8), `historical-replay-comparator.test.ts` (6), `identity-objective-vs-known.test.ts` (6), `historical-replay-regressions.test.ts` (4); the golden pipeline trace was regenerated once in Pass 1 (narrator prompt sentence). Final suite count: 3205/3193.

## 8. Anchor design and count
19 anchors (`historical_replay/HISTORICAL_TURN_ANCHORS.json`, sha256 in `.sha256`). Kinds: interlocutor, transaction, premise, travel_referent. Each carries the historical evidence excerpt (verified against the transcript). They are a scenario constraint for the Narrator, appended through the replay-only `narrator_wrapper`; the schema has no field for funds, items, households, NPC+, commands or transactions and a validator rejects them; a transaction anchor can only say `offered_not_completed`. They preserve the premise (a quote exists), never the outcome (a sale). Non-dev source does not reference them (tested). No new anchors were added in the closing phase.

## 9. Purchase flow, Brenna, Maren, Gerome, household, NPC+, money, items, save/load
- **Brenna:** bought for 5 gold from Korvin in the best run (one sale, one created Brenna, ends in Heartstone). Not a household member / NPC+ because the rite did not complete.
- **Maren:** not created in the best run; anonymous sale resolves offline for iterations 08 and 09 narrations; iteration 10's narration gives no extractable speaker.
- **Gerome:** exactly one, active, in Heartstone (D-01, D-02 pass).
- **Household:** exactly the three charter rules; members Nicco only.
- **NPC+:** Nicco never NPC+; no promotion of Brenna/Maren.
- **Money:** ledger consistent (H-01, H-11); funds 495 vs expected band 405..411 (goods purchases not modelled).
- **Items:** Deed and Charter kept, no duplicates.
- **Save/load:** round trip true in every full iteration.

## 10. Location / travel assist usage
Assists (official `overridePlayerLocation`, logged as ASSISTED_LOCATION, only at historical place changes and only when the engine is not already there): turns 9, 46, 54, 198, 202, 225, 237, 254, 261 (`location_assists.json`). Named companions (Brenna after T9) are relocated through the ordinary move command. No other state is injected.

## 11. Retrieval contamination audit
Anchor text appears only in the harness `narration.jsonl` log. 0 echoes in 15 anchored narrations; not in save.json, transcript or backups; the non-dev source contains no anchor references (tested).

## 12. Production versus replay-only; prompt changes; providers
Production: the generic fixes in section 5 and the `narrator_wrapper` seam (a no-op when unset). Replay-only: harness, comparator, anchors, assists. Prompt change: Pass 1 only (one sentence that a seller resolves a paid quote); none in Pass 2. Models: narrator `z-ai/glm-5.2`, controller `openai/gpt-6-luna` (fallback claude-haiku-5.5), via OpenRouter proxy-injected auth. Per full run about 421 narrator calls and 421 controller calls (lower bounds); Controller ~16 completion tokens per turn because it almost always proposes nothing. Six full runs plus two segments is roughly 2900 narrator and 2900 controller calls in Pass 2. Spend was not metered per call; the user reported about €30 for the day.

## 13. Certified / not certified; is another replay worthwhile; next pass
Certified: engine integrity (ledger, identities, masking, sealed canon, save/load), seller continuity for canonical and anonymous sellers offline, Brenna's sale live once (iteration 09).
Not certified: Maren end to end live, the rite anchors live, funds band, NPC+/household promotion in replay.
Another full replay is **not** worthwhile now: the variance (15 to 22) comes from the narrator and the missing subsystems, so a further run spends budget without new information. A cheap next step is a segment replay of turns 190-280 (Maren) after the final fixes. Recommended next pass: (1) a goods-purchase and silver policy (the A-02/H-10 band), (2) a rite path that does not depend on the narrator voicing the oath, (3) Controller item creation for obvious purchases, (4) a deterministic purchase-completion hint when a quoted price is paid.

## 14. Closing checks
Typecheck and build clean. Full suite after the Brenna duplicate fix: see the line below.

Full suite: **3205/3193 pass, 0 fail**; typecheck and build clean.

No commit. No push.
