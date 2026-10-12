# Audit B: Identity, Movement/Group Movement, Heartstone/NPC+

Repo `/home/user/Calderan_RPG` @ c0608a6 (read-only; no repo edits, no live calls; `npm run typecheck` not run, no code changed). All paths relative to the repo root. Implementation is the source of truth; where a doc was not read I say so. "Verify" marks inferences I did not prove with a run.

Severity: P0 data corruption / trust break, P1 visible wrong state or fork, P2 latent / design gap, P3 hygiene.
Classification: BUG, GAP (missing capability), DEBT (duplication / naming), RISK (latent), DECISION (needs product call).

---------------------------------------------------------------------------------------------------

## DOMAIN 1: IDENTITY SYSTEM

### 1.1 Current behaviour (as implemented)

**Identity layers (five distinct notions, each with its own owner):**

1. Canonical identity: a `WorldStore` character entity (`role: "npc"`), id = entity id. Name is canon; whether Nicco knows it is a separate fact.
2. Campaign identity: `CampaignCharacter` in `snapshot.characters`; `origin` is `canonical{canonical_entity_id}` or `created` (`src/campaign/types.ts:4`). Created ids are `campaign_character_r<revision>_<slug>` (`src/campaign/promotion.ts:221-223`, `src/campaign/identity.ts:8-13`). `CampaignIdentityResolver.registration` rejects a duplicate id and forces canonical registration to reuse the canonical id (`src/campaign/identity.ts:38-44`). `snapshot-validation.ts:42` enforces id uniqueness only (no uniqueness over name or `origin_snapshot.ephemeral_ref`).
3. Scene participant identity: session-local ephemeral `scene_npc_<n>` (`src/turn/scene-participants.ts:120`, `:133` expires on location change). Never persisted. Promoted to a created character by name establishment (`src/turn/name-establishment.ts:50-80`) or by a person offer (`src/turn/person-offers.ts:345-366`) and then retired (`retire`, `scene-participants.ts:~197`; `retireParticipants`, `turn-coordinator.ts:~75`).
4. Anonymous/unknown: a created character with no `profile.name`; narrator label = `origin_snapshot.label` ("the girl") via `labelled()` in `src/turn/context-builder.ts:111-114`. Canonical NPC unknown to Nicco: narrator sees `the unfamiliar woman: <appearance>` and `NPC<n>` refs (`src/turn/narrator-identity.ts:34-41`).
5. Player knowledge of identity:
   - Canonical: a per-character "identity name fact" `campaign_fact_identity_name_<id>` plus a `knows` edge for nicco (`src/campaign/identity-knowledge.ts:5-20`). Built in `registerNarratorIdentities` (`narrator-identity.ts:29-37`).
   - Created: the profile name, proven by `profile.name_source` or by equalling the promotion-time `origin_snapshot.established.name` (`knownCreatedName`, `src/app/player-character-view.ts:59-63`).

**Disclosure of a canonical name (all engine-owned, no prose rewrite):**
- Capability offered only on a direct name request or self-introduction (`NAME_REQUEST`/`SELF_INTRODUCTION`, `src/turn/identity-request.ts:4-7`) to exactly one resolved partner (`canonicalNameDisclosure`, `src/turn/canonical-name-disclosure.ts:75-85`).
- Learned only if the delivered speech is an attributed truthful self-introduction by the bound partner (`establishedCanonicalDisclosure`, `canonical-name-disclosure.ts:128-165`). Then `learnCanonicalName` writes fact + knowledge edge on the same canonical id.

**Foreground partner and objective binding:**
- Two bind routes, both before the next Narrator call: explicit selection by the planner (`canonicalInteractionTargets`, `src/turn/canonical-interaction-targets.ts`) and narrated surfacing (`narratedForegroundCanonical`, `src/turn/foreground-binding.ts:24-37`, strong exclusive trait match, fails closed on 2+ candidates). Speaker among several surfaced: `narratedSpeakerPartner` (`foreground-binding.ts:60-77`).
- Binding is session continuity only: `RecentExchange.conversation_partner_id` (persisted in save continuity, `src/persistence/save-format.ts:28,79-82`) and `SceneParticipants.#focus` (`scene-participants.ts:208-211`, not persisted). Binding is dropped on location change (`narratedPartner(... stayed)`, `turn-coordinator.ts:~63-66`).
- Conflicting self-introduced name for a bound canonical partner: REJECT policy. `partnerNameConflict` (`src/turn/partner-identity-guard.ts:112-139`) feeds (a) `establishNames` which then skips creation (`name-establishment.ts:64-65`, reason `canonical_partner_conflict`), and (b) the audit revision (`narration-audit.ts:383`, issue `canonical_name_conflict`). Retrieval never binds anything.
- Narrator is told objective identity via `[PEOPLE JUST SHOWN TO NICCO]` and a per-partner payload (`src/turn/prompt-builder.ts:239-251`); all other text goes through `gate.mask` (`prompt-builder.ts:255,322-326`).

**Provisional names ("Slave") and same-entity rename:**
- An unnamed person Nicco holds as enslaved is shown to the PLAYER as "Slave" (sidebar `src/app/session-view.ts:69-70`; card `src/app/player-character-view.ts:151-153`; offer card `"<Descriptor> Slave"` `src/app/trade-offer-view.ts:50,59-66`). The NARRATOR sees the origin label, not "Slave".
- Late naming: `readScene` namings -> `set_profile` on the SAME id with `name_source: "self_disclosed"` (`name-establishment.ts:56-62`; `narrated-captives.ts:396-405`). Origin snapshot is never rewritten. Tests: `tests/identity-continuity-stress.test.ts:86`, `tests/current-character-name-projection.test.ts:44`.
- Person offer: the subject is a planned `register_character` stored inside the offer, registered on Accept; supersession reuses the planned id (`person-offers.ts:343-356`); accept re-checks `ephemeral_ref` collisions and flags `person_unavailable` (`src/campaign/trade.ts:71-76`); accept rewrites `promoted_revision` (`trade.ts:198-200`).

**Avatars:** authored canonical avatar only for non-created records and only if `named || here` (`player-character-view.ts:~190`, comment "Portrait precedence"); selected NPC+ avatar wins. Test: `tests/canon-avatars.test.ts` A13-A16, `tests/foreground-canonical-binding.test.ts:108` (T6).

**Sidebar / UI:** browser receives only `play` projection (`src/ui/server.ts:37-48`), built by `derivePlayUiView` from `playerCharacterProjection` (`src/app/play-ui-view.ts:9-25`), with masking `text()` (`player-character-view.ts:140-165`).

### 1.2 Every way the same person can fork into two records (ranked)

| # | Fork vector | Where | Sev | Class |
|---|---|---|---|---|
| F1 | **Movement divergence feeds identity fork.** A purchased created person is left at the market because the follow was not recorded, while narration at Heartstone keeps depicting "she". If she is then narrated as self-introducing, `readScene` only treats PRESENT persistent characters as `known` (`narrated-captives.ts:330-331,406`), and she is not present in state, so a fresh `register_character` (new `r<rev>_<slug>` id) can be created for the "new" woman at Heartstone while the real record sits at the market. Same root cause as the movement bug (see Domain 2). | `narrated-captives.ts:330,406`; `name-establishment.ts:63-79` | P1 | BUG (consequence) |
| F2 | Revision-scoped created ids mean the SAME name can never collide on id; dedupe rests entirely on the narration reader (`known`, `campaign_names`, canon bearer check `:409-420`). `campaign_names` is used only for the weak-name path (`:423`), not for strong self-introduction. Absent-but-existing campaign people with the same name are not deduped by design ("names are not identity"), but nothing links an "absent campaign Maren" to a "new Maren" the narrator presents as the same woman. | `promotion.ts:221`; `narrated-captives.ts:406,423` | P2 | RISK |
| F3 | **Ephemeral counter restarts on load.** `SceneParticipants` lives in a `WeakMap<CampaignState,...>` (`turn-coordinator.ts:~70-76`, "never persisted or saved") with `#next = 1` (`scene-participants.ts:120`). After reload, a new participant can be `scene_npc_1` again, and `origin_snapshot.ephemeral_ref` of an older promoted person can be the same string. `trade.ts:76` then answers `person_unavailable` for an unrelated new captive. Also `linkedParticipant` matching by noun/role (`narrated-captives.ts:540-543`) is the only binding between player-introduced participant and narrated captive. (Verify: depends on the exact format of non-participant `p.ref`.) | `scene-participants.ts:120`; `trade.ts:75-76` | P2 | BUG (latent, false block) |
| F4 | Late-naming only applies to a PRESENT unnamed persistent character (`soleUnnamed`, `narrated-captives.ts:401`). If the unnamed person is absent (left behind) and a woman at the arrival scene gives a name, the name creates a new record. Again F1 amplifies it. | `narrated-captives.ts:401-405` | P2 | RISK |
| F5 | Canonical NPC re-cast as a created person: guarded by canon bearer checks (exact full name, "referenced" full name, noun-bound) and by `candidateNames` filter; a shared first name with an absent canonical NPC creates a new person only when one described actor self-introduces (`:409-420`). Tests: `created-person-identity-binding.test.ts:172,188`, `identity-continuity-stress.test.ts:70`. Residual risk is regex-based. | `narrated-captives.ts:409-420` | P2 | RISK |
| F6 | Name introduced on a turn where Nicco changes location is skipped by design (`location_changed`), so a person may be named later in a different exchange: acceptable, but the participant is retired/expired on scene change (`scene-participants.ts:133`) so the later naming has no `linkedParticipant`. | `name-establishment.ts:67`; `stages/commit-preparation.ts:43` | P3 | RISK |
| F7 | Person offer subject planned from a narrated captive: counteroffer reuses the prior planned id only if the earlier register plan has the same `ephemeral_ref` (`person-offers.ts:349-355`). If the `ref` string differs between turns (participant expired, then re-read as `P<n>`), a second planned identity is created; accept-time `personKey` uses `ephemeral_ref ?? id` (`trade.ts:90-95`), so supersession may fail to identify the same subject. | `person-offers.ts:349-355`; `trade.ts:90-97` | P2 | RISK (verify) |
| F8 | Canonical NPC to campaign record: no production code creates canonical-origin campaign records (only `src/dev/turn-fixture.ts:50`, tests, and `scripts/explicit-promotion-browser-check.mjs`). So the "authored NPC+" path (movement, `npcPlusEntrants`, rite for canon) is exercised by tests only. If a producer is added, `characterView` already merges canonical + overlay by id, so there is no fork, but the movement and masking code for it has had no production exposure. | grep, `src/dev/turn-fixture.ts:50` | P3 | GAP / dead-in-prod |
| F9 | Save/load: identity-name fact id is `campaign_fact_identity_name_<id>`; a collision throws (`identity-knowledge.ts:12`). Recent exchange continuity validated (`save-format.ts:79-82`). No fork found. | | n/a | OK |

### 1.3 IDENTITY INVARIANT CHECKLIST

| # | Invariant | Enforced at | Tested at | Gap |
|---|---|---|---|---|
| I1 | One person = one campaign id; id never reused or rewritten. | `identity.ts:38-44`; `snapshot-validation.ts:42`; set_profile keeps id (`name-establishment.ts:60`) | `identity-continuity-stress.test.ts:86,110,115`; `current-character-name-projection.test.ts:44` | No snapshot-level uniqueness on `origin_snapshot.ephemeral_ref` (see F3/F7). |
| I2 | A canonical NPC is never duplicated as a created person. | `narrated-captives.ts:409-420`; canonical casting `canonical-interaction-targets.ts`; `partner-identity-guard.ts:112-139` | `foreground-canonical-binding.test.ts` T3,T4,T9,T11,T12; `created-person-identity-binding.test.ts:172`; `identity-continuity-stress.test.ts:70` | Regex-based; a canonical NPC not present in the scene (so not "bound") gets only the name-based canon check. |
| I3 | Objective identity (engine) is independent of the label the player knows. | `narrator-identity.ts`; `prompt-builder.ts:239-251`; `foreground-binding.ts` | `identity-objective-vs-known.test.ts` I1-I12; `foreground-canonical-binding.test.ts` T1,T16 | Masking is string substitution of full names/aliases only (`narrator-identity.ts:38-45`); a first-name fragment inside canon text is not masked (verify with a leak test). |
| I4 | Player learns a canonical name only through a truthful, attributed self-introduction (or host grant). | `canonical-name-disclosure.ts:75-165`; `learnCanonicalName` | `identity-objective-vs-known.test.ts` I5-I10; `foreground-canonical-binding.test.ts` T17-T23 | Heavy heuristic surface (`noCompetingSpeaker`, ~60 lines of regex); Controller cannot grant it. |
| I5 | A bound canonical partner cannot self-introduce under another name; no entity is created for it. | `partner-identity-guard.ts`; `name-establishment.ts:64-65`; audit `narration-audit.ts:383` | `foreground-canonical-binding.test.ts` T3,T4,T9,T17,T18 | Scope deliberately narrow (name request or self-intro by the player only). |
| I6 | Binding is session continuity, never a campaign mutation. | `foreground-binding.ts` doc; `recordExchange` | T16 | `#focus` / `#focusLocation` not persisted; `conversation_partner_id` is, so load restores recent partner but not participant plan (asymmetry, P3). |
| I7 | Unnamed held person shown consistently as "Slave" to the player until legitimately named; same id, same offer ref after reveal. | `session-view.ts:69-70`; `player-character-view.ts:153`; `trade-offer-view.ts:50,59-66` | `actual-offer-ui.test.ts`, `actual-offer-v1.test.ts`, `current-character-name-projection.test.ts` | THREE separate implementations plus `scene-participants.ts:56`; the offer card says "Young Slave" while the sidebar says "Slave" (descriptor only in trade view). |
| I8 | Created-name display = proven name only. | `knownCreatedName` (`player-character-view.ts:59`) | `current-character-name-projection.test.ts:72,87`; `created-name-provenance.test.ts` | NARRATOR side uses `profile.name` directly (`context-builder.ts:108-114`, `scene-state-projection.ts:~190`), not `knownCreatedName`. Safe today because only engine commands write `profile.name`, but the two sides can diverge (P3). |
| I9 | Name provenance outlives recent transcript. | `profile.name_source`, `context-builder.ts:105`, `promotion.ts:36` | `created-name-provenance.test.ts` | OK. |
| I10 | Late naming applies to the same record only when the person is present and unnamed. | `narrated-captives.ts:401-405` | `created-person-identity-binding.test.ts:134`; stress test :86 | Absent unnamed person cannot be late-named (F4). |
| I11 | An ephemeral participant becomes at most one persistent person; retired after promotion. | `scene-participants.ts retire`; `retireParticipants`; `stages/intent.ts` "just-promoted participant retired" | `foreground-canonical-binding.test.ts` T10; actual-offer tests | Counter restarts on load (F3). |
| I12 | Purchase never forks the subject across counteroffers/supersession. | `person-offers.ts:349-355`; `trade.ts:90-97` | `actual-offer-v1.test.ts` (supersession cases, c0608a6 message) | `ephemeral_ref` stability across turns not enforced by schema (F7). |
| I13 | Canonical avatar bound to canonical id, never to name or request text; no avatar for an unnamed absent NPC. | `player-character-view.ts` portrait precedence | `canon-avatars.test.ts` A9,A15,A16, "unnamed canonical NPC not in scene shows no portrait" | OK. |
| I14 | UI never receives hidden canonical names. | `ui/server.ts:37-48`, `player-character-view.ts text()` | `identity-objective-vs-known.test.ts` I11; `ui-v1.test.ts` | `deriveSessionView` (`session-view.ts:96,104`) still returns UNMASKED `name` for canonical present NPCs and household members. Only the server's field selection hides it. P3 RISK: any new consumer of `SessionView` leaks. |
| I15 | Identity facts are kept in one store (no second name store). | `identity-knowledge.ts:4` | `identity-objective-vs-known.test.ts` I6 | OK. |
| I16 | Person presence in state matches the person depicted in narration. | `narration-audit.ts` absent_participant (`:274-305,363`), movement audit (`:501-530`) | `final-movement-closure.test.ts`, `follow-recognition-closure.test.ts` | NPC+-only for follows (see Domain 2). Created non-NPC+ pronoun/implicit follow is invisible to the audit, hence F1. |

### 1.4 Where identity logic is scattered (consolidation candidates)

| Concern | Locations |
|---|---|
| "Slave" provisional label | `src/app/session-view.ts:69-70`; `src/app/player-character-view.ts:151-155`; `src/app/trade-offer-view.ts:50,59-66`; role `slave` in `src/turn/scene-participants.ts:56` |
| "Is the name known / what to display" | `knownCreatedName` (`player-character-view.ts:59`); `sceneDisplayNames` (`scene-state-projection.ts:~178-189`); `labelled`/`promoted` (`context-builder.ts:102-114`); `safeName` (`session-view.ts:85-91`); `registerNarratorIdentities` (`narrator-identity.ts`); `externalName` (`scene-state-projection.ts:~192`) |
| Masking (3 independent substitution engines) | narrator `gate.mask` (`narrator-identity.ts:45-50`), UI `text()` (`player-character-view.ts:140-165`), trade-view reuse of `characters.text` |
| Who is the partner | `canonical-interaction-targets.ts`, `scene-participants.ts plan/commit`, `foreground-binding.ts`, `canonical-name-disclosure.ts disclosureTarget/boundPartner`, `narrator-focus.ts projectNarratorFocus`, `RecentExchange.conversation_partner_id` |
| Creating a person | `name-establishment.ts`, `person-offers.ts:345,363`, `promotion.ts`; `narrated-captives.ts` readScene is the shared reader but each caller re-implements the dedupe checks (`known`, `participant`, `prior offer`) |
| Name request / self-intro detection | `identity-request.ts`, plus its own regexes in `partner-identity-guard.ts:132-137`, `narrated-captives.ts asksName`, `canonical-name-disclosure.ts intro/bareName` |
| "Is this a person present" | `context-builder.ts:85` (present list), `scene-state-projection.ts derivePresence`, `session-view.ts inScene`, `movableCharacters` |

### 1.5 Findings table (Domain 1)

| ID | Sev | Class | Finding | Evidence | Action |
|---|---|---|---|---|---|
| ID-1 | P1 | BUG (consequence of MOV-1) | Unrecorded follow leaves the person at origin while narration shows her at arrival; a self-introduction there can create a second record. | F1 | Fix MOV-1 first; add an audit/readScene guard: a strong self-introduction at a scene where an existing UNNAMED/unplaced campaign person with matching description is elsewhere should be flagged, not promoted. |
| ID-2 | P2 | BUG (latent) | Ephemeral id counter resets on load; collides with stored `origin_snapshot.ephemeral_ref`; can falsely block `accept_trade_offer`. | `scene-participants.ts:120`, `trade.ts:75-76` | Namespace the ref (e.g. include `campaign revision` or random-free `r<turn>` prefix) or seed `#next` from max ref in snapshot; add reload test. |
| ID-3 | P2 | DEBT | "Slave" label implemented 3-4 times with different output ("Slave" vs "Young Slave"). | I7 | Single `provisionalPersonLabel(snapshot, id)` in `src/campaign/` or `src/app/`; all three views call it; decide descriptor policy once. |
| ID-4 | P2 | RISK | No snapshot-level invariant on `ephemeral_ref` uniqueness or same-location duplicate unnamed twins. | `snapshot-validation.ts:42,160` | Add validation (warn-level on load to stay save-compatible) + a dev "duplicate identity" diagnostic. |
| ID-5 | P3 | RISK | `SessionView` carries unmasked canonical names; only server filtering protects. | `session-view.ts:96,104` | Make `SessionView` carry `display_name` only (it already has `safeName`) or mark `name` internal. |
| ID-6 | P3 | RISK | Narrator vs UI use different "proven name" rules. | I8 | Route narrator `labelled` through `knownCreatedName` (moved to `campaign/`). |
| ID-7 | P3 | RISK | Masking is full-name/alias string replacement; fragments not masked. | `narrator-identity.ts:38-45` | Leak test over canon retrieval chunks containing surname-only/first-name-only mentions of an unknown NPC. |
| ID-8 | P3 | GAP | Canonical campaign-record producer absent in production; authored-NPC+ branches are test-only. | F8 | Decide: remove the dead branches or add a deliberate producer (see Domain 3). |
| ID-9 | P3 | DEBT | Participant plan not persisted while `conversation_partner_id` is. | I6 | Document, or rebuild focus from last `conversation_partner_id` on load. |

### 1.6 Roadmap items (Domain 1)
1. `PersonIdentity` read-model module (single place for: display label for player, display label for narrator, name-known predicate, provisional label). Views and narrator context both consume it. (ID-3, ID-6, I8)
2. Ephemeral ref hardening + reload regression test. (ID-2, F7)
3. "Duplicate-person" invariant checker (dev + load-time warning): same name + same location + both created; shared `ephemeral_ref`. (ID-4)
4. Audit rule: narration depicting a campaign-person pronoun/label at a location where state places them elsewhere (generalises `absent_participant` to created non-NPC+). (ID-1)
5. Masking leak suite for partial names. (ID-7)

---------------------------------------------------------------------------------------------------

## DOMAIN 2: LOCATION, MOVEMENT, GROUP MOVEMENT

### 2.1 Current behaviour

**Player movement path (deterministic, pre-narration):**
`resolveTurnIntent` (`src/turn/stages/intent.ts:50-67`) -> `playerIntent` -> `resolvePlayerTravel` (`src/turn/player-travel.ts:34-73`): one bounded travel act per turn, "home" = `heartstone` (`player-travel.ts:9-16`), `let's|we|I|Nicco` accepted as subject (`:48`), route via `reachable` (`travel-resolution.ts`), result is a `runtime_delta{player_location, time_advance_minutes}`. The file comment states "Group wording grants no NPC authority" (`player-travel.ts:34`; the `with <name>` capture in `MOVE` is parsed and discarded). Prevalidated by `i.prepare` (`intent.ts:55-57`), projected (`projectTurnIntent`, `intent.ts:96-121`), committed once at finalization. The Controller schema has NO `runtime_delta`, and `move_character` for Nicco is rejected (`command-authorizer.ts:62-70`: `c` undefined, not authored NPC+), so only the player's own words can move Nicco. Other writers of `player_location`: `/go` (`player-intent.ts:61`), manual correction (`game-session.ts:~310-330`).

**NPC movement paths (all produce `move_character` / `leave_scene`):**
1. Player-authored carrying: `resolvePlayerCarry` (`character-movement.ts:163-201`), engine command, prevalidated, no consent needed. Moves exactly the carried person to Nicco's arrival.
2. Narrated completed movement: `narratedMovements` (`character-movement.ts:307-356`) -> `turn_evidence.character_movements` -> derived `move_character` proposal if the Controller omitted it -> `authorizeWithEvidence` (`command-authorizer.ts:62-70`) accepts only if evidence names the same mover and location. Covers explicit-destination patterns (`:319-325`), bare vertical (`:342-348`), and implicit follows (`:349-352`).
3. Departure: `leave_scene` from `narratedDepartures` / `canonicalDepartureClaims` (`src/turn/scene-departure.ts`), stair and door resolution in `stages/authorization.ts:67-97`; unknown destination = OFF_SCENE.
4. Controller: `move_character` is in its schema (`controller-schema.ts:33`) and prompt (`state-controller.ts:21-22`); it proposes, authorization decides on narration evidence.

**Group/party/follow concept:** none persisted. The module header says so verbatim: "There is no party, follower, companion or proximity model: Nicco moving never moves anyone else" (`character-movement.ts:14-16`). The only "follower" notion is the set `activeNpcPlus(...)` passed as `followers` into `narratedMovements` (`stages/authorization.ts:63`, `narration-audit.ts:501,508`) and the invitation machinery for NPC+ only (`stages/intent.ts:113-117`, `follow-invitation.ts`).

**How companions are determined:** there is no determination. Presence is location equality (`context-builder.ts:85`: canonical npc_locations at the player location + created characters whose `current_location == player_location`). Movement is per-person evidence.

**Can narration propose multi-actor movement?** Yes: `narratedMovements` returns one entry per character (`out`, first-wins per id, `:339,347,352`); test `tests/identity-continuity-stress.test.ts:174-175` shows `[M, T]` from "Maren follows Nicco into Heartstone. Tomas follows him into Heartstone too." Constraints: mover must be in `movable` (created characters at origin/arrival, plus active authored NPC+) and have a structured route (`routed`, `:318`).

**Does the Controller emit movement only for the player?** Opposite: the Controller emits movement ONLY for non-player characters; the player's movement is engine-resolved from input.

**Scene State Projection / who is present:** `buildSceneStateProjection` (`scene-state-projection.ts:286-295`) lists `context.characters`, i.e. everyone in the `present` set from `context-builder.ts:85`. `scene-state-focus.ts` only ranks/filters those; `scene-participants.ts` handles ephemeral people and EXPIRES any whose `location_id != current` (`:133`). Persistent people never move implicitly.

**Do interaction participants stay behind by default?** Yes, by design at three layers: (a) state: only evidence moves anybody; (b) narrator note: non-invited, non-NPC+ people "stay there: do not have Nicco bring or carry them. Someone comes along only if they themselves clearly follow him, narrated explicitly" (`follow-invitation.ts:~58`, `leftBehindNotes`, emitted for every `leftBehind` person, `intent.ts:114-117`); (c) foreground binding is dropped on location change (`turn-coordinator.ts:~63`).

### 2.2 KNOWN BUG: purchased Campaign NPC does not follow "let's go home"

**Root cause (high confidence from code; I did not run a replay):** the narrated-follow grammar has two tiers and the purchased person falls between them.

1. Tier A, explicit destination ("Maren follows Nicco into Heartstone", "follows him to the house"): works for any created character in `movable` (`character-movement.ts:321`; test `identity-continuity-stress.test.ts:174`). It needs a destination phrase that resolves to Nicco's arrival.
2. Tier B, implicit-destination follow ("She follows a step behind", "falls into step", "comes after him", "joins him", `FOLLOW_VERB` `:210-212`, `implicitFollows` `:241-289`): gated by `followers.size` and `followers.has(follower)` (`:349-352`). `followers` = `activeNpcPlus(...)` everywhere (`stages/authorization.ts:63`, `narration-audit.ts:501,508`). A purchased person is a Campaign NPC, NOT NPC+ (NPC+ requires the explicit Heartstone rite), so Tier B returns nothing for her. Natural narration of a follow rarely names the destination; so no evidence, no `move_character`, she stays at the market.
3. The narrator was also steered AWAY from narrating the follow for her: `leftBehindNotes` gives non-NPC+ people the "stays there" note (`intent.ts:113-117`: `eligible = leftBehind.filter(npcPlus.has)`; only they can be `invited`). Narrators that ignore it write "she follows" anyway.
4. Nothing catches the divergence: the audit's follow-claim checks (`narration-audit.ts:501-530`) use the same NPC+-only `followers`, so for her the unrecorded follow is not flagged `uncommitted_movement`, and `absent_participant` (`:296`) fires only for name-led acts, not "she/the girl". Result: narration says she followed, state says she is at the market (the symptom reported), and the identity risk F1 opens.
5. The design comment forbids the obvious fix: "ownership, household membership, affection or earlier presence are never movement" (`character-movement.ts:14-16`) and the Controller prompt repeats it (`state-controller.ts:21`).

**Secondary contributors:** (a) `resolvePlayerTravel` ignores `with <name>` (`player-travel.ts:34`) so even "let's go home together with Lira" is solo; (b) `MOVE` permits only one travel act and drops clauses with questions/orders (`:42`), e.g. "Lira, come with me, let's go home" is an invitation sentence but the invitation is only read for NPC+ (`invitedFollowers`).

### 2.3 Proposed clean group-movement design

Principles: keep "engine decides, narration is evidence"; keep carrying as the only no-consent path; make "who may move with Nicco" ONE predicate used by intent, narrator notes, grammar and audit.

**A. One eligibility predicate** `followCandidates(snapshot, world, ids)` in `src/campaign/` (replaces bare `activeNpcPlus` at the five call sites: `stages/intent.ts:113`, `stages/authorization.ts:63,67,91`, `narration-audit.ts:501,508,518`, `character-movement.ts:45,63`). Classes with explicit reasons:
   - `npc_plus_active` (today's behaviour);
   - `held_by_player` (legal status `enslaved` and `holder_id == nicco`, or other person Nicco legally holds);
   - `household_member` (active member of a Nicco-kept household, even if not NPC+);
   - `invited` (explicit invitation this turn, any created character present).
   Excluded: dead/inactive, hostile/refusing per narration gates (`GATES.follow_not_done` stays).

**B. Narrator contract** (replace the stay note): for candidates, `leftBehindNotes` gives the neutral choice note (already written for NPC+) so the Narrator may narrate a follow; for `held_by_player` add the fact that Nicco legally holds them (no forced outcome). Non-candidates keep the stay note.

**C. Evidence path** (small change): pass `followCandidates` instead of `activeNpcPlus` as `followers` into `narratedMovements`; the audit uses the same set so an unrecorded follow is withdrawn with `uncommitted_movement` instead of silently diverging.

**D. Optional deterministic party move (needs a product DECISION):** for `held_by_player` persons, if the PLAYER's own input explicitly leads them ("let's go home, Lira", "I lead her home", "we go home together"), resolve like carry: a pre-narration engine `move_character` to Nicco's arrival, prevalidated, with a note "Lira accompanies Nicco". Parsing: extend `resolvePlayerTravel` to return `companions` (names from `with X`, `together`, vocative + come/follow) and let `resolvePlayerCarry`'s sibling `resolvePlayerEscort` emit commands. Consent for free persons stays narrative.

**E. No persisted party.** Do NOT add a `party` domain: a stored follow list goes stale (the same class of bug as the one reported) and needs save migration. If a persistent concept is wanted later, store it as a derived-per-turn set from reasons in (A), not as state.

**F. Departure symmetry:** `leave_scene`/OFF_SCENE for a candidate who does NOT follow stays as is.

### 2.4 Implementation strategy
1. Extract `followCandidates` (pure, `src/campaign/followers.ts`); swap into the 8 sites; unit tests for each class.
2. `leftBehindNotes`: split into stay vs choice vs (optional) escort notes; keep byte-for-byte text for the existing NPC+ case to protect goldens (`tests/golden/turn-pipeline.json`).
3. Update docs/comment at `character-movement.ts:14-16` and `state-controller.ts:21-22` ("ownership never moves" -> "ownership never moves by itself; a narrated follow is evidence for held persons").
4. Add audit coverage: pronoun/label arrival of a left-behind candidate (`narration-audit.ts:516-530` currently NPC+ only).
5. Only after product sign-off: step D.

### 2.5 Tests needed
- Purchased person (created, enslaved, held by nicco), Nicco "let's go home": narration "She follows a step behind" -> `move_character` authorized to Heartstone; narration "She stays at the stall" -> no movement; narration "she follows" but Nicco did not move -> `uncommitted_movement` (hypothetical path `narration-audit.ts:501`).
- Same with a free, uninvited created character: NO movement from implicit follow (regression guard for "membership/ownership never movement").
- Invited free created character: choice note emitted; implicit follow honored.
- Two held persons, ambiguous pronoun: nobody moves (bounded antecedent, `character-movement.ts:297-302`).
- Controller proposes `move_character` for her to a wrong place: rejected (`authorization` evidence mismatch).
- Reload mid-trip: location persists; no duplicate person after self-introduction at arrival (covers F1).
- Golden/regression: `tests/location-continuity.test.ts:146,163`, `movement-follow-interaction-matrix.test.ts`, `follow-recognition-closure.test.ts` stay green (they encode the "no automatic co-movement" rule for non-candidates).

### 2.6 Findings table (Domain 2)

| ID | Sev | Class | Finding | Evidence | Action |
|---|---|---|---|---|---|
| MOV-1 | P1 | BUG | Purchased (non-NPC+) person never follows via implicit narrated follow; no audit flag; narrator told to leave her. | `character-movement.ts:349-352`, `stages/authorization.ts:63`, `stages/intent.ts:113-117`, `narration-audit.ts:501,508` | 2.3 A-C |
| MOV-2 | P2 | GAP | `with <name>` / "together" in player travel is parsed then ignored; invitations only read for NPC+. | `player-travel.ts:34,29`, `follow-invitation.ts` | 2.3 D |
| MOV-3 | P2 | DEBT | "Follower" is expressed as `activeNpcPlus` at ~8 call sites; no single predicate. | grep list in 2.3 A | Extract predicate |
| MOV-4 | P2 | RISK | Audit pronoun-arrival closure and follow claims cover NPC+ only, so created non-NPC+ can silently diverge from narration. | `narration-audit.ts:516-530` | Generalise |
| MOV-5 | P3 | DEBT | Stale invariant text: "no party, follower, companion" appears in code comments and Controller prompt while NPC+ following exists. | `character-movement.ts:14-16`, `state-controller.ts:21` | Update after design |
| MOV-6 | P3 | GAP | Multi-act player travel ("go to X then Y") is ambiguous-by-design: nobody moves. Fine, but group wording has no feedback to the player. | `player-travel.ts:56` | Optional UI note |

---------------------------------------------------------------------------------------------------

## DOMAIN 3: HEARTSTONE / NPC+

### 3.1 Current behaviour (confirmed architecture)

- **Promotion is explicit and player-authorized only.** UI posts `/api/npc-plus/promote` with an opaque ref and the revision rendered (`src/ui/server.ts:173-177`) -> `GameSession.completeHeartstoneRite` (`src/app/game-session.ts:339-358`): refuses if session closed/busy/portrait-busy, stale revision, malformed ref, unknown character; then `heartstoneRiteCommands` (`src/campaign/heartstone-rite.ts:189-192`) -> ONE `join_household` command -> `campaign.commit(campaign.prepare(...))`. No Narrator, Controller, funds, items, relationships.
- **Eligibility (`heartstone-rite.ts:174-186`)**: not nicco; has a campaign record; not already NPC+ (`isNpcPlus`: any premium record, even inactive); household `campaign_household_heartstone` exists; Nicco is a `member` with `role: owner`; character not inactive/dead; `insideHeartstoneInterior` (Heartstone or descendants, not outdoor; `heartstone-recognition.ts:21-26`). Never reads prose.
- **Same identity:** promotion changes no character id; NPC+ state is `premium_characters[character_id]` created in `syncPremiumCharacters` (`premium-characters.ts:133-170`) inside the same `prepare`, so membership and premium record commit in one revision or not at all. Test: `tests/explicit-npc-plus-promotion.test.ts:139` (P8-P19 "exactly one revision ... touches nothing else"), `:155` (refusal costs no revision).
- **Narration/Controller cannot promote:** `command-authorizer.ts:96-98` rejects any `join_household` into a household Nicco keeps (`rejected_command_not_allowed`); Controller prompt forbids it (`state-controller.ts:23`). Tests `explicit-npc-plus-promotion.test.ts:211,221`.
- **UI capability:** `characterCapabilities` (`src/app/character-capabilities.ts:30-45`) `can_promote_to_npc_plus = tier==campaign_npc && promotion.ok`, supplied from `heartstoneRiteEligibility` in `player-character-view.ts:235`. Tier is derived from the premium record (`promoted`) not from membership.
- **Save/load:** no new schema field; promotion is the premium record + membership (`heartstone-rite.ts:17-18`). Save schema is 5 (`save-format.ts:32,65`); migration 1->2 created `premium_characters` from membership (`save-migrations.ts:15-27`). Test `explicit-npc-plus-promotion.test.ts:189`.
- **Legacy semantic rite code:** none found that can complete the rite. The remaining vestiges are (a) the generic voluntary-membership evidence path (`household_choices`, `turn-evidence.ts:31,268-270`; `evidence-authorization.ts:290-293`; `command-authorizer.ts:89-99`), still live for non-Nicco households and for `leave_household`; (b) charter text as lore (`src/campaign/heartstone-charter.ts`, `openingOathText`); (c) comments in `premium-characters.ts:12-14` saying "Household membership is the ONLY trigger" (still true, now reached only via the UI action). `grep -rniE "rite|oath"` in `src` found no rite-detecting logic outside these.
- **Behaviour of a promoted NPC+ who leaves the household (the open decision):** `syncPremiumCharacters` sets `metadata.active_household_member=false` and records `left_household` (`premium-characters.ts:198-205`); the record, history and NPC+ tier persist ("leaving neither deletes nor demotes", `premium-characters.ts:40-45`). `activeNpcPlus` (membership-gated, `:35-37`) then returns false, so she:
  - gets NO NPC+ prompt context (`npc-plus.ts:149`), reflections (`turn/reflection.ts:38`), mannerism learning/extraction (`mannerism-learning.ts:55,75,101`, `mannerism-extraction.ts:101`), contract setting (`character-contracts.ts:31`, `premium-characters.ts:74,84`), scene developments (`scene-state-projection.ts:159`);
  - is NOT a follower and gets no invitation choice (`intent.ts:113`), and her authored-NPC+ movement authority is lost (`command-authorizer.ts:67,78`, `character-movement.ts:45,63`); if her origin is `created` she remains movable as a campaign character;
  - STAYS NPC+ in the UI: tier `npc_plus`, appearance editor and portraits remain available while she is active/alive (`player-character-view.ts:186-187`, test `explicit-npc-plus-promotion.test.ts:234`); category label shows "NPC+" without "Household".
  - Heartstone stone recognition is lost immediately (`heartstone-rite.test.ts:128` T8: "inactive membership removes recognition; the promotion stays").
  - So: promoted-but-left = "visual NPC+ asset only, behaviour-inactive". Making her behaviour-active would mean replacing `activeNpcPlus` (membership) with `isNpcPlus` (promotion) at the ~20 sites in `grep activeNpcPlus|active_household_member`; the snapshot validator also pins `active_household_member === members.has(id)` (`snapshot-validation.ts:165`), so the flag is a derived mirror, not independent state.

### 3.2 Findings table (Domain 3)

| ID | Sev | Class | Finding | Evidence | Action |
|---|---|---|---|---|---|
| NPC-1 | P2 | BUG/DECISION | **Re-join dead end.** A promoted NPC+ who left cannot rejoin: UI refuses `already_npc_plus` (`heartstone-rite.ts:178`), narration/Controller `join_household` into the Keeper's household is rejected (`command-authorizer.ts:98`). The domain supports rejoin (`premium-characters.ts:193-196`, tests `npc-plus-pass-1.test.ts:44`) but no production path reaches it. Test `explicit-npc-plus-promotion.test.ts:234` asserts "cannot be promoted again" without covering re-join. | | Decide: allow the same UI action as "welcome back" when premium exists and membership is not `member` (eligibility code `already_npc_plus` split into `already_member` vs rejoin-eligible). |
| NPC-2 | P2 | DECISION | Behaviour-activity of a promoted NPC+ outside the household (described above). Current = inactive. | 3.1 | Present both options; recommended default: keep inactive (cheap, safe), expose "rejoin" (NPC-1) as the way back, and show an "inactive NPC+" badge in the UI. If active is chosen: introduce `isActiveForBehaviour(snapshot,id)` and migrate call sites in one pass, adjust `snapshot-validation.ts:165`, `npc-plus.ts:149`, reflection/mannerism gates; tests in `npc-plus-pass-*.test.ts` assume membership. |
| NPC-3 | P2 | GAP | No production producer of canonical-origin campaign records; rite eligibility `character_not_found`/`not_campaign_npc` for canon NPCs; authored NPC+ code (`npcPlusEntrants`, `persistentCharactersAt`, `authoredNpcPlus` branches) exercised only by fixtures/tests. | `src/dev/turn-fixture.ts:50`; `explicit-npc-plus-promotion.test.ts:74` | Decide product intent (can a canon NPC ever be promoted?). If no, mark branches as reserved; if yes, add an explicit "meet / register canon NPC" path. |
| NPC-4 | P3 | RISK | `join_household` via narration is still allowed for any household Nicco does NOT keep, and `leave_household` for Nicco's household remains evidence-based (`command-authorizer.ts:89-99`). A narrated "I leave" can demote behaviour (NPC+ inactive) without player action; intended ("voluntary") but undocumented in rite docs. | | Document; optionally require player confirmation for leave too. |
| NPC-5 | P3 | RISK | Rite does not check legal status, consent or relationship (e.g. an enslaved person is promoted by the Keeper). By design per header ("engine does not police the performance"). | `heartstone-rite.ts:173` | Keep; note in canon docs. |
| NPC-6 | P3 | DEBT | Naming debt: persisted/domain terms `premium_characters`, `premium_reflections`, `PremiumCharacterState`, `src/campaign/premium-characters.ts`, `record_reflection`; UI/API terms `npc_plus`, `/api/npc-plus/promote`, `can_promote_to_npc_plus`. 241 files mention "premium" (src+tests+docs). | `types.ts:262-264`, `save-migrations.ts:15-27` | See cleanup path below. |
| NPC-7 | P3 | DEBT | Comment drift: `premium-characters.ts:12` ("Household membership is the ONLY trigger") reads as if narration can trigger; actual trigger is the UI action. `game-session.ts:163-164` OK. | | Edit comments only. |
| NPC-8 | P3 | RISK | `completeHeartstoneRite` swallows all commit exceptions into `campaign_validation_failed` (`game-session.ts:356`), including programming errors. | | Log via sink. |

### 3.3 Save-compatible naming cleanup path
1. Phase 0 (zero save risk): rename TypeScript symbols/files only (`premium-characters.ts` -> `npc-plus-state.ts`, `PremiumCharacterState` -> `NpcPlusState`) while the persisted key stays `premium_characters`; add a typed alias map in one place.
2. Phase 1: accept BOTH keys on load via a new migration step (schema 5 -> 6 in `save-migrations.ts`, pattern at `:15-27`): read `premium_characters` or `npc_plus`; write the new key; keep reading the old one for at least one release; migrate `premium_reflections` -> `npc_plus_reflections` the same way. Update `snapshot-validation.ts:160-194`, `validation.ts:202`.
3. Phase 2: rename command `record_reflection` only if it adds clarity; otherwise leave (commands are not persisted except via transcripts/goldens `tests/golden/turn-pipeline.json`, `tests/playthrough/*.json`: check before touching).
4. Keep `activeNpcPlus` / `isNpcPlus` function names (they already use the target vocabulary).
5. Guard: round-trip test with a saved v5 fixture (`saves/` dir exists) loaded by the new code.

### 3.4 Roadmap items (Domain 3)
1. Decide NPC-2 and NPC-1 together (one product decision: "promotion is permanent; membership toggles behaviour; rejoin via same UI action").
2. Implement rejoin eligibility + tests (extend `explicit-npc-plus-promotion.test.ts:234`).
3. Naming cleanup phases above.
4. Clarify/retire canonical-NPC+ branches (NPC-3).
5. Comment sweep (NPC-7).

---------------------------------------------------------------------------------------------------

## Cross-domain priority list
1. MOV-1 (P1, also closes ID-1/F1): generalise follower eligibility.
2. ID-2 (P2): ephemeral ref reset on load.
3. NPC-1 + NPC-2 (P2 decisions).
4. ID-3 / MOV-3 (P2 consolidation): one provisional-label function, one follower predicate.
5. Everything P3 is hygiene.

## Not verified / limits
- No test run, no typecheck, no replay of the reported bug; root cause is from static reading of the cited lines. A one-turn offline replay (`tests/location-continuity.test.ts:163` pattern with an implicit-follow draft such as "Maren follows a step behind.") would confirm MOV-1 in minutes.
- F3/F7 depend on the format of non-participant narrated refs (`p.ref` in `narrated-captives.ts`), not fully traced.
- `docs/` and the root `*.md` audits were not read; claims here come from code and tests.
