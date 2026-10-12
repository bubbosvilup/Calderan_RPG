# Consolidation Block 8: small modern regression benchmark

Date: 2026-10-12. Baseline: main `56e4f0e` (block 7), 3520/3520. Scope: **test / benchmark infrastructure only.** No gameplay, no NarrationFacts, no new trade grammar, no new lifecycle mechanism, no UI. No engine file under `src/` was changed (the only new `src/` file is the live evaluation script `src/dev/consolidation-block8-live.ts`).

**Verdict: the permanent modern benchmark exists and is green.** 20 deterministic scenarios (19 PASS, 1 KNOWN PRODUCT GAP, 0 FAIL), identical across runs, about 4 seconds of scenario time. Three bounded live Actual Offer regressions: **A PASS, B NOT REACHED, C PASS**; one end-to-end Accept completed. NarrationFacts (blocks 9-11) can use `npm run benchmark:modern` as migration protection.

## 1. Baseline

* HEAD `56e4f0e` (fast-forwarded block 7), clean tree, `tsc --noEmit` 0 errors, build 0 errors, `npm test` **3520 tests, 3520 pass**.
* Invariants this benchmark now encodes (all confirmed against the code and the block 4/5A/5B/6/7 reports, none changed):
  * strict `expected_revision` equality and `turn_key` idempotency (a replay answers the stored result with zero provider calls and no commit);
  * `PendingConfirmation`: a proposal (manumission, retire, merge) mutates nothing; only an explicit Confirm commits, once;
  * lifecycle PROVISIONAL (scene only, never saved) / PERSISTENT / RETIRED; narration and names are never persistence authority;
  * Actual Offer: a price is read only from the seller's delivered narration (person) or a Controller proposal with verbatim evidence (goods); the latest concrete seller offer supersedes; only the player's explicit Accept settles, atomically;
  * optional side stores (`optional/learning.json`, `media.json`): optional writes never bump the semantic revision and are never in the semantic save.

## 2. Benchmark format (Phase 1)

Readable TypeScript records, no DSL (the repository's tests are TypeScript fixtures). Files:

| File | Role |
| --- | --- |
| `tests/benchmark/scenarios.ts` | the 20 scenarios; the only file a human edits to add a case |
| `tests/benchmark/scenario.ts` | types (`Scenario`, `Step`, `Observables`), the step interpreter, `observe`, `diff`, `runScenario` |
| `tests/benchmark/harness.ts` | `makeRig`: real `GameSession` + real `TurnCoordinator` + real `FileCampaignRepository` in a private temp dir; scripted Narrator and Controller; `reload()` (save, then a brand-new session from disk) |
| `tests/benchmark/runner.ts`, `run.ts` | `runAll`, the report, the CLI |
| `tests/modern-benchmark.test.ts` | the same scenarios as 20 `node:test` cases under `npm test`, plus the format gate tests |

A scenario is `{id, category, purpose, mode, known_gap?, initial, steps, expect}`:

* `initial`: world (`fixture` test hall, `market` = the real Calderan slave market with Korvin's name known, `mannerism` = the fixture with two household NPC+), setup commands, optional starting gold;
* `steps`: `turn` (player input + the Narrator text + the Controller proposals + their evidence quotes; `fails`, `key`, `stale_revision`), `accept` (`stale`), `confirm`, `cancel`, `repair`, `promote_npc_plus`, `save`, `save_reload`, `replay_turn`, `optional_write`, `check`. Any step may carry its own `expect`, so revision deltas are asserted at the exact step where they happen;
* `expect`: named observables compared with deep equality, and only the ones a scenario names are read: `revision_delta`, `gold`, `at`, `legal`, `created`, `retired`, `provisional_refs/names`, `identity_commands`, `scene_participants`, `offers_active`, `offers_by_status`, `card`, `offer_subjects`, `created_are_offer_subjects`, `transactions`, `inventory`, `held_by_player`, `confirmations`, `npc_plus`, `household`, `calls`, `save_state`, `reflection_notes`, `portrait_versions`, `mannerism_records`, `disk`;
* verdicts: **PASS**, **FAIL**, **KNOWN PRODUCT GAP**. A `known_gap` scenario states the DESIRED behavior; while it fails it reports KNOWN PRODUCT GAP, and **the day it unexpectedly passes it reports FAIL** ("the gap is closed, update the benchmark"), so a gap can never be turned green by editing the expectation.

Phase 1 gate (tests in `tests/modern-benchmark.test.ts`): one scenario runs alone with the same verdict as in the full run (P1, S1, A2); a failure prints `<id> step N (<label>): <observable>` with `expected` and `actual` lines; a closed gap fails loudly; two runs and two full sweeps are identical (no state leaks: every run has its own campaign, directory and coordinator).

Detection check (not committed): temporarily making every created person a follow candidate and making a reprice leave the old offer active failed exactly M3, T2 and P1; the sources were restored.

## 3. Scenario inventory (Phase 2)

| id | category | what it protects | mode |
| --- | --- | --- | --- |
| M1 | movement | the player moves alone; an unrelated free NPC stays; one atomic revision | deterministic |
| M2 | movement | a held person the player names and leads, and a household member narrated following, move WITH the player in one revision, no duplicate | deterministic |
| M3 | movement | a free uninvited NPC the Narrator says follows has no follow authority; she stays | deterministic |
| I1 | identity | an incidental named stranger stays PROVISIONAL: no CampaignCharacter, no revision | deterministic |
| I2 | identity | repeated interaction reuses ONE provisional identity (same ref), still persists nothing | deterministic |
| I3 | identity | narration naming an existing durable identity (campaign Brenna, canonical Korvin) reuses it: no provisional duplicate | deterministic |
| I4 | identity | **KNOWN PRODUCT GAP**, see section 5 | deterministic |
| T1 | trade | a goods offer is an Actual Offer; nothing paid or transferred until Accept; Accept settles | deterministic |
| T2 | trade | a seller reprice supersedes; the stale price is not actionable; Accept settles only the new price | deterministic |
| T3 | trade | the Narrator claims payment and transfer and the Controller tries to mint the goods: nothing authoritative moves | deterministic |
| P1 | person_trade | a provisional person is bought: nothing before Accept; Accept debits, materializes the SAME subject as exactly ONE persistent character, in exactly one revision | deterministic |
| P2 | person_trade | the later name reveal binds to the SAME persistent character (no second person, no second transaction) | deterministic |
| H1 | household | the explicit rite promotes an eligible persistent NPC; identity retained; one revision | deterministic |
| H2 | household | a provisional person cannot silently become NPC+ or a household member; the rite UI has no card for them | deterministic |
| S1 | persistence | save/reload keeps the PendingConfirmation, the turn receipt (same `turn_key` replays with zero provider calls) and the side stores, no optional revision churn | deterministic |
| S2 | persistence | Reflection, Mannerism and portrait writes change only the side stores; the semantic revision never moves | deterministic |
| A1 | authority | "I hereby free you" is a proposal; no legal mutation before Confirm; Confirm commits once, zero extra provider calls | deterministic |
| A2 | authority | human merge and retire: a card, no mutation before Confirm, exactly one commit after each | deterministic |
| F1 | fail_closed | two held people and "free her": no guessed irreversible action | deterministic |
| F2 | fail_closed | a question, a fraction of gold and a zero-price proposal fabricate no offer, no card, no settlement (the malformed proposal fails the turn closed) | deterministic |

Category breakdown: movement 3, identity 4, trade 3, person_trade 2, household 2, persistence 2, authority 2, fail_closed 2 (= 20). The three live regressions are documented in section 6 and are not part of the offline suite (mode `live_only` is reserved in the format; they live in the evaluation script).

## 4. Deterministic results (Phase 3)

`npm run benchmark:modern` (build + run; `-- --only M1,P1` runs a subset; `-- --verbose` prints the desired-vs-actual of known gaps; exit code 1 only on FAIL):

```
total 20   passed 19   failed 0   known product gaps 1
  movement 3/3, identity 3/4 (1 gap), trade 3/3, person_trade 2/2, household 2/2, persistence 2/2, authority 2/2, fail_closed 2/2
failing: none     known gaps: I4
```

Run twice: the two reports are identical apart from the millisecond column (diffed). The scenarios themselves take about 4.0 s in total (the wall clock of the command, about 21 s, is the TypeScript build). The same 20 run under `npm test` as `tests/modern-benchmark.test.ts` (25 tests: 20 scenarios + 5 gate tests).

## 5. Known product gaps

**KPG-1 (scenario I4): there is no generic deterministic player-facing action that promotes an arbitrary ProvisionalPerson to a CampaignCharacter.** A stranger the player has spoken with over several turns ("My name is Hollis") stays provisional: narration, names and the player's words ("Hollis, I would like to keep you around") are by design not persistence authority (AUTH-2), and the only producers of a persistent character are domain-authorized acts, today the person Actual Offer Accept (and the engine's own lazy canonical materialization). The scenario expresses the desired behavior (`created: ["Hollis"]`), reports KNOWN PRODUCT GAP, and was **not** solved here. Consequence: a narration-named stranger cannot be kept in the NPC drawer, cannot reach NPC+ (H2 pins that), and is forgotten on reload (PER-2 stays open). Closing it needs a product decision on an explicit, player-authorized "keep this person" act (a PendingConfirmation kind is the natural shape), not a benchmark change.

Observations made while building the benchmark (not gaps, recorded so they are not rediscovered):

* A person offer needs an established seller. With Korvin's name unknown, the live narration says "the man" and the engine blocks with `seller_authority_unestablished` (fail closed, no card). Live scenarios therefore seed "Nicco knows Korvin's name" (as the deterministic ones do).
* A goods Accept is recorded in the offer ledger (`offers_by_status.accepted`, settlement), not as a `transactions[]` entry; only person transfers add a transaction (T1/T2 assert the ledger).
* The provisional reader recognises "the woman", "the porter", "the man"; a repeat reference as "the sweeper" is not recognised, so that provisional person drops out of the window (found while writing H2; harmless for authority, relevant to PER-2/ID-2 and to NarrationFacts name slices).

## 6. Live Actual Offer regressions A, B and C (Phase 4)

Harness: `src/dev/consolidation-block8-live.ts`, production `GameSession` -> `TurnCoordinator`, the production Narrator and Controller, a fresh campaign per scenario at the slave market with Korvin's name known, one setup turn ("goes to Korvin, among the private licensed sellers") and then at most three numeric exchanges. The seller's line is scripted inside the player's input to steer the model ("Korvin ... says plainly: ..."); the authority still comes only from the delivered narration. One bounded attempt per scenario, no reroll. Evidence: `docs/evaluations/consolidation_block8_live/`.

| Scenario | Exchange | Result | Final card | Active offers | Subject | Settlement before Accept |
| --- | --- | --- | --- | --- | --- | --- |
| **A** | seller 100 | **PASS** | person, buy, **100** ("Thin Slave") | 1 (`buy person 100`) | `campaign_character_r4_woman`, the single woman shown | none: gold 500, 0 created, 0 transactions, no legal transfer |
| **B** | seller 100, player 90, seller 95 | **NOT REACHED** | person, buy, **95** | 1 (`buy person 95`) | `campaign_character_r4_woman` (one subject) | none |
| **C** | seller 400, player 250, seller 275 | **PASS** | person, buy, **275** | 1; the 400 offer is `superseded` | `campaign_character_r4_woman` (same subject for both offers) | none |

* **A**: Korvin jerks his chin toward one woman and says "This one's a hundred gold."; the engine read 100 and produced the card. All committed-state criteria passed. The in-run script verdict was FAIL only because a loose text heuristic matched "what they can pay" in the setup narration; the heuristic was then restricted to numeric turns and made informational. A was not re-run for its verdict (stored with `verdict_final: PASS`).
* **B**: in the first numeric turn Korvin said "This one's a hundred gold." but the narration showed **no person** (a nod "toward the pen"); the engine correctly made no person offer. So the 100 -> 95 supersede was never exercised, which is why B is **NOT REACHED** (model wording prevented the intended exchange) and was not retried. What was observed after the third exchange still matches the intent: exactly one active offer, the SELLER's 95, card 95, the player's 90 never became an offer, nothing paid, materialized or transferred. The supersede itself is covered live by C and offline by T2.
* **C**: card 400 after the first exchange; the player's 250 changed nothing (card still 400); Korvin's "Two hundred seventy-five. That's my last word on her." superseded the 400 and made 275 the only actionable card, same subject, direction player_buys, no settlement.
* Not seen in any run: a stale price still actionable, the player's counter treated as the seller's offer, two active offers, a wrong subject, a completed payment/ownership delivered before Accept.
* Disclosure: my first run of A (kept as `attempt0_A_invalid_precondition.json`) was invalid by MY scenario design, not by the model: Korvin's name was not seeded, the narration said "the man", and the engine blocked with `seller_authority_unestablished`. I fixed the precondition and ran A again; that is the A above. Both runs are counted in the cost line below.

## 7. Optional end-to-end Accept (Phase 4)

B was NOT REACHED, so the Accept was run as a separately labelled run (`ACCEPT_RUN=1`, A's flow: `result_ACCEPT_RUN.json`) with the same precondition. Card 100 -> explicit Accept with the current revision:

* price deducted **100** (gold 500 -> 400); the offer is `accepted` with settlement `gold: 100`;
* exactly **one** persistent character was created and it **is the offer's subject** (`created_is_the_offer_subject: true`); no duplicate;
* the legal transfer is atomic with the payment: `campaign_character_r4_woman` enslaved, holder `nicco`; one transaction (`campaign_transaction_r3_r4_woman`); one revision for the whole Accept (`revision_delta: 1`);
* the card the player saw before pressing Accept was the safe label ("Woman Slave", price 100), with no invented name or id.

## 8. Full validation (Phase 5)

| Check | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm run build` | 0 errors |
| `npm test` | **3545 tests, 3545 pass, 0 fail** (3520 + 25 new); the known flaky `generation lifecycle` family did not fail, no rerun needed |
| `npm run benchmark:modern` x2 | identical, 20 scenarios, 19 PASS, 1 KNOWN PRODUCT GAP, 0 FAIL |

Provider usage (live, section 6-7): 30 wire calls in total (Narrator `z-ai/glm-5.2` 16, the rest Controller 14), about **176,985 tokens**: invalid first A 5 calls / 25,088 tokens; A 4 / 25,019; B and C 17 / 101,859; Accept run 4 / 25,019. Cost in dollars: not reported by the turn trace (no cost field is surfaced for these providers), tokens only. The deterministic suite makes zero provider calls.

Exact-final-code status: the live runs and the validation ran on the final working tree (uncommitted, on top of `56e4f0e`); no `src/` engine file changed after the live runs (only the evaluation script was adjusted between the invalid first A run and the later runs, as described above).

Files: new `tests/benchmark/{harness,scenario,scenarios,runner,run}.ts`, `tests/modern-benchmark.test.ts`, `src/dev/consolidation-block8-live.ts`, `docs/evaluations/consolidation_block8_live/*.json`, this report; modified `package.json` (`benchmark:modern`), `docs/TESTING.md`, `docs/MASTER_ROADMAP.md`, `docs/CURRENT_STATE.md`. No commit, no push.

## 9. Block 9 handoff (NarrationFacts migration protection)

* **How to use it:** run `npm run benchmark:modern` before a NarrationFacts slice (record the 19/1/0 baseline) and after it; any `FAIL` names the scenario id and the observable that moved. `-- --only` runs the slice's scenarios while iterating; the whole sweep is a few seconds.
* **Slice to scenario map:** movement/follow/departure/arrival -> M1-M3 (plus the block 3 tests); price/offers -> T1-T3, P1, F2 and live A/C; names/identity -> I1-I3, P2, H2; lifecycle/authority -> A1, A2, F1; persistence -> S1, S2.
* **Rules:** a slice may change HOW facts are read, never what these scenarios assert. If a slice legitimately changes behaviour, change the scenario in the same commit and say why in the report; never edit an expectation to make a gap go green (a closed gap FAILS until `known_gap` is removed on purpose).
* **Add next (small):** a movement scenario for an explicitly named group ("Tessa and Dara, come with me"), a SELL goods scenario, a stale-`expected_revision` turn (the `stale_revision` step exists but no scenario uses it), and a Narrator-truncation scenario once the Narration slice lands.
* **Live:** `consolidation-block8-live.js A B C` is the paid trigger regression (about 177k tokens for everything incl. the Accept); keep it for slices that touch price or person reading, and treat NOT REACHED as "the model did not show a person", not as a regression.
* **Open:** KPG-1 (explicit "keep this person" act) needs a user decision before any slice depends on persistent strangers; PER-2/ID-2 remain open.
