# Player Travel Authority and Location Safeswitch Implementation

## 1. Audit baseline

Implemented the approved second pass over `7bb6bbb`, using `PLAYER_TRAVEL_AUTHORITY_FULL_AUDIT_AND_PLAN.md`. The protected movement fix `e4b3a45` remains intact. The previous audit script and recorded traces describe the historical baseline; they were not rerun to overwrite that evidence.

One authority remains: the privately owned CampaignState snapshot's `runtime.scene.player_location`. Narration, Scene RAM, NarrativeContext, session views and HTTP/UI projections never become independent mutation authorities.

## 2. Production changes

| Files | Change |
| --- | --- |
| `src/turn/player-travel.ts` | One bounded player travel detector, exact destination mode and configured player home. |
| `src/turn/player-intent.ts` | Natural input uses that detector; strict `/go` uses exact destinations; reserved `/location` is rejected. |
| `src/turn/natural-actions.ts` | Resolve player travel once over the complete input; retain existing non-travel action processing and shared NPC destination resolver. |
| `src/turn/travel-resolution.ts` | Extract the existing unchanged `reachable` wrapper into a dependency leaf, avoiding a runtime import cycle. |
| `src/turn/character-movement.ts` | Carry-derived player destinations use the strict player resolver; competing player travel cannot be rescued by carry. NPC follow/movement algorithms are untouched. |
| `src/turn/narration-audit.ts`, `src/turn/stages/audit.ts` | Bounded current-player arrivals use pre-projection movement diagnostics and existing issue/revision/redaction machinery. |
| Heartstone and Slave Market YAML | Add `Heartstone Tower` and `pens` exact aliases. |
| `src/app/game-session.ts` | Typed administrative `overridePlayerLocation` operation; reserved command guard precedes context-compaction submission. |
| `src/turn/turn-coordinator.ts`, `src/turn/scene-participants.ts` | Explicit session continuity boundary and direct engine reserved-command guard. |
| `src/ui/server.ts`, `src/ui/client.js` | Dedicated location endpoint, text-command interception, committed canonical ID/revision and application confirmation. |

## 3. New player-travel detector

A direct, affirmative, current player-inclusive clause may produce one Nicco runtime delta only after its complete destination uniquely resolves and the existing route succeeds. Plain and action-marked input use the same detector. Quotes, questions, instructions, negation, modality and other-day/future framing veto travel.

The core family is go/walk/head/return/travel, with necessary morphology and existing legacy run/hurry/stroll/make-way and related forms retained. Bounded particles and companion phrases can precede or follow the destination. The detector inspects the complete input before committing to an outcome. Multiple player travel acts fail closed, including repeated acts; there is no sequential or multi-hop execution.

## 4. Supported subject semantics

Supported: I, Nicco, we, let's, let us, leading they both, Nicco and a uniquely present named persistent actor, and bounded player imperatives/action clauses. Existing player-action `he` support is retained. `They` alone and arbitrary NPC-only subjects do not grant Nicco travel authority.

Coordinated subjects are validated before conjunction splitting. A named NPC addressee followed by an imperative is not a player movement clause. Existing first-person leave-and-go continuation is retained without inheriting movement through an unrelated NPC clause.

## 5. Destination matching mode

The player resolver accepts a complete canonical ID, name, display name or exact authored alias. It also accepts a unique complete multiword suffix of a canonical name/display name, such as Slave Market for Calderan Slave Market. It never mines a feature, final noun or incidental substring from a description. Generic market/tower/room words are not inferred. The legacy explicit `/go Center` city-scoped interpretation remains preserved.

Exact matching is case-insensitive and tolerates bounded leading `the` and terminal action punctuation. Unknown and ambiguous natural destinations produce no delta or route and provide stay-at-source grounding. Strict explicit invalid command forms retain rejection behavior. Known unreachable destinations use the existing blocked outcome; no teleport or time charge occurs.

## 6. Local-target protection

Local actor/object descriptions cannot become complete canonical player destination labels. Tests exercise all requested approaches, plain and marked, from Slave Market and Heartstone Square. They assert no runtime commands and no destination/route in movement diagnostics, rather than relying on same-node no-ops. The cross-scene clerk false positive is closed for player travel. The previous man/post fix remains green.

The generic destination resolver used by NPC narration and doorway evidence is preserved; this pass does not globally rewrite reference resolution.

## 7. Home implementation

`PLAYER_HOME_LOCATION = "heartstone"` is a player-only reference inside valid travel or explicit player carry resolution. It is not an authored global alias for NPCs. Existing authored entrance conversion selects `heartstone_lr`; the market route charges 21 minutes. Assertions such as we are home do not initiate travel. A home request while already at the authored arrival node charges zero additional time.

## 8. Companion behavior

Plural subjects and with/together phrases extract Nicco's destination only. They add no party state, follow flags, household transport or automatic NPC relocation. Mira remains at her source location in the positive travel tests. Explicit carrying, eligible independently narrated NPC movement and existing authorized follow evidence continue to own companion movement separately.

Group arrival prose is not itself evidence that an unnamed companion moved. This pass does not introduce general plural coreference or guarantee companion movement from a pronoun.

## 9. Route/time behavior

Player travel emits the existing `runtime_delta` containing `player_location` and `time_advance_minutes: route.minutes`. Projection is detached; the final coordinator commit remains atomic and revision checked. The route helper is relocated without changing Dijkstra, edge costs, entrance rules or route semantics. No world/runtime time implementation files changed.

## 10. Narration reconciliation changes

In a resolved player movement frame, bounded current-scene sentences such as He enters Heartstone Tower, They arrive at Heartstone, We reach Heartstone, The journey ends at Heartstone's massive door and The door opens into Heartstone Living Floor are checked against prepared location. A current door/home entry frame also permits that bounded safety check.

Pre-projection diagnostics survive into audit, so leaving a companion behind cannot erase the player movement frame. Contradictions use `uncommitted_movement`, one bounded revision, re-audit and residual redaction. Tests exercise stubborn scripted narrators that repeat the same false arrival: runtime stays at the source, zero minutes advance and the false sentence is removed.

Quoted dialogue, lore, directions, hypothetical/future/negated statements, historical claims, remote scenery and NPC-only subjects remain outside this player-relative check. Existing named-Nicco guards remain. There is no furniture classifier and no adoption of location from prose.

## 11. Exact reported reproduction before/after

| Stage | Audit baseline | Implemented result |
| --- | --- | --- |
| Start | `calderan_slave_market`, minute 600 | Same |
| `they both walk to the heartstone` | No movement intent or route commit | Canonical `heartstone`, authored entrance `heartstone_lr`, route 21 minutes |
| Detached narrator context | Slave Market | Heartstone LR |
| Final runtime/session/HTTP header | Slave Market, 600 | Heartstone LR, 621 |
| `well we are home he opens the door and enters come in, this is the heartstone, our home` | Market runtime despite interior prose | Remains `heartstone_lr`, 621; no second travel delta |
| P12 current visit | False Heartstone prose could be market-tagged | Heartstone narration carries `heartstone_lr` metadata |

Both turns are covered through the real coordinator/session and loopback streaming HTTP API using scripted arrival/interior narration. Draft HTTP events contain no scene projection; final responses contain the committed location. This is deterministic engine proof, not a paid replay of the original unsupplied model transcript.

## 12. P11 verification

Market 600 to Heartstone produces 621. The same route from 1435 produces 1456, crossing the day boundary with existing mana recovery from 10 to 35. Local, rejected, blocked and manual operations do not advance time. Existing cancellation, stale-turn and atomic commit tests remain green. P11 implementation is unchanged.

## 13. P12 verification

Normal travel naturally creates the existing location boundary. The exact second turn remains in the Heartstone visit; recent-scene text excludes the prior market visit. Departure/reentry and existing P12 tests remain green. Administrative correction clears only the session-local prompt/focus seam described below. P12 algorithms are unchanged.

## 14. Safeswitch architecture

`GameSession.overridePlayerLocation({ target, expected_revision })` is an explicit administrative operation. It validates session availability, revision and exact visible canonical location, prepares the existing `{ kind: "runtime_delta", delta: { player_location: target.id } }`, commits the owned receipt, resets continuity and returns a derived view.

No route, entrance conversion, time delta, mana delta, synthetic travel, provider request or NPC command is generated. A disconnected visible canonical location such as Blackwater can be corrected to. A container ID is applied exactly as requested. The narrator and controller receive no new command or capability.

## 15. Safeswitch API

`POST /api/location`, JSON `{ "target": "heartstone_lr", "expected_revision": <current revision> }`, uses the existing loopback and same-origin write boundary. Success returns `ok`, `changed`, manual confirmation and the existing sanitized committed UI projection. That projection now includes top-level `revision` and `scene.location_id`. The full application view is not added to the HTTP surface.

IDs and complete exact canonical name/display name are accepted, case-insensitively. Aliases, abbreviations, home, characters, features, private/unavailable locations and invented targets are rejected. Ambiguous exact labels return at most five canonical candidate IDs and no mutation. Stale/busy requests use existing error codes with HTTP 409; other invalid corrections return 422. Malformed transport requests are rejected before application invocation.

Changed placement adds one revision through normal receipt semantics. Same-node correction returns `changed: false` without an extra revision, while still clearing continuity. Closed and busy sessions reject correction before mutation. The operation does not autosave.

## 16. Safeswitch UI

The composer intercepts `/location` before provisional player/narrator bubbles or normal turn submission, calls the dedicated endpoint and shows an application confirmation/error. The header changes only after a final committed response is rendered. Existing historical transcript messages remain unchanged. No dropdown, companion toggle, major styling or prose-derived location inference was added.

Normal application submission and direct engine/player-intent callers reject reserved `/location` input. Reserved input cannot launch context compaction before rejection. Narrator/controller prose cannot invoke the operation.

## 17. Safeswitch continuity reset

After successful changed or same-node correction, the coordinator replaces its per-campaign RecentConversation, deletes retained last-input relevance, and calls a dedicated SceneParticipants boundary method. That method clears list/focus/location focus while preserving monotonic next-ID and turn counters. The participant registry is not replaced.

The next real prompt derives fresh structured context. Tests show poisoned scene text and retained input are absent, participant IDs are not reused and no synthetic narration is inserted. Historical UI transcript and persisted campaign domains are retained. Cached compaction remains a derived knowledge operation; no compaction algorithms or provider calls are added.

## 18. Save/load behavior

Correction followed by explicit save/load preserves the corrected location and unchanged minute. Save envelope schema 4 and campaign snapshot schema 3 remain unchanged.

Before adding aliases, checked existing names/aliases and reference fingerprints. Heartstone Tower and pens uniquely resolve. A global Slave Market alias was not retained because it changed unrelated retrieval ranking; the player-only complete-name abbreviation supplies the intended travel label instead. Reference fingerprints already exclude descriptive aliases, and a save from canon without the two added aliases loads against updated canon. Dataset identity changes normally; old strict dataset-bound save formats retain their existing compatibility policy, with no migration introduced.

The golden pipeline update contains only the canonical dataset fingerprint change in the carry-travel prompt; no event ordering or command behavior was repinned.

## 19. Tests

Final validation:

- Typecheck and build: PASS.
- Full unit suite: 2,463 tests; 2,460 pass, zero failures, three existing TODOs.
- Focused authority/application/UI/P11/P12/follower/persistence suite: 493 pass, zero failures.
- Playthrough: 25 pass, zero failures.
- Previous West Guard Post regression: PASS.
- Runtime import-cycle guard: PASS.
- HTTP/DOM correction, no provisional bubble, provider silence, busy/stale/closed/no-op, disconnected placement, exact-name ambiguity, NPC invariance, save compatibility and continuity reset: PASS.

Tests use scripted providers and disposable loopback servers. Initial sandboxed Node test spawning returned EPERM; the deterministic suites ran with the required execution permission.

Two older behavioral tests now use complete explicit destinations: observation room instead of the inferred room head, and `heartstone_cy` instead of an inferred courtyard head. Their route, NPC authorization and position assertions remain intact. This documents the deliberate stricter player destination policy rather than retaining feature-head inference to satisfy old fixture wording.

## 20. Paid calls/cost

Paid API calls: **0**. OpenRouter calls: **0**. Cost: **$0**. Safeswitch narrator/controller/reflection provider calls: **0**, verified with real instrumented session dependencies.

## 21. Remaining limitations

The grammar is intentionally bounded, not general NLP. Unknown synonyms, unconstrained they, ambiguous subjects, vague there/tower/market, competing travel acts and unrecognized complete labels fail closed. Sentence-level mood gates can conservatively suppress a travel clause mixed with an unrelated future/question frame. Coordinated named actors must be uniquely present in structured context.

The narration safety net covers explicit bounded arrival/entry claims in a player movement frame, not every semantic scene migration. It never infers location from furniture. Frozen follow recognition limitations remain outside this pass. Manual correction flushes bounded session prompt/dialogue/focus, so conversational details may need restating afterward; transcript remains visible. There is no automatic save or UI-server restart durability guarantee.

## 22. Separate authority bug not fixed

1050G purchase with 500G purse remains out of scope. No economy, canonical casting, naming, P6, follower architecture, P11 implementation, P12 algorithms, save schema or narrator style changes were made.
