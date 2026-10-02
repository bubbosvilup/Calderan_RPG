# Caldrevan movement / follow debt closure

Live-validated, one debt at a time, on the real turn pipeline. Debt IDs come from the [debt register](CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md). Raw live rows (drafts, revisions, delivered text, state, tokens, cost) are in [`movement-follow-closure/`](movement-follow-closure/).

**Verdict: `MOVEMENT_FOLLOW_DEBT_FAMILY_NOT_CLOSED: D-07, D-24`** (D-03 and D-12 are explicit, safe exceptions; the rest are closed).

| Debt | Reproduced? | Live observed? | Fixed? | Final status |
|---|---|---|---|---|
| D-01 follow-choice behaviour | n/a (model behaviour) | yes, 25 fresh calls | no change needed | **CLOSED** (A, superseded by the 25-call live validation, reconfirmed) |
| D-02 presence rule vs arrival | no conflict found | yes, 50 drafts | no change needed | **CLOSED** (A) |
| D-03 `(away)` label and the "if she heard" hedge | yes (3 of 25 drafts) | yes | no (the only fix triples the follow rate) | **REMAINS, accepted cosmetic exception** |
| D-07 destination-less departure | **yes**, 10 of 15 live drafts | yes, 35 pipeline draws after the fix | partly (audit); representation still missing | **REMAINS** (architectural decision) |
| D-11 pronoun follow, two women | yes | yes | yes, bounded antecedent | **CLOSED** (B) |
| D-12 ornate follow forms | yes | yes, 8 live misses recognised | yes, by safe family | **CLOSED for observed forms, explicit exception for the rest** |
| D-13 revision drops a committed move | yes | covered by the pipeline | yes, deterministic append | **CLOSED** (B) |
| D-14 duplicate controller proposals | yes | n/a | yes | **CLOSED** (B) |
| D-15 absent addressee invites someone else | yes | n/a | yes | **CLOSED** (B) |
| D-24 (new) follower sentence after a rejected Nicco move | yes | no | no | **REMAINS** (new, minor) |

Closure standard used: A = the current code no longer has the behaviour (regression test or live proof); B = it existed and is fixed with a before/after reproduction; C = the premise is obsolete. "Not observed" was never taken as "does not exist".

## Validation

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1,708 tests, 1,704 pass, **0 fail**, 4 todo (the same 4 accepted H1 TODOs) |
| `npm run test:playthrough` | 25 / 25 |
| Pass 10 grammar corpus | 21,672 cases: 0 false negatives, **0 false positives** (negative 966 + 966, non-mover 28, two-women 4,928) |
| Live-follow replay (`pass10-replay-live`, 1,964 real sentences) | 6 detections, the same as the follow-recognition closure |
| Follow-recognition closure replay (`follow-choice-e2e`) | **9 / 9** prior live follows still correct, output byte-identical to the committed e2e file |
| Language-gate matrix, H2 golden | pass inside the suite, golden not regenerated |
| `runTurn` | 164 lines (limit 164) |
| Movement false positives | **0 new**. One older family was found and closed: temporal, habitual and imagined prose after an explicit destination ("walked into the hall yesterday") moved a character at HEAD |

## Live spend

Hard cap EUR 15. Spent **about EUR 0.33** over **178 narrator calls** (about 650k input and 21k output tokens). Voyage was not called. Keys were used only as inline environment variables and are not in any file, document or commit.

| Debt | Paid calls | Estimated EUR |
|---|---:|---:|
| D-01 | 5 | 0.009 |
| D-02 | 20 (shared with D-03 and the D-01 confirmation) | 0.037 |
| D-03 | 25 (labelled variant) | 0.047 |
| D-07 | 78 (three rounds on the full pipeline) | 0.148 |
| D-11 | 24 | 0.043 |
| D-12 | 26 | 0.046 |
| D-13, D-14, D-15 | 0 (deterministic, offline) | 0 |

## D-01 follow-choice behaviour

- **Original claim:** invited household members mostly stay put and 3 of 5 declines misplace them as absent.
- **Direct reproduction:** not applicable, it is model behaviour.
- **Live:** 5 invitation turns (production note), then 20 more in the D-02/D-03 batch. Absence claims: **0 of 25**. Outcomes were a genuine mix; the real follow rate is about 5 of 25 recognised plus a few forms still missed by the grammar.
- **Root cause / fix:** the Pass 10 note repair already removed the absence claims. No code change.
- **Residual:** none for D-01. There is no target follow rate.
- **Verdict: CLOSED (A).**

## D-02 presence rule vs a follower's arrival

- **Claim:** the system prompt lists only the people present at the destination, so a narrated arrival of someone not listed might be suppressed or refused.
- **Live stress** (Nicco and Maren together upstairs, invited, Nicco goes down, destination lists only Nicco): 50 drafts including the labelled variant. 0 drafts said anyone "cannot be here", 0 refused to narrate an arrival, 0 relocated the invitation. Arrivals were narrated in plain words ("Maren follows… reaching the bottom").
- **Fix:** none. The wording is unchanged and the H2 golden is untouched.
- **Verdict: CLOSED (A).**

## D-03 `(away)` label

- **Claim:** the `away` label is the narrator's loudest cue and causes hedging.
- **Live:** the hedge ("if they heard the invitation") appears in 3 of 25 production drafts, always inside a stay, never as a false absence.
- **Variant tried:** `Maren (away from Main hall; was in Observation room when invited)` on the same five invitations, 25 calls. The hedge disappears (0 of 25), but follows go from 5 of 25 to 17 of 25 recognised. That is the same effect that made `away_labels` rejected (80%). Not adopted.
- **Verdict: REMAINS, accepted cosmetic exception.** True state is kept, the hedge is harmless.

## D-07 authored destination-less departure

- **Claim:** an authored NPC+ that leaves with no known destination cannot be moved.
- **Direct reproduction (new finding):** player says "Maren, go out for a while", narrator writes "Maren walks out, and the door shuts behind her". Before: delivered as written, no issue, Maren still in the room in state. The cause was an exemption in the audit: a player-authored departure excused the narrated one, which is only true for created characters (they have `leave_scene`).
- **Live before the fix:** 15 pipeline draws over five phrasings. In **10 of 15** the draft was delivered with the NPC+ "descending" or "footsteps fading down into the hall" and state unchanged. The departure grammar had no stair forms.
- **Fix (audit only, no state change):** (1) an authored NPC is never exempt unless a committed move took them elsewhere; (2) when Nicco does not move, destination-less stair exits (crossed to the stairs and descended, started down, footsteps receding, descending out of view, "Maren's departure") are unrecorded departures; (3) every departure sentence is withdrawn, not only the first; (4) a possessive body-part subject ("Maren's gaze moved… She crossed to the stairs and descended") resolves the pronoun. Followers after Nicco are excluded, so a follow is never read as a departure.
- **Live after:** 35 draws in two rounds. Each round exposed new wordings that were added. In the last 20, one definite leak (fixed afterwards, flagged on replay) and two fuzzy ones remain ("her footsteps beginning their descent", "steps through the doorframe").
- **Tests:** 3 in `movement-follow-debt-closure.test.ts`, plus two matrix rows.
- **Residual:** the player's order is not honored (the NPC+ stays and the narrator says so), and fuzzy exits can still slip through.
- **Decision required, not taken:** an off-scene location state for authored NPC+. Today every authored NPC must have a `current_location` in `npc_locations` (`snapshot-validation.ts`), and `leave_scene` is created-only. A narrow extension is possible (an optional "off-scene since" marker that never names a place) but it touches the runtime schema, restore validation and the UI contract, so it is left for an explicit decision. No geography was inferred.
- **Verdict: REMAINS.**

## D-11 pronoun follow with two women

- **Claim:** with Brenna and Maren both eligible, "She follows him" fails closed.
- **Live:** the two-woman scenario (18 pipeline draws) produced no leak; the real draft "Maren's footsteps followed on the stairs. She came down after him" is the shape this rule addresses.
- **Fix:** `boundedAntecedent` in `character-movement.ts`: a pronoun resolves only to the single movable person named in the previous sentence or earlier in the same sentence (quotes count, so an addressee is a competitor), when that previous sentence is not a stay, refusal or hesitation. `he` also fails when Nicco is named. Two names in the window fail closed: "Brenna looks at Maren. She follows him." still yields nothing.
- **Tests:** 2 positive and 7 fail-closed cases.
- **Verdict: CLOSED (B).** Safe exception: windows with two names stay unresolved by design (no general coreference).

## D-12 ornate follow forms

- **Claim:** 13 of 16 ornate forms are not recognised.
- **Live:** 70 production drafts were replayed through the grammar. 15 real follows or non-follows were unrecognised; 8 of them were real follows and are now recognised, among them "Gerome ducked slightly through the doorframe and stepped into the hall", "Maren comes down into the hall a few paces behind", "Maren appears at the bottom of the stairs a moment after he reaches the hall", "Gerome rounds the stairwell and steps into the hall", "Gerome's broad frame fills the stairway as he follows down".
- **Fix, by family:** (1) follow verbs that assert completed following ("hurried after", "joined him", "fell in beside him"); (2) a named subject's physical arrival at Nicco's arrival (arrive verb plus a destination that resolves to the arrival, or a proven descent), with manner tails; (3) "Heavy footfalls marked Maren's descent" on a proven descent. Named subjects only, and only when Nicco moved and the NPC+ started at the origin.
- **Safety:** one new veto set (frequency, other-day, imagined) also closed an older false positive at HEAD: "Maren walked into the hall yesterday", "usually walks into the hall at dawn" and "in his memory" moved a character. Intent-only ("chose to follow"), sound-only, stops and gazes after the follow stay unrecognised. 21 new negatives, the 1,960-case negative and non-mover corpus unchanged.
- **Of the 16 ornate forms:** 9 now resolve, 7 stay unrecognised on purpose.
- **Verdict: CLOSED for the observed forms; explicit exception** for the deliberately unsupported ones. Remaining misses are fail-closed (about 1 live follow in 5).

## D-13 a revision can drop a committed move

- **Before:** draft follow, an unrelated audit issue forces a revision, the revision omits Maren. State committed Maren in the hall; the delivered text never mentioned her.
- **Fix:** after the revision (or its redaction), each committed arrival that the delivered text does not mention gets one deterministic sentence, "Maren has followed Nicco to Main hall." State is never rolled back and stays committed exactly once.
- **Tests:** a clean revision adds nothing, an omission is repaired (also after a redaction), several movers each get a line, unrelated movement prose does not trigger it, and an invented uncommitted follower is still redacted.
- **Verdict: CLOSED (B).**

## D-14 duplicate controller proposals

- **Before:** two identical `move_character` proposals produced two authorization decisions (one commit, one history entry).
- **Fix:** `authorization.ts` dedupes by mover and destination, keeps the first, keeps the evidence quote aligned with its own command, and traces `duplicates_removed`. Different destination or mover is never merged.
- **Test change, justified:** the older state-matrix test expected 2 decisions for a duplicate; it now expects 1, because that is the intended change.
- **Verdict: CLOSED (B).**

## D-15 absent named addressee

- **Before:** "Brenna, come with me" with Brenna elsewhere and one eligible NPC+ invited that NPC+.
- **Fix:** `intent.ts` passes the known names and aliases (canon and campaign) of people who are not eligible into `invitedFollowers`, which treats an absent vocative as addressing nobody here. Unnamed invitations and group invitations behave as before.
- **Verdict: CLOSED (B).**

## D-24 (new) dependent follower sentence

Nicco's own move to an unreachable place is withdrawn, but "Maren came down after him" in the next sentence can survive while state keeps Maren upstairs. Reproduced in the matrix row "unreachable destination". Not fixed: flagging implicit follows when Nicco did not move would also hit ordinary in-room following. State is correct, so it is a prose-only gap.

## Combined interaction matrix

`tests/movement-follow-interaction-matrix.test.ts`, 16 rows on the real pipeline: single, two, group, named, unnamed sole eligible, named absent, down, unreachable, draft follow and stay, pronoun and named follow, ornate arrival, duplicate and wrong controller proposals, controller move without narrated follow, revision repair, player-ordered and Nicco-stays departures. Invariant: prose and state agree and nobody moves without narrated completed evidence. 16 / 16 pass; one row (D-24) asserts state only.

## Files

Production: `src/turn/character-movement.ts`, `follow-invitation.ts`, `narration-audit.ts`, `scene-departure.ts`, `stages/{audit,authorization,intent,result}.ts`, `turn-coordinator.ts` (same line count), `turn-diagnostics.ts`, `turn-types.ts`. Evaluation only: `src/dev/probe-movement-closure-live.ts` (new, never imported by production), a labelled variant in `probe-follow-choice-live.ts`. Tests: `movement-follow-debt-closure.test.ts`, `movement-follow-interaction-matrix.test.ts`, one updated expectation.

## What needs a decision

1. **Off-scene representation for authored NPC+ (D-07).** Without it, "go out for a while" cannot be honored and a small tail of fuzzy exits can read as gone.
2. Nothing else blocks the UI work; D-24 and D-03 are cosmetic or prose-only.
