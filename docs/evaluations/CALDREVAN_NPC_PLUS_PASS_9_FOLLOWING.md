# CALDREVAN NPC+ Pass 9: consent-preserving household following

**Date:** 2026-10-02. No commit or push.
**Inputs:** the [Pass 8](CALDREVAN_NPC_PLUS_PASS_8_ORGANIC_DEVELOPMENT_DISCOVERY.md), [Pass 3](CALDREVAN_NPC_PLUS_PASS_3_CONSOLIDATION_RECALL.md) and [Pass 4](CALDREVAN_NPC_PLUS_PASS_4_AUDIT_PRECISION.md) reports.
**Evidence:**

- `tests/npc-plus-pass-9.test.ts` (35 tests);
- the updated locked gate matrix in `tests/language-gates.test.ts`;
- an offline replay of the new grammar over all 120 Pass 8 drafts;
- a live re-measurement of **120 turns, complete** ([JSONL](h5-live/npcplus9.jsonl), [summary](h5-live/npcplus9.summary.json), [narration review](h5-live/npcplus9.review.jsonl)).

**Status: PARTIAL.**

- **Done:** every implementation and safety criterion is met and tested, and the full suite is green.
- **Not met live:** "a completed voluntary follow is recognized without explicit destination text".
  - The narrator wrote one follow, in the draft of errands turn 11: "Behind him, Brenna's uneven tread followed".
  - The new grammar missed it, because the clause opens with an adverbial ("Behind him,").
  - The audit then erased it, as designed.
- **Narrator:** it declined the other 5 invitation turns, often by claiming the invited NPC+ was absent (see G).

## A. Left-behind note change

The note is now built in `src/turn/follow-invitation.ts::leftBehindNotes` and called from the intent stage (`projectTurnIntent`), not from `runTurn`.

- **People not invited** (any character that is not an active NPC+, or an NPC+ who was not invited) keep the **byte-identical** pre-Pass-9 note: "X stays there… Someone comes along only if they themselves clearly follow him, narrated explicitly."
- **An explicitly invited active NPC+ that Nicco is leaving behind** instead gets a neutral choice:

  > Nicco leaves *Observation room* for *Main hall*. Maren was invited to come along and decides freely whether to follow him: do not assume either choice. If someone follows, narrate that completed choice explicitly; if someone stays, narrate that instead. Do not have Nicco bring or carry anyone.

The note never says "stays", "follows" or "wants to" (tested). An invitation alone moves nobody (tested end to end).

## B. Invitation semantics

`invitedFollowers(player_input, eligible, others)` is deterministic and sentence-scoped.

**Who is eligible:** only **active NPC+ that Nicco is leaving behind** on a turn where he moves.

**What counts as an invitation:** an explicit come-along phrase:

- come with / along / and / back / up / down;
- join me;
- follow me;
- accompany me;
- walk with me;
- keep me company;
- take my arm.

**What vetoes it:** the shared gate `invitation_not_offered`, built from shared cues:

- negation and contractions;
- if / unless / were to;
- suppose and imagine;
- other-day framing and recollection;
- threat;
- a new **COERCION** cue group: must, have to, or else, order, command.

**What is still an invitation:**

- modal requests ("Would you come with me?") and questions;
- consent phrasing ("…if you like", "if you want"), which is neutralized before the gate.

**Who is invited:**

1. NPC+ named in the sentence.
2. Otherwise, everyone eligible, for group words (anyone, everyone, either of you…).
3. Otherwise, the single eligible NPC+, but **only if the sentence names no other present person**. This fixes a bug found by the tests, where "Gerome, come with me" had reached Maren.

**Tested not to count:** "You must come with me", "…or else", "you have to come", "If Maren came with me…", "Yesterday I told Maren to come…", "I remember asking…", "don't come with me", "stay here", "Imagine Maren came along".

## C. Implicit-destination grammar

The change is in `src/turn/character-movement.ts` (`implicitFollows`, applied inside `narratedMovements`). A completed follow without a "to <place>" clause resolves to **Nicco's same-turn arrival** only if all of the following hold:

- Nicco moved this turn (origin ≠ arrival);
- the mover is an **active NPC+** (the new `followers` argument) and is **not already at the arrival**;
- the clause has one of these forms:
  - **subject-led:** name or pronoun, optionally a "rises and" / "hesitates, then" coordination, an adverb, or a lead-in ("A moment later,"), followed by follows / followed / trails / falls into step / comes after / descends after / climbs after / goes after / walks after;
  - **step-led:** possessive "Maren's (lighter) steps / footsteps / footfalls / tread" followed by follow / came after;
- the words after the verb, up to the first comma or conjunction, are **follow-manner only**:
  - him, after him, behind (him);
  - a step behind, close behind;
  - quietly, in silence;
  - down the stairs, downstairs, up, out.

  Anything else fails closed: "the conversation", "his reasoning", "the sound with her eyes", "him to the window";
- the whole clause passes the new shared gate **`follow_not_done`**: the cues of `movement_not_done` minus `later`, plus almost / nearly, refusal, recollection and other-day framing (yesterday, earlier, ago, last night, tomorrow).

There is no local negation regex, and no destination is ever inferred from geography. The explicit-destination patterns are unchanged and still take precedence.

The locked gate matrix gained two rows, each with an independent reference regex checked against the 1,200-probe corpus. One invariant was updated deliberately: `follow_not_done` joins `disqualify` and `refusal` as a refusal-aware gate.

## D. Proposal and authorization path

The pipeline is unchanged: narration → `character_movements` evidence → the controller's `move_character`, or the Pass 3 **derived** proposal when the controller omits it → **unchanged** `command-authorizer` (`authorized_narrative_confirmation` only with matching evidence) → `CampaignState` commit → a `moved` `PremiumHistoryEntry`.

Nothing is committed directly from evidence. A controller proposal plus the evidence yields exactly one move (tested).

**Audit consistency:**

- An authorized follow is never erased. The prepared snapshot places the NPC+ at Nicco's location, so `absent_participant` and `uncommitted_movement` stay silent (tested: 0 issues on every positive case).
- An unsupported follow is still caught:
  - the audit's movement backstop now receives the same `followers` set;
  - `absent_participant` is unchanged;
  - "Maren follows him to the window and sits" leaves Maren upstairs and is flagged (tested).

## E. Authored NPC+ departure handling

`CONTROLLER_POLICY` now states:

- `leave_scene` is only for temporary created characters;
- an active authored household member listed in `movable_characters` uses `move_character` with the known place they reached (Nicco's current location when they follow him), or no command when no place is established;
- an invitation, a request or hesitation is not movement.

Authorization is not weakened. A `leave_scene` for an authored NPC+ is still rejected (tested), and when no destination resolves, nothing moves.

## F. Positive and negative matrix (all tested)

**Moves the NPC+ to Nicco's arrival** (with a `moved` entry and a clean audit):

| Narration |
|---|
| "Maren follows him." |
| "Maren follows a step behind, catching the door…" |
| "Maren's lighter steps came after." |
| "Maren rises and follows him down the stairs." |
| "Maren falls into step behind him." |
| "A moment later, Maren follows him down." |
| "Gerome descends after him." (authored NPC+ Gerome) |
| A controller `move_character` alongside the same evidence (one move) |

**Moves nobody:**

| Category | Cases |
|---|---|
| Invitation without a follow | request alone |
| Declined or not happening | hesitation; refusal; "stays where she is"; "No footsteps follow"; "does not follow"; "watches him leave"; "waits at the stairs" |
| Not movement | "Maren's gaze follows him"; "eyes follow the conversation"; "She follows his reasoning"; "follows the sound with her eyes" |
| Hedged or other time | almost; might; would; "will follow later"; "followed him yesterday" |
| Unresolvable destination | "follows him to the window" |
| Ineligible setting | Nicco did not move; NPC+ already at the arrival; authored **non-NPC+** NPC (unchanged; the audit flags the narration) |
| Wrong command kind | a controller `leave_scene` for an NPC+ is rejected |

## G. Live before and after

**Offline, on real narrator text (Pass 8, all 120 drafts and delivered narrations), the new grammar recognizes exactly one movement:**

- errands 2: "Maren's lighter steps came after, quick and willing." → Main hall, the measured loss.
- It produces **no** other detection, including the 5 "follows him back up" sentences about NPC+ who never left.
- Gerome's "heavy footfalls marked Gerome's descent" is still not recognized. This is conservative by design.

**Live Pass 9 (same harness, same 5 × 24 script and setup), 120 turns, complete:**

| Measure | Pass 8 | Pass 9 |
|---|---:|---:|
| Invited NPC+ on outbound turns (production detector) | 9 (6 turns) | 9 (6 turns) |
| Narrator follows in the draft / declines (by turn) | 1 / 5 | 1 / 5 |
| NPC+ movement evidence | 0 | 0 |
| Derived / controller `move_character` proposals | 0 / 3 | 0 / 2 (both "already established") |
| Committed NPC+ moves / `moved` developments | 0 / 0 | **0 / 0** |
| Unrequested moves / wrong moves | 0 / 0 | **0 / 0** |
| `absent_participant` issues | 7 | **1** (errands 11, the erased follow) |
| Delivered as draft / revision / redacted | 105 / 12 / 3 | 105 / 9 / 6 |
| Other rejected proposals | — | `set_condition` 1 (invalid reference), `adjust_relationship` 1 (insufficient confirmation) |
| Gameplay failures / leaks / reflection calls | 0 / 0 / 0 | 0 / 0 / 0 |
| Cost / tokens | $0.306 / 1.01M | **$0.308 / 1.02M** |
| Narrator p50/p95; controller p50/p95 | 3.4/4.5 s; 1.0/2.0 s | 3.5/4.6 s; 0.9/2.1 s |

How the narrator answered each invitation:

| Turn | Narration | Reading |
|---|---|---|
| breakfast 12 | "no answer follows him down… the stair remains still" | Decline |
| chores 9 | "Brenna is away — not in the observation room above…" | Decline that **misplaces Brenna**, who was upstairs |
| friction 12 | "No footsteps follow… each stay where they are" | Decline |
| evening care 11 | "Gerome does not follow. He was not in the room when Nicco left" | Decline that **misplaces Gerome** |
| errands 2 | "Gerome was not there to hear the invitation, and neither was Maren — both… away from this floor" | Decline that **misplaces both** |
| **errands 11** | Draft: "Behind him, Brenna's uneven tread followed — slow… her hand settled lightly on his arm" | **Follow, missed by the grammar** (leading "Behind him,"); the audit flagged `absent_participant`; the revision erased it |

**Findings:**

1. **A recognition gap.** The one live follow uses the step-led form behind a fronted adverbial. The rule anchors that form at the clause start, so it failed closed. The fix is small and bounded: allow a leading "Behind him," or "Behind them," before the step-led subject.
2. **The narrator believes the invited NPC+ is absent.** In 3 of the 5 declines, the narrator says the invited NPC+ "was not there to hear the invitation". The narrator is prompted from the **projected arrival scene**, where the people Nicco left behind are not listed as present. Only the note mentions them. This, more than the old "stays there" wording, looks like what drives refusal.
3. **The change itself is safe.** There were no unrequested moves, and `absent_participant` fell from 7 to 1. That fall is consistent with fewer follow-presupposing continuity slips, but it is not attributable with certainty on one run.

## H. Organic development rate

0 developments in 120 live turns. That gives 0 in 301 organic turns across Passes 7–9 (61 + 120 + 120).

## I. Reflection trigger observations

No NPC+ approached the 3-development trigger. Reflection rules, prompt, validation, model and thresholds are untouched.

## J. Safety and correctness

**Authority:**

- Authorization is unchanged. Nothing moves without completed narrated following.
- No unrequested or wrong moves, live or in tests.
- Refusal and hesitation stay stationary.
- Authored non-NPC+ behavior is unchanged.

**Live run:** 0 secret leaks and 0 reflection-induced gameplay changes.

**Code:** `runTurn` is **164 lines**, untouched.

**Validation:**

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | PASS | **PASS** |
| `npm test` (total / pass / fail / todo) | 1295 / 1291 / 0 / 4 | **1330 / 1326 / 0 / 4** (same 4 TODOs) |
| `npm run test:playthrough` | 25/25 | **25/25** |
| H2 golden | byte-identical | **byte-identical** (no golden file changed; the non-invited note text is unchanged) |
| Prior H and NPC+ suites, locked gate matrix | PASS | **PASS** |

## K. Remaining debt

1. **Fronted adverbial before a step-led follow** ("Behind him, Brenna's tread followed"). This is the only live follow, and it was missed (G, finding 1).
2. **Narrator reluctance persists.** Even with a neutral note, the narrator declined 5 of 6 invitation turns, 3 of them by treating the invited NPC+ as absent (G, finding 2).
3. **Pronoun-led follows are ambiguous when two women are left behind.** "She follows him" with Brenna and Maren both upstairs fails closed. This is the existing `byPronoun` limitation.
4. **Ornate step-led narration is not recognized:** "heavy footfalls marked Gerome's descent".
5. **A condition-audit false positive on Nicco:** "The stairs creak underfoot as Nicco descends" was flagged `uncommitted_condition` (chores 9, redacted). This is not NPC+ and not caused by Pass 9, but it adds to redactions.

## L. Pass 10 recommendation

1. **Close the recognition gap.** Allow a leading "Behind him," or "Behind them," before the step-led follow form. Write positive and negative tests, including "Behind him, the stairs creaked", and replay the Pass 8 and Pass 9 drafts offline to confirm that errands 11 is now caught and nothing spurious is.
2. **Fix how the narrator sees left-behind people.** On an invitation turn, the narrator should know that the invited NPC+ is at the origin and heard the invitation; at present the arrival-scene context implies absence. Verify with around 20 isolated invitation turns, with the draft captured, measuring follow / decline / ambiguous. Change wording only on that evidence, and never instruct acceptance.
3. **Precision fix for the Nicco "creak underfoot / descends" condition flag,** if a small probe confirms it is recurring.
4. **Keep relationship vocabulary, reflection and the domain model frozen** until following produces organic `moved` developments.

CALDREVAN NPC+ PASS 9 PARTIAL
