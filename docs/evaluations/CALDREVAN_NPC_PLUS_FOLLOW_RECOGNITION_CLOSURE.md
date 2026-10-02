# CALDREVAN NPC+ follow-recognition closure

**Date:** 2026-10-02. No commit or push. **No paid API calls** (everything below is offline).

**Inputs:**

- the [live follow-choice validation](CALDREVAN_NPC_PLUS_FOLLOW_CHOICE_LIVE_VALIDATION.md);
- the [Pass 10 report](CALDREVAN_NPC_PLUS_PASS_10_OVERNIGHT_ASSURANCE.md);
- the [architecture after Pass 10](CALDREVAN_NPC_PLUS_ARCHITECTURE_AFTER_PASS_10.md).

**Scope:** recognition and audit only. The narrator prompt, invitation detection, authorization and movement authority are unchanged.

## A. Exact live failures

Seven of the nine production FOLLOW drafts from the paid probe were missed by the grammar.

| Draft | Live sentence (verbatim) | Before |
|---|---|---|
| inv0 s0 | "Maren follows at her own pace, arriving at the foot of the stairs a moment after Nicco." | redacted (`absent_participant`) |
| inv2 s0 | "Maren comes down the stairs a few moments after him, hands at her sides, saying nothing." | redacted |
| inv2 s1 | "Maren appears at the bottom step, pausing there with one hand on the wall." | redacted |
| inv0 s2 | "Maren comes down the stairs a moment later, her gaze moving across the hall — the table, the hearth, the quiet corners — before settling somewhere near the floor." | redacted |
| inv0 s3 | "Maren's footsteps follow behind him on the stair — unhurried but close. She reaches the hall floor a few paces after him and stops…" | **delivered with Maren in the hall while state kept her upstairs** |
| inv0 s4 | "Maren came down a moment after, catching up near the foot of the steps." | redacted |
| inv2 s4 | "Behind him, footsteps follow — lighter, unhurried — and Maren appears at the bottom of the stair, pausing just inside the hall." | redacted |

## B. Grammar changes

All changes are in `src/turn/character-movement.ts`.

**1. Manner tails** (direction-free, extending the existing implicit-follow tail):

- at her / his / its / their own pace;
- a pace or two behind;
- a few paces / steps / strides behind or back;
- a few moments later or after;
- on the stair(s) / steps;
- behind her.

The verb matcher is unchanged. The tail must still be manner only: no place, no object, no bare "later".

**2. DOWN-only forms**, reachable only when Nicco's route is a proven pure descent (section C):

- `(comes|came) down [the stairs|steps|staircase]` followed by a manner tail ("a moment later", "after him", "a few moments after him");
- `(appears|appeared) at the (bottom|foot) (step | of the stairs/steps/staircase)` followed by a manner tail.

These forms also get every existing constraint:

- the shared `follow_not_done` gate on the whole clause, and `disqualify` plus the retraction list on what trails the phrase;
- an active NPC+ only, who started at Nicco's origin and is not already at the arrival;
- Nicco moved this turn, and the destination is **always Nicco's same-turn arrival**.

The no-other-place check after a dash is scoped to a dash that directly ends the follow phrase. It applies to the new forms only, so "…a moment later, her gaze moving across the hall — …near the floor" is accepted, while "comes down the stairs — into the cellar" is rejected. The Pass 9 and 10 forms keep their exact dash rule.

**3. Footstep-led form:** "Maren's footsteps follow behind him on the stair" is now covered by the tail extension. The subsequent "She reaches the hall floor" needs no coreference: once the move commits, Maren is legitimately in the hall.

## C. Direction-resolution semantics

`src/world/vertical-direction.ts` provides `routeDirection(world, origin, arrival)`, which returns `UP | DOWN | OTHER | UNKNOWN`.

**Why not a schema field:** the world has no floor metadata. Adding a field to canon would change `datasetIdentity`, the content hash, so every existing save would be refused with `dataset_mismatch`. That was rejected.

**What it uses instead:**

1. **Nicco's resolved route** (`findRoute`): the exact edges traversed.
2. **Each edge is classified in isolation:**
   - an edge is vertical only if `kind: stairs`, or its own authored description names a stair (stairs, staircase, stairwell, ladder, hatch, upstairs, downstairs);
   - its direction comes from a closed word set: descend… / down / below / lower for DOWN, ascend… / rise… / up / above / upper for UP;
   - **both or neither is UNKNOWN.**
3. **The reverse edge, when present, must state the opposite direction;** otherwise UNKNOWN.
4. **The route is DOWN only if every edge is a vertical DOWN edge.** Any lateral edge makes it OTHER, and an unknown edge makes it UNKNOWN.

Location names ("basement", "upper floor") are never consulted.

**Verified on real canon:**

| Edge or route | Result |
|---|---|
| Heartstone F1→LR | DOWN |
| LR→F1 | UP |
| LR→U1 | DOWN |
| U1→LR | UP |
| LR→square (door) | OTHER |
| F1→U1 (two-stair route) | DOWN |
| LR→courtyard | OTHER |
| Fixture room→hall / hall→room | DOWN / UP |
| Fixture room→remote (no route) | UNKNOWN |

UNKNOWN and OTHER fail closed: the DOWN-only forms are simply not tried.

## D. Audit consistency repair

The change is in `src/turn/narration-audit.ts`, `movementIssues`. The check runs only when Nicco moved this turn. It flags an `uncommitted_movement` for a **pronoun-led arrival** sentence when all of these hold:

- the sentence uses an arrival predicate: reaches (not "reaches for / out / toward…"), arrives, enters, steps into, catches up, joins him;
- it **immediately follows** a sentence led by **exactly one** active NPC+ whom Nicco left behind, with no other person named in that sentence;
- that NPC+ did **not** move.

`absent_participant` already covers name-led acts, so it is unchanged; this only closes the measured pronoun-continuation gap.

**Tested:**

- An invalid follow ("Maren's footsteps *might* follow…") followed by "She reaches the hall floor…" leaves Maren upstairs, and the arrival sentence is flagged.
- The valid version commits the move and is clean.
- Nicco's own "He…" sentences are never attributed.
- An ambiguous pair ("Brenna and Maren watch… She reaches for a cup") is never attributed.

## E. 9/9 live replay result

`src/dev/follow-choice-e2e.ts` replays all 9 production follow drafts through the real turn pipeline (mock providers returning the recorded draft) in three controller modes:

- **A:** no controller proposal;
- **B:** a correct `move_character`;
- **C:** a wrong destination (`test_remote`).

Results are in [`pass10/follow-recognition-closure.e2e.json`](pass10/follow-recognition-closure.e2e.json).

| Metric | Before | After |
|---|---:|---:|
| Recognized | 2 / 9 | **9 / 9** |
| Exactly one committed move (A / B / C) | 2 / 9 each | **9 / 9 each** |
| Exactly one `moved` history entry | 2 / 9 | **9 / 9** |
| Correct destination (Nicco's arrival) | 2 / 9 | **9 / 9** |
| Audit-consistent (no movement or absence issue; delivered text matches state) | 2 / 9 | **9 / 9** |

**Mode C:** the wrong-destination proposal is rejected (`insufficient_confirmation`), and the narration-derived proposal to the hall is authorized. That is the Pass 10 repaired path, still green.

One draft (inv0 s4) is also redacted for an **unrelated** `player_agency` issue: Nicco's own embellished descent sentence. The delivered text keeps "Maren came down a moment after, catching up…", consistent with the committed move.

**Regressions on the exact production state:**

| Narration | Movement |
|---|---|
| Invitation alone | none |
| "Maren stays." | none |
| "Maren hesitates." | none |
| "No footsteps follow." | none |
| "Maren's eyes follow him." | none |
| "Maren follows his reasoning." | none |
| "Maren follows him down." | exactly one |

## F. Pass 10 fuzz and real-prose regression

| Corpus | Size | Before | After |
|---|---|---|---|
| Generated grammar corpus (`pass10-grammar-report`): positives (name, two NPC+, pronoun) | 14,784 | 0 false negatives | **0 false negatives** |
| Generated grammar corpus: must-fail-closed and negatives (two-women pronoun, name, pronoun, non-mover) | 6,888 | 0 false positives | **0 false positives** |
| Ornate forms | 16 | 3 recognized | **4 recognized** (new: "Maren came down the stairs after him", correct for a descent) |
| Real prose replay (`pass10-replay-live`, Pass 8 and 9 live sentences) | 1,964 sentences | 5 detections | **6 detections** |

The new real-prose detection is "A moment later Gerome's heavy tread follows on the stairs… before stepping inside and standing still". It is a completed follow, so a **true positive**. In its original Pass 9 turn, Gerome was already at Nicco's arrival in state, so even there it would correctly have produced no move. **New false positives: 0.**

**Required negatives** (new test file; all move nobody):

- "comes down later";
- "came down the stairs yesterday";
- might / usually / does not / refuses to come down;
- "comes down…, then stops";
- "comes down… to the cellar" and "— into the cellar";
- "appears at the top", "at the window", "near the table";
- "appears… later" and "appeared… yesterday";
- "eyes follow him down", "gaze follows";
- "follows his reasoning";
- almost / usually / would / refused / yesterday / "will follow later";
- footsteps with no completed movement;
- ornate stair prose;
- every DOWN form when Nicco moved **UP**;
- no Nicco movement;
- an NPC+ already at the arrival;
- an authored non-NPC+.

A direction-free manner form ("follows at her own pace") still works when Nicco moves up.

## G. Remaining intentional false negatives

The following stay unsupported, by design: fail closed, and the audit may revise the narration.

- 12 ornate forms from the Pass 10 list, for example:
  - "Heavy footfalls marked Maren's descent";
  - "Maren joined him a moment later";
  - "Maren hurried after him";
  - "Maren fell in beside him";
  - "Maren's steps sounded on the stairs behind him";
  - "He heard Maren on the stairs behind him";
  - "Maren chose to follow him".
- "Comes down" and "appears at the bottom" whenever Nicco's descent is not provable: a lateral, mixed or unknown route, or a non-stair edge.
- Pronoun-led follows with two eligible women (D-11).

None occurred in the 9 production follows. Per the brief, nothing was widened for them.

## H. Full validation

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | PASS | **PASS** |
| `npm test` (total / pass / fail / todo) | 1603 / 1599 / 0 / 4 | **1661 / 1657 / 0 / 4** (58 new; same 4 TODOs) |
| `npm run test:playthrough` | 25/25 | **25/25** |
| H2 golden | byte-identical | **byte-identical** (no golden file changed or regenerated) |
| Pass 10 suites; locked gate matrix | green | **green** (no gate changed) |
| `runTurn` | 164 | **164** (file untouched) |

**Changed:**

| File | Change |
|---|---|
| `src/turn/character-movement.ts` | Grammar |
| `src/turn/narration-audit.ts` | Pronoun-arrival check |
| `src/world/vertical-direction.ts` | New |
| `tests/follow-recognition-closure.test.ts` | New |
| `src/dev/follow-choice-e2e.ts` | Mode C added |

## I. NPC+ freeze recommendation

Checked against the freeze criteria:

| Criterion | Status |
|---|---|
| **Authority** | Unchanged and correct. Moves need same-turn evidence for that mover and that destination; nothing moves automatically. |
| **Movement** | Correct on all measured live forms (9 of 9); 0 false positives across about 21,600 generated cases and 1,964 real sentences. |
| **Follow choices** | Preserved end to end. The narrator's free choice (36% follow in production, no false-absence claims) now commits, or stays, consistently with the delivered text. |
| **Reflection** | Bounded and non-authoritative (unchanged). |
| **Persistence** | Safe (save format and dataset identity untouched). |
| **Context** | Bounded and fail-closed (the D-04 ceiling rejects a turn rather than corrupting it). |
| **Known correctness defects in ordinary measured play** | None remaining. The one measured divergence (narration has the NPC+ in the hall, state upstairs) is fixed and guarded by an audit check. |

Remaining debt is non-blocking and fail-closed:

- ornate follow phrasings;
- D-13: a revision may omit a committed move, but state stays correct;
- reflection usefulness not yet seen organically (D-09);
- redaction rates (D-19);
- the context ceiling (D-04).

**NPC_PLUS_READY_TO_FREEZE**

CALDREVAN NPC+ FOLLOW RECOGNITION CLOSURE COMPLETE

Tests: 1661 / 1657 / 0 / 4
Replay: 25/25
Golden: byte-identical
runTurn: 164

Live follow corpus:
Recognised: 9 / 9
Committed exactly once: 9 / 9 (×3 controller modes)
Audit consistent: 9 / 9
False positives: 0

VERDICT:
NPC_PLUS_READY_TO_FREEZE

NO COMMIT
NO PUSH
