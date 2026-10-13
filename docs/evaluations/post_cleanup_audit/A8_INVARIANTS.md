# A8: core invariant audit (main HEAD 7e5e4ea)

This audit is read-only. It used static reading only: grep, sed, git show and git diff. No test, build or `node` was run, so the tests named below are the ones that pin each invariant. They were not executed here.

Summary: **7 PASS, 2 PASS with CONCERN** (invariants 6 and 8). No invariant is broken by the cleanups.

| # | Invariant | Verdict |
|---|---|---|
| 1 | LLM interprets/proposes; engine owns truth | PASS |
| 2 | Narrator cannot mutate campaign state | PASS (note) |
| 3 | Controller cannot mutate campaign directly | PASS |
| 4 | NarrationFacts describe, policies decide | PASS |
| 5 | CampaignState owns truth (prepare/commit, expected_revision) | PASS |
| 6 | Audit verifies against the same facts | PASS with CONCERN (minor, pre-existing) |
| 7 | Explicit authority mechanisms intact | PASS |
| 8 | Canonical names/aliases are reserved handles | PASS with CONCERN (person Actual Offer path not covered) |
| 9 | No fuzzy identity merging | PASS |

---

## 1. LLM interprets/proposes; the engine owns truth: PASS

- Every LLM consumer imports `CampaignState` as a type only: `src/turn/coordinator/turn-coordinator.ts:10`, `src/turn/optional/reflection.ts:1`, `src/turn/optional/mannerism-extraction.ts:2`, `src/turn/optional/structured-reflection-maintenance.ts:2`. `src/llm/**` does not import campaign-state at all.
- The narrator produces a buffered draft only (`src/turn/stages/narration.ts:42`, `createDraftGenerator` :53).
- The Controller produces a PROPOSAL (`turn-coordinator.ts:254-257`, comment "a PROPOSAL only — not authorization, not state, not truth").
- Reflection (LLM) output is schema-checked and semantically validated (`parseProductionReflection`, `evaluateReflectionOutput`). It then commits only an optional-partition `record_reflection` with `expected_revision: source` (`structured-reflection-maintenance.ts:158`). The optional partition never moves the revision (see 5).
- Mannerism extraction (LLM) goes through the trusted seam `CampaignState.maintainMannerisms` (`campaign-state.ts:133-138`; callers `mannerism-extraction.ts:115,135`).
- Context compaction (LLM) rewrites only the prompt request (`src/turn/context/context-compaction.ts:85`, `lossless-context-compaction.ts:40`).
- Tests that pin this:
  - `tests/turn/turn-pipeline-invariants.test.ts` ("commit count …", "cancellation …", "stale revision … never commits the candidate")
  - `tests/authority/controller-authorization-pipeline.test.ts`
  - `tests/optional/optional-store-domains.test.ts` (Reflection/Mannerism never bump the revision)
  - `tests/architecture/runtime-layer-boundaries.architecture.test.ts:23` (reflection outside the turn's critical path)

## 2. The Narrator cannot mutate campaign state: PASS (note)

- The coordinator holds the only turn mutation, `const committed = campaign.commit(plan.receipt)` at `turn-coordinator.ts:328`. The contract is stated at `:49-50`: "stages never mutate CampaignState … the single campaign.commit below is the only mutation".
- Stages receive only a `prepare` closure, a validation capability (`turn-coordinator.ts:214, 279, 312`):
  - `src/turn/stages/commit-preparation.ts:27` says "Never commits".
  - `stages/audit.ts:25` says the audit "only decides which text is delivered".
  - `commit-preparation.ts` and `intent.ts` import only the *type* `PreparedCampaignChange`.
- The draft is never delivered, recorded or committed before the commit (`turn-coordinator.ts:45`).
  - A `length` draft is never committed (NARR-1, `:241`).
  - An undelivered draft never enters history (`:336`).
- Post-commit `recordExchange` writes only session-local `RecentConversation` and `SceneParticipants` (`:100-106`), never CampaignState.
- Note: "narrator output only becomes prose" is literally true of the narrator. Delivered narration is still *evidence* for deterministic engine policies inside `prepareCommit`:
  - late naming (`set_profile`, `name-establishment.ts:56`)
  - NPC+ contracts (`commit-preparation.ts:84`)
  - canonical-name learning (`:76`)
  - person offer records (`:89-99`)

  All of them are engine-built commands, re-prepared against `base_revision` and committed in the same single commit. This is by design (invariant 4), not a narrator write.
- Tests that pin this:
  - `tests/turn/narrator-length-recovery.test.ts` (partial "never delivered, audited, sent to the Controller or committed")
  - `tests/turn/turn-pipeline-invariants.test.ts:120` ("nothing is recorded before commit")
  - `tests/turn/turn-failure-codes.test.ts:136` (failed reconciliation discards prepared state)
  - `tests/turn/post-commit-guards.test.ts`

## 3. The Controller cannot mutate campaign directly: PASS

- The Controller vocabulary is a closed schema (`src/llm/controller-schema.ts:9-46`). It has:
  - no `register_character`
  - no `merge_characters` or `retire_character`
  - no premium/NPC+ command
  - no `accept_trade_offer`
  - no funds command
  - no person trade subject (only goods/items, `:40-43`)
- Strict parse: `parseControllerProposal` (`src/turn/stages/authorization.ts:50`).
- Authorization:
  - `authorizeTurn` → `authorizeWithEvidence` (`authorization.ts:124`; `src/turn/authorization/evidence-authorization.ts:404-434`) → `authorizeCommands` (`src/turn/authorization/command-authorizer.ts:22-157`).
  - Unknown kinds default to `rejected_command_not_allowed` (`command-authorizer.ts:132`).
  - A join into the household Nicco keeps (the rite/NPC+ path) is always refused (`:96-98`).
  - Nicco's feelings are refused (`:107`).
- Only authorized commands go forward (`assembleTurnCommands`, `authorization.ts:154-165`). The batch is then prepared against `base_revision` (`turn-coordinator.ts:279`).
- Tests that pin this:
  - `tests/authority/controller-authorization-pipeline.test.ts`:
    - :77 parse failure, funds command
    - :106 never writes Nicco's feelings
    - :111 stale
    - :119 conflicting mutations
    - :304 funds has no Controller path
    - :328 atomicity
  - `tests/authority/explicit-character-materialization.test.ts:110` (A9/A10: Controller and narration cannot create, retire or merge)
  - `tests/commerce/actual-offer.test.ts:285` (Controller trade proposals cannot carry a person; no accept command on the Controller path)
  - `tests/npc-plus/explicit-promotion.test.ts:211,221` (automatic-rite negatives)
  - `tests/authority/evidence-authorization-adversarial.test.ts`

## 4. NarrationFacts describe, policies decide: PASS

- The fact layer `src/turn/narration-facts/*` imports only:
  - its own modules
  - `../language/*`, `../rpg-dialogue.js`, `../recent-conversation.js`
  - type-only `../context/context-builder.js`
  - `../../world/world-store.js`
  - `../commerce/trade-price.js` (a numeric helper)
  - `../identity/narrator-identity.js` (`narratorIdentityGate`, a pure gate in `departure-forms.ts:5`)

  It imports no campaign, authorization, audit, persistence or policy module (verified with `grep -ho 'from "…"'`).
- Policies live outside the layer:
  - authorization: `command-authorizer.ts`, `evidence-authorization.ts`
  - commerce: `trade-authorization.ts`, `person-offers.ts`
  - identity: `name-establishment.ts`, `canonical-name-reservation.ts`, `partner-identity-guard.ts`, `canonical-name-disclosure.ts`
- Tests that pin this: `tests/architecture/narration-facts-consumers.architecture.test.ts` test 10 ("narration-facts imports no CampaignState mutation, authorization, audit or persistence code") and test 11 ("facts do not consume policy"). Tests 2-4 and 6 pin that the movement, commerce, identity and recipient consumers read the shared facts.
- Minor note (not a violation): the regex in test 11 does not list `narrator-identity`, so the fact→identity-helper edge `departure-forms.ts:5` is allowed implicitly. It is a pure read-only gate.

## 5. CampaignState owns truth: PASS

- `prepareCampaignChange` rejects a stale base (`src/campaign/campaign-state.ts:59`, `expected_revision` "stale campaign proposal").
- It applies every command to a private draft, validates it, and computes the semantic revision from the authoritative partition only (`:82-87`): `authoritative = changed && stableData(corePartition(draft)) !== stableData(corePartition(comparison))`, then `draft.revision = base.revision + (authoritative ? 1 : 0)`.
- `commit` accepts only this instance's own unconsumed receipt built on the current snapshot (`:139-149`: "foreign, forged or consumed", "stale preparation receipt").
- `apply` = `commit(prepare(...))` (`:150`).
- The snapshot is exported read-only (`exportSnapshot`, `:115`).
- Production mutation sites are only:
  - `turn-coordinator.ts:328`
  - `GameSession` UI actions (`game-session.ts:390, 418, 487, 573, 614, 646, 673, 802, 852, 917, 935`), each `prepare({expected_revision: campaign.revision})` after `#revisionOk` (`:998-1000`)
  - optional services (`structured-reflection-maintenance.ts:158`, `mannerism-extraction.ts:115,135`, `item-sprite-jobs.ts:45`)
  - bootstrap (`opening-state.ts:27`, `scenarios.ts:35`)
- Tests that pin this:
  - `tests/world/campaign-state.test.ts:266` ("stale, foreign, forged, altered and reused preparations cannot commit")
  - `tests/turn/core-state-properties.test.ts:70`
  - `tests/persistence/campaign-restore.test.ts:48` ("restore revision 87 directly; no command replay")
  - `tests/optional/optional-store.test.ts:97` ("an optional-only change keeps the revision and advances the state version")
  - `tests/optional/optional-store-domains.test.ts:37,62,101,122,150`

## 6. The audit verifies against the same facts: PASS with CONCERN (minor, pre-existing)

- One `NarrationFactSource` per turn is created at `turn-coordinator.ts:267` (`createFactSource(movementFactScope(...))`).
- The same source is handed to:
  - authorization (`:268`, `facts: factSource`)
  - the audit (`:285`, `createNarrationAuditor({ facts: factSource, ...})`)
  - commit preparation (`:312`, `facts: factSource`)
- The audit uses `input.facts ?? createFactSource(...)` and `source.of(narration)` (`src/turn/audit/narration-audit.ts:180-181`), plus `source.scene(...)` (`:385`).
- Tests that pin this: `tests/architecture/narration-facts-consumers.architecture.test.ts` test 1 (exactly one `createFactSource(` in the coordinator, and it is passed to authorizeTurn, createNarrationAuditor and prepareCommit) and test 7 (the audit reads the same source).
- CONCERN 6a: inside `prepareCommit`, some calls do not receive `i.facts`. They build their own reading with the same pure functions. This was already true at 861396c (same call), so it is not a cleanup regression.
  - `establishNames(...)` is called without `i.facts` (`src/turn/stages/commit-preparation.ts:73-74`). Name establishment therefore falls back to `readScene(...)` (`name-establishment.ts:40`). For the REPO-12 reservation it also builds a second `createFactSource({ movers: [], ... })` (`name-establishment.ts:43`).
  - `establishedCanonicalDisclosure(...)` (`:75`) also gets no source.
  - `partnerNameConflict` and `resolvePersonOffers` do receive `i.facts`.

  The result is deterministic and the reading is equivalent, but it is a second extraction rather than "ONE extraction" for the identity consumers. Architecture test 4 checks only that `name-establishment.ts` *can* use `options.facts.scene(`, not that the caller passes it. Suggested fix: pass `facts: i.facts` to `establishNames`.

## 7. Explicit authority mechanisms intact: PASS

### Keep track

- Entry point: `GameSession.keepTrack` (`src/app/game-session.ts:599-626`); route `POST /api/people/keep` (`src/ui/server.ts:197-201`). The browser sends only the token and the revision.
- Opaque token: `keepToken` = sha256 of `keep-track\0campaign\0ref\0location`, truncated to 24 hex characters (`src/turn/identity/keep-track.ts:46-48`). The request must match `/^[0-9a-f]{24}$/`.
- Idempotent: `keptCharacter` (`:51-53`) answers `already` with no revision.
- `#revisionOk(expected_revision)`, then the server recomputes `trackablePeople` and resolves the token, and refuses `blocked` (`game-session.ts:607-611`).
- The exact provisional identity comes from `trackablePeople` (`keep-track.ts:66-114`): scene reading plus session participants. An unanchored description fails closed. Fail-closed blocks are `offer_subject`, `ambiguous_name`, `canonical_name` and `same_name_persistent` (`:108-111`).
- ONE `register_character` is committed (`keepTrackCommand`, `:121-128`). It is built by `materializeProvisional({ identity_only: true, trigger: "player_kept" })`.
- There is no model, narration or fuzzy match.
- Tests that pin this:
  - `tests/identity/keep-track.test.ts` (PERSIST-A..F; fail-closed :111, :124, :133; route :185, :210)
  - `tests/identity/canonical-name-reservation.regression.test.ts:123`

### Actual Offer acceptance only via explicit UI Accept

- `accept_trade_offer` has exactly one producer, `GameSession.acceptTradeOffer` (`game-session.ts:560-586`, command at `:573`). It takes the opaque ref and the revision only.
- The kind is not in the Controller schema, and `trade-authorization.ts:19` says "no Controller or narration path".
- Settlement is atomic in `prepareTradeCommand` (`src/campaign/trade.ts:162ff`).
- The person plan is restricted to `PERSON_PLAN_KINDS = register_character | set_legal_status | transfer_person` (`src/campaign/validation.ts:216-221`).
- The plan is re-stamped with the committing revision/minute at acceptance (`trade.ts:215-219`).
- Tests that pin this: `tests/commerce/actual-offer.test.ts`:
  - :103 G9 (no duplicate)
  - :110 G10 (stale)
  - :225 typing "deal"/"*pays*" never settles
  - :285
  - :296 P1-P7
  - :408 GameSession.acceptTradeOffer
  - :432 POST /api/trade/accept

### NPC+ promotion is explicit

- Entry point: `GameSession.completeHeartstoneRite` (`game-session.ts:404-422`); route `POST /api/npc-plus/promote` (`server.ts:203-208`).
- `heartstoneRiteCommands` emits one `join_household` (`src/campaign/heartstone-rite.ts:52`). NPC+ is derived inside the same preparation by `syncPremiumCharacters` (`campaign-state.ts:74`; `premium-characters.ts:182`).
- The command authorizer refuses any narration/Controller join into Nicco's household (`command-authorizer.ts:96-98`, `rejected_command_not_allowed`). The Controller prompt also forbids it (`src/llm/openrouter/state-controller.ts:23`).
- Tests that pin this:
  - `tests/npc-plus/explicit-promotion.test.ts` (P1-P20; :211/:221 automatic-rite negatives; :201 no Narrator/Controller call; :247 route)
  - `tests/identity/keep-track.test.ts:97` (PERSIST-F)

### PendingConfirmation

- Lifecycle: `confirmPending`, `cancelPending` and `requestRepair` (`game-session.ts:473-540`). Every step is ref- and revision-guarded. Preconditions are revalidated at Confirm (`#reconcileConfirmations` :436). There is one prepare/commit, and the terminal state is recorded synchronously.
- Kinds (`src/app/confirmation-kinds.ts`): `manumission` (:46), `retire_character` (:69) and `merge_character` (:81, command `merge_characters`).
- Repair requests are `operator` provenance and are excluded from the turn-visible `#activeProposals` (:427-432).
- Tests that pin this:
  - `tests/authority/pending-confirmation-foundation.test.ts` (:161 confirm, no provider; :175 idempotent; :188 cancel, zero mutation)
  - `tests/authority/manumission-confirmation.integration.test.ts`
  - `tests/identity/character-repair-confirmation.test.ts` (:31 no mutation before Confirm; :105 revalidation)

### Exact producers of `register_character` (production `src/`, excluding `src/dev/`)

Three producers, as expected:

| # | Producer | Location | Notes |
|---|---|---|---|
| 1 | Engine preparation for canonical records (AUTH-5) | `src/campaign/preparation.ts:11-20` | Not a `register_character` command. `characterForUpdate` implicitly pushes `{ id, origin: refs.character(id), profile: {}, current: {} }` into the draft when a canonical id is changed by `set_condition`/`set_profile`/`place_item(equipped)` etc. Callers: `characters.ts:47,51,59,88`, `items.ts:19,23`. Tracked as debt AUTH-5 / ID-8 (`docs/MASTER_DEBT_REGISTER.md:230,349`). |
| 2 | Person Actual Offer plan | `src/turn/commerce/person-offers.ts:340` (subject) and `:350` (named narrator-created seller) | Both are inside the `propose_trade_offer` person plan (`:353-355`), so they commit only at UI Accept. |
| 3 | Keep track | `src/turn/identity/keep-track.ts:127` | |

- No other production literal `kind: "register_character"` exists. The other `register_character` mentions are readers: `trade.ts:71,92,218`, `trade-offer-view.ts:86`, `trade-notes.ts:23`, `scene-participants.ts:130`, `keep-track.ts:96`, `game-session.ts:581`, `person-offers.ts:338`.
- `src/campaign/types.ts:346` is the type; `validation.ts:232` is the parser.
- Source-level pin: `tests/authority/explicit-character-materialization.test.ts:139-152` asserts that the registrars are exactly `src/turn/commerce/person-offers.ts` and `src/turn/identity/keep-track.ts`, and that the builders are exactly `src/campaign/materialization.ts` and `src/turn/identity/provisional-people.ts`.

### Callers of `buildMaterializedCharacter` / `materializeProvisional`

- `buildMaterializedCharacter` (defined at `src/campaign/materialization.ts:35`):
  - Only production caller: `materializeProvisional` (`src/turn/identity/provisional-people.ts:76`).
  - No `src/dev` caller.
  - Test and tooling callers: `tests/identity/*` (created-name-provenance, created-person-identity-binding, identity-continuity-edge-cases, current-character-name-projection), `tests/ui/player-character-view.test.ts`, `tests/images/*` (portrait-gallery, permanent-appearance, portrait-prompt), `tests/authority/explicit-character-materialization.test.ts`, `tests/commerce/seller-continuity.test.ts`, `tests/support/provisional-helper.ts`, `scripts/browser/block7-browser-check.mjs`. `tests/architecture/lifecycle-vocabulary.architecture.test.ts:25` asserts the export.
- `materializeProvisional` (defined at `provisional-people.ts:73`). Production callers:
  - `keep-track.ts:122` (Keep track)
  - `person-offers.ts:332` (offer subject)
  - `person-offers.ts:349` (named seller)

## 8. Canonical names/aliases are reserved handles: PASS with CONCERN

- Rule:
  - `src/world/canonical-names.ts` builds normalized `name`/`display_name`/`aliases` → owner ids, memoized per world, and exposes `reservedForAnotherIdentity(world, name, self?)`.
  - `src/turn/identity/canonical-name-reservation.ts` (`claimedHandles` checks the name plus the `self_introduction.full_name`; `claimsReservedHandle`).
- Applied to:
  - late naming on a persistent record (`name-establishment.ts:54`, skip `canonical_name_reserved`)
  - the provisional reading (`:64`)
  - Keep track (`keep-track.ts:110`, block `canonical_name`, including the participant registry's `established_name`)
- Nothing merges or renames. The canonical character's own id is exempt (`self`).
- Tests that pin this: `tests/identity/canonical-name-reservation.regression.test.ts` (:66, 1-6, :123), and `tests/identity/keep-track.test.ts:133`.
- CONCERN 8a: the person Actual Offer plan does not apply the reserved-handle rule. In `src/turn/commerce/person-offers.ts`:
  - The subject (`:332`) and the named seller (`:292` candidate selection, `:349` materialization) are taken from `reading.persons` and materialized with `p.name`.
  - There is no `claimsReservedHandle` check: `grep` finds the rule only in name-establishment.ts, keep-track.ts and canonical-name-reservation.ts.
  - The scene reading's own canon non-duplication (`src/turn/narration-facts/scene-identity.ts:128-219`) checks only authored `e.name` tokens and full names, not `aliases` or `display_name`.

  So a narrated seller or captive whose self-introduced name equals a canonical *alias* or *display name* (not a full name) could, on Accept, be materialized carrying that reserved handle. The REPO-12 report scopes the rule to "late naming, the provisional reading and Keep track" (`docs/evaluations/REPO12_CANONICAL_NAME_CONFLICT.md` §10.2), and no test covers reservation on the offer path. This is unverified by execution (static analysis only). It is a coverage gap in invariant 8, not a cleanup regression: cc9cb7c added the rule, and person-offers.ts never had it. Suggested follow-up: apply `claimsReservedHandle` in `person-offers.ts` before `materializeProvisional`, as a block reason or by dropping the name, and add a regression test.

## 9. No fuzzy identity merging: PASS

- Merge happens only through a human-confirmed repair:
  1. `requestRepair` takes explicit ids, never a name (`game-session.ts:514-540`), and creates an `operator` PendingConfirmation.
  2. `confirmPending` → `merge_characters` (`confirmation-kinds.ts:84`).
  3. `characters.ts:40-45` re-runs `mergeConflicts` and fails closed.
- The Controller has no merge/retire kind, and the authorizer default refuses it.
- `mergeConflicts` refuses differing established names (`character-repair.ts:63`, `names_differ`), as well as sex/species/age/location/NPC+/household/legal conflicts.
- `applyMerge` (`:128-168`) copies a name onto the target only when the target has none, and only inside that confirmed repair.
- The fork scanner is diagnostic only (`identity-fork-scanner.ts:25,94`: `automatic_repair: false`, "HUMAN REVIEW REQUIRED"). A same name alone is never a finding (S2).
- Name-driven paths never merge:
  - Keep track: `same_name_persistent` and `ambiguous_name` blocks (`keep-track.ts:109-111`, message "Names are not identity, so nothing was merged or created")
  - name establishment: the ID-1 `persistent_identity_elsewhere` skip creates nothing (`name-establishment.ts:67-69`)
  - deterministic ids are revision-scoped, so same-named people get different ids (`materialization.ts:28-34`)
- Tests that pin this:
  - `tests/identity/character-lifecycle-repair.test.ts` (M1-M4; M2 "names … REFUSES the merge")
  - `tests/identity/character-repair-confirmation.test.ts`
  - `tests/identity/identity-fork-scanner.test.ts` (S2, S3, S6 read-only)
  - `tests/identity/keep-track.test.ts:133` ("never a merge by name")
  - `tests/authority/explicit-character-materialization.test.ts:110`
