# Caldrevan hardening H5.1 — live findings repair (movement continuity and duplicate captive identity)

**Date:** 2026-10-01. Bounded correctness repair. No commit or push; the working tree is left for review.

**Inputs:**

- the H5 reports: [robustness](CALDREVAN_HARDENING_H5_LIVE_MODEL_ROBUSTNESS.md), [live eval](CALDREVAN_HARDENING_H5_LIVE_EVAL.md), [JSON](CALDREVAN_HARDENING_H5_LIVE_EVAL.json);
- the raw H5 records in [`h5-live/`](h5-live/).

**New evidence:**

- `tests/h5-1-live-findings.test.ts` (23 tests);
- `h5-live/h5_1.jsonl` (live revalidation, with summary);
- `h5-live/h5_1_comparison.json`.

## A. Executive result

**Status: COMPLETE.** Both live-confirmed defects were reproduced deterministically before any change, then fixed under the existing invariants. They stay fixed in focused live revalidation (140 turns, about $0.43).

| | H5 (same scenarios) | H5.1 |
|---|---:|---:|
| Movement turns that committed the requested movement (B, C, D, Y) | **0 / 99** | **50 / 50** |
| Carried person moved with Nicco (D) | 0 / 19 | 10 / 10 |
| Unintended movement (O, G, H, S) | 0 | 0 |
| Narrated movement delivered contrary to state | not detectable (no audit rule) | 0 delivered; movement issues are audited |
| Wrong committed identity in purchase scenarios | 1 (`register_character` of a narrated captive) | **0** |
| New-person registrations in G/H | 1 | 0 |
| Tests (total / pass / fail / todo) | 1196 / 1192 / 0 / 4 | **1219 / 1215 / 0 / 4** |
| Replay | 25/25 | 25/25 |
| H2 golden file | — | byte-unchanged |
| Unintended behaviour changes | — | **0** |

**Correction to the H5 diagnosis.** The H5 report called the identity case a "duplicate Brenna". The exact recorded narration shows something worse: the purchase registered and bought **"the man"**, an unrelated narrated captive, because a simile in Korvin's line was read as a reference to him (section I).

A separate H5 statement was also wrong and has been corrected in the H5 robustness report: the claim that the fixture's boots belong to Brenna. In fact Nicco owns `boots` and Brenna wears `brenna_boots`.

## B. H5 baseline

Re-verified before changes:

- typecheck pass;
- 1196 tests (1192 pass, 0 fail, 4 todo);
- replay 25/25;
- H2 golden green.

H5 live records for the target scenarios:

- **Movement:** 0 of 99 movement turns committed a move.
- **Purchase:** 1 of 30 purchase turns committed a wrong identity (`H_late_naming` soak run 6).

## C. Movement defect reproduction

Before the fix, the deterministic pins showed `playerIntent` returning **no runtime movement** for all five H5 phrases:

1. "I leave the room and go downstairs to the main hall."
2. "I go down to the main hall alone."
3. "Come with me, Brenna. Let's go down to the main hall together."
4. "Maren has twisted her ankle. I lift her carefully and carry her down to the main hall."
5. "Gerome, you may go now. Leave the room."

Run against the unfixed build, the new suite had **19 failures** (all movement and identity pins); 4 tests passed.

## D. Movement root cause

| Actor / case | Owning layer | Root cause |
|---|---|---|
| Nicco, explicit movement | `player-intent.ts` strict grammar, plus `natural-actions.ts` (asterisk actions only) | Unmarked prose matched only the whole-text forms `/go`, `go to`, `I go to`, `I go downstairs to` / `upstairs to`. "go down to", "head downstairs to", "leave the room and go…" and "let's go…" never matched. In asterisk actions, `downstairs` / `upstairs` were not accepted as particles. |
| Carried persistent character | `character-movement.ts` `resolvePlayerCarry` | Movers were created characters only, so an authored NPC (fixture Maren) could never be carried. "carry her" had no antecedent rule, so "Maren has twisted her ankle. I lift her…" was ambiguous with two women present. |
| Follower | Controller `move_character`, authorized from narration evidence (created characters only) | The rule is unchanged by design. The evidence grammar also missed a stairway leg ("follows him down the stairs into…"). |
| NPC departure | Controller `leave_scene` from completed-departure evidence (created characters only) | Natural exits were already recognised except stairways ("heads downstairs"). Authored NPCs can never `leave_scene` (CampaignState refuses). |
| Audit | `narration-audit.ts` | **No location check existed.** Narration could move Nicco, or any NPC, against state with no issue raised: the H5 blind spot. |

## E. Movement grammar repair

**Player movement.** The new `firstPersonMovement` (player-intent.ts) runs only when the strict forms do not match and no asterisk action moved Nicco. It is a bounded clause grammar:

- **Verbs:** go / head / walk / run / hurry / climb / step / return / move / wander / stroll / make my way.
- **Particles:** back, down, up, over, out, across, down the stairs, downstairs, upstairs.
- **Arrival words:** to / into.
- **Subject:** the clause starts with "I" or "let's", or continues an earlier first-person clause of the same sentence ("I stand up, leave the room and head downstairs to…").
- **Excluded:** quoted speech and asterisk segments.
- **Gate:** a new shared gate, `GATES.player_movement_not_done`, built from existing cue words plus a new `TEMPORAL.tomorrow` cue, and locked in the gate matrix. It vetoes negation, modality, intention, plans, hypotheticals, questions and other-day framing anywhere before the movement in its sentence. There is no local negation regex.
- **Routing:** the destination goes through the existing `resolveDestination` and `reachable` rules. Shortest path, route minutes and tie-breaking are unchanged, and unreachable destinations are blocked, never teleported. The blocked case uses the shared `resolveMovement` helper, now also used by asterisk actions with unchanged behaviour.

**Destinations must be explicit:**

- "I go downstairs", "I leave" and "I wander off" move nobody.
- An unknown destination moves nobody and raises no error (free prose is not a command).
- The strict command forms keep their old error behaviour.

**"Let's go down to X"** commits Nicco's own movement only. Whoever he addresses moves only through their own narrated, authorized following.

**Carry.**

- Present authored NPCs can now be carried; CampaignState moves them through runtime locations.
- A pronoun resolves to the single movable person the player named earlier in the same input.
- There is no persistent carry state.
- Helping, supporting or escorting is never carrying.
- Negated or modal carrying is not carrying.

**Follower.** No forced following: "Come with me" plus Nicco's movement never moves Brenna. The narrated-follow evidence pattern accepts a stairway leg; for created characters, authorization is otherwise unchanged.

**NPC departure.** The completed-exit grammar accepts stairway exits ("heads downstairs", "goes down the stairs"). Looks, readiness, talk, hesitation, starting toward the door, and quoted orders are still not departures.

## F. Movement audit backstop

There is a new audit kind, `uncommitted_movement`.

**What it flags:**

- Nicco narrated completing movement to a known location he is not at, or leaving the location he is still at.
- A persistent character, created or authored, in the origin or arrival scene, narrated completing movement to a concrete location where prepared state does not put them.

**How conservative it is:**

- It requires an explicit "Nicco" (a bare "he" is never resolved).
- It requires explicit travel verbs and a destination that resolves to one known location.
- Quotes are ignored, and hedged or looking clauses are ignored (`movement_not_done`).

**What it changes:**

- The revision request gains `NOT COMMITTED: X did not move this turn and is at <place>.`
- Redaction drops the flagged sentence.
- **It never creates a command:** state stays authoritative.

`uncommitted_departure` now also covers present **authored** NPCs, which cannot `leave_scene`, so narrating one as gone is always unrecorded.

## G. Movement regression matrix

All rows pass in `tests/h5-1-live-findings.test.ts`.

| | Case | Result |
|---|---|---|
| **Positive** | "I go to X" / "I go downstairs to X" / "I go down to X" / "I head downstairs to X" / "I head down to X" / "I leave the room and go downstairs to X" / "I leave here and go to X" / "I walk down to X" / "I make my way down to X" / "Let's go to X" / multi-clause / `*goes downstairs to X*` / return trip "I go back up to the room" | move through the route (1 minute) |
| | "carry her down to X" (with antecedent), "pick Maren up and carry her downstairs to X", "I go down to X, carrying Maren" | Nicco and the carried person move |
| | "Tomas nods and leaves the room", "walks out of the room", "turns and leaves", "heads downstairs", "goes down the stairs" (created character) | departure evidence |
| **Negative** | "I do not go to X", "I don't go…", "I might go…", "I almost go…", "I plan to go…", "If I go…?", "I think about leaving…", "I want to go…", "I could head down… later", "Let's not go…", "Should I go…?", quoted "I go…" | no move |
| | "I ask Brenna to go to X", "Brenna refuses to go to X", "I go downstairs.", "I leave.", "I wander off.", unknown destination | no move |
| | Unreachable destination (remote docks) | blocked, with a "has not arrived" note |
| | Carry: helping, supporting, an ambiguous pronoun, negated or modal carry | no carry |
| | "looks toward the door", "seems ready to leave", "says he might leave", "hesitates", "starts toward the door", quoted order | no departure |
| **Full turns** | **B:** state moves; draft clean | ✔ |
| | Unsupported narrated move | `uncommitted_movement`, then revision; state unchanged |
| | **C:** Nicco moves, Brenna stays; her narrated following is flagged | `uncommitted_movement` and `absent_participant` |
| | **D:** Maren moves with Nicco; nobody else moves | ✔ |
| | **O:** an authored NPC narrated leaving is flagged; a created NPC leaving is authorized only from completed evidence | ✔ |
| | **Y:** down and back keeps everyone where state put them | ✔ |
| **Property** | Determinism across repetition; command order in the projection | ✔ |

## H. Duplicate-captive reproduction

Test `h5_duplicate_captive_purchase_regression` uses the **exact recorded H5 soak narration** (`H_late_naming` run 6, turns 0 and 1). The recorder truncated each turn at 400 characters, so the cut-off price sentence gets one marked completion, and the outcome is asserted identical for every tested ending.

**Before the fix**, the purchase "Done. *pays him and takes the key*" produced `register_character, set_legal_status, transfer_person` for `campaign_character_r3_man`.

## I. Identity root cause

The trace runs: scene reading → narrated captives → target resolution → promotion → registration → legal transfer.

1. **Narrated captives.** Turn 0 narrated "a thin man … his head against the bars" (`narrated:man`) beside the pre-registered, enslaved Brenna.
2. **Price talk.** Korvin's line "looked Nicco over **the way a man** sizes up a horse he's not sure he wants to **sell**" counts as price talk because of "sell". `refersTo` accepted "the way a man" as a reference to "the man", because the modifier slot accepted the article "a".
3. **Where Brenna stopped being considered.** `resolveTarget` picks a subject by player reference, then by price talk, then by fallback. Its own comment says unnamed descriptions never compete with a persistent candidate, but that rule was applied **only** in the fallback pool. The offer step selected the unnamed narrated "man" over the persistent Brenna, and `purchaseNarrated` promoted and bought him.
4. **A second pre-fix wrong-identity case**, found by matrix D: "another woman" was not recognised as a person reference at all ("another" was missing from the determiner lists). The captivity marker attached to Brenna, and the purchase bought Brenna at the price quoted for the other woman.

## J. Transaction-subject repair

The repair uses structural evidence only. There is no appearance or fuzzy matching and no model.

**`refersTo`:** modifiers between the determiner and the noun cannot include another determiner, so similes no longer count as references.

**Determiners:** "another" now counts as a determiner in captive detection.

**Alias rule (`aliasOf`, person-transactions.ts).** An **unnamed** narrated description beside a persistent purchase candidate is an alias of that candidate unless there is positive distinctness evidence:

- a marker in the scene or the player's words: "another / other / second / third / different <noun>"; or
- an established sex the noun contradicts. Sex comes from a declared profile, authored sex, or narration's own pronouns for that person.

**How an alias resolves:**

- It resolves to the one persistent candidate tied to the trade, meaning named in the scene narration or the player's words.
- With no single tied candidate it is **ambiguous**, so the purchase fails closed: no guessed person and no registration.
- Candidates are de-duplicated by identity, so a description and its persistent person never count as two.

**What is not changed:** names are never merged, and a named narrated person keeps competing as before.

Atomicity, funds, papers, provenance, the seller and household neutrality are unchanged. `register_character` happens only for a genuinely distinct subject.

## K. Identity regression matrix

All pass.

| Case | Expectation | Result |
|---|---|---|
| A | Existing unnamed persistent captive, generic narration | same ID ✔ |
| B | Named captive, appearance wording varies ("auburn-haired", "dark-haired"; swapped adjectives) | same ID ✔ |
| C | "the woman" | same ID ✔ |
| D | "another woman" / "the other woman" | new person; Brenna untouched ✔ |
| D′ | "the man" with Brenna established female | new person ✔ |
| E | Two persistent captives plus a generic reference | ambiguous, no commands ✔ |
| F | Two distinct people named Brenna | stay two IDs ✔ |
| G | Unnamed captive bought, then self-named | same ID gets the name ✔ |
| H | Save/load after purchase | identity, holder and ledger preserved ✔ |
| I | Seller | stays ✔ |
| J | Household | no membership ✔ |
| Root cause | Simile | not a reference ✔ |
| Determinism | Registration order of unrelated characters | same subject ✔ |

## L. Deterministic validation

**Commands:**

- `npm run typecheck`: pass.
- `npm test`: **1219 tests, 1215 pass, 0 fail, 4 todo**.
- `npm run test:playthrough`: **25/25**.

**Covered by the full suite:** movement parser, city travel, location continuity, narrated promotion, person transactions, ownership, identity continuity, evidence authorization, narration audit, H2 golden and invariants, H3 knowledge / context / retrieval, H4 persistence, H5 retry.

**Golden:** `tests/golden/turn-pipeline.json` is not modified. Pipeline order and stage boundaries are unchanged; the auditor only receives the already-computed `origin`.

**H1 TODOs:** all four are still reported as TODO with identical failing expectations; the todo count stays at 4. H5.1 did not touch their code paths: the possible-transfers audit, the condition subject, `trade_negotiation` grounding, and receipt grammar.

**Test changes:**

- New: `tests/h5-1-live-findings.test.ts`.
- `tests/language-gates.test.ts`: purely additive. It gains the new gate's reference literal and its locked matrix row (`.XX.........X.XX.....XXXX.`).

No existing assertion was changed.

## M. Focused live validation

`eval-live-h5 --runs 10`, production retry: B, C, D, O, Y, G, H, S. That is 140 turns at 100% success, with no retries needed. Estimated cost $0.426, plus about $0.01 for a 3-turn C probe.

| Scenario | Movement committed | Audit issues | Delivered (draft / revision / redacted) |
|---|---:|---|---|
| B | Nicco 10/10 | player_agency 2 | 8 / 2 / 0 |
| C | Nicco 10/10; Brenna 0 (not forced) | absent_participant 8 (narrated following caught) | 2 / 7 / 1 |
| D | Nicco 10/10; Maren 10/10 | player_agency 2, uncommitted_condition 2 | 6 / 2 / 2 |
| O | none (correct) | none | 10 / 0 / 0 |
| Y (down / back) | Nicco 10/10 and 10/10 | uncommitted_condition 6, player_agency 1 | 13 / 4 / 3 |
| G / H | purchases 13/20 committed | no registration, no unexpected commit; 1 uncommitted_departure (Korvin, new authored-NPC rule) | — |
| S | — | asserts_uncommitted_transfer 10 (unchanged behaviour) | 0 / 9 / 1 |

**Purchase narration** matched state in every sample: "She's yours" appears only with a committed `transfer_person`, and "we didn't settle on a number" only without one. One stale purchase claim (H 3.3) was caught and revised.

**Identity:** no wrong identity and no duplicate person.

**Secrets:** sentinel 0.

**Note on C:** the new `uncommitted_movement` NPC rule did not fire live. The pre-existing `absent_participant` rule caught the same divergence first, because Brenna is absent from the hall Nicco moved to, and the revision passed.

## N. Before / after metrics

Rates are for the same scenarios (B, C, D, O, Y, G, H, S).

| Metric | H5 | H5.1 |
|---|---:|---:|
| H5 movement phrases with explicit tested semantics | 0 / 5 | 5 / 5 |
| H5 phrases that move Nicco (B, Y, C) | 0 / 3 | 3 / 3 |
| D phrase moves Nicco and the carried person | no | yes |
| Live movement commits where expected | 0 / 99 | 50 / 50 |
| False-positive movement (live O, G, H, S; deterministic negatives) | 0 | 0 |
| Delivered narration contradicting location (detectable) | unaudited | 0 |
| Duplicate-purchase repro (exact narration) | wrong person bought | Brenna bought |
| New registrations in purchase scenarios (live) | 1 / 30 | 0 / 20 |
| Ambiguous purchases refused (matrix E) | n/a | yes |
| Same-ID late naming / same-name-distinct preserved | — | yes / yes |
| Live success | 99.6% (250) | 100% (140) |
| Audit issue / reconciliation rate | 18.1% | 26.4% |
| Redaction | 3.2% | 5.7% |
| player_agency incidence | 6.4% (16 / 250) | 5.7% (8 / 140) |
| B player_agency | 8 / 20 | 2 / 10 |
| Tests | 1196 / 1192 / 0 / 4 | 1219 / 1215 / 0 / 4 |
| Replay | 25/25 | 25/25 |

**Why reconciliation rose.** The reconciliation rise is not a regression: now that Nicco actually moves, narration that brings people along is detected (C `absent_participant` 8/10). Y also shows more `uncommitted_condition`, an existing check unrelated to movement. H5.1 did not tune the narrator or prompts.

The drop in `player_agency` in B (40% to 20%) is consistent with movement fixing a source of agency issues. The sample is small, so it is not claimed as significant.

**Intended behaviour changes (12, all tested):**

1. The bounded first-person movement grammar.
2. "Let's go to X" moves Nicco.
3. Asterisk movement accepts downstairs / upstairs.
4. Unknown destinations in the new forms are silent, not errors.
5. Carry covers present authored NPCs.
6. Carry pronouns resolve to a single antecedent.
7. The follow evidence accepts a stairway leg.
8. The departure evidence accepts stairway exits.
9. The `uncommitted_movement` audit kind, with outcome lines.
10. `uncommitted_departure` covers authored NPCs.
11. The `refersTo` determiner boundary.
12. "another" as a person determiner, plus the purchase-subject alias rule with fail-closed ambiguity.

**Unintended behaviour changes: 0.** The full suite is unchanged apart from additive tests.

## O. Remaining debt

1. **Authored-NPC following and departure are not representable.** Brenna (authored) can never follow Nicco, and Gerome can never leave, through narration. The audit keeps the prose consistent, but players asking an authored NPC to come along will see them stay. Deciding whether authored NPCs may move by narration is a design decision, not a repair.
2. **The `uncommitted_movement` NPC rule's live coverage is unmeasured.** It did not fire in 140 turns; the existing absent-participant rule caught the C divergence first. Nicco-movement contradictions did not occur live after the fix.
3. **Reconciliation and redaction remain above target** (26.4% / 5.7% on these scenarios), driven by narrated co-movement and pre-existing condition checks. This is narrator-quality work.
4. **"What should I call you?"** is not among the name-question forms, so a bare "Brenna." reply is a weak name. This is pre-existing, out of scope, and noted while building test G.
5. **The movement grammar is intentionally narrow.** For example, "Brenna and I go down to…" and "we go down to…" do not move Nicco.
6. **The four H1 TODOs are unchanged.**

## P. H6 readiness

**Ready.** Both critical live defects are repaired, with deterministic regressions and live confirmation (movement 50/50, wrong identity 0). H6 can rescore with:

- the H5 provider evidence;
- the H5.1 continuity evidence;
- the debt listed above, especially authored-NPC movement and narrator reconciliation rates.

No official score is issued here.

CALDREVAN HARDENING H5.1 COMPLETE
