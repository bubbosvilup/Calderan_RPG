# Campaign character location continuity: pass 1.3

2026-10-01. This pass changed runtime rules only: no party or follower system, no NPC+, no new lore, no canon YAML changes, no extra LLM call. Test prose is fixture text. Nothing is committed or pushed.

| Gate | Result |
|---|---|
| Typecheck | PASS |
| Deterministic tests | 931/931 (926 before; 5 new in `tests/location-continuity.test.ts`) |
| Playthrough | 25/25 |
| Coordinator regressions and save/load | PASS |
| Escape scan | clean apart from the two known false positives |
| Source hash (`src/`+`data/`) | 2bf45dc4… → 61c92f01… (data unchanged) |

**Answers to the brief's four questions:**
1. **After Nicco buys Maren and carries her to Heartstone, is her runtime location Heartstone?** Yes: when he carries her into the tower she arrives with him, at `heartstone_lr`. **But the literal journey from the slave market cannot happen yet**, for Nicco either: the canon location graph has no travel connection out of the slave market (§A). The regression therefore performs that missing city leg with an explicit, documented harness step. The final leg into the tower (square → living floor) runs through the real pipeline.
2. **Does the named slaver stay at the encounter location rather than following Nicco?** Yes. Oswin, promoted by name, stays at `calderan_slave_market` through the purchase, Maren's departure, Nicco's arrival home, and save/load.
3. **After Tomas is named, healed and left behind, does he stay in the square when Nicco returns to Heartstone?** Yes. Tomas stays at `heartstone_square`, is absent from the narrator's context inside the tower, and reappears when Nicco walks back out to the square.
4. **Was this done without a follower or party system or an extra LLM call?** Yes. It reuses `move_character` through the existing controller call, with deterministic evidence and one deterministic runtime rule for player-authored carrying.

## A. Existing location architecture (audit)

1. **A suitable command existed:** `move_character {character_id, location_id}`. For a created character it sets `current.current_location`; for a canonical one it writes runtime `npc_locations`.
2. **It worked for created campaign characters.** It validates that the location exists.
3. **The controller could not propose it.** It was absent from `CONTROLLER_SCHEMA` and fell through to `rejected_command_not_allowed` in the authorizer. The only related command was `leave_scene` (location cleared, destination unknown).
4. **Destinations.** Player movement uses `resolveDestination` (entity mentions and head nouns within the city) and `reachable`, which requires a **direct connection**, and enters a container such as the tower through its one connected child (square → `heartstone_lr`). There is no teleport: an unconnected destination is blocked with a narrator note.
5. **Same-turn commits.** Player movement and purchases are runtime commands, prevalidated before narration. Controller commands are authorized after narration. All of them commit in one `campaign.prepare` from the base revision, so a movement could commit with player movement or a purchase in the same turn.

**Other findings:**
- **Presence.** A created character is present when `current_location` equals the player's location. The audit flags a created character narrated as acting while not present (`absent_participant`), including one travelling with Nicco, because nothing ever moved them.
- **The city graph is unconnected.** Only Heartstone's rooms (square ↔ living floor ↔ courtyard ↔ upper floors) and two other places have `connections`. The slave market and 60+ other locations have `connections: []`. Nicco cannot walk from the market, or from Heartstone Square into the city, through natural movement.
- **This pass does not change that.** Adding routes is canon-data authoring, which the brief rules out. The slave market's canon text already says it is "about 20 minutes' walk from Heartstone"; a data pass could add that connection.

## B. Movement command reused

- **No new command.** The existing `move_character` is reused.
- **Controller access.** It is added to `CONTROLLER_SCHEMA`, with one policy line in the DeepSeek controller: use it only for a listed movable character narrated as having completed movement to a known place. Nicco moving, ownership, household membership, looking toward a place, plans or promises never move anyone.
- **Controller envelope.** It carries `movable_characters` (ID, name, location) only when there are any, so the envelope is unchanged in ordinary scenes. There is still one controller call.

## C. Evidence and authorization

**Evidence grammar.** `narratedMovements` (`src/turn/character-movement.ts`) produces `TurnEvidence.character_movements`.
- **Movers:** living created characters in the scene Nicco is in or is leaving this turn (base and projected locations).
- **Completed movement only**, for example:
  - "Nicco carries Maren into Heartstone" / "He carries her through the tower door";
  - "Maren follows him into the courtyard" / "Tomas walks back to the Calderan Slave Market";
  - "Maren was carried into …";
  - "They reach Heartstone, Maren still in his arms".
- **Rejected:** gaze ("looks toward"), plans ("he'll bring her home later"), modality, promises, negation, questions, and movement toward a place.
- **One mover:** a name, or a pronoun only when exactly one movable character is compatible. With two women present, "She follows him" moves nobody. Subject "he" never resolves, because it is usually Nicco.
- **One concrete destination** (see E).

**Authorizer.** `move_character` is authorized only for a living created character, not already at that place, with matching movement evidence (`authorized_narrative_confirmation`). Otherwise it is `rejected_insufficient_confirmation`.

**Leaving a scene.** When Nicco leaves a scene, the narrator is told who stays behind: "Tomas stays there: do not have Nicco bring or carry them. Someone comes along only if they themselves clearly follow him, narrated explicitly."

**Audit.** A created character whose move to Nicco's location commits this turn is not flagged absent.

## D. Carrying and escort

`resolvePlayerCarry` handles a runtime player action before narration.
- **What counts as carrying.** When the player's own input carries a present campaign character as part of Nicco's resolved movement, the carried person gets `move_character` to his arrival location. That can be "carries Maren into Heartstone", "picks Maren up and walks into Heartstone", or Maren "in his arms" on a walk.
- **Why it is automatic.** Transport is the player's own physical act, like his own movement. It is prevalidated with his movement, and the narrator sees her already present at the destination.
- **Route and phrasing.** No route means no carry: the narrator is told neither has arrived. "Walks into Heartstone alone" and "thinks about carrying Maren" move nobody.
- **Consent.** A person who comes along *on their own* ("she follows him") is not player-authored. It goes through narration evidence and the controller (§C), and the narrator is told not to make Nicco bring anyone the player did not.
- **Nothing extra is needed:** no follower flag, household membership, consent state or party slot.

## E. Destination resolution

`concreteDestination` resolves a destination phrase to exactly one known location, never a dynamic one:
- A resolved location equal to Nicco's arrival, or **containing** it ("Heartstone" when he arrived in `heartstone_lr`), resolves to his arrival location. A tower entry therefore lands where normal movement puts him (`heartstone_lr`), not on an invented "tower" location.
- Any other resolved location counts only if it has no sub-locations. A container Nicco did not enter is ambiguous and rejected.
- An entry phrase ("the tower door", "inside", "home") resolves to Nicco's arrival location only if he arrived somewhere new this turn; otherwise it resolves to nothing.
- Anything unresolved rejects the move.

## F. Maren regression (coordinator)

1. **At the market,** a lean slaver stands by the cages with a feverish girl behind the bars. "What's your name?" "Oswin," the slaver says. Oswin becomes exactly one campaign character at `calderan_slave_market`: `name_established`, not household, no NPC+ state.
2. "That one's Maren. Debt forfeiture." Maren becomes exactly one campaign character at the market.
3. **Offer and purchase:** "Three gold for Maren." Then "Done. \*pays him\*". The holder is Nicco and the transfer is from Oswin. Maren stays at the market and the household is unchanged.
4. **"\*picks Maren up and carries her back to Heartstone\*"** at the market: no route exists, so the narrator is told neither has arrived. Nicco and Maren both stay at the market; nothing teleports or desyncs.
5. **Harness step (not engine behaviour):** the missing city leg. The test applies Nicco to Heartstone Square and Maren to Heartstone Square.
6. **"\*carries Maren into Heartstone\*"** runs through the real pipeline:
   - Nicco and Maren both end at `heartstone_lr`, with the holder still Nicco;
   - no household membership and no relationship edges;
   - Oswin is still at the market;
   - exactly one Maren and one Oswin.
7. **Next turn:** "Character Maren" appears once in the narrator context, and Oswin does not.
8. **Save/load** preserves Maren at `heartstone_lr`, Oswin at the market and Nicco at `heartstone_lr`.

**Same-turn purchase plus carrying** (a separate test, at a connected location): "Done. \*pays him and carries Maren into Heartstone\*" commits the purchase and both moves in **one** revision. The holder is Nicco, and the seller stays in the square. Transaction validation is unchanged.

## G. Chestnut-boy regression (coordinator)

- **Setup, in Heartstone Square:** Nicco notices the chestnut boy, introduces himself and asks his name ("Tomas," the boy says). Tomas becomes exactly one campaign character at `heartstone_square`.
- **Heal and leave:** Nicco heals the burn, says goodbye, and walks back into Heartstone. The narrator is told "Tomas stays there".
- **Result:** Nicco is at `heartstone_lr`, Tomas stays at `heartstone_square`, and there is one Tomas, no household membership, no relationships and no NPC+ state.
- **Inside the tower:** the narrator context shows no Tomas.
- **Returning:** Nicco walks out to the square, and "Character Tomas" is in context again.
- **Save/load** keeps Tomas in the square.

## H. Negative and positive movement tests

| Case | Result |
|---|---|
| A. "Maren looks toward Heartstone." | no movement |
| B. "Nicco says he'll bring Maren home later." | no movement |
| C. "Nicco leaves the square and heads inside." | Maren does not move |
| "Maren could follow him inside, but she stays." | no movement |
| D. "Maren follows Nicco into Heartstone." | Maren moves to `heartstone_lr` |
| E. "Nicco carries Maren into Heartstone." / "He carries her through the tower door." / "They reach Heartstone, Maren still in his arms." | Maren moves to `heartstone_lr` |
| "Maren follows him inside." when Nicco did not move | no movement |
| "Maren walks back to the Calderan Slave Market." | Maren moves to the market |
| F. Named seller when Nicco and Maren leave | stays at the market (§F) |
| G. Two women: "She follows him inside." / "He carries her…" | no movement; "Lysa follows him inside" moves only Lysa |
| Player "\*carries Maren into Heartstone\*" | Nicco and Maren move together |
| Player "\*walks into Heartstone alone\*" / "\*thinks about carrying Maren inside\*" | nobody else moves |
| Controller: Nicco walks to the courtyard, and "Maren follows him into the courtyard" | Maren authorized to move. A proposal to move Brenna (household, not narrated moving) is rejected, and she stays |
| Controller: "\*walks back into Heartstone alone\*" with a proposal to bring Maren | rejected; she stays in the courtyard |

## I. Context and presence

Existing presence logic is unchanged: a created character is in the narrator's context exactly when `current_location` equals the player's location.
- **After a committed move,** the next turn shows them at the new place and not at the old one.
- **During the move turn,** a carried person is already at the destination in the projected context, and an evidenced follower's move commits with the turn, so the audit does not strip them.
- **No follower inference** exists anywhere.

## J. Save and load

Round trips preserve three locations with no transcript dependency: Maren at `heartstone_lr`, Oswin at the market, and Tomas in the square.

## K. Remaining limitations

1. **The city is not traversable.** Travel between districts is not modelled in canon data: the slave market and most city locations have no connections. The historical walk home from the market cannot happen for anyone yet, and the regression performs that leg with a documented harness step. A data pass adding travel connections (the market's canon text already gives a 20-minute walk to Heartstone) would make the full flow live.
2. **Same-turn name and movement.** Someone promoted by name in the same turn cannot also move that turn, because promotion happens at finalization, after authorization. They can move on the next turn. A person named during a turn in which Nicco also leaves is placed where Nicco ends the turn.
3. **Heuristic grammar.** The movement grammar is deterministic but heuristic. Unusual phrasings, such as a destination only described ("the building with the green shutters"), change nothing. Failures are safe.
4. **Out of scope:** canonical NPCs moved by narration (not a campaign-character need here) and anonymous people (they have no location to keep).
5. **Unchanged idiom.** "Heartstone Square" is not resolved by ordinary player movement from inside the tower, though "the square" is. This is existing natural-movement behaviour.
6. **No live run.** No live LLM run was made. The controller's recall for `move_character` is untested live, and the omission diagnostics will show it.

## L. Tests

`tests/location-continuity.test.ts` (5 tests):
- the Maren regression (coordinator, with the documented harness leg, save/load);
- the chestnut-boy regression (coordinator, return visit, save/load);
- the movement grammar positives and negatives, including two-women pronouns and player carrying;
- the controller path (an authorized follow, a rejected co-move of a household member, a rejected "walk home alone");
- a same-turn purchase plus carry committed atomically.

The full suite passes unchanged, including the controller-envelope test: the new key appears only when someone is movable.

CAMPAIGN CHARACTER LOCATION CONTINUITY PASS 1.3 PARTIAL
