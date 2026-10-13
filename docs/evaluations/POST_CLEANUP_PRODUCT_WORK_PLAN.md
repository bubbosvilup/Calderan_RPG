# Post-cleanup product work plan

Date: 2026-10-13. Basis: main `ed7e85f` (the [post-cleanup repository audit](POST_CLEANUP_REPOSITORY_AUDIT.md), verdict GREEN WITH KNOWN PRODUCT DEBT) and the reconciled [Master Technical Debt Register](../MASTER_DEBT_REGISTER.md). Planning only: nothing in this document is implemented, scheduled or approved. Every block and every order below needs the user's approval before work starts. Repository cleanup stays CLOSED.

## How to read this plan

- **Scope.** Every register item whose post-cleanup verdict ([A9 evidence](post_cleanup_audit/A9_REGISTER_RECONCILIATION.md)) is CONFIRMED OPEN, PARTIAL or NEEDS HUMAN DECISION: 147 entries after merging duplicate IDs (an entry may carry several IDs, for example `ID-8 / NPC-3 / F8`). Each item was re-checked statically against the current code (grep and read only; nothing was built or run for this plan). Line numbers are current at `7e5e4ea` / `ed7e85f` (no code changed between them).
- **Groups.** Product correctness; authority / identity; pipeline / context; persistence; items / economy; NPC lifecycle / simulation; UI / UX (including image UX); testing / CI; repository / archive (low priority). An item on a group boundary appears once, in the group where its fix would be made.
- **Fields per item.** Current behavior; desired behavior; user impact; technical risk; files; dependencies; blockers; human decision; safety; order. Safety is one of SAFE, SAFE WITH STOP CONDITIONS, HUMAN DECISION REQUIRED. "Order" ranks the item inside its group; the order across groups is the [dependency-aware order](#dependency-aware-order-across-groups) below and the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md).
- **Deep dives.** Eight reviews back this plan: [AUTH-5 and canonical materialization](NEXT_AUTH5_CANONICAL_MATERIALIZATION_REVIEW.md), [pipeline and authority](NEXT_PIPELINE_AUTHORITY_REVIEW.md), [context boundary](NEXT_CONTEXT_BOUNDARY_REVIEW.md), [persistence hardening](NEXT_PERSISTENCE_HARDENING_REVIEW.md), [items and economy](NEXT_ITEMS_ECONOMY_REVIEW.md), [NPC lifecycle](NEXT_NPC_LIFECYCLE_REVIEW.md), [UI product](NEXT_UI_PRODUCT_REVIEW.md), [test and CI hardening](NEXT_TEST_CI_HARDENING_REVIEW.md). The [dependency graph](POST_CLEANUP_DEBT_DEPENDENCY_GRAPH.md) and the [morning brief](MORNING_BRIEF_AFTER_REPOSITORY_CLEANUP.md) summarize them.

## Totals

| Safety | Entries |
| --- | --- |
| SAFE | 48 |
| SAFE WITH STOP CONDITIONS | 62 |
| HUMAN DECISION REQUIRED | 37 |

| Group | Entries |
| --- | --- |
| Product correctness | 7 |
| Authority / identity | 19 |
| Pipeline / context | 30 |
| Persistence | 18 |
| Items / economy | 16 |
| NPC lifecycle / simulation | 5 |
| UI / UX | 38 |
| Testing / CI | 7 |
| Repository / archive (low priority) | 7 |

## Re-check results that differ from the register

- AUD-1: the register row cites `src/commerce/person-offers.ts`; the file is `src/turn/commerce/person-offers.ts`. The behavior is confirmed statically: neither materialization in the offer plan (`:332` subject, `:349` named seller) calls `claimsReservedHandle`, which has exactly two callers (`turn/identity/name-establishment.ts:47`, `turn/identity/keep-track.ts:110`). Not confirmed by execution.
- MOV-5: the stale "no party, follower, companion" text is now only in the code comment `turn/movement/character-movement.ts:16`; a grep of `src/` finds no such wording in the Controller prompt, which the register still names.
- VOC-1: the register says the key is "pinned by tests". `git grep established_at_promotion` finds it only at `turn/context/prompt-builder.ts:230` and in docs; no tracked test or golden file contains the literal. Indirect pinning (a test that compares rendered prompt text) is possible but was not confirmed.
- PRV-3: `retry_after_s` is captured at `llm/openrouter/client.ts:41-44` and has 0 occurrences in `llm/retry.ts`, as stated.
- IMG-2: abort plumbing exists (`llm/image-generator.ts:86-95` accepts a `signal`), but every abort becomes `transient_provider_error` (`:90`), and no batch signal or cancel route exists (`ui/server.ts:113` route list).
- **ITM-2 premise is wrong in part.** `empty_slots` is not purely derived: `set_slot_knowledge` (`src/campaign/characters.ts:87-93`) records a slot as known empty versus unknown, and `src/campaign/projections.ts:40` reads that tri-state. Computing it from items would lose the "unknown" distinction.
- **IMG-10: the upload control is already gone from the UI.** `src/ui/index.html` has only "Remove reference" plus a note that references are deferred; the server route `/api/portrait/reference` (`src/ui/server.ts:13,116`) still accepts an upload. D9 is then mostly about the API route and the stored field.
- **UI-8 is partly fixed.** `#character-name` has `overflow-wrap:anywhere` (`src/ui/style.css:356-358`); `.scene-participant` (`style.css:198-204`) and `.household-member` (`:236`) still lack it. A9 said grep 0.
- **D3 says "schema 7" but the snapshot is already schema 7** (`src/campaign/types.ts:286`, save format 8 at `src/persistence/save-migrations.ts:5`). An integer-silver change would be snapshot 8 / save 9.
- **TRD-11 also loses money on SELL to a persistent buyer:** the player is credited but the buyer's purse is never debited (`src/campaign/trade.ts:203-209`); the register mentions only BUY and anonymous sales.
- **The modern benchmark exists** (`tests/benchmark/`, 55 scenarios per `docs/TESTING.md:21`), although register section 14 still says "not built". TEST-6 and TEST-7 should target it.

## New findings from the planning reviews (not yet register rows)

These were found while re-checking the register for this plan. They are static findings unless marked otherwise, none was reproduced by execution, and none is in the register yet. Proposed severities are the reviewers' proposals. They should be adopted, corrected or dropped at the next register reconciliation.

| Finding | Area | Proposed severity | Evidence | Source |
| --- | --- | --- | --- | --- |
| CTX-1 is real on current data: the ID mask has no word boundary, so the NPC id `dren` is replaced inside words such as "children" in masked Narrator text | Context / privacy | P2 (CTX-1 unchanged) | `src/turn/identity/narrator-identity.ts:48` builds the id pattern without boundaries; the name pattern on `:45` has them | [Context review](NEXT_CONTEXT_BOUNDARY_REVIEW.md) section 1 |
| Several audit checks read only quoted speech, but the production RPG format writes speech without quotation marks, so these checks are inactive on well-formed output | Context / audit | P2 | `src/turn/audit/narration-audit.ts:232`, `src/turn/context/prompt-builder.ts:22` | [Context review](NEXT_CONTEXT_BOUNDARY_REVIEW.md) section 2 |
| Transcript window desync: the server returns the last 500 entries, the client counts rendered messages, so after 500 entries new turns stop appearing until a reload | UI correctness | P2 | `src/app/game-session.ts:1255`, `src/ui/client.js:974,1030` | [UI review](NEXT_UI_PRODUCT_REVIEW.md) section 2.1 |
| A keyboard-only player cannot reach Promote to NPC+ (the drawer's Tab cycle skips the button and its confirm) | UI accessibility | P2 (UI-1 widened) | `src/ui/client.js:683-689` | [UI review](NEXT_UI_PRODUCT_REVIEW.md) section 2.2 |
| `withdraw_trade_offer` is authorized from the draft and never re-checked against the delivered text (the TRD-2 re-check filters `propose_trade_offer` only) | Pipeline | P2 | `src/turn/stages/commit-preparation.ts:54` | [Pipeline review](NEXT_PIPELINE_AUTHORITY_REVIEW.md) section 5 |
| `TurnResult.authorized_commands` and the trace's committed kinds use the batch from before commit preparation | Pipeline observability | P3 | `src/turn/coordinator/turn-coordinator.ts:321`, `src/turn/stages/result.ts:30`, `src/app/turn-trace.ts:71` | [Pipeline review](NEXT_PIPELINE_AUTHORITY_REVIEW.md) section 4.3 |
| A narrated, evidence-verified "I am leaving" by an NPC+ commits `leave_household` without player confirmation, and no production path brings the person back (NPC-4 with NPC-1) | NPC lifecycle | P2 combined | `src/turn/authorization/command-authorizer.ts:89-99`, `src/campaign/heartstone-rite.ts:39` | [NPC lifecycle review](NEXT_NPC_LIFECYCLE_REVIEW.md) section 1 |
| An NPC+ can never be demoted, retired or merged away; the retirement refusal names an operation that does not exist | NPC lifecycle | P3 | `src/campaign/character-repair.ts:39,72` | [NPC lifecycle review](NEXT_NPC_LIFECYCLE_REVIEW.md) section 4.5 |
| No return path for a created person whose location was cleared by `leave_scene`, or for an off-scene canonical NPC that is not an active NPC+ | NPC lifecycle | P3 | `src/campaign/characters.ts:84`, `command-authorizer.ts:68` | [NPC lifecycle review](NEXT_NPC_LIFECYCLE_REVIEW.md) section 4.2 |
| Side stores are size-capped on read but not on write; one damaged side store blocks current, previous and all backups; the media store is not clamped when an older slot is loaded; checkpoints are not de-duplicated by revision; `narrated:` refs are not unique and three readers key them differently | Persistence | P2 to P3 | see the review (N1 to N5) | [Persistence review](NEXT_PERSISTENCE_HARDENING_REVIEW.md) section 2 |
| Two of the 8 browser checks print a JSON report and cannot fail on a wrong result (`confirmation`, `turn-reliability`) | Testing | P2 (blocks a browser CI gate) | `scripts/browser/turn-reliability-browser-check.mjs:35-49`, `confirmation-browser-check.mjs:27-68` | [Test and CI review](NEXT_TEST_CI_HARDENING_REVIEW.md) section 3 |
| A test writes saves into the repository `saves/` folder; three tests assert hard wall-clock limits; the benchmark caps scenarios at 60 (55 used); `scripts/**/*.mjs` is never syntax-checked; two `docs/TESTING.md` paragraphs are stale | Testing | P3 | see the review (proposed TEST-10 to TEST-15) | [Test and CI review](NEXT_TEST_CI_HARDENING_REVIEW.md) section 3 |
| The `/location` success message contains a mis-encoded arrow ("â†’") and shows the raw location id | UI copy | P3 | `src/app/game-session.ts:393` | [UI review](NEXT_UI_PRODUCT_REVIEW.md) section 2.5 |
| A goods SELL to a persistent buyer credits the player but never debits the buyer | Economy | P2 (TRD-11 widened) | `src/campaign/trade.ts:200-209` | [Items and economy review](NEXT_ITEMS_ECONOMY_REVIEW.md) section 2 |
| No production path ever removes a character condition | Authority / lifecycle | P3 | `src/turn/authorization/command-authorizer.ts:59` | [AUTH-5 review](NEXT_AUTH5_CANONICAL_MATERIALIZATION_REVIEW.md) section 1.11 |
| The Controller provider receives the authored prose and unmasked name of the narrator-only NPC (the Controller copy is a deny-list of the full context) | Context / privacy | P2, needs a decision | `src/turn/coordinator/controller.ts:37` | [Context review](NEXT_CONTEXT_BOUNDARY_REVIEW.md) section 7 |
| The audit revision request and truncation recovery have no context headroom reserve, so a turn can fail with `context_too_large` after its draft exists | Context budget | P2 (with PIPE-9) | see the review | [Context review](NEXT_CONTEXT_BOUNDARY_REVIEW.md) section 5 |

**Current documents that drift from the code** (found by the reviews; documentation only, not fixed in this planning commit): `docs/architecture/TURN_COORDINATOR.md` (narration_delta and the commit order, the "four command kinds" count), `docs/architecture/NARRATIVE_AUTHORITY.md:22` (all durable changes through the Controller), `docs/ARCHITECTURE.md` lifecycle section (the implicit canonical record described as designed, the `register_character` producer list, "every persistent character can be retired or merged"), `docs/HEARTSTONE.md:42` against `docs/CURRENT_STATE.md:61` (D5 answered both ways), `docs/architecture/ACTUAL_OFFER.md:71` and DOC-12, `docs/TESTING.md` (browser check paragraph), the `src/campaign/trade.ts:15-16` header comment. A short documentation alignment step belongs at the start of the first block that touches each area.

## Product correctness


#### AUD-1 (P2)
- Current behavior: the person Actual Offer plan materializes the subject (`turn/commerce/person-offers.ts:332`) and a named seller (`:349`) with `materializeProvisional` and no reserved-handle check. The scene reader's own canon guard checks full names only, not aliases or display names (A8 concern 8a).
- Desired behavior: a narrated captive or seller who self-introduces with another identity's canonical name, alias or display name is never materialized with that name on Accept, with the same rule late naming and Keep track already apply.
- User impact: a purchased person could carry a canonical NPC's alias as their own name, which makes one name refer to two people and can confuse disclosure and identity.
- Technical risk: low. The rule exists (`turn/identity/canonical-name-reservation.ts:16`), and Keep track gives a precedent block code (`keep-track.ts:110`, `canonical_name`).
- Files: `src/turn/commerce/person-offers.ts`, `src/turn/identity/canonical-name-reservation.ts`, `src/turn/identity/provisional-people.ts`, a new test beside `tests/identity/canonical-name-reservation.regression.test.ts`.
- Dependencies: none.
- Blockers: none. The gap is unconfirmed by execution, so a failing test must come first.
- Human decision: none needed if the fix follows Keep track (block the offer with a diagnostic). Dropping the name and keeping the offer would be a product choice.
- Safety: SAFE WITH STOP CONDITIONS (stop if a focused reproduction test does not fail on current code; stop if the fix would need the name-drop variant).
- Order: 1

#### MOV-5 (P3)
- Current behavior: `turn/movement/character-movement.ts:16` says "There is no party, follower, companion or proximity model", while `turn/movement/follow-candidates.ts:13-15` implements a derived follow-candidate set and a held-person escort.
- Desired behavior: the comment describes the current model: no persisted party, a derived per-turn candidate set, escort only for a held, named, present person.
- User impact: none directly; a misleading invariant invites a wrong fix.
- Technical risk: none (comment only). The Controller-prompt half named by the register was not found (see re-check results).
- Files: `src/turn/movement/character-movement.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 2

#### H1 residuals: `them` handover, shared first name, fronted-recipient receipt (P3, deferred)
- Current behavior: all three fail closed. A bare ambiguous "them" moves no item, an unestablished or shared first name attributes no condition, and a hedged fronted recipient produces no receipt; `tests/authority/valid-narration-survives-audit.test.ts` pins this.
- Desired behavior: resolved through shared NarrationFacts readers once the item-transfer and condition evidence readers migrate, still failing closed on true ambiguity.
- User impact: occasionally a narrated handover or condition is dropped and the player must restate it.
- Technical risk: medium; loosening any of them risks a wrong transfer, which is worse than a dropped one.
- Files: `src/turn/authorization/evidence-authorization.ts`, `src/turn/authorization/turn-evidence.ts`, `src/turn/narration-facts/`.
- Dependencies: ARCH-2 residual (F readers) in the pipeline group.
- Blockers: ARCH-2 F-reader migration.
- Human decision: none for the migration; any change that accepts more ambiguity needs one.
- Safety: SAFE WITH STOP CONDITIONS (only inside the F-reader migration; stop if any currently fail-closed case starts to commit).
- Order: 4

#### KPG-2 residual (P3, deferred)
- Current behavior: a pronoun with two same-sex candidates attributes nothing (`turn/narration-facts/dialogue-forms.ts:86`, `ambiguous`), by design.
- Desired behavior: unchanged unless a bounded verifier is approved (D18).
- User impact: dialogue in two-person same-sex scenes is sometimes not attributed, so knowledge or naming is skipped.
- Technical risk: high if loosened (misattribution).
- Files: `src/turn/narration-facts/dialogue-forms.ts`.
- Dependencies: D18 (verifier only after measuring the ambiguity rate).
- Blockers: no measurement exists.
- Human decision: required to change the by-design behavior.
- Safety: HUMAN DECISION REQUIRED
- Order: 5

#### MOV-2 residual (P3, deferred)
- Current behavior: only a held, present, named person led by the player's own words moves with Nicco (`turn/movement/follow-candidates.ts:60`, `resolveHeldEscort`); "with <name>" for free people and unnamed, plural or pronoun forms stay unresolved.
- Desired behavior: as decided in D1 (answered): unchanged, no persisted party.
- User impact: "let's go, both of you" moves nobody unless the narration shows a follow.
- Technical risk: medium if widened (unintended movement).
- Files: `src/turn/movement/follow-candidates.ts`, `src/turn/movement/player-travel.ts`.
- Dependencies: none.
- Blockers: D1 closes the free-person case by design.
- Human decision: required to reopen D1.
- Safety: HUMAN DECISION REQUIRED
- Order: 6

#### AUTH-1 residual (P3, deferred)
- Current behavior: the manumission grammar needs a second-person form; "I free Maren." is not recognised (`turn/commerce/person-transactions.ts:23`, `FREE`), by design.
- Desired behavior: unchanged unless the author wants third-person forms to raise a PendingConfirmation too.
- User impact: the player must address the person to free them; no state risk because only Confirm commits.
- Technical risk: low (the confirmation card stays the authority).
- Files: `src/turn/commerce/person-transactions.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: required (grammar scope of a Class C action).
- Safety: HUMAN DECISION REQUIRED
- Order: 7

#### AUTH-2 residual (P3)
- Current behavior: retire and merge are human-invoked repairs only (`app/game-session.ts:514`, `requestRepair`, PendingConfirmation-gated); the fork scanner is offline (`campaign/identity-fork-scanner.ts:58`, used by `dev/maintenance/scan-identity-forks.ts`); no `materialize_character` confirmation kind exists.
- Desired behavior: unchanged by design; duplicates saved by older builds are found with the scanner and merged by a human.
- User impact: an old save with a forked person stays forked until the player repairs it.
- Technical risk: high for any automatic repair (a wrong merge loses a person).
- Files: `src/app/game-session.ts`, `src/campaign/identity-fork-scanner.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: required for any automatic or in-UI scanner path.
- Safety: HUMAN DECISION REQUIRED
- Order: 8

## Authority / identity


#### ID-8 / NPC-3 / F8 (P2, decision D5)
- Current behavior: no deliberate code creates a canonical-origin campaign record; the only producer is the implicit one in AUTH-5 (`campaign/preparation.ts:15-18`), and such a record is enough for rite eligibility (`campaign/heartstone-rite.ts:37-38`).
- Desired behavior: D5 answered: either canonical NPCs never get a campaign record or NPC+, or they get one only through a deliberate, player-authorized command.
- User impact: a canonical NPC can become NPC+ through a side path nobody chose; the rule also shapes Property / Heartstone, the user's next named item.
- Technical risk: medium; the answer changes which commands may touch canonical ids.
- Files: `src/campaign/preparation.ts`, `src/campaign/heartstone-rite.ts`, `src/campaign/characters.ts`, `src/campaign/items.ts`.
- Dependencies: none; AUTH-5 depends on it.
- Blockers: D5 open (section 16: "Decide before Property").
- Human decision: D5.
- Safety: HUMAN DECISION REQUIRED
- Order: 1

#### AUTH-5 (P2)
- Current behavior: `characterForUpdate` pushes `{id, origin, profile:{}, current:{}}` for any id without a record (`campaign/preparation.ts:11-19`); callers are `set_profile` and `set_condition` (`campaign/characters.ts:47,51`), `set_slot_knowledge` (`:88`), the created-only location branch (`:59`) and equipped placement (`campaign/items.ts:19,23`).
- Desired behavior: per D5, either refuse canonical ids without a record, or keep the implicit record and exclude it from rite eligibility; in both cases a test pins the rule.
- User impact: a condition or slot-knowledge change on a canonical NPC silently creates a campaign record that makes them rite-eligible (static reading, not reproduced).
- Technical risk: medium; refusing can turn currently accepted turns into rejected commands, and some callers may legitimately need the record for the player character.
- Files: `src/campaign/preparation.ts`, `src/campaign/characters.ts`, `src/campaign/items.ts`, `src/campaign/heartstone-rite.ts`.
- Dependencies: ID-8 / D5.
- Blockers: D5.
- Human decision: D5 (a characterization test of the current behavior is safe before it).
- Safety: HUMAN DECISION REQUIRED
- Order: 2

#### AUTH-4 (P3)
- Current behavior: a person plan is checked for its command kinds (`campaign/validation.ts:216-220`, `PERSON_PLAN_KINDS`) and only its `transfer_person` entry is checked at propose time (`campaign/trade.ts:136-139`); the ids the plan registers or changes are not tied to the subject.
- Desired behavior: a closed id rule at propose time and in snapshot validation: the plan registers at most the subject and a named seller, and changes only the subject's legal status.
- User impact: none today (latent; only engine code produces plans).
- Technical risk: low at propose time; a new snapshot-validation rule can reject existing saves.
- Files: `src/campaign/trade.ts`, `src/campaign/validation.ts`, `src/campaign/snapshot-validation.ts`.
- Dependencies: AUD-1 (both touch the offer plan).
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if any fixture or test save fails the new validation rule; then keep it propose-time only).
- Order: 3

#### ID-3 / I7 (P3)
- Current behavior: the provisional "Slave" label is built in four places with different results: `app/session-view.ts:72`, `app/player-character-view.ts:152`, `app/trade-offer-view.ts:50` ("<descriptor> Slave") and `turn/identity/scene-participants.ts:61`; no shared `provisionalPersonLabel` exists (grep 0).
- Desired behavior: one read-model function used by sidebar, card, offer view and narrator context.
- User impact: the same person can be "Slave" in one panel and "Young Slave" in another.
- Technical risk: low to medium; label text reaches the narrator context, so goldens may move.
- Files: the four files above, plus `src/turn/context/context-builder.ts`.
- Dependencies: ID-6 (same read model).
- Blockers: none.
- Human decision: which label wins where they differ today.
- Safety: SAFE WITH STOP CONDITIONS (stop if any golden or narrator-input text changes without the user agreeing the new label).
- Order: 4

#### ID-6 / I8 (P3)
- Current behavior: the UI shows a created person's name only if proven (`app/player-character-view.ts:58`, `knownCreatedName`); the narrator context reads `profile.name` directly (`turn/context/context-builder.ts:105-111` `labelled`, `:199` `socialProjection`).
- Desired behavior: both sides use one proven-name rule, moved under `src/campaign/`.
- User impact: the narrator can use a name the UI does not show, or the reverse.
- Technical risk: medium; it changes narrator input.
- Files: `src/app/player-character-view.ts`, `src/turn/context/context-builder.ts`.
- Dependencies: ID-3.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if the golden turn pipeline changes in a way not explained by the rule).
- Order: 5

#### ID-7 / I3 (P3)
- Current behavior: narrator masking replaces full names, display names and aliases only (`turn/identity/narrator-identity.ts:38-45`); surname-only or first-name-only mentions in canon chunks are not masked, and no fragment leak test exists.
- Desired behavior: a leak test over the retrieved canon chunks first; then mask the fragments the test shows leaking.
- User impact: a hidden NPC's surname could reach narration through retrieved lore.
- Technical risk: low for the test; medium for masking more (false hits on common words).
- Files: `src/turn/identity/narrator-identity.ts`, a test under `tests/identity/` or `tests/context/`.
- Dependencies: CTX-2 residual (same leak class, output side).
- Blockers: none.
- Human decision: none for the test.
- Safety: SAFE (test first; any masking change is a separate, reviewed step).
- Order: 6

#### ID-5 / I14 (P3)
- Current behavior: `SessionView` carries the unmasked profile name for present people and household members (`app/session-view.ts:69-72` `name`, used at `:98` and `:106`); only the server's field selection hides it (`ui/server.ts:53`).
- Desired behavior: the view carries only the player-safe display name.
- User impact: none visible today; a future endpoint that forwards the view would leak hidden names.
- Technical risk: low; it touches view consumers and their tests.
- Files: `src/app/session-view.ts`, `src/ui/server.ts`.
- Dependencies: ID-3.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if a dev tool needs the raw name; then give it a separate dev-only field).
- Order: 7

#### AUTH-3 (P3)
- Current behavior: 265 `"nicco"` literals in 78 non-dev source files (`git grep`), including authority code (`turn/commerce/person-offers.ts:291,343,345`, `campaign/item-transfer.ts:20`), beside one `activePlayerCharacterId()` (`campaign/trade.ts:28` falls back to `"nicco"`).
- Desired behavior: one `playerId(snapshot)` in authority code, and an architecture test that forbids new literals outside canon and opening data.
- User impact: none today (one player character); it blocks any future second player character.
- Technical risk: low per site but wide; the count grew since the audit (240 to 265).
- Files: about 78 files under `src/`, `tests/architecture/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (guard test first with the current allowlist; stop if a literal is a canon id, serialized data or prompt text).
- Order: 8

#### REV-4 (P3)
- Current behavior: item-sprite `flush()` commits again inside `catch` without its own try (`app/item-sprite-jobs.ts:56-62`); `flush()` is called from session paths such as `app/game-session.ts:369,583,1291`.
- Desired behavior: the fallback commit is wrapped, so a second failure is recorded and never escapes.
- User impact: rare; an exception could escape into a session path after a stale sprite job.
- Technical risk: very low.
- Files: `src/app/item-sprite-jobs.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 9

#### AUTH-7 (P3)
- Current behavior: `POST /api/location` overrides the player's location with only a revision check and no dev gate (`ui/server.ts:143-148`); the play client calls it (`ui/client.js:1073`).
- Desired behavior: a dev flag, or a player confirmation, as the author chooses.
- User impact: an always-available teleport in the player UI.
- Technical risk: low.
- Files: `src/ui/server.ts`, `src/ui/client.js`, `src/app/game-session.ts`.
- Dependencies: none.
- Blockers: the choice.
- Human decision: dev flag vs confirmation (A9 decision list).
- Safety: HUMAN DECISION REQUIRED
- Order: 11

#### F5 / I2 (P3, deferred)
- Current behavior: a canonical NPC re-cast as a created person is blocked by regex bearer checks (`turn/identity/partner-identity-guard.ts`, 76 lines).
- Desired behavior: the same guarantee read from NarrationFacts, with the reserved-handle rule as the second line.
- User impact: residual risk of a canonical person duplicated as a created one.
- Technical risk: medium.
- Files: `src/turn/identity/partner-identity-guard.ts`, `src/turn/narration-facts/`.
- Dependencies: ARCH-2 residual; AUD-1 closes one related path.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (tests only until the NarrationFacts migration; stop if any current guard case stops failing closed).
- Order: 12

#### I4 (P3, deferred)
- Current behavior: canonical-name learning rests on a heuristic surface of 165 lines (`turn/identity/canonical-name-disclosure.ts`).
- Desired behavior: the same rule (truthful, attributed self-introduction) read from NarrationFacts dialogue facts.
- User impact: rare wrong learn or missed learn of a canonical name.
- Technical risk: medium (secrecy).
- Files: `src/turn/identity/canonical-name-disclosure.ts`.
- Dependencies: ARCH-2 residual, NAME_REQUEST mismatch.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if any disclosure test changes outcome).
- Order: 13

#### F6 (P3, deferred)
- Current behavior: a name introduced on a turn where Nicco changes location is skipped (`turn/identity/name-establishment.ts:71`, `location_changed`; passed from `turn/coordinator/turn-coordinator.ts:313-316`); a later naming has no linked participant.
- Desired behavior: undecided; either keep the skip (safe) or link the name to the arriving scene.
- User impact: a name given while walking is lost.
- Technical risk: medium (cross-scene identity).
- Files: `src/turn/identity/name-establishment.ts`, `src/turn/coordinator/turn-coordinator.ts`.
- Dependencies: ARCH-2 residual.
- Blockers: none.
- Human decision: required to change the skip.
- Safety: HUMAN DECISION REQUIRED
- Order: 14

#### F2 (P3, PARTIAL)
- Current behavior: a same-name living held person or household member elsewhere blocks a new reading (`name-establishment.ts:66-69`, `persistent_identity_elsewhere`); other same-named absent people are not linked to a new one.
- Desired behavior: unchanged by the "no fuzzy identity merging" invariant (A8 section 9) unless the author widens it.
- User impact: an absent unrelated namesake can become a second record of the same person.
- Technical risk: high if widened.
- Files: `src/turn/identity/name-establishment.ts`.
- Dependencies: ID-1 residual.
- Blockers: invariant 9.
- Human decision: required.
- Safety: HUMAN DECISION REQUIRED
- Order: 15

#### F4 / I10 (P3, deferred)
- Current behavior: late naming applies only to a present, unnamed persistent character (`name-establishment.ts:24`); an absent one cannot be named.
- Desired behavior: unchanged unless the author wants naming by reference ("her name was Lira") for absent people.
- User impact: learning an absent person's name second-hand does not stick.
- Technical risk: medium.
- Files: `src/turn/identity/name-establishment.ts`, `src/turn/narration-facts/scene-identity.ts`.
- Dependencies: ARCH-2 residual.
- Blockers: none.
- Human decision: required.
- Safety: HUMAN DECISION REQUIRED
- Order: 16

#### ID-1 residual (P3, deferred)
- Current behavior: look-alike detection for unnamed people runs only offline (`campaign/identity-fork-scanner.ts:58`); there is no turn-time check.
- Desired behavior: unchanged by design; any turn-time check would be warn-only.
- User impact: a forked unnamed person is found only by a scan.
- Technical risk: high for anything beyond a warning.
- Files: `src/campaign/identity-fork-scanner.ts`.
- Dependencies: I1 / ID-4.
- Blockers: none.
- Human decision: required.
- Safety: HUMAN DECISION REQUIRED
- Order: 17

#### NAME_REQUEST mismatch (P3, deferred)
- Current behavior: two name-question readers differ both ways: `NAME_REQUEST` (`turn/identity/identity-request.ts:6`) gates canonical disclosure, `asksName` (`:30-36`) decides whether a bare name answers a question; the comment at `:13-15` says both are kept on purpose.
- Desired behavior: one reader, or a documented reason per difference.
- User impact: a phrasing can ask a name for one purpose and not the other.
- Technical risk: medium (disclosure capability).
- Files: `src/turn/identity/identity-request.ts`.
- Dependencies: I4.
- Blockers: none.
- Human decision: required (it changes when canonical names may be disclosed).
- Safety: HUMAN DECISION REQUIRED
- Order: 18

#### I5 (P3, deferred)
- Current behavior: a bound canonical partner cannot self-introduce under another name; the guard is deliberately narrow (`turn/identity/partner-identity-guard.ts`, audit `canonical_name_conflict` at `turn/audit/narration-audit.ts:400`).
- Desired behavior: unchanged by design.
- User impact: none expected.
- Technical risk: high if widened (false conflicts).
- Files: `src/turn/identity/partner-identity-guard.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: required to widen.
- Safety: HUMAN DECISION REQUIRED
- Order: 19

#### addressed_verb residual (P3, deferred)
- Current behavior: "tells her" recipient facts are extracted (`turn/narration-facts/identity-forms.ts:179`) and not used by the commerce policy (`git grep addressed_verb src/turn/commerce`: 0), by design.
- Desired behavior: unchanged unless a commerce case needs it.
- User impact: none known.
- Technical risk: medium if used (misattributed seller).
- Files: `src/turn/narration-facts/identity-forms.ts`, `src/turn/commerce/`.
- Dependencies: none.
- Blockers: none.
- Human decision: required to start using it.
- Safety: HUMAN DECISION REQUIRED
- Order: 20

---

## Pipeline / context


#### CTX-1 (P2)
- Current behavior: canonical NPC ids are masked with an alternation regex without boundaries (`turn/identity/narrator-identity.ts:48`), so an id that is a prefix of another token would be rewritten inside it (not reproduced); created characters are rendered as `profile.name ?? c.id` (`turn/context/prompt-builder.ts:138`); item, fact and location ids reach the narrator.
- Desired behavior: boundary-aware id masking, then session-scoped opaque refs in narrator rendering and an output scan for id shapes.
- User impact: internal ids can surface in prose; a corrupted token can garble a prompt line.
- Technical risk: low for the boundary fix; medium for opaque refs (narrator input changes).
- Files: `src/turn/identity/narrator-identity.ts`, `src/turn/context/prompt-builder.ts`.
- Dependencies: CTX-7 (the gate lives in a WeakMap).
- Blockers: none.
- Human decision: none for the boundary fix.
- Safety: SAFE WITH STOP CONDITIONS (unit test first; stop before the opaque-ref step if goldens change).
- Order: 1

#### PIPE-10 (P2)
- Current behavior: any retrieval exception or a payload over the cap fails the turn (`turn/context/retrieval-policy.ts:159,172,176` throw `retrieval_failed`; `turn/coordinator/turn-coordinator.ts:222-223`); the module comment calls the overflow case "fails the turn closed, never truncates lore" (`:102`).
- Desired behavior: a retrieval exception degrades to no retrieval with a diagnostic; the overflow policy is chosen by the author.
- User impact: an optional lore lookup failure loses the whole turn.
- Technical risk: low for the exception path; the overflow path trades canon accuracy for availability.
- Files: `src/turn/context/retrieval-policy.ts`, `src/turn/coordinator/turn-coordinator.ts`.
- Dependencies: PIPE-9.
- Blockers: none.
- Human decision: required for the overflow half only.
- Safety: SAFE WITH STOP CONDITIONS (degrade only exceptions; stop at the overflow policy).
- Order: 2

#### PIPE-9 (P2)
- Current behavior: the context budget has no retrieval term (`turn/context/context-budget.ts`: grep `retrieval|reserve` 0), so the indicator and auto-compaction can read fine while the real request with up to 10,000 retrieval characters breaches.
- Desired behavior: reserve retrieval headroom in the budget (the register suggests about 3k tokens).
- User impact: an unexpected `context_too_large` failure late in a long campaign.
- Technical risk: low; compaction triggers earlier.
- Files: `src/turn/context/context-budget.ts`, `src/turn/context/context-compaction.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if budget tests or goldens show compaction behavior changing for small campaigns).
- Order: 3

#### PIPE-4 (P2)
- Current behavior: every `getView()` builds a context request and measures it (`app/game-session.ts:357-362`); `game-session.ts` has 58 `getView()` calls.
- Desired behavior: cache the budget by revision and input; build it once per change.
- User impact: CPU cost per poll and per action that grows with the campaign.
- Technical risk: low; cache invalidation must follow the revision and the compaction state.
- Files: `src/app/game-session.ts`.
- Dependencies: CTX-5.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 4

#### CTX-4 (P2)
- Current behavior: retrieval is keyed on the player's input only (`turn/context/retrieval-policy.ts:151`, called with `player_input` at `turn-coordinator.ts:223`); a follow-up without a named entity retrieves nothing.
- Desired behavior: add entities mentioned in the last one or two exchanges to the trigger.
- User impact: "tell me more about it" loses the lore the previous turn used.
- Technical risk: medium; narrator input changes and retrieval volume grows.
- Files: `src/turn/context/retrieval-policy.ts`, `src/turn/coordinator/turn-coordinator.ts`.
- Dependencies: PIPE-9, PIPE-11.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if retrieval goldens change beyond the follow-up cases; quality needs a live check the user must approve).
- Order: 5

#### CTX-3 (P2)
- Current behavior: the Controller envelope is `JSON.stringify` of the whole shared context plus extras with no cap (`turn/stages/controller.ts:36-41`), re-sent on retries.
- Desired behavior: a dedicated Controller view with a token cap.
- User impact: Controller latency and cost grow with the campaign; a very large envelope can fail.
- Technical risk: medium; dropping a field the Controller relies on changes proposals.
- Files: `src/turn/stages/controller.ts`, `src/turn/context/context-builder.ts`.
- Dependencies: CTX-5.
- Blockers: no live evaluation is allowed in this plan.
- Human decision: approval of a live comparison before switching.
- Safety: SAFE WITH STOP CONDITIONS (stop before production use until a live comparison is approved).
- Order: 6

#### CTX-2 residual (P2)
- Current behavior: no deterministic output-side check for unlearned names exists (`grep leak|unlearned` in `turn/audit`: 0); the only name check is `canonical_name_conflict` (`turn/audit/narration-audit.ts:400`).
- Desired behavior: a deterministic check of the final text against names, aliases and titles the player has not learned, with redaction.
- User impact: a hidden name can reach the player when the narrator ignores the prompt rule.
- Technical risk: medium; false positives redact good prose (common-word aliases).
- Files: `src/turn/audit/narration-audit.ts`, `src/turn/stages/audit.ts`, `src/turn/identity/narrator-identity.ts`.
- Dependencies: ID-7.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if the check fires on any existing valid-narration test).
- Order: 7

#### AUD-2 (P3)
- Current behavior: commit preparation calls `establishNames` and `establishedCanonicalDisclosure` without `facts: i.facts` (`turn/stages/commit-preparation.ts:73-75`), so name establishment re-reads the scene (`turn/identity/name-establishment.ts:42`) and builds a second fact source (`:45`).
- Desired behavior: pass the turn's shared fact source, and make the architecture test check the caller.
- User impact: none today (same result).
- Technical risk: very low.
- Files: `src/turn/stages/commit-preparation.ts`, `tests/architecture/narration-facts-consumers.architecture.test.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 8

#### PIPE-6 (P2)
- Current behavior: commit preparation establishes names, canonical knowledge, contracts and person offers from delivered text after the audit and outside `authorizeWithEvidence`, which is called once (`turn/stages/authorization.ts:124`).
- Desired behavior: document it as a lane, emit its decisions as authorization diagnostics, and consider one final audit over the whole batch.
- User impact: none directly; it is where identity and offer bugs hide (AUD-1 is in this lane).
- Technical risk: low for docs and diagnostics; medium for a final audit.
- Files: `src/turn/stages/commit-preparation.ts`, `docs/architecture/TURN_COORDINATOR.md`.
- Dependencies: AUD-1, AUD-2.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop at the final-audit step; it can reject turns that commit today).
- Order: 9

#### PIPE-7 (P2)
- Current behavior: commands are fixed from the draft; only committed arrivals get a templated sentence when the revision omits them (`turn/stages/audit.ts:110-112`).
- Desired behavior: every committed command that the delivered prose does not mention gets a deterministic note.
- User impact: state can change (an item moves, a condition is set) while the prose says nothing.
- Technical risk: medium; appended English sentences change the prose the player reads.
- Files: `src/turn/stages/audit.ts`.
- Dependencies: ARCH-2 residual (mention detection).
- Blockers: none.
- Human decision: wording and placement of the notes.
- Safety: SAFE WITH STOP CONDITIONS (stop if the golden pipeline output changes for turns whose prose already mentions the change).
- Order: 10

#### ARCH-2 residual: F evidence readers (P2, deferred)
- Current behavior: `turn/authorization/evidence-authorization.ts` and `turn/authorization/turn-evidence.ts` verify the Controller's cited evidence with their own verb lists (34 and 30 regex lines by grep).
- Desired behavior: these readers consume NarrationFacts like the narration side (blocks 9-11), in the order D17 sets.
- User impact: inconsistent acceptance of the same narrated act between features.
- Technical risk: medium; parity must be proven per slice.
- Files: the two files above, `src/turn/narration-facts/`.
- Dependencies: D17 ordering; unblocks H1 residuals, F5, I4, PIPE-7.
- Blockers: none.
- Human decision: none (D17 decided the strangler order).
- Safety: SAFE WITH STOP CONDITIONS (one slice at a time; stop on any golden or matrix-test change).
- Order: 11

#### IMG-2 (P2)
- Current behavior: image batches cannot be cancelled; `boundedFetch` maps any abort to `transient_provider_error` (`llm/image-generator.ts:90`), and shutdown waits for the batch (`app/game-session.ts:1325`).
- Desired behavior: a batch-level abort signal, a distinct `cancelled` outcome, abort on shutdown and a cancel endpoint.
- User impact: a slow batch keeps billing after the client gave up and delays quitting.
- Technical risk: medium; partial files must still be cleaned or committed.
- Files: `src/llm/image-generator.ts`, `src/llm/huggingface/fal-image-client.ts`, `src/app/game-session.ts`, `src/ui/server.ts`.
- Dependencies: PIPE-12.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if cancellation can leave a committed version without its file).
- Order: 12

#### PRV-1 (P2, PARTIAL)
- Current behavior: the narrator cap is 768 with one 1024-token recovery (`app/provider-config.ts:6`, `turn/coordinator/narrator-ledger.ts:18`); routing pins one provider with `allow_fallbacks: false` and no `require_parameters` (narrator adapter in `src/llm/openrouter/`, `:18-30`); an outage fails every turn.
- Desired behavior: count length finishes per model, decide on `require_parameters`, and offer a player-triggered retry with a backup narrator.
- User impact: a provider outage blocks play.
- Technical risk: medium; a backup narrator changes voice and cost.
- Files: `src/llm/openrouter/` narrator adapter, `src/app/provider-config.ts`, `src/app/production.ts`.
- Dependencies: PRV-6.
- Blockers: no live measurement in this plan.
- Human decision: backup narrator yes or no, and which.
- Safety: HUMAN DECISION REQUIRED
- Order: 13

#### PRV-2 (P2)
- Current behavior: production does not set `strict_output` (grep in `src/app`: 0), so normalized malformed Controller output is accepted (`llm/openrouter/state-controller.ts:35,69-72`).
- Desired behavior: telemetry on normalization and fallback use, then strict mode when the rate is low, and a separate timeout for the fallback.
- User impact: a malformed proposal can be normalized into an unintended one (authorization still applies).
- Technical risk: medium; strict mode may raise turn failures.
- Files: `src/llm/openrouter/state-controller.ts`, `src/app/production.ts`.
- Dependencies: telemetry.
- Blockers: no live data.
- Human decision: when to switch to strict.
- Safety: HUMAN DECISION REQUIRED
- Order: 14

#### PRV-3 (P3)
- Current behavior: `Retry-After` is captured (`llm/openrouter/client.ts:41-44`) and never read by the backoff (`llm/retry.ts`: 0 hits).
- Desired behavior: honour `Retry-After` within the remaining turn budget.
- User impact: rate-limited retries fire too early and fail again.
- Technical risk: low.
- Files: `src/llm/retry.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 15

#### REV-1 residual (P3)
- Current behavior: the "TRADE COMPLETED" narrator note shows while `revision - settlement.revision <= 2 + created items` (`turn/commerce/trade-notes.ts:36`).
- Desired behavior: key the note on the settlement revision plus a consumed flag.
- User impact: the note can vanish too early or linger, so the narrator may re-ask for payment.
- Technical risk: low; a consumed flag is persisted state (schema question).
- Files: `src/turn/commerce/trade-notes.ts`.
- Dependencies: PER-5 if a field is added.
- Blockers: none.
- Human decision: none if derived without a new field.
- Safety: SAFE WITH STOP CONDITIONS (stop if it needs a new persisted field).
- Order: 16

#### IMG-3 (P3)
- Current behavior: `boundedFetch` clears its timer in `finally` once headers resolve (`llm/image-generator.ts:93`), so body reads have no timeout.
- Desired behavior: keep the timer until the body is read.
- User impact: a stalled body read hangs a slot.
- Technical risk: low.
- Files: `src/llm/image-generator.ts`.
- Dependencies: IMG-2 (same function).
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 17

#### PRV-4 (P3)
- Current behavior: `OPENROUTER_REFLECTION_MODEL` is documented as accepting only the default (`app/production.ts:40`); any other value throws `configuration_error` in the adapter (`llm/openrouter/reflection-provider.ts:35-36`), which silently disables Reflection.
- Desired behavior: remove the variable or fail loudly at startup.
- User impact: setting the variable turns Reflection off without a message.
- Technical risk: low.
- Files: `src/llm/openrouter/reflection-provider.ts`, `src/app/production.ts`, `docs/CONFIGURATION.md`.
- Dependencies: none.
- Blockers: none.
- Human decision: remove vs fail loudly (minor).
- Safety: SAFE WITH STOP CONDITIONS (stop at the remove-vs-fail choice).
- Order: 20

#### PRV-5 (P3)
- Current behavior: the mannerism extractor has a single model and no fallback (`llm/openrouter/mannerism-extractor.ts:4-6`); failures skip extraction while bookkeeping continues.
- Desired behavior: stop queueing after N failures and expose extractor health.
- User impact: none visible; wasted calls during an outage.
- Technical risk: low (optional service).
- Files: `src/llm/openrouter/mannerism-extractor.ts`, `src/app/optional-services.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 21

#### PRV-6 (P3, PARTIAL)
- Current behavior: `OPENROUTER_NARRATOR_MODEL` overrides the narrator (`app/provider-config.ts:8`); models outside the routing table keep default routing (narrator adapter `:20`); documented only in `app/production.ts:36`.
- Desired behavior: document it in `docs/CONFIGURATION.md` or warn at startup.
- User impact: an override silently drops the provider pin.
- Technical risk: none.
- Files: `src/app/provider-config.ts`, `docs/CONFIGURATION.md`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 22

#### PRV-8 (P3)
- Current behavior: `docs/CONFIGURATION.md` does not mention timeouts, the `APIKEY.env` convention or the 120 s turn budget (grep: 0).
- Desired behavior: a timeouts section.
- User impact: operators cannot see the time limits.
- Technical risk: none.
- Files: `docs/CONFIGURATION.md`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 23

#### PRV-7 (P3) (with TEST-4, decision D8/D13)
- Current behavior: `llm/openrouter/image-client.ts` is used only by `tests/images/openrouter-image-client.test.ts` and historical scripts; production uses the fal client (`app/production.ts:26`); the V1 `openrouter/context-compressor.ts` and the embedding adapter `retrieval/voyage-embedding-provider.ts` are not wired in production; the narrator adapter's file name names a vendor model it does not run.
- Desired behavior: D8/D13 say remove the image client and park the rest; rename the narrator adapter.
- User impact: none; maintenance and confusion.
- Technical risk: low; tests must be repointed first (TEST-4).
- Files: the files above, `tests/images/`, `tests/retrieval/`.
- Dependencies: TEST-4 (another group).
- Blockers: confirmation to execute D8/D13.
- Human decision: execute D8/D13 now or later (A9 decision list).
- Safety: HUMAN DECISION REQUIRED
- Order: 24

#### PIPE-11 (P3)
- Current behavior: the retrieval trigger scans every entity each turn (`turn/context/retrieval-policy.ts:41,61`, `world.listEntities()`).
- Desired behavior: a precomputed name index per world.
- User impact: none at current canon size.
- Technical risk: low.
- Files: `src/turn/context/retrieval-policy.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 28

#### PIPE-12 (P3)
- Current behavior: turns, portraits and saves have no shared operation lock (`grep OperationLock`: 0); shutdown waits for a batch that cannot be cancelled (`app/game-session.ts:1325`).
- Desired behavior: one operation lock with a compatibility matrix and cancellation tokens.
- User impact: slow quit; occasional stale failures (REV-3).
- Technical risk: medium (concurrency in the session hotspot).
- Files: `src/app/game-session.ts`.
- Dependencies: IMG-2, REV-3.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if any existing session test needs to change its expected order of operations).
- Order: 29

#### CTX-5 (P3)
- Current behavior: one turn builds context from several states (`base`, `projected`, `prepared`), for example `commit-preparation.ts:71`, with no named contract (`grep TurnFrame`: 0).
- Desired behavior: a named turn frame with lazy single builds.
- User impact: none directly; it underlies PIPE-4 and CTX-3.
- Technical risk: medium (pipeline refactor).
- Files: `src/turn/coordinator/turn-coordinator.ts`, `src/turn/stages/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (only inside a feature block; stop on any golden change).
- Order: 30

#### CTX-6 (P3)
- Current behavior: foreground prioritization is spread over several modules (`grep FocusPlan`: 0; `turn/context/narrator-focus.ts`, `scene-state-focus.ts` and others).
- Desired behavior: one focus plan.
- User impact: none directly.
- Technical risk: medium.
- Files: `src/turn/context/`.
- Dependencies: CTX-5.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop on any golden change).
- Order: 31

#### CTX-7 (P3)
- Current behavior: the narrator masking gate is side-channel metadata (`turn/identity/narrator-identity.ts:25`, `WeakMap`), so a cloned context silently loses masking.
- Desired behavior: the gate is an explicit field of a narrator view.
- User impact: latent leak risk on a future refactor.
- Technical risk: medium (type changes across the context path).
- Files: `src/turn/identity/narrator-identity.ts`, `src/turn/context/context-builder.ts`.
- Dependencies: CTX-1.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if serialized context bytes change).
- Order: 32

#### NARR-1 residual (P3)
- Current behavior: a truncated narration gets one recovery with a larger cap (`turn/coordinator/narrator-ledger.ts:18`); a second truncation is a lost turn, by design (D16).
- Desired behavior: unchanged unless measurement shows a need.
- User impact: rare lost turn.
- Technical risk: low.
- Files: `src/turn/coordinator/narrator-ledger.ts`.
- Dependencies: PRV-1 telemetry.
- Blockers: no measurement.
- Human decision: required to change D16.
- Safety: HUMAN DECISION REQUIRED
- Order: 33

#### VOC-1 (P3)
- Current behavior: the narrator prompt key `established_at_promotion` names a materialization (`turn/context/prompt-builder.ts:230`); no tracked test contains the literal.
- Desired behavior: renamed only with a prompt-version change, if ever (Cleanup G).
- User impact: none.
- Technical risk: low in code; any prompt byte change can shift narrator behavior.
- Files: `src/turn/context/prompt-builder.ts`.
- Dependencies: a prompt-contract review.
- Blockers: none.
- Human decision: whether to rename at all.
- Safety: HUMAN DECISION REQUIRED
- Order: 34

#### ARCH-3 (P3)
- Current behavior: type-only import cycles remain, for example `app/optional-services.ts:1` imports a type from `game-session.ts`, which imports it back (`:49`), and `context-compaction.ts:4` with `context-budget.ts:3`; `game-session.ts` is 1,345 lines and `narration-audit.ts` 717. Runtime cycle count 0 was not re-derived.
- Desired behavior: move shared types to leaf type modules when a block touches them; split large modules only inside a feature block.
- User impact: none.
- Technical risk: low per cycle.
- Files: the modules above.
- Dependencies: feature blocks touching them.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (only opportunistically inside a feature block; not a standalone program).
- Order: 35

---

## Persistence


#### PER-1 (P2)
- Current behavior: a save over 16 MB throws `invalid_save` (`persistence/strict-json.ts:2`, `persistence/save-format.ts:229`); the save is pretty-printed (`:227-228`, indent 2); `invalid_save` is in `FATAL_SAVE` (`app/game-session.ts:159`), so autosave stops (`:274`) while play continues.
- Desired behavior: warn early, write compact JSON, prune closed offers (TRD-12), and turn "too big" into a visible, non-fatal state.
- User impact: a long campaign silently stops saving; progress after that point is lost on quit.
- Technical risk: low for compact JSON (readers parse either form); medium for the non-fatal path (the UI must show it).
- Files: `src/persistence/save-format.ts`, `src/persistence/strict-json.ts`, `src/app/game-session.ts`, `src/ui/client.js`.
- Dependencies: TRD-12; the user's economy and transaction-history roadmap adds more save weight.
- Blockers: none.
- Human decision: the warning threshold and banner wording.
- Safety: SAFE WITH STOP CONDITIONS (stop if any test or tool compares save bytes or depends on pretty output).
- Order: 1

#### TRD-12 (P2)
- Current behavior: `trade_offers` is capped at 5000 (`campaign/validation.ts:290`) and never pruned (`campaign/trade.ts:114` only appends); past the cap every prepare fails validation.
- Desired behavior: prune resolved offers into a compact record while keeping what the settlement trail needs.
- User impact: a campaign with heavy haggling eventually cannot commit any change.
- Technical risk: medium; accepted offers hold the only goods trail (`TradeSettlement`, `campaign/types.ts:145`), and offer ids are sequence-based.
- Files: `src/campaign/trade.ts`, `src/campaign/validation.ts`, `src/campaign/snapshot-validation.ts`.
- Dependencies: TRD-11 / D3 (goods ledger) for accepted offers; PER-1.
- Blockers: accepted offers cannot be pruned before TRD-11.
- Human decision: none for pruning invalidated or superseded offers only.
- Safety: SAFE WITH STOP CONDITIONS (never prune accepted offers; stop if id allocation or any reader depends on old offers).
- Order: 2

#### F7 / I12 (P2)
- Current behavior: a counteroffer reuses the planned id only when `origin_snapshot.ephemeral_ref` equals the current ref (`turn/commerce/person-offers.ts:337-339`); a changed ref plans a second identity for the same person.
- Desired behavior: one subject per negotiation whatever the ref drift, or a refused offer when continuity is unclear.
- User impact: a renegotiated captive can be planned as a new person, and supersession breaks.
- Technical risk: medium; the fix touches identity continuity.
- Files: `src/turn/commerce/person-offers.ts`, `src/campaign/trade.ts`.
- Dependencies: I1 / ID-4.
- Blockers: not reproduced; the register says "verify".
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if a reproduction test cannot make the ref change).
- Order: 3

#### I1 / ID-4 (P2)
- Current behavior: snapshot validation has no uniqueness rule on `ephemeral_ref` (`campaign/snapshot-validation.ts`: 0 hits); Keep track's idempotency checks only its own token (`turn/identity/keep-track.ts:51-52`).
- Desired behavior: a warn-level load-time check plus a dev diagnostic; never a hard rejection of existing saves.
- User impact: duplicate unnamed twins at one place go unnoticed.
- Technical risk: low as a warning; high as a validation error.
- Files: `src/campaign/snapshot-validation.ts`, `src/persistence/save-format.ts`, `src/dev/maintenance/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none for warn-only.
- Safety: SAFE WITH STOP CONDITIONS (stop if the check would need to reject a save).
- Order: 4

#### PER-4 (P2)
- Current behavior: two migration mechanisms: the `SAVE_MIGRATIONS` table (`persistence/save-migrations.ts:8`) and hard-coded snapshot steps 4 to 5 to 6 to 7 in the loader (`persistence/save-format.ts:10,166-168`); no fixture per old version (TEST-6).
- Desired behavior: one ordered chain keyed by snapshot version, real older-schema fixtures, and migrated sessions marked dirty once.
- User impact: none until the next migration, where a split chain makes mistakes likely.
- Technical risk: medium; migration output must stay identical.
- Files: `src/persistence/save-format.ts`, `src/persistence/save-migrations.ts`, `tests/fixtures/`.
- Dependencies: TEST-6 (another group); before the next schema bump (D6).
- Blockers: no real older-schema saves exist in `tests/fixtures/`.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (fixtures first; stop if any migrated output differs byte for byte).
- Order: 5

#### AUTH-8 (P3)
- Current behavior: one person sale is recorded in `transactions`, `legal_statuses[].transfer` and `trade_offers[].settlement`; validation checks transfer to transaction only (`campaign/snapshot-validation.ts:141`), and the offer checks (`:150-161`) do not tie an accepted person offer to a transaction.
- Desired behavior: an invariant that an accepted person offer has a matching transaction.
- User impact: none today; it protects the transaction-history roadmap item.
- Technical risk: low as a warning; medium as an error.
- Files: `src/campaign/snapshot-validation.ts`.
- Dependencies: TRD-11 / D3 for the goods side.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if any existing fixture violates it).
- Order: 6

#### AUTH-6 (P3)
- Current behavior: load-time canon reconciliation removes stale NPC locations and bumps the revision (`persistence/canon-compatibility.ts:95-104`); the load report has `revision_advanced`, but no ledger entry exists.
- Desired behavior: a test pinning that no other domain changes, and the change recorded in the load report.
- User impact: none visible.
- Technical risk: low.
- Files: `src/persistence/canon-compatibility.ts`, tests under `tests/persistence/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 7

#### PER-5 (P3, PARTIAL)
- Current behavior: optional fields are added without a schema bump, for example `trigger: "player_kept"` (`campaign/types.ts:49`); the strict parser rejects unknowns, so an older build reports `invalid_save`, not `unsupported_version` (`persistence/save-format.ts:157`).
- Desired behavior: a written rule: bump on any persisted addition, or a minimum engine version with unknown-field failures mapped to `unsupported_version`.
- User impact: opening a newer save in an older build can quarantine a good save.
- Technical risk: medium (version policy).
- Files: `src/persistence/save-format.ts`, `src/campaign/validation.ts`, `docs/architecture/`.
- Dependencies: PER-4.
- Blockers: none.
- Human decision: which policy.
- Safety: HUMAN DECISION REQUIRED
- Order: 8

#### PER-9 (P3)
- Current behavior: lock staleness is time-based (`persistence/campaign-repository.ts:94`, 90 s default); there is no `save_generation` (grep 0).
- Desired behavior: a monotonic generation in the save file checked before overwrite.
- User impact: a paused process can overwrite a newer save (rare, two instances).
- Technical risk: medium; a new persisted field means a schema change.
- Files: `src/persistence/campaign-repository.ts`, `src/persistence/save-format.ts`.
- Dependencies: PER-5, next schema bump.
- Blockers: schema policy.
- Human decision: bundle with the next schema bump.
- Safety: HUMAN DECISION REQUIRED
- Order: 9

#### NAME-1 (P3, decision D6)
- Current behavior: the NPC+ tier still uses the legacy name: save key `premium_characters` (`campaign/validation.ts:298`), `premium_reflections`, `PremiumCharacterState`, `premium-characters.ts`; about 390 tracked files mention "premium" (50 in `src/`).
- Desired behavior: symbols and key renamed together with the next schema bump and a both-keys migration.
- User impact: none; naming confusion only.
- Technical risk: medium (serialized key, frozen Reflection oracle imports `PremiumHistoryEntry`).
- Files: `src/campaign/`, `src/persistence/`, `tests/frozen/reflection/`.
- Dependencies: PER-4, PER-6.
- Blockers: next schema bump.
- Human decision: D6 timing (open in section 16).
- Safety: HUMAN DECISION REQUIRED
- Order: 10

#### PER-6 (P3)
- Current behavior: legacy serialized names and decode paths remain: `private_memory_refs` (`campaign/snapshot-validation.ts:198`), portrait `active_version_id` decode (`campaign/validation.ts:97-100`), `reference_used`, old save-file versions.
- Desired behavior: dropped in the next migration.
- User impact: none.
- Technical risk: medium (old saves must still load through the migration).
- Files: `src/campaign/validation.ts`, `src/campaign/snapshot-validation.ts`, `src/persistence/save-migrations.ts`.
- Dependencies: PER-4, NAME-1, IMG-10.
- Blockers: next schema bump.
- Human decision: D6 timing.
- Safety: HUMAN DECISION REQUIRED
- Order: 11

#### PER-3 (P3)
- Current behavior: derived state is still persisted: `empty_slots` (`campaign/validation.ts:74`), `active_household_member` (`:203`), `price_indices` (`:288`) and NPC+ history diffs.
- Desired behavior: computed on load with a recompute path, removed from the save at the next schema bump.
- User impact: larger saves; risk of derived values drifting from their source.
- Technical risk: medium.
- Files: `src/campaign/validation.ts`, `src/campaign/items.ts`, `src/campaign/premium-characters.ts`.
- Dependencies: PER-4, ITM-2.
- Blockers: next schema bump.
- Human decision: D6 timing.
- Safety: HUMAN DECISION REQUIRED
- Order: 12

#### I6 / ID-9 (P3)
- Current behavior: participant focus lives in memory (`turn/identity/scene-participants.ts:141-142`, `#focus`) while `conversation_partner_id` is persisted in continuity exchanges (`persistence/save-format.ts:32`).
- Desired behavior: document the split, or rebuild focus on load from the saved partner id.
- User impact: after reload the narrator may lose who the player was talking to.
- Technical risk: low.
- Files: `src/turn/identity/scene-participants.ts`, `src/persistence/save-format.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: document vs rebuild.
- Safety: SAFE WITH STOP CONDITIONS (stop if rebuilding needs a new persisted field).
- Order: 14

#### IMG-12 (P3)
- Current behavior: each character's gallery holds up to 64 versions (`campaign/portraits.ts:19`) with no global disk quota.
- Desired behavior: disk usage reporting and an optional global quota.
- User impact: disk use grows without a visible total.
- Technical risk: low.
- Files: `src/campaign/portraits.ts`, `src/app/game-session.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: quota value, if any.
- Safety: SAFE (reporting only).
- Order: 15

#### PER-7 (P3)
- Current behavior: soft delete moves campaigns to a `.deleted` root (`persistence/campaign-repository.ts:65,91`) with no purge, restore or retention.
- Desired behavior: a retention rule and a restore command.
- User impact: deleted campaigns pile up on disk and cannot be restored from the UI.
- Technical risk: medium; purge is irreversible.
- Files: `src/persistence/campaign-repository.ts`, `src/ui/server.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: retention policy and whether purge exists at all.
- Safety: HUMAN DECISION REQUIRED
- Order: 16

#### PER-8 (P3)
- Current behavior: save, transcript append and asset cleanup are separate steps; a failed transcript append is reported and retried (`app/game-session.ts:135`, `:1229-1231`), accepted by design because history is not authoritative.
- Desired behavior: unchanged; the residual gap documented.
- User impact: after a crash the transcript can lag the save.
- Technical risk: none.
- Files: `src/app/game-session.ts`, `docs/architecture/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE (documentation only).
- Order: 17

#### PER-2B (P3)
- Current behavior: unkept, unnamed scene participants are session-local (`turn/identity/scene-participants.ts`) and lost on reload; accepted in block 12.
- Desired behavior: unchanged; never persist unkept participants silently.
- User impact: "the guard" from before the reload is a new person afterwards.
- Technical risk: high if changed (silent persistence is what block 5B removed).
- Files: `src/turn/identity/scene-participants.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: required to revisit.
- Safety: HUMAN DECISION REQUIRED
- Order: 18

#### REV-2 residual (P3)
- Current behavior: turn receipts are bounded at 32 (`persistence/turn-receipts.ts:11`, `app/turn-receipts.ts:17`), so an old idempotency key falls off, by design.
- Desired behavior: unchanged.
- User impact: none in practice (a retry is immediate).
- Technical risk: none.
- Files: `src/persistence/turn-receipts.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none (by design).
- Safety: SAFE (no action proposed).
- Order: 19

---

## Items / economy


#### TRD-6 (P2)
- Current behavior: a goods line counts as "in the scene" if any one significant word of its name appears within 400 characters of the quote (`src/turn/commerce/trade-authorization.ts:101,104`); the category is first-match on name (`src/campaign/trade.ts:46,177`) and ignores the line's `category` (`src/campaign/types.ts:137`).
- Desired behavior: all significant words required; a controller category is honoured when valid, with the name resolver as fallback.
- User impact: an offer card can name goods the narration never offered, and bought items get the wrong category (and so the wrong equipment slot).
- Technical risk: low to medium; stricter matching may block offers that pass today.
- Files: `src/turn/commerce/trade-authorization.ts`, `src/campaign/trade.ts`, `tests/commerce/`.
- Dependencies: ITM-1 benefits from correct categories.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if the benchmark or the commerce corpus loses a passing offer).
- Order: 2

#### TRD-8 (P3)
- Current behavior: `WITHDRAWAL` matches "refuses", "no longer" and "put it away" anywhere (`src/turn/narration-facts/commerce-vocabulary.ts:23`).
- Desired behavior: withdrawal needs the subject or the price in the same sentence.
- User impact: an unrelated refusal can silently withdraw a standing offer.
- Technical risk: low.
- Files: `src/turn/narration-facts/commerce-vocabulary.ts`, `tests/commerce/commerce-narration-facts.test.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 5

#### TRD-13 (P3)
- Current behavior: `TransactionDiagnostic.kind` still has `"purchase"` (`src/turn/player-intent.ts:12`) and `ACCEPT` survives (`src/turn/commerce/transaction-acts.ts:4`), used by the historical replay (`src/dev/historical/historical-replay.ts:8`); `continuesTransaction` is used by `scene-participants.ts:6`.
- Desired behavior: no semantic-payment vocabulary that could be revived as authority; an import guard.
- User impact: none today.
- Technical risk: low; the historical replay still imports `isTransactionAct`.
- Files: `src/turn/player-intent.ts`, `src/turn/commerce/transaction-acts.ts`, `tests/architecture/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 6

#### ITM-3 (P2)
- Current behavior: `CampaignItem` has `owner_id` and `position` only (`src/campaign/types.ts:83-93`); custody exists only on the settlement (`types.ts:145`); there is no loan, custody or theft state, and `owner_id` may name a dead or absent character.
- Desired behavior: an explicit owner-versus-carrier model with custody states, as the first step of the user's roadmap (ownership, possession, item localization).
- User impact: lent or taken items cannot be tracked or reclaimed reliably.
- Technical risk: medium to high; a new persisted field and transfer rules.
- Files: `src/campaign/types.ts`, `src/campaign/items.ts`, `src/campaign/item-transfer.ts`, `src/campaign/validation.ts`, `src/campaign/snapshot-validation.ts`.
- Dependencies: first in the roadmap; ITM-4, ITM-5 and Property build on it.
- Blockers: needs a design (custody states) and a schema bump.
- Human decision: which custody states exist; whether to bundle with the next schema bump.
- Safety: SAFE WITH STOP CONDITIONS (design proposal first; stop before the schema bump).
- Order: 7

#### ITM-1 / UI-21 (P3)
- Current behavior: four fixed UI slots mapped by category (`src/app/inventory-ui-view.ts:12,17`); no `headwear`/`footwear` category exists (`src/campaign/types.ts:81`), so Head and Boots always show "Empty" (`src/ui/client.js:72`); domain slots are free ids (`src/campaign/validation.ts:76`).
- Desired behavior: a canonical slot enum in the domain, validated in `place`, rendered from `position.slot`, with the missing categories.
- User impact: the equipment panel looks broken for Head and Boots.
- Technical risk: medium; a category enum change touches validation and saved items.
- Files: `src/campaign/types.ts`, `src/campaign/items.ts`, `src/campaign/validation.ts`, `src/app/inventory-ui-view.ts`, `src/ui/client.js`.
- Dependencies: TRD-6 (category from the offer), ITM-6.
- Blockers: none for the UI label (UI-21); the enum needs a schema decision.
- Human decision: slot set (and whether a category enum change waits for a schema bump).
- Safety: SAFE WITH STOP CONDITIONS (UI labelling is safe; stop before changing persisted enums).
- Order: 8

#### ITM-6 (P3)
- Current behavior: there is no equip route (`src/ui/server.ts:113` route list); the authorizer rejects `place_item(equipped)` without evidence.
- Desired behavior: equip and unequip as a UI-confirmed engine action.
- User impact: purchased gear can never be worn.
- Technical risk: medium; a new authoritative player action.
- Files: `src/ui/server.ts`, `src/app/game-session.ts`, `src/campaign/items.ts`, `src/ui/client.js`.
- Dependencies: ITM-1 (slot enum), ITM-2.
- Blockers: ITM-1.
- Human decision: action class for equip (register D19 classes A/B/C).
- Safety: SAFE WITH STOP CONDITIONS (stop if it needs a new confirmation class).
- Order: 9

#### ITM-2 (P3)
- Current behavior: `empty_slots` is persisted (`src/campaign/validation.ts:74`) and mutated in `items.ts:18-25`, `characters.ts:87-93` and `trade.ts:197-200`; the player has no character record, so the trade path skips it.
- Desired behavior: the register says "compute, do not persist", but `set_slot_knowledge` makes it explicit knowledge (empty versus unknown, `projections.ts:40`); the real fix is a clear knowledge field, not removal.
- User impact: none visible today.
- Technical risk: medium; removal would lose slot knowledge.
- Files: `src/campaign/items.ts`, `src/campaign/characters.ts`, `src/campaign/projections.ts`, `src/campaign/trade.ts`.
- Dependencies: ITM-1, PER-3 (another group).
- Blockers: the premise needs restating.
- Human decision: keep slot knowledge as persisted state, or drop the "unknown" distinction.
- Safety: HUMAN DECISION REQUIRED
- Order: 10

#### ITM-4 (P2)
- Current behavior: no stable item key and no `quantity` (`src/campaign/types.ts:83-93`); buying "a loaf" twice makes two rows; duplicate prevention is by normalized name and position.
- Desired behavior: a stable item key and `quantity`.
- User impact: inventories fill with duplicate rows; name vetoes block unrelated items.
- Technical risk: high; schema change across items, trade and prompts.
- Files: `src/campaign/types.ts`, `src/campaign/items.ts`, `src/campaign/trade.ts`, `src/campaign/validation.ts`, `src/persistence/save-migrations.ts`.
- Dependencies: ITM-3; precedes merchant stock and ECO-4.
- Blockers: schema bump.
- Human decision: bundle with the next schema bump (with ECO-1, NAME-1, PER-6).
- Safety: SAFE WITH STOP CONDITIONS (stop before the migration is written).
- Order: 11

#### ITM-5 (P2)
- Current behavior: no stacks, weight, containers or `container_id` on items (`src/campaign/types.ts:83-93`); a bundle is N rows against the 8-line cap.
- Desired behavior: `quantity` first, `container_id` with the Property work.
- User impact: no containers for Heartstone property; bundles hit the line cap.
- Technical risk: high; schema and Property design.
- Files: as ITM-4, plus the future Property module.
- Dependencies: ITM-4, D5 (Property is gated on it), PER-3.
- Blockers: ITM-4, Property design.
- Human decision: container model as part of the Property design.
- Safety: HUMAN DECISION REQUIRED
- Order: 12

#### ECO-1 (P2)
- Current behavior: funds are integer gold (`src/campaign/types.ts:105`), minimum price 1 gold (`src/campaign/validation.ts:226`), while anchors are in silver (`config/economy.yaml:19-24`, 10 silver per gold at `:6`).
- Desired behavior: one settlement unit that can express everyday prices (bread is 1 silver).
- User impact: everyday purchases can never become offers.
- Technical risk: high; schema, price grammar, authorizers, UI and prompts all change; the register's "schema 7" is stale (snapshot is already 7, `types.ts:286`).
- Files: `src/campaign/types.ts`, `src/campaign/validation.ts`, `src/campaign/trade.ts`, `src/turn/commerce/trade-price.ts`, `src/economy/economy.ts`, `src/ui/client.js`, `src/persistence/save-migrations.ts`.
- Dependencies: blocks TRD-11, ECO-2, ECO-4.
- Blockers: D3.
- Human decision: D3 (integer silver internally with G/S display, or gold-only anchors).
- Safety: HUMAN DECISION REQUIRED
- Order: 13

#### TRD-11 (P2)
- Current behavior: only `PersonTransaction` exists (`src/campaign/types.ts:123`); goods BUY debits the player and credits nobody, and SELL credits the player without debiting a persistent buyer (`src/campaign/trade.ts:184-185,203-209`); the offer's `settlement` is the only trail.
- Desired behavior: a generic economy ledger with goods entries, or the settlement formally declared the trail (and DOC-12 fixed).
- User impact: no transaction history; money is not conserved between characters.
- Technical risk: medium to high; a new ledger type and schema change.
- Files: `src/campaign/types.ts`, `src/campaign/trade.ts`, `src/campaign/validation.ts`, `docs/architecture/ACTUAL_OFFER.md`.
- Dependencies: ECO-1, ITM-3; feeds the roadmap "economy / transaction history".
- Blockers: D3.
- Human decision: ledger shape after D3.
- Safety: HUMAN DECISION REQUIRED
- Order: 14

#### ECO-4 (P3)
- Current behavior: no funds ledger of causes (`grep funds_ledger src`: 0).
- Desired behavior: `funds_ledger` when rewards or upkeep arrive.
- User impact: none until income and costs exist.
- Technical risk: medium; schema.
- Files: `src/campaign/types.ts`, `src/campaign/validation.ts`.
- Dependencies: TRD-11, ECO-1.
- Blockers: D3.
- Human decision: none beyond D3.
- Safety: SAFE WITH STOP CONDITIONS (stop before the schema bump).
- Order: 16

#### ECO-2 (P3)
- Current behavior: `tradePrice` is any integer 1 to 1,000,000 (`src/campaign/validation.ts:226`), funds go to 1e9 (`:130`), and nothing compares prices with anchors.
- Desired behavior: an anchor sanity band as a diagnostic, not a block.
- User impact: absurd prices pass silently.
- Technical risk: low as a diagnostic.
- Files: `src/campaign/validation.ts`, `src/economy/economy.ts`, `src/turn/commerce/trade-authorization.ts`.
- Dependencies: ECO-1 (anchor unit).
- Blockers: D3 for the unit.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (diagnostic only; stop if it would reject offers).
- Order: 17

#### TRD-7 (P2, partial)
- Current behavior: one shared `AUCTION` regex (`src/turn/commerce/trade-price.ts:43`) used at `trade-authorization.ts:88` and `person-offers.ts:53`, plus a venue-name test (`trade-authorization.ts:62`); "bids?" is still in the regex and no `auction_house` canon flag exists.
- Desired behavior: a canon flag on auction venues plus scene state; the verb "bid" no longer blocks ordinary offers.
- User impact: offers can be blocked by the word "bid", and an auction venue without "auction" in its name is not recognised.
- Technical risk: low in code; it needs an authored canon edit.
- Files: `src/turn/commerce/trade-price.ts`, `src/turn/commerce/trade-authorization.ts`, `src/turn/commerce/person-offers.ts`, world data.
- Dependencies: none; the Auction House engine is a later roadmap item.
- Blockers: none.
- Human decision: which venues carry the flag (authored canon).
- Safety: SAFE WITH STOP CONDITIONS (stop before editing authored canon without approval).
- Order: 19

#### TRD-14 (P3)
- Current behavior: offers never expire (`grep expires` in `src/campaign/types.ts`, `trade.ts`: 0).
- Desired behavior: `expires_minute` once vendors exist.
- User impact: an old offer stays acceptable while the scene holds.
- Technical risk: low, but schema.
- Files: `src/campaign/types.ts`, `src/campaign/trade.ts`.
- Dependencies: vendor model (roadmap).
- Blockers: vendors do not exist.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (wait for vendors; stop before the schema change).
- Order: 20

#### TRD-9 (P2, deferred semantic)
- Current behavior: the person subject is picked by sex nouns or pronouns in the request (`src/turn/commerce/person-offers.ts:140-146`); two same-sex captives by pronoun can pick the wrong one, otherwise it fails closed.
- Desired behavior: golden tests for two captives; a unique descriptor on the card.
- User impact: a rare wrong subject on the offer card (the card shows who it is before Accept).
- Technical risk: medium; another semantic grammar.
- Files: `src/turn/commerce/person-offers.ts`, `tests/commerce/`.
- Dependencies: NarrationFacts follow-up (ARCH-2 residual, another group).
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (tests first; stop if the fix adds a new grammar).
- Order: 21

---

## NPC lifecycle / simulation


#### NPC-7 (P3)
- Current behavior: the header comment says "Household membership is the ONLY trigger" for NPC+ (`src/campaign/premium-characters.ts:10-13`), while the rite comment below says a character is NPC+ "permanently" from the rite (`:40-46`, `isNpcPlus` at `:44`).
- Desired behavior: the comment matches the explicit-promotion model.
- User impact: none.
- Technical risk: none.
- Files: `src/campaign/premium-characters.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 1

#### NPC-6 (P3)
- Current behavior: `completeHeartstoneRite` catches every commit error as `campaign_validation_failed` with no logging (`src/app/game-session.ts:421`).
- Desired behavior: the cause goes to a diagnostic sink; the player message stays the same.
- User impact: a failed rite cannot be diagnosed.
- Technical risk: low; `game-session.ts` has a `portrait_log` dep (`:753`) but no general sink, so a small dep is needed.
- Files: `src/app/game-session.ts`, `src/app/production.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 2

#### NPC-1 / NPC-2 (P2)
- Current behavior: `isNpcPlus` is true for any premium record (`src/campaign/premium-characters.ts:44-45`), so a former member gets `already_npc_plus` from the rite (`src/campaign/heartstone-rite.ts:38`); the domain rejoin exists (`premium-characters.ts:146,195`) but no production path reaches it; behaviour is gated by `active_household_member` (`:35`), read in about 20 places, and no "inactive" badge exists in the UI.
- Desired behavior: per the D4 direction, inactive NPC+ plus rejoin through the same UI action plus a badge.
- User impact: an NPC+ who leaves can never come back, and the player cannot see that behaviour is off.
- Technical risk: low for rejoin (one branch in eligibility and the UI); medium if "active outside the household" is chosen (about 20 sites).
- Files: `src/campaign/heartstone-rite.ts`, `src/campaign/premium-characters.ts`, `src/app/game-session.ts`, `src/app/player-character-view.ts`, `src/ui/client.js`.
- Dependencies: NPC-4.
- Blockers: D4 not confirmed.
- Human decision: D4.
- Safety: HUMAN DECISION REQUIRED
- Order: 3

#### NPC-4 (P3)
- Current behavior: `leave_household` from the keeper's household stays evidence-based (`src/turn/authorization/command-authorizer.ts:89-99`; only joins into the keeper's household are refused, `:98`), so a narrated "I leave" deactivates NPC+ behaviour without a player action.
- Desired behavior: document it, or require a player confirmation, consistent with the rite.
- User impact: an NPC+ can drop out of the household on prose alone.
- Technical risk: low to medium.
- Files: `src/turn/authorization/command-authorizer.ts`, `src/app/confirmations` area, `docs/architecture/`.
- Dependencies: NPC-1 / NPC-2 (D4).
- Blockers: D4.
- Human decision: whether leaving needs a confirmation (D19 class).
- Safety: HUMAN DECISION REQUIRED
- Order: 4

#### NPC-5 (P3)
- Current behavior: the rite checks no legal status, consent or relationship (`src/campaign/heartstone-rite.ts:34-47`), by design.
- Desired behavior: a canon or architecture note states this.
- User impact: none; clarity only.
- Technical risk: none.
- Files: `docs/architecture/` or the canon docs for the Heartstone rite.
- Dependencies: none.
- Blockers: none.
- Human decision: wording of a canon note.
- Safety: SAFE WITH STOP CONDITIONS (documentation only; stop before editing authored canon).
- Order: 6

## UI / UX


#### UI-1 (P2)
- Current behavior: the character drawer's Tab trap cycles only close and two tabs (`src/ui/client.js:683-689`); Promote, Edit NPC+, Generate and portrait controls are unreachable by keyboard.
- Desired behavior: compute focusable controls at keydown (as the lightbox does, `client.js:490`) or make the page behind `inert`.
- User impact: keyboard users cannot promote or manage portraits.
- Technical risk: low.
- Files: `src/ui/client.js`, `tests/ui/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 1

#### UI-2 (P2)
- Current behavior: "Accept offer" is a plain button (`src/ui/client.js:837`) with no confirm; `trade-buy`/`trade-sell` have no CSS (`src/ui/style.css`, grep 0).
- Desired behavior: one visual rule for "commits authoritative state" (filled, price in label, BUY/SELL colours, inline confirm for person purchases), documented in `docs/UI.md`.
- User impact: an irreversible spend (possibly of a person) looks ordinary.
- Technical risk: low; an extra confirm step changes browser checks.
- Files: `src/ui/client.js`, `src/ui/style.css`, `docs/UI.md`, `scripts/browser/actual-offer-browser-check.mjs`.
- Dependencies: UI-3 shares the visual rule.
- Blockers: none.
- Human decision: whether person purchases get an inline confirm.
- Safety: SAFE WITH STOP CONDITIONS (stop if the confirm step changes the accept route contract).
- Order: 2

#### UI-17 (P2)
- Current behavior: unknown identity is decided by client string compares (`src/ui/client.js:795`); the server fabricates "Unfamiliar household member" (`src/app/session-view.ts:89`) and the category can be "Met this campaign · name unknown" (`src/app/player-character-view.ts:230`).
- Desired behavior: one server boolean and a server-built `initial`; the legacy label removed.
- User impact: inconsistent "unknown person" display.
- Technical risk: low to medium; view contract change.
- Files: `src/app/session-view.ts`, `src/app/player-character-view.ts`, `src/ui/client.js`, `docs/UI_ENGINE_CONTRACT.md`.
- Dependencies: ID-3 / ID-6 (identity read model, another group).
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if a masking test changes).
- Order: 3

#### UI-5 (P2)
- Current behavior: `/location` with a stale revision returns `stale_turn` (`src/app/game-session.ts:379`), shown as "The turn was discarded" (`src/app/app-errors.ts:28`); the client never reads `candidates` (grep 0 in `client.js`).
- Desired behavior: a location-specific message and the candidate list shown.
- User impact: misleading error; ambiguous destinations cannot be resolved.
- Technical risk: low.
- Files: `src/app/game-session.ts`, `src/app/app-errors.ts`, `src/ui/client.js`.
- Dependencies: AUTH-7 (another group) if the route is gated.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 4

#### UI-15 (P3)
- Current behavior: the pending "Thinking / Narrating" bubble is created inside `#conversation`, which is `role="log" aria-live="polite"` (`src/ui/index.html:25`, `client.js:1089`).
- Desired behavior: the pending status lives outside the live region.
- User impact: screen readers announce transient status text.
- Technical risk: low.
- Files: `src/ui/index.html`, `src/ui/client.js`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 5

#### UI-3 (P3)
- Current behavior: Promote is a bare up-arrow glyph (`src/ui/index.html:83`, `&uarr;`), weaker than "Edit NPC+".
- Desired behavior: a text button "Promote to NPC+" with a rite subline.
- User impact: the most consequential NPC action is hard to find.
- Technical risk: low.
- Files: `src/ui/index.html`, `src/ui/client.js`, `src/ui/style.css`.
- Dependencies: UI-2 (shared visual rule).
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 6

#### UI-24 (P3)
- Current behavior: developer copy in the player UI ("Check that npm run play:ui is running", `src/ui/client.js:1058`); save failures appear only in the composer error.
- Desired behavior: player-facing copy and a visible save-failure state.
- User impact: confusing messages.
- Technical risk: low.
- Files: `src/ui/client.js`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 7

#### UI-6 / REV-3 (P3, partial)
- Current behavior: the editor captures `editorRevision` on open (`src/ui/client.js:221`) and sends it with every portrait action (`:239,449`); the bootstrap-avatar commit (`src/app/game-session.ts:799`) can move the revision; the turn guard checks status, not `#portraitBusy` (`:982`). Item sprite commits are described as not changing the semantic revision (`src/app/item-sprite-jobs.ts:18`, inferred).
- Desired behavior: portrait actions use the current revision and retry once after an intermediate commit, without losing typed edits.
- User impact: Save or Generate can fail after a background commit and lose edits.
- Technical risk: low to medium.
- Files: `src/ui/client.js`, `src/app/game-session.ts`.
- Dependencies: IMG-2.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if the revision guard on the server would be weakened).
- Order: 9

#### UI-22 (P2)
- Current behavior: receipts are a client array (`src/ui/client.js:808,816,861`), the last three re-appended under the newest message (`:818`), and lost on reload.
- Desired behavior: a persistent server transcript entry at the point of the deal.
- User impact: receipts drift down the chat and vanish after reload.
- Technical risk: medium; transcript format change.
- Files: `src/ui/client.js`, `src/app/game-session.ts`, `src/app/trade-offer-view.ts`, transcript persistence.
- Dependencies: TRD-11 (transaction history) helps.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop before a save-format change).
- Order: 10

#### UI-4 (P2)
- Current behavior: 1 s polling during a turn (`src/ui/client.js:1036`), 4 s save poll forever (`:1182`) and a 4 s inventory poll (`:137`); no `document.hidden` check (grep 0); `/api/session` returns the whole transcript; the DOM never trims.
- Desired behavior: `after=<n>` paging, pause when hidden, collapse old exchanges, skip unchanged rebuilds.
- User impact: long campaigns get slow; background tabs keep polling.
- Technical risk: medium; API contract change.
- Files: `src/ui/client.js`, `src/ui/server.ts`, `src/app/game-session.ts`.
- Dependencies: PIPE-4 (another group; `getView()` cost).
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if the session view contract changes for other callers).
- Order: 11

#### UI-7 (P3)
- Current behavior: sidebar and household lists are unbounded (no "+N more", grep 0).
- Desired behavior: about 8 rows with "+N more".
- User impact: cluttered sidebar with 20+ characters.
- Technical risk: low.
- Files: `src/ui/client.js`, `src/ui/style.css`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 12

#### UI-8 (P3)
- Current behavior: partly fixed: `#character-name` wraps (`src/ui/style.css:356-358`), but `.scene-participant` (`:198-204`) and `.household-member` (`:236`) lack `min-width:0` / `overflow-wrap:anywhere`.
- Desired behavior: long names wrap everywhere.
- User impact: layout overflow with long names.
- Technical risk: low.
- Files: `src/ui/style.css`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 13

#### UI-20 (P3)
- Current behavior: `renderInventory` rebuilds the grid on every keystroke and poll (`src/ui/client.js:96`).
- Desired behavior: debounce and key nodes by item id.
- User impact: slow inventory beyond about 200 items.
- Technical risk: low.
- Files: `src/ui/client.js`.
- Dependencies: ITM-4 (fewer duplicate rows).
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 14

#### UI-9 (P3)
- Current behavior: `#location-id` shows the raw internal id (`src/ui/client.js:756`).
- Desired behavior: a player-facing location name.
- User impact: an internal id is visible; Weather UI needs this header.
- Technical risk: low; must respect knowledge visibility.
- Files: `src/ui/client.js`, `src/app/session-view.ts`.
- Dependencies: Weather UI (T-WEATHER).
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 15

#### UI-10 (P3)
- Current behavior: gold is a bare integer (`src/ui/client.js:757`).
- Desired behavior: formatted with the unit.
- User impact: minor.
- Technical risk: low.
- Files: `src/ui/client.js`.
- Dependencies: ECO-1 (G/S display).
- Blockers: none for formatting.
- Human decision: none.
- Safety: SAFE
- Order: 16

#### UI-14 (P3)
- Current behavior: player `*action*` and speech share one colour (`src/ui/style.css:129-130`); not re-verified in depth.
- Desired behavior: narration and dialogue colours inside `.player`.
- User impact: minor readability.
- Technical risk: low.
- Files: `src/ui/style.css`, `src/ui/client.js`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 17

#### UI-11 (P3)
- Current behavior: disabled World and Debug nav buttons and Personality/Relations tabs take header width (`src/ui/index.html:9`).
- Desired behavior: hidden until built.
- User impact: header clutter, especially on mobile.
- Technical risk: low.
- Files: `src/ui/index.html`, `src/ui/client.js`.
- Dependencies: UI-28.
- Blockers: none.
- Human decision: whether placeholders should stay visible as a roadmap hint.
- Safety: SAFE
- Order: 18

#### UI-28 (P2)
- Current behavior: at 720 px or less there are two scroll contexts (`.story{height:75dvh}`, `src/ui/style.css:425`), the campaign screen overlaps the header (`inset:58px`, `:569`) and the editor stacks many fields; static review only.
- Desired behavior: bottom tab bar, scene bottom sheet, prompts in `<details>`.
- User impact: cramped or broken mobile play.
- Technical risk: medium; broad CSS change, needs a real browser.
- Files: `src/ui/style.css`, `src/ui/index.html`, `src/ui/client.js`.
- Dependencies: UI-11, UI-7, REPO-14 (Playwright for checks).
- Blockers: none.
- Human decision: mobile layout direction.
- Safety: SAFE WITH STOP CONDITIONS (stop if browser checks cannot run).
- Order: 19

#### UI-23 (P3)
- Current behavior: no reason shown when Accept is disabled (no `aria-describedby`, grep 0); `.trade-label` is `.7rem` at `opacity:.7` (`src/ui/style.css:598`), likely under 4.5:1 (static).
- Desired behavior: a described reason and sufficient contrast.
- User impact: confusing disabled state; low contrast.
- Technical risk: low.
- Files: `src/ui/client.js`, `src/ui/style.css`.
- Dependencies: UI-29 (`accept_blocked_reason`).
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 20

#### UI-25 (P3)
- Current behavior: the campaign delete confirm reads "Delete this campaign and its saves?" with "Confirm delete" (`src/ui/client.js:1241-1245`), while the repository soft-deletes (PER-7).
- Desired behavior: a distinct destructive style and wording that matches soft delete.
- User impact: unclear what delete does.
- Technical risk: low.
- Files: `src/ui/client.js`, `src/ui/style.css`.
- Dependencies: PER-7 (another group).
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 21

#### UI-26 (P3)
- Current behavior: `switchView("play")` always focuses `#household-nav` (`src/ui/client.js:48`); drawer tabs have no arrow keys; the page behind the drawer is not `inert`; the save button is an emoji; small text sizes.
- Desired behavior: focus restoration, roving tabindex, `inert`, text labels.
- User impact: accessibility.
- Technical risk: low.
- Files: `src/ui/client.js`, `src/ui/index.html`, `src/ui/style.css`.
- Dependencies: UI-1.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 22

#### UI-27 (P3)
- Current behavior: the composer hint says "/ for commands" (`src/ui/index.html:30`) but only `/location` exists.
- Desired behavior: accurate hint.
- User impact: minor confusion.
- Technical risk: none.
- Files: `src/ui/index.html`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 23

#### UI-16 (P3)
- Current behavior: "Regenerate with…" appears under every narrator message (`src/ui/client.js:987`), spends credits and shows a raw `failure_code` (`:1007`).
- Desired behavior: behind a Debug toggle, documented, with player copy.
- User impact: accidental spend; raw codes.
- Technical risk: low.
- Files: `src/ui/client.js`, `docs/UI.md`.
- Dependencies: none.
- Blockers: none.
- Human decision: whether alternatives stay player-visible.
- Safety: SAFE WITH STOP CONDITIONS (stop if hiding it removes a feature the user relies on).
- Order: 24

#### UI-18 (P3)
- Current behavior: the player editor heading is upper-cased, NPC headings are not (`src/ui/client.js:207`).
- Desired behavior: one style.
- User impact: cosmetic.
- Technical risk: none.
- Files: `src/ui/client.js`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 25

#### UI-19 (P3)
- Current behavior: "Edit NPC+" (`src/ui/client.js:628`) and "Generate" both just open the editor.
- Desired behavior: one "Portrait editor" label.
- User impact: misleading labels.
- Technical risk: none.
- Files: `src/ui/client.js`.
- Dependencies: UI-3.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 26

#### UI-12 (P3)
- Current behavior: dead CSS `.top-bar nav button:last-child` (`src/ui/style.css:95`) and a bare `article{` rule (`:113`) that hits every article.
- Desired behavior: removed or scoped.
- User impact: none visible.
- Technical risk: low.
- Files: `src/ui/style.css`.
- Dependencies: UI-13.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 27

#### UI-13 (P3)
- Current behavior: `var(--panel, …)` and `var(--danger, …)` are used four times but never defined; three CSS dialects; hard-coded colours.
- Desired behavior: defined tokens, one dialect.
- User impact: none visible (fallbacks apply).
- Technical risk: low.
- Files: `src/ui/style.css`.
- Dependencies: UI-12.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 28

#### UI-29 (P3)
- Current behavior: the client duplicates server logic: `NUMBER_RANGES` (`src/ui/client.js:163`) and `dayLabel` (`:1197`) beside the server `date_text` (`:753`).
- Desired behavior: the server exposes field ranges, `status_label`, `accept_blocked_reason`, `delete_blocked_reason`.
- User impact: drift between client and server rules.
- Technical risk: low to medium; view contract change.
- Files: `src/ui/client.js`, `src/app/session-view.ts`, `src/app/player-character-view.ts`.
- Dependencies: UI-23.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 29

#### UI-31 (P3)
- Current behavior: the portrait progress stage is computed from `Date.now()` on a 1000 ms `setTimeout` chain (`src/ui/client.js:298-307`) and can lag one second.
- Desired behavior: stage from `max(elapsed, ticks * 1000)`.
- User impact: cosmetic.
- Technical risk: none.
- Files: `src/ui/client.js`.
- Dependencies: IMG-4 would replace it.
- Blockers: user decision: stays open, no patch now.
- Human decision: already taken (deferred to UI polish).
- Safety: SAFE WITH STOP CONDITIONS (only inside a UI polish block the user opens).
- Order: 30

#### IMG-4 (P3)
- Current behavior: progress is a timer: the stage is a function of elapsed time (`src/ui/client.js:298-300`), not of real slot events.
- Desired behavior: real per-slot progress events.
- User impact: progress text is not truthful.
- Technical risk: medium; needs a streaming or polling channel.
- Files: `src/ui/client.js`, `src/ui/server.ts`, `src/app/game-session.ts`.
- Dependencies: IMG-2.
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop if it needs a new transport).
- Order: 31

#### IMG-9 (P3)
- Current behavior: one shared `calls >= 2 * PORTRAIT_BATCH_SIZE` counter (`src/app/game-session.ts:748`) can misreport a slot's failure reason.
- Desired behavior: per-slot cap plus batch cap.
- User impact: misleading failure text.
- Technical risk: low.
- Files: `src/app/game-session.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 33

#### IMG-6 (P3, partial)
- Current behavior: item sprites have no concurrency cap, session ceiling or cost record (`src/app/item-sprite-jobs.ts`, grep `max|limit|concurr`: 0); QA is off by default.
- Desired behavior: concurrency cap, per-session ceiling, smaller size, recorded cost.
- User impact: uncontrolled image spend in item-heavy scenes.
- Technical risk: low.
- Files: `src/app/item-sprite-jobs.ts`, `src/app/image-stack.ts`.
- Dependencies: IMG-7.
- Blockers: none.
- Human decision: the ceiling values.
- Safety: SAFE WITH STOP CONDITIONS (stop at choosing numeric budgets).
- Order: 34

#### IMG-7 (P3)
- Current behavior: cost is recorded only on successful versions (`cost_usd`, `src/campaign/validation.ts:90`); no `image_calls` ledger (grep 0) and no totals.
- Desired behavior: an `image_calls` ledger and running totals, in a side store.
- User impact: real spend is invisible.
- Technical risk: low to medium; side-store schema.
- Files: `src/app/game-session.ts`, `src/app/item-sprite-jobs.ts`, optional side stores.
- Dependencies: D20 (side stores, not `CampaignState`).
- Blockers: none.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (stop before touching `CampaignState`).
- Order: 35

#### IMG-5 / REPO-7 (P3)
- Current behavior: generated images are served `no-store` and canon avatars `no-cache` (`src/ui/server.ts:56,104`); `data/canonNPCAvatar` is 14 MB and `city_map/` 4 MB; no thumbnails.
- Desired behavior: thumbnails at stage time, immutable cache headers for content-addressed tokens, optionally re-encoded canon avatars with the same filenames.
- User impact: slow gallery and sidebar loads.
- Technical risk: low for headers; re-encoding replaces authored binaries.
- Files: `src/ui/server.ts`, `src/app/portrait-store.ts`, `data/canonNPCAvatar/`, `city_map/`.
- Dependencies: none.
- Blockers: none.
- Human decision: whether to re-encode canon avatars and the map (REPO-13's "no re-encode" decision covers only the archive).
- Safety: SAFE WITH STOP CONDITIONS (headers and thumbnails are safe; stop before replacing authored images).
- Order: 36

#### IMG-8 (P3)
- Current behavior: raw `height_cm` and `weight_kg` go into the portrait prompt (`src/campaign/portrait-prompt.ts:105`); narrative and visual text are mixed.
- Desired behavior: a `visual_description` field; descriptors instead of numbers.
- User impact: weaker portraits.
- Technical risk: medium; prompt change needs live image checks.
- Files: `src/campaign/portrait-prompt.ts`, `src/campaign/types.ts`.
- Dependencies: none.
- Blockers: no live image generation in autonomous work.
- Human decision: none.
- Safety: SAFE WITH STOP CONDITIONS (offline prompt tests only; stop before live generation).
- Order: 37

#### IMG-11 (P3)
- Current behavior: the adapter weights URL and router are pinned in source (`src/app/image-stack.ts:6,18`).
- Desired behavior: moved to `config/`.
- User impact: none.
- Technical risk: low.
- Files: `src/app/image-stack.ts`, `config/`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 38

#### IMG-10 (P3)
- Current behavior: the UI no longer offers an upload (only "Remove reference" and a "deferred" note in `src/ui/index.html`); the server route `/api/portrait/reference` still accepts uploads (`src/ui/server.ts:13,116`), generation never sends the image (`src/app/game-session.ts:706,899-902`), and `reference_used` stays in the schema (`src/campaign/types.ts:316`).
- Desired behavior: per D9, either remove the upload half of the route and field, or build reference conditioning.
- User impact: none today.
- Technical risk: low for removal; the stored field must stay decodable.
- Files: `src/ui/server.ts`, `src/app/game-session.ts`, `src/campaign/types.ts`, `src/llm/image-generator.ts`.
- Dependencies: PRV-7 / TEST-4 (image client), real avatar upload decision.
- Blockers: D9.
- Human decision: D9.
- Safety: HUMAN DECISION REQUIRED
- Order: 40

#### MOV-6 (P3)
- Current behavior: `multiple_travel_acts` is produced (`src/turn/movement/player-travel.ts:60`) but no view or client consumes it.
- Desired behavior: the player sees why a multi-destination message did not move.
- User impact: silent no-move.
- Technical risk: low.
- Files: `src/turn/movement/player-travel.ts`, `src/app/session-view.ts`, `src/ui/client.js`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 41

## Testing / CI


#### CI-1 (P2)
- Current behavior: no `.github/`, no lint, formatter or coverage config; `check:architecture` and `check:docs` exist in `package.json` but nothing runs them automatically.
- Desired behavior: CI running `npm ci`, typecheck, build, test, `check:architecture` and `check:docs`; lint and format only if wanted.
- User impact: regressions are caught only when someone runs the suite.
- Technical risk: low; CI must never call providers.
- Files: `.github/workflows/` (new), `package.json`.
- Dependencies: TEST-5 (real sleeps on shared runners), TEST-8.
- Blockers: none.
- Human decision: CI host, and whether lint/format/coverage are wanted.
- Safety: SAFE WITH STOP CONDITIONS (stop before adding lint/format or a hosted service).
- Order: 1

#### TEST-5 (P3)
- Current behavior: real waits at `tests/persistence/save-format-and-assets.test.ts:187` (80 ms) and `tests/session/application-smoke.integration.test.ts:166,238` (20 ms).
- Desired behavior: fake timers or injected clocks.
- User impact: none; possible flakes in CI.
- Technical risk: low.
- Files: those two test files.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 2

#### TEST-8 (P3)
- Current behavior: test timing is not measured; the "no deps" premise is obsolete (`node_modules/` exists).
- Desired behavior: a measured baseline per suite.
- User impact: none.
- Technical risk: none.
- Files: `docs/TESTING.md`.
- Dependencies: CI-1.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 3

#### TEST-6 (P2, partial)
- Current behavior: a double-accept regression exists (`tests/commerce/person-offer-playthrough.regression.test.ts`) but `tests/fixtures/` has no real older-schema saves; true concurrent accept, accept after loading an older autosave, malformed POST bodies, property tests and a performance guard are missing.
- Desired behavior: those cases, mostly as modern benchmark scenarios (`tests/benchmark/scenarios.ts`).
- User impact: save and trade regressions could ship.
- Technical risk: low; real older saves must be generated from history, not hand-made.
- Files: `tests/benchmark/`, `tests/persistence/`, `tests/commerce/`, `tests/fixtures/`.
- Dependencies: PER-4 (another group) for older-schema fixtures.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 4

#### TEST-2 (P3)
- Current behavior: tests outside `tests/architecture/` read `src/` text (A9 cites 17; a loose grep finds about 23 files including `tests/support/import-graph.ts`, not re-derived exactly).
- Desired behavior: behavioural schema tests, or source pins moved into `tests/architecture/`.
- User impact: none; brittle tests.
- Technical risk: low.
- Files: e.g. `tests/images/canon-avatars.test.ts`, `tests/providers/narrator-alternatives.test.ts`.
- Dependencies: none.
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 5

#### TEST-7 (P3)
- Current behavior: no recorded-provider replay layer; real `createProductionDeps`, prompt wording and provider JSON are covered only by fake `fetch` and manual live scripts.
- Desired behavior: a recorded replay layer (L2 of the benchmark), keyed by request hash.
- User impact: provider-format regressions are found late.
- Technical risk: medium; recording needs live calls, which autonomous work may not make.
- Files: `tests/benchmark/`, `src/dev/live/`.
- Dependencies: the modern benchmark (exists).
- Blockers: recording requires live provider runs.
- Human decision: approval for a live recording run.
- Safety: SAFE WITH STOP CONDITIONS (build the replay offline; stop before any live call).
- Order: 6

#### TEST-4 (P3, partial)
- Current behavior: tests still pin obsolete integrations: `tests/images/openrouter-image-client.test.ts`, `tests/retrieval/voyage-embedding-provider.test.ts`, `tests/tooling/{compaction,narrator,controller}-bakeoff*.test.ts`.
- Desired behavior: archived or removed with the code they pin.
- User impact: none.
- Technical risk: low.
- Files: those tests.
- Dependencies: PRV-7 (another group).
- Blockers: D8/D13 execution not approved.
- Human decision: execute D8/D13 now (remove the image client, park Voyage).
- Safety: HUMAN DECISION REQUIRED
- Order: 7

---

## Repository / archive (low priority)

REPO-7 is merged into IMG-5 / REPO-7 (UI / UX group).

#### REPO-14 (P3)
- Current behavior: `scripts/evaluation/casting-trace.mjs:76` reads `identity?.promoted`, a field that no longer exists; `scripts/historical/audit-player-travel-authority.mjs` is stale and unowned; milestone-named scripts remain (`scripts/minor-debt-cycle-check.mjs`, `scripts/browser/block5b|6|7-browser-check.mjs`); Playwright is loaded by `scripts/lib/browser-env.mjs:32` but is not a devDependency (`package.json`); `TEST_HISTORICAL_ALLOWED` has 14 entries (`tests/architecture/dev-tooling-boundaries.architecture.test.ts:61`), not 17.
- Desired behavior: one small tooling pass: fix or drop the dead trace field, rename the scripts by behaviour, declare or document Playwright.
- User impact: none.
- Technical risk: low; renames touch `package.json` and docs.
- Files: as listed, plus `docs/TESTING.md`.
- Dependencies: CI-1 (browser runner).
- Blockers: none.
- Human decision: whether to add Playwright as a devDependency (download size) or only document it.
- Safety: SAFE WITH STOP CONDITIONS (stop before changing dependencies).
- Order: 1

#### DOC-12 (P3, partial)
- Current behavior: `docs/architecture/ACTUAL_OFFER.md:18,31,49` say settlement records a transaction for goods, while `:80` says no goods `transactions` row exists; the code writes none (`src/campaign/trade.ts:184-185`).
- Desired behavior: the doc states the current truth (the settlement is the goods trail) until TRD-11 lands.
- User impact: misleading architecture doc.
- Technical risk: none.
- Files: `docs/architecture/ACTUAL_OFFER.md`.
- Dependencies: TRD-11 (related, not blocking).
- Blockers: none.
- Human decision: none.
- Safety: SAFE
- Order: 2

#### REPO-8 (P3)
- Current behavior: 13 named symbols have exactly one occurrence, their definition (for example `resolveMovement`, `describeDate`, `TradeBlock`; `git grep -w` over src, tests, scripts); `tsconfig.json` has no `noUnusedLocals`.
- Desired behavior: delete after checking docs; optionally enable `noUnusedLocals`.
- User impact: none.
- Technical risk: low; enabling the flag may surface many errors at once.
- Files: the defining modules, `tsconfig.json`.
- Dependencies: none.
- Blockers: none.
- Human decision: whether to enable `noUnusedLocals`.
- Safety: SAFE WITH STOP CONDITIONS (deletion is safe; stop before changing `tsconfig.json`).
- Order: 3

#### DOC-15 residual (P3)
- Current behavior: `scripts/check-doc-links.mjs` checks links only; no staleness logic (grep `stale|count`: 0).
- Desired behavior: a tripwire for stale counts and dates in the current docs.
- User impact: none; docs drift (A9 found several stale counts).
- Technical risk: low; a noisy check would be ignored.
- Files: `scripts/check-doc-links.mjs`, `docs/`.
- Dependencies: CI-1.
- Blockers: none.
- Human decision: what counts as stale.
- Safety: SAFE WITH STOP CONDITIONS (stop if the rule needs judgment per doc).
- Order: 4

#### REPO-2 residual (P3)
- Current behavior: `longplaytrough_transcript.txt` and `playtrough_example/` (typo names) stay at the repository root; reports and tools cite them.
- Desired behavior: moved with their consumers.
- User impact: none.
- Technical risk: low; historical citations break unless rewritten.
- Files: root files, citing reports and tools.
- Dependencies: none.
- Blockers: historical reports must not be modified.
- Human decision: whether to move at all (cleanup is closed).
- Safety: HUMAN DECISION REQUIRED
- Order: 5

#### DOC-13 (P3)
- Current behavior: `docs/world/CANON_OVERVIEW.md:46` holds an author-only section inside an indexed normative doc.
- Desired behavior: decide whether it moves to a separate author-only doc.
- User impact: none for players; risk of spoiler exposure to tools that read the docs.
- Technical risk: low; canon loaders or tests may cite the file.
- Files: `docs/world/CANON_OVERVIEW.md`.
- Dependencies: none.
- Blockers: needs a decision.
- Human decision: DOC-13.
- Safety: HUMAN DECISION REQUIRED
- Order: 7

#### REPO-13 (P3)
- Current behavior: `docs/evaluations/` holds 1,054 tracked files (about 50 MB).
- Desired behavior: none now: user decision keeps it open as is (no re-encode, no move, no deletion).
- User impact: clone size only.
- Technical risk: none if left alone.
- Files: `docs/evaluations/`.
- Dependencies: none.
- Blockers: user decision.
- Human decision: already taken (keep).
- Safety: HUMAN DECISION REQUIRED
- Order: 8

---

## Dependency-aware order across groups

The order below follows the code's dependencies, not the old roadmap order where they differ. Each step is one of the blocks in the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md); the [dependency graph](POST_CLEANUP_DEBT_DEPENDENCY_GRAPH.md) shows why.

1. **Reserved names and Narrator id masking** (AUD-1, CTX-1 word-boundary fix, a diagnostic for leaked internal refs). First correctness block. No decision needed.
2. **Test trust and the fast CI gate** (TEST-8 timing, the two report-only browser checks, Playwright declared, TEST-10 to TEST-12 fixes, then a FAST PR workflow once the CI host is chosen). Makes every later block cheaper to certify.
3. **UI trust and keyboard** (transcript window desync, UI-1 keyboard path to Promote, focus after actions, live regions, location copy). Correctness on existing screens.
4. **Persistence durability, save-compatible** (measurement, a non-fatal save-size code, compact JSON, side-store guards, identity diagnostics, real older-save fixtures). First persistence block; no schema bump.
5. **Pipeline lanes declared and observed** (PIPE-6 lane records, the committed-command list, AUD-2 behind a parity test, the pipeline doc corrections). No behavior change expected; makes PIPE-7 measurable.
6. **Canonical NPC policy and NPC+ exits** (D5 with AUTH-5 / ID-8, D4 with NPC-1 / NPC-4, the demotion question). Needs user decisions.
7. **Item identity and equipment foundation** (ITM-1 with ITM-2, ITM-6, ITM-4 with quantity). First item / economy block; it carries the next schema bump, planned together with D6 and the persistence schema-9 items.
8. **Containers and Property / Heartstone storage** (ITM-5, ITM-3 minimum, the Property UI). Becomes safe after steps 4, 6 and 7 and the UI scale bundle.

Independent tracks: **Weather UI** can be done at any point after step 3 (it is presentation over an existing read model); **CTX-B budgets** and **CTX-C retrieval quality** can follow step 1 in parallel with steps 4 to 7; **PIPE-7 delivered-text coverage** follows step 5 and needs a per-action-class decision; the **economy and transaction history** stage (ECO-1, TRD-11, ECO-4, TRD-12 pruning) waits for D3 and follows step 7, unless the first Property slice includes buying or renting property.

## Summary table

| ID | Group | Severity | Safety | Order in group |
| --- | --- | --- | --- | --- |
| AUD-1 | Product correctness | P2 | SAFE WITH STOP CONDITIONS | 1 |
| MOV-5 | Product correctness | P3 | SAFE | 2 |
| H1 residuals: `them` handover, shared first name, fronted-recipient receipt | Product correctness | P3, deferred | SAFE WITH STOP CONDITIONS | 4 |
| KPG-2 residual | Product correctness | P3, deferred | HUMAN DECISION REQUIRED | 5 |
| MOV-2 residual | Product correctness | P3, deferred | HUMAN DECISION REQUIRED | 6 |
| AUTH-1 residual | Product correctness | P3, deferred | HUMAN DECISION REQUIRED | 7 |
| AUTH-2 residual | Product correctness | P3 | HUMAN DECISION REQUIRED | 8 |
| ID-8 / NPC-3 / F8 | Authority / identity | P2, decision D5 | HUMAN DECISION REQUIRED | 1 |
| AUTH-5 | Authority / identity | P2 | HUMAN DECISION REQUIRED | 2 |
| AUTH-4 | Authority / identity | P3 | SAFE WITH STOP CONDITIONS | 3 |
| ID-3 / I7 | Authority / identity | P3 | SAFE WITH STOP CONDITIONS | 4 |
| ID-6 / I8 | Authority / identity | P3 | SAFE WITH STOP CONDITIONS | 5 |
| ID-7 / I3 | Authority / identity | P3 | SAFE | 6 |
| ID-5 / I14 | Authority / identity | P3 | SAFE WITH STOP CONDITIONS | 7 |
| AUTH-3 | Authority / identity | P3 | SAFE WITH STOP CONDITIONS | 8 |
| REV-4 | Authority / identity | P3 | SAFE | 9 |
| AUTH-7 | Authority / identity | P3 | HUMAN DECISION REQUIRED | 11 |
| F5 / I2 | Authority / identity | P3, deferred | SAFE WITH STOP CONDITIONS | 12 |
| I4 | Authority / identity | P3, deferred | SAFE WITH STOP CONDITIONS | 13 |
| F6 | Authority / identity | P3, deferred | HUMAN DECISION REQUIRED | 14 |
| F2 | Authority / identity | P3, PARTIAL | HUMAN DECISION REQUIRED | 15 |
| F4 / I10 | Authority / identity | P3, deferred | HUMAN DECISION REQUIRED | 16 |
| ID-1 residual | Authority / identity | P3, deferred | HUMAN DECISION REQUIRED | 17 |
| NAME_REQUEST mismatch | Authority / identity | P3, deferred | HUMAN DECISION REQUIRED | 18 |
| I5 | Authority / identity | P3, deferred | HUMAN DECISION REQUIRED | 19 |
| addressed_verb residual | Authority / identity | P3, deferred | HUMAN DECISION REQUIRED | 20 |
| CTX-1 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 1 |
| PIPE-10 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 2 |
| PIPE-9 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 3 |
| PIPE-4 | Pipeline / context | P2 | SAFE | 4 |
| CTX-4 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 5 |
| CTX-3 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 6 |
| CTX-2 residual | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 7 |
| AUD-2 | Pipeline / context | P3 | SAFE | 8 |
| PIPE-6 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 9 |
| PIPE-7 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 10 |
| ARCH-2 residual: F evidence readers | Pipeline / context | P2, deferred | SAFE WITH STOP CONDITIONS | 11 |
| IMG-2 | Pipeline / context | P2 | SAFE WITH STOP CONDITIONS | 12 |
| PRV-1 | Pipeline / context | P2, PARTIAL | HUMAN DECISION REQUIRED | 13 |
| PRV-2 | Pipeline / context | P2 | HUMAN DECISION REQUIRED | 14 |
| PRV-3 | Pipeline / context | P3 | SAFE | 15 |
| REV-1 residual | Pipeline / context | P3 | SAFE WITH STOP CONDITIONS | 16 |
| IMG-3 | Pipeline / context | P3 | SAFE | 17 |
| PRV-4 | Pipeline / context | P3 | SAFE WITH STOP CONDITIONS | 20 |
| PRV-5 | Pipeline / context | P3 | SAFE | 21 |
| PRV-6 | Pipeline / context | P3, PARTIAL | SAFE | 22 |
| PRV-8 | Pipeline / context | P3 | SAFE | 23 |
| PRV-7 | Pipeline / context | P3 | HUMAN DECISION REQUIRED | 24 |
| PIPE-11 | Pipeline / context | P3 | SAFE | 28 |
| PIPE-12 | Pipeline / context | P3 | SAFE WITH STOP CONDITIONS | 29 |
| CTX-5 | Pipeline / context | P3 | SAFE WITH STOP CONDITIONS | 30 |
| CTX-6 | Pipeline / context | P3 | SAFE WITH STOP CONDITIONS | 31 |
| CTX-7 | Pipeline / context | P3 | SAFE WITH STOP CONDITIONS | 32 |
| NARR-1 residual | Pipeline / context | P3 | HUMAN DECISION REQUIRED | 33 |
| VOC-1 | Pipeline / context | P3 | HUMAN DECISION REQUIRED | 34 |
| ARCH-3 | Pipeline / context | P3 | SAFE WITH STOP CONDITIONS | 35 |
| PER-1 | Persistence | P2 | SAFE WITH STOP CONDITIONS | 1 |
| TRD-12 | Persistence | P2 | SAFE WITH STOP CONDITIONS | 2 |
| F7 / I12 | Persistence | P2 | SAFE WITH STOP CONDITIONS | 3 |
| I1 / ID-4 | Persistence | P2 | SAFE WITH STOP CONDITIONS | 4 |
| PER-4 | Persistence | P2 | SAFE WITH STOP CONDITIONS | 5 |
| AUTH-8 | Persistence | P3 | SAFE WITH STOP CONDITIONS | 6 |
| AUTH-6 | Persistence | P3 | SAFE | 7 |
| PER-5 | Persistence | P3, PARTIAL | HUMAN DECISION REQUIRED | 8 |
| PER-9 | Persistence | P3 | HUMAN DECISION REQUIRED | 9 |
| NAME-1 | Persistence | P3, decision D6 | HUMAN DECISION REQUIRED | 10 |
| PER-6 | Persistence | P3 | HUMAN DECISION REQUIRED | 11 |
| PER-3 | Persistence | P3 | HUMAN DECISION REQUIRED | 12 |
| I6 / ID-9 | Persistence | P3 | SAFE WITH STOP CONDITIONS | 14 |
| IMG-12 | Persistence | P3 | SAFE | 15 |
| PER-7 | Persistence | P3 | HUMAN DECISION REQUIRED | 16 |
| PER-8 | Persistence | P3 | SAFE | 17 |
| PER-2B | Persistence | P3 | HUMAN DECISION REQUIRED | 18 |
| REV-2 residual | Persistence | P3 | SAFE | 19 |
| TRD-6 | Items / economy | P2 | SAFE WITH STOP CONDITIONS | 2 |
| TRD-8 | Items / economy | P3 | SAFE | 5 |
| TRD-13 | Items / economy | P3 | SAFE | 6 |
| ITM-3 | Items / economy | P2 | SAFE WITH STOP CONDITIONS | 7 |
| ITM-1 / UI-21 | Items / economy | P3 | SAFE WITH STOP CONDITIONS | 8 |
| ITM-6 | Items / economy | P3 | SAFE WITH STOP CONDITIONS | 9 |
| ITM-2 | Items / economy | P3 | HUMAN DECISION REQUIRED | 10 |
| ITM-4 | Items / economy | P2 | SAFE WITH STOP CONDITIONS | 11 |
| ITM-5 | Items / economy | P2 | HUMAN DECISION REQUIRED | 12 |
| ECO-1 | Items / economy | P2 | HUMAN DECISION REQUIRED | 13 |
| TRD-11 | Items / economy | P2 | HUMAN DECISION REQUIRED | 14 |
| ECO-4 | Items / economy | P3 | SAFE WITH STOP CONDITIONS | 16 |
| ECO-2 | Items / economy | P3 | SAFE WITH STOP CONDITIONS | 17 |
| TRD-7 | Items / economy | P2, partial | SAFE WITH STOP CONDITIONS | 19 |
| TRD-14 | Items / economy | P3 | SAFE WITH STOP CONDITIONS | 20 |
| TRD-9 | Items / economy | P2, deferred semantic | SAFE WITH STOP CONDITIONS | 21 |
| NPC-7 | NPC lifecycle / simulation | P3 | SAFE | 1 |
| NPC-6 | NPC lifecycle / simulation | P3 | SAFE | 2 |
| NPC-1 / NPC-2 | NPC lifecycle / simulation | P2 | HUMAN DECISION REQUIRED | 3 |
| NPC-4 | NPC lifecycle / simulation | P3 | HUMAN DECISION REQUIRED | 4 |
| NPC-5 | NPC lifecycle / simulation | P3 | SAFE WITH STOP CONDITIONS | 6 |
| UI-1 | UI / UX | P2 | SAFE | 1 |
| UI-2 | UI / UX | P2 | SAFE WITH STOP CONDITIONS | 2 |
| UI-17 | UI / UX | P2 | SAFE WITH STOP CONDITIONS | 3 |
| UI-5 | UI / UX | P2 | SAFE | 4 |
| UI-15 | UI / UX | P3 | SAFE | 5 |
| UI-3 | UI / UX | P3 | SAFE | 6 |
| UI-24 | UI / UX | P3 | SAFE | 7 |
| UI-6 / REV-3 | UI / UX | P3, partial | SAFE WITH STOP CONDITIONS | 9 |
| UI-22 | UI / UX | P2 | SAFE WITH STOP CONDITIONS | 10 |
| UI-4 | UI / UX | P2 | SAFE WITH STOP CONDITIONS | 11 |
| UI-7 | UI / UX | P3 | SAFE | 12 |
| UI-8 | UI / UX | P3 | SAFE | 13 |
| UI-20 | UI / UX | P3 | SAFE | 14 |
| UI-9 | UI / UX | P3 | SAFE | 15 |
| UI-10 | UI / UX | P3 | SAFE | 16 |
| UI-14 | UI / UX | P3 | SAFE | 17 |
| UI-11 | UI / UX | P3 | SAFE | 18 |
| UI-28 | UI / UX | P2 | SAFE WITH STOP CONDITIONS | 19 |
| UI-23 | UI / UX | P3 | SAFE | 20 |
| UI-25 | UI / UX | P3 | SAFE | 21 |
| UI-26 | UI / UX | P3 | SAFE | 22 |
| UI-27 | UI / UX | P3 | SAFE | 23 |
| UI-16 | UI / UX | P3 | SAFE WITH STOP CONDITIONS | 24 |
| UI-18 | UI / UX | P3 | SAFE | 25 |
| UI-19 | UI / UX | P3 | SAFE | 26 |
| UI-12 | UI / UX | P3 | SAFE | 27 |
| UI-13 | UI / UX | P3 | SAFE | 28 |
| UI-29 | UI / UX | P3 | SAFE | 29 |
| UI-31 | UI / UX | P3 | SAFE WITH STOP CONDITIONS | 30 |
| IMG-4 | UI / UX | P3 | SAFE WITH STOP CONDITIONS | 31 |
| IMG-9 | UI / UX | P3 | SAFE | 33 |
| IMG-6 | UI / UX | P3, partial | SAFE WITH STOP CONDITIONS | 34 |
| IMG-7 | UI / UX | P3 | SAFE WITH STOP CONDITIONS | 35 |
| IMG-5 / REPO-7 | UI / UX | P3 | SAFE WITH STOP CONDITIONS | 36 |
| IMG-8 | UI / UX | P3 | SAFE WITH STOP CONDITIONS | 37 |
| IMG-11 | UI / UX | P3 | SAFE | 38 |
| IMG-10 | UI / UX | P3 | HUMAN DECISION REQUIRED | 40 |
| MOV-6 | UI / UX | P3 | SAFE | 41 |
| CI-1 | Testing / CI | P2 | SAFE WITH STOP CONDITIONS | 1 |
| TEST-5 | Testing / CI | P3 | SAFE | 2 |
| TEST-8 | Testing / CI | P3 | SAFE | 3 |
| TEST-6 | Testing / CI | P2, partial | SAFE | 4 |
| TEST-2 | Testing / CI | P3 | SAFE | 5 |
| TEST-7 | Testing / CI | P3 | SAFE WITH STOP CONDITIONS | 6 |
| TEST-4 | Testing / CI | P3, partial | HUMAN DECISION REQUIRED | 7 |
| REPO-14 | Repository / archive (low priority) | P3 | SAFE WITH STOP CONDITIONS | 1 |
| DOC-12 | Repository / archive (low priority) | P3, partial | SAFE | 2 |
| REPO-8 | Repository / archive (low priority) | P3 | SAFE WITH STOP CONDITIONS | 3 |
| DOC-15 residual | Repository / archive (low priority) | P3 | SAFE WITH STOP CONDITIONS | 4 |
| REPO-2 residual | Repository / archive (low priority) | P3 | HUMAN DECISION REQUIRED | 5 |
| DOC-13 | Repository / archive (low priority) | P3 | HUMAN DECISION REQUIRED | 7 |
| REPO-13 | Repository / archive (low priority) | P3 | HUMAN DECISION REQUIRED | 8 |
