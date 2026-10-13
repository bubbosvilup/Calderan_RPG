# Long playthrough state continuity audit

Audit of commit `3938193`, 2026-10-07. **Audit only: no production changes, fixes or paid calls.**

## 1. Executive summary and evidence limits

**Was Mira promoted in the reported live run? CANNOT PROVE.** The supplied attachment contains the audit request and quoted reproduction excerpts, not the full playthrough, raw delivered messages, save, turn receipts or provider diagnostics. A request for their local path remained unanswered during this audit. The nearby Downloads CSVs dated October 6 and `Caldrevan Playtest UI.pdf` did not contain the target excerpts; they were not substituted as authoritative evidence.

The current code nevertheless has reproducible blockers that explain a narrator-created Mira remaining absent from structured state:

1. `readScene` rejects names matching **any token of any canonical character name**, even when that character is absent. Production canon contains **Mira Thorne**. A different woman saying even the explicit legacy-quoted `"My name is Mira"` produces no promotion commands in Heartstone LR.
2. Created-person disclosure still uses a legacy quotation reader. `*The woman nods.*` followed by unquoted `Mira.` is not a self-introduction to that reader. The same failure occurs with a non-colliding test name, independently of the Mira collision. P3's canonical disclosure uses a separate RPG-aware reader.
3. The reciprocal first input does not satisfy this reader's bare-answer name-question grammar. An explicit name question does, provided dialogue is quoted and the name does not collide. Thus confirmation can recover a non-colliding legacy-quoted introduction, but does not recover Mira here.

Both sleep phrases are **NOT IMPLEMENTED** in the current deterministic temporal grammar. Bounded numeric **wait** is implemented; **sleep**, `for at least`, and daypart/event targets are not. The existing narrator grounding instruction does not become a deterministic elapsed-time contradiction check. Mocked successful turns can deliver five-hours/night prose while committing zero elapsed minutes.

There is **no proven shared controller extraction failure**. New-character promotion and time advances are deliberately outside the controller schema and owned by separate deterministic stages. Neither requires Household or NPC+.

## 2. Exact supplied reproduction evidence

These excerpts are supplied by the request; surrounding attribution, raw RPG formatting, revision and clock receipts are unavailable:

| Sequence | Supplied evidence |
| --- | --- |
| First introduction | Player: `name's nicco, i'm the keeper of the heartstone, what about you?`; woman answers `Mira.` |
| Confirmation | Player: `so your name is Mira?`; woman repeats `Mira.` |
| Later drift | `You gave me a name to go with the shirt.`; `Mira works. If you meant it.` |
| Structured display | `In the scene`, `1 present`, `Nicco`, `You`, while the request says she remains interacting in Heartstone LR |
| Duration action | `he sleeps for atleast 5 hours`; prose reportedly passes noon into afternoon |
| Daypart action | `he sleeps until night`; prose reportedly removes daylight |
| Clock display | Reportedly remains `Late Morning · Day 0` |

No excerpts were imported into canonical or campaign data. The new fixtures are controlled diagnostic inputs, not recovered live state. A transcript alone could establish formatting and turn sequence; an actual snapshot and receipts are needed to prove promotion/commit history. The final UI roster alone cannot distinguish never-promoted from promoted then moved/inactivated.

## 3. Implemented character and ephemeral lifecycle

The active contract is `src/turn/name-establishment.ts:10`: securely established proper name, present person, not already persistent or canonical, latest-exchange introduction, no ambiguity, and no simultaneous player location change. The acquired unnamed-person exception is separately handled by `person-transactions.ts`. Recruitment/custody/rescue labels exist in types but are not general implemented promotion triggers. Long dialogue, healing, gifts, emotional importance or repetition alone do not promote.

`buildPromotedCharacter` creates a minimum durable created character: deterministic revision-scoped ID (`campaign_character_r<revision>_<slug>`), profile with established name/facts, active current status/location, and immutable origin snapshot. This creates no premium character, household membership, relationship, personality or legal status by itself. The opening and promotion comments containing older "future"/"purchase only" wording are stale relative to active name-establishment wiring; executable callers and tests establish the current contract.

There are **two ephemeral representations**, not one universal actor registry:

- `SceneParticipants` is a session-local pre-narration plan driven by supported player interactions with generic person/role phrases. It assigns monotonic `scene_npc_<n>` IDs and narrator-facing P refs, preserves focus/limited descriptors, has capacity four, and expires on scene change, departure or inactivity (two unaddressed turns). It is not saved.
- `readScene` reconstructs people from finalized scene-scoped prose using `narrated:<name-or-noun>` refs, introductions, attributed speech and actions. A prose-only actor need not already have a `SceneParticipants` entry. These reconstructed refs are not persistent IDs. `linkedParticipant` can connect an unambiguous existing temporary participant when promoting, but such a link is not required to create the durable record.

No duration/importance mechanism promotes an unrecognized actor automatically. A narrator can reuse such an actor through delivered RecentConversation while no Campaign Character exists. Temporary continuity is separate from the UI's durable roster.

## 4. Full self-name pipeline and first broken boundaries

1. After deterministic input intent/projected context, retrieval and narrator draft, controller proposal and authorization, the whole candidate batch is prepared.
2. Draft auditing chooses delivered text, optionally through one revision and deterministic redaction.
3. `prepareCommit` runs **on delivered text**, combines it with finalized scene history, rebuilds candidate context and calls `establishNames`.
4. `readScene` splits/attributes units, detects introductions, filters canonical/persistent names and determines presence. `establishNames` proposes `register_character`, or `set_profile` for supported late naming of an existing unnamed record.
5. Identity commands join the original batch and are validated through `campaign.prepare` at the captured base revision. Registration requires a valid created ID/location and origin revision/time/location matching the promotion transaction.
6. Coordinator commits the receipt once. Recent history and temporary participant continuity publish afterward; any linked temporary entry is retired. Subsequent context and UI derive the durable person from the committed snapshot.

**No controller promotion proposal is expected.** `CONTROLLER_SCHEMA` has neither `register_character` nor arbitrary `runtime_delta`. Controller output cannot legitimately repair the missing registration or elapsed time. Failure of controller transport/parsing can fail the entire turn, but there is no evidence of that happening here.

### Bare answer detection

`narrated-captives.ts:96` recognizes `your name`, `who are you`, `what's/is/are you called`, and `what do they/people call you`. It does not treat `name's nicco ... what about you?` as a bare-name opportunity. Explicit quoted `My name is ...`, `I'm ...`, `Call me ...` have separate patterns. A player repeating the name is **not itself a grant or assignment**; it merely creates a recognized question for a subsequent supported self-answer. The two-turn non-colliding quoted control promotes correctly on confirmation.

### Canonical token collision: earliest demonstrated Mira-specific exclusion

`narrated-captives.ts:233` builds the canonical name set from individual words of every canonical character name. Line 253 skips matching new names. `data/characters/calderan/west/merchants/mira_thorne.yaml` supplies `name: Mira Thorne`. She is not in the Heartstone LR test context, but her first name still excludes the other woman's Mira introduction.

The explicit quoted self-name can therefore be detected as an introduction and then removed **inside `readScene`, before a person/promotion candidate exists**. This is not controller omission, failed registration validation or a missing committed location. It is silent: the person never reaches `establishNames`, so it does not produce the latter's `not_in_scene`, `duplicate_name` or `location_changed` reasons.

### RPG speech format: independent earlier detection gap

`narrated-captives.ts:63` recognizes straight/curly quotation marks. Its self-introduction branch requires `u.quoted`. Unquoted dialogue outside starred narration is processed as narration instead. A simple RPG `Mira.` is neither a naming pattern nor an acting subject. In contrast, `canonical-name-disclosure.ts:122` calls `rpgDialogue` and P3.5 has an exact multi-segment canonical introduction regression.

For actual unquoted output the **first** broken boundary would be speech/self-name detection, before canonical-name exclusion. For quoted output the second explicit confirmation is blocked by canonical-token exclusion. Without original delivered text and logs, selecting one as the live run's first boundary would be unjustified. A simultaneous movement or identity preparation exception is another possible live skip requiring receipts, not something inferred from the request.

`prepareCommit` catches identity preparation exceptions and falls back to the original candidate receipt, with `identity_skipped`/optional debug diagnostics. Thus even an actual preparation rejection can coexist with a successful narrator turn. The observed display does not prove that rejection occurred. No such rejection is needed for the reproduced reader failures.

## 5. Identity knowledge and provenance

| Domain | What is durable | What reaches narration |
| --- | --- | --- |
| Canonical P3 self-disclosure | Identity-name fact plus Nicco knowledge edge; provenance has `acquisition_kind: told`, `source_character_id: <disclosing NPC>`, learned minute | Known-name identity gating; no replacement Campaign Character needed |
| Newly created person | Profile name, origin trigger `name_established`, source `narrator_ephemeral`, established name and bounded attributed evidence | Current profile name and an `established_origin` projection of label/role/descriptor/background |
| Late naming | Existing profile gains name; existing origin unchanged; naming evidence is included in turn result | Profile name; no new dedicated persisted name-source field |

Created names do **not** create canonical identity-name facts/edges. No durable typed field distinguishes self-disclosed, player-assigned and narrator-introduced name acquisition on created profiles/origins. `NameIntroduction.kind` (`self`, `pattern`, `weak`) and speaker attribution exist during reading but are not persisted as a typed name-acquisition event.

This is **not merely `name = Mira` with no evidence anywhere**. A promoted origin retains bounded evidence strings such as `Sovela: "My name is Sovela,"`, so source can sometimes be recovered from its text. But `context-builder.ts:92` projects label, role, descriptor and sourced background, **not that name evidence**. `prompt-builder.ts:272` serializes this reduced `established_at_promotion`. Name-source evidence therefore fails to reach the narrator even when the snapshot retains it.

RecentConversation retains at most 12 completed exchanges within 16,000 serialized characters, evicting complete oldest exchanges earlier if necessary. It has no rollup/summary of evicted identity disclosures and is session-local, not saved. Failed exchanges are not replayed as facts. Non-NPC+ created characters get no NPC+ reflection/memory rollup to replace those lost disclosures. After eviction/reload the durable name can survive while its self-disclosure source is absent from narrator input. The new test demonstrates this for a successfully promoted non-colliding person; it does not claim Mira was promoted.

If Mira never became durable, both her name and its source depend on recent prose, which may preserve her interacting after the original introduction has fallen out. This explains possible reframing as player-assigned, but the exact hallucination's cause cannot be proven from excerpts. P3's canonical fact/provenance path remains separate; this audit does not reopen or alter it.

## 6. Scene and UI derivation

`buildTurnContext` includes created records co-located with the player (excluding dead) plus authoritative canonical presence. `deriveSessionView` resolves canonical and created current locations and excludes dead/inactive actors. `derivePlayUiView` adds Nicco and maps visible durable scene records through the shared `PlayerCharacterView`. Created names from established origin remain visible; no household, NPC+ flag or canonical identity-name edge is required. Canonical visibility/name masking is a different policy.

Temporary `SceneParticipants` and arbitrary RecentConversation mentions are **not** UI scene members. A correctly promoted, active, co-located created person appears without another scene-membership command. The successful quoted control verifies this. An unpromoted woman leaving the UI at Nicco-only is expected from this derivation, not evidence of a filtering defect. A mismatch between context's inactive handling and UI's active requirement exists, but is unrelated to the demonstrated missing registrations and was not changed.

## 7. Temporal authority, supported grammar and exact repros

Only `snapshot.runtime.scene.world_time.world_minute` owns time. `playerIntent` extracts explicit wait duration deterministically, prepares it before narration on a detached projection, and final command assembly includes player runtime effects independently of controller output. Travel contributes route minutes; ordinary interaction contributes zero. Narration never authorizes time by itself.

`player-intent.ts:24` implements:

- `/wait <integer minutes>`;
- `wait N minute(s)/hour(s)`, optional `I ` and optional terminal period;
- `wait an hour` / `wait one hour`, optional `I `;
- exactly starred `*waits N minutes/hours*`;
- exactly starred `*he spent N minutes/hours <activity>*`.

Matched durations must be integer 1..1440 minutes. No fractions, open-ended durations, `for at least`, `atleast`, sleep verb or until-daypart/event target is implemented. Natural actions do not supply an alternative sleep-duration path. Sleep and wait do **not** share a detector today. An unsupported ordinary phrase falls through with no runtime time command; it is not a rejected numeric wait and need not emit an error.

| Exact input | Current grammar recognizes? | Deterministic time delta proposed? | Elapsed delta committed in successful mock turn? | Mock narration nevertheless describes elapsed time? | UI at test start 600 |
| --- | --- | --- | --- | --- | --- |
| `he sleeps for atleast 5 hours` | NO | NO | NO (+0) | YES | Late Morning, Day 0 |
| `he sleeps for at least 5 hours` | NO | NO | NO (+0) | YES | Late Morning, Day 0 |
| `he sleeps until night` | NO | NO | NO (+0) | YES | Late Morning, Day 0 |

Live proposed/committed deltas remain **unproven** without receipts. The request reports elapsed-time narration; the tests independently prove the current successful zero-delta outcome is possible. Correctly implemented `wait 5 hours` would advance 600 to 900, **Afternoon, Day 0**. The precise live minute is unavailable; do not infer it solely from a daypart label. The mock narration is deliberately inconsistent and is delivered unchanged, demonstrating the absent deterministic elapsed-time guard.

**Five-hour sleep classification: NOT IMPLEMENTED**, not a regression in supported numeric wait. The expectation that all bounded sleep is covered by P11 is not the actual contract. The narrator's completed-hours claim without a delta is a separate prose-grounding **BUG**. `at least` is a lower bound rather than exact duration; a future minimum-duration policy needs to be explicit.

**Until-night classification: NOT IMPLEMENTED**, explicitly analogous to P11's existing unsupported `wait until evening/sunset/midnight` cases. Defining its target minute, same-day/next-day behavior and relation to Sunset/Evening/Night is a feature decision, not something this audit invents.

## 8. Clock mutation, display, errors and mana

`prepareRuntimeDelta` validates and adds `time_advance_minutes`; campaign preparation returns a detached receipt and the coordinator commits once. Day and daypart are derived by `temporalGrounding` from the committed integer, not persisted separately. The fixed label ranges include Late Morning 570..719, Afternoon 840..989 and Night 1380..1409. Narrator context uses semantic labels, not authority over their boundaries.

`GameSession.getView`, server session/final response and UI `renderScene` derive/update committed semantic time and day. Streaming draft text does not move the authoritative UI clock. There is no session-local daypart cache inferred from previous lighting or prose. Existing tests cover unchanged dialogue, wait across a boundary, travel, reload and failed provider turns. No UI-specific manual time switch was found; `/wait` is the existing explicit command.

Invalid matched duration, overflow, stale revision or failed preparation/provider work is rejected without committing new time and can appear as a failed turn/diagnostics. A phrase that never produces a time command has no failed time mutation to report. A successful no-op turn can therefore leave the clock unchanged without an error.

Supported numeric waits can cross a day boundary (including `wait 24 hours`); automatic mana recovery is +25 per crossed day, capped at maximum. Unsupported sleep produces no clock crossing and no recovery. Numeric waits longer than 1440 minutes require multiple supported actions; this is separate from the primitive runtime clock's validation.

## 9. Actual turn order and why prose can diverge

Player input → deterministic intent and detached runtime projection → context/retrieval/recent prompt → **buffered narrator draft** → controller proposal → deterministic authorization → whole-batch preparation → narration audit → optional bounded revised narration/redaction → delivered-text identity establishment and re-preparation → atomic campaign commit → history/temporary participant publication → final committed result/UI projection.

There is a publication nuance: with the technical reliability contract, final narration events are emitted after commit; the legacy mode emits audited narration events just before the adjacent commit. Application/UI state still waits for the completed committed turn. The initial draft is not committed truth.

The narrator can carry a prose actor or describe elapsed time from the user's request/history. Structured changes require the separate deterministic boundaries above. Existing presence audits catch several absent durable actors/staff, but do not enforce universal registration of every unrecognized woman; narrow elapsed-time/daypart claims have no corresponding audit issue kind. Temporal grounding is a prompt instruction, not a guaranteed veto. The audit fixtures prove successful prose-state divergence without a malformed controller proposal, failed validation or stale UI.

## 10. Existing coverage and missing regressions

Existing coverage inspected and run:

- `narrator-persistence.test.ts`: unnamed chestnut boy stays ephemeral; quoted Tomas answer to `What's your name?` promotes once with linked participant; conservative canon/collision handling; late naming; no household/personality invention; history/save durability.
- `narrated-promotion.test.ts`: named/unnamed acquisition, atomic registration/legal transfer, established facts, duplicate names, replay/stale/funding failure.
- P3.3/P3.4/P3.5 tests: controlled **canonical** self-disclosure, exact live RPG multi-segment output, partner/descriptor/pronoun continuity, repeated names, knowledge-only commitment, reload, failed-controller atomicity and no duplicates.
- `scene-participants.test.ts`: temporary IDs, addressing/focus/expiry/capacity/scene boundaries.
- `p11-time-foundation.test.ts` and `p33-p11-live-evidence.test.ts`: fixed daypart boundaries, explicit numeric waits, rejected/unsupported until-event/daypart variants, travel, save/reload and failure rollback.
- Runtime, player projection and UI tests: committed presence, privacy, known created identities, streaming/final state separation and authoritative time rendering.

Gaps: exact Mira token collision with an absent differently named canonical person; ephemeral **RPG** self-disclosure rather than canonical RPG discovery; reciprocal bare-name response in the created-person reader; typed/prompt-visible self-name provenance after history eviction; exact sleep phrases; an end-to-end guard rejecting completed-hours/night prose with an unchanged clock. Existing unsupported-until tests prove exclusion, not safe narration of an excluded action. Closed canonical P3 coverage does not close created-person naming.

## 11. Audit-only reproductions and validation

Added only `tests/long-playthrough-continuity-audit.test.ts`: eight passing characterization tests. They intentionally assert today's behavior, including blocked promotion and unchanged time; they are diagnostic reproductions, **not fixes or desired future acceptance tests**. A future implementation must replace the affected current-behavior expectations rather than preserving the defects.

The controls show that a non-colliding quoted explicit confirmation creates a durable, active, co-located scene person with no Household/NPC+. Exact Mira quoted self-introduction is blocked; both Mira and a non-colliding unquoted RPG response are blocked. A successfully promoted control retains attributed snapshot evidence but loses it from narrator prompt after history eviction. Three mock-provider coordinator tests deliver elapsed-time prose while leaving time at 600/Day 0.

Relevant focused suite: **264 passed, 0 failures, 0 TODO**. Audit reproductions alone: **8 passed**. `npm run typecheck --silent`: PASS. `npm run build --silent`: PASS. No full suite rerun was necessary for a tests/documentation-only audit. Provider interactions in these tests use local mocks; no paid evaluation or live turn ran.

## 12. Classification table

| Issue | Expected / actual current behavior | Classification | Earliest broken boundary | Likely root cause / minimum future surface |
| --- | --- | --- | --- | --- |
| Mira self-disclosure | Established distinct present person should become durable; exact Mira reader cases return no commands | BUG in created-person identity resolution; live trigger unproven | RPG speech detection, or canonical-token exclusion for quoted input | `narrated-captives` speech/identity binding; preserve canonical nonduplication without making names globally unique |
| Mira absent from In the scene | Active durable co-located person appears; no durable registration means Nicco-only UI | Upstream BUG consequence; no demonstrated UI bug | Before registration, in reproduced cases | Repair identity boundary first; no UI/Household filter workaround |
| Name becomes player-assigned | Own disclosure should remain distinguished; typed created-name source absent, retained evidence omitted from prompt | NOT IMPLEMENTED typed provenance; BUG in continuity information loss | Name-acquisition persistence/projection into context | Minimal source/evidence contract and narrator projection, with save compatibility review if persisted fields change |
| Sleep for at least/atleast 5 hours | Explicit wait works; sleep does not request a delta; mock prose advances while UI does not | NOT IMPLEMENTED grammar; separate narration-grounding BUG | Player intent produces no duration; audit permits prose claim | Narrow deterministic sleep-duration support if authorized, then committed-time narration guard |
| Sleep until night | No daypart-target wait/sleep contract exists; mock prose can nevertheless reach night | NOT IMPLEMENTED feature; separate narration-grounding BUG | Player intent has no target semantics | Define target policy separately, then narrow resolver; do not infer time from prose |

## 13. Minimal future options, risks and recommended order

1. **Confirm live state first if artifacts become available.** Inspect the first two delivered name turns, final snapshot, `identity.promoted/named/skipped`, identity preparation debug records, current location/status and clock receipts. This can resolve the quoted/RPG ordering and promotion history without changing authority. Do not automatically promote a transcript reconstruction into saved state.
2. **Created-person identity binding tests and fix.** Teach the existing conservative reader to consume supported RPG speech with attribution, and distinguish a new actor's colliding first name from an actual canonical reference. Include negative competing-speaker, rumor, name-assignment, absent-canonical and actual canonical-nonduplication tests. Merely deleting the canonical guard risks duplicate canonical people; accepting every capitalized word or reciprocal answer risks false promotions. Avoid broadly changing closed P3 canonical logic.
3. **Carry name source into continuity.** Initially consider projecting already-retained attributable origin evidence narrowly, rather than adding hidden memory. A typed acquisition record may be needed for late naming and unambiguous self/player attribution; that is a separate schema/compatibility decision. Do not mislabel every `name_established` origin as self-disclosure: patterns include narrator/third-party introductions. Raw evidence expansion risks prompt size/privacy and must be scoped.
4. **Ground unsupported temporal actions before or alongside numeric sleep support.** Reuse deterministic duration extraction for an explicitly authorized bounded sleep grammar and define `at least`/misspelling policy. Do not give the controller arbitrary time authority. Add acceptance tests for +300 and rollback, then narrow delivered-text contradiction coverage. Broad temporal prose regexes risk removing metaphor, plans or memories; test these separately.
5. **Until-night feature last.** Decide how the fixed Night label relates to ordinary "night", current-day target and next-day wrap, and cap duration consistently. Unsupported targets should not silently narrate completed elapsed time. Do not silently treat Sunset, Evening and Night as the same event.

No order, prompt, retry, memory-window, participant, UI, Household/NPC+, save-schema or temporal-authority change was implemented. There is no common controller fix to apply to both failures. Their common symptom is prose exceeding structured state, not a proven shared mutation mechanism.

## 14. Files inspected, artifacts and cost

Production: `src/turn/name-establishment.ts`, `narrated-captives.ts`, `scene-participants.ts`, `canonical-name-disclosure.ts`, `rpg-dialogue.ts`, `recent-conversation.ts`, `context-builder.ts`, `prompt-builder.ts`, `player-intent.ts`, `natural-actions.ts`, `temporal-grounding.ts`, `turn-coordinator.ts`, `narration-audit.ts`, `grounding-audit.ts`, stage `commit-preparation.ts`, `controller.ts`, `authorization.ts`, `audit.ts`; `src/llm/controller-schema.ts`, `state-controller-provider.ts`; `src/campaign/promotion.ts`, `types.ts`, `characters.ts`, `validation.ts`, `projections.ts`, `identity-knowledge.ts`; `src/world/runtime-domain.ts`, `world-store.ts`; `src/scene/scene-delta.ts`; `src/app/session-view.ts`, `game-session.ts`, `player-character-view.ts`, `play-ui-view.ts`; `src/ui/server.ts`, `client.js`; `data/characters/calderan/west/merchants/mira_thorne.yaml`. Existing tests are listed above. Authoritative input received: attachment `a3156224-3bae-47e8-8988-3bfb3126672a/Pasted text.txt`.

Ignored local logs: `.build/long-continuity-repro.log`, `.build/long-continuity-focused.log`. No live save/session was modified. **Paid provider calls: 0; cost: 0.**
