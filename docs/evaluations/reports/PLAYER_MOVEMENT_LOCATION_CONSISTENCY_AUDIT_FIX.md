# PLAYER MOVEMENT / LOCATION CONSISTENCY FIX

## 1. Scope

Deterministic audit and bounded fixes to destination resolution and arrival reconciliation. No global movement redesign, new P-number, coordinates, pose state, NPC following, route/time changes, provider changes, retrieval changes, or UI styling changes. P3, P11, P12.1, P12.2, household, economy, legal state, promotion, and the streaming authority boundary are unchanged.

## 2. Reported playthrough symptoms and evidence limits

The player reported an approach to a man leaning on a post within the licensed private sellers area, followed by a West Guard Post header while narration stayed in the market. Later narration claimed a Heartstone return while the header remained at the market.

The licensed private sellers are a feature of `calderan_slave_market`, not a separate world node. No original save, turn trace, or precise later home-return input was supplied. Consequently the historical turns cannot be reconstructed as proven executions. The old source was loaded from Git HEAD, transpiled into an ignored probe module, and exercised against the authored world for a controlled before/after comparison.

Important qualification: the literal unmarked `goes to the man leaning on the post Hello` is speech under the current bounded input grammar and does not move the player, even before this fix. In an action segment, `*goes to the man leaning on the post* Hello`, the old resolver demonstrably selects West Guard Post. Including `Hello` inside the destination phrase instead makes the old final-token fallback see `hello` and return no destination. This pass fixes the proven resolver defect and adds regressions for both the literal report and its action-marked equivalent; it does not claim an unavailable historical trace proves which input form ran.

## 3. Authoritative player location

`CampaignState`'s committed snapshot field `snapshot.runtime.scene.player_location` is authoritative. Player travel uses a typed `runtime_delta` carrying `player_location` and the existing route minutes; there is no separate `move_player` command here.

`RuntimeState` constructed in `buildTurnContext` is a detached compatibility projection of that snapshot. Scene RAM, NarrativeContext, session view, and the browser header are projections. None independently commits a player destination.

## 4. Movement-intent pipeline

`resolveTurnIntent` builds base context and a participant plan, then calls `playerIntent`. Strict `/go`, `go to`, `head to`, and selected first-person forms use the shared resolver and reachability check. Natural movement is recognized inside asterisks or bounded named third-person scene directions. Unmarked first-person movement has its own bounded clause grammar and negation/modality gates. Bare subjectless third-person verbs are not globally treated as travel.

`resolveMovement` returns resolved, blocked, already-here, or unresolved diagnostics. Resolved travel proposes a runtime delta. Unknown natural targets produce no command; disconnected known targets produce no command and a narrator-facing non-arrival note. Explicit invalid command forms fail the turn. Trusted runtime intents are prepared/validated before narration; the controller does not acquire travel authority from draft prose. The detached arrival context is used for narration. Authorization handles outcome-dependent candidate effects. Audit and reconciliation inspect prepared outcomes. Commit preparation validates the complete batch; `campaign.commit(plan.receipt)` publishes the atomic state change. Finalized recent conversation and participant continuity are published afterward.

## 5. Destination candidates and matching evidence

The shared resolver examines player/narrator-visible canonical locations, first comparing the whole phrase to IDs, names, display names, and aliases. Next it uses `entityMentions`: explicit name runs have score 2; qualified/deictic near-name evidence has score 1. A uniquely higher score wins. This is deterministic lexical matching, not semantic retrieval or paid model inference.

The old final fallback stemmed the LAST token of any phrase and compared it to final tokens of location names, aliases, and feature names within the current city ancestry. This fallback has no numeric score: exactly one matching location wins regardless of how descriptive the rest of the phrase is.

Controlled original evidence for `the man leaning on the post`:

| Stage | Candidates/evidence | Outcome |
|---|---|---|
| Whole-name/ID/alias matching | None | No exact destination |
| Explicit/near-name mentions | Empty map; no score 2 or score 1 location | No mentioned destination |
| Old city-scoped final-token fallback | Stemmed `post`; unique candidate `west_guard_post` from `West Guard Post` | Wrong destination selected |
| Structural reachability | Valid graph route | Wrong intent accepted structurally |

Route: `calderan_slave_market -> west_outer_lane -> heartstone_square -> west_arterial_south -> chevalier_fountain -> gatherers_inn -> main_market_square -> west_guard_post`. Costs: 8 + 12 + 8 + 7 + 8 + 7 + 3 = **53 minutes**. Reachability validates geography; it cannot repair a falsely classified destination.

## 6. Root cause A and first divergence

The first divergence is destination selection, before routing, authorization, commit, or UI projection. A person-description modifier became a destination through the last-token fallback. Given that action-marked input, the old natural resolver proposes `{ kind: "runtime_delta", delta: { player_location: "west_guard_post", time_advance_minutes: 53 } }`. It passes the existing trusted runtime preparation path because the node and route are valid. A successful turn can therefore commit the wrong destination and legitimately project the wrong header. The UI is not the cause of this controlled false positive.

## 7. Local actor/feature precedence

Whole canonical destinations retain precedence when explicitly named as the complete target. Otherwise bounded person/object heads and present character names/aliases veto location mentions embedded in their descriptions. Examples include `the man at West Guard Post`, `the woman at Heartstone Tower`, and `the table by the bridge`. No incidental noun is blacklisted: `post`, `gate`, `square`, `tower`, `market`, `hall`, `bridge`, `temple`, and `dock` remain usable in canonical destination names.

The lexical feature fallback now requires a single content-token destination. It cannot mine the tail of a longer description. Existing participant/focus resolution is retained: the participant plan is constructed before intent parsing, and canonical actor and carried ephemeral participant interaction targets are handled by the existing participant resolver. A local approach need not commit a world location. This fix does not invent participants, disambiguate multiple men by arbitrary descriptive modifiers, or add a new focus/pose command.

## 8. Explicit travel behavior

Canonical West Guard Post, Heartstone Tower, Slave Market, Heartstone, Heartstone Living Floor, and West Gate all still resolve using existing evidence. Starred `goes to <destination>` retains the exact existing route delta. Same-location travel remains a no-op. `/go Heartstone` and `*goes back to Heartstone*` retain existing behavior. The latter reaches the authored Heartstone entrance `heartstone_lr`.

Canonical Heartstone Living Floor is exact-matched even though generic mention evidence includes both the container and its floor. West Gate resolves exactly to `center_west_gate`, despite a separate West mention. Exact ties now fail closed. We do not expand unsupported bare subjectless phrases or add `heads for` travel grammar: use the existing supported command/action forms. Existing route planning and summed minutes are unchanged.

## 9. Heartstone return reproduction

Current node: `calderan_slave_market`. Supported input: `*goes back to Heartstone*`. Resolver: `heartstone`; authored entrance: `heartstone_lr`. Route: `calderan_slave_market -> west_outer_lane -> heartstone_square -> heartstone_lr`; costs 8 + 12 + 1 = **21 minutes**. Runtime delta commits to `heartstone_lr`, not the container. Draft `Nicco enters Heartstone Tower.` is consistent with that committed descendant location and may survive delivery.

## 10. Runtime / RAM / context / session / HTTP / DOM trace

| Projection | Before | After accepted return | After local post approach |
|---|---|---|---|
| Committed runtime | `calderan_slave_market` | `heartstone_lr` | `calderan_slave_market` |
| Scene RAM `player_location` / current entity | Market | Heartstone LR | Market |
| NarrativeContext primary scene location | Market | Heartstone LR | Market |
| `GameSession.getView()` | Slave Market | Heartstone LR | Derived from unchanged market snapshot |
| Final NDJSON/UI server location | Slave Market | Heartstone LR | Derived from unchanged market snapshot |
| Browser header | Slave Market | Heartstone LR after final result | Market |

Tests exercise accepted return through the real coordinator, GameSession, local HTTP server and final NDJSON. A separate DOM harness feeds the same market-to-Heartstone final label to the real browser client and verifies the header transition. This is deterministic HTTP/DOM verification, not a live browser or production provider playthrough.

No stale projection seam was reproduced in accepted travel. All examined downstream builders use committed state. Root cause B for the original historical turn remains unproven; the controlled inconsistency below is a narration recognition failure, not a cached UI header.

## 11. Streaming/finalization interaction

`TurnCoordinator` may stream provisional draft previews, then audits/revises, prepares and atomically commits. GameSession obtains the final view after `turn_completed` and commit. The HTTP server forwards preview events as `draft` with no scene payload and sends final `result` from `session.getView()`. `client.js`'s `preview()` touches the provisional narration bubble/status only; `renderScene()` updates location/time/household from final state. The regression proves draft `Nicco enters Heartstone Tower.` cannot change a Slave Market header. Audited narration deltas can precede commit but remain explicitly provisional in GameSession; they do not change header authority.

## 12. Narration/state reconciliation and home entry

The existing movement audit already rejects `Nicco enters Heartstone Tower.` when prepared state remains at the market. It triggers the existing bounded revision; a revision repeating the contradiction is re-audited and redacted. Accepted Heartstone travel allows that arrival because `heartstone_lr` is inside Heartstone.

`*enters home*` is not recognized by the existing movement grammar, has no canonical alias, and is not a typed doorway traversal. The old movement audit silently skipped named `Nicco enters home.` because destination resolution returned undefined. This is a proven final-arrival escape: no movement command, unchanged market runtime/projections, but unsupported arrival prose. The fix flags that unresolved home arrival as `uncommitted_movement`, using existing revision/redaction without guessing a residence or broadening travel authority. A test deliberately repeats the invalid draft as the revision to exercise deterministic fallback.

For now even at a residential node, use a canonical location when describing arrival: an unresolved `home` arrival is conservatively flagged. Pronoun-only or ornate indirect arrival descriptions remain outside this audit's bounded grammar; this pass does not claim a universal semantic guarantee for every possible narrator sentence.

## 13. Fix implementation

- `src/turn/natural-actions.ts`: fail closed on exact ambiguity; bounded local person/object and present-name veto after whole exact matches; restrict final-token lexical fallback to a single content token.
- `src/turn/narration-audit.ts`: unresolved named home arrivals become movement audit issues rather than escaping reconciliation.
- No mutable location state or UI projection/update change was needed. No grammar expansion, retrieval change, new time system, automatic NPC movement, or new P-number.

## 14. Regression tests and validation

`tests/player-movement-location-consistency.test.ts` covers the real literal input and action-marked equivalent, the controlled incidental post collision, other local actors/features, incidental canonical place names, preserved canonical travel and route deltas, runtime/RAM/context agreement, supported Heartstone return through GameSession and HTTP NDJSON, and uncommitted canonical/home arrival redaction.

`tests/ui-v1.test.ts` adds a real client DOM regression: provisional Heartstone arrival keeps the Slave Market location/time; final committed result changes the header to Heartstone LR and the final daypart.

Validation:

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | 2,335 tests: 2,331 passed, 0 failed, 4 historical TODOs |
| `npm run test:playthrough` | 25 passed, 0 failed |
| New movement and UI V1 focused run | 29 passed, 0 failed |
| Movement/routing/context/session/UI focused group | 152 passed, 0 failed |
| P12.1/P12.2/scene/participant/focus/follow group | 170 passed, 0 failed |
| `npm run build --silent` | PASS |
| `git diff --check` | PASS |

Focused groups overlap; they are not additional unique tests beyond the full suite. The initial sandboxed `npm test` could not spawn Node workers (`EPERM`); it was rerun with approved process permissions. Four historical TODO tests are retained unchanged. No functional failures remain.

## 15. Remaining limitations

The original input framing and historical later return were not supplied as traces. We have proven the action-marked resolver failure and unresolved named home-arrival audit gap, not reconstructed both historical turns. Subjectless unmarked `goes ...` remains unsupported for authoritative movement. Arbitrary actor descriptions are not general NLP referents; ambiguous local focus is handled by existing participant machinery. The movement audit remains bounded, particularly for unnamed/pronoun-only or indirect arrival claims. No broader architectural debt ID is proposed based on this evidence.

## 16. Live verification and cost

No live narrator/controller or embedding provider calls. All provider outputs in new regression tests are scripted. Paid calls: **0**. Cost: **0**. Local HTTP test servers only. No push or deployment.
