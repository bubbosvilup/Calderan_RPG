# Structured reflection wire V2 — citation-contract local recheck

Reviewed 2026-10-04, Europe/Rome. **LOCAL PASS; provider qualification pending.** Paid calls **0**, production changed **NO**, D-09 **SOAK PENDING**. This supplements and preserves the [failed V2 local experiment](STRUCTURED_REFLECTION_WIRE_V2.md); it does not overwrite its source, report or raw evidence.

## CURRENT CONTRACT BUG / VISIBLE VS AUTHORITATIVE

Full catalog membership does not make an unexposed handle citable. V2.3-CVC rejects such model references while retaining hidden validation authority. A quote record omitted from the request can still have its exact selector already exposed in typed event metadata. The old root-only wire derivation missed those selectors. The [citation visibility contract](D09_REFLECTION_CITATION_VISIBILITY_CONTRACT.md) defines the precise eligibility and existing exact provenance relation.

## IMPOSSIBLE-CITATION AUDIT

Of 324 unique reviewed objects across V2.2/V2.3 development/OOS corpora, 35 violate visibility, all misleading real provider outputs and all already rejected. Fifteen unreviewed invalid-attempt objects are kept separate. One useful event-equivalent output uses transmitted typed selectors, not guessed hidden IDs. Separately, 951 generated prior wire variants cite truly hidden evidence and are excluded by the contract. No useful reviewed object is lost.

## CLAIM-FAMILY EFFECTS / SELF-STATEMENT PROVENANCE / RELATIONSHIP CURRENT AUTHORITY

No claim family is redesigned. Quote selectors already exposed on exact linked events remain valid. Events themselves are not silently converted into a new statement selector form. Visible two-dimension histories still validate against hidden current snapshots; direct unexposed snapshot citations fail. Other families still require appropriate visible support. No arbitrary hidden-fact resolution is added.

## REGRESSION

V2.3 OOS replay: useful 35/35 preserved; misleading admitted 0/63; factual false, neutral collateral and stale violations all zero. Semantic development gate PASS precedes this wire recheck. This is development replay of reviewed evidence, not independent OOS.

## WIRE LOCAL EQUIVALENCE

Equivalence applies only to outputs satisfying canonical structure, the citation visibility contract and the candidate semantic validator. It does not include arbitrary objects assembled with invisible catalog handles.

Forty frozen requests: the original 24-request reliability screen (three per family), plus 16 distinct confirmation requests. Neither corpus nor prompt is rewritten. Evidence enum values are exact citable received handles, including verified typed quote-handle exposures; statement enums are exact received statement selectors; location enums are literal eligible visible movement endpoints. No other IDs are constrained. Canonical validation and semantic validation remain mandatory.

| Claim family | Accepted local samples |
| --- | ---: |
| relationship_trajectory | 6,588 |
| relationship_contrast | 630 |
| relationship_parallel | 1,662 |
| condition_trajectory | 2,328 |
| membership_trajectory | 3,993 |
| movement_trajectory | 5,502 |
| self_statement_synthesis | 6,036 |
| environmental_motif | 1,725 |
| Total | 28,464 |

Wire contextual false rejections **0**. The 951 contract exclusions are reported separately. Confidence/context variants are correlated structural checks, not statistical reliability observations or independent semantic scoring.

Safety checks **205 passed**: prose/foreign evidence refs, N/A statement refs and invented location prose reject. Duplicate evidence and statement references may pass provider wire structure but must fail unchanged canonical uniqueness. Empty envelopes remain valid. Full schema UTF-8 byte min/median/max: **3,973 / 4,310 / 5,140**. Provider token cost, syntax acceptance and enum enforcement remain unmeasured.

## DECISION

**Semantic candidate PASS; wire local candidate PASS; no paid dispatch authorized or performed.** `candidate-freeze.json` records the local-only status, candidate source and wire generator hashes, unchanged canonical/prompt/V2.3 hashes. `wire-recheck.json` records every request-specific schema, domain, request/snapshot hash and schema hash. Historical failed-candidate files/artifacts are preserved.

The exact next paid screen is prepared in `saves/d09-reflection-citation-visibility/next-paid-screen.json`, explicitly marked `dispatch_authorized:false`:

- The same captured 24 screen requests, three per family; request/snapshot and dynamic schema hashes recorded, including historical failure cases.
- Model `qwen/qwen3.8-flash`; Alibaba only; no fallback; require_parameters true; strict JSON Schema; unchanged prompt; 600 tokens; 20-second timeout; reasoning disabled/excluded.
- V3 pacing: concurrency one, 1,000 ms minimum launch spacing, 250 ms completion gap, Retry-After honored, frozen fallback 429 cooldown 6/12 seconds.
- At most two attempts, technical failures only; no quality or semantic reroll, repair or prompt change. Same captured request/body on retry.
- Targets: at least 23/24 first-attempt strict usable, 24/24 final usable, zero enum violations. Record exact path/value for violations and stop before another encoding.
- Maximum 48 physical calls for the separately authorized original screen/retry/conditional-confirmation scope. A possible distinct 16-request confirmation requires the screen gate and sufficient remaining budget; this task authorizes neither batch.

No automatic experiment follows. Production remains unchanged; targeted missing-exposure soak stays pending until provider reliability is qualified.

Tests: typecheck PASS; unit 1,972 passed, zero failures, same four TODOs; playthrough 25/25. Final offline verification and artifact hashes are in `saves/d09-reflection-citation-visibility/`. No paid dispatch script is introduced for this candidate.
