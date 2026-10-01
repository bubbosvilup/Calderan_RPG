 # CaldrevanRPG hardening gap-to-target audit

**Audit date:** 2026-10-01
**Type:** read-only planning audit. No source, authored data, test, configuration, save or provider state was changed. Nothing was committed or pushed.
**Baseline document:** [CALDREVAN_CODEBASE_ARCHITECTURE_HEALTH_AUDIT.md](CALDREVAN_CODEBASE_ARCHITECTURE_HEALTH_AUDIT.md) (health 84, maturity 43).
**Deliverables:** this report and [CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.json](CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.json).

## Evidence conventions

Every substantive claim below carries one of four labels.

- **MEASURED** — produced by a command run during this audit, or by a read-only probe script run against the compiled build in a scratchpad directory outside the repository.
- **OBSERVED_FROM_CODE** — direct implementation inspection, with file and line.
- **DOCUMENTED** — stated in existing architecture or evaluation documentation.
- **JUDGEMENT** — this audit's assessment. Not a measured claim. All score deltas are JUDGEMENT and are given as ranges.

---

## Executive summary

The baseline is reproduced exactly: typecheck clean, **947/947** deterministic tests, **25/25** curated replay, and every Calderan graph metric unchanged. The codebase is not in trouble. The hardening work it needs is narrower and more specific than "improve code health" — it concentrates in four places, three of which are measurable today.

**The headline finding is that the three target layers are not equally distant from their goals.** Under the scoring model defined in section 1:

| Layer | Baseline | Target | Gap |
|---|---:|---|---:|
| Code health | **84.4** | 92–95 | +7.6 to +10.6 |
| Core deterministic layer | **88.2** | 96–98 | +7.8 to +9.8 |
| Functional runtime layer | **74.3** | 90–95 | **+15.7 to +20.7** |

The functional runtime layer is roughly twice as far from target as the other two, and it is dominated by one dimension — live-model robustness at 61 — that **no deterministic test can move**. This reframes the hardening phase: the deterministic work (sections 6, 7, 14, 15) is the cheap, safe, high-certainty part; the runtime work (sections 8, 11) is where the actual gap lives and it requires a paid evaluation budget to close.

**I have one substantive disagreement with the stated targets.** The arithmetic in section 20 shows that even the best-reasonable projection reaches core deterministic **95.2** — below the stated 96 minimum — and this holds under an alternative weighting that excludes authored-canon quality (95.6). Six of the nine core dimensions already sit at 82–91; bounded hardening realistically moves them to 94–96, not 97–98. Reaching 96+ would require near-ceiling scores across every core dimension simultaneously, which is not what four to six bounded passes deliver. I recommend a revised gate of **core ≥94, stretch 95–96**, and I have built the plan to hit that. The full plan is delivered below regardless; this is a flag, not a refusal to proceed.

**Four findings worth acting on before NPC+:**

1. **Thirteen independent negation/modality gates with no shared primitive and demonstrably inconsistent coverage** (section 6). MEASURED: across twelve representative cues, *no cue is vetoed by all gates*, ten of twelve produce disagreement, and the bare-`no` false-positive fix exists in exactly one of the four gates that need it. This is the single highest-value hardening target.
2. **Zero retry, backoff or hedging anywhere in the production provider path** (section 8). OBSERVED_FROM_CODE: one transient 429, 5xx or timeout fails the entire turn. This is most of the live-model robustness gap and it is a bounded fix.
3. **Count caps fire long before the serialized cap, and the relevance mechanism that could save the turn runs after the cap check** (section 10). MEASURED: facts fail at 33, present people at 24, events at 17 — while serialized size is still at 37% of its 32,000-character limit.
4. **Adding one domain to `CampaignDomains` is an unmigratable save break** (sections 12, 18). OBSERVED_FROM_CODE: the snapshot validator rejects both unknown and missing fields, and `requireVersionOne` rejects any `schema_version` other than 1 with no upgrade path. NPC+ will need this seam first.

**No finding is a BLOCKER** in the strict sense of "NPC+ cannot proceed safely until fixed." Two are HIGH PRIORITY prerequisites because NPC+ will otherwise inherit and multiply them (section 22).

---

## 1. Target layer definitions

Three scores, three explicit formulas. Each is a weighted mean of named dimension scores on a 0–100 scale, with weights summing to 100. Dimension scores are the baseline audit's eighteen, plus three sub-scores this audit introduces because the requested layer definitions reference areas the baseline did not score separately.

### New sub-scores introduced by this audit

| Sub-score | Baseline value | Basis |
|---|---:|---|
| `context_scale_behavior` | 74 | MEASURED cap-order probe (section 10); fail-closed is correct, but count caps are low, undocumented in ordering, and relevance selection runs too late |
| `runtime_save_usability` | 78 | OBSERVED_FROM_CODE: strict atomic saves and recovery slots work; manual-only, no autosave, dataset-hash fragility under active authoring |
| `deterministic_language_robustness` | 72 | MEASURED gate-divergence probe (section 6); conservative and fail-safe in aggregate, but unverifiable as a whole and demonstrably inconsistent |

These three are **JUDGEMENT** values anchored to measured evidence, not measurements themselves.

### A. CODE HEALTH

Unchanged from the baseline model, for continuity and comparability. Eighteen dimensions, weights favouring correctness and safety foundations over optional gameplay scope.

```
CODE_HEALTH = Σ(weight_d × score_d) / 100
```

| Dimension | Weight |
|---|---:|
| Architectural clarity | 9 |
| State authority / correctness | 10 |
| Atomicity / transactional safety | 9 |
| Test coverage | 10 |
| Determinism | 8 |
| Persistence robustness | 6 |
| Narrator safety / grounding | 7 |
| Controller authorization safety | 7 |
| Character continuity | 5 |
| World / canon consistency | 5 |
| Travel / spatial consistency | 5 |
| Retrieval architecture | 4 |
| Maintainability | 4 |
| Extensibility | 3 |
| Runtime performance / latency | 2 |
| Observability / diagnostics | 2 |
| Live-model robustness | 2 |
| Gameplay completeness | 2 |

**Baseline: 84.38 → reported 84.** MEASURED reproduction of the baseline weighted sum.

### B. CORE DETERMINISTIC LAYER

The subset of behaviour that is provable offline, with no provider involved. Inclusion rule: a dimension belongs here if a deterministic test can in principle establish its correctness. Weights re-normalised to 100 and re-ordered to put transactional authority first.

```
CORE_DETERMINISTIC = Σ(weight_d × score_d) / 100
```

| Component | Weight | Baseline | Covers |
|---|---:|---:|---|
| State authority / correctness | 16 | 91 | `CampaignState` as sole mutable authority; validated commands; deep-freeze |
| Atomicity / transactional safety | 15 | 91 | prepare/commit semantics, receipt ownership, one revision per changed batch, fail-closed rollback |
| Determinism | 14 | 90 | deterministic command resolution, stable ordering, route determinism, no model authority over state |
| Persistence robustness | 11 | 82 | save envelope correctness, atomic write, load validation, recovery slots |
| Controller authorization safety | 10 | 88 | evidence derivation, authorization rules, proposal ≠ authorization |
| Character continuity | 9 | 83 | deterministic promotion, naming, location identity, origin snapshots |
| Travel / spatial consistency | 9 | 91 | weighted Dijkstra routing, wall/gate constraints, atomic time+location |
| World / canon consistency | 8 | 86 | authored-data validation, reference integrity, dataset fingerprint |
| Test coverage (deterministic portion) | 8 | 88 | the 947-test suite and 25-case replay |

**Baseline: 88.21 → 88.** JUDGEMENT weighting; MEASURED component scores inherited from the baseline audit.

Sensitivity check (MEASURED arithmetic): excluding `world_canon_consistency` as an authoring-quality axis rather than a code axis, and re-normalising, gives baseline **88.37** — the layer score is not an artifact of including canon.

### C. FUNCTIONAL RUNTIME LAYER

Behaviour that depends on live model output, provider conditions, or real runtime scale. Inclusion rule: a dimension belongs here if deterministic fixtures cannot establish its real-world behaviour.

```
FUNCTIONAL_RUNTIME = Σ(weight_d × score_d) / 100
```

| Component | Weight | Baseline | Covers |
|---|---:|---:|---|
| Live-model robustness | 22 | 61 | provider failure/latency/variance behaviour, narrator and controller success rates under real output |
| Narrator safety / grounding | 20 | 81 | grounding audits, reconciliation, redaction, narration/state contradiction under real prose |
| Retrieval architecture | 14 | 76 | retrieval trigger policy, ranking, visibility filtering, semantic fallback, lore false negatives |
| Runtime performance / latency | 12 | 72 | provider call count and sequencing, deterministic stage cost, failure latency |
| Observability / diagnostics | 10 | 82 | turn diagnostics, failure classification, evaluation logging |
| Character continuity (runtime) | 8 | 83 | continuity under real model output and across save/load |
| Context scale behaviour | 8 | 74 | cap behaviour as scenes grow; compressibility; silent-drop avoidance |
| Save / runtime usability | 6 | 78 | manual save ergonomics, dataset compatibility in practice |

**Baseline: 74.34 → 74.** JUDGEMENT weighting; component scores inherited plus two new sub-scores.

### Why these three numbers differ so much

Code health averages across everything, so strong deterministic foundations (91, 91, 90) mask a weak runtime tail (61, 72, 76). Splitting the layers exposes that the project's deterministic core is genuinely close to target while its runtime behaviour is largely unmeasured. **The split is the most useful output of this section**: it says the hardening phase should spend its risk budget on runtime evidence, not on deterministic refactoring.

---

## 2. Baseline reproduction

All checks re-run during this audit. MEASURED unless noted.

| Check | Command | Result | Baseline claim | Delta |
|---|---|---|---|---|
| Typecheck | `npm run typecheck` | **pass** (exit 0) | pass | none |
| Deterministic suite | `npm test` | **947 pass / 0 fail / 0 skipped / 0 cancelled / 0 todo** in 14.89 s | 947/947 | none |
| Curated replay | `npm run test:playthrough` | **25 pass / 0 fail** in 1.00 s | 25/25 | none |
| Context inspector | `npm run inspect:context` | exit 0 | — | — |
| City graph | `inspect-city` | 78 locations, 22 added nodes, 156 directed edges, 8 components, largest 71, 7 isolated, **0 unreachable**, diameter 106 min (`east_arterial_north` → `slave_market_back_back_alleys`) | identical on every field | **none** |
| Retrieval eval | `npm run eval:retrieval` | lexical: 44 cases, top-1 **32/34**, Recall@5 **0.872**, MRR@5 **0.951**, multi-answer Recall@5 **0.615** | not previously reported | new measurement |
| Turn retrieval benchmark | `runTurnRetrievalBenchmark` (read-only) | policy: 25 cases, top-1 **25/25**, Recall@3 **1.00**, Recall@5 **1.00**; engine-only: top-1 **18/25**, Recall@3 0.80, Recall@5 0.88 | not previously reported | new measurement |
| Dataset identity | `world.datasetId` | `sha256:c885c573…cc1d70`; **181 entities, 25 chunks, 96 locations** | 96 locations | none |

### Authored-data validation

Covered by the green suite rather than by `audit-authored-data.ts`. That script writes a new file into `docs/evaluations/` with an exclusive-create flag, which is outside this audit's permitted writes, so it was **not run**. Equivalent coverage is MEASURED through `loadWorld("data")` succeeding under strict validation plus the passing `authored-data`, `authoring`, `world`, `world-canon`, `geography`, `calderan-*-canon` and `west-*-canon` suites. Its one unique output — the `calderan-data-*.json` artifact — is not needed for this audit.

### Codebase delta since the prior audit

MEASURED: the working tree has **103 modified and 31 untracked files** against `HEAD` (`f24b3b6`, 2026-09-30), including source under `src/campaign`, `src/turn`, `src/llm` and docs — not only authored data. The prior audit carries the same date as this one and reports identical test counts and identical city metrics, so it was almost certainly written against this same uncommitted tree.

**Conclusion: no measurable baseline delta.** All headline metrics reproduce exactly. One correction to the baseline's count: there are **48** `tests/*.test.ts` files, not 51 (MEASURED); the prior figure appears to have included the three non-test files in `tests/retrieval-eval/`. Scores are unaffected.

### Confirmed baseline

| Metric | Value |
|---|---:|
| Deterministic test count | 947 (542 `test(` call sites) |
| Curated playthrough count | 25 |
| Code health | 84 |
| Project maturity | 43 |
| Core deterministic layer | 88 (new) |
| Functional runtime layer | 74 (new) |

---

## 3. Gap analysis by health dimension

Current and target scores; gap; evidence; weaknesses; modules; test gaps; change risk; benefit; actions. Targets are JUDGEMENT ceilings for a bounded hardening phase, not aspirations.

### A. Architectural clarity — 86 → 92 (gap +6)

**Evidence.** OBSERVED_FROM_CODE: boundaries are genuinely clean. `WorldStore` is immutable with a deep-freeze and a dataset hash; `CampaignState` ([campaign-state.ts:61-97](../../src/campaign/campaign-state.ts#L61-L97)) exposes only `prepare`/`commit`/`apply`/`exportSnapshot`; the prepare dispatch is a flat five-way chain ([campaign-state.ts:49](../../src/campaign/campaign-state.ts#L49)). MEASURED: `tsc` reports no dependency cycles.

**Exact weaknesses.** The clarity cost is concentrated in one file. `TurnCoordinator.runTurn` is a single 176-line async generator ([turn-coordinator.ts:45-220](../../src/turn/turn-coordinator.ts#L45-L220)) holding roughly fourteen named responsibilities with no internal stage boundaries, 26 distinct import sources, and stage identity encoded in a reassigned `stage` string variable used only for error classification. Line length averages 95 characters and peaks at 440, so the 221-line count understates density by roughly 2–3×.

**Modules.** [turn-coordinator.ts](../../src/turn/turn-coordinator.ts) primarily; [context-builder.ts](../../src/turn/context-builder.ts) secondarily.

**Test gaps.** No test asserts stage ordering or stage boundaries as a contract; ordering is only implicitly covered by 23 integration tests in [turn-coordinator.test.ts](../../tests/turn-coordinator.test.ts).

**Change risk.** Medium-high. Decomposition touches the one function that every turn flows through.

**Benefit.** Enables safe NPC+ extension and makes stage timing observable (dimension P).

**Actions.** Extract stages behind explicit typed inputs/outputs per section 5. Preserve exact ordering and all checkpoint positions. No behaviour change.

### B. State authority / correctness — 91 → 96 (gap +5)

**Evidence.** OBSERVED_FROM_CODE: receipt ownership is enforced by a private `WeakMap` and identity comparison, rejecting forged, foreign, consumed and stale receipts ([campaign-state.ts:86-95](../../src/campaign/campaign-state.ts#L86-L95)). Snapshot validation is strict in both directions — unknown fields *and* missing required fields both fail ([validation.ts:11-24](../../src/campaign/validation.ts#L11-L24)). MEASURED: 30 tests in [campaign-state.test.ts](../../tests/campaign-state.test.ts).

**Exact weaknesses.** Genuinely few. The residual is that the authority model is verified by example tests rather than by properties: there is no test asserting *for arbitrary command sequences* that commit is idempotent, that a no-op batch never increments revision, or that domain ordering is permutation-stable. MEASURED: zero tests named for `property`, `permutation` or `idempot`.

**Modules.** [campaign-state.ts](../../src/campaign/campaign-state.ts), [validation.ts](../../src/campaign/validation.ts), [snapshot-validation.ts](../../src/campaign/snapshot-validation.ts).

**Test gaps.** Property tests for revision monotonicity, commit idempotency, `orderDomains` permutation stability, and `stableData` order-independence.

**Change risk.** Very low — additive tests only.

**Benefit.** Converts the strongest claim in the codebase from "tested by example" to "tested by property."

**Actions.** Add the property suite. Do not restructure `CampaignState`.

### C. Atomicity / transactional safety — 91 → 96 (gap +5)

**Evidence.** OBSERVED_FROM_CODE: no authoritative mutation occurs before [turn-coordinator.ts:193](../../src/turn/turn-coordinator.ts#L193), and that line carries an explicit comment that no await, callback or yield may intervene between the final checkpoint and commit — which inspection confirms. Up to five `prepare` calls per turn all target `base_revision`, so none can commit a stale base.

**Exact weaknesses.** Two. First, the identity-establishment prepare is wrapped in a bare `catch {}` ([turn-coordinator.ts:183-188](../../src/turn/turn-coordinator.ts#L183-L188)) that silently discards all identity changes on any failure — correct policy, but it emits no diagnostic, so a systematically failing promotion is invisible. Second, cancellation after commit is unobservable: `checkpoint()` cannot run between commit and the `state_committed` yield by design, which is correct, but the result carries no marker distinguishing "committed then cancelled."

**Modules.** [turn-coordinator.ts](../../src/turn/turn-coordinator.ts) lines 72, 81, 89, 158, 186, 193.

**Test gaps.** MEASURED: `campaign_validation_failed` has only 1 test reference; `invalid_runtime_intent` has **0**. No test asserts that a failed identity prepare preserves the rest of the turn.

**Change risk.** Low.

**Benefit.** Closes the last silent-failure path in the commit sequence.

**Actions.** Emit a diagnostic from the identity `catch`. Add stale-revision and partial-failure tests per section 7.

### D. Test coverage — 88 → 94 (gap +6)

**Evidence.** MEASURED: 947 passing tests across 48 files, 542 `test()` sites, 8,459 test lines against 9,847 source lines — a 0.86:1 ratio.

**Exact weaknesses.** MEASURED, and specific: of the eleven `TurnFailure` codes, **five have zero direct test references** — `invalid_input` (0), `context_invalid` (0), `context_too_large` (0), `invalid_runtime_intent` (0), `narrator_failed` (0). Coverage by technique is also narrow: zero property tests, zero permutation tests, zero idempotency tests, zero simultaneous-movement tests, one fuzz test. Negation is the best-covered adversarial axis at 12 tests; pronoun ambiguity has 2; quoted speech has 2.

**Modules.** [tests/](../../tests/) broadly; the gaps cluster on failure paths and language classifiers.

**Test gaps.** As enumerated. Note `context_too_large` is now MEASURED-reachable four different ways (section 10) yet has no test.

**Change risk.** None — additive.

**Benefit.** Highest certainty-per-unit-effort item in the plan.

**Actions.** Section 7 in full.

### E. Determinism — 90 → 96 (gap +6)

**Evidence.** MEASURED: `findRoute` at 0.0002 ms/op over 500 iterations, with equal-cost ties broken by full node-ID sequence in code-point order (DOCUMENTED, OBSERVED_FROM_CODE). Domain ordering is explicit and total ([campaign-state.ts:29-39](../../src/campaign/campaign-state.ts#L29-L39)). `stableData` sorts object keys before comparison, making change detection insertion-order independent.

**Exact weaknesses.** Determinism of the *language* layer is unestablished. The thirteen gates in section 6 are deterministic functions, but their *joint* behaviour has never been characterised, so "deterministic" currently means "reproducible," not "predictable."

**Modules.** [travel.ts](../../src/world/travel.ts), [campaign-state.ts](../../src/campaign/campaign-state.ts), [src/turn/](../../src/turn/) classifiers.

**Test gaps.** Route determinism under permuted edge insertion order; classifier determinism under whitespace, casing and punctuation variation.

**Change risk.** Very low.

**Benefit.** Supports both E and the language work in H1.

**Actions.** Add route permutation tests and classifier normalisation tests.

### F. Persistence robustness — 82 → 93 (gap +11)

**Evidence.** OBSERVED_FROM_CODE: the write path is genuinely hardened — exclusive-create `wx` at mode `0o600`, explicit `fsync`, then rename ([filesystem.ts:42-46](../../src/persistence/filesystem.ts#L42-L46)); reads are bounded even against a file growing after `stat`, with hard-link and symlink rejection at every path component ([filesystem.ts:23-41](../../src/persistence/filesystem.ts#L23-L41), [campaign-repository.ts:43-52](../../src/persistence/campaign-repository.ts#L43-L52)); strict JSON, 16 MiB bound, ISO-8601 round-trip timestamp validation, and `current`/`previous` recovery slots.

**Exact weaknesses.** Two, both structural rather than defects. **(1) No migration path at all.** `requireVersionOne` throws `unsupported_version` for any `schema_version` other than 1 ([snapshot-validation.ts:15-18](../../src/campaign/snapshot-validation.ts#L15-L18)), and the snapshot schema rejects missing required fields, so adding a domain array breaks every existing save with no upgrade route. **(2) Dataset-fingerprint blast radius.** `canonical_dataset_id` is a SHA-256 over *all* authored documents ([world-store.ts:27](../../src/world/world-store.ts#L27)), so **any** canon edit — one typo — invalidates every save. MEASURED: the working tree currently modifies ~70 authored YAML files, which would invalidate all saves made before it.

**Modules.** [snapshot-validation.ts](../../src/campaign/snapshot-validation.ts), [save-format.ts](../../src/persistence/save-format.ts), [validation.ts](../../src/campaign/validation.ts), [world-store.ts](../../src/world/world-store.ts).

**Test gaps.** No save/load round-trip property test; no unsupported-version fixture; no migration fixtures (nothing to migrate yet).

**Change risk.** Medium — the save format is a compatibility surface, which is exactly why the architecture should land before NPC+ rather than with it.

**Benefit.** Removes the largest single obstacle to shipping NPC+ without discarding playtest saves.

**Actions.** Design the versioned migration architecture per section 12. Do not implement migrations for v1→v1.

### G. Narrator safety / grounding — 81 → 90 (gap +9)

**Evidence.** OBSERVED_FROM_CODE: layered and genuinely defensive — 13 audit issue kinds, draft buffering so no unaudited prose is ever delivered, one bounded reconciliation call, then deterministic redaction as fallback ([turn-coordinator.ts:166-178](../../src/turn/turn-coordinator.ts#L166-L178)). MEASURED: `narration-audit.ts` is the largest module at 49,168 characters with 99 regex literals.

**Exact weaknesses.** The audit's correctness rests entirely on regex coverage, which section 6 shows is inconsistent across sibling modules. MEASURED: `narration-audit.ts` uses the bare-`no` pattern in both `NEGATED` and the local `DENIED`, so "She takes it, no hesitation." is falsely treated as negated — a false negative that blocks a valid committed transfer from being narrated as completed. The fix (a negative lookahead excluding `warning|hesitation|word`) exists only in [player-authored-events.ts:28](../../src/turn/player-authored-events.ts#L28).

**Modules.** [narration-audit.ts](../../src/turn/narration-audit.ts), [grounding-audit.ts](../../src/turn/grounding-audit.ts), [narrative-authority.ts](../../src/turn/narrative-authority.ts).

**Test gaps.** No adversarial corpus for the audit itself: no test that a *correct* narration survives the audit unmodified across a varied prose sample. Reconciliation and redaction rates are unmeasured in aggregate.

**Change risk.** High if gates are rewritten; low if a shared primitive is introduced behind existing call sites with gate-for-gate equivalence tests.

**Benefit.** Directly reduces over-redaction, the most player-visible quality failure.

**Actions.** H1 centralisation plus an audit-preservation corpus.

### H. Controller authorization safety — 88 → 95 (gap +7)

**Evidence.** OBSERVED_FROM_CODE: proposal and authorization are cleanly separated — strict JSON-schema parse, then `deriveTurnEvidence`, then `authorizeWithEvidence`, then `prepare` ([turn-coordinator.ts:127-158](../../src/turn/turn-coordinator.ts#L127-L158)). Quote-span tracking prevents dialogue being used as action evidence ([evidence-authorization.ts:32](../../src/turn/evidence-authorization.ts#L32)). MEASURED: 20 tests in [evidence-authorization.test.ts](../../tests/evidence-authorization.test.ts); `authorizeWithEvidence` runs in 0.0004 ms on an empty proposal.

**Exact weaknesses.** `DISQUALIFY` ([evidence-authorization.ts:26](../../src/turn/evidence-authorization.ts#L26)) is the single richest veto in the codebase and the only one covering refusal, hesitation and retraction — MEASURED: none of the other twelve gates catch `refuses`/`declines`/`rejects` or `hesitates`. Its correctness is therefore load-bearing and un-shared, and it carries the same bare-`no` false positive.

**Modules.** [evidence-authorization.ts](../../src/turn/evidence-authorization.ts), [command-authorizer.ts](../../src/turn/command-authorizer.ts), [turn-evidence.ts](../../src/turn/turn-evidence.ts).

**Test gaps.** No adversarial suite for quoted-speech-as-evidence, clause-scoped negation, or collective confirmation ("she takes them both").

**Change risk.** Medium-high — this is the authorization firewall.

**Benefit.** The firewall is what makes model proposals safe; its evidence base should be the strongest in the project.

**Actions.** Extract refusal/negation/modality primitives from `DISQUALIFY` as the canonical implementation, prove equivalence, then reuse.

### I. Character continuity — 83 → 93 (gap +10)

**Evidence.** OBSERVED_FROM_CODE: promotion is narrow and well-reasoned — name-established or purchased only, with immutable `origin_snapshot` provenance and explicit duplicate/absence skips ([name-establishment.ts:45-55](../../src/turn/name-establishment.ts#L45-L55)). MEASURED: same-name collision *is* tested, contrary to my initial expectation ([narrated-promotion.test.ts:150](../../tests/narrated-promotion.test.ts#L150), [narrator-persistence.test.ts:91-105](../../tests/narrator-persistence.test.ts#L91-L105)).

**Exact weaknesses.** One concrete divergence. OBSERVED_FROM_CODE: [narrated-captives.ts:319](../../src/turn/narrated-captives.ts#L319) defines a **local `sentencesOf` that shadows the exported one** and splits on `/(?<=[.!?…])\s+/` — naive, not quote-aware, and it additionally treats `…` as a terminator. The canonical [sentences.ts:2-11](../../src/turn/sentences.ts#L2-L11) tracks quote state specifically to keep dialogue intact and does not treat `…` as a boundary. The shadowed version is used at line 357 inside `establishedFacts`, which builds the `origin_snapshot` evidence for promotion. So the identity path and the audit path split sentences by different rules. Separately, duplicate-name detection is scoped to a single exchange ([name-establishment.ts:47](../../src/turn/name-establishment.ts#L47)), so the same name in different turns yields two records with no merge path — DOCUMENTED as intentional, but it is the limitation NPC+ will press on hardest.

**Modules.** [narrated-captives.ts](../../src/turn/narrated-captives.ts), [name-establishment.ts](../../src/turn/name-establishment.ts), [sentences.ts](../../src/turn/sentences.ts), [character-movement.ts](../../src/turn/character-movement.ts).

**Test gaps.** Section 14 in full: no test for movement during a naming turn, late naming after a scene change, or promotion evidence spanning quoted dialogue.

**Change risk.** Medium — promotion changes alter durable identity.

**Benefit.** This is the direct NPC+ prerequisite.

**Actions.** Resolve to one splitter with a divergence test; add the section 14 stress matrix.

### J. World / canon consistency — 86 → 90 (gap +4)

**Evidence.** MEASURED: strict validation passes on 181 entities and 25 chunks; 0 unreachable destinations; 0 isolated concrete POIs; 7 intentional structural containers.

**Exact weaknesses.** MEASURED: only **25 knowledge chunks for 181 entities**, which bounds retrievable lore depth regardless of retrieval quality. The PNG↔YAML correspondence remains a manual authoring judgement with no automated check (DOCUMENTED).

**Modules.** [data/](../../data/), [validation.ts](../../src/world/validation.ts).

**Test gaps.** Not a code-test gap. This dimension is limited by authoring volume, not by engine correctness.

**Change risk.** Low.

**Benefit.** Modest, and largely outside a hardening phase.

**Actions.** None in hardening beyond keeping the existing canon suites green. **This dimension is why the core-deterministic 96 gate is arithmetically hard** (section 20): it is an authoring axis that code passes cannot move.

### K. Travel / spatial consistency — 91 → 95 (gap +4)

**Evidence.** MEASURED: all graph metrics reproduce exactly; 156 directed edges; largest pedestrian component 71; diameter 106 minutes; `findRoute` effectively free at 0.0002 ms/op.

**Exact weaknesses.** Little. No permutation test proving route choice is invariant to edge declaration order, and no property test that route cost equals the sum of traversed edge costs.

**Modules.** [travel.ts](../../src/world/travel.ts), [city-travel.test.ts](../../tests/city-travel.test.ts), [geography.test.ts](../../tests/geography.test.ts).

**Test gaps.** Route determinism under permutation; cost-additivity property.

**Change risk.** Very low.

**Benefit.** Small but nearly free.

**Actions.** Two property tests in H1.

### L. Retrieval architecture — 76 → 88 (gap +12)

**Evidence.** MEASURED and better than the baseline score suggests: the **turn policy** achieves top-1 25/25 and Recall@3 1.00 on its 25-case benchmark, versus engine-only lexical at 18/25 and Recall@3 0.80 — exact-mention prioritisation is doing real work. The standalone 44-case eval gives Recall@5 0.872 and MRR@5 0.951. Latency is MEASURED at 2.41 ms for a lore query and 0.14 ms when policy correctly declines to retrieve.

**Exact weaknesses.** Two. **(1) Multi-answer recall is the weak spot: MEASURED 0.615** — queries with several relevant records retrieve only ~62% of them, bounded partly by `RESULT_LIMIT = 3`. **(2) The `known_by` gap, now with an exact mechanism.** `canonical_awareness` is built only from entities where `visibility.player && visibility.narrator` are both true ([context-builder.ts:45](../../src/turn/context-builder.ts#L45)), and `known_by_present_npcs` only covers entities retrieval actually returned ([retrieval-policy.ts:153](../../src/turn/retrieval-policy.ts#L153)). An NPC authored to know a *restricted* fact can therefore voice it only if retrieval happens to surface that entity — and visibility filtering excludes secret passages from results. The authored grant is unreachable. Additionally that line applies `.slice(0, 24)` — a **silent truncation** in the knowledge-permission path, inconsistent with the fail-closed policy everywhere else.

**Modules.** [retrieval-policy.ts](../../src/turn/retrieval-policy.ts), [context-builder.ts](../../src/turn/context-builder.ts), [narrative-authority.ts](../../src/turn/narrative-authority.ts), [hybrid-search.ts](../../src/retrieval/hybrid-search.ts).

**Test gaps.** No forbidden-entity assertions, no secret-leakage metric, no unnecessary-retrieval metric. The harness computes Recall/MRR but not precision at the returned limit.

**Change risk.** Medium for the `known_by` projection (it touches a disclosure boundary); low for metrics.

**Benefit.** Fixes a DOCUMENTED gap that makes authored NPC knowledge inert.

**Actions.** Section 9.

### M. Maintainability — 74 → 88 (gap +14)

**Evidence.** All MEASURED. Largest modules by characters: `narration-audit.ts` 49,168; `narrated-captives.ts` 31,616; `natural-actions.ts` 28,848; `person-transactions.ts` 28,668; `evidence-authorization.ts` 27,966; `prompt-builder.ts` 27,768 (max line 1,580); `turn-evidence.ts` 27,468; `turn-coordinator.ts` 21,132. `src/turn/` totals 3,798 lines / 374,431 characters across 26 modules — **45% of all source characters in 21% of the files**. 185 regex literals and 71 named regex constants in `src/turn/` alone. Coordinator has 26 import sources. `CampaignCommand` is a 30-variant union.

**Duplicate utilities (MEASURED, exact counts).**

| Utility | Independent definitions | Consistency |
|---|---:|---|
| `esc` (regex escape) | **12** modules | identical — pure duplication |
| `STOP` word sets | **6** (5 in `src/turn`, 1 in `src/dev`) | all different, none documented as intentionally scoped |
| `NUMBER_WORDS` | **3** | **inconsistent**: `grounding-audit` covers 1–12+, `narrated-captives` 0–19 as an array, `person-transactions` a record missing 13 and 14 |
| `sentencesOf` | **2** | **behaviourally different** (quote-aware vs naive; see dimension I) |
| `quotedSpans` | **2** | identical |
| negation/modality gates | **13** | **inconsistent** (section 6) |

No cyclomatic-complexity tooling is configured (MEASURED: no eslint, no complexity reporter in `package.json`), so branch complexity is proxied by regex count and character density.

**Modules.** All of [src/turn/](../../src/turn/).

**Test gaps.** Shared primitives cannot be tested because they do not exist.

**Change risk.** Low for `esc` and `quotedSpans`; medium for `NUMBER_WORDS` and `sentencesOf` (behaviour-changing); medium-high for the gates.

**Benefit.** Largest single gap in the health model, and it gates H1's reliability payoff.

**Actions.** Section 17. Extract primitives with equivalence tests. No style rewrites.

### N. Extensibility — 78 → 88 (gap +10)

**Evidence.** OBSERVED_FROM_CODE: the domain seam is genuinely good — adding a domain means one `prepare*Command` in the chain at [campaign-state.ts:49](../../src/campaign/campaign-state.ts#L49), one `CampaignDomains` field, one snapshot schema entry.

**Exact weaknesses.** The seam is clean for *preparation* and broken for *persistence*: a new required domain field breaks every save with no migration (dimension F). And the turn pipeline has no extension point at all — any NPC+ behaviour that needs a turn stage must edit `runTurn` directly.

**Modules.** [campaign-state.ts](../../src/campaign/campaign-state.ts), [types.ts](../../src/campaign/types.ts), [turn-coordinator.ts](../../src/turn/turn-coordinator.ts), [context-builder.ts](../../src/turn/context-builder.ts), [prompt-builder.ts](../../src/turn/prompt-builder.ts).

**Test gaps.** No test adds a synthetic domain to prove the seam holds.

**Change risk.** Medium.

**Benefit.** Determines whether NPC+ is a bounded domain or a cross-cutting edit.

**Actions.** Section 18.

### O. Runtime performance / latency — 72 → 88 (gap +16)

**Evidence.** MEASURED per-operation deterministic cost against the real Calderan dataset at the opening snapshot (4,412-char context, 3,317-char snapshot):

| Stage | ms/op | Iterations |
|---|---:|---:|
| `loadWorld("data")` cold | 310.36 | 1 |
| `retrieveForTurn` lexical (lore query) | **2.41** | 20 |
| `playerIntent` (natural movement) | **1.83** | 200 |
| `auditNarration` | 0.67 | 200 |
| `campaign.prepare` (1 runtime_delta) | 0.47–0.57 | 200 |
| `campaign.prepare` (empty commands) | 0.245 | 200 |
| `buildTurnContext` | 0.21–0.23 | 200 |
| `retrieveForTurn` (declined) | 0.14 | 20 |
| `deriveTurnEvidence` | 0.078 | 200 |
| `structuredClone(snapshot)` | 0.056 | 500 |
| `buildNarratorPrompt` | 0.031 | 200 |
| `JSON.stringify(context)` | 0.020 | 500 |
| `JSON.stringify(snapshot)` (save) | 0.016 | 500 |
| `projectKnowledgeAccess` | 0.0011 | 200 |
| `authorizeWithEvidence` (empty) | 0.0004 | 200 |
| `findRoute` | **0.0002** | 500 |

**Summing the per-turn call counts** (3 × `buildTurnContext`, 5 × `prepare`, 1 × `playerIntent`, 2 × `deriveTurnEvidence`, 2 × `auditNarration`, 1 × retrieval, 2 × `projectKnowledgeAccess`) gives a total deterministic cost of **≈9 ms per turn**.

**Exact weaknesses — and a correction to the likely assumption.** The deterministic layer is **not** the latency problem: at ~9 ms it is under 0.1% of a turn. The latency architecture issue is entirely provider-side and structural. OBSERVED_FROM_CODE: narrator timeout is 60 s ([minimax-narrator.ts:50](../../src/llm/openrouter/minimax-narrator.ts#L50)), controller 20 s ([deepseek-controller.ts:33](../../src/llm/openrouter/deepseek-controller.ts#L33)), and when the audit fires, a **second full narrator call** runs ([turn-coordinator.ts:172](../../src/turn/turn-coordinator.ts#L172)). Worst-case wall clock before a turn can even fail is therefore **≈140 s**, fully sequential. The narrator→controller order cannot be parallelised — the controller requires final narration — so the lever is reconciliation frequency and provider resilience, not concurrency.

Avoidable repeated work exists but is **low-impact and should not be prioritised**: `projectKnowledgeAccess` plus `relevanceSignals` are recomputed at [turn-coordinator.ts:201](../../src/turn/turn-coordinator.ts#L201) purely to measure the rendered length of a value already computed at line 163; context is serialized ~6× per turn (3 cap checks inside `buildTurnContext` at [context-builder.ts:60](../../src/turn/context-builder.ts#L60), plus controller evidence, `authoritative_text`, and diagnostics); `prepare` performs 2 `structuredClone`s and 2 full `stableData` serializations per call, ×5 calls.

**Scaling behaviour (OBSERVED_FROM_CODE) is the part that matters.** These grow with world or scene size: `canonical_awareness` runs `world.listEntities().filter(...)` **once per present character** ([context-builder.ts:45](../../src/turn/context-builder.ts#L45)) — O(present × entities); `visibleItem` does `snapshot.items.find(...)` inside a filter plus two `getEntity` calls per item ([context-builder.ts:26-27](../../src/turn/context-builder.ts#L26-L27)) — O(items²); facts↔knowledge cross-filtering at lines 28 and 34 is O(facts × knowledge); `prepare` cost is dominated by fixed snapshot-sized overhead (empty-command prepare is 0.245 ms of the 0.47 ms total), so it scales with campaign size, not command count.

**Modules.** [turn-coordinator.ts](../../src/turn/turn-coordinator.ts), [context-builder.ts](../../src/turn/context-builder.ts), [campaign-state.ts](../../src/campaign/campaign-state.ts), [src/llm/openrouter/](../../src/llm/openrouter/).

**Test gaps.** No latency regression harness; no scaling test asserting context build stays sub-linear.

**Change risk.** Low for the measurement harness; medium for provider resilience.

**Benefit.** Reduces turn failures and worst-case latency, which is the most felt runtime property.

**Actions.** Section 11. Prioritise provider resilience and reconciliation rate. Fix the line-201 recomputation because it is free; leave the rest.

### P. Observability / diagnostics — 82 → 94 (gap +12)

**Evidence.** OBSERVED_FROM_CODE: `TurnResult` is already rich — authorization diagnostics, retrieval diagnostics, turn evidence, reconciliation record with draft and revision, per-provider model/usage/latency, six context-size measurements, scene participants, identity resolution, travel route, and six latency fields ([turn-coordinator.ts:197-206](../../src/turn/turn-coordinator.ts#L197-L206)).

**Exact weaknesses.** The asymmetry is the finding: **failed turns emit almost nothing.** The failure event carries only `code`, optional `provider_code`, `narration`, `incomplete`, `base_revision`, `final_revision` ([turn-coordinator.ts:213](../../src/turn/turn-coordinator.ts#L213)) — no retrieval diagnostics, no latency, no context sizes, no stage timings. The turns you most need to debug are the least instrumented. There is also no turn ID, no per-stage timing (only coarse provider buckets), and the identity `catch` is silent.

**Modules.** [turn-coordinator.ts](../../src/turn/turn-coordinator.ts), [turn-types.ts](../../src/turn/turn-types.ts).

**Test gaps.** No test asserts diagnostics are emitted on failure.

**Change risk.** Low — additive, and diagnostics must stay non-authoritative.

**Benefit.** Prerequisite for section 8's soak matrix: you cannot aggregate what failures do not report.

**Actions.** Section 13.

### Q. Live-model robustness — 61 → 85 (gap +24, the largest)

**Evidence.** OBSERVED_FROM_CODE: the *transport* is excellent — HTTPS-only, `redirect: "error"`, credential-in-URL rejection, timeout, 2 MB byte cap, 100 k text cap, strict `finish_reason`, refusal and content-filter detection, full cancellation cleanup ([client.ts](../../src/llm/openrouter/client.ts)).

**Exact weakness — one, and decisive.** MEASURED by exhaustive grep over non-dev source: **there is no retry, backoff or hedging anywhere in the production path.** [client.ts:38](../../src/llm/openrouter/client.ts#L38) states the policy explicitly — "No retries: callers decide whether a new request is appropriate" — and no caller does. The only retry logic in the repository is `--retry-infra` in the dev harness ([eval-narrators.ts:29](../../src/dev/eval-narrators.ts#L29)). Consequently a single transient 429, 5xx, timeout or socket error on *either* provider fails the whole turn, losing the player's input and all deterministic work. There is also no fallback model, and the narrator pins `allow_fallbacks: false` with a single provider order ([minimax-narrator.ts:20](../../src/llm/openrouter/minimax-narrator.ts#L20)).

Supporting gap: no live soak data exists. The eval harness is capable — repeats, resume, `quantile`, `provider_reported_cost_usd`, outcome classification, JSONL rows — but MEASURED, it computes p25/median/p75 only, **not p95/p99**, and does not aggregate reconciliation or redaction rates.

**Modules.** [client.ts](../../src/llm/openrouter/client.ts), [minimax-narrator.ts](../../src/llm/openrouter/minimax-narrator.ts), [deepseek-controller.ts](../../src/llm/openrouter/deepseek-controller.ts), [turn-coordinator.ts](../../src/turn/turn-coordinator.ts).

**Test gaps.** No injected-transient-failure test; no test that a retried turn commits exactly once.

**Change risk.** Medium — retry must be provably safe against double-commit. It is safe by construction here because no mutation occurs before the single final commit, but that must be asserted, not assumed.

**Benefit.** Largest weighted gap in the runtime layer (22 × 24 points). Bounded, deterministic-testable fix.

**Actions.** Section 8. Bounded retry with jittered backoff on idempotent transient classes only, plus p95/p99 and the full metric set.

### R. Gameplay completeness — 48 → 52 (gap +4)

**Evidence.** DOCUMENTED and unchanged: NPC+ absent, economy limited to funds and person transactions, four physical conditions, no UI.

**Exact weaknesses.** None that are code-health weaknesses. This dimension measures intended scope not yet built.

**Actions.** **None.** Per the brief, no feature work is recommended to move a score. The +4 in projections reflects only subsystems that genuinely complete as a side effect of hardening (for example save migration making long campaigns viable).

---

## 4. Lowest-scoring areas: cause classification

For each weak area, which of the five causes actually applies. This matters because the remedy differs completely, and three of these are **not** code-quality problems.

| Area | Score | Actual defect | Incomplete validation | Insufficient tests | Architectural debt | Intentionally missing scope | Verdict |
|---|---:|:-:|:-:|:-:|:-:|:-:|---|
| Live-model robustness | 61 | **yes** | — | **yes** | **yes** | partly | **Real, fixable defect.** Absent retry is a genuine robustness defect, not missing scope. Absent soak data is missing validation. |
| Runtime perf / latency | 72 | no | — | **yes** | **yes** | — | **Architectural, not inefficiency.** MEASURED: deterministic cost ~9 ms/turn. The score is about sequential provider calls, a second narrator call on reconciliation, and no resilience. Do not micro-optimise. |
| Maintainability | 74 | no | — | **yes** | **yes** | — | **Genuine debt with a reliability payoff.** 13 divergent gates and 12 copies of `esc` are debt that causes inconsistent behaviour, not merely ugly code. |
| Retrieval architecture | 76 | **partly** | **yes** | **yes** | — | partly | **Mixed.** `known_by` unreachability is a real defect with an exact mechanism. Multi-answer recall 0.615 is partly a deliberate `RESULT_LIMIT = 3`. |
| Extensibility | 78 | no | — | **yes** | **yes** | — | **Debt, localised.** Domain seam is clean; persistence and turn-pipeline seams are not. |
| Narrator grounding | 81 | **partly** | — | **yes** | **yes** | — | **Mixed.** Architecture is sound; the bare-`no` inconsistency is a real defect causing over-redaction. |
| Character continuity | 83 | **partly** | — | **yes** | **partly** | **yes** | **Mostly scope + one real divergence.** The shadowed splitter is a defect. Cross-turn identity merge is intentionally absent. |
| Persistence robustness | 82 | no | — | **yes** | **yes** | **yes** | **Architectural gap, deliberately deferred.** Write path is hardened; migration was consciously postponed. |

**Conclusion.** Of eight weak areas, four contain a real defect (live-model retry, `known_by` unreachability, the bare-`no` inconsistency, the shadowed splitter). Three are architectural debt with reliability consequences. One — gameplay completeness — is pure scope and is explicitly excluded from hardening. **Missing features are not confused with bad code health anywhere in this plan.**

---

## 5. TurnCoordinator complexity audit

### Current responsibilities

MEASURED: one `async *runTurn` generator, lines 45–220, ~176 lines, 21,132 characters total file, 26 import sources. Fourteen distinct responsibilities:

1. Turn locking (module-level `WeakSet`) and input validation
2. Snapshot and revision capture; cancellation wiring
3. Base context construction and ephemeral participant planning
4. Player intent / natural-action grammar resolution
5. Carry resolution with speculative prevalidation
6. Person-transaction resolution with speculative prevalidation
7. Runtime-intent projection (detached prepare)
8. Movable-character and left-behind computation; prompt note synthesis
9. Conditional retrieval
10. Prompt construction and narrator streaming with draft buffering
11. Controller request, parse, evidence derivation, authorization
12. Debug-sink omission measurement
13. Acquisition-provenance enrichment; final prepare
14. Narration audit, reconciliation, redaction; identity establishment; commit; recent-conversation and participant updates; result assembly

### Stage ordering and boundaries

| # | Stage | Lines | Async | Checkpoint | Mutates campaign? |
|---:|---|---|:-:|:-:|:-:|
| 1 | lock + input validation | 58–61 | no | yes | no |
| 2 | snapshot capture | 62–64 | no | yes | no |
| 3 | base context + participant plan | 65–68 | no | no | no |
| 4 | carry prevalidation | 71–73 | no | no | **prepare only** |
| 5 | transaction prevalidation | 78–83 | no | no | **prepare only** |
| 6 | runtime projection | 88–90 | no | no | **prepare only** |
| 7 | movable/left-behind + scene plan | 92–98 | no | no | no |
| 8 | retrieval | 99–101 | **yes** | yes (after) | no |
| 9 | prompt + narrator stream | 102–119 | **yes** | yes (per delta) | no |
| 10 | controller | 122–127 | **yes** | yes (after) | no |
| 11 | evidence + authorization | 128–145 | no | yes | no |
| 12 | final prepare | 148–158 | no | yes (after) | **prepare only** |
| 13 | audit + reconciliation | 163–178 | **yes** (conditional) | yes (after) | no |
| 14 | identity establishment | 182–188 | no | no | **prepare only** |
| 15 | **commit** | 193 | no | **immediately before** | **YES** |
| 16 | publication | 194–208 | no | no | no |

**Mutable/shared data threaded between stages.** `text` and `shown` (reassigned narration), `stage` (failure classification, reassigned seven times), `narration`, `recorded`, `owned`, `carry`, `tradeCommands`/`tradeNotes`/`promotion` (all reassigned on prevalidation failure), `projected`, `final`, `identity`, `delivered`. OBSERVED_FROM_CODE: thirteen mutable locals span the full generator body. This — not line count — is the real complexity driver, because any reordering silently changes which value a later stage reads.

**Async boundaries.** Four: retrieval (8), narrator stream (9), controller (10), conditional reconciliation (13).

**Stale-revision checkpoints.** `checkpoint()` at lines 61, 64, 101, 110 (per text delta), 121, 123, 126, 146, 159, 173, 192. Every async boundary is followed by one; line 192 immediately precedes commit with no intervening await, callback or yield. **This is correct and must be preserved exactly.**

**Cancellation.** Same checkpoints, plus `AbortController` forwarding to both providers and `finally`-block abort. Post-commit cancellation is deliberately impossible.

**Error conversion.** Single `try/catch` mapping `TurnError.code`, else the current `stage` string, else cancellation. `ProviderError` contributes `provider_code` and feeds the debug sink.

**Audit/reconciliation ownership.** Coordinator-owned: it calls `auditNarration`, decides reconciliation versus redaction, and owns the `delivered` classification.

**Commit ownership.** Coordinator-owned and singular: exactly one `campaign.commit` at line 193.

### Where responsibilities separate without behaviour change

OBSERVED_FROM_CODE, stages 1–7 are pure functions of `(snapshot, player_input, world)` plus speculative `prepare` calls that are never committed. They can be extracted behind a typed result with **no** behaviour change. Stages 11–12 are pure given narration and context. Stages 15–16 must remain inseparable and synchronous.

### Recommended target architecture

Justified by current code, not by the example list. I recommend **seven** stages, not ten — three of the suggested stages do not correspond to real boundaries here.

| Proposed stage | Maps to | Justified? |
|---|---|---|
| `TurnInputStage` | 1–2 | **yes** — pure, clear boundary |
| `IntentResolutionStage` | 3–7 | **yes** — pure; owns carry, transactions, participants, prevalidation |
| `ProjectionStage` | 6 (within above) | **merge into IntentResolution** — projection is inseparable from prevalidation; both `prepare` against the same base and feed each other |
| `RetrievalStage` | 8 | **yes** — already isolated via `retrieveForTurn` |
| `NarrationStage` | 9 | **yes** — owns draft buffering; must not deliver |
| `ControllerStage` | 10 | **yes** |
| `AuthorizationStage` | 11–12 | **yes** — merge `ControllerStage`'s parse with evidence/authorization only if the provider call stays separately timeable |
| `AuditStage` | 13 | **yes** — owns audit, reconciliation, redaction, `delivered` |
| `CommitStage` | 14–15 | **yes** — identity establishment must be inside the commit stage; it re-prepares and must share the commit's atomicity |
| `PublicationStage` | 16 | **not justified as a stage** — it is result assembly with no decisions; keep as a function |

**Recommended set: `TurnInputStage`, `IntentResolutionStage`, `RetrievalStage`, `NarrationStage`, `ControllerStage`, `AuthorizationStage`, `AuditStage`, `CommitStage`** — eight, with publication as a helper. Each returns a frozen typed value; the generator becomes a sequence of stage calls plus the unchanged checkpoint and yield positions. This also yields free per-stage timings for dimension P.

**Not now.** No refactor in this audit. H2 owns it, gated on H1's tests existing first.

---

## 6. Natural-language / heuristic hardening audit

**MEASURED inventory: 185 regex literals, 71 named regex constants, across 26 modules in `src/turn/`.**

### Classifier inventory

| Domain | Module | Approach | Fail-safe direction | Tests |
|---|---|---|---|---:|
| Natural actions (movement, offer, intention, receive, physical) | [natural-actions.ts](../../src/turn/natural-actions.ts) | 35 regexes; `*asterisk*` segmentation; `SUBJECT`-prefixed alternation; 7 kinds × 9 statuses | explicit `ambiguous`/`unresolved` statuses; drops rather than guesses | 9 |
| Movement / carry / narrated movement | [character-movement.ts](../../src/turn/character-movement.ts) | 19 regexes; `NOT_DONE` veto; destination resolution | returns none on ambiguity | via continuity suites |
| Departures | [scene-departure.ts](../../src/turn/scene-departure.ts) | 16 regexes; `DEPART_ACT` + `NOT_DONE` + clause split; actor = last name before act with no intervening capitalised name | requires completed act **and** resolvable actor | via continuity suites |
| Naming / promotion | [narrated-captives.ts](../../src/turn/narrated-captives.ts), [name-establishment.ts](../../src/turn/name-establishment.ts) | 76 regexes — largest single concentration; narration units, speaker attribution, quote segmentation | duplicate-name and absence skips; unresolvable → no-op | 8 + 11 |
| Pronouns | [narrated-captives.ts](../../src/turn/narrated-captives.ts), [scene-departure.ts](../../src/turn/scene-departure.ts) | `HELD_PRONOUN`, leading-pronoun → nearest named subject; authored `sex` only, never name-inferred | no resolution → no attribution | 2 |
| Transactions | [person-transactions.ts](../../src/turn/person-transactions.ts) | 27 regexes; `ACCEPT`/`HEDGE`/`PRICE_TALK`/`AUTHORITY`/`DOCUMENTED` | prevalidated against `prepare`; rejected → "nothing changed" note | via household suites |
| Household evidence | [household-evidence.ts](../../src/turn/household-evidence.ts) | 38 regexes; `JOIN`/`LEAVE`/`NOT_A_CHOICE`/`RULE` | requires explicit voluntary statement | 10 |
| Relationship evidence | [household-evidence.ts](../../src/turn/household-evidence.ts) `verifyRelationshipEvidence` | quote + behaviour matching | one step only; never Nicco's feelings | via authorization suite |
| Tell / knowledge evidence | [turn-evidence.ts](../../src/turn/turn-evidence.ts) | 60 regexes; confirmation kinds incl. `heard_fact`/`was_told_fact` | requires deterministic reference + narration support | 20 |
| Negation / modality | **13 separate gates** (below) | regex alternation | veto-on-match | 12 by name |
| Quotes | [sentences.ts](../../src/turn/sentences.ts) `blankQuotes`, [evidence-authorization.ts:32](../../src/turn/evidence-authorization.ts#L32) `quotedSpans`, `QUOTE` in two modules | span tracking / blanking | dialogue excluded from action evidence | 7 |
| Item actions | [item-reference.ts](../../src/turn/item-reference.ts), [natural-actions.ts](../../src/turn/natural-actions.ts) | head-noun + category terms | unresolved reference rejected, turn survives | yes |
| Physical actions | [physical-interaction.ts](../../src/turn/physical-interaction.ts), [player-authored-events.ts](../../src/turn/player-authored-events.ts) | 38 regexes; 4 conditions; `SEVERE_TERMS` rejected | escalation rejected/redacted | yes |

**Aggregate fail-safe assessment (JUDGEMENT, well-supported):** the system is consistently biased toward false negatives, which is the correct direction. A missed valid intent feels unresponsive; a false positive would corrupt state. No evidence of a systematically unsafe classifier was found.

### The central finding: thirteen negation/modality gates

OBSERVED_FROM_CODE, with locations:

| # | Gate | Location |
|---:|---|---|
| 1 | `DISQUALIFY` | [evidence-authorization.ts:26](../../src/turn/evidence-authorization.ts#L26) — richest; the only one covering refusal/hesitation/retraction |
| 2 | `NOT_DONE` | [character-movement.ts:37](../../src/turn/character-movement.ts#L37) |
| 3 | `NOT_DONE` | [scene-departure.ts:30](../../src/turn/scene-departure.ts#L30) |
| 4 | `HEDGED` | [grounding-audit.ts:32](../../src/turn/grounding-audit.ts#L32) |
| 5 | `NOT_A_CHOICE` | [household-evidence.ts:21](../../src/turn/household-evidence.ts#L21) |
| 6 | `HEDGED` | [household-evidence.ts:70](../../src/turn/household-evidence.ts#L70) |
| 7 | `HEDGE` | [narrated-captives.ts:84](../../src/turn/narrated-captives.ts#L84) |
| 8 | `NEGATED` | [narration-audit.ts:62](../../src/turn/narration-audit.ts#L62) |
| 9 | `HYPOTHETICAL` | [narration-audit.ts:335](../../src/turn/narration-audit.ts#L335) |
| 10 | `DENIED` (function-local) | [narration-audit.ts:414](../../src/turn/narration-audit.ts#L414) |
| 11 | inline negation list | [narration-audit.ts:82](../../src/turn/narration-audit.ts#L82) |
| 12 | `HEDGE` | [natural-actions.ts:57](../../src/turn/natural-actions.ts#L57) |
| 13 | `HEDGE` | [person-transactions.ts:32](../../src/turn/person-transactions.ts#L32) |
| 14 | `NEGATED` | [player-authored-events.ts:28](../../src/turn/player-authored-events.ts#L28) |

(Fourteen sites; thirteen distinct top-level named gates plus one inline.)

**MEASURED divergence.** Twelve top-level gates were extracted verbatim and evaluated against twelve single-cue probes:

| Cue | Probe | Gates vetoing |
|---|---|---:|
| refusal (`refuses`/`declines`/`rejects`) | "She refuses it." | **0 / 12** |
| `hesitates` | "She hesitates, then takes it." | **0 / 12** |
| `probably`/`seems` | "She seems to take it." | 1 / 12 |
| `looks`/`glances`/`stares` | "She stares at the door." | 1 / 12 |
| `without` | "She takes it without a word." | 2 / 12 |
| `toward` | "She walks toward the door." | 2 / 12 |
| bare `no` | "She takes it, no hesitation." | 3 / 12 |
| `pretends` | "She pretends to take it." | 3 / 12 |
| `almost`/`nearly` | "She almost takes it." | 5 / 12 |
| `tries to` | "She tries to take it." | 5 / 12 |
| question mark | "Does she take it?" | 7 / 12 |
| contraction `n't` | "She doesn't take it." | 7 / 12 |

**No cue is vetoed by all twelve gates. Ten of twelve cues produce disagreement.** Refusal and hesitation are caught by **none** of the twelve — they exist only in `DISQUALIFY` (gate 1), which was verified separately to catch both.

**The clinching case.** The bare-`no` false positive — "She takes it, **no hesitation**." being read as negated — is fixed in exactly one place: the negative lookahead `no(?! (?:warning|hesitation|word))` at [player-authored-events.ts:28](../../src/turn/player-authored-events.ts#L28). The three other gates with bare `no` ([narration-audit.ts:62](../../src/turn/narration-audit.ts#L62), [grounding-audit.ts:32](../../src/turn/grounding-audit.ts#L32), [scene-departure.ts:30](../../src/turn/scene-departure.ts#L30)) still false-positive. **The fix exists in the least complete gate and is missing from the most complete one.** That is the argument for centralisation, measured rather than asserted.

**Honest caveat.** Divergence is not automatically a defect. Each gate is scoped to its own classifier, and some omissions are deliberate — `narrated-captives:HEDGE` concerns descriptive uncertainty ("probably nineteen"), not action completion, so it *should* differ. The defensible finding is narrower and still serious: **there is no shared, tested primitive for the concepts these gates share, so joint coverage is unverifiable and demonstrably inconsistent where the same concept is intended.**

### Correction to an earlier hypothesis

An initial probe suggested `scene-departure:NOT_DONE` and `player-authored-events:NEGATED` contained unanchored alternatives matching inside words (`star` in "stares", `no` in "north"/"nods"). **That was an artifact of grep truncating the regexes at 200 characters.** Re-reading the full definitions shows both are correctly `\b`-terminated. No such defect exists. Noted because the corrected method — importing or copying full definitions, never truncated ones — is what the H1 test suite must use.

### Duplicated parsing logic

MEASURED: see dimension M. `esc` ×12; `STOP` ×6 all different; `NUMBER_WORDS` ×3 with `person-transactions` missing 13 and 14 where `narrated-captives` has them; `sentencesOf` ×2 behaviourally different; `quotedSpans` ×2.

### Recommended centralisation

A new `src/turn/language/` module exposing tested primitives, with existing call sites rewired one at a time behind gate-for-gate equivalence tests.

| Primitive | Canonical source | Notes |
|---|---|---|
| `negation(text)` | extract from `DISQUALIFY` | richest; already covers refusal/hesitation |
| `modality(text)` | extract from `DISQUALIFY` + `natural-actions:HEDGE` | separate *epistemic* ("probably") from *intentional* ("tries to") — the two are conflated today |
| `refusal(text)` | `DISQUALIFY` | currently reachable from one site only |
| `completedAction(text)` | union of the `NOT_DONE` pair | the shared "not actually done" concept |
| `quotedSpans` / `blankQuotes` | [sentences.ts](../../src/turn/sentences.ts) | delete both duplicates |
| `sentencesOf` | [sentences.ts](../../src/turn/sentences.ts) | **delete the shadow at narrated-captives.ts:319**; decide `…` handling explicitly |
| `subjectOf(sentence, people)` | `scene-departure` actor resolution | most careful implementation |
| `resolvePronoun` | `narrated-captives` + `scene-departure` | authored `sex` only |
| `exactName(text, terms)` | `scene-departure:anyName` | with `esc` |
| `esc` | any | one copy; delete 11 |
| `numberValue` | `narrated-captives` (widest range) | one table; delete 2 |

**Critical constraint, stated because it is easy to get wrong:** centralising a union of all gates would *widen* every call site's veto, changing behaviour and likely increasing false negatives. The primitives must be **parameterised** so each site keeps its current effective behaviour unless a divergence is deliberately resolved. The brief forbids widening language coverage in this audit, and I am not recommending it in H1 either: H1 makes behaviour *explicit and tested*, it does not make it broader.

---

## 7. Property / adversarial test plan

A deterministic strategy. All additive; no production code changes required for any item here.

### By technique

| Technique | Target | Specific assertions |
|---|---|---|
| **Property** | `CampaignState` | commit idempotency (a receipt cannot commit twice); revision monotonicity; no-op batch never increments; `orderDomains` permutation-stable; `stableData` insertion-order independent; prepare against a non-base revision always fails |
| **Property** | travel | route cost = sum of traversed edge costs; `findRoute` invariant to edge declaration order; symmetric only where reciprocal edges are authored |
| **Property** | persistence | save → load → save produces byte-identical output; snapshot survives round-trip deep-equal |
| **Property** | context | `buildTurnContext` is a pure function of `(world, snapshot)`; identical input → deep-equal output |
| **Fuzz** | classifiers | random whitespace/casing/punctuation/Unicode-quote perturbation must not flip a classifier's verdict except where the perturbation is semantically meaningful |
| **Fuzz** | save loader | mutated JSON bytes must always fail with a typed `CampaignSaveError`, never throw raw or succeed |
| **Permutation** | commands | authorized command lists in any order produce the same committed snapshot |
| **Permutation** | domain ordering | records inserted in any order serialize identically |
| **Ambiguity** | naming, departures, items, pronouns | every ambiguous input yields no state change and a diagnostic reason |
| **Negation** | all 13 gates | the section 6 cue matrix as a locked table — each gate's verdict per cue asserted explicitly, so any future change to any gate is visible in a diff |
| **Stale revision** | coordinator | mutation injected after each of the four async boundaries → `stale_turn`, no commit |
| **Repeated command** | coordinator | the same input twice produces either one change then a no-op, or two deliberate changes — never a partial |
| **Idempotency** | commit | re-committing a consumed receipt fails; re-preparing identical commands yields `changed: false` |
| **Round-trip** | save/load | all 30 command kinds exercised, saved, loaded, deep-compared |
| **Route determinism** | travel | 100 random origin/destination pairs stable across runs and edge permutations |
| **Context boundary** | caps | each of the five count caps and the serialized cap asserted at exactly cap and cap+1 — currently **zero** tests cover `context_too_large` |

### Required stress scenarios

Each maps to a measured or code-observed weakness.

| Scenario | Why | Expected |
|---|---|---|
| Wrong character attribution | `scene-departure` actor resolution is subtle (last name before act, no intervening capital) | attribute correctly or not at all |
| **Quoted speech mistaken for action** | two quote primitives, two sentence splitters | `"Just leave!"` never produces `leave_scene` |
| **Negated actions** | section 6 matrix | each gate's documented verdict |
| Hypothetical actions | `HYPOTHETICAL` in one module only | "If she took it…" never commits |
| Future intentions | `tries to` caught by 5/12 gates | "She will take it" never commits |
| Pronoun ambiguity | only 2 tests today | two same-sex candidates → no attribution |
| Names resembling places/titles | DOCUMENTED as handled | "Heartstone" / "the Keeper" never promote |
| Duplicate names | same-exchange skip only | same turn → both skipped; different turns → separate IDs, documented |
| **Simultaneous movements** | MEASURED: zero tests | two characters departing in one narration → both or neither, never one silently dropped |
| Purchase + carry combination | two speculative prepares interact at [turn-coordinator.ts:72,81](../../src/turn/turn-coordinator.ts#L72) | atomic together or neither |
| **Narration contradicting prepared state** | the audit's whole purpose | audit fires, reconciliation or redaction, **state unchanged** |
| **Correct narration survives audit** | the missing inverse test | a varied correct-prose corpus passes with zero issues — guards against over-redaction |

The last row is the most valuable missing test in the project: everything today tests that bad narration is caught; nothing tests that good narration is left alone.

---

## 8. Live-model robustness audit

### The defect to fix first

MEASURED by exhaustive grep: **no retry, backoff or hedging in the production path.** Narrator timeout 60 s, controller 20 s, reconciliation a second 60 s narrator call. Worst case ≈140 s wall clock, fully sequential, before a turn fails and discards the player's input.

**Retry is safe here by construction** — no authoritative mutation occurs before the single commit at [turn-coordinator.ts:193](../../src/turn/turn-coordinator.ts#L193), and every speculative `prepare` targets `base_revision`. That safety must be asserted by test, not assumed. Recommended policy: bounded retry (max 2 attempts) with jittered exponential backoff, **only** on `timeout`, `rate_limited` and `provider_unavailable`; never on `model_refusal`, `authentication_error`, `configuration_error`, `invalid_provider_response` or `cancelled`. Re-check `checkpoint()` before each attempt so a stale turn aborts instead of retrying.

### What the existing harness already provides

MEASURED, and more than expected: [eval-narrators.ts](../../src/dev/eval-narrators.ts) + [narrator-bakeoff.ts](../../src/dev/narrator-bakeoff.ts) already support repeats, resume, `--retry-infra`, `quantile`, `classifyOutcome`, `usageOf` with `provider_reported_cost_usd`, prompt fingerprinting, wire capture, and JSONL rows. [eval-hardening.ts](../../src/dev/eval-hardening.ts) runs the full loop. **Gaps:** p25/median/p75 only — no p95/p99; no aggregation of reconciliation/redaction rates (though `narration_reconciliation.delivered` is already in `TurnResult`); no single consolidated matrix.

So section 8 is mostly **extension of existing tooling**, not new infrastructure. That materially lowers its cost.

### Evaluation matrix

| Metric | Source | Available today? |
|---|---|---|
| Narrator success rate | `classifyOutcome` | **yes** |
| Controller valid-JSON rate | `parseControllerProposal` + `controller_parse_failure` debug record | **yes** |
| Controller authorized-command rate | `authorization[].authorized` | **yes** |
| Valid action recognition rate | `action_resolution` statuses | **yes** |
| False state proposal rate | authorized=false ÷ proposed | **yes** |
| Reconciliation frequency | `narration_reconciliation.delivered === "revision"` | present, **not aggregated** |
| Deterministic redaction frequency | `delivered === "redacted"` | present, **not aggregated** |
| Narration/state contradiction rate | `narration_reconciliation.issues[].kind` | **yes** |
| Hallucinated character/fact rate | `absent_participant`, `invented_source`, `unsourced_history` | **yes** |
| Unsupported player-action invention | `player_agency` issue kind | **yes** |
| Provider failure rate | `ProviderError.code` histogram | **yes** |
| Latency p50/p95/p99 | `quantile` | p50 yes; **p95/p99 missing** |
| Token usage | `usage` | **yes** |
| Cost per turn | `provider_reported_cost_usd` | **yes** |

### Sample sizes

JUDGEMENT, from binomial confidence on a proportion near 0.9 (half-width ≈ 1.96·√(p(1−p)/n)).

| Purpose | Runs/scenario | Scenarios | Total turns | Rationale |
|---|---:|---:|---:|---|
| **Smoke** | 3 | 5 | 15 | catches gross regression only; ±17% at p=0.9. Cheap enough per commit. |
| **Meaningful comparison** | 10 | 12 | 120 | ±9%; detects a ~10-point rate change between models or prompts. The default gate. |
| **Pre-release confidence** | 30 | 15 | 450 | ±5%; required for p95 to be meaningful at all (p99 needs ≥100 samples per cell and should be reported as indicative only). |

Repeated runs are mandatory because output is probabilistic — a single run per scenario measures nothing. Scenarios must be fixed and fingerprinted (`NARRATOR_SYSTEM_SHA` already exists) so results are comparable across passes.

### Cost discipline for this audit

No paid narrator or controller calls were made. One low-cost configured mechanism ran: `npm run eval:retrieval`, which issued **1 embedding request covering 94 input texts** via the already-configured Voyage provider — appropriate under the brief and not repeated.

---

## 9. Retrieval hardening

### Current state, measured

| Measurement | Value |
|---|---:|
| Turn policy: cases / top-1 / Recall@3 / Recall@5 | 25 / **25** / **1.00** / **1.00** |
| Engine-only lexical: top-1 / Recall@3 / Recall@5 | **18/25** / 0.80 / 0.88 |
| Standalone eval: cases / top-1 / Recall@5 / MRR@5 | 44 / 32 of 34 / **0.872** / **0.951** |
| Standalone eval: **multi-answer Recall@5** | **0.615** |
| Lexical latency (lore query) | **2.41 ms** |
| Latency when policy declines | **0.14 ms** |
| Pool / result limit / payload cap | 5 / 3 / 10,000 chars |
| Corpus | 181 entities, **25 chunks** |

The 7-point top-1 gap between policy (25/25) and engine-only (18/25) quantifies how much work exact-mention prioritisation does. The policy layer is the strength here, not a weakness.

### Findings

**1. `known_by` is unreachable for restricted entities (the DOCUMENTED gap, with an exact mechanism).** `canonical_awareness` requires `visibility.player && visibility.narrator` ([context-builder.ts:45](../../src/turn/context-builder.ts#L45)); `known_by_present_npcs` only covers retrieved entities ([retrieval-policy.ts:153](../../src/turn/retrieval-policy.ts#L153)); search filters secrets before results. An NPC authored to know a restricted fact can therefore never voice it. **The authored grant is inert.** Fix: a deliberate narrator-only awareness projection, keyed on `known_by`, independent of retrieval and of player visibility, carrying an explicit non-disclosure contract — the same pattern already used for `confidential_encounter` at [context-builder.ts:22](../../src/turn/context-builder.ts#L22).

**2. Silent truncation in the permission path.** The same line applies `.slice(0, 24)`. Every other cap in `buildTurnContext` fails closed; this one drops silently. Inconsistent, and it drops *permissions*, which is the one thing that should never vanish quietly.

**3. Multi-answer recall 0.615.** Partly deliberate (`RESULT_LIMIT = 3`). Needs separating: measure recall against the limit before concluding it is a ranking defect.

**4. Visibility filtering is correct.** OBSERVED_FROM_CODE and covered by "hidden retrieval records never enter the narrator prompt" ([turn-coordinator.test.ts:173](../../tests/turn-coordinator.test.ts#L173)).

### Benchmark extension design

The harness exists; extend each case rather than build new:

```
{ query, relevant[], top1?, forbidden[], rank_expectation, audience, mode, should_retrieve }
```

| New field | Purpose |
|---|---|
| `forbidden[]` | ids that must **never** appear → secret-leakage rate |
| `audience` | `"narrator"` \| `"player"` → asymmetry assertions |
| `mode` | `lexical` \| `semantic` \| `hybrid` → per-mode comparison |
| `should_retrieve` | expected trigger decision → unnecessary-retrieval rate |
| `rank_expectation` | max acceptable rank → precision at limit |

### Metrics to add

| Metric | Definition | Target |
|---|---|---|
| Recall@k | already implemented | ≥0.90 at k=5 |
| MRR | already implemented | ≥0.95 |
| **Precision at returned limit** | relevant ÷ returned | ≥0.80 |
| **Secret leakage rate** | cases returning a `forbidden` id | **0, hard gate** |
| **Unnecessary retrieval rate** | retrieved when `should_retrieve: false` | ≤0.10 |
| Multi-answer recall | already implemented | ≥0.75 (from 0.615) |

---

## 10. Context scale hardening

### Measured cap ordering

A read-only probe grew one dimension at a time from the real Calderan opening state until `buildTurnContext` threw.

| Dimension | Last OK | Fails at | Declared cap | Serialized size at failure | % of 32,000 |
|---|---:|---:|---:|---:|---:|
| Scheduled events (Nicco, scheduled) | 16 | **17** | 16 | 6,474 | 20% |
| Created characters present | 23 (+Nicco = 24) | **24** | 24 | 8,376 | 26% |
| Facts known by Nicco | 30 (+2 seeded = 32) | **31** | 32 | 8,946 | 28% |
| Items carried by Nicco | 48 | **49** | 48 | 11,690 | **37%** |

**The headline result: every count cap fires long before the serialized cap.** Even at 48 items the context is at 37% of its 32,000-character budget. The 32,000-character limit is effectively unreachable along any single dimension and is not the binding constraint. Failures are **predictable** (exact declared counts) and **fail closed** (`context_too_large`), which is correct — but the caps that actually bind are the low per-domain counts, and **none of them has a test** (MEASURED: zero references to `context_too_large` in `tests/`).

### Which data contributes most, and what is essential

| Data | Cap | Growth in real play | Compressible? |
|---|---:|---|---|
| **Facts known by Nicco** | 32 | **monotonic — nothing forgets** | **yes**, by relevance |
| Knowledge edges | 96 | monotonic with facts × present people | yes |
| Present created characters | 24 | bounded by scene crowding | **no — authoritative scene state** |
| Items carried/equipped | 48 | monotonic with acquisition | partly (equipped essential, stored not) |
| Scheduled events | 16 | self-clearing on completion | yes |
| Social projection | 12/15/12 edges/members/rules | bounded, already sliced | yes |
| `canonical_awareness` | 24, **silently sliced** | world size | yes, but must not be silent |

**Facts are the real scale risk.** They accumulate permanently (no forgetting mechanic, DOCUMENTED), the cap is 32, and headroom from the opening state is 30. A long campaign will hit this.

### The architectural finding

A relevance mechanism **already exists** — `selectRelevantFacts` ([narrative-authority.ts:27](../../src/turn/narrative-authority.ts#L27)) — but it runs inside `projectKnowledgeAccess`, called from [turn-coordinator.ts:163](../../src/turn/turn-coordinator.ts#L163), which is **after** `buildTurnContext` has already thrown. **The mechanism that could save the turn runs downstream of the cap that kills it.** That is the single highest-leverage fix in this section and it is a sequencing change, not new machinery.

### Recommended architecture

Do **not** implement summarisation now. Recommended ordering:

1. **Tier the caps by authority.** Scene-critical authoritative state (present people, equipped items, legal status, household membership) stays hard-capped and fail-closed — never dropped, never summarised. Advisory context (facts, knowledge edges, completed events, awareness) becomes relevance-selected with an explicit, reported budget.
2. **Move relevance selection upstream** of the cap check so facts are selected before counting.
3. **Replace the silent `.slice(0, 24)`** with either a reported truncation or a fail-closed cap, consistent with everything else.
4. **Report, never hide.** Any selection must appear in diagnostics with what was dropped and why. The current "fail rather than silently truncate" principle is correct and must survive: the change is *which* data is eligible for selection, not whether dropping can be silent.
5. Summarisation only if, after tiering, a realistic long campaign still exceeds budget. Defer to a later pass with evidence.

---

## 11. Performance / latency audit

### Deterministic stages, measured

Full table in dimension O. Key results: **total deterministic cost ≈9 ms per turn**, against provider latency measured in seconds. Breakdown by call count per turn:

| Stage | ms/op | Calls/turn | Total |
|---|---:|---:|---:|
| `retrieveForTurn` (lexical) | 2.41 | 1 | 2.41 |
| `playerIntent` | **1.83** | 1 | 1.83 |
| `auditNarration` | 0.67 | 2 | 1.34 |
| `campaign.prepare` | 0.47 | up to 5 | 2.35 |
| `buildTurnContext` | 0.21 | 3 | 0.63 |
| `deriveTurnEvidence` | 0.078 | 2 | 0.16 |
| everything else | — | — | <0.1 |
| **Total deterministic** | | | **≈8.8 ms** |

`playerIntent` is the most expensive single deterministic call at 1.83 ms — unsurprising given it drives the regex-heavy natural-action resolution, and a useful baseline for H1: centralising primitives should not regress it.

### Deterministic versus provider latency

**Separated, and the conclusion is clear: deterministic work is under 0.1% of a turn.** The latency architecture problem is structural:

- Narrator (60 s timeout) → controller (20 s timeout) is **inherently sequential** — the controller needs final narration. Not parallelisable.
- Reconciliation adds a **second full narrator call** when the audit fires, so p99 turn ≈ 2 narrator + 1 controller calls.
- No retry means transient failures become turn failures rather than latency.
- Worst case before failure ≈140 s.

**Therefore: do not optimise deterministic stages for latency.** The levers are reconciliation frequency (reduce audit false positives — which is H1's job, so H1 improves latency indirectly), provider resilience, and streaming the delivered text earlier if the audit allows.

### Avoidable work, honestly ranked

| Issue | Location | Cost | Recommendation |
|---|---|---|---|
| `projectKnowledgeAccess` + `relevanceSignals` fully recomputed just to measure rendered length | [turn-coordinator.ts:201](../../src/turn/turn-coordinator.ts#L201) vs 163 | ~0.001 ms | **Fix — it is free and obviously redundant** |
| Context serialized ~6×/turn | [context-builder.ts:60](../../src/turn/context-builder.ts#L60) ×3, plus lines 124, 165, 201 | ~0.12 ms | Low priority; grows linearly with context |
| `prepare` does 2 `structuredClone` + 2 `stableData` per call, ×5 | [campaign-state.ts:45-54](../../src/campaign/campaign-state.ts#L45-L54) | ~2.35 ms | **Leave.** It buys the atomicity guarantee. Revisit only if snapshots grow 10×. |
| `buildTurnContext` ×3 | lines 65, 90, 185 | ~0.63 ms | Leave; each reflects a genuinely different snapshot |

### Work that grows with world or scene size

OBSERVED_FROM_CODE — these matter more than the constants:

| Pattern | Location | Complexity |
|---|---|---|
| `canonical_awareness`: `world.listEntities().filter(...)` **per present character** | [context-builder.ts:45](../../src/turn/context-builder.ts#L45) | **O(present × entities)** — grows with both |
| `visibleItem`: `snapshot.items.find(...)` inside a `filter`, plus 2 `getEntity` per item | [context-builder.ts:26-27](../../src/turn/context-builder.ts#L26-L27) | **O(items²)** |
| facts filtered by `knowledge.some(...)`, then knowledge filtered by `facts.some(...)` | [context-builder.ts:28,34](../../src/turn/context-builder.ts#L28) | **O(facts × knowledge)** |
| `socialProjection.name()` calls `characterView` per invocation, repeatedly | [context-builder.ts:74](../../src/turn/context-builder.ts#L74) | O(calls × characters) |
| `prepare` fixed overhead | [campaign-state.ts](../../src/campaign/campaign-state.ts) | O(snapshot) per call, ×5 |

At the current scale (96 locations, 181 entities, small snapshots) all are harmless — hence "do not prematurely optimize." They are listed because NPC+ raises both scene size and campaign size, and `canonical_awareness` in particular is the one to watch: it is the product of the two growing quantities.

### Recommended measurement

A deterministic latency-regression harness asserting per-stage budgets, plus a scaling test at 10× campaign size. The probe scripts written for this audit are a working prototype and can be adapted.

---

## 12. Persistence hardening

### Current state

| Aspect | Implementation | Assessment |
|---|---|---|
| Save envelope | `caldrevan_campaign_save`, `schema_version: 1`, campaign id, dataset id, metadata, snapshot | strict, validated both directions |
| Schema versioning | `requireVersionOne` rejects anything ≠ 1 ([snapshot-validation.ts:15-18](../../src/campaign/snapshot-validation.ts#L15-L18)) | **reject-only; no migration** |
| Dataset fingerprint | SHA-256 over all authored documents ([world-store.ts:27](../../src/world/world-store.ts#L27)) | correct but **maximum blast radius** |
| Recovery files | `current` + `previous` slots | good |
| Corruption handling | typed `CampaignSaveError`; strict JSON; fatal UTF-8 decode | good |
| Max size | 16 MiB, enforced on read and write | good |
| **Atomic write** | `open(wx, 0o600)` → write → `fsync` → `rename`; `syncDirectory` skipped on win32 with explicit comment | **genuinely atomic** |
| Load validation | envelope shape → dataset match → full snapshot + reference validation | thorough |
| Path safety | symlink/junction rejection per component; hard-link rejection; root-outside-`data` check; Windows device names | **unusually thorough** |
| Compatibility policy | exact dataset-hash match or refuse | safe, impractical under active authoring |

The write path needs no hardening. The gap is entirely compatibility.

### The two problems

**1. Any canon edit invalidates every save.** MEASURED: the working tree modifies ~70 authored YAML files; every save predating it would raise `DatasetCompatibilityError`. During active authoring — which is the current state — saves are effectively disposable. This blocks long-running playtests, which are exactly what NPC+ needs.

**2. Adding a domain is an unmigratable break.** The snapshot schema rejects missing required fields ([validation.ts:21](../../src/campaign/validation.ts#L21)) and unknown fields ([validation.ts:15](../../src/campaign/validation.ts#L15)). So a new `npc_plus: []` domain makes every v1 save invalid, and bumping to `schema_version: 2` makes every v1 save `unsupported_version`. **Both directions are closed.**

### Recommended minimal architecture

Design now, implement in H4. No v1→v1 migrations (there is nothing to migrate).

**Version detection.** Keep `requireVersionOne` as the *floor*; add `SUPPORTED_SCHEMA_VERSIONS` and `CURRENT_SCHEMA_VERSION`. Read `schema_version` before shape validation (already the case).

**Ordered migrations.** A pure, total chain:
```
Migration = { from: N, to: N+1, migrate(raw: unknown): unknown }
```
Applied in sequence from the file's version to current, each step pure and independently tested. Validation runs **once, after** the chain, against the current schema — so migrations never need their own validators.

**Dataset compatibility — separate the two concerns.** Currently one hash answers two different questions. Recommended split:
- **Structural compatibility**: do the entity IDs the save *references* still exist with compatible types? This is what actually matters for load safety.
- **Content identity**: the existing full hash, retained as metadata for provenance and staleness warnings.

A save whose referenced IDs all still resolve should load with a recorded warning, not a hard refusal. This is the change that makes playtest saves survive authoring. It must be explicit and opt-in — never a silent rebase, which invariant 13 rightly forbids.

**Migration test fixtures.** A `tests/fixtures/saves/v{N}/` directory with a hand-written save per version, plus a round-trip property test over all 30 command kinds. Golden files, committed, never regenerated by the code under test.

**Rollback / recovery.** On migration failure: leave both slots untouched, return a typed error naming the failing step. Never write a partially migrated save. The existing `current`/`previous` scheme already supports falling back.

**Unsupported version.** A version *above* current (a save from a newer build) must fail with a distinct, clearly worded code — never be migrated downward.

---

## 13. Observability hardening

### Current diagnostics

MEASURED — `TurnResult` is already strong on success: `controller_proposal`, `authorized_commands`, `authorization[]`, `retrieval` diagnostics (operations, mode, ids, elapsed, outcome), `turn_evidence`, `narration_reconciliation` (delivered, draft, issues, revision, revision_issues), per-provider model/usage/latency, `context_characters` (6 fields), `scene_participants`, `identity`, `travel`, `action_resolution`, `latency` (6 fields). Plus a debug sink for controller parse failures, normalisations and omission candidates.

**The gap is the asymmetry:** failure events carry only `code`, `provider_code`, `narration`, `incomplete`, `base_revision`, `final_revision` ([turn-coordinator.ts:213](../../src/turn/turn-coordinator.ts#L213)). No retrieval diagnostics, no latency, no context sizes, no stage timings. Also: no turn ID, no per-stage timing, and a silent `catch` discarding identity failures ([turn-coordinator.ts:188](../../src/turn/turn-coordinator.ts#L188)).

### Recommended `TurnDiagnostics`

One structure emitted on **both** success and failure. Natural output of the H2 stage decomposition, which makes per-stage timing free.

| Field | Availability | Notes |
|---|---|---|
| `turn_id` | always | new: UUID per turn, correlates logs |
| `revision_in` / `revision_out` | always | `revision_out` absent on failure |
| `stage_timings[]` | always | from H2 stages; the main new capability |
| `retrieval` | always | **currently success-only** |
| `route` | when travelling | exists |
| `provider_latency` | always | **currently success-only** |
| `controller_parse_status` | always | debug-sink only today |
| `proposed_commands` | always | exists |
| `authorized_commands` / `rejected_commands` + reasons | always | exists |
| `audit_findings` | always | exists |
| `reconciliation_used` | always | derivable; **not aggregated** |
| `redaction_used` | always | derivable; **not aggregated** |
| `context_size` | always | **currently success-only** |
| `token_estimates` | always | exists |
| `failure_classification` | on failure | code + provider code + stage |
| `identity_skipped_reason` | when applicable | **new — closes the silent catch** |

### Exposure policy

| Tier | Contents | Rule |
|---|---|---|
| **Always available (dev)** | turn id, revisions, stage timings, failure classification, retrieval mode/outcome, counts | cheap, non-sensitive |
| **Optional debug** | full drafts, revision text, audit issue details, controller raw output, omission candidates | verbose; already behind `debug_sink` |
| **Never exposed to narrator** | all of it. Diagnostics must not re-enter the prompt | enforce by keeping diagnostics out of `buildNarratorPrompt` inputs — currently true |
| **Safe to persist in evaluation logs** | everything except raw provider keys; drafts only in `.build`/eval dirs as today | matches existing JSONL practice |

**Hard constraint:** diagnostics must never become state authority. They are derived, non-authoritative, and must not be persisted into saves — consistent with `CampaignSnapshot` excluding prompt context, receipts and recent conversation today.

---

## 14. Character continuity hardening

### Current behaviour

Promotion is narrow and well-reasoned (DOCUMENTED at [name-establishment.ts:10-25](../../src/turn/name-establishment.ts#L10-L25)): a securely established proper name promotes a narrator-created person; one exception for an unnamed purchased subject. Nothing else promotes. `origin_snapshot` is immutable. Late naming updates an unnamed existing record via `set_profile` without touching ID, legal state, household or relationships.

### Stress matrix

| Scenario | Current behaviour | Evidence | Gap |
|---|---|---|---|
| Same-name people | separate IDs, collision-safe; present one never re-promoted | **tested** ([narrated-promotion.test.ts:150](../../tests/narrated-promotion.test.ts#L150)) | — |
| Same name twice in one exchange | both skipped, `duplicate_name` | **tested** ([narrator-persistence.test.ts:105](../../tests/narrator-persistence.test.ts#L105)) | — |
| Late naming | `set_profile` on existing record | **tested** | — |
| Unnamed purchased subject | promoted via transaction path | **tested** (Maren) | — |
| Canonical NPC vs narrator-created | `campaign_names` + canon-name exclusion | **tested** | — |
| Name collision with canon | skipped | **tested** | — |
| Person disappears / reappears | `leave_scene` keeps the record; resurfaces on return | **tested** (Tomas) | — |
| Save / load | full round-trip | **tested** | — |
| Legal status + identity | independent domains | **tested** | — |
| Household + identity | independent; purchase ≠ membership | **tested** | — |
| **Named after scene changes** | `establishNames` uses `prepared.snapshot` location ([turn-coordinator.ts:184-185](../../src/turn/turn-coordinator.ts#L184)) — the *arrival*, while the naming may have occurred at the origin | OBSERVED_FROM_CODE | **untested** |
| **Movement during a naming turn** | promotion location is arrival; interaction with `leftBehind` unclear | OBSERVED_FROM_CODE | **untested** |
| **Ambiguous pronouns** | authored `sex` only, nearest named subject | 2 tests | **thin** |
| **Promotion evidence spanning quoted dialogue** | `establishedFacts` uses the **shadowed naive splitter** ([narrated-captives.ts:319](../../src/turn/narrated-captives.ts#L319)) | OBSERVED_FROM_CODE | **untested, real divergence** |
| Cross-turn same-name merge | impossible by design — duplicate check is same-exchange only | DOCUMENTED | **the NPC+ pressure point** |

### Must harden before NPC+

1. **Resolve the two sentence splitters** (I, M, 14). The identity path uses a naive non-quote-aware splitter with different `…` handling than the canonical one. One splitter, with a test pinning the divergence.
2. **Test the naming-location interaction** — promotion records the arrival location for a naming that may have happened at the origin. Determine the intended semantics and pin it.
3. **Broaden pronoun ambiguity tests** from 2 to a proper matrix (two same-sex candidates, unnamed + named, pronoun before any named subject).
4. **Decide the cross-turn identity policy explicitly.** Today two turns naming "Maren" produce two records. NPC+ makes this a durable-relationship problem. The *decision* belongs in hardening; the *mechanism* does not.
5. **Emit a diagnostic from the identity `catch`** so systematic promotion failure is visible.

**Not in scope:** NPC+ itself, autonomous behaviour, memory, scheduling, or any identity-merge mechanism.

---

## 15. Authority / security invariant audit

| # | Invariant | Mechanism | Tests | Remaining surface |
|---:|---|---|---|---|
| 1 | Narrator cannot mutate state | narrator returns text only; no campaign handle | lifecycle + "no arbitrary teleportation or prose-invented movement" | **none structurally.** Indirect influence only via audited evidence paths |
| 2 | Controller proposal ≠ authorization | parse → `deriveTurnEvidence` → `authorizeWithEvidence` → `prepare` | 20 tests; "disallowed trust proposal fails local validation" | authorization correctness rests on regex evidence (section 6) |
| 3 | Player input owns deliberate Nicco actions | deterministic effects derive from `player_input` only; `player_agency` audit kind | tested | `player_agency` detection is regex-based |
| 4 | Stale turn cannot commit | `expected_revision` on every prepare + 11 `checkpoint()` calls | 3 `stale_turn` tests; "mutation at state_proposed is stale" | **well covered.** Add per-boundary coverage (section 7) |
| 5 | Failed turn cannot partially commit | single commit at line 193; all prior prepares uncommitted | tested | identity-prepare failure is silent (not unsafe) |
| 6 | `parent` ≠ travel | `findRoute` traverses `connections` only; `entrance` is metadata | geography suites; **no explicit negative test** | **minor gap** — add a test asserting no parent-derived edge exists |
| 7 | Retrieval ≠ authority | read-only service; results are prompt evidence | "hidden retrieval records never enter the prompt" | `known_by` gap is the inverse problem (section 9) |
| 8 | Ownership ≠ household | separate `legal_statuses` and `households` domains | tested | — |
| 9 | Household ≠ following | no follower system; movement needs carry or completed evidence | tested (Tomas) | narrated-movement regexes |
| 10 | Importance ≠ persistence | promotion triggers are name/purchase only; no scoring | tested | — |
| 11 | Unknown ≠ hidden | explicit `visibility` + `known_by`; facts carry `truth: unknown` | DOCUMENTED; in replay suite | — |
| 12 | Unsupported physical consequences cannot become state | 4 conditions only; `SEVERE_TERMS` rejected; `uncommitted_constraint` audit | tested | regex coverage of escalation language |
| 13 | Map PNG is not a runtime dependency | **MEASURED**: zero references to `city_map` or `.png` in `src/` | **true by construction** — no test needed | none |
| 14 | Manual save is explicit | `CampaignSession` dirty flag; writes only on request | "session becomes dirty without a save call" | no autosave (intentional) |

**Overall:** the invariant set is strong and mostly enforced structurally rather than by convention — which is the right design. The residual surface is almost entirely the regex evidence layer (invariants 2, 3, 9, 12), which is precisely what H1 targets. Two small test gaps: invariant 6 has no explicit negative test; invariant 13 needs none.

---

## 16. Failure-mode audit

Rows marked **untested** have no direct test reference (MEASURED by failure-code grep).

| Failure | User-visible outcome | State mutated? | Time mutated? | Recent conversation mutated? | Retry-safe? | Diagnostic? | Tests |
|---|---|:-:|:-:|---|:-:|---|---:|
| Narrator timeout | `turn_failed: narrator_failed` + `provider_code: timeout` | no | no | adds `state_failed` entry if narration existed, else no | **yes** | code + provider_code only | **0** |
| Narrator malformed/empty | `turn_failed: narrator_failed` | no | no | no | yes | code only | **0** |
| Controller timeout | `turn_failed: controller_failed` | no | no | `state_failed` entry retained | **yes** | code + provider_code | 2 |
| Controller invalid JSON | `turn_failed: controller_failed` | no | no | `state_failed` entry | yes | **`controller_parse_failure` debug record** | 2 |
| Controller unsupported command | turn **succeeds**; command rejected | no (for that command) | n/a | normal | n/a | `authorization[].authorized=false` + reason | yes |
| Retrieval provider failure | `turn_failed: retrieval_failed` **before narration** | no | no | no | yes | code | 1 |
| Semantic embedding failure | **falls back to lexical**, turn continues | no | no | normal | n/a | `semantic_status` + `fallback_reason` | yes |
| Stale revision | `turn_failed: stale_turn` | no | no | depends on stage | yes | code | 3 |
| Audit failure (issues found) | **turn succeeds**; reconciliation or redaction | yes — as authorized | yes | **delivered (revised/redacted) text only** | n/a | `narration_reconciliation` | yes |
| Reconciliation failure | revision call fails → `narrator_failed`; **state was already prepared but not committed** | no | no | `state_failed` | yes | code | **0** |
| Cancellation | `turn_failed: cancelled` | no, unless already committed | no | `state_failed` if narration existed | yes | code | 7 |
| Save failure | typed `CampaignSaveError`; campaign stays dirty | no | no | no | yes | typed error code | yes |
| Corrupted save | `invalid_save` / `invalid_json` / `unsafe_path`; `previous` slot available | no | no | no | n/a | typed code | yes |
| Graph unreachable destination | movement not resolved; narrator told nothing changed | no | no | normal | n/a | `action_resolution` status | yes |
| Context overflow | `turn_failed: context_too_large` | no | no | no | **no — deterministic, will recur** | code only | **0** |

### Observations

1. **Fail-closed is consistent.** No failure path mutates campaign state, time, or location. The only history mutation is the `state_failed` recent-conversation entry, which is explicitly excluded from prompt replay ([turn-coordinator.ts:217](../../src/turn/turn-coordinator.ts#L217)).
2. **Most failures are retry-safe but nothing retries** (section 8). Five rows are safely retryable and all currently surface as lost turns.
3. **`context_too_large` is the one non-retryable failure** — deterministic, so it recurs until state changes. MEASURED-reachable four ways, zero tests. This is the failure that can brick a campaign and it is the least covered.
4. **Reconciliation failure is the subtlest path:** state has been prepared (line 158) but the revision narrator call fails, so the turn fails with valid prepared state discarded. Correct, untested.
5. **Diagnostics on failure are minimal** across the board — the section 13 gap, visible here as fourteen rows whose diagnostic column says "code only."

---

## 17. Maintainability target

### Concrete metrics and proxies

All MEASURED.

| Metric | Value | Target |
|---|---:|---|
| Largest source file (chars) | `narration-audit.ts` **49,168** | <30,000 |
| Largest by lines | `narration-audit.ts` 428 | — |
| `turn-coordinator.ts` | **221 lines / 21,132 chars**, avg 95 ch/line, max 440 | <150 lines/stage file |
| `runTurn` single function | **176 lines**, 14 responsibilities, 13 mutable locals | 8 stages |
| `src/turn/` share of source | **45% of chars in 21% of files** (374,431 / 832,884; 26 / 122) | <35% |
| Regex literals in `src/turn/` | **185** | no increase |
| Named regex constants in `src/turn/` | **71** | consolidate ~15 into primitives |
| Negation/modality gates | **13** | 1 parameterised primitive |
| Coordinator import sources | **26** | <12 per stage |
| `CampaignCommand` union | **30** variants | no growth without a domain seam |
| Responsibility domains per turn | **14** | 8 |
| Duplicate `esc` | **12** | 1 |
| Duplicate `STOP` sets | **6** (all different) | ≤2, documented |
| Duplicate `NUMBER_WORDS` | **3** (inconsistent ranges) | 1 |
| Duplicate `sentencesOf` | **2** (behaviourally different) | 1 |
| Duplicate `quotedSpans` | **2** | 1 |
| Cyclomatic complexity tooling | **none configured** | optional |
| Test-to-source ratio | 8,459 / 9,847 = **0.86:1** | ≥1:1 in `src/turn/` |

### Recommendations with a clear reliability payoff

Only these. **No style rewrites, no formatting passes, no arbitrary file splitting.**

| Change | Reliability payoff | Risk |
|---|---|---|
| Single `esc` | removes 11 copies that could drift | none |
| Single `quotedSpans` | quote handling must be identical between evidence and audit | none |
| Single `sentencesOf` | **fixes a real behavioural divergence in the identity path** | low–medium |
| Single `numberValue` | **fixes 13/14 being parseable in one module and not another** | low |
| Parameterised negation/modality primitives | makes the section 6 matrix testable and fixes the bare-`no` inconsistency | medium |
| Documented `STOP` sets | each is scope-specific; make that explicit or merge | low |
| Coordinator stage extraction | per section 5; enables stage timings and NPC+ extension | medium–high |

**Explicitly not recommended:** splitting `narration-audit.ts` purely for size. Its 49 KB is 99 cohesive audit rules; splitting it without a behavioural reason would add indirection and risk without payoff. Size is a signal here, not a defect.

---

## 18. Extensibility target

### Would adding NPC+ today require…

| Question | Answer | Evidence |
|---|---|---|
| Modify `CampaignState` core? | **No.** Add one `prepareNpcCommand` to the chain | [campaign-state.ts:49](../../src/campaign/campaign-state.ts#L49) — clean five-way seam |
| Enlarge `TurnCoordinator`? | **Yes, unavoidably today.** No turn-stage extension point exists; any NPC+ turn behaviour edits `runTurn` directly | [turn-coordinator.ts:45-220](../../src/turn/turn-coordinator.ts#L45-L220) |
| Enlarge the prompt builder directly? | **Yes.** `buildNarratorPrompt` composes fixed sections with no registry | [prompt-builder.ts:166](../../src/turn/prompt-builder.ts#L166) |
| Add new command variants? | **Yes** — the union grows from 30 | [types.ts:125-162](../../src/campaign/types.ts#L125-L162) |
| Alter the save schema? | **Yes, and it is a hard break.** New required domain → every v1 save invalid; bumping to v2 → `unsupported_version`. **Both directions closed** | [validation.ts:15,21](../../src/campaign/validation.ts#L15), [snapshot-validation.ts:15-18](../../src/campaign/snapshot-validation.ts#L15-L18) |
| Alter character types? | **Yes** — `CampaignCharacter` gains NPC+ state | [types.ts](../../src/campaign/types.ts) |
| Create cyclic dependencies? | **No.** MEASURED: `tsc` reports none; `WorldStore` and persistence are strong boundaries | typecheck clean |

### Seams to stabilise first

Ranked by how much they reduce NPC+'s blast radius.

1. **Save schema versioning + migration (H4).** Without it, NPC+ either discards every playtest save or ships unversioned. **Highest-value seam** and the clearest reason to harden before building.
2. **Turn stage contracts (H2).** Converts "edit the 176-line generator" into "add a stage or extend one." Without it, NPC+ grows the single highest-risk function in the project.
3. **Prompt section registry (H2/H3).** A list of named context contributors, each bounded and individually capped, so NPC+ adds a section instead of editing one function — and so section 10's tiered budget has something to tier.
4. **Context budget tiering (H3).** NPC+ raises present-people and knowledge-edge counts, which are the caps nearest to firing. Tier before adding pressure.
5. **Domain command seam (already good).** Needs only a test adding a synthetic domain to prove it holds.

**Goal restated:** after H2–H4, NPC+ should be *one domain module, one prepare handler, one prompt section, one migration step, one stage extension* — not a change that spreads through the coordinator, prompt builder, context builder, validator and save format simultaneously. That is achievable from here; it is not true today.

---

## 19. Hardening pass plan

Five passes plus a reassessment. Grouping is driven by the evidence: H1 is largest because the measured defects cluster there; H2 is gated on H1 because decomposition without tests is the riskiest thing in the plan.

### PASS H1 — Deterministic language and invariant hardening

**Purpose.** Make the regex evidence layer explicit, shared and tested. Fix the four measured defects. No widening of language coverage.

**Scope.**
- Create `src/turn/language/` with parameterised primitives: `negation`, `modality` (epistemic vs intentional, separated), `refusal`, `completedAction`, `subjectOf`, `resolvePronoun`, `exactName`, `esc`, `numberValue`, re-exported `sentencesOf`/`blankQuotes`/`quotedSpans`.
- Rewire all 14 gate sites behind primitives, **one at a time, each with a gate-for-gate equivalence test** proving the verdict table is unchanged except where a divergence is deliberately resolved.
- Fix: bare-`no` lookahead in the 3 gates missing it; delete the shadowed `sentencesOf`; unify `NUMBER_WORDS`; delete 11 `esc` copies and 1 `quotedSpans` copy.
- Add the section 7 property, permutation, idempotency, ambiguity and negation-matrix suites, plus the **correct-narration-survives-audit** corpus.
- Add the 5 untested failure codes and the explicit `parent` ≠ travel negative test.

**Files.** `src/turn/language/*` (new); the 14 gate sites; `narrated-captives.ts`; `sentences.ts`; `person-transactions.ts`; `tests/*` (many new).

**Forbidden.** Widening language coverage; new command variants; coordinator restructuring; prompt changes; new audit kinds.

**Prerequisites.** None. Start here.

**Tests to add.** ~120–180 new assertions: negation matrix (13 gates × ~15 cues), property suites (6 areas), failure codes (5), ambiguity matrix, audit-preservation corpus, route permutation.

**Dimensions improved.** D, E, G, H, I, M, and `deterministic_language_robustness`.

**Expected delta (JUDGEMENT, range).** Code health **+2.5 to +4.0**; core deterministic **+2.0 to +3.5**; functional runtime **+1.0 to +2.0**.

**Regression risk.** **Medium.** Mitigated entirely by equivalence testing: no gate changes verdict without an explicit, reviewed test change. The bare-`no` fix *is* an intended behaviour change and must be called out as such.

**Completion gate.** 947 + new tests all green; negation matrix committed as a locked table; zero duplicate `esc`/`quotedSpans`/`sentencesOf`/`NUMBER_WORDS`; all 11 failure codes referenced by at least one test.

### PASS H2 — Turn pipeline decomposition and maintainability

**Purpose.** Extract the eight stages from section 5 with **zero behaviour change**, enabling stage timings and NPC+ extension.

**Scope.** `TurnInputStage`, `IntentResolutionStage`, `RetrievalStage`, `NarrationStage`, `ControllerStage`, `AuthorizationStage`, `AuditStage`, `CommitStage`. Each returns a frozen typed value. Publication stays a helper. Checkpoint and yield positions preserved **exactly**. Thread a `turn_id`. Replace the 13 mutable locals with explicit stage inputs/outputs. Prompt section registry.

**Files.** `src/turn/stages/*` (new); `turn-coordinator.ts` (shrinks to orchestration); `turn-types.ts`; `prompt-builder.ts`.

**Forbidden.** Any behaviour change; reordering stages; moving a checkpoint; changing commit timing; changing audit decisions; new commands or domains.

**Prerequisites.** **H1 complete.** Decomposing a 176-line function whose language layer is untested is the single riskiest action available; H1's tests are the safety net.

**Tests to add.** Stage-contract tests (input → output purity for stages 1–7 and 11–12); a golden end-to-end test asserting event sequence and `TurnResult` are byte-identical before and after; stage-timing presence.

**Dimensions improved.** A, M, N, P, O (indirectly).

**Expected delta.** Code health **+1.5 to +3.0**; core deterministic **+0.5 to +1.5**; functional runtime **+1.5 to +3.0**.

**Regression risk.** **High** — highest in the plan. Mitigation: the golden-output test must be written and passing *before* any extraction, and each stage extracted in a separate reviewable step.

**Completion gate.** Golden end-to-end output byte-identical; all stages pure where claimed; `runTurn` under 60 lines; stage timings present in diagnostics; full suite green.

### PASS H3 — Retrieval and context scale hardening

**Purpose.** Fix the `known_by` unreachability, remove silent truncation, tier context budgets, extend retrieval metrics.

**Scope.**
- Narrator-only awareness projection keyed on `known_by`, independent of retrieval and player visibility, with an explicit non-disclosure contract (mirroring `confidential_encounter`).
- Replace `.slice(0, 24)` with a reported or fail-closed cap.
- Tier caps by authority; **move `selectRelevantFacts` upstream of the cap check**; report every selection in diagnostics.
- Extend eval cases with `forbidden[]`, `audience`, `mode`, `should_retrieve`, `rank_expectation`; add precision-at-limit, secret-leakage and unnecessary-retrieval metrics.
- Add the missing `context_too_large` boundary tests at cap and cap+1 for all six caps.

**Files.** `context-builder.ts`; `narrative-authority.ts`; `retrieval-policy.ts`; `tests/retrieval-eval/cases.ts` + `evaluate.ts`; tests.

**Forbidden.** Implementing summarisation; raising caps without tiering; weakening visibility filtering; any change that lets authoritative scene state be dropped.

**Prerequisites.** H2 for the prompt section registry (soft — H3 can start on the retrieval half independently).

**Tests to add.** Secret-leakage must be **0**; boundary tests for all six caps; a long-campaign scenario proving facts beyond 32 degrade by relevance rather than failing; `known_by` reachability test.

**Dimensions improved.** L, `context_scale_behavior`, G, J (slightly).

**Expected delta.** Code health **+1.0 to +2.0**; core deterministic **+0.5 to +1.0**; functional runtime **+3.0 to +5.0**.

**Regression risk.** **Medium-high** on the `known_by` projection — it touches a disclosure boundary. Mitigation: secret-leakage rate as a hard zero gate, plus explicit tests that player-visible output is unchanged.

**Completion gate.** Secret leakage 0; multi-answer Recall@5 ≥0.75; all six caps boundary-tested; a 60-fact campaign builds context successfully with reported selection.

### PASS H4 — Persistence and diagnostics hardening

**Purpose.** Make saves survive canon evolution and schema growth; make failures observable.

**Scope.**
- Versioned migration architecture: `SUPPORTED_SCHEMA_VERSIONS`, ordered pure migration chain, validate-once-after, typed failure, distinct future-version error. **No v1→v1 migrations.**
- Split structural compatibility from content identity; load with a recorded warning when referenced IDs still resolve. Explicit, never silent.
- `TurnDiagnostics` emitted on success **and failure**; `turn_id`; stage timings from H2; identity-skip diagnostic replacing the silent `catch`.
- Migration fixture directory; save/load round-trip property test over all 30 command kinds; save-loader fuzz test.

**Files.** `snapshot-validation.ts`; `save-format.ts`; `campaign-repository.ts`; `turn-coordinator.ts`/stages; `turn-types.ts`; `tests/fixtures/saves/*` (new).

**Forbidden.** Silent dataset rebase; autosave; writing partially migrated saves; making diagnostics authoritative or persisting them into saves.

**Prerequisites.** H2 for stage timings (diagnostics half). Persistence half is independent.

**Tests to add.** Round-trip property over 30 command kinds; fuzz over mutated save bytes; unsupported-version and future-version fixtures; diagnostics-on-failure assertions for all 11 codes.

**Dimensions improved.** F, P, N, `runtime_save_usability`.

**Expected delta.** Code health **+1.0 to +2.0**; core deterministic **+1.0 to +2.0**; functional runtime **+1.5 to +3.0**.

**Regression risk.** **Medium** — the save format is a compatibility surface. Mitigation: golden save fixtures committed and never regenerated by the code under test.

**Completion gate.** A save made before a canon edit loads with a warning after it; migration chain tested end-to-end; all 11 failure codes emit structured diagnostics.

### PASS H5 — Live model soak and runtime reliability

**Purpose.** Close the largest measured gap: live-model robustness 61.

**Scope.**
- Bounded retry with jittered exponential backoff, max 2 attempts, **only** on `timeout`/`rate_limited`/`provider_unavailable`; `checkpoint()` before each attempt. Deterministic test with an injected failing transport proving exactly-one-commit.
- Optional fallback narrator model, explicitly configured, never silent.
- Extend `quantile` usage to **p95/p99**; aggregate reconciliation and redaction rates; consolidate the section 8 matrix into one reporting command.
- Run the soak at the "meaningful comparison" size (120 turns) as the gate; "pre-release" (450) before NPC+ ships.

**Files.** `client.ts` or a new `retry.ts`; `minimax-narrator.ts`; `deepseek-controller.ts`; `eval-narrators.ts`; `narrator-bakeoff.ts`; tests.

**Forbidden.** Retrying non-idempotent or non-transient classes; retrying after commit; silent model substitution; treating fixture narration as live evidence.

**Prerequisites.** H4 diagnostics (the matrix aggregates them). H1 reduces audit false positives and therefore reconciliation rate, improving the numbers H5 measures — so H1 first materially helps here.

**Tests to add.** Injected-transient-failure retry tests (deterministic, free); exactly-one-commit under retry; non-retryable classes never retried.

**Dimensions improved.** Q (largest single weighted gain), O, G, P.

**Expected delta.** Code health **+1.0 to +2.0**; core deterministic **+0.5 to +1.0**; functional runtime **+5.0 to +8.0**.

**Regression risk.** **Medium** — retry must not double-commit. Safe by construction (no mutation before the single commit) but must be asserted.

**Cost.** The only pass requiring a paid budget. 120 turns × 2 providers at the measured per-turn cost; the harness already reports `provider_reported_cost_usd` for budgeting.

**Completion gate.** Deterministic retry tests green; 120-turn soak completed with p95 reported; narrator success rate, controller valid-JSON rate and reconciliation rate all recorded as baselines for comparison.

### PASS H6 — Final reassessment

**Purpose.** Re-measure, re-score, decide on NPC+.

**Scope.** Re-run every section 2 check; recompute all three layer scores using the section 1 formulas unchanged; diff against this document; confirm or revise exit gates; produce the NPC+ go/no-go.

**Forbidden.** Changing the scoring formulas or weights to reach a target. If a gate is missed, report it missed.

**Prerequisites.** H1–H5.

**Expected delta.** None — measurement only.

**Completion gate.** A reassessment report with measured scores and an explicit gate verdict.

### Sequencing summary

```
H1 (language + invariants)  ──┬──▶ H2 (decomposition) ──┬──▶ H3 (retrieval + context)
   no prerequisites          │                          └──▶ H4 (persistence + diagnostics)
                             │                                      │
                             └──────────────────────────────────────┴──▶ H5 (live soak) ──▶ H6
```

H3's retrieval half and H4's persistence half can run in parallel with H2 if needed. H5 must be last before H6 because it measures the cumulative result.

---

## 20. Score projection

Three projections. All deltas are **JUDGEMENT** ranges; the arithmetic combining them is MEASURED. Formulas and weights from section 1, unchanged.

| Projection | Code health | Core deterministic | Functional runtime | Project maturity |
|---|---:|---:|---:|---:|
| **Baseline** | 84.4 | 88.2 | 74.3 | 43 |
| **A. Conservative** | **87.2** | **90.3** | **79.4** | 45–47 |
| **B. Expected** | **90.5** | **93.0** | **85.9** | 48–52 |
| **C. Best reasonable** | **93.3** | **95.2** | **90.5** | 50–55 |
| *Target* | *92–95* | *96–98* | *90–95* | *~50–60* |

**A. Conservative** — H1–H4 land; H5 ships retry but the soak runs only at smoke size (no paid budget). Language and test work deliver, runtime evidence does not.

**B. Expected** — all six passes land; soak runs at the meaningful-comparison size; the `known_by` and context-tiering work succeeds without complications.

**C. Best reasonable** — everything lands cleanly, soak at pre-release size, no pass discovers a blocking complication. **Deliberately assumes no perfect scores**: the highest single dimension reaches 96, live-model robustness reaches 87 (not 95, because probabilistic model behaviour cannot be engineered to near-certainty), and canon consistency reaches 90.

### Which improvements are evidence-backed versus judgement

| Improvement | Basis |
|---|---|
| Test coverage gains | **Evidence-backed.** 5 untested failure codes, 0 property/permutation/idempotency tests — adding them provably raises coverage |
| Duplicate-utility consolidation | **Evidence-backed.** 12 `esc`, 6 `STOP`, 3 `NUMBER_WORDS`, 2 splitters — all counted |
| Retry robustness gain | **Evidence-backed defect, judgement magnitude.** Absence of retry is measured; how much it raises a 61 is judgement |
| Context-cap tiering | **Evidence-backed.** Cap order and the late-relevance sequencing are measured |
| `known_by` fix | **Evidence-backed mechanism, judgement magnitude** |
| Coordinator decomposition value | **Judgement.** Density is measured; that decomposition improves reliability is an inference |
| Maintainability 74 → 88 | **Judgement.** No complexity tooling exists, so this is proxied |
| Live-model 61 → 87 | **Judgement, weakest in the set.** Depends on soak results that do not exist yet. **Treat as the least reliable number in this report.** |
| Narrator grounding gain | **Partly evidence-backed** (bare-`no` fix), partly judgement |

### The gate problem

**MEASURED arithmetic: the best-reasonable projection reaches core deterministic 95.2, below the stated 96 minimum.** Sensitivity-tested: excluding `world_canon_consistency` as an authoring axis and re-normalising gives **95.6** — still short.

The cause is structural, not pessimism. At best-reasonable, the nine core dimensions sit at 96, 96, 96, 96, 95, 95, 94, 96 and 90. Six started between 82 and 91; bounded hardening moves such dimensions to 94–96, not 97–98. Reaching a weighted 96+ requires essentially every core dimension at 96+ simultaneously, including authored-canon quality at ~95 — which is authoring volume, not hardening.

**Recommendation: revise the core gate to ≥94 (stretch 95–96).** Expected (93.0) nearly meets it and best-reasonable (95.2) clears it comfortably. The 96–98 band is reachable, but as a *post-hardening* goal spanning additional canon authoring and a second hardening cycle — not from this baseline in four to six bounded passes.

---

## 21. Hardening exit gates

### Recommended gates

| Layer | Stated minimum | **Recommended minimum** | Stated preferred | **Recommended preferred** | Rationale |
|---|---:|---:|---:|---:|---|
| Code health | ≥92 | **≥92** (unchanged) | 94–95 | **93–95** | Expected 90.5, best 93.3. Achievable; preferred band tightened to the top of what the arithmetic supports |
| Core deterministic | ≥96 | **≥94** | 97–98 | **95–96** | **Revised.** 96+ unreachable under any defensible weighting from 88.2 in bounded passes (section 20) |
| Functional runtime | ≥90 | **≥88** | 92–95 | **90–92** | Best reasonable is 90.5 — the stated 90 minimum is met only in the best case. ≥88 is a gate the plan can actually clear |

### Objective, measurable gate conditions

Scores are judgement-laden, so each gate pairs with hard measurable conditions. **These are the real gates.**

| # | Condition | Threshold | Verification |
|---:|---|---|---|
| 1 | Deterministic suite | **100% pass**, ≥1,100 tests, 0 skipped | `npm test` |
| 2 | Curated replay | **25/25** | `npm run test:playthrough` |
| 3 | Typecheck | clean | `npm run typecheck` |
| 4 | Failure-code coverage | **all 11** codes referenced by ≥1 test | grep |
| 5 | Negation matrix | committed as a locked table; every gate's verdict per cue asserted | test file |
| 6 | Duplicate primitives | `esc`, `quotedSpans`, `sentencesOf`, `NUMBER_WORDS` each defined **once** | grep |
| 7 | Context caps | all six boundary-tested at cap and cap+1 | test file |
| 8 | Secret leakage | **0** across the extended retrieval benchmark | `eval:retrieval` |
| 9 | Multi-answer Recall@5 | **≥0.75** (from 0.615) | `eval:retrieval` |
| 10 | Save compatibility | a save predating a canon edit loads with a warning after it | integration test |
| 11 | Diagnostics on failure | structured diagnostics for all 11 codes | test file |
| 12 | Retry safety | injected-transient tests prove **exactly one commit** | test file |
| 13 | Live soak | ≥120 turns, p95 reported, narrator success and controller valid-JSON rates recorded | `eval:narrators` |
| 14 | Golden turn output | byte-identical `TurnResult` across the H2 refactor | test file |
| 15 | `runTurn` size | **<60 lines** | wc |

A gate missed must be **reported as missed**, never met by adjusting weights. H6 owns that verdict.

### Project maturity

**Not a mandatory gate**, per the brief. Projected 48–55 against the 50–60 aspiration. Maturity should rise only where existing subsystems genuinely complete — realistically: persistence (migration makes long campaigns viable), retrieval (known_by closes a documented gap), observability (diagnostics complete). It should **not** be pushed to 50–60 by opening new gameplay domains during a hardening phase, and nothing in this plan does so.

---

## 22. Stop conditions

Classification is deliberately conservative. **BLOCKER** means NPC+ cannot proceed safely until fixed.

### BLOCKER

**None.**

No finding meets the bar. The authority model holds structurally, every failure path is fail-closed, no state-corruption path was found, and the save format — while inconvenient — is safe (it refuses rather than mis-loads). NPC+ *could* begin on this foundation. Two findings below mean it would be considerably more expensive and would inherit known problems, which is a strong argument for hardening first — but not a safety blocker.

### HIGH PRIORITY — fix before NPC+

| # | Finding | Why before NPC+ | Pass |
|---:|---|---|---|
| 1 | **No save schema versioning or migration; any canon edit invalidates every save** (F, N) | NPC+ *requires* a new domain, which is an unmigratable break in both directions. Doing this during NPC+ means either discarding every playtest save or designing migration under feature pressure. Long playtests are exactly how NPC+ gets validated. | H4 |
| 2 | **13 divergent negation/modality gates with no shared primitive** (G, H, M) | NPC+ adds autonomous behaviour, more dialogue and more evidence paths — every new path would add a 14th and 15th gate. Centralise before multiplying. The bare-`no` inconsistency and the shadowed splitter are live defects in the identity path NPC+ builds on. | H1 |
| 3 | **No provider retry; one transient failure loses a turn** (Q, O) | NPC+ increases turns per session and prompt size. Lost turns during long playtests destroy the evaluation signal NPC+ needs. | H5 |
| 4 | **Context count caps fire early; relevance selection runs after the cap check** (context scale) | NPC+ directly increases present-people and knowledge-edge counts — the two caps nearest to firing (24 and 96). Adding pressure before tiering invites `context_too_large` in exactly the scenarios NPC+ exists to create. | H3 |

### MEDIUM

| # | Finding | Pass |
|---:|---|---|
| 5 | `known_by` unreachable for restricted entities; authored NPC knowledge is inert | H3 |
| 6 | Silent `.slice(0, 24)` in the knowledge-permission path, inconsistent with fail-closed policy | H3 |
| 7 | Failed turns emit almost no diagnostics | H4 |
| 8 | Two sentence splitters, one shadowing the other in the identity path | H1 |
| 9 | 5 of 11 failure codes untested; `context_too_large` reachable 4 ways with 0 tests | H1 |
| 10 | `TurnCoordinator` concentration: 176-line generator, 14 responsibilities, 13 mutable locals | H2 |
| 11 | Silent `catch` discarding identity establishment | H1/H4 |
| 12 | `NUMBER_WORDS` inconsistency (13/14 parseable in one module, not another) | H1 |
| 13 | Multi-answer Recall@5 at 0.615 | H3 |
| 14 | No property, permutation or idempotency tests anywhere | H1 |
| 15 | Naming-location semantics when a scene change occurs in the naming turn | H1 |

### OPTIONAL

| # | Finding | Note |
|---:|---|---|
| 16 | `projectKnowledgeAccess` recomputed to measure length | Free fix; negligible cost |
| 17 | Context serialized ~6× per turn | Measured negligible at current scale |
| 18 | O(items²) and O(present × entities) patterns in `buildTurnContext` | Harmless now; watch under NPC+ |
| 19 | 6 divergent `STOP` sets | Document scope or merge |
| 20 | No complexity tooling | Proxies are adequate |
| 21 | No explicit `parent` ≠ travel negative test | Invariant holds; test is cheap |
| 22 | Only 25 chunks for 181 entities | Authoring volume, not engine |
| 23 | `narration-audit.ts` at 49 KB | Cohesive; splitting for size alone is not recommended |

---

## 23. Final priority table

Sorted by risk-adjusted payoff: (expected score benefit × evidence strength) ÷ (effort × regression risk).

| # | Priority | Finding | Current score impact | Target | Effort | Risk | Pass | Expected payoff |
|---:|---|---|---|---|---|---|---|---|
| 1 | **HIGH** | 5 untested failure codes; no property/permutation/idempotency tests | D 88 | D 94 | **S** | **None** | H1 | **Highest.** Pure addition, measured gap, immediate certainty gain |
| 2 | **HIGH** | Duplicate primitives: 12 `esc`, 2 `quotedSpans`, 3 `NUMBER_WORDS`, 2 splitters | M 74, I 83 | M 88, I 93 | **S–M** | **Low** | H1 | Fixes 2 real defects (shadowed splitter, 13/14 gap) at trivial cost |
| 3 | **HIGH** | No provider retry; single transient failure loses a turn | Q 61 | Q 85 | **S–M** | Medium | H5 | Largest weighted runtime gain (22 × 24); safe by construction |
| 4 | **HIGH** | 13 divergent negation gates; bare-`no` fix in only 1 of 4 | G 81, H 88, M 74 | G 90, H 95 | **L** | Medium | H1 | Measured inconsistency; reduces over-redaction; prerequisite for NPC+ |
| 5 | **HIGH** | Context caps fire early; relevance selection runs after the cap | ctx 74 | ctx 92 | **M** | Med-high | H3 | Prevents campaign-bricking `context_too_large`; NPC+ prerequisite |
| 6 | **HIGH** | No save versioning/migration; canon edit invalidates all saves | F 82, N 78 | F 93, N 88 | **M–L** | Medium | H4 | Unblocks long playtests; the clearest NPC+ prerequisite |
| 7 | **MEDIUM** | Failed turns emit almost no diagnostics | P 82 | P 94 | **S–M** | Low | H4 | Prerequisite for the H5 soak matrix; cheap |
| 8 | **MEDIUM** | `known_by` unreachable; silent `.slice(0, 24)` | L 76 | L 88 | **M** | Med-high | H3 | Fixes a documented gap making authored knowledge inert |
| 9 | **MEDIUM** | Retrieval metrics: no forbidden/leakage/precision; multi-answer 0.615 | L 76 | L 88 | **S–M** | Low | H3 | Harness exists; extension is cheap; secret-leakage gate is valuable |
| 10 | **MEDIUM** | `TurnCoordinator` concentration (176 lines, 14 responsibilities) | A 86, M 74, N 78 | A 92, N 88 | **L** | **High** | H2 | Large enabling value, highest risk — hence gated behind H1 |
| 11 | **MEDIUM** | Character continuity stress gaps (naming location, pronouns) | I 83 | I 93 | **S–M** | Low | H1 | Direct NPC+ prerequisite; additive |
| 12 | **MEDIUM** | p95/p99 absent; reconciliation/redaction not aggregated | Q 61, O 72 | Q 85, O 88 | **S** | Low | H5 | `quantile` already exists; near-free |
| 13 | **LOW** | Silent identity `catch` | C 91, P 82 | C 96 | **S** | None | H1 | One diagnostic line |
| 14 | **LOW** | No `parent` ≠ travel negative test | determinism 90 | 96 | **S** | None | H1 | Cheap invariant assertion |
| 15 | **LOW** | `projectKnowledgeAccess` recomputed for length | O 72 | O 88 | **S** | None | H2 | Free; obviously redundant |
| 16 | **OPTIONAL** | O(items²), O(present × entities) in context builder | O 72 | — | **M** | Low | defer | Harmless now; revisit under NPC+ scale |
| 17 | **OPTIONAL** | 6 divergent `STOP` sets | M 74 | M 88 | **S** | Low | H1 | Document scope; likely intentional |
| 18 | **OPTIONAL** | Only 25 chunks for 181 entities | J 86 | J 90 | **L** | None | defer | Authoring, not hardening |

Effort key: **S** ≤1 day · **M** 2–4 days · **L** ≥1 week.

---

## 24–26. Audit discipline statements

**Report files.** This document and [CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.json](CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.json), with stable field names for later charting.

**Evidence discipline.** Every substantive claim is labelled MEASURED, OBSERVED_FROM_CODE, DOCUMENTED or JUDGEMENT. All score deltas are ranges. Two places where an initial hypothesis was wrong are stated explicitly rather than quietly dropped: the unanchored-regex claim in section 6 (a grep-truncation artifact — the regexes are correctly anchored) and the same-name-collision test gap in section 14 (it *is* tested). The weakest number in the report — live-model robustness 61 → 87 — is flagged as such in section 20.

**No implementation.** No source, authored data, test or configuration file was modified. The only writes are these two report files. Nothing was committed or pushed. Probe scripts were written to a session scratchpad outside the repository. `audit-authored-data.ts` was deliberately not run because it writes an unrequested artifact into `docs/evaluations/`.

**Paid calls.** No narrator or controller calls. One configured low-cost mechanism ran — `npm run eval:retrieval`, 1 embedding request over 94 input texts — and was not repeated.

---

## 27. Final status

Baseline reproduced exactly (947/947, 25/25, typecheck clean, all city metrics identical). All 27 requested sections delivered. Three layer definitions with explicit formulas and weights. Eighteen dimensions gap-analysed. Five hardening passes plus reassessment, with scope, forbidden scope, prerequisites, tests, expected deltas, risk and completion gates. Three projections. Objective exit gates, with one recommended revision stated plainly and the full plan delivered regardless.

CALDREVAN HARDENING GAP-TO-TARGET AUDIT COMPLETE
