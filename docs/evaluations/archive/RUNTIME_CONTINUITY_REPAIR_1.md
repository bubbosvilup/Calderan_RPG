# Runtime continuity repair 1 and the move to GLM 5.2

2026-09-30. This pass fixes the engine failures found in [Long-Form Narrator Trial 1](CALDERAN_LONG_FORM_NARRATOR_TRIAL_1.md), then switches the production narrator from Kimi K2.5 to GLM 5.2 on Z.AI. The controller model (`deepseek/deepseek-v4-flash-0731:nitro`) and its routing are unchanged. The historical evaluation reports were not modified. Nothing is committed or pushed.

## A. Scope

**Baseline.**
- Commit: cbfb706.
- Source hash (`src/` + `data/`): 21e7eda5c434….
- Gates: typecheck PASS, 849/849 tests, 25/25 playthrough.

**What this pass fixed** (engine failures from the long-form trial):
- The recent-conversation window held only 4 turns.
- The patron Dell was narrated as leaving but stayed in state, so he "came back" in later turns.
- The audit softened the grab and shove that the player wrote.
- Invented prices, serving staff, a room "already paid" and legal procedure all reached the player.

**What it did not touch.** No change to the world model, canon or YAML, NPC portrayal, retrieval, or the controller model or routing. No memory LLM and no knowledge graph were added.

**What it did add.**
- Small deterministic mechanisms: three audit helper modules and one departure grammar.
- One new controller command, `leave_scene`. The spec requires it, and the controller's policy text gained one line describing it.

## B. RecentConversation

`src/turn/recent-conversation.ts`:
- **Window.** 12 completed exchanges (was 4) under a 16,000-character serialized budget (was 8,000).
- **Eviction.** The oldest complete exchange goes first. An exchange is never cut or reordered, and one exchange larger than the whole budget is not stored at all.
- **What is stored.** Only player input and the narration that was actually delivered. Drafts, rejected revisions, audit output and controller debug never enter history.
- **Failed turns.** A turn that fails after narration now stores only what was shown, usually nothing. Before, it stored the raw draft, which never reached the prompt but was still retained. After the live run, the turn limit was changed to count completed exchanges only, so a failed turn no longer takes a completed turn's slot (see H.3).
- **What the narrator receives.** Unchanged: dialogue-focused replay, bounded and subordinate to current state. No summaries.
- **Tests:** 12-turn retention; turn 13 evicts the oldest; budget pressure evicts oldest complete turns with no truncation; only delivered text is stored (a failed turn stores `""`); a failed turn does not displace a completed one; campaign isolation; the prompt carries 12 turns in exact order.
- **Existing test changed:** `bounded recent messages exclude failures…` expected a failed exchange to evict a completed one. That is the old behaviour, which the spec rules out. It now asserts 2 completed exchanges, still with no failures in the prompt.

## C. Temporary participant departure

- **Representation.** A new campaign command, `leave_scene { character_id }`, in the types, validation and `characters.ts`.
  - It applies only to a **created** character that is in the player's current location and not dead.
  - Committing it clears the character's `current_location`. The record, profile, conditions and history all stay.
  - Canonical characters are rejected. Re-entry requires an authoritative `move_character`; the controller cannot propose one.
- **Flow.** Unchanged: narration → controller proposal → evidence → authorization → prepare → audit → commit.
  - `leave_scene` is in the controller schema, and the policy has one line saying threats, orders, movement toward the door and negated departures are not departures.
  - Authorization requires the target to be present and created in the projected state, and the narration evidence (`TurnEvidence.departures`) to confirm the exit. Prepare applies it at the base revision, which rejects a stale revision.
- **Evidence** (`src/turn/scene-departure.ts`). A departure counts only when it is a completed exit whose actor is unambiguous: named, or a pronoun that resolves to the nearest named subject.
  - Counted: "walks out", "leaves the inn", "heads outside", "disappears into the street", "is gone", "shouldered through the door into the street", "the door banged shut behind him".
  - Rejected (all tested): an order or invitation to leave, or anything in dialogue; a threat, intention, conditional or negated exit; "turns for the door", "starts toward the door"; "Dell's patience is gone", "stumbles out of his chair"; a canonical character's exit.
- **Audit additions.**
  - `uncommitted_departure`: an exit narrated with no committed `leave_scene` and no player-written exit. The revision is told the person is still present.
  - `absent_participant`: a created character who has left and is then narrated as present again. Remembering the exit ("where Dell had been sitting") is allowed.
- **Regression covering the trial failure:** turn N commits the exit; at N+1 the scene state lacks Dell; at N+2 the narrator's list of people present lacks him; "Dell Harrow sat hunched and brooding" is flagged.
- **Existing departure handling is unchanged.** The ephemeral participants a player addresses (`scene_npc_n`) keep their narration-only departure and expiry rules. They are session-local and never persisted.

## D. Player-authored event authority

- **Module:** `src/turn/player-authored-events.ts`, holding `PlayerAuthoredEvent {actor_id?, target_id?, action_class, evidence_quote, negated, condition?, severe?}`.
  - Built only from the *current* input's action text: text in asterisks, or an input written entirely in third person.
  - Action families: grab, shove, strike, explicit injury, spill/knock-over, departure.
  - "The man"/"the woman" resolves to the only present character of that sex. When someone other than Nicco acts, "him"/"his" means Nicco.
  - Negated, hedged, conditional and threatened acts are recorded with `negated: true` and authorize nothing.
- **Order of authority in the audit:** (1) an explicit player-written fact this turn; (2) committed state or canon; (3) an authorized state change; (4) momentary texture; (5) anything else is unsupported.
- **In practice:**
  - A restated grab or shove is removed before the restraint check. "Pins", "drags", "arrest" and similar still trigger it.
  - An authored injury term (such as a cut) covers only its own condition tag.
  - A new check for severe consequences flags a broken bone, unconsciousness, death, severing or permanent damage unless the player wrote it.
  - Objects falling or spilling ("the latch fell back", "the cup falls") are no longer read as a person being knocked down. This was the Gemini T17 false positive.
- **Revision request.** Now lists `PLAYER-AUTHORED (happened exactly as written…)` lines, and no longer calls the authored act unrecordable.
- **Narrator prompt.** Lists other people's player-written acts as "happens exactly as written; do not soften or escalate".
- **Tests use the exact trial inputs and drafts:**
  - Now pass: "Dell's grip tightens on Nicco's arm…", "The shove caught Nicco square in the chest…", spilled liquid, an authored cut.
  - Flagged: wrist breaks, knocked unconscious, hand severed, pinned to the floor, a knockdown nobody wrote, a negated grab, and narration "Dell has left" after the player wrote only "Dell moves toward the door".

## E. Grounding guards (`src/turn/grounding-audit.ts`, plus the presence check)

| Guard | Caught | Allowed |
|---|---|---|
| Exact price (number + currency word) | "Three coppers for the bowl", "two copper bits", "Four coppers", "a copper for the stew" | Same amount in canon, state, retrieval or player input; "cheap", "fair", "modest"; "a few coins"; "two copper pots" |
| Staff acting in the scene (issue kind `absent_participant`) | serving woman brings food; the inn's bouncer; one of Jessa's employees; "one of the serving staff" | Other patrons, "someone at a distant table", staff the player wrote, participants with that role |
| Fabricated prior event | "Room's paid through tonight", "You've already paid for the week", "You told me you were a soldier" | "As we agreed…" or "You told me you worked with herbs" when history supports it; questions and denials |
| Legal/procedural claim | "drunk and disorderly", "minor assault", "file a complaint", "the Guard does not crowd the cells unless…", "holding cell at the post", "three nights in a cell" | "enough to bring the Guard into it", "I can remove him from the inn", "doesn't warrant further action" |

- **Prompt contract.** Four grounding sentences were added: prices, staff, prior events, law. The rest of the narrator contract is unchanged.
- **Tuning.** The legal guard is deliberately narrow and prefers missing a case to damaging dialogue.
- **Tested against the trial text.** The delivered GLM T16 text is now flagged for both the invented price and the invented procedure.

## F. Production narrator transition

This was done only after the repair gates passed.
- **Default model.** `DEFAULT_NARRATOR_MODEL = "z-ai/glm-5.2"`.
- **Routing.** `NARRATOR_PROVIDER_ROUTING` pins it to `{order: ["z-ai/fp8"], allow_fallbacks: false}`.
- **Unchanged settings.** Reasoning disabled (unchanged default), 384-token output cap, no sampling changes.
- **Kimi** (`KIMI_NARRATOR_MODEL`) stays available as an unpinned override.
- **Gemini** (`GEMINI_NARRATOR_MODEL`) is a Vertex-pinned manual alternative only. It is never an automatic fallback.
- **Evaluation harnesses** can pass `provider: null` to set routing themselves.
- **Controller.** The same model and routing. The request body is unchanged apart from the policy line and schema entry for `leave_scene`.
- **Tests.** Two existing default-model tests now assert GLM and the pin. A new test covers the Kimi and Gemini overrides and the 384 cap.

## G. Deterministic gates

| Gate | Result |
|---|---|
| Typecheck | PASS |
| Full test suite | 872/872 PASS (849 before; 22 new in `runtime-continuity-repair-1.test.ts`, 1 new override test) |
| Playthrough regression | 25/25 PASS |
| Targeted matrix items 1–24 | All covered and passing |

No existing test was weakened. Four existing test files changed: two default-model assertions, one pin assertion, and the failed-exchange expectation described in B.

## H. Live 18-turn validation

- **Run.** One fresh continuous campaign using the production defaults and the unchanged DeepSeek controller.
- **Input.** The exact player script and scaffold from Long-Form Trial 1, copied unchanged.
- **Artifacts:** [runtime-continuity-validation-1-2026-09-30T13-20-13Z](runtime-continuity-validation-1-2026-09-30T13-20-13Z/manifest.json). Harness: [runtime-continuity-validation-1.mjs](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/runtime-continuity-validation-1.mjs).
- **Routing.** Every narrator request was sent with the pin and was served by Z.AI.
- **Source hash** during the run: 28275fee315f… (unchanged before and after).

**H.1 The questions**
- **A. Herb conversation.** Available. At T18 the window held T6–T17, including the T7 plant offer; a 4-turn window would have held only T14–T17. GLM used the herbs at T7 but did not answer the T18 "plant offer stands" line. Available is not the same as used.
- **B/C. Dell's departure.** GLM never narrated Dell leaving in this run, so the departure path was exercised live only through rejections, both correct:
  - T13: the controller proposed `leave_scene` from "turns toward the door"; it was rejected with `rejected_insufficient_confirmation`.
  - T18: the controller proposed `leave_scene` for Doran, a canonical character; it was rejected with `rejected_reference_invalid`.
  - Dell stayed present in state and in the narration through T18, with no contradiction; the A8 anchor held. The trial's return-after-leaving failure did not occur. The full leave, absent and no-return cycle is proven by the deterministic tests.
- **D. Grab and shove.** Both were preserved as written, with no revision:
  - T11: "Dell Harrow's hand closed on Nicco's arm with dockworker's grip."
  - T13: "Dell's palm catches Nicco square in the chest."
- **E. Invented details.** Before → after: prices 2 → 0 (trial T2, T16); staff 2 → 0; prior-payment claims 1 → 1, caught and revised at T18 ("Dinner's paid for"); formal legal procedure 1 → 0. Doran judged plainly ("Nobody's being hauled off tonight").
- **F. Cost.** See the table below: prompt tokens rose moderately and latency was essentially flat.
- **G. New problems.** No state-coherence or knowledge regression, and no delivered agency slip. Findings:
  - **T15: the narrator hit the 384-token cap** (`finish_reason: length`), so the turn failed visibly with no state change.
    - Nicco's account to Doran was lost, and Doran's T16 summary rested on earlier dialogue.
    - It is not an infrastructure failure, so it was not retried.
    - The mean completion length is unchanged (234 → 231 tokens). The maximum rose from 289 to 362, with 2 turns over 300.
  - T16 misspelled the patron's name as "Dellan Harrow".
  - Minor inventions outside this repair's scope:
    - T6: the inn's history ("already an inn when I took it over");
    - T3: a location answer ("craft streets north of the market district");
    - T4: a schedule claim ("Weekends are busier").
  - T14: Jessa's account to Doran left out the grab.
  - Style notes only: many em-dashes and counter-wiping beats, as in the trial.

**H.2 Performance** (before = trial GLM run with the 4-turn window)

| Metric | Before | After |
|---|---|---|
| Narrator prompt tokens, mean / max | 3,706 / 5,085 | 4,272 / 5,476 (T1 3,190 → 3,415 is the added contract text alone) |
| Mean turn latency / narrator time / time to first token | 7.9 s / 6.3 s / 6.3 s | 8.0 s / 6.5 s / 6.5 s |
| Max history turns in the prompt | 4 | 12 |
| Max serialized RecentConversation | ≤ 8,000 | 15,120 (budget 16,000); max prompt 25,950 characters |
| Intervention rate | 11% (2/18, both false positives) | 6% (1/17 completed turns) |
| Controller failures, timeouts, normalizations, omissions | 0 | 0 |
| Audit false positives | 2 (grab, shove) | 1, arguable: T18 "Dinner's paid for" reads as Jessa covering the meal |
| Audit false negatives seen | departures, prior payment, water/ale, prices, legal claims | T13 "Jessa watches him go" (Dell stays), T6 history, T3 location, T4 schedule, T18 Doran's canonical exit |

**H.3 Change after validation.** The live run showed that a failed turn (T15) took one of the 12 history slots: T16–T18 saw 11 completed turns. The turn limit now counts completed exchanges only (B). This was verified by the deterministic tests, not by a second live run.
- Final source hash: 6cd4e5585579….
- Gates re-run: 872/872 tests, 25/25 playthrough, typecheck PASS.

## I. Remaining limitations

1. **The 384-token cap versus GLM** (T15). One in 18 turns failed visibly. The cap is kept as the brief requires, but at this cap GLM will occasionally fail a turn. Options are a small cap increase or tolerating the truncation; that decision belongs to the owner.
2. **Canonical NPC exits have no representation.** Doran's T18 exit, like Jessa's, keeps them present in state. `leave_scene` covers only created characters.
3. **Departure grammar false negatives.** "watches him go" and other implied exits are not read as departures, and indirect removals ("escorts Dell out") are not recorded. The grammar prefers a present-but-quiet patron over a wrong exit.
4. **Grounding guards are narrow on purpose.** Broader invention (inn history, locations, schedules) relies on the prompt contract and the existing checks. The guard for prior payments may flag a gesture made now ("Dinner's paid for", meaning covered).
5. **History is available, not necessarily used.** A larger window lets the narrator reference earlier turns; it does not make it do so (T18 plant offer). No memory model was added.
6. **Live coverage.** The live departure cycle depended on GLM choosing to narrate an exit, and it did not. That path is verified offline only.

## J. Status

- **Delivered:** all five scope items, the full 24-item test matrix and passing gates. Production narrator: GLM 5.2 pinned to Z.AI, fallbacks disabled, reasoning off, 384 tokens. The controller model and routing are unchanged.
- **Live validation:**
  - Held up: player-written events, grounding, state coherence and cost.
  - Not seen live: the departure path. It is covered offline and shows no regression.
  - Needs a decision: the 384-token cap versus GLM output length (I.1).

The tree is left uncommitted for review.

RUNTIME CONTINUITY REPAIR COMPLETE

## K. Repair 1.1 — narrator output headroom

2026-09-30. A follow-up that only raises the narrator's output cap. Sections A–J above are unchanged historical results.

**What changed.**
- `NARRATOR_OUTPUT_TOKENS` in `src/dev/turn-services.ts` went from **384 to 512**.
- This is one global cap. Every narrator model gets it through `narratorConfig()`, including the Kimi and Gemini manual overrides; there are no model-specific limits.
- Everything else is unchanged: `z-ai/glm-5.2` pinned to `z-ai/fp8` with `allow_fallbacks: false`, reasoning disabled, and the DeepSeek controller.
- The bakeoff harness's own 384 setting (`BAKEOFF_REQUEST_POLICY`) is a historical record and is left as is.

**Tests.**
- The one assertion of the old cap now asserts 512.
- The production-default test also checks that the request body's `max_tokens` is exactly 512.
- Gates: typecheck PASS, 872/872 tests, 25/25 playthrough.
- Source hash: 67e7cfac5559…, unchanged during the live check.

**Targeted live check.** Artifacts: [runtime-continuity-repair-1-1-check-2026-09-30T13-52-53Z](runtime-continuity-repair-1-1-check-2026-09-30T13-52-53Z/manifest.json). Harness: [runtime-continuity-repair-1-1-check.mjs](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/runtime-continuity-repair-1-1-check.mjs).
- **Setup.** This reproduces the validation run's state after T14: Dell and Doran present at the Gatherer's Inn. It also replays the same delivered T1–T14 history through the coordinator's own RecentConversation: 12 turns, 14,563 characters.
- **Turns run.** The exact T15 input ("He grabbed my arm, spilled my drink and then shoved me. I didn't hit him back. She saw all of it."), then T16. One attempt each, and no retry was needed.

| Turn | Finish | Completion tokens | Prompt tokens | Delivered chars | Turn / narrator latency | Audit | Controller |
|---|---|---|---|---|---|---|---|
| T15 | stop | 358 | 4,951 | 1,552 | 9.7 s / 8.2 s | no issues, draft delivered | no proposal |
| T16 | stop | 318 | 4,958 | 1,336 | 8.9 s / 7.9 s | no issues, draft delivered | `leave_scene` rejected (`rejected_insufficient_confirmation`: "walk out" was an order in dialogue) — correct |

- **Result.**
  - GLM finished both turns normally, and every request carried the pin and was served by Z.AI.
  - T15 used 358 tokens, under both caps. This sample would not have hit 384; the 512 cap gives headroom for turns like the original failure.
  - The narration is longer than the run mean (1,005 characters) but still reads as one scene beat.
  - The T15 account to Doran is accurate, restoring the anchor lost in the validation run: grab, spill and shove, and Nicco kept his hands down.
- **Nothing new broke.** No state or audit regression, and no agency slip or invented price, staff or legal procedure.
- **Known limitation (I.3) observed, not fixed here.**
  - T15 narrates Dell "makes for the door … before the door swings shut behind him". The departure grammar resolved "him" to Doran, the last sentence led by a name, because "Dell's face darkens" is possessive and does not count as a subject. So neither the controller nor the audit recorded an exit.
  - State kept Dell present, and T16 narrated him still there. Narration, not state, was inconsistent across the two turns.
  - Per the brief, no tuning followed.

RUNTIME CONTINUITY REPAIR 1.1 COMPLETE
