# Debt register after Pass 10

**Gate:** READY_WITH_NON_BLOCKING_DEBT. **Blocking items: none.** Updated after the [final movement debt closure](CALDREVAN_FINAL_MOVEMENT_DEBT_CLOSURE.md): D-01, D-02, D-07, D-11, D-13, D-14, D-15 and D-24 are closed (see the sections below, numbers are not reused); D-03 (accepted, cosmetic) and D-12 (closed for the observed production language, with an intentional fail-closed remainder) are unchanged. The movement/follow subsystem is frozen.
Severity: BLOCKING · IMPORTANT · MINOR · ACCEPTED. "Before autonomy?" means: should it be resolved or decided before any NPC+ autonomy, goals or personality evolution is built.
Section letters refer to the [Pass 10 report](CALDREVAN_NPC_PLUS_PASS_10_OVERNIGHT_ASSURANCE.md). Every row is real debt found or carried; none was invented to fill the table. The H1 and H5 carry-overs come from the H6 final audit and the Pass 5 and 7 reports.

| ID | Area | Severity | Evidence | Current safety | User impact | Recommended action | Before autonomy? |
|---|---|---|---|---|---|---|---|
| D-03 | `(away)` rendering for an invited NPC+ | MINOR (ACCEPTED, cosmetic) | Re-measured live (movement/follow closure): the "if she heard the invitation" hedge appears in 3 of 25 production drafts, always inside a stay. A transient movement-aware label (`away from Main hall; was in Observation room when invited`) removes it (0 of 25) but triples the follow rate (5 of 25 production vs 17 of 25 labelled), the same effect that rejected `away_labels` (80%). | Safe; the label stays the true state. | A harmless hedge in about 1 stay in 8. | Leave as is. Revisit only if a labelled prompt can be shown not to raise the follow likelihood. | no |
| D-04 | **Context ceiling: present people × shown facts known** | **IMPORTANT** | 7 present NPC+ who all know all 32 shown facts fail with `context_too_large`; lean 65, rich 25 (J). ≈ 125 characters per permission edge, never-drop. | Fails **closed** (the turn is rejected; no partial state). | In a crowded household scene a turn would fail. | Compact knowledge edges for present NPC+ the way the access block already compacts "everyone else present", or select by relevance with an omission report. Do **not** raise the 32k cap. | **yes** |
| D-05 | Real transient provider retry never live-exercised | IMPORTANT (carried H5/H6) | 0 transient errors in all live runs so far; retry is proven only by offline injection (R). | Offline matrix: one commit at most, no duplicate state. | None seen. | Keep the diagnostics sink on in every live run; a soak run when convenient. | no |
| D-06 | Occasional controller `structured_output_invalid` | MINOR (carried) | About 1 per 100–570 turns (H5: 1/569; Pass 5: 1/105). Non-retryable by policy (R). | Fail-closed turn, no state change. | One failed turn per few hundred. | Options (decide separately): retry once on this code, or accept. Not changed. | no |
| D-08 | Four H1 TODOs | ACCEPTED | `them` phantom handover; first-name-only condition attribution; unnamed captive price; fronted-recipient receipt (Q). No NPC+ correctness interaction. | Fail-closed over-redaction or non-confirmation. | Occasional redaction. | Leave as is (count must stay 4 unless justified). | no |
| D-09 | Reflection: organic usefulness unmeasured | **IMPORTANT** | 0 organic developments in 301 live turns (S). Reflection has never run on organic evidence. The Pass 10 content rules have **not been seen against the live model** (0 of 140 past accepted notes match them). | Non-authoritative; failures never affect gameplay. | Notes may stay empty. | Measure after a follow or motif source exists. Review every accepted note by a human. | **yes** |
| D-10 | Recurring behaviour has no representation | IMPORTANT (design gap) | Maren tidies on about 15 turns; window-sitting recurs 5 times in a session; none is recorded (Pass 8, S). | Not a defect: nothing false is stored. | Characters feel unchanging. | Next-pass candidate: a small *derived* motif source feeding existing reflection. Not a new memory domain. | **yes** |
| D-12 | Ornate follow forms not recognised | MINOR (ACCEPTED, open-ended) | Pass 10: 13 of 16 ornate forms unrecognised. Now 7 of 16 unrecognised (9 resolve): live-derived and ornate forms of a named subject's completed arrival with same-turn Nicco movement. 8 of the 15 live drafts the grammar missed (real follows) are recognised; 0 new false positives in the 1,960 negative and non-mover corpus cases and the 21 new negatives. Still unrecognised on purpose: intent-only ("chose to follow"), sound-only, "slipped out and down after him", a gaze or a stop after the follow (shared gates veto), a bare "She followed" with two women. | Fail-closed; never a wrong destination. | The audit may erase a valid follow in about 1 live follow in 5. | Extend only from new live drafts, with a negative test for each family. | no |
| D-16 | `private_memory_refs` has no writer | MINOR (new) | Created empty, validated, read for recovery, never written (M). It would duplicate the knowledge domain. | Harmless. | None. | Remove in a future schema migration, or decide its purpose with any memory work. | **yes** |
| D-17 | Reflection trigger counts lifecycle entries | MINOR (design note) | `joined_household` is one of the three developments, so the first reflection is due after **two** organic moves (L). Triggers were not changed. | By design. | Earlier first reflection. | Revisit only with evidence from D-09. | no |
| D-18 | Absent-participant gaps: possessive sound, pronoun continuation | ACCEPTED | `Korvin's voice cuts through the room.`; `Korvin is away. He laughs.` (H.2). The possessive case could be owned by a small rule; the pronoun case needs a coreference system. | Conservative toward allowing. | An absent person may be heard or implied. | Do not grow regex; revisit with coreference. | no |
| D-19 | Reconciliation and redaction rates | IMPORTANT (carried H6) | H6: 18.3% / 6.3%; Pass 9 on this household: 15 of 120 revised or redacted (12.5%), 6 redacted (5%). Pass 10 removed one redaction cause (ground-floor). | Fail-closed. | Narration is sometimes rewritten or cut. | Per-path tracking continues; a narrator-quality pass is not a correctness fix. | no |
| D-20 | Reflection delays the next command when due | MINOR (carried Pass 7) | Up to the provider timeout; no in-flight cancellation (Pass 7 K.4). | Fail-closed. | A slower turn when a reflection is due. | Run it truly in the background when autonomy lands. | no |
| D-21 | Type-only import cycles in `turn/` | MINOR | 28 cycles over `import type` (`turn-types` ↔ `context-builder` and others); **0 runtime cycles** (guarded by a test). | None; erased at compile time. | None. | Extract a shared types module when `turn/` is next restructured. | no |
| D-22 | Turn-level semantic retrieval not live-tested | MINOR (carried H6) | H6 debt 5; the Pass 9 harness header records no semantic retrieval and no later pass reports using it. | Fail-closed. | None. | Include in the next live matrix. | no |
| D-23 | `runTurn` at the 164-line ceiling | ACCEPTED | 164 lines, guarded by a test. | Any growth fails the test. | None. | New behaviour goes into stage modules. | no |

## Closed in Pass 10 (for traceability)

| Was | Closed by |
|---|---|
| Fronted-adverbial follow missed; dash and ellipsis tails (Pass 9 debt 1) | grammar repair, tested end to end |
| Narrator treats the invited NPC+ as absent (Pass 9 debt 2) | note repair; **effect unmeasured**, see D-01 |
| `uncommitted_condition` on "ground-floor hall" (Pass 9 debt 5) | `physical-interaction.ts`, tested |
| A valid follow lost when the controller names a wrong destination | `authorization.ts`, tested |
| Habitual and "walks in X" prose moving a character | grammar and gate repairs, tested |
| Unsupported reflection claims passing the validator | `reflection.ts`, tested |
| Contract without evidence and unordered history accepted at restore | `snapshot-validation.ts`, tested |
| O(P²) NPC+ packing (865 ms at 200 NPC+) | `npc-plus.ts` hoist; 18 ms |
| Revision narrator not told a move committed | `narration-audit.ts`, tested (see D-13 for the residual) |

## Closed after movement/follow debt closure

IDs are kept (no renumbering). Evidence, tests and live counts are in [the closure report](CALDREVAN_MOVEMENT_FOLLOW_DEBT_CLOSURE.md).

| Was | Closed by |
|---|---|
| D-01 Narrator follow-choice behaviour | Superseded by the live follow-choice validation (25 calls: 9 follow, 15 stay, 1 ambiguous, 0 hard false absence) and confirmed on 25 fresh production calls: 0 absence claims, a genuine mix of follow and stay. There is no target follow rate. |
| D-02 Presence rule vs a follower's arrival | No conflict reproduces: 50 live drafts (production and labelled) never said the person "cannot be here", never refused to narrate an arrival and never relocated the invitation; arrivals were narrated freely. Wording unchanged (no golden delta). |
| D-11 Pronoun follow needs a unique eligible woman | Bounded antecedent rule in `character-movement.ts` (one named subject in the previous sentence or earlier in the same sentence, no refusal or stay before it, no second name, `he` fails when Nicco is named). "Brenna looks at Maren. She follows him." still fails closed. |
| D-13 A revision can drop a committed move | `audit.ts` appends "<Name> has followed Nicco to <Place>." for each committed arrival the delivered text no longer mentions; state is never rolled back. |
| D-14 Duplicate controller proposals | `authorization.ts` dedupes identical `move_character` proposals per mover and destination, first wins, evidence stays aligned, `duplicates_removed` is traced. |
| D-15 Invitation selector and absent addressees | `follow-invitation.ts` takes the known names of absent people; an absent named addressee invites nobody. |

## Closed after the final movement debt closure

IDs are kept (no renumbering). Evidence, tests and the freeze decision are in [the final closure report](CALDREVAN_FINAL_MOVEMENT_DEBT_CLOSURE.md).

| Was | Closed by |
|---|---|
| D-07 Authored destination-less departure | Every persistent character now has its own authoritative location, `LOCATED(place)` or `OFF_SCENE(last known place, since revision)`, in the one runtime domain (save schema 4, snapshot 3, explicit migration). A completed departure with no destination commits `leave_scene` as OFF_SCENE for an active NPC+; a known destination always wins and is a `move_character`. The scene is derived purely from co-location with Nicco. Independent known-destination movement, retention across 20 unrelated turns, save/load, return from OFF_SCENE and multi-NPC independence are tested. |
| D-24 Dependent follower sentence survives a rejected Nicco move | The narration audit reads the follow grammar's dependent forms against the place the narration says Nicco went but state did not take him to, and withdraws them (`uncommitted_movement` for the follower). A local "follows him over to the table" has no inter-location destination and is untouched. |
