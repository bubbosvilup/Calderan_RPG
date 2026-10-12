# Consolidation block 3: companion / group movement and identity continuity

Base: main `5edcd37` (3313/3313). Final: working tree, **3334/3334**, typecheck and build clean. No commit, no push. Date 2026-10-12.

## Root cause (confirmed against current code)
Created Campaign people were already movable. What blocked a purchased person was that "who may follow" was `activeNpcPlus` at three decisive sites: narrated implicit follow (`stages/authorization.ts`), the narration audit (`narration-audit.ts`, three calls) and the left-behind/invitation notes (`stages/intent.ts`). So a held person could not follow implicitly, was told to stay by the Narrator note, the audit did not flag a narrated follow, and nothing moved her when the player led her. Result: Nicco at Heartstone, Maren at the market.

## Design (nothing persisted)
- `followCandidates(snapshot, people, player_input)`: pure, per turn. Reasons: `npc_plus_active`, `held_by_player` (legal status enslaved, holder nicco), `household_member` (status member), `invited_this_turn` (named in an invitation sentence). Non-NPC+ reasons apply to created characters only. Free, uninvited, non-household people are never candidates.
- Path A: completed narrated follow of the SAME candidate (evidence, then existing authorization). Path B: `resolveHeldEscort`, a held person present, NAMED and led by the player ("let's go", "come with me", also in the sentence right after the naming one), with Nicco's travel resolved: `move_character` bound to his arrival, in the same batch. No stay/refusal wording, no pronoun guessing, no unnamed or plural lead, no remote teleport.
- Audit parity: the same candidate set feeds authorization and audit (`uncommitted_movement` for an unrecorded follow, pronoun-arrival closure).
- Notes: an escorted person is told "NOT left behind"; everyone else keeps the earlier text (NPC+ text byte for byte; golden unchanged).
- ID-1: `establishNames` skips (`persistent_identity_elsewhere`) a self-introduced name that already belongs to a held person or household member elsewhere. Other same-named people stay distinct (existing policy "names are not identity").

## Status
| ID | Status |
| --- | --- |
| MOV-1 | fixed offline, live-certified on final code |
| MOV-2 | closed only in the narrow deterministic escort form |
| MOV-3 | fixed (one predicate); remaining `activeNpcPlus` uses are authored NPC+ location authority, stair/door departures, contracts |
| MOV-4 | fixed (audit parity); residual: escorted person narrated as staying behind is not audited |
| ID-1 | fixed for held/household people; unnamed look-alike detection not built |

## Tests
`tests/consolidation-block3.test.ts` M1-M21 (escort, stay/refusal, unnamed lead, two people, remote, free person, wrong-destination Controller move, household/held/invited narrated follow, pronoun ambiguity, pure resolver, scene/SSP, save/load, ID-1 fork). Product path regression in `person-offer-e2e.test.ts` (purchase via Actual Offer, Slave, named Maren, "Alright Maren, i just purchased you, let's go home": same id at `heartstone_lr`, one created character, holder unchanged, visible in the scene). Changed oracle: `npc-plus-pass-10-state-matrix` (a free created person invited by name now follows when narrated; invitation wording otherwise irrelevant).

## Live (one run, exact final code)
Production Narrator and Controller, `src/dev/consolidation-block3-live.ts`, evidence in `docs/evaluations/consolidation_block3_live/run.json`. Maren seeded as the settled result of the already certified purchase flow. Turn 1 "Alright Maren, i just purchased you, let's go home": Nicco and Maren both `heartstone_lr`, same id, 1 created character, holder nicco, no audit issue. Turn 2 arrival follow-up: no fork. Calls: 2 Narrator, 2 Controller, 21666 tokens, cost not reported by the provider trace (0 recorded). The passing run was on the exact final code; no code change followed it.

## Remaining debt
Reverse audit for an escorted person narrated as staying; MOV-2 for free people, unnamed or plural leads; ID-2/PER-2 untouched; TRD-11 and ECO-1 still open.
