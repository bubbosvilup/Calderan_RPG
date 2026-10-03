# Final movement debt closure: independent NPC location, OFF_SCENE and dependent follow

Closes D-07 and D-24 and freezes the movement and follow subsystem. D-01, D-02, D-03, D-11 to D-15 were not revisited (D-03 stays an accepted cosmetic exception; D-12 stays closed for the observed production language with an intentional fail-closed remainder).

## A. Executive result

**Verdict (offline): `MOVEMENT_FOLLOW_SUBSYSTEM_FROZEN`; after the live validation of section N the verdict is `MOVEMENT_FOLLOW_SUBSYSTEM_NOT_FROZEN` (state correct, a small tail of unrecognised exit wordings remains).** **Live validation was not run:** the OpenRouter key was not available to this session (no environment variable, and the pasted key is not recoverable from the conversation without reading credentials out of a transcript, which this pass refused to do). The live probe is written and verified in dry-plan mode (`src/dev/probe-final-movement-live.ts`, 9 scenarios, narrator and controller both real). Every behaviour below is proven offline through the real turn pipeline with a scripted narrator; what live adds is only the question of which wordings the real narrator picks. Unrecognised wordings fail closed (nothing moves, the claim is withdrawn), so a live gap can cost recall, never correctness.

- D-07 is closed: every persistent character has one authoritative location, independent of Nicco; the scene is a projection of co-location; OFF_SCENE is a real authoritative state.
- D-24 is closed: a rejected Nicco move can no longer leave a dependent "Maren follows him there" in the delivered text.
- 1,731 tests, 1,727 pass, 0 fail, the same 4 TODOs. Typecheck clean. Playthrough 25/25. H2 golden byte-identical (unchanged, not regenerated). `runTurn` 164 lines. Grammar corpus 21,672 cases, 0 false positives. Prior live-follow replay 9 of 9.

## B. Baseline

Typecheck clean; 1,708 total, 1,704 pass, 0 fail, 4 TODO; playthrough 25/25; golden unchanged; `runTurn` 164; Pass 10 grammar corpus 21,672 cases with 0 false positives; the 9 recorded live follows 9/9. Verified at the start of this pass and re-verified at the end.

## C. Character-location authority model

One domain, `runtime.npc_locations`, with exactly one of two shapes per character (`src/types/scene.ts`):

| State | Shape |
|---|---|
| `LOCATED` | `{ character_id, current_location }` |
| `OFF_SCENE` | `{ character_id, off_scene: { last_known_location, since_revision } }` |

Never both, never neither, and no second map anywhere. Created characters keep their existing representation (`current.current_location`, cleared by `leave_scene`); the new state covers authored characters, which is where D-07 lived. An OFF_SCENE character still exists: relationships, knowledge, legal status, contracts, household membership, NPC+ history and identity are untouched. Premium state does not duplicate her location.

## D. Known-destination independent NPC movement

Chain, unchanged: completed narration, evidence, proposal, same-turn authorization, one commit. New in this pass:

- The mover's origin is read from her own authoritative location (never Nicco's scene). A mover whose location is known needs a structured route to the destination (`findRoute`); no geography is invented.
- "Maren goes upstairs to the Observation room", "Gerome walks out to the Courtyard", "Brenna returns to the Living Floor", "Maren heads down to the living room" all commit exactly one `moved` history entry. `comes`/`came` and `out into` were added to the movement grammar.
- A bare vertical direction ("goes upstairs", "heads down the stairs") resolves only to the unique directly connected location whose structured edge reads as that direction (`uniqueVerticalNeighbour`). Zero or several candidates fail closed (tested with a second staircase: the claim is withdrawn, nothing moves, nothing goes off-scene).
- A character who is elsewhere (or off-scene) is an *entrant*: she counts only when narrated arriving where Nicco is, by name, never as a pronoun referent, follower or leaver.

## E. OFF_SCENE semantics

- Evidence: a completed departure of an active NPC+ present with Nicco ("goes out for a while", "leaves", "disappears into the city", "walks out and closes the door"). A known destination always wins; a stair-direction sentence is never read as unknown (it is a movement or it fails closed).
- Not evidence: "looks toward the door", "starts toward the stairs", "almost leaves", "might leave", "says she'll leave later", "usually leaves in the morning", "left yesterday", "considers leaving", gaze shifts, "steps toward Nicco". A player order is not authority: only a narrated completed exit counts; a refusal or stay changes nothing.
- Commit: `leave_scene` on an active authored NPC+ becomes `OFF_SCENE(last known place, revision this change commits)`. Leaving again is a no-op. History entry: `moved` with `from` and no `to` (no fabricated destination).
- Controller guidance now says: `move_character` for a known place, `leave_scene` only when no destination is established, a known place wins.

## F. Destination resolution

An explicit known location, a unique canonical room phrase, or the unique structured graph relation. Ambiguity, containers, unreachable places and anything else fail closed. No LLM, no intent inference.

## G. Scene derivation

`present_characters` = persistent characters whose authoritative location equals Nicco's. There is no "load NPC into scene" path. Scene rebuilds and Nicco's own movement never write another character's location (tested by moving Nicco through every room and re-reading everyone).

## H. 20-turn persistence test

`tests/final-movement-closure.test.ts`, first test: Maren goes down to the hall while Nicco stays; 20 unrelated turns (she is never reset to the baseline, never unknown); save and load; Nicco to the hall (she is in the scene); Nicco back to the room (she is gone from the scene but still in the hall); narration brings her up (she is present again). History has exactly one entry per real move.

## I. Save/load and migration

Envelope schema 3 to 4, snapshot schema 2 to 3, sequential migration step 3: it changes only the two version numbers (every old location is a valid `LOCATED` entry) and rejects an old-schema file that carries an `off_scene` entry or a malformed location. The dataset hash is unchanged (it is not derived from runtime state; asserted). Tests: old save migrates losslessly; LOCATED round trip; OFF_SCENE round trip; save after a move; save after OFF_SCENE; deterministic serialization; ten tamper cases rejected at restore (both shapes, neither, invalid or non-location last-known place, future or negative `since_revision`, extra field, unknown character, duplicate entry, the player off-scene); `runtime_delta` placement is validated (both ways, `off_scene: false`, neither, the player).

## J. Return and re-entry

OFF_SCENE to `LOCATED(B)` only with an exact destination and a completed arrival ("Maren returns to the Observation room, shaking rain from her cloak"). "I wonder where Maren is", "should be back soon", "Nicco calls for Maren", "Maren might come back later" never move her. An arrival somewhere Nicco is not is not narratable evidence and fails closed. Known to known ("comes down the stairs into the main hall") works; if she does not come, she stays. Calling her from elsewhere only has to be representable (no acoustics).

## K. NPC+ history interaction

`moved` entries derive from the one location function: `LOCATED(A)` to `LOCATED(B)` gives `from A, to B`; to OFF_SCENE gives `from A` only; back gives `to B` only. Structured, no prose memory. Rollup counts are unchanged.

## L. D-24 reproduction

Before: `I walk to the remote docks. Maren, come with me.` with narration `Nicco walks to the remote docks. Maren came down after him.` (or `follows him`, `follows him there`) delivered `Maren came down after him.` while state kept both in the room.

## M. D-24 repair

Semantics: a dependent same-turn inter-location follow is valid only if Nicco's prerequisite movement commits; otherwise no follower moves (already true) and the prose may not claim the follower arrived (new). In `narration-audit.ts`, when Nicco's own narrated movement is not committed, the follow grammar's dependent forms are read against the place he was narrated going (`hypothetical` mode: route-free, direction-agnostic, followers already in the room allowed) and each is flagged `uncommitted_movement` for that follower. `follows him there` was added to the follow tail. A local "follows him over to the table" while Nicco stays has no inter-location destination and never reaches this path.

Cases A to G are tests: A valid move, both move; B and C unreachable, both stay, no dependent prose (four phrasings); D local follow delivered; E a rejected move with Maren only watching is clean; F a valid move with Maren staying behind keeps her; G a rejected Nicco move with an independent Maren departure lets her go to a known place or OFF_SCENE.

## N. Live validation

Run 2026-10-03 with the real narrator (z-ai/glm-5.2) and the real controller (deepseek-v4-flash), key supplied inline only (never written anywhere). 13 batches, 1,688 live turns, about 3,700 provider calls, about EUR 4.4. Raw per-turn records (drafts, proposals, evidence, decisions, tokens, cost, save/load check) are in `docs/evaluations/final-movement-closure/live-batch1..13.jsonl` (removed from the tracked tree in the repository cleanup; see [final-movement-closure/MANIFEST.md](final-movement-closure/MANIFEST.md)). Scenarios: known upstairs, known courtyard, destination-less departure, voluntary departure, order then refusal, incomplete movement, OFF_SCENE return, known return, multi-NPC locations, order upstairs, persistence after a move, local follow, D-24 with an unreachable destination, plus re-entry (mention only, clear arrival).

**What held in every batch:** 0 provider errors; save/load round trip after each live turn 100%; 0 invalid movement committed; 0 location resets; 0 scene/location confusion; 0 false re-entry; multi-NPC locations (Nicco hall, Maren room, Brenna hall, Gerome courtyard) never mutated by a scene change; a player order never moved anyone unless the narration showed it; a local follow ("follows him over to the table") never became an inter-location move; D-24 (including bare-pronoun) produced no delivered "Maren arrived there" after a refused Nicco move.

**What the live runs found (all fixed, each with the exact live draft as a regression in `tests/live-movement-regression.test.ts`):** the narrator states exits in many more ways than the offline corpus had: climbing and door exits with no place ("steps through, letting it fall shut behind her"), a door whose destination is only named in a nearby sentence ("the courtyard door"), "footsteps descend/recede/fade overhead/below", "went up", "descends the narrow stairs", "disappeared around the turn of the staircase above", "reaches the landing above", and an off-scene character who "steps inside". Three real correctness bugs: a present Maren who "steps inside, letting the door fall shut" was committed OFF_SCENE; a door closing "behind her" was attributed to the previous subject (Brenna); and a conjoined "Maren follows after a moment's pause, pulling the door shut behind her" while Nicco stayed was committed OFF_SCENE (now never OFF_SCENE evidence, and withdrawn). Production changes: `scene-departure.ts` (exit and stair grammar, `stairDirection`, `FOLLOWS_NICCO`, audit-only `BROAD_EXIT`), `character-movement.ts` (`doorDestination`, entrant "steps inside"), `stages/authorization.ts` (stair and door movement evidence), `narration-audit.ts` (player-named place, broad exit detection). A stair or door exit commits a move only to the ONE structured neighbour or the ONE directly connected place the draft's door wording names; otherwise it stays destination-less (OFF_SCENE) or is withdrawn.

**Residual, measured:** silent divergence (the delivered text says she left, the state keeps her) fell from about 14 of 64 relevant samples in batch 1 to 1 of 64 in batch 13 (the last one, a door "closes behind her" 90 characters after "door", is fixed and covered by a regression but not re-run live). Known unfixed wordings, all with state still correct: "the sound of her going up faded", "before descending" after "moves toward the stairs", an unattributed "the door at the bottom of the stairs opens and closes", "watches her retreat down the stairs", and a bare "began to climb" (incomplete by design). The grammar is a closed list and the narrator is open-ended, so a small tail of such wordings is expected in real play. They cost narration consistency, never a wrong location.

**Verdict for the live criterion:** not clean. See the final report in the session thread.

## O. Full regression

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1,731 total, 1,727 pass, 0 fail, 4 TODO (unchanged) |
| `npm run test:playthrough` | 25/25 |
| H2 golden pipeline | byte-identical, not regenerated |
| `runTurn` | 164 lines |
| Pass 10 grammar corpus | 21,672 cases, 0 false positives, 0 false negatives in scope |
| Prior 9 live follows (offline replay of the recorded drafts) | 9 of 9 |
| Follow-recognition closure, language-gate, interaction matrices | green; matrix grew from 16 to 24 rows (the old D-24 row is now strict) |
| New movement false positives | 0 |

Tests changed because behaviour changed on purpose (not weakened): the version assertions (envelope 4, snapshot 3, future-version cases), the D-07 reproduction (a completed destination-less exit is now committed as OFF_SCENE, so the old "stays and is withdrawn" assertion became "is recorded"), the controller-policy wording test, and the D-12 "already at the arrival" row (now asserted at the proposal level: the grammar may report the true arrival as evidence; no command is proposed).

## P. Debt-register changes

D-07 and D-24 moved to closed history, no renumbering. D-03 and D-12 text unchanged. See the register.

## Q. Remaining intentional limitations

- Live validation of this pass is pending a key (N).
- Created characters keep their existing absence representation (a cleared location from `leave_scene`); only authored characters have `OFF_SCENE` with a last known place.
- A departure narrated by a stair direction that matches several neighbours, a container, or an unreachable place fails closed.
- D-24 reads Nicco's own narrated move through explicit "Nicco" subjects; a bare-pronoun move sentence is not matched (fails open to the previous behaviour, which still keeps state correct). A sentence such as "Maren watches him go" after a withdrawn move is not treated as dependent.
- A character who is elsewhere can only be narrated arriving in Nicco's scene; movement between two places Nicco cannot see is not narratable evidence.
- UI contract: a future UI must derive a character's location and presence from authoritative state (`LOCATED` / `OFF_SCENE`, scene as co-location), never from narration, and must keep the player-knowledge restrictions: OFF_SCENE is not shown to the player as a place and `last_known_location` is not a player-visible fact.
- D-12 remainder and D-03 are unchanged and accepted.

## R. Freeze decision

All ten criteria hold on offline evidence: independent NPC+ known-destination movement; retained across unrelated turns; the scene follows co-location; save/load preserves it; OFF_SCENE is a real authoritative state; no duplicate authority; re-entry works; D-24 closed; prior follows green; zero new false positives. **`MOVEMENT_FOLLOW_SUBSYSTEM_FROZEN`.** The one open item is the live run of the prepared probe, which cannot change a correctness property, only measure recall.
