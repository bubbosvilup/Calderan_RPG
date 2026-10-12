# Consolidation Block 5B: character lifecycle, AUTH-2 and identity-fork diagnostics

Status: implemented on the working tree on top of `63c4347` (block 5A). **Not committed, not pushed.** No sealed canon appears in this report.

## 1. Baseline and AUTH-2 producer map

Baseline: block 5A at `63c4347`, 3425 tests, typecheck and build clean. AUTH-2 was: `establishNames` turned a securely named, present person in delivered narration into a `register_character` (permanent, no retire, no merge).

Producers of a persistent *created* character before this block (class: A explicit player authority, B deterministic domain-required, C semantic inference, D test/dev):

| Producer | Class before | After |
| --- | --- | --- |
| `establishNames` (name-driven promotion from narration) | **C** | removed: yields a scene-local `ProvisionalPerson`, plus late naming (`set_profile`) of an *existing* record |
| person Actual Offer plan (`register_character` inside the offer, settled by Accept) | A | unchanged in behaviour; now built by `materializeProvisional` |
| `characterForUpdate` lazy materialization of canonical NPC records | B | unchanged (engine-owned, never from narration) |
| opening scenarios / `createOpeningCampaign` | D | unchanged |
| Controller | none (schema has no `register_character`) | locked by test (A9/A10) |
| tests and `src/dev` fixtures | D | unchanged |

## 2. Lifecycle model

PROVISIONAL / PERSISTENT / RETIRED. It is an identity lifecycle, **not an NPC tier** (Canon / Campaign NPC / NPC+ are unchanged). PROVISIONAL is not stored; PERSISTENT is a record in `characters[]`; RETIRED is `CampaignCharacter.retirement` (reason `operator_retired` or `duplicate_merged` with `merged_into`), `current.status = inactive`, no location. Only created characters can be retired. Snapshot schema **7**, save file schema **7** (v6 -> v7 is version-only; a v6 snapshot carrying `retirement` is malformed; older files chain 4 -> 5 -> 6 -> 7).

## 3. Provisional identity

`src/turn/provisional-people.ts`. A provisional person has a stable ref (`narrated:<name>` or the linked ephemeral participant id), so repeated narration reuses the same identity within an interaction (test A3). Reload never materializes anyone (A11). Ephemeral scene participants can carry the established name, so a captive named by narration shows "P1 - Brenna (Slave)". No "no CampaignCharacter, so create one" fallback remains.

## 4. Materialization authority policy

- Person Actual Offer **Accept** materializes the *same* provisional subject atomically with the purchase, legal status and transfer, in one revision (A6/A7, browser B).
- A failed or never-accepted purchase leaves no persistent person (A8).
- NPC+ promotion keeps its existing eligibility (a provisional person is not eligible until persistent). Household membership does not auto-authorize.
- A semantic request alone stays provisional. `PendingConfirmation(kind=materialize_character)` is **reserved and not created in production**, because no semantic path currently has a real persistence need.

## 5. AUTH-2 migration

Regressions A1-A12 are in `tests/block5b-auth2.test.ts` (narration, self-introduction, repeated narration, persistent reuse, canonical not duplicated, Accept materializes once, failed Accept, narration/Controller cannot bypass, save/load, legacy characters), plus a source-level audit that only two files build or register a narrated person. About 20 existing tests were rewritten from "narration creates a character" to "narration yields a provisional person".

Product consequences (disclosed): a named narrated stranger is not in the NPC drawer or participants list as a campaign NPC, is forgotten when the recent-exchange window moves on or on reload (PER-2, separate), and cannot be promoted to NPC+ until persistent. "Tomas-style" stay-there continuity lines no longer apply to provisional people.

## 6. Retire

`retire_character` command plus `PendingConfirmation` kind `retire_character` (Class C, operator provenance, never scanner-proposed). Fail-closed preconditions: not the player, not canonical, not already retired, not dead, not NPC+, no active household membership, not legally held and not a legal holder, no items, no funds, no active trade offer. Retired is not deletion: the id stays referenceable, history is kept, and ordinary commands (profile, move, condition) are rejected for it. Retired characters are excluded from presence, movement, follow candidates, referenced characters and name-claim sets.

## 7. Merge

`merge_characters {source_id, target_id}` (explicit SOURCE = duplicate, TARGET = kept). A preflight conflict report (same analysis as commit time) refuses with no confirmation if anything is unsafe: identity/eligibility, names, sex, species, age, location, NPC+ source, household, legal status, funds, equipment-slot collision, relationship/knowledge conflicts, active offers, mannerism learning refs. When safe, one atomic commit rewrites items, households, legal status, funds, price index, relationships, knowledge, goals and event participants to the target, fills the target's missing profile fields, and retires the source with `merged_into`. Immutable ledger history stays on the retired id (no dangling reference).

## 8. Scanner

`src/campaign/identity-fork-scanner.ts`, CLI `src/dev/scan-identity-forks.ts`. Deterministic, read-only (never writes, never bumps a revision, never creates a PendingConfirmation, never calls a model). Signals: name relation, same location, description overlap, same narrated origin or promotion label, promotion proximity, legal-context split, canonical-name hint. **Same name alone is never a finding** (at least two independent non-name signals are required) and two different proper names are never paired. Each finding: HUMAN REVIEW REQUIRED, `automatic_repair: false`, diagnostic-only confidence and score, suspected original/duplicate (a human decides direction), signals, and a read-only merge preflight. Output: JSON plus Markdown.

## 9. Existing-save scan

Output in `docs/evaluations/block5b_identity_scan/` (`report.json`, `report.md`). The only saves available in this environment are two dev fixture saves (`saves/d04-context/...`, `docs/evaluations/item-sprite-smoke-assets/...`), which do not validate against the current canon and were read structurally (`raw_unvalidated`): **0 findings, 0 characters considered**. The user's real local saves are not reachable from this environment and were **not** scanned; the user should run the CLI on them. The save files were byte-identical before and after (sha256 checked). No automatic repair occurred.

## 10. Block 4 and block 5A interaction

Full suite green apart from the known flaky family (section 12). Block 4 turn_key replay and receipts, block 5A PendingConfirmation (create/cancel/invalidate keep the revision, Confirm commits once), AUTH-1 manumission, Actual Offer (goods and person), NPC+ promotion, save/load and identity regression suites all pass unchanged in intent. Operator records are excluded from the turn pipeline's pending proposals. `requestRepair` refuses a second active repair involving the same identity.

## 11. AUTH-2 invariant audit (every producer)

| Producer | Authority source | Lifecycle transition | Provider text participates | Explicit player authority |
| --- | --- | --- | --- | --- |
| `establishNames` provisional | none needed (no commit) | none (stays PROVISIONAL) | yes, as scene reading only | n/a |
| `establishNames` late naming (`set_profile`) | existing record's own self-introduction | name set on an existing PERSISTENT record | yes (self-introduction evidence) | n/a, no creation |
| narrated-captives bare-name rename | the one unnamed present person | name set on an existing record | yes | n/a, no creation |
| person Actual Offer plan | player's Accept (ref + revision) | PROVISIONAL -> PERSISTENT | descriptive evidence only | **yes** |
| `characterForUpdate` canonical materialization | authored canon | canonical -> campaign record (B) | no | n/a |
| `retire_character` / `merge_characters` | human operator + PendingConfirmation Confirm | PERSISTENT -> RETIRED | no | **yes** |
| Controller | none | none (commands not in schema, authorizer rejects) | n/a | no |
| NPC+ Promote | explicit UI action on an existing NPC | tier only | no | **yes** |

Conclusion: no narrative path creates a permanent identity; **AUTH-2 is CLOSED**. AUTH-1 stays CLOSED.

## 12. End-to-end validation

- `npm run typecheck`: clean. `npm run build`: clean.
- Full suite on the final code: **3460 tests, 3460 pass, 0 fail** (3425 at block 5A). An earlier run of the same code had one failure, the known flaky `generation lifecycle (npc, fullbody)`, which passed on the next full run; it was not modified.
- Browser (`scripts/block5b-browser-check.mjs`, real browser, offline, 0 provider calls): **13/13 PASS**. A narrated person: no persistent character, no card, reload does not materialize. B authorized materialization: the person offer card, still no persistent person before Accept, Accept creates exactly one Slave owned by Nicco, funds move once, same provenance. C human repair: request creates a card naming SOURCE and TARGET, no mutation while open, Confirm commits once (one revision) with zero provider calls, the request carries only ref + revision, a hard conflict creates no card.

## 13. Live certification

`src/dev/consolidation-block5b-live.ts`, production Narrator and Controller, one attempt per scenario, no reroll, 10 provider requests (5 Narrator, 5 Controller), 63,359 tokens, cost not reported by the provider metadata. Evidence: `docs/evaluations/consolidation_block5b_live/run.json`.

- **LIVE A (narration-only introduction): PASS.** Two turns; the Narrator introduced a stall vendor by name; afterwards 0 persistent created characters.
- **LIVE B (person Actual Offer Accept): NOT REACHED organically.** Three turns; Korvin offered two different women and countered 450 for "her", so the engine (correctly) created no card and no persistent person; no Accept was possible. One attempt only, as ordered. The explicit-authority materialization is covered by the deterministic production-pipeline evidence (browser B and tests A6/A7, including a real person offer built from narrated exchanges). This is **not** a live-model certification of LIVE B.

No production code changed after the live run (docs, report and scripts only), so the live result applies to the final code.

## 14. Final debt status

- AUTH-1: CLOSED. AUTH-2: **CLOSED**.
- PER-2 / ID-2 (provisional people and scene participants lost on reload): OPEN, separate. After this block they matter slightly more, because a named narrated person is now forgotten sooner.
- Duplicates already saved by older builds are still present; the scanner and the human-invoked merge are the only remedy. No automatic repair exists, by design.
- `materialize_character` PendingConfirmation kind: reserved, not built.
- Remaining identity debt: unnamed/plural/pronoun follows (MOV-2), player-facing UI for the repair flow (only an operator route and the existing card exist), a retired person's items must be moved or dropped by a human before retirement.

## 15. Block 6 handoff

The repair and lifecycle primitives are in place. Suggested next: PER-2/ID-2 (decide whether provisional people persist, as a separate schema decision), then the remaining consolidation blocks toward Block 7. **Architecture Consolidation Gate: no new major gameplay/domain systems before Block 7 completes.** Allowed meanwhile: bug fixes, test infrastructure, documentation, UI over existing stable domains, and Weather UI.

## Artifacts

Modified/new source: `src/campaign/{types,validation,campaign-state,snapshot-validation,characters,preparation,character-lifecycle,character-repair,identity-fork-scanner}.ts`, `src/persistence/{save-format,save-migrations,pending-confirmations}.ts`, `src/turn/{provisional-people,name-establishment,person-offers,scene-participants,command-authorizer,follow-candidates,referenced-characters,partner-identity-guard,turn-coordinator,turn-diagnostics}.ts`, `src/turn/stages/commit-preparation.ts`, `src/app/{confirmation-kinds,confirmation-view,game-session}.ts`, `src/ui/server.ts`, `src/dev/{scan-identity-forks,consolidation-block5b-live}.ts`, `scripts/block5b-browser-check.mjs`. Tests: `tests/block5b-*.test.ts`, `tests/provisional-helper.ts` and about 20 rewritten files. Scanner output: `docs/evaluations/block5b_identity_scan/`. Live evidence: `docs/evaluations/consolidation_block5b_live/`.
