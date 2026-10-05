# CALDREVAN MINOR DEBT SWEEP - D-06 / D-16 / D-17 / D-20 / D-21

Date: 2026-10-05. Baseline: local `main` at `015e8e9`. One bounded pass; no paid calls, provider experiments or pushes.

## 1. BASELINE

Baseline validation: typecheck PASS; 2,011 unit tests passed, zero failures, four accepted TODOs (2,015 total); playthrough 25/25. Working tree was clean.

D-09 remains DEFERRED / SHADOW: generation OFF by default, narrator exposure OFF in both modes, optional `CALDREVAN_REFLECTION_MODE=shadow`. Existing reflection notes are preserved. Reopen only for a naturally occurring real-play reflection with plausible unique-value later use; no manufactured live authority.

The following is the exact current register wording recovered before edits. Original severity is MINOR for all five. Historical debt wording and code were inspected before deciding closure. [Full original rows](minor-debt-sweep/register-before.json) and the [working table](minor-debt-sweep/working-table.json) retain the original blocker, current relevance, closure condition, required production change and required evidence.

| Debt | Original area | Original severity | Original blocker / next action |
| --- | --- | --- | --- |
| D-06 | Occasional controller `structured_output_invalid` | MINOR | Not observed after Qwen switch; insufficient soak to close. Open pending broader runtime evidence; 16/16 switch outputs were structured-valid. |
| D-16 | `private_memory_refs` has no writer | MINOR | Dead/undefined structure today. Remove in a later schema migration or give it a concrete purpose during memory work. |
| D-17 | Reflection trigger counts lifecycle entries | MINOR | First reflection can happen earlier than intended because lifecycle entries count. Revisit only together with D-09/D-10 evidence. |
| D-20 | Reflection can delay the next command | MINOR | Reflection may sit on the critical path. Move it off the critical path when autonomy/background work is introduced. |
| D-21 | Type-only import cycles in `turn/` | MINOR | No runtime cycles. Clean up when the turn layer is next restructured. |

Historical source: [Pass 10 debt register](CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md), [overnight assurance](CALDREVAN_NPC_PLUS_PASS_10_OVERNIGHT_ASSURANCE.md), [Pass 7 reflection latency](archive/CALDREVAN_NPC_PLUS_PASS_7_ORGANIC_REFLECTION.md), and [D-09 current policy](D09_DEFERRED_SHADOW_POLICY.md). No new subsystem, concurrency worker, semantic feature, retrieval fix or reconciliation repair was introduced.

## 2. D-06 AUDIT

**BEFORE:** Occasional controller `structured_output_invalid`, MINOR, open after 16/16 valid switch outputs pending broader runtime evidence.

**FINDING:** The original failures were controller proposal parsing, not reflection. H5 used `deepseek/deepseek-v4-flash-0731:nitro`, max 512 tokens: one invalid output in 569 controller calls, scenario D_carrying/run 5. Pass 5 recorded one failure in 105 turns. The original upstream provider is not identified by those reports; no route pin is inferred. Earlier Repair 1.2 captured a malformed flat-command/evidence wrapper. R1 normalization now accepts only a semantically equivalent exact shape and retains strict parsing/authorization. Invalid results remain non-retryable under the production retry policy and cannot mutate campaign state.

Current controller: `qwen/qwen3.8-flash`, normal `OpenRouterStateControllerProvider.propose`, `campaign_proposal_with_evidence` strict JSON schema, generic `require_parameters:true` routing, reasoning excluded/disabled, 512 tokens and 20-second default timeout. It uses evidence parser, legacy parser, then bounded R1 normalization. It is not the pinned Alibaba request-scoped reflection wire path.

**CHANGE:** None to controller, policy, parser, schema, retry handling or routing. Clarify the register blocker only.

**EVIDENCE:**

| Existing evidence | Result | Covers controller debt? |
| --- | --- | --- |
| Qwen Round 1 | 18 physical receipts; 12 valid parses, six 429s; zero invalid structured outputs | Partly; curated model screen |
| Qwen Round 2 | 30 logical cases including the excluded probe; all valid parses, zero invalid outputs/retries | Partly; 29 scored cases plus one disclosed excluded probe |
| Production switch | 16/16 valid controller outputs; zero retries | Same path, bounded migration validation |
| Three recent D-09 raw directories | 35 physical controller receipts: 32 HTTP 200, all strict evidence-parser valid; three HTTP 429; zero normalization needed | Same current schema and route; controlled gameplay |
| Reflection wire V2 provider screen | 24/24 first/final usable, zero retries, malformed or enum violations | Different request/schema; not controller closure evidence |
| Production structured-reflection smoke | One qualified reflection call/accepted note, zero retry/failure | Different provider adapter and schema |
| Subsequent campaign reflection maintenance | Two accepted reflection calls in final campaign soak, no retry/failure | Different path; do not count as controller samples |

The raw receipt audit verifies request/receipt identity and current controller schema for all 35 controller receipts; no identity/schema mismatch. 429s are transport/rate-limit failures, not `structured_output_invalid`. Later matched and relationship-run records retain fail-closed retry failures separately. These counts are not added into a statistical guarantee and do not imply organic user-play coverage. The `structured_output_invalid:false` fields in later bakeoff JSON are not occurrences. No later positive occurrence was found in the audited Qwen controller records.

Earlier reflection reliability V3 actually failed schema conformance (seven wire+canonical invalids, one canonical-only duplicate-selector invalid); retries recovered some, not all. The later request-scoped CVC wire screen solved that qualified reflection gate. Neither the failed nor successful reflection screen tests the controller's command/evidence wrapper, legacy parser or R1 fallback. A shared model ID does not make the schemas/routes interchangeable.

Audit: [controller-receipt-audit.json](minor-debt-sweep/controller-receipt-audit.json), reproducible with `npm run build --silent` then `node scripts/minor-debt-controller-audit.mjs`. This only imports deterministic schema parsers and reads existing artifacts; it instantiates no provider and dispatches nothing. Sources: [H5 live evaluation](CALDREVAN_HARDENING_H5_LIVE_EVAL.md), [Pass 5](archive/CALDREVAN_NPC_PLUS_PASS_5_LIVE_REBASELINE.md), [R1 normalization](CONTROLLER_RELIABILITY_PASS_1.md), [Qwen switch](CALDREVAN_CONTROLLER_SWITCH_QWEN.md), [wire screen](STRUCTURED_REFLECTION_WIRE_V2_PROVIDER_SCREEN.md), [V3 failed gate](STRUCTURED_REFLECTION_RELIABILITY_V3.md), [production reflection integration](D09_PRODUCTION_STRUCTURED_REFLECTION_INTEGRATION.md).

**AFTER:** Safety behavior unchanged; missing evidence is broader representative current-controller gameplay on the controller command/evidence schema and ordinary provider route, beyond curated/controlled samples. Reflection qualification cannot fill it. No new numerical closure threshold was invented.

**STATUS:** OPEN / MINOR. No paid soak scheduled.

## 3. D-16 CLEANUP

**BEFORE:** `dynamic.private_memory_refs` was required, initialized empty on membership and old-save migration, validated against facts, serialized normally, and unioned into `npcDeepSources` recovery. No command, extractor or maintenance writer populated it.

**FINDING:** This is a dead capability with a real but obsolete consumer, not a defined missing feature. Authoritative `knowledge` already supplies character fact references. Inventing private memory would duplicate that domain. Nonempty old saves still need read compatibility.

**CHANGE:** Make the field optional and explicitly deprecated as legacy save compatibility. New runtime records and schema-1 migrations omit it. Recovery uses character `knowledge` only. The loader still accepts/preserves old arrays and still validates ID shape, uniqueness and fact existence; it does not silently strip or trust unknown data. No new command or memory domain.

**EVIDENCE:** New regression round-trips a nonempty legacy reference to an existing fact, verifies preserved bytes/data, proves that the legacy field alone grants no recovery or narrator projection, and proves that an explicit knowledge edge restores exact recovery. The current omitted-field shape loads. Old schema-1 snapshot migration loads, creates the expected `migrated_member` entry without this field, and is not reflection-due. Existing persistence torture still rejects an unknown legacy fact reference.

Type/schema: `campaign/types.ts`, `campaign/validation.ts`, `campaign/snapshot-validation.ts`; creation: `campaign/premium-characters.ts`; migration: `persistence/save-migrations.ts`; sole consumer removed: `turn/npc-plus.ts`. General save serialization/deserialization is unchanged. Save version 4 / snapshot version 3 remain unchanged: this is optional read-compatible deprecation, not a large migration. Older files load in the current engine; reverse compatibility of newly omitted fields with older engine binaries is not claimed.

**AFTER:** No active runtime expectation, initializer or consumer for the deprecated field. Existing save values remain readable and round-trip unchanged; knowledge owns recovery.

**STATUS:** CLOSED, 2026-10-05.

## 4. D-17 TRIGGER FIX

**BEFORE:** All recent development entries counted toward the generic threshold of three. The first `joined_household` entry made reflection due after only two substantive moves. Shadow still uses this predicate, so default OFF alone did not fix it.

**FINDING:** `joined_household` is emitted once when a premium record is first created; `migrated_member` is its save-bootstrap equivalent. Both are initial registration bookkeeping. `left_household` and `rejoined_household` record later meaningful choices and remain legitimate membership trajectory events. Event evidence eligibility is separate from trigger counting.

**CHANGE:** Exclude only `joined_household` and `migrated_member` from generic counting after the existing cursor. Keep active-member check, threshold three, new-contract and changed-rollup OR alternatives unchanged. All history entries remain available to the semantic evidence catalog, rollups and exact recovery. No frozen structured schema/semantic validator is edited.

**EVIDENCE:** Dedicated tests cover lifecycle-only counting, no stub call when not due, join+two mixed developments remaining not due, third mixed development becoming due, successful valid-empty cursor advance, active-member gating, voluntary leave/rejoin, a fully accepted/persisted membership trajectory containing the initial join plus two leave/rejoin pairs, newly established contracts after a previous reflection, and changed rollup independent of the recent count. Movement suite still records/cites exactly three moves and persists a faithful shadow note. Existing Pass 7 due fixture now supplies three substantive changes instead of relying on bootstrap registration.

**AFTER:** Three substantive developments are required; leave/rejoin trajectories are neither deleted nor disqualified. Shadow uses the corrected normal predicate and the same strict validation/persistence path.

**STATUS:** CLOSED, 2026-10-05.

## 5. D-20 LATENCY / DEFERRED-MODE DECISION

**BEFORE:** Reflection may sit on the critical path and delay the next command, up to provider timeout, without in-flight cancellation. The original Pass 7 debt referred to the then-default normal gameplay path.

**FINDING:** D-09 commit `015e8e9` removed that path from normal app/CLI defaults: no reflection provider is supplied unless shadow is explicitly selected. Shadow is a supported diagnostic mode and intentionally awaits maintenance. It may wait through timeout/retry/pacing and still has no in-flight reflection cancellation. This residual diagnostic behavior is disclosed, not called asynchronous or latency-free. Default mannerism maintenance remains independent and unchanged; no claim is made that all optional maintenance is disabled.

**CHANGE:** Close the normal-production reflection latency debt as obsolete under the deferred default. Clarify the production option comment: shadow enables synchronous diagnostic post-turn maintenance. No worker, queue, detached mutation, timeout redesign or background concurrency.

**EVIDENCE:** OFF session test starts with due reflection evidence and no provider, completes two commands with no reflection operation/post-turn wait, no cursor/note write, idle status and successful Save. Existing mode wiring tests verify default factory omission and explicit shadow-only opt-in. Shadow test holds a deterministic stub promise after delivered `turn_completed`, observes `post_turn`, rejects another command/Save while pending, then verifies strict validated note persistence once, cursor advancement, narrator exclusion, successful next command with no duplicate reflection, and Save.

| Async risk audited | Existing synchronous ownership / decision |
| --- | --- |
| Expected revision / concurrent mutation | Captured source revision checked before/after provider and persistence; stale proposals discarded |
| Subsequent player turns | Session busy during maintenance; next command is rejected until it settles |
| Cursor / duplicates | Cursor commits only with a valid completed reflection batch; invalid/failed responses do not advance it; active campaign guard and cursor prevent duplicate work |
| Campaign mutation | One owned, separate reflection revision; no gameplay-authority writes |
| Manual Save | Refused during post-turn; successful after settled persistence |
| Shutdown / cancellation | Shutdown aborts active input and awaits the in-flight turn/reflection before closing; no detached task; reflection itself lacks in-flight cancellation |
| Provider retries / pacing | Existing bounded synchronous retry/cooldown policy unchanged; no concurrent competing retry |
| State ownership / races | No new background writer or overlapping input allowed |

**AFTER:** Normal defaults cannot silently invoke or await reflection. Shadow wait remains explicit deterministic diagnostic behavior, with existing validation/persistence semantics. D-09 is not reopened.

**STATUS:** CLOSED AS OBSOLETE UNDER D-09 DEFERRED DEFAULT, 2026-10-05. Synchronous optional shadow behavior is accepted within this closure's explicit scope.

## 6. D-21 TYPE-CYCLE CLEANUP

**BEFORE:** Original Pass 10 reported 28 type-dependent cycles, zero runtime cycles. At this baseline the existing regex tool reports 16 DFS back-edges; these historical counts vary with graph traversal and intervening code changes. They are not a count of all simple cycles.

**FINDING:** The new compiler-AST inspection includes relative imports, re-exports and inline `import(...)` type queries that the regex misses. Compiler-erased JS static imports independently check runtime initialization. Lazy dynamic imports are listed separately, not treated as eager initialization. Baseline: 225 modules, 20 source DFS back-edges, five cyclic source components, zero runtime back-edges/components. Three components touch `turn/`; two genuine type-dependent components are outside this debt (campaign mannerism types and LLM controller schema/error types), and are untouched. No detected cyclic component is dev/test-only; no false barrel cycle is dismissed to achieve closure.

**CHANGE:** Move the existing `NarratorRequest` alias to the existing low-level `llm/types.ts` and import it directly from four prompt/compaction consumers. Keep the stage's public type re-export for compatibility. Move the two-field `EvidenceCheck` interface to a tiny type-only leaf and import it directly in household evidence and evidence authorization; keep the existing public type re-export. No runtime ownership moves, TurnError relocation, module split or runtime import change.

**EVIDENCE:** [Before](minor-debt-sweep/dependency-before.json) / [after](minor-debt-sweep/dependency-after.json), generated by `node scripts/minor-debt-cycle-check.mjs <output.json>`. After: 226 modules, 16 AST source DFS back-edges, the same five cyclic source components, zero runtime back-edges/components. Existing regex tool now reports nine source back-edges and zero runtime cycles. All 765 emitted runtime dependency edges match the baseline exactly; the whole graph hash changes only because an isolated erased type module was added. Architecture regression guards the removed direct type back-edges.

Remaining turn-layer components:

1. 20-module core type coupling, including `turn-types`, context builder, evidence/authorization, household evidence, prompt/narrative authority, natural actions and audit. For example `turn-types -> name-establishment -> context-builder -> turn-types` remains.
2. `context-budget <-> context-compaction`.
3. Ten-module reflection/diagnostics/structured-semantic type coupling, including `reflection <-> reflection-diagnostics` and the imported structured schemas.

These are genuine source type dependencies, not runtime initialization cycles. Full removal requires additional shared-contract extraction across the result/evidence/audit and reflection schema surfaces. That exceeds this pass's narrow leaf/direct-import cleanup, particularly the frozen reflection semantic module parity surface. No broad restructure is undertaken or claimed.

**AFTER:** Specific execution-module type back-edges removed; runtime graph unchanged. The original turn-layer cyclic coupling is reduced but remains.

**STATUS:** OPEN / MINOR. Exact blocker: the three remaining turn-layer type components above must be broken before D-21 can close.

## 7. CROSS-DEBT REGRESSION CHECK

- D-16: legacy nonempty refs, omitted current refs, schema-1 migration, normal save/load and unknown-fact rejection verified; legacy field does not grant knowledge or recovery.
- D-17: initial membership history remains in the catalog; voluntary leave/rejoin trajectory accepted by the unchanged qualified validator and persisted. Contract/rollup triggers and cursor checks still pass.
- D-20: no asynchronous code added. Shadow acceptance, single persistence, manual Save and narrator withholding verified; default reflection wait absent. Mannerism maintenance behavior is unchanged.
- D-21: all emitted runtime dependency edges remain identical; zero runtime initialization cycles. Existing public type exports remain valid; typecheck/architecture guards pass.
- D-06: no controller/parser/provider/retry/schema change. Historical evidence is not reinterpreted as closure and remains intact.
- D-09: register row and runtime mode/exposure defaults unchanged; production configuration edit is a documentation comment only. Qualified semantic modules and their source parity tests remain unchanged.
- D-19, D-22, D-26: register rows and their production behavior unchanged. No reconciliation, semantic retrieval or epistemic gate repair.

## 8. DEBT_REGISTER CHANGES

Only D-06 / D-16 / D-17 / D-20 / D-21 are updated. D-16, D-17 and D-20 move from Active to dated Closed entries with this report reference and focused test evidence. D-06 and D-21 retain MINOR severity and get precise remaining blockers. IDs are not renumbered. Protected debt rows are compared byte-for-byte to the before artifact.

## 9. TESTS

`npm run typecheck`: PASS.

`npm test`: 2,020 passed; zero failures; four unchanged TODOs; 2,024 total. Nine new tests: eight debt/save/trigger/session checks and one architecture guard. The initial full-suite invocation exposed a relative preload-path error in an authoring test that changes child-process cwd; rerunning with an absolute guard URL resolved the runner issue without production changes.

Focused save/reflection/architecture run: 100/100 PASS before the added architecture guard; all are also included in the final full suite. Deterministic fixtures and transport stubs only. The required existing suites contain provider-adapter construction checks with fake/absent credentials and mocked transport; no audit provider was instantiated and no real provider inference or network transport was dispatched. Real fetch/HTTP/TCP transport is blocked by `scripts/minor-debt-offline-guard.mjs`; Node preload is applied to children with an absolute file URL.

`npm run test:playthrough`: 25/25 PASS with network transport blocked.

Cycle/static check: zero emitted runtime cycles; 20 -> 16 AST source back-edges, five source cyclic components unchanged; 765 runtime edges identical; D-21 remains OPEN.

Save compatibility: nonempty legacy round-trip, field omission, old schema migration and existing torture suites PASS. Four TODOs remain the recognizable `them` phantom transfer, first-name condition attribution, unnamed captive price, and fronted-adverbial receipt cases; no changes to their tests/behavior.

Credential scan: zero matches across the sweep source/report/artifacts for credential/private-key patterns; raw values never printed. Protected D-09 / D-19 / D-22 / D-26 register rows match the before artifact exactly. Runtime edges match exactly. [Cross-debt checks](minor-debt-sweep/cross-debt-checks.json).

## 10. FINAL STATUS

| Debt | Result | Remaining blocker |
| --- | --- | --- |
| D-06 | OPEN / MINOR | Representative current controller-path reliability beyond curated/controlled samples; reflection screen is a different schema/route |
| D-16 | CLOSED | None; field retained solely for validated legacy read compatibility |
| D-17 | CLOSED | None; bootstrap-only counting removed, membership evidence preserved |
| D-20 | CLOSED AS DEFAULT-OBSOLETE | None within normal-production scope; diagnostic shadow remains explicitly synchronous |
| D-21 | OPEN / MINOR | Three turn-layer type-dependent components remain; shared-contract extraction deferred |

Debts closed: **3/5**. D-09 DEFERRED / SHADOW unchanged, generation OFF and narrator exposure OFF. D-19 / D-22 / D-26 unchanged. Paid calls: **0**. One cohesive local commit: `chore: resolve minor technical debts`. No push. Next major debt: **D-19**; no work on it in this pass.
