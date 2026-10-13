# PLAYER TRAVEL AUTHORITY — FULL AUDIT AND KISS IMPLEMENTATION PLAN

Audit baseline: `cad4d57` (includes movement fix `e4b3a45` and later canonical casting/economic work). This pass changes **no production code, grammar, canonical data, UI controls, P11, P12, or expected production tests**. Proposed behavior below is a second-pass design, not an implemented feature. No paid calls.

Evidence: [offline harness](scripts/audit-player-travel-authority.mjs), [full current traces](docs/evaluations/player-travel-authority/current-traces.json), [118-row current grammar matrix](docs/evaluations/player-travel-authority/grammar-matrix.md), and existing engine tests. Run `npm run build --silent`, then `node scripts/audit-player-travel-authority.mjs`. The harness uses detached campaigns, scripted providers, lexical retrieval and a real loopback HTTP server. It makes 36 assertions about current behavior, including known failures; it does not make unsupported travel pass.

## 1. Executive summary

The new failure is reproduced as **B: movement authority missed the input, while narration migrated the scene**. Neither exact player input proposes a player-location command. Both finalize at `calderan_slave_market`, minute 600, revision 2; Scene RAM, NarrativeContext, GameSession and final HTTP agree. Scripted plural travel and Heartstone LR interior prose survive the current audit unchanged. The UI is correctly showing runtime, not caching an obsolete destination.

The first divergence is input classification: `they both` is not a supported player subject. Marking the same phrase with asterisks does not solve that restriction. Destination extraction and routing never run, even though `the heartstone` independently resolves and has a valid 21-minute route.

The second divergence is delivery: the movement safety net recognizes explicit `Nicco` movement/arrival, not `They`, bare `He`, or a scene transition expressed through doors/interior features. Escaped final prose is then stored with the unchanged market location tag and replayed as recent market-scene continuity. Retrieval can also supply Heartstone lore from the player's words without authorizing a move.

Recommend a bounded hybrid player-travel detector with explicit whole canonical destinations, a Nicco-specific home reference, existing route/time commands, and a small contextual narration backstop. Preserve the previous local-target fix and all companion authority rules. Separately recommend `/location heartstone_lr`, handled as a typed application correction using the existing validated runtime delta, with no route, time, narrator call or NPC relocation.

The exact historical narrator transcript and save were not supplied. The two exact player inputs are reproduced against controlled narration matching the reported travel/interior sequence. This proves the current escape path; it does not claim to recreate a particular model response verbatim.

## 2. Current authoritative location model

The one production authority is `CampaignState.exportSnapshot().runtime.scene.player_location`. `CampaignState` owns a private immutable snapshot. Mutations require an owned preparation receipt and commit against the same captured base snapshot. The primitive clock is alongside it in `runtime.scene.world_time.world_minute`.

| Representation/path | Can write player authority? | Meaning and boundary |
|---|---|---|
| `CampaignState` private snapshot | Yes, through validated commit | Sole session truth |
| `runtime_delta.delta.player_location` | Yes, through trusted prepare/commit | Existing typed primitive; validation checks canonical existence, not a route |
| `move_character` for canonical `nicco` | Yes at the trusted domain API | `campaign/characters.ts` maps player movement into the same runtime field; normal controller authorization rejects this player target |
| Opening constructor | Yes, initialization | Canonical opening `heartstone_square`; not consulted to reset later turns |
| UI playtest initialization | Yes, once through normal `campaign.apply` | Sets Slave Market and +600 minutes; does not override subsequent views |
| Save/restore | Yes, restores validated snapshot | Existing schema validates canonical references and dataset compatibility |
| Standalone `RuntimeState` | Can mutate its own instance | Legacy/runtime-domain owner and detached compatibility object; it cannot write back into a campaign snapshot |
| Scene RAM | No | Immutable projection of a `RuntimeState` instance |
| NarrativeContext / TurnContext | No | Projected scene, ancestry, present actors and bounded lore |
| Prepared arrival snapshot | No until commit | Narrator sees an intended valid arrival on a detached projection; cancellation/stale/reconciliation failure can prevent its commit |
| GameSession / derived session view | No independent location write | Derives current snapshot on demand |
| HTTP/browser header | No | Displays final committed session data |
| Resolver / route result | No | Destination/route evidence; becomes authority only in a typed committed command |
| Narrator/recent narration/reconciliation | No structured write | Can contradict location in prose; audit chooses text, never adopts prose as location |
| Context compaction/packed request | No | Compresses knowledge only; cache keys include context identity/revision; current scene/history bytes come from the fresh request |
| Controller | Not for Nicco in gameplay | Schema excludes runtime deltas; `move_character(nicco, ...)` fails authorization |
| Follow/carry | No second player location | Carry may propose the same player runtime delta; NPC commands use their separate actor-location fields |
| Dev/test helpers | Yes, if explicitly holding CampaignState | Trusted fixtures call initialization/apply; not narrator or UI projections |

There is no second independently mutable production player-location authority. There **is** a competing descriptive source in finalized narration: the model can treat it as scene truth despite a contrary structured prompt. That is a narration/grounding failure, not a second location store.

Authored NPC authority is `runtime.npc_locations`; created actors use `characters[].current.current_location`. Scene RAM's authored NPC list and TurnContext's appended created actors are different actor projections, not alternate player locations. NPC whereabouts must not be collapsed into player location.

## 3. Full end-to-end movement pipeline

Abbreviations in the authority column: **No** = derived/detached; **Trusted proposal** = authorized input source but not committed; **Commit** = mutation boundary. Tests cited are under `tests/`; the audit harness supplies the new plural/two-turn observations.

| Stage | File/module and input → output | Authority | Failure mode | Existing verification |
|---|---|---|---|---|
| 1. Raw input | `ui/client.js`, `ui/server.ts`, `app/game-session.ts`: composer text → trimmed `player_input` | Player authors request; not a location write | Oversize/invalid input, busy/closed session | `ui-v1`, `application-closure` |
| 2. RPG spans | `turn/natural-actions.ts::actionSegments`, `sceneDirection`: input → starred actions or bounded unmarked third-person direction | No | Plain subjectless text treated as speech; plural subject excluded | `natural-actions`, audit matrix |
| 3. Movement detection | `turn/player-intent.ts::playerIntent`, first-person helper; natural `MOVE` regex | Trusted proposal | Unsupported subject/verb construction; quotes/modality/negation gates | `natural-actions`, `language-gates` |
| 4. Local/world classification | `natural-actions.ts::resolveDestination` and participant plan | No | Local veto is bounded, not a complete target type system | Previous movement regression; clerk trace |
| 5. Extraction | Strict grammar capture, `MOVE`, `FP_MOVE`, `DESTINATION_END`, `FP_TAIL` | No | No `they both`; `with Mira` between verb and destination blocks matching; premature clause splits | 118-row matrix |
| 6. Canon lookup | `natural-actions.ts::resolveDestination`, `world/world-store.ts` | No | Unknown or duplicate exact name | Movement regression, `world-store` |
| 7. Actor/object precedence | Resolver exact-whole match, bounded heads/current names; `scene-participants`, `canonical-interaction-targets` | No | Role coverage/feature fallback incomplete; focus is not travel authority | Canonical casting tests, `p34-participant-continuity` |
| 8. Exact/alias/lexical evidence | Resolver and `turn/retrieval-policy.ts::entityMentions` | No | Mention tie, incidental feature head, scope dependent on ancestry | `natural-actions`, `retrieval-policy`, audit destinations |
| 9. Route | `natural-actions.ts::reachable`, `world/travel.ts` | No | Invalid/disconnected node; container entrance without path | `city-travel`, blocked Blackwater trace |
| 10. Duration | `world/travel.ts::findRoute`: positive directed edges → summed minutes | No | Unsafe integer/invalid edge excluded; no implicit containment edge | `city-travel`, 21-minute trace |
| 11. Proposal | `resolveMovement`, strict `playerIntent`, `character-movement::resolvePlayerCarry` | Trusted proposal | Unresolved means no delta; disconnected natural travel gets blocked note | `natural-actions`, `location-continuity` |
| 12. Validation | `campaign/validation.ts`, `scene/scene-delta.ts`, snapshot validation | No | Wrong fields, nonexistent/wrong-type IDs, bad arithmetic | `campaign-state`, `scene-delta` |
| 13. Revision checks | `CampaignState.prepare/commit`, coordinator checkpoint | No until commit | Stale proposal/receipt, cancellation, concurrent turn | `turn-pipeline-invariants`, `turn-hardening` |
| 14. Candidate projection | `turn/stages/intent.ts::projectTurnIntent`: base + intent → detached arrival/context | No | Prevalidation fails; model never sees invalid arrival projection | `turn-stages`, `turn-pipeline-golden` |
| 15. Atomic commit | `turn/turn-coordinator.ts`, `stages/commit-preparation.ts`, CampaignState receipt | **Commit** | Foreign/consumed/stale receipt; no await between checkpoint and commit | `campaign-state`, `turn-pipeline-invariants` |
| 16. P11 advance | `world/runtime-domain.ts::prepareRuntimeDelta` | Detached first; committed with stage 15 | No recognized route → no minutes; failed turn publishes none | `p11-time-foundation`, midnight trace |
| 17. Location mutation | Same runtime preparation writes candidate `player_location`; stage 15 replaces authority | **Commit** | Trusted primitive accepts canonical node even without route: routing is caller responsibility | Campaign tests; manual design below |
| 18. Companions | `character-movement`, `follow-invitation`, `stages/authorization`, `command-authorizer` | Separate authorized NPC commands | No automatic party movement; unsupported follow evidence can be redacted | Frozen movement/follow tests; audit safety traces |
| 19. Scene RAM | `scene/scene-ram-builder.ts`: current runtime → entity/ancestry/authored presence | No | Missing/wrong-type canonical location | `runtime`, `narrative-context` |
| 20. NarrativeContext | `scene/narrative-context-builder.ts`, `turn/context-builder.ts` | No | Visibility/content/capacity limit; created actor filtering | `narrative-context`, `context-scale` |
| 21. Prompt grounding | `turn/prompt-builder`, `narrator-focus`, `retrieval-policy`, `economic-context` | No | Current state competes with destination lore and stale recent prose | `p61-narrator-focus`, audit second prompt |
| 22. Audit/revision | `narration-audit.ts`, `stages/audit.ts`: prepared snapshot + draft → delivery | No state write | Named/explicit movement grammar misses plural, pronoun and interior migration | Existing movement backstop; audit safety traces |
| 23. P12 boundary | `recent-conversation`, `recent-scene-narration`, coordinator publication; canonical departures in authorization | No player write | Boundary requires real location change; escaped prose tagged as old scene | `p121-recent-scene-narration`, `p122-canonical-departure` |
| 24. Session view | `app/game-session.ts::getView`, `app/session-view.ts::deriveSessionView` | No | Would be wrong if snapshot wrong; no stale snapshot found | `application-closure`, movement/header regression |
| 25. HTTP final payload | `ui/server.ts::state`: final session view → `result.scene` | No | Provider failure returns unchanged view; draft has no scene data | Real HTTP audit and `ui-v1` |
| 26. Header | `ui/client.js::renderScene`, `preview`, final result handler | No | Only final/session state drives header; prose cannot move it | `ui-v1` DOM regression |

Execution order matters: stages 16/17 prepare candidates before narration and become authoritative **together** at stage 15, after audit/reconciliation. Stages 19–21 also run against the detached candidate to ground valid travel. Final publication/session/HTTP derives from committed state. Audited narration events may precede commit in one coordinator mode but GameSession marks them provisional; they do not grant header authority.

## 4. Current travel grammar matrix

Implementation, not only tests, establishes three lanes:

1. Strict whole-input forms: `/go `, `go to `, `walk back to `, `head to `, `I go to `, `I go downstairs to `, `I go upstairs to `. Case-insensitive, with optional final period. Invalid destination/route throws `invalid_runtime_intent`.
2. Natural action lane: single-star spans; or unmarked input where every sentence starts with a present character name or `he/she`, no quotes/first-second-person words, at most three sentences. Clauses then split at commas, semicolons, `and`, `then`, `when`, `before`, `after`. The movement subject permits absent subject, `he`, `nicco`, `i`; not `we/they/she` or another actor's name. Thus a third-person scene direction can qualify for parsing and still fail the player movement regex.
3. Unmarked first-person fallback: `I`, `let's`, `let us`, first-person clause continuity, a bounded verb/particle family, `to/into`, and whole-sentence not-done gates. Quotes/starred segments are removed. Destination manner tails are trimmed. `let's` inside stars is not supported by the natural subject regex.

Natural verbs currently enumerate go/walk/stroll/head/return/wander/hurry/run/make his way/step/move/travel/cross with selected morphology. The first-person list separately enumerates go/head/walk/run/hurry/climb/step/return/move/wander/stroll/make my way/make our way. It is neither a general NLP parser nor a consistent morphology abstraction. Transfer/carry parsing is separate and can precede/augment movement.

The full [118-row matrix](docs/evaluations/player-travel-authority/grammar-matrix.md) records **recognition, destination, real committed movement, time and reason** for every listed input, plain and starred. Condensed key rows below: **Y** = commits Heartstone LR and +21 minutes; **N** = no world movement/+0; **E** = turn rejected/+0. Destination “not extracted” is different from independently resolvable Heartstone.

| Input without outer stars | Plain commit/time | Starred commit/time | Destination / current reason |
|---|---|---|---|
| `go to Heartstone` | Y/+21 | Y/+21 | Heartstone → LR; strict / natural |
| `goes to Heartstone` | N/0 | Y/+21 | Plain subjectless speech; marked extracts Heartstone |
| `I go to Heartstone` | Y/+21 | Y/+21 | Strict / natural |
| `Nicco goes to Heartstone` | Y/+21 | Y/+21 | Named third-person direction / natural |
| `goes back to Heartstone` | N/0 | Y/+21 | No plain subjectless lane |
| `walk to Heartstone` | N/0 | Y/+21 | Not a strict command prefix |
| `walks to Heartstone` | N/0 | Y/+21 | Same |
| `walk home` | N/0 | N/0 | No preposition/home reference |
| `go home` | N/0 | N/0 | Same |
| `return home` | N/0 | N/0 | Starred input attempts unresolved item-return grammar, not travel |
| `returns to Heartstone` | N/0 | Y/+21 | Plain subjectless lane absent |
| `heads to Heartstone` | N/0 | Y/+21 | Strict command is `head to`, not `heads to` |
| `leaves for Heartstone` | N/0 | N/0 | Neither player movement verb/preposition construction matches |
| `travels to Heartstone` | N/0 | Y/+21 | Marked natural verb |
| `makes his way to Heartstone` | N/0 | Y/+21 | Marked natural construction |
| `they walk to Heartstone` | N/0 | N/0 | Unsupported subject; no destination extraction |
| `they both walk to Heartstone` | N/0 | N/0 | Same |
| `we walk to Heartstone` | N/0 | N/0 | Same |
| `Nicco and Mira walk to Heartstone` | N/0 | N/0 | Coordinated subject not supported; `and` splits clause before a usable movement |
| `walks with Mira to Heartstone` | N/0 | N/0 | Companion phrase interrupts required verb/particle/preposition sequence |
| `takes Mira home` | N/0 | N/0 | Not recognized carry/travel construction |
| `takes her to Heartstone` | N/0 | N/0 | “takes” alone is not explicit physical carrying |
| `goes with her to Heartstone` | N/0 | N/0 | Companion phrase before destination unsupported |
| `they head home` | N/0 | N/0 | Subject and home unsupported |
| `they return home` | N/0 | N/0 | Same |
| `we go home` | N/0 | N/0 | Same |
| `let's go home` | N/0 | N/0 | First-person fallback requires `to/into`; marked subject also excluded |
| `I walk to Heartstone` | Y/+21 | Y/+21 | First-person / natural |
| `Nicco walks with Mira to Heartstone` | N/0 | N/0 | Destination never extracted |
| `they both walk to the heartstone` | N/0 | N/0 | Exact new reproduction; lowercase destination is not the cause |
| `I walk to Heartstone with Mira` | Y/+21 | Y/+21 | Destination before `with` works; only Nicco moves |
| `let's go to Heartstone together` | Y/+21 | N/0 | Plain first-person works; starred `let's` subject excluded |
| `he walks to Heartstone` | Y/+21 | Y/+21 | `he` is assumed player in this grammar |
| `she walks to Heartstone` | N/0 | N/0 | Not a player subject |
| `Mira walks to Heartstone` | N/0 | N/0 | No player movement; NPC consequences need narration/evidence separately |
| `goes to the man leaning on the post` | N/0 | N/0 | Marked local-person veto; West Guard Post fix retained |
| `walks to the woman with the fan` | N/0 | N/0 | Local person veto |
| `approaches the seller` | N/0 | N/0 | Local interaction, not travel verb construction |
| `goes over to the clerk` | N/0 | N/0 here | Marked resolver actually picks current market; latent cross-scene failure below |
| `walks toward the table` | N/0 | N/0 | Table veto |
| `steps up to the guard` | N/0 | N/0 | Guard veto |
| `moves closer to the door` | N/0 | N/0 | Unsupported travel construction; local |
| `walks across the room` | N/0 | N/0 | No explicit destination preposition; local |
| `goes to market` / `goes to banana` | N/0 | N/0 | Plain not parsed; marked unresolved destination |
| `I walk to Heartstone.` | Y/+21 | Y/+21 | Period handled |
| `I walk to Heartstone?` | N/0 | Y/+21 | Plain question veto; natural starred gate lacks question veto |
| `I don't walk…` / `I might walk…` | N/0 | N/0 | Not-done gates |
| `I tell Mira to walk to Heartstone` | N/0 | N/0 | Instruction, not player travel |
| `"I walk to Heartstone"` | N/0 | N/0 | Quoted speech not travel |
| `go to heartstone` / `go to HEARTSTONE` | Y/+21 | Y/+21 | Whole exact case-insensitive name/ID |
| `go to Heartstone Tower` | Y/+21 | Y/+21 | Shared mention matching; not an authored exact alias today |
| `go to heartstone_lr` | Y/+21 | Y/+21 | Exact canonical ID |
| `go to Heartstone Living Floor` | Y/+21 | Y/+21 | Exact canonical location name |
| `go to the tower` | E/0 | N/0 | Generic tower does not uniquely resolve from market |
| `go to the pens` | N/0 | N/0 | Resolves current market; strict zero-minute same-node delta / natural already-here |
| `go to Heartstne` | E/0 | N/0 | No typo correction |

Case-insensitivity is strong for whole exact ID/name/alias matching. One-word mention matching is capitalization-sensitive; lexical stemming is not fuzzy typo correction. Punctuation handling differs between lanes: exact text strips one terminal period/exclamation; mention matching may still resolve a question-suffixed name while a separate gate does or does not veto execution. The proposed detector must apply one player movement gate without changing the shared gates used by NPCs/transactions.

## 5. Exact reproduction: `they both walk to the heartstone`

Fixture: canonical world, UI start location `calderan_slave_market`, minute 600, and a present created Mira. No persistent party/follow flag is manufactured. Initial committed revision is 2 (opening records plus explicit test setup).

| Observation | Current result |
|---|---|
| Raw input | Exact lowercase reported input |
| RPG action spans | `[]` |
| Unmarked scene directions | `[]`: no present-name/he/she lead |
| Natural actions / movement intent | `[]` |
| Destination extraction | None; `destination_phrases: []` |
| Direct runtime proposals | `[]` |
| Full intent-stage runtime proposals | `[]` |
| Detached projected location/time | Market / 600 |
| Route executed | None |
| Independent control lookup | `the heartstone` resolves to `heartstone`; entrance `heartstone_lr`; valid 21-minute route |
| Controller proposal / final commands | `[]` / `[]` |
| Audit issues / delivery | `[]` / unchanged scripted draft |
| Commit | Owned no-op receipt; revision remains 2 |
| Final authoritative location/time | `calderan_slave_market` / 600 |
| Scene RAM | Market current entity and player location |
| NarrativeContext | Market primary location |
| Session view | ID `calderan_slave_market`, label `Calderan Slave Market` |
| Final NDJSON | Same label, `Late Morning` |

Controlled draft: `*They leave the Slave Market and walk through Calderan. Heartstone comes into view beyond the lane. At the tower, the pace slows. The journey ends at Heartstone's massive wooden door.*` It survives unchanged. `*they both walk to the heartstone*` likewise produces no movement; stars alone do not fix the subject restriction.

The second exact input is also executed: `well we are home he opens the door and enters come in, this is the heartstone, our home`. Its action spans, scene directions, movement actions and commands are also empty. The supplied door/window/floor/hearth/sofa/kitchen/stair/hatch/shoe-rack interior continuation survives unchanged. All structured projections remain Market/600/revision 2.

## 6. First divergence

`natural-actions.ts::sceneDirection` rejects plural subject `they`; unmarked first-person parsing only accepts `I/let's/let us`. Even with asterisks, natural `SUBJECT` does not admit `they both`. Thus the divergence begins **before destination extraction**, not at canonical lookup, route planning, commit or UI.

Once no movement is recognized, no non-arrival/blocked-travel note is created. The player's raw input still reaches narration, which can understand it semantically. This mismatch is the initial authority gap; the insufficient delivery audit is a second necessary escape, not an alternative first cause.

## 7. Why narrator moved while runtime did not

The narrator receives the player's complete natural-language input but the engine resolves a narrower deterministic grammar. It is instructed to honor current structured state, yet raw travel words, retrieved Heartstone canon and recent prose can pull output toward Heartstone. The narrator cannot commit location and the controller cannot repair Nicco's missed movement.

The real offline first-turn retrieval is lexical and includes `calderan_slave_market`, `heartstone_cy`, `heartstone_f1`. Second-turn retrieval includes `heartstone_lr`, `heartstone_cy`, `heartstone_u1`, while the authoritative prompt still says `Location: Calderan Slave Market`. That explains how canonical interior detail can be available without an authorized arrival. Retrieval relevance is not geographical authority and should not be changed to solve this.

The audit misses plural travel, pronoun arrivals and location-specific environmental transitions. Since no issue is found, no revision runs. The delivered text goes into recent history tagged with the *unchanged committed location*. On turn N+1, P12.1's market-local block contains the escaped Heartstone journey alongside “Mira waits … among the licensed private sellers.” On the following turn it can contain both escaped journey and interior continuation. Structured state wins by instruction, but contradictory evidence is present. That is why committing clear player travel is preferable to trying to repair every indirect sentence afterward.

## 8. UI projection verification

The real `GameSession`/HTTP sequence proves both successful turns' final payloads equal the committed session view. No draft event includes a scene payload. Existing real-client DOM regressions reverify that provisional Heartstone arrival prose leaves a market header unchanged and a committed final Heartstone result updates location/time.

`getView()` reads the current campaign snapshot; `deriveSessionView()` uses its runtime location. `ui/server.ts` calls that view after `submitPlayerInput` finalizes. `client.js::preview` updates draft bubble/status only; `renderScene` reads committed/session payload. Browser polling also projects already committed state; it does not infer location from narration. No stale cache/old-snapshot/preview-overwrite seam was found. Do not make the header follow narrator prose.

## 9. Destination resolution audit

Current order is **not** separate ID > display name > alias tiers: IDs, canonical names, display names and aliases share a whole-exact case-insensitive match tier. One exact match wins; several exact matches fail closed. The special Calderan `center` mapping precedes that tier. Next comes `entityMentions`, with explicit score 2 and qualified/deictic score 1; a unique higher score wins. Last comes a single-content-token head match against location names, aliases and features.

Visibility: general candidates require both narrator and player visibility. Exact lookup is global within that visible set; reachability is checked separately. Lexical fallback's variable is called `city`, but actually uses `location_ancestry[0]`, the **immediate parent**. At the market/square this scopes to Calderan West; deeper inside Heartstone it scopes to Heartstone. It is not a uniformly city-wide location alias system.

Observed independent lookups from the market:

| Phrase | Destination | Route/minutes |
|---|---|---|
| `heartstone`, `Heartstone`, `the heartstone` | `heartstone` | entrance LR, 21 |
| `heartstone_lr`, `Heartstone Living Floor` | `heartstone_lr` | 21 |
| `Heartstone Tower` | `heartstone` via mention evidence | LR, 21 |
| `home` | None | None |
| `the tower`, `this tower` | None here | None |
| `market`, `square`, `gate` | None | Generic/nonunique evidence; no candidate selected |
| `West Gate` | `center_west_gate` | 60 |
| `the pens` | `calderan_slave_market` | Already here, 0 |
| `the man leaning on the post`, `the woman with the fan`, `the table` | None | Local veto/no destination |
| `banana`, `Heartstne` | None | Unknown; no fuzzy correction |

Matched lexical features are not guaranteed to be location references: **`the clerk` resolves to the market** via a feature head. From the market this looks like an innocuous no-op, but from Heartstone Square `*goes over to the clerk*` currently commits to the market in 20 minutes. This is traced, not fixed. The second-pass rule should remove feature-only guessing from player world travel, rather than continually add occupational nouns to a veto list.

## 10. Local person/object precedence

`e4b3a45` remains intact: whole canonical target first; bounded person/object heads and current character names veto embedded location mentions; multi-token descriptive tails are not mined by the last-token fallback. The post regression still stays local. Visible actor/canonical interaction casting occurs in the participant plan, but the movement resolver does not receive a complete typed PERSON/FEATURE/LOCATION parse.

The veto is intentionally bounded and incomplete. Clerks are one demonstrated missing role; arbitrary adjectives/roles or descriptions containing an entire place name are not a general NLP head parser. The robust KISS safeguard for the additional travel lane is whole canonical destination evidence, not an ever-growing person or incidental-word blacklist. The existing veto remains an additional guard, especially where actor/place names overlap. Strict complete canonical names must continue to win when explicitly specified.

Required local non-travel regressions include the post/man, woman/fan, seller, clerk, table, guard, nearby door and across-room examples in both markup forms **and from another location**. Same-node no-op alone is insufficient proof that a local noun was classified correctly.

## 11. Companion/plural-language audit

No persistent `party`, `followers`, `accompanying` or player-relative actor position exists. Household membership is not a follow flag. Actor locations persist independently.

| Current mechanism | What it authorizes | What it does not authorize |
|---|---|---|
| Ordinary Nicco travel | Player location plus route minutes | Moving any NPC automatically |
| Player-authored physical carry | Player delta and a specific present carried actor's move | “takes her home” without physical carry evidence; generic party movement |
| Explicit narrated NPC movement | Eligible created or active authored NPC+ actor to concrete routed destination; derived proposal + authorization | Any NPC arbitrarily teleported by player location |
| Active NPC+ implicit following | Completed recognized follow to Nicco's same-turn arrival | Invitation alone, refusal, ownership, membership or past accompaniment |
| Invitation grammar | Neutral narrator choice for eligible invited NPC+ | An automatic actor-location commit |
| Ephemeral participant continuity | Scene-local focus/participants, expiry on location change | Persistent transport to a different world node |
| Ordinary canonical departures/P12.2 | Strict recognized canonical exit under its existing rules | Promoting every canonical NPC into a movable companion |

Traces: ordinary accepted travel leaves Mira at the market; explicit `Mira walks to Heartstone` commits her separate move; carrying Mira commits both; an active household Mira with plain `Mira follows him.` commits via existing implicit follow; the same invitation with no follow narration leaves her behind.

A formatting limitation also surfaced: `*Nicco enters Heartstone Tower. Mira follows him.*` leaves a closing asterisk in the implicit follow tail, so even active Mira's follow is not recognized and is redacted as absent. The unstarred equivalent works. This is documented as frozen follow recognition sensitivity, **not repaired or made a dependency of the player-travel fix**. Do not claim all prose-equivalent following forms already work.

`they both` currently moves neither Nicco nor a companion, because no player delta is projected. Proposed plural support should extract **Nicco's destination only**; the existing carry/follow/explicit NPC movement paths still decide the other actor. That is both feasible and the smallest authority change. No new companion toggle, automatic transport, or permanent follow state is needed.

Existing invitation recognition looks for forms such as `come with/along`, `join me/us`, `follow me`, `accompany me` or `walk with me`. `they both walk` alone is not an invitation signal. Merely adding player plural support therefore does not guarantee that both actors will commit an arrival: conservative source/stay notes and the frozen individual follow evidence still apply. Test eligible companion arrival separately with the supported invitation/explicit-movement forms; do not silently treat the new plural subject as a new NPC transport permission.

## 12. “Home” semantics

Heartstone's authored aliases are empty. Nicco's authored starting `location` is `heartstone_square`, not a reusable home reference; opening household name/owner records do not identify a canonical residence field. “Home” is currently neither an authored destination alias, runtime-derived home ID, nor a successful hardcoded travel mapping. It is narrator-readable background information and unsupported travel syntax. `resolveDestination('home')` returns undefined.

The previous home audit guard forbids an unresolved named `Nicco enters home` claim; it does not implement home travel. `go home`, `walk home`, `return home`, `we go home`, `let's go home` all move nobody today.

Proposed smallest mapping: a player-only typed/configured constant `PLAYER_HOME_LOCATION = 'heartstone'` in the player-travel helper. It is resolved only after a valid player travel clause, never for other actors or narration. Existing `travelDestination` then maps it to the authored LR entrance and `findRoute` charges existing edges. This avoids a persistent home schema, general pronoun engine and global “home” alias that would falsely mean Heartstone for NPCs. Do not reinterpret a bare assertion “we are home” as travel.

## 13. Route/time/P11 interaction

`findRoute` is deterministic Dijkstra over directed, positive integer edges; ties use the full node-ID sequence. Containers resolve only through authored `entrance`; parent containment does not invent a route. Market → outer lane → Heartstone Square → LR costs 8 + 12 + 1 = **21 minutes**. West Guard Post's historical false route remains a valid 53-minute graph route: graph validity cannot make a bad target interpretation correct.

Runtime preparation checks integer arithmetic, adds minutes, and recovers 25 mana for each crossed 1,440-minute day, capped at max. This is calculated on the detached candidate and committed atomically with location. Failed/cancelled/stale/prevalidation-failed turns commit none of it. Dialogue/local movement/unrecognized travel commit no time delta. Already-here natural travel is a no-op; strict same-node route may contain an explicit zero-minute delta but makes no location/time change.

Audit midnight trace: minute 1435, mana 10 → accepted 21-minute Heartstone travel → minute **1456**, mana **35**, LR. Save/reload preserves that exact location/clock. Real visible disconnected `blackwater` generates a blocked natural action and narrator non-arrival note; location/time stay Market/600.

Preservation rule for second pass: only existing `reachable()` route success emits `{ player_location: route.target, time_advance_minutes: route.minutes }`. Do not infer minutes from prose, group size, daylight or number of companions. No P11/runtime-domain change. Manual correction omits time and mana fields entirely, so +0 and no daily recovery.

## 14. P12 interaction

Successful travel grounds the narrator against destination context before commit. After commit, coordinator history adds delivered narration tagged with the prepared destination. `recentSceneNarration` takes up to two finalized exchanges/2,000 characters from the current contiguous visit, stops at a different **or unknown** location tag, and extracts complete RPG narration spans. A real move establishes a boundary; a later reentry cannot resurrect old destination-visit narration across an intervening location.

Source dialogue/history remains in the broader recent window (up to 12 finalized exchanges/16,000 serialized characters), but current structured state outranks it. P12.2 canonical departure reconciliation affects actor whereabouts, not Nicco travel. It cannot supply the missing player destination.

The failure sequence has no location boundary: escaped Heartstone prose is tagged as market, so P12.1 retains it during the apparent market visit. P12 did not independently move the player; it faithfully scoped already-corrupted delivered prose using unchanged state. Fix recognized travel upstream; retain P12 algorithms.

Manual correction should establish a continuity reset at the coordinator cache seam as described in section 28, including same-ID corrections intended to flush contradictory scene prose. No transcript/history rewrite or P12 redesign.

## 15. Narration reconciliation gaps

Existing successful backstops: explicit unquoted `Nicco goes to/enters/reaches/leaves <canonical place>`, committed ancestry compatibility, unresolved named home arrival, dependent follow correction where recognized player/arrival evidence establishes the missing journey. One revision is audited again; residual flagged sentences are deterministically redacted. Audit never manufactures a movement command.

Observed escapes: `He enters Heartstone Tower`, `They arrive at Heartstone`, plural source departure, destination coming into view, arrival expressed through the journey ending at a door, and second-turn “door opens into Heartstone LR” plus interior descriptions. `grounding-audit.ts` checks bounded prices/prior events/procedures, not physical location-feature coherence. Retrieved accurate destination lore is not an arrival credential.

Recommend **C: both, minimally, with input authority primary**. Commit clear player travel before narration. For recognized blocked/ambiguous/unknown world-travel attempts, retain requested canonical destination where known and emit a mandatory stay-at-source note. Add a contextual arrival audit for player-relative `he/we/they` only when the current movement intent supplies the actor/destination frame, and a bounded explicit scene-location/entry construction such as `door opens into <canonical location>` when narrated as the current scene. Keep quoted dialogue, directions, future/negated travel and NPC-only arrival separate.

Do not build an inventory of furniture to infer scene location. Three windows/a hearth can occur elsewhere and lore may legitimately be discussed. An unnamed interior paragraph without explicit current-location evidence remains a bounded-audit limitation, not grounds to mutate runtime. The proposed supported first turn prevents the reported second turn from being uncommitted. Every added detector needs positive lore/dialogue counterexamples and a no-uncommitted-arrival fixture. No universal semantic guarantee is claimed.

## 16. Save/load behavior

The harness executes valid travel, serializes an actual save envelope with canonical compatibility evidence, validates/decodes it and restores CampaignState: location remains `heartstone_lr`, world minute remains 1456. Existing repository tests verify filesystem writes/reloads; `saveCampaign` captures `exportSnapshot` before awaiting I/O and `loadCampaign` calls validated `CampaignState.restore`.

Save envelope schema is **4**, snapshot schema **3**. Player location/time already persist. UI labels/dayparts and coordinator recent narration are not independent saved location authorities. Saving the failed sequence would faithfully save the market field, not adopt narrated Heartstone.

A manual correction to the existing field needs no schema migration. Normal save dirty tracking follows a changed revision; no automatic save is proposed. Reload derives RAM/context/view from the corrected snapshot, with fresh session-local continuity.

The current disposable V1 HTTP server exposes session/turn/alternative operations, not a save control; `/save` text is reserved at the application seam. Persistence here means the corrected field is included whenever the existing `GameSession.save()`/repository path is explicitly used. It does not promise survival across a fresh disposable playtest startup without saving. Adding a save button or autosave is separate scope, not hidden in the safeswitch.

## 17. Current architectural weaknesses

- Three overlapping grammars and different not-done gates create markup/subject/punctuation asymmetries.
- Unsupported but semantically clear travel usually has no diagnostic/non-arrival note, while the narrator still sees raw intent.
- Shared resolver mixes canonical locations with location features and mention substrings; the clerk trace proves a remaining local-role false positive. “City” fallback scope is actually immediate-parent scope.
- Narration audit checks named travel acts, not every expression of current location; unsupported plural/pronoun/environmental narration can become finalized history.
- Recent history tags committed state, not prose correctness. That is the correct authority rule but magnifies an escaped contradiction until eviction/correction.
- Retrieval can supply destination interiors while current location is elsewhere. This is expected information access; it must not be confused with arrival authority.
- Companion authority is separate and grammar-sensitive. Neither natural plural language nor a previous follow constitutes a permanent player-relative position.
- Primitive runtime commands validate canonical state, not route semantics. Gameplay callers must preserve the route gate; explicit manual admin correction must be a distinct, inaccessible-to-models operation.
- Current V1 HTTP view omits canonical location ID and revision, making debugging/manual correction preparation less convenient than the internal SessionView.

These observations do not justify a new general NLP subsystem, second mutable location store or new permanent P-number.

## 18. KISS candidates

| Option | Fit with current architecture | Benefit | Risk/cost | Verdict |
|---|---|---|---|---|
| A — wider deterministic grammar | Expand `sceneDirection`, natural `SUBJECT/MOVE`, first-person and strict forms | A small plural regex could repair one input | Repeated patterns, inconsistent stars/companions/home; continuous verb/subject patches; may split `Nicco and Mira` too early | Feasible emergency patch, insufficient coherent UX |
| B — destination-first, ignore subject details | Scan movement verb + unique canonical destination anywhere | Catches many obvious phrases | “Mira walks…”, “I tell Mira to walk…”, hypothetical/quoted text and person descriptors become player travel; global name mentions not destination phrases | Reject broad subject-agnostic version |
| C — bounded hybrid | One player-aware travel-clause extractor + explicit destination matcher + current local veto + existing routing | Adds common group/home/companion forms without interpreting general prose | Must define player-inclusive subjects and destination boundary; add adversarial tests | **Recommended** |
| D — UI travel selector / `/go` only | Expose existing explicit travel path | Reliable route authority, tiny engine change | Does not fix ordinary clear player language or narration escape | Useful optional fallback, not the requested travel solution |
| D alternative — narrator/controller/embeddings classify travel | New model authority path | More language recall | Nondeterministic, paid, source authority expanded | Prohibited, not recommended |

No option should change P11, P12 or frozen NPC follow behavior. Do not infer all actors' destinations from the pronoun “they.”

## 19. Recommended KISS travel fix

Add one bounded player-travel helper, shared by the natural/player movement entry points, with this exact concept:

> A direct, current, affirmative player-authored travel clause commits **Nicco only** when its bounded subject includes/stands for Nicco, its complete destination phrase resolves uniquely to an explicit canonical place or Nicco's configured home, and the existing route succeeds. Local person/object focus, ambiguity, unknown destinations and unreachable routes produce no location/time commit.

Recommended subjects: `I`, `Nicco`, `we`, `let's/let us`, leading `they both` as a documented player-inclusive roleplay convention, `Nicco and <present actor>`, or leading subjectless action/imperative. Do **not** accept every grammatical subject or reinterpret NPC-only “Mira walks…” as player movement. `they` without player inclusion stays unresolved unless an existing explicit player-inclusive construction identifies Nicco; no general coreference engine. Apply the same decision to starred/plain direct action clauses; keep quoted dialogue and NPC instructions excluded.

Use a small core family go/walk/head/return/travel, regular relevant morphology and current supported legacy forms; do not continually enumerate prose synonyms. Recognize bounded `back/over/up/down` particles and an optional `with <actor/pronoun>` before/after the destination. Those words explain player phrasing but confer no NPC movement authority. Preserve existing explicit carry handling.

Destination matching for **player travel** should require a whole ID/name/display name/authored alias, or a bounded validated abbreviation whose entire content is an explicit location label. No location-feature head alone and no arbitrary substring of a person description. Keep current exact/local precedence and do not tighten the shared resolver's NPC/door/evidence semantics globally. Add explicit authored aliases for already-useful player labels where necessary (`Heartstone Tower`; `Slave Market`; `pens`), instead of guessing suffix tokens. Duplicate aliases still fail closed. Do not author a generic `market` default when multiple markets could be meant.

“Home” is resolved only in the player helper, to `heartstone`, then through the existing LR entrance/route. “We are home” alone is an assertion, not an act. Plain `I walk back home`, `we go home`, `let's go home` become travel; `takes her home` alone remains unsupported because it does not identify Nicco's completed walking/carrying action sufficiently. Keep that boundary explicit.

Preserve existing action resolution/transfer ordering; do not invoke the new helper twice or produce two player route deltas from one input. A single extracted player travel gets the existing runtime-intent preparation path. If several distinct destinations/travel acts compete, fail closed until sequential travel is deliberately designed. Guard before generic `and` splitting so a coordinated player subject is not torn apart.

Support examples: `they both walk to the Heartstone`, `I walk back home`, `we head to the Slave Market`, `Nicco returns to Heartstone`, `Nicco and Mira walk to Heartstone`, `Nicco walks with Mira to Heartstone`, `walks with her to Heartstone`, marked/unmarked singular approach to a canonical location. `we head to the market` works only where the complete label uniquely resolves; in today's generic-ambiguous case it must not guess.

## 20. Exact production files expected in the implementation pass

No files below were changed by this audit.

| File | Planned bounded responsibility |
|---|---|
| `src/turn/player-intent.ts` | Shared direct player-travel entry/fallback; configured player home; retain strict command errors and one delta |
| `src/turn/natural-actions.ts` | Expose/reuse bounded movement extraction before subject-clause splitting; explicit player destination matching; retain local veto and legacy action outputs; prohibit feature-only player target guesses |
| `src/turn/character-movement.ts` | Only the `resolvePlayerCarry` branch that independently proposes Nicco travel should call the same explicit player destination matcher; leave narrated NPC/follow/door evidence rules untouched |
| `data/locations/calderan/heartstone/heartstone.yaml` | Add explicit `Heartstone Tower` alias if exact player matching needs it |
| `data/locations/calderan/west/calderan_slave_market.yaml` | Explicit established `Slave Market`/`pens` aliases if needed to preserve useful travel without feature inference |
| `src/turn/narration-audit.ts` | Small contextual player-relative arrival/current-scene backstop, including direct entry-location claims; no state mutation |
| `src/turn/stages/audit.ts` | Pass existing resolved movement diagnostics/requested destination to the contextual audit rather than reparsing arbitrary input |
| `src/app/game-session.ts` | Typed manual correction method, busy/stale/closed guards, existing-runtime receipt commit, application-command separation |
| `src/turn/turn-coordinator.ts` | Explicit session-local continuity reset after successful manual correction, never during an active turn |
| `src/turn/scene-participants.ts` | Clear scene list/focus through a small explicit reset method while preserving the session's monotonic participant ID and turn counters |
| `src/ui/server.ts` | Same-origin `/api/location` operation; expose committed canonical ID/revision; final response/confirmation |
| `src/ui/client.js` | Intercept explicit `/location …`; no narrator provisional bubble/call; apply final result and manual confirmation |

A new persistent command kind, save migration, route/runtime/P11 edits, P12 algorithm changes, CSS changes, generic NLP package and controller schema expansion are **not expected**. `src/app/turn-trace.ts` may receive an optional explicit admin-correction diagnostic variant if the existing bounded trace ring is used; otherwise use a small dedicated application event/result. Decide that logging representation before implementation, not by making a correction look like an ordinary narrated turn. CLI `/location` in `src/dev/play.ts` is optional and should use the same correction service if later added, not a second bespoke mutation path.

## 21. Exact tests to add/change

- Add `tests/player-travel-authority.test.ts`: marked/plain plural/singular/coordinated-subject/companion-position/home cases; one player delta; canonical destination exactness; negative, modal, quoted, NPC-only, future, instruction and multi-destination counterexamples; ambiguous/unknown/disconnected results.
- Extend `tests/player-movement-location-consistency.test.ts`: exact two-turn reported inputs now commit LR before narration; preserved post regression; cross-scene clerk/table/woman/guard/local descriptions; rejected player-relative arrivals and doorway current-scene claims; valid arrival remains deliverable.
- Extend `tests/natural-actions.test.ts`: intentional current grammar changes, consistent player movement gates, preserve transfer/equipment/local focus and explicitly supported short destinations.
- Add `tests/manual-location-override.test.ts`: all section 30 scenarios, with no narrator/controller provider available and still succeeding; forged/stale/busy/closed failures and typed primitive validation.
- Extend `tests/application-closure.test.ts`: dedicated correction method versus normal `/location` rejection; session revision/view/dirty-state/continuity reset.
- Extend `tests/ui-v1.test.ts`: manual command interception, canonical ID/revision transport, confirmation, no draft bubble/paid request, invalid/no-mutation error, final header authority.
- Extend `tests/persistence.test.ts`: manual correction round-trip on the unchanged save schema.
- Reuse unchanged `tests/city-travel.test.ts`, `tests/p11-time-foundation.test.ts`, `tests/p121-recent-scene-narration.test.ts`, `tests/p122-canonical-departure.test.ts` and frozen movement/follow/participant suites. Add new boundary fixtures to the manual/new movement tests; do not weaken existing P11/P12/follow assertions.

The audit harness intentionally records today's plural/interior failure. During implementation either retain it as a baseline-only recorded artifact or explicitly version its expectations to the new behavior; never silently rewrite a current-behavior audit into proof that the old behavior worked.

## 22. Regression risks

Primary risks: NPC-only movement becoming Nicco travel; spoken plans/negation/questions committing; embedded canonical nouns in local descriptors; two route deltas from two parser lanes; feature aliases newly colliding; parent entrance misunderstood; companion auto-teleport; absent actor narration after valid player travel; stale receipts during streaming; a manual correction traveling/advancing time; and old scene prose after correction.

Protect them with exact typed-delta comparisons, cross-scene local cases, canonical-name collision fixtures, provider-call counters, before/after actor/clock snapshots, failure rollback, final HTTP/DOM checks and save round-trips. Adding authored aliases changes the canonical dataset fingerprint, so the existing reference-based save compatibility checks must be run; no migration/bypass is proposed. Prefer adding explicit aliases over weakening reference compatibility. Do not change economic acceptance tests or fix the separate purchase issue here.

## 23. Manual location safeswitch design

This is a **player-initiated debug correction**, not in-world travel. Use a narrow typed request `{ target: string, expected_revision: number }` exposed through GameSession, with a result stating `manual_override: true`, old/new canonical IDs, unchanged minute, committed revision, `changed`, final view and confirmation. UI must never mutate a snapshot.

Resolve an exact canonical ID, optionally a complete exact canonical name/display name. Filter to usable player/narrator-visible location entities; reject a character, feature, invented string or duplicate name. Do not use `resolveDestination`'s lexical/feature/mention fallback. An ID always identifies that exact node. If user chooses container `heartstone`, correction means the container itself: no silent entrance conversion. Prefer `heartstone_lr` for the intended interior.

Validate idle/open session and caller revision, prepare the existing typed `runtime_delta` containing **only** `player_location`, validate the prospective scene/view as needed, then synchronously commit its owned receipt. No narrator/controller/reflection/retrieval request, no route, time or mana delta. Re-derive normal final projections and establish the explicit continuity reset. No auto-save. Failed resolution/validation/staleness must leave state and continuity unchanged.

## 24. Recommended syntax and failures

**`/location heartstone_lr`**. `/set-location` is more verbose; `/go` already means routed in-world travel and must not be overloaded. Optional exact human names may share the same operation: `/location Heartstone Living Floor`. IDs are preferred and displayed in confirmation.

| Input/condition | Response and mutation |
|---|---|
| `/location heartstone_lr` | “Manual location correction: Calderan Slave Market → Heartstone LR (`heartstone_lr`). Time unchanged.” |
| `/location banana` | “Unknown canonical location ‘banana’. No location changed.” |
| `/location market` | If no exact name: unknown; if exact names collide: ambiguous. Return at most five canonical name/ID candidates for a new explicit choice; never apply an approximate match |
| Exact duplicate display name | “Ambiguous canonical location. Use one of these IDs.” No mutation |
| Canonical character ID / secret or unusable location | “That target is not an available canonical location.” No mutation/leak of private details |
| Busy/closed session | Existing `turn_in_progress` / `session_closed` response |
| Stale expected revision | Existing `stale_turn` with refresh-and-retry message; no mutation |
| Same current node | Successful manual confirmation with `changed: false`, revision unchanged under normal no-op rules; continuity can still be reset to remove contradicted prose |

Use existing `invalid_input` plus precise safe messages and optional candidates for unknown/ambiguous targets; a new error taxonomy is unnecessary. Never silently choose a feature, stem, shortest route or familiar place.

## 25. Safeswitch authority path

`/location …` is recognized by the client as an application command → same-origin `POST /api/location` with target/expected revision → `GameSession.overridePlayerLocation(request)` → exact canonical validation → `campaign.prepare({ expected_revision, commands: [{ kind: 'runtime_delta', delta: { player_location: id } }] })` → adjacent validated commit → coordinator continuity reset → derived final view/confirmation → browser header.

This is a **typed session-level admin operation using an existing typed campaign command**, not a new generic CampaignCommand accessible to models. It is smaller than adding `manual_mode` to travel, simpler than a new serialized command vocabulary, and uses the existing revision/receipt/dirty/save machinery. `campaign/characters.ts` could already move canonical Nicco at the low-level trusted API, but runtime_delta is more direct and avoids suggesting a companion movement command.

Normal `submitPlayerInput` must reject reserved `/location` text that bypasses the dedicated operation. Add an equivalent coordinator/player-intent rejection guard for direct engine callers so it cannot become narrator speech. Model text/proposals have no GameSession admin capability; controller schema/authorization remain unchanged. Reflection and narrator alternatives also cannot call it. Existing same-origin/loopback write restrictions apply. Reject correction during generation; do not race/cancel/mutate an active turn automatically.

## 26. Safeswitch time semantics

**Zero minutes; no route.** Omit `time_advance_minutes`, `mana_delta`, character movements and all travel semantics. `prepareRuntimeDelta` defaults absent minutes/mana to zero; crossed-day count is zero, so mana does not recover and the daypart stays identical. No travel narration/event is invented. Changed location increments revision normally; same-node correction is a no-op revision. The confirmation makes correction/time behavior explicit.

## 27. Safeswitch companion semantics

**Nicco only.** Leave all created/canonical NPC locations and off-scene metadata unchanged, including active NPC+ household members. They may become absent from the new scene; household presence will correctly show them away. No “move current followers too” toggle in V1 and no reuse of narrative following evidence: no narrative turn is being run, and there is no permanent follower state to derive transport from.

If correcting a historical companion divergence becomes necessary, design a separate explicit actor correction later. It is not part of this player safeswitch or authority expansion.

## 28. Safeswitch P12/recent-context semantics

Structured state always wins. Simply changing the runtime field naturally creates a different-location P12 boundary, but is insufficient for a same-ID correction or a destination with old poisoned narration tags. Avoid history surgery: add a small coordinator operation `resetSceneContinuity(campaign)` that replaces its per-campaign RecentConversation cache, clears the existing SceneParticipants list/focus through a dedicated boundary method, and deletes the retained last-input relevance entry after successful manual correction. These are already session-local WeakMaps, not persisted world state. Do not replace the SceneParticipants object or reset its monotonic `#next`/turn counters: its IDs must not be reused within the session.

Keep the UI's transcript and audit traces intact as historical display. The next prompt gets a fresh derived authoritative scene; no old market/interior scene spans, conversation partner or actor focus can reassert a contrary current scene. This drops the bounded recent prompt dialogue as well as scene narration—a deliberate, explicit emergency-correction cost. It does not rewrite P12 algorithms or change ordinary travel/history retention.

The inspected compaction implementation (`turn/context-compaction.ts`, `narrator-pack.ts`) caches validated knowledge units, not an independently authoritative current scene or recent-history block. Keys include source/context identity and revision; `renderCandidateRequest` replaces only the knowledge block in the fresh request and preserves all other current bytes. Rebuild the coordinator request after the reset; no compressor setting, cache subsystem redesign or new provider call is needed. Reject correction while compaction/session work is busy. No synthetic in-world arrival is added to RecentConversation. Confirmation/admin marker belongs to application diagnostics, not narrator dialogue.

## 29. Safeswitch UI recommendation

| UI option | Assessment |
|---|---|
| A — text command only | **Recommend for V1.** Reuses composer, exact canonical ID/full-name input and existing response rendering; minimal controls/code |
| B — debug dropdown + Force Location | Safer discovery/selection but needs option endpoint, control state and labels; useful later for many sublocations |
| C — both | Good eventual usability if both call the same `/api/location`/session operation; unnecessary V1 scope |

Intercept `/location` before creating a provisional narrator bubble. Display a clearly manual application confirmation, apply the final committed view, retain the ordinary transcript. Expose `scene.id` and `revision` in the committed HTTP session payload so the client sends a real expected revision; the existing SessionView already has them. Optional location label tooltip/debug toggle showing `heartstone_lr` materially helps playtest bug reports without making an ID part of ordinary roleplay.

If a dropdown is later built, populate only from eligible canonical locations, show human names plus IDs/disambiguating ancestry, submit the canonical ID on an explicit Force Location click, and use the same operation. No automatic selection commit, inferred destination, arbitrary new location string, or independent UI state write. No controls were added now.

## 30. Safeswitch future test matrix

| Test | Expected second-pass behavior |
|---|---|
| 1. Valid ID | Canonical player location changed and manual confirmation returned |
| 2. Invalid ID | Unknown/no mutation |
| 3. Ambiguous exact name | Bounded candidates/no mutation |
| 4. No time advance | Exact world minute/daypart/mana unchanged |
| 5. Revision | +1 when changed; same-node no-op stays same revision; stale caller rejected |
| 6. Scene RAM | Current canonical node equals corrected field |
| 7. NarrativeContext | Primary scene equals corrected field |
| 8. Session view | ID/name/presence derived from corrected snapshot |
| 9. HTTP/DOM | Only final correction response updates header; no provisional scene projection |
| 10. Save/reload | Existing schema persists corrected field and unchanged clock |
| 11. Narrator cannot invoke | Draft mentioning `/location` cannot call admin operation or mutate state |
| 12. Controller cannot invoke | No admin schema entry; runtime delta/`move_character(nicco)` rejected in gameplay |
| 13. No route required | Valid visible disconnected canonical target succeeds as explicit correction |
| 14. No travel narration | Zero provider calls; confirmation is manual, not a narrated walk |
| 15. Companion semantics | All NPC records/off-scene metadata unchanged; presence recomputed |
| 16. Recent state priority | Old tagged market/destination prose and focus absent from next prompt after reset |
| 17. Busy/closed/forged receipt | Reject/no mutation; never bypass transaction ownership |
| 18. Exact container semantics | Given `heartstone` writes that exact ID; no route/entrance guessing |
| 19. UI/API validation | Same-origin and exact target constraints; typed revision required |
| 20. Partial failure | Resolve/prepare/prospective-view failure leaves state and continuity intact; final projections cannot come from a pre-commit snapshot |
| 21. Participant/compaction boundaries | Old focus is gone, participant IDs are never reused, and a cached knowledge compaction cannot reintroduce stale scene/history bytes |

All are future tests. This audit does not add a working safeswitch or simulate it as an ordinary travel turn.

## 31. Explicit things not to implement

No production changes in this pass. In the next pass, no narrator/controller/embedding travel classifier, universal NLP/coreference engine, endless synonym list, last-token place guesses, furniture-to-location classifier, second mutable player location, implicit companion party transport, follower redesign, new clock, P11/P12 algorithm rewrite, UI-from-prose header, automatic save, arbitrary new canonical locations, new persistent manual-override schema or purchase fix. Preserve `e4b3a45` and canonical casting. Narrative quality is observation-only.

## 32. Next implementation-pass checklist and current validation

1. Implement one bounded player-inclusive travel detector/destination mode; preserve legacy effects and one typed delta.
2. Add player-only home resolution and explicit compatibility aliases, with ambiguity tests and reference-save compatibility verification.
3. Prove exact plural travel commits LR/+21 before narration; second interior turn remains there without extra time.
4. Extend the bounded movement audit with contextual player-relative and explicit scene-entry claims; countertest dialogue/lore/NPC-only cases.
5. Protect local targets from other starting nodes, especially clerk/feature fallback; retain post and known useful destination regressions.
6. Add a dedicated typed session correction and reserved `/location` separation, then normal receipt/revision commit without route/time/providers/NPC changes.
7. Reset emergency correction's session-local prompt/focus continuity; retain UI transcript/admin trace; verify same-ID poisoned history case.
8. Add the minimal UI text command/final view confirmation and canonical ID/revision metadata; optional ID tooltip only.
9. Run focused player movement, route, scene/context, HTTP/DOM, P11/P12, participant/follow and save/load tests; run full typecheck/unit/playthrough/build. Verify production diff scope and no paid calls. Commit locally; no push unless separately requested.

Current audit validation:

| Check | Result |
|---|---|
| Offline audit script | 118 matrix turns, two-turn real HTTP sequence, 12 reconciliation/companion traces, midnight/save round-trip, real unreachable route and cross-scene clerk trace; **36 assertions passed** |
| `npm run build --silent` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 2,366 tests: **2,363 passed, 0 failed, 3 existing TODOs** |
| Focused movement/P11/P12/UI/save/follow run | **241 passed**, 0 failed |
| `npm run test:playthrough` | **25 passed**, 0 failed |
| Production diff (`src`, `data`, existing `tests`) | Empty |
| Paid provider/embedding calls | **0** |

The current baseline has three historical TODOs because the intervening `bd5353e` commit promoted the former unnamed-captive-price TODO to a regression before this audit. This pass neither alters nor removes a TODO. Unit Node workers were run with approved child-process permissions. The standalone offline harness succeeded without paid services.

## 33. Separate remaining authority bug

Next separate issue: **1050G purchase with a 500G purse**. Listed only; no purchase/economy/legal investigation or fix was performed in this pass. Handle its funds/transaction/narration authority in a separate audit/fix after the travel-authority work.

## Final recommendations — A. Travel fix

**RECOMMENDED APPROACH:** Option C, bounded hybrid: player-inclusive direct travel clause → explicit canonical/home destination → existing route/runtime delta; input authority first, contextual narration audit second.

**WHY THIS IS KISS:** Reuses the one location authority, existing routing, time, receipts and NPC movement evidence. Adds a small subject/destination abstraction rather than repeated grammars, model calls or a party system.

**EXACT SEMANTIC RULE:** Commit Nicco only for a current affirmative direct player travel clause with a player-inclusive bounded subject, a unique complete canonical destination/player home and an existing valid route. Otherwise commit no player location/time and pin narration to the current source.

**WHAT NATURAL INPUTS IT ADDS:** Plain/starred `they both walk to the Heartstone`, `we head to the Slave Market`, `I walk back home`, `we go home`, `let's go home`, `Nicco walks with Mira to Heartstone`, `Nicco and Mira walk to Heartstone`, and clear subjectless canonical travel. Preserve already-supported singular/strict travel. Generic `market` only works if uniquely explicit; no new default.

**WHAT LOCAL INPUTS REMAIN NON-TRAVEL:** Man/post, woman/fan, seller, clerk, table, guard, near-door and across-room approaches, including descriptions containing canonical place names. Preserve the prior post veto and eliminate feature-only player travel guessing.

**AMBIGUITY BEHAVIOR:** No move/time; explicit ambiguous diagnostic/choice note, bounded canonical candidates when useful. Do not choose a top weak mention, familiar location or route.

**UNKNOWN DESTINATION BEHAVIOR:** No move/time; unknown-destination/stay-at-source note. Explicit invalid commands retain their existing rejection semantics.

**COMPANION LANGUAGE:** Extract Nicco's destination only. Follow/carry/explicit eligible NPC movement stays on the frozen evidence/authorization path; invitation/past accompaniment is not transport.

**TIME AUTHORITY:** Existing route's exact minutes in the same committed player delta. P11 unchanged; failed/unrecognized/local movement +0.

**NARRATION SAFETY NET:** Keep named arrival and home guards, extend only contextual player-relative/current-entry claims tied to resolved movement evidence, audit revision again and redact residual contradictions. No location adoption from prose or giant feature classifier.

## Final recommendations — B. Manual location safeswitch

**RECOMMENDED COMMAND:** `/location heartstone_lr`; optionally complete exact canonical name/display name, never fuzzy/feature lookup.

**RECOMMENDED UI:** Text command in current composer intercepted as an application operation; explicit manual confirmation. Return canonical ID/revision. Optional debug ID tooltip; dropdown later only through the same authority path.

**AUTHORITATIVE MUTATION PATH:** Typed `GameSession.overridePlayerLocation` request → exact location/idle/revision validation → existing `runtime_delta { player_location }` receipt → atomic CampaignState commit → continuity reset → final derived view. No new persistent schema or model command.

**ROUTE CALCULATION:** NO.

**TIME ADVANCEMENT:** NO; zero minutes, unchanged mana/daypart.

**PLAYER LOCATION ONLY OR FOLLOWERS:** Nicco only; all NPC positions unchanged, presence rederived.

**SAVE/LOAD:** Existing location field and unchanged save/snapshot schemas; normal unsaved revision tracking and explicit save.

**P12 BOUNDARY HANDLING:** Reset session-local recent scene/dialogue/focus and retained last-input relevance after success; keep historical UI transcript/admin trace. No synthetic travel/arrival or P12 algorithm rewrite.

**NARRATOR ACCESS:** NO.

**CONTROLLER ACCESS:** NO.

**IMPLEMENTATION STATUS:** Design only. Neither the travel improvement nor the safeswitch is implemented by this audit.
