# Companion / group movement fix

Date: 2026-10-14. Base: main `c6aa15b` (blocks B1 to B5 pushed). No live provider call, no image generation, no Controller schema change, no save schema change, nothing persisted for following.

## 1. Root cause

**The exact repro already moves both people on main.** Since consolidation block 3 (`31d82cd`), "Alright Maren, i just purchased you, let's go home" after the recorded purchase (Actual Offer, Accept, the woman shown as Slave and later named Maren) commits Nicco's travel and Maren's `move_character` to `heartstone_lr` in the same batch, through the `player_runtime` lane (held-person escort). It still works after a save and load and an intervening turn. This was re-proven on `c6aa15b` with a scripted GameSession replay of the recorded playthrough, not assumed.

What still failed on `c6aa15b`, found by replaying the real playthrough and the spec's own example inputs:

| # | Failure on main | Class | Exact cause |
| --- | --- | --- | --- |
| 1 | On the real "let's go home" turn the delivered narration was **redacted** and a revision was requested. The sentence "Maren keeps pace a half-step behind and to the left." was cut, and the revision told the Narrator "NOT COMMITTED: Maren has not left; they are still present in the scene." | E, narration side | The audit's "who moved" set (`narration-audit.ts`, `relocated`) was built from `committed: i.authorized` only. That is the authorization batch, without the `player_runtime` lane where the escort lives, and it excluded moves to Nicco's own arrival. So the audit read the escorted Maren walking along with him as an unrecorded departure. Live, that revision instruction pushes the Narrator to write the companion as still at the market while the state has her at Heartstone. |
| 2 | "Come with me, we're going home.", "We're going home.", "I'm going home." and "ok Maren lets go home" did not move **Nicco** at all, so there was no travel for anyone to share. | B | `resolvePlayerTravel` accepted only the subjects `i`, `we` and `let's` at the start of a clause. `we're`, `we are`, `I'm` and `I am` were not subjects, and a leading vocative without a comma ("ok Maren lets ...") hid the subject. |
| 3 | An unnamed lead ("Come with me. I go up to ...") never escorted the one held person, even when she was the only person there. | B | `resolveHeldEscort` required her name by design (block 3: "no unnamed come with me"). |
| 4 | "I go home." plus the prose "Maren is at Heartstone." plus a Controller `move_character` moved Maren, with no lead from the player at all. | D, too permissive | `characterMovementsFromFacts` let a location claim at the arrival support **any** follow candidate (held, household, NPC+). The claim was accepted as evidence for a move nobody asked for. |

Classes that were ruled out on the real path:

- A: she is a candidate (`held_by_player`).
- F: the commit updates `current.current_location`.
- G: SessionView and the Scene State Projection read the committed record, with no stale copy.
- H: the escort binds the materialized record's own id, the same id the purchase settled and the late naming renamed. There is no name lookup.
- I: the escort is resolved and prevalidated together with Nicco's travel before the provider call.

## 2. Failing path, step by step (real playthrough, `c6aa15b`)

1. Intent: `resolvePlayerTravel` resolves "let's go home" to `heartstone_lr`. `resolveHeldEscort` finds Maren (held, present, named in a lead sentence) and adds `move_character(Maren, heartstone_lr)`. The pair is prevalidated.
2. Projection: Maren is at the arrival in the projected state. The Narrator note says "Nicco leads Maren along with him ... NOT left behind".
3. Authorization: nothing more for her (the escort already moved her; derived proposals skip a mover already at the destination).
4. **Audit:** `departuresFromFacts(..., broad)` reads "Maren keeps pace a half-step behind" as a departure. Maren is not in `relocated`, because the escort is not in `committed` and its destination equals the prepared player location. That gives an `uncommitted_departure` issue, a revision request, then the sentence redacted on delivery.
5. Commit: both locations are committed correctly (revision +1). The delivered prose is damaged.

## 3. The rule after the fix

A person moves with Nicco on inter-location travel only when the current turn evidences it. The answer is derived per turn: there is no party, follow flag, escort membership or roster, and nothing new is saved.

| Strongest evidence (first wins) | Who | Lane | Destination |
| --- | --- | --- | --- |
| Physical carry by the player | a present Campaign person | `player_runtime` | Nicco's resolved arrival |
| Escort, named: the player's words name and lead them ("Alright Maren, let's go home.", "Maren, come with me. We're going home.", "ok Maren lets go home") | each present person Nicco holds who is named and led (several together are supported) | `player_runtime` | Nicco's resolved arrival |
| Escort, unnamed: a lead with no name ("Come with me, we're going home.") | the ONE held person present, only when nobody else is present (no other persistent character in the scene, no temporary participant) | `player_runtime` | Nicco's resolved arrival |
| Completed narrated follow of that named person ("Bryn follows him up into the observation room.") | any follow candidate: held, household member, active NPC+, invited by name | `preferred_authorization` (derived or Controller `move_character`, verified) | Nicco's arrival |
| Location claim at the arrival ("Inside the Observation room, Bryn waits.") | only a candidate the player invited **by name** this turn | `preferred_authorization` | Nicco's arrival |

- **Atomicity.** A companion moves only inside the batch that moves Nicco. If his travel does not resolve (unknown place, "tomorrow", a question, no destination such as "Follow me.") or is blocked, nobody moves. A stale `expected_revision` rejects the whole turn (`stale_turn`).
- **Destination.** The companion's `move_character` uses Nicco's resolved arrival (`moved.delta.player_location`). "home" is never resolved a second time.
- **Fail closed.** These move nobody:
  - an unnamed lead with anyone else present (the real market has Bartolomhew, Korvin and Mistress Elara);
  - two held people and an unnamed lead;
  - stay or refusal wording;
  - a held person nobody led;
  - a gaze ("Maren watches him leave.");
  - a hedge ("Maren should probably go home sometime.");
  - a lone "I'm going home." (Nicco moves, Maren stays);
  - a location claim for anyone the player did not invite by name.
- **Authority unchanged.** The player's words alone never move a free person. A household member or NPC+ follows only on a completed narrated follow of that person, or on a claim after the player invited them by name.

## 4. Files

| File | Change |
| --- | --- |
| `src/turn/movement/player-travel.ts` | Subjects `I'm` / `I am` / `we're` / `we are`; a leading interjection or present person's name before a cohortative subject ("ok Maren lets go home"). Gates unchanged ("going to", negation, future, questions). |
| `src/turn/movement/follow-candidates.ts` | `resolveHeldEscort`: unnamed lead for the sole held person when nobody else is present (`bystanders`); doc comment updated. |
| `src/turn/stages/intent.ts` | Passes the count of temporary scene participants as `bystanders`. |
| `src/turn/audit/narration-audit.ts` | `companions` input; on a travel turn, runtime companions and every move to Nicco's arrival count as relocated (no `uncommitted_departure` for them). |
| `src/turn/stages/audit.ts` | Passes the intent's runtime `move_character` ids as `companions`. |
| `src/turn/movement/movement-evidence.ts` | `characterMovementsFromFacts(..., claimants)`: a location claim supports only `claimants` (defaults to `followers` for the dev probes). |
| `src/turn/stages/authorization.ts` | `claimants` = candidates left at the origin whom `invitedFollowers` finds invited by name in the player's words. |

Not touched: Actual Offer, person settlement and materialization, provisional Slave naming, Reflection, Mannerism, Property, containers, equipment, currency, NPC+ lifecycle, contracts, weather, UI. The coordinator is unchanged (162 lines).

## 5. Identity, projection, save/load

- **Same entity.** The real-path test checks that Maren's record after the move equals her record before it except `current.current_location`: same id, origin, name, origin snapshot, legal status (holder `nicco`). There is still exactly one Campaign character. No name lookup is involved anywhere in the escort.
- **No identity leak.** An unnamed bought person (label "Slave", no name) is escorted by "Come with me" when alone with Nicco. The Narrator note says "Nicco leads Slave along with him"; it carries no id and no invented name.
- **Projection.** Right after the turn, with no extra turn and no reload:
  - `SessionView.scene.location.id` is `heartstone_lr` and Maren is in `scene.present`;
  - the Scene State Projection built from the committed state lists Maren (by name) as the only person with Nicco.
  On the next turn at home she is the same person in the scene: no fork, no new participant, name kept.
- **Save and load.** After save, shutdown and load, both locations, the id, the name and the ownership are preserved, along with the accepted purchase in the offer history. The loaded snapshot equals the saved one. The save has no `party`, `follow*`, `escort*`, `companion*` or `roster` key.

## 6. Trace

The trace's `committed_lanes` for the real turn shows `player_runtime` `runtime_delta` then `player_runtime` `move_character`. `committed_command_kinds` holds exactly one `move_character`. Preparing `TurnResult.committed` from the starting state reproduces the committed state exactly, so there is no untraced repair path. On the real turn the narration reconciliation is `delivered: "draft"` with no issues, and the delivered text is the recorded narration, byte for byte.

## 7. Tests

`tests/movement/companion-group-movement.test.ts` has 16 tests. 7 of them fail on `c6aa15b` (the real regression, the spec forms, player travel, M10/M11, the unnamed lead, M15, M10b); all pass on the fix.

| Spec | Test |
| --- | --- |
| Real regression, M1-M6 | the recorded playthrough through Accept and the name; "Alright Maren, i just purchased you, let's go home"; both at Heartstone, one revision, same id and record, lanes, SessionView, Scene State Projection, narration delivered whole |
| M1 forms | six named or vocative forms (including "ok Maren lets go home" and "Maren, follow me. We're heading home.") with a pronoun-only narration; "Follow me." and "Come on, we're leaving." move nobody (no destination) |
| Player travel | the new subjects and vocative resolve; "going to", negation, "tomorrow", a hedge, a question and "Maren goes home." do not |
| M7 | the destination is unknown, deferred or nowhere: nobody moves |
| M8 | a stale revision commits nothing; a companion already elsewhere is not teleported or duplicated |
| M9 | escort, narrated follow and a Controller proposal for the same person: one `move_character` |
| M10, M11 | "I'm going home.", the claim, the gaze, the unnamed "Let's go home." and "Come with me, we're going home." among three others, and the hedge: Maren stays; a Controller move backed only by the claim is rejected |
| M10b | a claim supports a household member invited by name; uninvited, she stays and the claim is withdrawn by the audit; a held person nobody led is not moved by a claim |
| M11b | named but told to stay, refused or forbidden: stays |
| M12 | two held people named together both move in one revision; a free household member named and led moves on her narrated follow (lane `preferred_authorization`), not on the player's words alone; held plus free together; the plural narrated subject limit |
| Unnamed lead | sole held person alone moves; with a second held person, a free person, a temporary participant, a non-held person or stay wording, nobody moves |
| M13 | save/load |
| M14 | trace lanes and replay of the committed list |
| M15 | unnamed Slave escort under its label only |
| Continuity | the next turn at home keeps Maren in the scene, same id and name |

One test was changed deliberately: `escort-and-follow.test.ts` M4 is renamed. It still passes unchanged. Its unnamed lead fails closed because the fixture room's authored NPCs are present, which the new rule also requires.

## 8. Behavior outside the fix

On all 55 benchmark scenarios and the 24 curated playthrough records (152 turns), the committed state and the delivered narration after every turn are byte-identical between `c6aa15b` and the fix (per-turn sha256 of `exportSnapshot()` and of the narration). All 55 benchmark verdicts are identical.

## 9. Limitations (fail closed, unchanged by design)

- **Multiple followers.** Several held people named together move atomically. For a free person the narrated follow must name that person in its own clause. "Tessa and Bryn follow him" moves the held Tessa (escort) but not the free Bryn, because the plural narrated subject is not read as Bryn's own follow.
- An unnamed lead with anyone else present, including authored NPCs who cannot move, never moves anyone. At the real market (three other people present) the player has to name her.
- A pronoun-only narrated follow of a free person ("She follows him.") is not evidence.
- Only Campaign people follow. A purchased **authored** NPC (legal status held by Nicco, no Campaign record) is not a follow candidate. Decision 5A (materialize into a Campaign record) is not implemented here.
- Travel phrased "going to <place>" stays gated as intention ("I'm going to buy her" and "We're going to Heartstone" alike). The player-authored action prose of the old live failure (benchmark M11: "*she follows him out of the market ... in through the door of Heartstone*") still does not resolve Nicco's travel, so nobody moves and the audit withdraws the false location.

## 10. Validation

Sequential run from a clean `.build`: typecheck and build exit 0; `npm test` **3780 tests, 3780 pass, 0 fail** (+16); `npm run benchmark:modern` 55/55, 0 known gaps; `npm run check:architecture` 362 modules, 0 runtime back edges; documentation 373 links, 0 broken; 51 scripts, 0 syntax errors; all nine browser checks exit 0.

## 11. Live certification plan (prepared, NOT executed)

This is one focused run, only if the user asks for it. It uses the production Narrator (`z-ai/glm-5.2`) and Controller (`openai/gpt-6-luna`).

1. Seed the settled result of the certified purchase flow: Maren held by Nicco at the market, as in `src/dev/consolidation-block3-live.ts`.
2. Run turn 1: "Alright Maren, i just purchased you, let's go home".
3. Run turn 2: "Come with me, we're going home." from a fresh seed where Maren is alone with Nicco.

For each turn, record: both locations, the committed lanes, `narration_reconciliation.delivered` and its issues, and the number of Narrator calls (expected: 1, no revision). Pass when both people are at `heartstone_lr` with one created character, no `uncommitted_departure` and no revision.
