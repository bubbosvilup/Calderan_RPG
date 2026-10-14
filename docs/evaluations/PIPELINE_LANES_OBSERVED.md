# Pipeline lanes declared and observed (block B5)

Date: 2026-10-14. Base: main `26fc79f` plus blocks B1 to B4 (uncommitted at the time). Block B5 of the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md), block P-A of the [pipeline authority review](NEXT_PIPELINE_AUTHORITY_REVIEW.md) (sections 8.2, 9 and 11). No live provider call, no image generation call, no Controller schema change, no save schema change.

**Which commands commit is unchanged.** Over 152 turns (all 55 benchmark scenarios and the 24 curated playthrough records) the committed state and the delivered narration after every turn are byte-identical before and after B5 (a per-turn sha256 of `exportSnapshot()` and of the narration, recorded on a copy of the tree with every B5 source change reverted, then on the B5 tree), and all 55 benchmark verdicts are identical (55 PASS both times).

## Starting assumptions (re-verified)

| # | Assumption | Result |
| --- | --- | --- |
| 1 | Commit preparation adds late naming `set_profile`, the Nicco `create_fact` + `set_knowledge`, `establish_character_contract` and the person `propose_trade_offer` outside `authorizeWithEvidence`; none appears in `state_proposed`, `TurnResult.authorization` or the trace | True (`commit-preparation.ts:73-99` before B5) |
| 2 | `TurnResult.authorized_commands` and the trace's `committed_command_kinds` come from the batch before commit preparation | True (`turn-coordinator.ts:321` passes `commands`, `result.ts:30`, `turn-trace.ts:71`) |
| 3 | `establishNames` and `establishedCanonicalDisclosure` get no shared facts; contracts and household evidence re-read dialogue | True (`commit-preparation.ts:73-75`, `character-contracts.ts:35`, `household-evidence.ts:27,87`) |
| 4 | TURN_COORDINATOR.md shows `narration_delta` and prose released before the commit, and a four-command Controller; NARRATIVE_AUTHORITY.md:22 says every durable change goes through Controller proposal | True |

## A. Lanes declared and recorded

`src/turn/authorization/authority-lanes.ts` names every producer of a turn's commit and the kinds each may emit:

| Lane | Stage | Reads | Kinds |
| --- | --- | --- | --- |
| `player_runtime` | intent | player input | `runtime_delta`, `move_character` |
| `preferred_authorization` | authorization | draft | the Controller vocabulary and derived proposals |
| `trade` | authorization | draft | `propose_trade_offer` (goods, items), `withdraw_trade_offer` |
| `late_naming` | commit preparation | delivered | `set_profile` |
| `name_knowledge` | commit preparation | delivered | `create_fact`, `set_knowledge` |
| `character_contract` | commit preparation | delivered | `establish_character_contract` |
| `person_offer` | commit preparation | delivered | `propose_trade_offer` (person) |

- `assembleTurnCommands` returns the batch as lane records too (`lanes`; `commands` is exactly their commands), with the Controller quote as evidence when there is one.
- `prepareCommit` takes the lane records and returns `CommitPlan.committed`: the exact command list the committed receipt was prepared from, each with its lane and evidence (the Controller quote, the self-introduction sentence, the contract quote, the offer's evidence line). Every one of its four re-preparations is built from a lane list (`commandsOf(...)`).
- `TurnResult.committed` publishes that list next to `authorization`, which stays the authorization stage's per-proposal decisions (review 8.2); `authorized_commands` keeps its meaning (the batch before commit preparation).
- The trace gains `committed_lanes` (`{lane, kind}` per committed command); the turn diagnostics' commit record gains `lanes` and its `command_count` / `command_kinds` are updated after commit preparation.

## B. The committed list is the final batch

`committed_command_kinds` (trace) is now `TurnResult.committed`'s kinds: after commit preparation and after the TRD-2 drop. Before B5, a goods offer that TRD-2 dropped was still listed and every commit-preparation command was missing (review 4.3). Proven three ways: a unit test (a goods offer authorized on the draft and dropped on the delivered text is not listed, the name knowledge the same turn adds is, and preparing the list reproduces the receipt), a trace test (kinds come from `committed`, not from `authorized_commands`), and the corpus self-check below (on all 201 corpus turns, preparing `committed` from the starting state reproduces the committed state exactly).

## C. AUD-2: parity, then the switch

`tests/turn/reader-parity.test.ts` with `tests/support/reader-parity.ts`. A tapped coordinator records every completed turn with its starting state; the test rebuilds the inputs the readers saw (the projected context and the turn's ONE fact source, as the coordinator builds them; the prepared snapshot after the TRD-2 drop) and first proves the rebuild faithful against the turn itself (self-check: the committed list reproduces the committed state; every lane emits only its declared kinds; the fallback readings reproduce the turn's own household evidence, identity result and committed contracts). Then it reads each reader twice: the fallback reading (the reader's own people, no shared source) and the reading through the turn's shared NarrationFacts.

| Corpus | Turns | Late naming: read / with output / differ | Household speech | NPC+ contracts |
| --- | --- | --- | --- | --- |
| Modern benchmark (55 scenarios, real GameSession rigs) | 128 | 128 / 26 / 0 | 136 / 5 / 0 | 128 / 0 / 0 |
| Curated playthrough records (legacy quoted prose) | 24 | 24 / 0 / 0 | 46 / 0 / 0 | 24 / 0 / 0 |
| Recorded live person-offer playthrough (RPG format, through Accept and "let's go home") | 11 | 11 / 1 / 0 | 14 / 0 / 0 | 11 / 0 / 0 |
| Receipt corpus and NPC+ contract corpus, one turn per phrase | 38 | 38 / 0 / 0 | 38 / 11 / 0 | 38 / 6 / **3** |

Every self-check held on all 201 turns. The corpora together exercise all seven lanes.

- **Late naming: parity holds, switched.** `prepareCommit` passes the turn's fact source to `establishNames`, so the reserved-handle identity reading comes from the shared source (no fallback `createFactSource` inside a turn).
- **Household choice and relationship speech: parity holds, switched.** `deriveTurnEvidence` (household choices) and `verifyEvidence` (voiced join or leave, relationship actor) pass the shared dialogue units of the same text to `attributedSpeech`, as the audit already did.
- **NPC+ contracts: parity does NOT hold; switch stopped.** The three differing turns are the plain RPG-format self-descriptions (`*Brenna looks at him.*` then `I will never hurt children.`; Maren's `I always speak plainly.`; Brenna's `I've always been stubborn.`). The current reading reads only quoted lines and makes no contract; the shared reading (RPG mode) attributes the plain line and would make one. That would add contracts the game never made, so it is a product change, not a parity-preserving switch: contracts keep their reading, and the test pins the difference. The quoted forms read the same both ways.
- **Canonical-name disclosure: not switched.** It calls no people-scoped NarrationFacts reader: it applies the pure `rpgDialogue` and `identityForms` to segments of the delivered text, with the prepared context as policy input. Moving it onto the shared identity facts is a rewrite of the reader, not a switch; it stays with the F readers.

## D. Documentation

- `docs/architecture/TURN_COORDINATOR.md`: a new first section with the code's actual order (no `narration_delta`; `state_committed` before `narration_completed`; commit preparation after the audit) and the lane table; the Repair 1 event order and its "released before commit" sentence corrected; the four-command Controller line labelled historical.
- `docs/architecture/NARRATIVE_AUTHORITY.md` section 1: durable changes come from the declared lanes of the one commit, listed, instead of "only through Controller proposal".
- `docs/UI_ENGINE_CONTRACT.md`: trace fields `committed_command_kinds` (new meaning) and `committed_lanes`.
- Register: PIPE-6 observability closed (audit-before-commit-preparation and PIPE-7 stay open); AUD-2 partly closed (contracts and disclosure open, with the reasons above).

## Tests added

| File | Tests |
| --- | --- |
| `tests/turn/authority-lanes.test.ts` | 9: the declared vocabulary; the Controller schema and the trade and preferred paths never decide a commit-preparation kind; only the coordinator commits and every commit-preparation receipt comes from a lane list; TRD-2 drop plus a name-knowledge command; the trade lane's offer and quote kept; a contract lane record with its quote; result and trace from a real turn; trace kinds from `committed`; the AUD-2 wiring |
| `tests/turn/reader-parity.test.ts` | 5: corpora ran and every turn rebuilt faithfully; late naming parity; household speech parity; the contract difference; all seven lanes exercised |

Tests changed deliberately: the frozen golden trace (`tests/golden/turn-pipeline.json`) regenerated for the new `TurnResult.committed` field only (a structural diff shows three added `committed` arrays and nothing else); six direct `prepareCommit` callers pass lane records instead of a command list (`trade-offer-authorization`, `identity-objective-vs-known`, `name-knowledge-commit`, `turn-stages`). The benchmark harness gained an empty, test-only `COORDINATOR_TAPS` list.

## Known limits

- The audit still runs before commit preparation and never sees its commands; the optional final-batch check of review 8.2 step 5 is not built (measure first).
- PIPE-7 (delivered prose that omits committed state) is untouched: it needs the per-class decision.
- NPC+ contracts from plain RPG lines need a product decision (today no plain RPG line ever establishes a contract, which may be a gap for the RPG-format Narrator).
- The household speech readers produce output on few corpus turns (16 of 234 reads): parity there is proven on what the corpora contain, mostly legacy quoted prose.

## Validation

Sequential run from a clean `.build` on the B1 to B5 working tree: typecheck and build exit 0; `npm test` **3764 tests, 3764 pass, 0 fail** (+14 over B4); `npm run benchmark:modern` 55/55, 0 known gaps, identical outcomes; `npm run check:architecture` 362 modules, 0 runtime back edges; documentation links 0 broken; 51 scripts, 0 syntax errors; all nine browser checks exit 0. No live provider call, no image generation.
